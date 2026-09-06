/**
 * ruleMutator.js —— 规则负例验证（Negative Test）：确定性缺陷变体派生器（Team A）。
 *
 * 背景：校准循环只验证「标准包 Pass」（Positive），规则可能过拟合标准包的特定写法
 * （正则脆弱、幻觉路径），学生写个同名空壳也会被误判通过。本模块为每条在标准包上
 * 通过的规则，从标准包**确定性派生一个违反该规则的缺陷变体工程**（复制 + 最小破坏性
 * 修改），在变体上重跑 runRules，要求目标规则必须失分（score === 0）：
 *   - 失分归零        → 覆盖（covered）：该规则能区分缺陷实现；
 *   - 仍得满分/未归零 → 弱规则（weak）：区分度不足，进入校准反馈（Rule Repair）；
 *   - 无通用变异策略  → 跳过（skipped，记录原因，绝不误报 weak）。
 *
 * 铁律：
 *   - 纯确定性：同样的规则 + 同样的工程 → 永远同样的变异结果；变异只做文件级操作
 *     （删除/改写），不依赖网络与 LLM（本团队全程 mock/确定性验证）；
 *   - 最小破坏：只修改目标规则涉及的路径/内容；复制完整工程（含 node_modules，
 *     规则路径可能指向其中文件），保证其他规则在变体上仍能正常运行（是否失分不判定）；
 *   - 防误报：变异施加后尽量自校验（如替换后仍匹配 → 判为无策略跳过），
 *     绝不把「无法构造缺陷变体」误报为弱规则；weak 仅当「变异已施加但目标规则仍得分」；
 *   - 临时目录由调用方创建/清理；validateNegativeTests 内部负责逐变体清理。
 *
 * 变异策略（按 rule_type，params 字段与 ruleExecutor.js 对齐）：
 *   - file_exists       {path}                 ：删除目标文件
 *   - dir_contains_file {dir, pattern}         ：删除 dir 下**全部**匹配 pattern 的文件
 *   - contains_text     {path, text}           ：把 text 全部替换为干扰串；干扰串含 text
 *                                                （占位符冲突）时 text 残留 → 判 weak
 *   - count_regex       {path, regex, min}     ：删除全部匹配使计数 0 < min（min<1 或删后
 *                                                仍 ≥min → 跳过）
 *   - contains_regex    {path, regex}          ：替换首个匹配为干扰串；替换后仍匹配 → 跳过
 *   - file_count_in_dir {dir, pattern, min}    ：删除全部匹配文件使计数 0 < min
 *   - syntax_check      {dir, pattern}         ：在首个可检查源码文件注入语法错误（"{{{{"）
 *   - fact              {fact, op, value}      ：FACT_MUTATION 映射（hasVueRouter / hasPinia /
 *                                                 hasCreateRouter / dependencies）；无映射或
 *                                                 op/value 无法确定性翻转为失分 → 跳过
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runRules, resolveProjectRoot } from './ruleExecutor.js';
import { extractFacts } from './factExtractor.js';
import logger from '../utils/logger.js';

/** 干扰串（contains_text / contains_regex 替换用；与目标文本冲突时规则会被判 weak） */
const MUTATION_PLACEHOLDER = '__RULE_MUTATED__';

/** 递归遍历时跳过的目录名（与 ruleExecutor/factExtractor 一致） */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'target']);

/** fact 变异扫描的源码扩展名（import/调用只会出现在源码中） */
const SOURCE_EXTS = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue']);

/** syntax_check 可注入语法错误的扩展名（与 ruleExecutor.CHECKABLE_EXTS 一致） */
const CHECKABLE_EXTS = new Set(['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'vue']);

/**
 * fact 变异映射：fact 字段 → 使该事实翻转为 false 的破坏性操作。
 *   dep：从 package.json 移除的依赖名（布尔事实依赖侧移除后必然为 false）
 *   fileNeedle：源码文件中该事实相关代码的正则/子串（命中文件删除）
 *   storesDir：附带删除的 stores 目录（playbook：hasPinia→删除 stores 目录）
 * dependencies 无固定操作（按 params.value 移除依赖），单独处理。
 */
const FACT_MUTATION = {
  hasVueRouter: { dep: 'vue-router', fileNeedle: 'vue-router' },
  hasPinia: { dep: 'pinia', fileNeedle: /(?:from\s+['"]pinia['"]|\bdefineStore\b|\bcreatePinia\b)/, storesDir: 'src/stores' },
  hasCreateRouter: { fileNeedle: /\bcreateRouter\b/ },
  // ---- Java（P0-1）----
  hasSpringBoot: { fileNeedle: /\bspring-boot-starter\b/ },
  hasSpringMvc: { fileNeedle: /\borg\.springframework\.web\b/ },
  hasMyBatis: { fileNeedle: /\bmybatis\b/ },
  hasJpa: { fileNeedle: /\b(?:javax|jakarta)\.persistence\b/ },
  hasLombok: { fileNeedle: /\blombok\b/ },
  // ---- Python（P0-1）----
  hasFlask: { fileNeedle: /\bflask\b/ },
  hasDjango: { fileNeedle: /\bdjango\b/ },
  hasFastAPI: { fileNeedle: /\bfastapi\b/ },
  hasPydantic: { fileNeedle: /\bpydantic\b/ },
};

// ==================== 内部工具（与 ruleExecutor 同语义，本模块自包含） ====================

/**
 * 递归收集目录下全部普通文件（跳过隐藏项与 SKIP_DIRS）。
 * @param {string} dir - 绝对目录路径
 * @returns {string[]} 绝对路径列表
 */
function collectFiles(dir) {
  const out = [];
  const walk = (abs) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const childAbs = path.join(abs, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(childAbs);
      } else if (e.isFile()) {
        out.push(childAbs);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * 取文件扩展名（小写，无扩展名返回空串）。
 * @param {string} absPath - 绝对路径
 * @returns {string}
 */
function extOf(absPath) {
  const name = path.basename(absPath);
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

/**
 * 简化 glob → 正则（与 ruleExecutor.globToRegExp 同语义）：`*` 通配（不跨目录分隔符）、
 * `?` 单字符（不跨目录分隔符），其余原样转义。
 * @param {string} pattern - glob 模式
 * @returns {RegExp}
 */
function globToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp('^' + re + '$');
}

/**
 * 把相对路径解析到工程根内；防穿越（与 ruleExecutor.resolveWithinRoot 同语义）。
 * @param {string} projectRoot - 工程根
 * @param {string} relPath - 规则参数里的相对路径
 * @returns {string|null}
 */
function resolveWithinRoot(projectRoot, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) return null;
  const root = path.resolve(projectRoot);
  const abs = path.resolve(root, relPath);
  if (abs === root || abs.startsWith(root + path.sep)) return abs;
  return null;
}

/**
 * 读取 UTF-8 文件内容；失败返回 { ok: false, error }（不抛错）。
 * @param {string} absPath - 绝对路径
 * @returns {{ok: boolean, content?: string, error?: string}}
 */
function readFileUtf8(absPath) {
  try {
    return { ok: true, content: fs.readFileSync(absPath, 'utf8') };
  } catch (err) {
    return { ok: false, error: (err && err.code) || (err && err.message) || String(err) };
  }
}

/**
 * 写入 UTF-8 文件内容；失败返回 { ok: false, error }（不抛错）。
 * @param {string} absPath - 绝对路径
 * @param {string} content - 新内容
 * @returns {{ok: boolean, error?: string}}
 */
function writeFileUtf8(absPath, content) {
  try {
    fs.writeFileSync(absPath, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

/**
 * 取 dir 下匹配 glob 的文件（与 ruleExecutor 同匹配语义：pattern 含 '/' 按相对路径匹配，
 * 否则按文件名匹配），排序保证确定性。
 * @returns {{ok: boolean, files?: string[], reason?: string}}
 */
function matchingFiles(root, dir, pattern) {
  if (typeof dir !== 'string' || typeof pattern !== 'string') {
    return { ok: false, reason: '缺少参数 dir/pattern' };
  }
  const absDir = resolveWithinRoot(root, dir);
  if (!absDir) return { ok: false, reason: '目录无效或越界：' + dir };
  const re = globToRegExp(pattern);
  const files = collectFiles(absDir)
    .filter((f) => {
      const target = pattern.includes('/') ? path.relative(absDir, f) : path.basename(f);
      return re.test(target);
    })
    .sort();
  return { ok: true, files };
}

/**
 * 从 package.json 移除依赖（dependencies + devDependencies）；目标依赖不在 → ok=false。
 * @returns {{ok: boolean, reason?: string}}
 */
function removeDeps(root, depNames) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return { ok: false, reason: 'package.json 不存在，无法移除依赖' };
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    return { ok: false, reason: 'package.json 解析失败：' + ((err && err.message) || String(err)) };
  }
  let changed = false;
  for (const section of ['dependencies', 'devDependencies']) {
    const obj = pkg[section];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    for (const dep of depNames) {
      if (Object.prototype.hasOwnProperty.call(obj, dep)) {
        delete obj[dep];
        changed = true;
      }
    }
  }
  if (!changed) return { ok: false, reason: '目标依赖不在 package.json 中：' + depNames.join(',') };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return { ok: true };
}

/**
 * 删除内容命中 needle（正则或子串）的源码文件（不删 package.json 等非源码文件）。
 * 单个文件删除失败忽略（尽力而为；布尔事实的确定性由依赖移除保证）。
 */
function deleteFilesContaining(root, needle) {
  const re = needle instanceof RegExp ? needle : null;
  const sub = re ? null : String(needle);
  for (const abs of collectFiles(root)) {
    if (!SOURCE_EXTS.has(extOf(abs))) continue;
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const hit = re ? re.test(content) : content.includes(sub);
    if (hit) {
      try {
        fs.rmSync(abs, { force: true });
      } catch {
        /* 忽略单个删除失败 */
      }
    }
  }
}

// ==================== 各 rule_type 变异策略 ====================

/** file_exists {path}：删除目标文件 */
function mutateFileExists(params, root) {
  const p = params.path;
  if (typeof p !== 'string' || p.length === 0) return { ok: false, reason: '缺少参数 path' };
  const abs = resolveWithinRoot(root, p);
  if (!abs) return { ok: false, reason: '路径无效或越界：' + p };
  if (!fs.existsSync(abs)) return { ok: false, reason: '目标文件不存在：' + p + '（标准包上规则本不应通过）' };
  try {
    fs.rmSync(abs, { force: true });
  } catch (err) {
    return { ok: false, reason: '删除文件失败：' + ((err && err.message) || String(err)) };
  }
  return { ok: true };
}

/** dir_contains_file {dir, pattern}：删除 dir 下全部匹配文件（多匹配时删一个不够，必须全删） */
function mutateDirContainsFile(params, root) {
  const m = matchingFiles(root, params.dir, params.pattern);
  if (!m.ok) return m;
  if (!m.files || m.files.length === 0) {
    return { ok: false, reason: 'dir 下无匹配文件（标准包上规则本不应通过）' };
  }
  for (const f of m.files) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* 忽略单个删除失败 */
    }
  }
  return { ok: true };
}

/** contains_text {path, text}：把 text 全部替换为干扰串；干扰串含 text → 文本残留（判 weak） */
function mutateContainsText(params, root) {
  const p = params.path;
  const text = params.text;
  if (typeof p !== 'string' || p.length === 0) return { ok: false, reason: '缺少参数 path' };
  if (typeof text !== 'string') return { ok: false, reason: '缺少参数 text' };
  if (text.length === 0) return { ok: false, reason: 'text 为空串：任何内容都包含空串，无法构造失分变体' };
  const abs = resolveWithinRoot(root, p);
  if (!abs) return { ok: false, reason: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { ok: false, reason: '无法读取 ' + p + '：' + r.error };
  if (!r.content.includes(text)) return { ok: false, reason: '文件不包含目标文本（标准包上规则本不应通过）' };
  // split/join 为字面量替换（无正则语义）；干扰串若包含 text，替换后 text 仍残留
  const mutated = r.content.split(text).join(MUTATION_PLACEHOLDER);
  const w = writeFileUtf8(abs, mutated);
  if (!w.ok) return { ok: false, reason: '写入 ' + p + ' 失败：' + w.error };
  return { ok: true };
}

/** count_regex {path, regex, min}：删除全部匹配使计数 0 < min（删后仍 ≥min → 跳过） */
function mutateCountRegex(params, root) {
  const p = params.path;
  const source = params.regex;
  if (typeof p !== 'string' || p.length === 0) return { ok: false, reason: '缺少参数 path' };
  if (typeof source !== 'string' || source.length === 0) return { ok: false, reason: '缺少参数 regex' };
  const min = Number(params.min);
  const minValue = Number.isFinite(min) ? min : 0;
  if (minValue < 1) return { ok: false, reason: 'min<1 时计数恒 ≥ min，无法构造失分变体' };
  const abs = resolveWithinRoot(root, p);
  if (!abs) return { ok: false, reason: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { ok: false, reason: '无法读取 ' + p + '：' + r.error };
  let re;
  try {
    re = new RegExp(source, 'g');
  } catch (err) {
    return { ok: false, reason: '正则无效：' + source };
  }
  const mutated = r.content.replace(re, '');
  let after = 0;
  try {
    after = (mutated.match(new RegExp(source, 'g')) || []).length;
  } catch {
    after = 0;
  }
  if (after >= minValue) {
    return { ok: false, reason: '删除全部匹配后计数仍 ≥' + minValue + '（实际 ' + after + '）：正则可匹配空串等，无法构造确定性失分变体' };
  }
  const w = writeFileUtf8(abs, mutated);
  if (!w.ok) return { ok: false, reason: '写入 ' + p + ' 失败：' + w.error };
  return { ok: true };
}

/** contains_regex {path, regex}：替换首个匹配为干扰串；替换后仍匹配 → 跳过 */
function mutateContainsRegex(params, root) {
  const p = params.path;
  const source = params.regex;
  if (typeof p !== 'string' || p.length === 0) return { ok: false, reason: '缺少参数 path' };
  if (typeof source !== 'string' || source.length === 0) return { ok: false, reason: '缺少参数 regex' };
  const abs = resolveWithinRoot(root, p);
  if (!abs) return { ok: false, reason: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { ok: false, reason: '无法读取 ' + p + '：' + r.error };
  let re;
  try {
    re = new RegExp(source);
  } catch (err) {
    return { ok: false, reason: '正则无效：' + source };
  }
  const m = re.exec(r.content);
  if (!m) return { ok: false, reason: '正则未匹配（标准包上规则本不应通过）' };
  const mutated = r.content.slice(0, m.index) + MUTATION_PLACEHOLDER + r.content.slice(m.index + m[0].length);
  try {
    if (new RegExp(source).test(mutated)) {
      return { ok: false, reason: '替换首个匹配后仍匹配（正则过宽），无法构造确定性不匹配变体' };
    }
  } catch (err) {
    return { ok: false, reason: '正则无效：' + source };
  }
  const w = writeFileUtf8(abs, mutated);
  if (!w.ok) return { ok: false, reason: '写入 ' + p + ' 失败：' + w.error };
  return { ok: true };
}

/** file_count_in_dir {dir, pattern, min}：删除全部匹配文件使计数 0 < min（partial 规则同样归零） */
function mutateFileCountInDir(params, root) {
  const min = Number(params.min);
  const minValue = Number.isFinite(min) ? min : 0;
  if (minValue < 1) return { ok: false, reason: 'min<1 时计数恒 ≥ min，无法构造失分变体' };
  const m = matchingFiles(root, params.dir, params.pattern);
  if (!m.ok) return m;
  if (!m.files || m.files.length < minValue) {
    return { ok: false, reason: '匹配文件数 < min（标准包上规则本不应通过）' };
  }
  for (const f of m.files) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* 忽略单个删除失败 */
    }
  }
  return { ok: true };
}

/** syntax_check {dir, pattern}：在首个可检查源码文件注入语法错误（"{{{{"） */
function mutateSyntaxCheck(params, root) {
  const m = matchingFiles(root, params.dir, params.pattern);
  if (!m.ok) return m;
  const targets = (m.files || []).filter((f) => CHECKABLE_EXTS.has(extOf(f)));
  if (targets.length === 0) {
    return { ok: false, reason: '未找到可检查的源码文件（标准包上规则本不应通过）' };
  }
  const first = targets[0];
  const r = readFileUtf8(first);
  if (!r.ok) return { ok: false, reason: '无法读取 ' + path.relative(root, first) + '：' + r.error };
  let mutated;
  if (extOf(first) === 'vue') {
    // 与 ruleExecutor 的 <script> 提取一致：注入到首个 <script> 块内容末尾（</script> 前）
    const mScript = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(r.content);
    if (!mScript) return { ok: false, reason: 'vue 文件无 <script> 块（标准包上规则本不应通过）' };
    const closeAt = mScript.index + mScript[0].lastIndexOf('</script>');
    mutated = r.content.slice(0, closeAt) + '\n{{{{' + r.content.slice(closeAt);
  } else {
    mutated = r.content + '\n{{{{';
  }
  const w = writeFileUtf8(first, mutated);
  if (!w.ok) return { ok: false, reason: '写入失败：' + w.error };
  return { ok: true };
}

/**
 * fact 规则：仅当变异能确定性翻转为「规则失分」状态才施加（防误报 weak）：
 *   - dependencies + includes：移除全部目标依赖后必失分；not_includes 需「添加」而非移除 → 跳过；
 *   - 布尔事实（hasVueRouter/hasPinia/hasCreateRouter）：规则要求为真（== true / != false）时，
 *     翻转为 false 才能保证失分；规则要求为假（== false / != true）→ 跳过。
 * 施加后自校验（extractFacts 复查），未翻转 → 跳过。
 */
function mutateFact(item, params, root) {
  const fact = params.fact;
  const mutation = FACT_MUTATION[fact];
  if (!mutation && fact !== 'dependencies') {
    return { ok: false, reason: 'fact 无变异映射：' + String(fact) };
  }
  const op = params.op;
  const value = params.value;
  if (fact === 'dependencies') {
    if (op !== 'includes') {
      return { ok: false, reason: 'fact 规则 op 无法通过移除依赖保证失分：op=' + String(op) };
    }
  } else {
    const requiresTrue = (op === '==' && value === true) || (op === '!=' && value === false);
    if (!requiresTrue) {
      return {
        ok: false,
        reason: 'fact 规则要求事实为假（op=' + String(op) + ' value=' + String(value)
          + '），映射仅支持翻转为 false，无法保证失分',
      };
    }
  }

  if (fact === 'dependencies') {
    const values = Array.isArray(value) ? value.map((v) => String(v)) : [String(value)];
    const removed = removeDeps(root, values);
    if (!removed.ok) return removed;
  } else {
    if (mutation.dep) {
      const removed = removeDeps(root, [mutation.dep]);
      if (!removed.ok) return removed;
    }
    if (mutation.storesDir) {
      try {
        fs.rmSync(path.join(root, mutation.storesDir), { recursive: true, force: true });
      } catch {
        /* 忽略目录删除失败（确定性由依赖移除保证） */
      }
    }
    if (mutation.fileNeedle) {
      deleteFilesContaining(root, mutation.fileNeedle);
    }
  }

  // 自校验：目标事实必须翻转为「规则失分」状态，否则无策略跳过（防误报 weak）
  let factsAfter;
  try {
    factsAfter = extractFacts(root);
  } catch (err) {
    return { ok: false, reason: '变体事实提取失败：' + ((err && err.message) || String(err)) };
  }
  if (fact === 'dependencies') {
    const values = Array.isArray(value) ? value.map((v) => String(v)) : [String(value)];
    const still = values.filter((v) => factsAfter.dependencies.includes(v));
    if (still.length > 0) {
      return { ok: false, reason: '依赖移除后仍存在于变体：' + still.join(',') };
    }
  } else if (factsAfter[fact] !== false) {
    return { ok: false, reason: '变异未使事实 ' + String(fact) + ' 翻转为 false' };
  }
  return { ok: true };
}

// ==================== 导出函数 ====================

/**
 * 为指定规则派生缺陷变体：复制解压根目录到 variantDir 并施加最小破坏性修改，
 * 使该规则在变体上必然失分。
 *
 * BUG-A-03 修复：入参语义改为**解压根目录 rootDir（未解析）**，
 * 内部 const projectRoot = resolveProjectRoot(variantDir) 解析变体工程根后在其上施加变异；
 * 与 runRules(rules, variantDir) 的 resolution 完全一致，
 * 避免「已解析的 projectRoot 传入后二次下钻」（如 standard/demo2 → demo2/src）导致规则路径全部失配。
 * @param {object} rules 完整规则 JSON
 * @param {string} ruleId 目标规则 id
 * @param {string} rootDir 标准包解压根目录（未解析；复制与变异路径以内部解析的工程根为准）
 * @param {string} variantDir 变体输出目录（调用方创建）
 * @returns {{ok: boolean, reason?: string}} ok=false 表示该规则类型无通用变异策略（跳过）
 */
export function mutateVariant(rules, ruleId, rootDir, variantDir) {
  const items = Array.isArray(rules && rules.objective_items) ? rules.objective_items : [];
  const item = items.find((it) => it && it.id === ruleId);
  if (!item) return { ok: false, reason: '规则不存在：' + String(ruleId) };
  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    return { ok: false, reason: 'rootDir 无效' };
  }
  if (typeof variantDir !== 'string' || variantDir.length === 0) {
    return { ok: false, reason: 'variantDir 无效' };
  }
  if (rootDir === variantDir || variantDir.startsWith(rootDir + path.sep)) {
    return { ok: false, reason: 'variantDir 不能位于 rootDir 之内' };
  }
  // 复制**解压根目录**（含嵌套工程目录如 demo2/ —— 规则路径相对其解析，保真第一）；
  // 先清掉调用方预建的空目录，保证 cpSync 结果干净（dest 已存在时语义为内容合并）
  try {
    fs.rmSync(variantDir, { recursive: true, force: true });
    fs.cpSync(rootDir, variantDir, { recursive: true });
  } catch (err) {
    return { ok: false, reason: '复制工程到变体目录失败：' + ((err && err.message) || String(err)) };
  }
  // 变体工程根：与 runRules(rules, variantDir) 采用同一解析（resolveProjectRoot 只下钻一层，
  // 嵌套单子目录工程如 demo2/src 场景下基准与变体 resolution 语义完全一致）
  const root = resolveProjectRoot(variantDir);
  const params = item.params && typeof item.params === 'object' ? item.params : {};
  let r;
  switch (item.rule_type) {
    case 'file_exists':
      r = mutateFileExists(params, root);
      break;
    case 'dir_contains_file':
      r = mutateDirContainsFile(params, root);
      break;
    case 'contains_text':
      r = mutateContainsText(params, root);
      break;
    case 'count_regex':
      r = mutateCountRegex(params, root);
      break;
    case 'contains_regex':
      r = mutateContainsRegex(params, root);
      break;
    case 'file_count_in_dir':
      r = mutateFileCountInDir(params, root);
      break;
    case 'syntax_check':
      r = mutateSyntaxCheck(params, root);
      break;
    case 'fact':
      r = mutateFact(item, params, root);
      break;
    case 'ast_pattern':
      r = mutateDeleteFile(params, root);
      break;
    case 'count_imports':
      r = mutateCountImports(params, root);
      break;
    case 'normalized_text':
      r = mutateDeleteFile(params, root);
      break;
    default:
      r = { ok: false, reason: '不支持的规则类型：' + String(item.rule_type) };
  }
  return r;
}

// ==================== P0-2 语义级规则变异（解决正则脆弱） ====================

/**
 * ast_pattern / normalized_text 通用变异：删除目标文件（结构消失必失分）。
 */
function mutateDeleteFile(params, root) {
  const p = params.path;
  if (typeof p !== 'string' || p.length === 0) return { ok: false, reason: '缺少参数 path' };
  const abs = resolveWithinRoot(root, p);
  if (!abs) return { ok: false, reason: '路径无效或越界：' + p };
  if (!fs.existsSync(abs)) return { ok: false, reason: '文件不存在（标准包上规则本不应通过）' };
  try {
    fs.rmSync(abs, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: '删除文件失败：' + ((err && err.message) || String(err)) };
  }
}

/**
 * count_imports 变异：删除包含目标模块名的 import 行（行扫描，跨语言）。
 */
function mutateCountImports(params, root) {
  const p = params.path;
  const moduleName = params.module;
  if (typeof p !== 'string' || p.length === 0) return { ok: false, reason: '缺少参数 path' };
  if (typeof moduleName !== 'string' || moduleName.length === 0) return { ok: false, reason: '缺少参数 module' };
  const abs = resolveWithinRoot(root, p);
  if (!abs) return { ok: false, reason: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { ok: false, reason: '无法读取 ' + p + '：' + r.error };
  const lines = String(r.content).split('\n');
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    const t = line.trim();
    if (/^(import|require|from|include)\b/.test(t) && t.includes(moduleName)) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  if (removed === 0) return { ok: false, reason: '未找到包含模块名的 import 行（标准包上规则本不应通过）' };
  const w = writeFileUtf8(abs, kept.join('\n'));
  if (!w.ok) return { ok: false, reason: '写入 ' + p + ' 失败：' + w.error };
  return { ok: true };
}

/** 单条规则的负例验证（内部）：派生变体 → 跑规则 → 判定目标规则得分 */
async function runOneVariant(rules, task, rootDir) {
  const variantDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-mutator-variant-'));
  try {
    const mv = mutateVariant(rules, task.id, rootDir, variantDir);
    if (!mv.ok) {
      return { kind: 'skipped', id: task.id, item: task.item, reason: mv.reason };
    }
    let res;
    try {
      res = runRules(rules, variantDir);
    } catch (err) {
      return {
        kind: 'variant-error',
        id: task.id,
        item: task.item,
        reason: '变体上 runRules 异常：' + ((err && err.message) || String(err)),
      };
    }
    const target = (Array.isArray(res.items) ? res.items : []).find((it) => it.id === task.id);
    if (!target) {
      return { kind: 'variant-error', id: task.id, item: task.item, reason: '变体结果中未找到目标规则项：' + task.id };
    }
    if (target.score === 0) return { kind: 'covered', id: task.id };
    return {
      kind: 'weak',
      id: task.id,
      item: task.item,
      reason: '缺陷变体上规则仍得 ' + target.score + '/' + target.max_score
        + ' 分（应失分至 0）：无法区分真实实现与表面实现（过拟合/区分度不足），请改为更具体的检查',
    };
  } finally {
    try {
      fs.rmSync(variantDir, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

/**
 * 全量负例验证：对每条「标准包上通过」的规则派生变体并执行 runRules。
 *
 * BUG-A-03 修复：入参语义改为**解压根目录 rootDir（未解析）**，
 * 正向基准执行 runRules(rules, rootDir) 与 checkerService 外层校准 resolution 完全一致，
 * 不再对已解析的 projectRoot 二次调用 resolveProjectRoot（如 standard/demo2 → demo2/src
 * 导致规则路径全部失配、covered=0）；变体同样复制 rootDir，变体内再解析工程根。
 * @param {object} rules 完整规则 JSON
 * @param {string} rootDir 标准包解压根目录（未解析）
 * @param {object} [opts] { concurrency?: number(默认4), onlyIds?: string[] }
 * @returns {Promise<{ covered: number, skipped: Array<{id, reason}>, weakRules: Array<{id, item, reason}>, variantsRun: number }>}
 */
export async function validateNegativeTests(rules, rootDir, opts = {}) {
  const concurrencyRaw = Number(opts && opts.concurrency);
  const concurrency = Number.isFinite(concurrencyRaw) && concurrencyRaw > 0 ? concurrencyRaw : 4;
  const onlyIds = Array.isArray(opts && opts.onlyIds) && opts.onlyIds.length > 0
    ? new Set(opts.onlyIds)
    : null;

  // 1. 标准包正向执行：runRules(rules, rootDir) 与 checkerService 校准 resolution 一致
  //    （resolveProjectRoot 只下钻一次；嵌套单子目录工程规则路径全部命中）
  let baseResult;
  try {
    baseResult = runRules(rules, rootDir);
  } catch (err) {
    const reason = '标准包 runRules 失败：' + ((err && err.message) || String(err));
    logger.error({ err: reason }, 'ruleMutator: 负例验证前置执行失败');
    return { covered: 0, skipped: [{ id: '*', reason }], weakRules: [], variantsRun: 0 };
  }
  const rulesById = new Map(
    (Array.isArray(rules && rules.objective_items) ? rules.objective_items : []).map((it) => [it.id, it]),
  );
  const tasks = (Array.isArray(baseResult.items) ? baseResult.items : [])
    .filter((it) => it && it.score === it.max_score && (!onlyIds || onlyIds.has(it.id)))
    .map((it) => {
      const rule = rulesById.get(it.id) || {};
      return { id: it.id, item: it.item, ruleType: rule.rule_type || '' };
    });

  // 2. 并发池（默认 4）逐条派生变体
  const outcomes = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const idx = next;
      next += 1;
      outcomes[idx] = await runOneVariant(rules, tasks[idx], rootDir);
    }
  };
  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  const runners = [];
  for (let i = 0; i < workerCount; i += 1) runners.push(worker());
  await Promise.all(runners);

  // 3. 汇总
  const covered = [];
  const skipped = [];
  const weakRules = [];
  let variantsRun = 0;
  for (const out of outcomes) {
    if (!out) continue;
    if (out.kind === 'covered' || out.kind === 'weak' || out.kind === 'variant-error') variantsRun += 1;
    if (out.kind === 'covered') covered.push(out.id);
    else if (out.kind === 'weak') weakRules.push({ id: out.id, item: out.item, reason: out.reason });
    else skipped.push({ id: out.id, reason: out.reason });
  }
  logger.info(
    { covered: covered.length, skipped: skipped.length, weak: weakRules.length, variantsRun },
    'ruleMutator: 负例验证完成',
  );
  return { covered: covered.length, skipped, weakRules, variantsRun };
}
