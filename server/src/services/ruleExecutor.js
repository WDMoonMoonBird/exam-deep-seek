/**
 * ruleExecutor.js —— 确定性评分规则执行器（规则驱动评分的执行端）。
 *
 * 实训题评分规则化方案：AI 只生成 JSON 评分规则（把教师评分标准翻译成可检查参数），
 * 计分由本执行器确定性完成 —— 同样的规则 + 同样的工程 → 永远得到同样的分数，
 * 杜绝 LLM 评分的随机性。规则先在标准工程包上校准通过（应得满分）再用于批量批改。
 *
 * 铁律：
 *   - 纯执行器：仅依赖 node:fs / node:path，外加 tree-sitter（语法检查）与 factExtractor（事实提取），零其他依赖；
 *   - 得分一律钳制：score = max(0, min(max_score, 计算得分))，永不超上限；
 *   - 路径统一解析到工程根之下（resolveProjectRoot 的结果），防穿越：path.resolve 后
 *     必须位于工程根内，否则该项 0 分；
 *   - 文件读取失败（不存在/权限）→ 该项 0 分 + 证据，绝不抛错影响整批评分。
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Parser from 'tree-sitter';
import JS from 'tree-sitter-javascript';
import { extractFacts } from './factExtractor.js';
import logger from '../utils/logger.js';

// tree-sitter-vue 的旧版原生绑定（build/Release/*.node）在部分运行时（如 Jest 的模块解析器）
// 下无法加载：统一走 createRequire 惰性加载，加载/初始化失败一律回退 <script> 提取 + JS 解析。
const nodeRequire = createRequire(import.meta.url);

// ==================== 常量 ====================

/**
 * 支持的规则类型白名单（validateRules 校验用）。
 * @type {string[]}
 */
export const RULE_TYPES = [
  'file_exists',
  'dir_contains_file',
  'contains_text',
  'count_regex',
  'contains_regex',
  'file_count_in_dir',
  'syntax_check',
  'fact',
];

/**
 * 源码扩展名白名单（resolveProjectRoot 探测「子目录是否含源码」用）。
 * @type {Set<string>}
 */
export const SOURCE_EXTS = new Set([
  // 前端
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'html', 'css', 'scss', 'sass', 'less',
  // 后端
  'java', 'py', 'go', 'c', 'cpp', 'h', 'hpp', 'cc', 'cxx', 'cs', 'rb', 'php', 'rs', 'kt', 'swift',
  // 脚本/数据/配置
  'sh', 'bash', 'sql', 'json', 'yml', 'yaml', 'xml', 'toml', 'ini',
]);

/** 递归遍历时跳过的目录名（node_modules 等第三方/构建产物） */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'target',
]);

/**
 * syntax_check 可检查的扩展名（tree-sitter）：
 *   js/mjs/cjs/ts/jsx/tsx 用 tree-sitter-javascript 直接解析；
 *   vue 优先 tree-sitter-vue 整体解析，失败回退 <script> 提取 + JS 解析。
 */
const CHECKABLE_EXTS = new Set(['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'vue']);

/** fact 规则支持的比较 op 白名单（validateRules 校验用） */
export const FACT_OPS = ['>=', '>', '<=', '<', '==', '!=', 'includes', 'not_includes'];

/** fact 字段 → 中文标签（evidence 展示用；未收录字段回退原始字段名） */
const FACT_LABELS = {
  language: '语言',
  framework: '框架',
  hasPackageJson: 'package.json',
  dependencies: '依赖',
  entryFiles: '入口文件',
  vueFiles: 'Vue 文件数量',
  jsFiles: 'JS 文件数量',
  components: '组件',
  routes: '路由数量',
  routePaths: '路由路径',
  hasCreateRouter: 'createRouter 使用',
  hasVueRouter: 'vue-router 使用',
  hasPinia: 'Pinia 使用',
  stores: 'store',
  apiCalls: '接口调用次数',
  hasAxiosWrapper: 'axios 封装',
  hasAxios: 'axios 使用',
  syntaxErrors: '语法错误数',
  syntaxErrorFiles: '语法错误文件',
};

/** 数值比较失败时 evidence 展示的真实关系（如 routes>=3 实际 2 → "路由数量 2 < 3"） */
const INVERSE_OPS = { '>=': '<', '>': '<=', '<=': '>', '<': '>=' };

/** 证据中错误摘要的最大长度 */
const ERROR_SUMMARY_LEN = 160;

// ==================== 内部工具 ====================

/**
 * 得分钳制：score = max(0, min(max_score, 计算得分))，永不超上限。
 * @param {number} score - 计算得分
 * @param {number} maxScore - 该项上限
 * @returns {number}
 */
function clampScore(score, maxScore) {
  const s = Number.isFinite(score) ? score : 0;
  return Math.max(0, Math.min(maxScore, s));
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
 * 简化 glob → 正则：`*` 通配（不跨目录分隔符）、`?` 单字符（不跨目录分隔符），其余原样转义。
 * 支持 *.vue 这类后缀通配；含 `/` 的模式按相对路径匹配，否则按文件名匹配。
 * @param {string} pattern - glob 模式
 * @returns {RegExp}
 */
function globToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp('^' + re + '$');
}

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
 * 把相对路径解析到工程根内；防穿越：path.resolve 后必须位于工程根内（含根自身），否则返回 null。
 * 绝对路径参数（params.path 以 / 开头）会被 path.resolve 直接采用，同样落入越界检查。
 * @param {string} projectRoot - 工程根（resolveProjectRoot 结果）
 * @param {string} relPath - 规则参数里的相对路径
 * @returns {string|null} 合法绝对路径；越界/非法返回 null
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
    const content = fs.readFileSync(absPath, 'utf8');
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: (err && err.code) || (err && err.message) || String(err) };
  }
}

/**
 * 统计正则匹配次数（自动加 g 标志；正则非法返回 { ok: false }）。
 * @param {string} content - 文件内容
 * @param {string} source - 正则源码
 * @returns {{ok: boolean, count?: number}}
 */
function countMatches(content, source) {
  try {
    const re = new RegExp(source, 'g');
    const m = content.match(re);
    return { ok: true, count: m ? m.length : 0 };
  } catch {
    return { ok: false };
  }
}

/**
 * 从 vue 内容中提取 <script> 部分，同时给出内容起始偏移（用于把 script 内行号映射回原文件）。
 * 没有 script 块返回空串与偏移 0。
 * @param {string} code - vue 文件内容
 * @returns {{script: string, startOffset: number}}
 */
function extractVueScriptWithOffset(code) {
  const m = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(String(code || ''));
  if (!m) return { script: '', startOffset: 0 };
  const startOffset = m.index + m[0].indexOf('>') + 1;
  return { script: m[1], startOffset };
}

/**
 * 计算字符串中 offset 处的 1 基行号（统计 offset 前的换行数）。
 * @param {string} content - 全文
 * @param {number} offset - 字节偏移
 * @returns {number}
 */
function lineNumberOf(content, offset) {
  const before = String(content).slice(0, Math.max(0, offset));
  let n = 1;
  for (let i = 0; i < before.length; i++) {
    if (before.charCodeAt(i) === 10) n++;
  }
  return n;
}

/**
 * 错误摘要：取包含 SyntaxError/Error 的第一行（否则首行），截断到 160 字符。
 * @param {unknown} err - 错误对象
 * @returns {string}
 */
function errorSummary(err) {
  const raw = err && err.message ? String(err.message) : String(err);
  const lines = raw.split('\n').filter((l) => l.trim());
  const line = (lines.find((l) => /SyntaxError|Error/i.test(l)) || lines[0] || raw).trim();
  return line.length > ERROR_SUMMARY_LEN ? line.slice(0, ERROR_SUMMARY_LEN) + '…' : line;
}

// ==================== 规则执行器 ====================

/**
 * file_exists：{path} —— 文件存在 → 满分。
 * @param {object} item - 规则项
 * @param {object} params - 参数
 * @param {string} projectRoot - 工程根
 * @returns {{score: number, evidence: string}}
 */
function execFileExists(item, params, projectRoot) {
  const p = params.path;
  if (typeof p !== 'string' || p.length === 0) return { score: 0, evidence: '缺少参数 path' };
  const abs = resolveWithinRoot(projectRoot, p);
  if (!abs) return { score: 0, evidence: '路径无效或越界：' + p };
  try {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return { score: item.max_score, evidence: '存在 ' + p };
    }
    return { score: 0, evidence: '缺少 ' + p };
  } catch {
    return { score: 0, evidence: '无法访问 ' + p };
  }
}

/**
 * dir_contains_file：{dir, pattern} —— dir 下（递归）存在匹配 glob 的文件 → 满分。
 * @param {object} item - 规则项
 * @param {object} params - 参数
 * @param {string} projectRoot - 工程根
 * @returns {{score: number, evidence: string}}
 */
function execDirContainsFile(item, params, projectRoot) {
  const dir = params.dir;
  const pattern = params.pattern;
  if (typeof dir !== 'string' || typeof pattern !== 'string') {
    return { score: 0, evidence: '缺少参数 dir/pattern' };
  }
  const absDir = resolveWithinRoot(projectRoot, dir);
  if (!absDir) return { score: 0, evidence: '目录无效或越界：' + dir };
  const re = globToRegExp(pattern);
  const matched = collectFiles(absDir).filter((f) => {
    const target = pattern.includes('/') ? path.relative(absDir, f) : path.basename(f);
    return re.test(target);
  });
  if (matched.length > 0) {
    const names = matched.slice(0, 5).map((f) => path.basename(f)).join('、');
    const extra = matched.length > 5 ? ' 等 ' + matched.length + ' 个文件' : '';
    return { score: item.max_score, evidence: '找到匹配文件：' + names + extra };
  }
  return { score: 0, evidence: '未找到匹配文件（模式：' + pattern + '）' };
}

/**
 * contains_text：{path, text} —— 文件内容（utf-8）包含 text → 满分。
 * @param {object} item - 规则项
 * @param {object} params - 参数
 * @param {string} projectRoot - 工程根
 * @returns {{score: number, evidence: string}}
 */
function execContainsText(item, params, projectRoot) {
  const p = params.path;
  const text = params.text;
  if (typeof p !== 'string' || p.length === 0) return { score: 0, evidence: '缺少参数 path' };
  if (typeof text !== 'string') return { score: 0, evidence: '缺少参数 text' };
  const abs = resolveWithinRoot(projectRoot, p);
  if (!abs) return { score: 0, evidence: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { score: 0, evidence: '无法读取 ' + p + '：' + r.error };
  if (r.content.includes(text)) return { score: item.max_score, evidence: '包含 ' + text };
  return { score: 0, evidence: '未包含 ' + text };
}

/**
 * count_regex：{path, regex, min} —— 匹配次数 ≥ min → 满分；
 * 否则 params.partial === true 时按比例计分（Math.round(max * count / min)，截断到 max_score）。
 * @param {object} item - 规则项
 * @param {object} params - 参数
 * @param {string} projectRoot - 工程根
 * @returns {{score: number, evidence: string}}
 */
function execCountRegex(item, params, projectRoot) {
  const p = params.path;
  const source = params.regex;
  if (typeof p !== 'string' || p.length === 0) return { score: 0, evidence: '缺少参数 path' };
  if (typeof source !== 'string' || source.length === 0) return { score: 0, evidence: '缺少参数 regex' };
  const abs = resolveWithinRoot(projectRoot, p);
  if (!abs) return { score: 0, evidence: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { score: 0, evidence: '无法读取 ' + p + '：' + r.error };
  const m = countMatches(r.content, source);
  if (!m.ok) return { score: 0, evidence: '正则无效：' + source };
  const min = Number(params.min);
  const minValue = Number.isFinite(min) ? min : 0;
  const evidence = '匹配 ' + m.count + ' 次（需 ≥' + minValue + '）';
  if (m.count >= minValue) return { score: item.max_score, evidence };
  if (params.partial === true && minValue > 0) {
    return { score: Math.round((item.max_score * m.count) / minValue), evidence };
  }
  return { score: 0, evidence };
}

/**
 * contains_regex：{path, regex} —— 文件内容匹配正则 → 满分。
 * @param {object} item - 规则项
 * @param {object} params - 参数
 * @param {string} projectRoot - 工程根
 * @returns {{score: number, evidence: string}}
 */
function execContainsRegex(item, params, projectRoot) {
  const p = params.path;
  const source = params.regex;
  if (typeof p !== 'string' || p.length === 0) return { score: 0, evidence: '缺少参数 path' };
  if (typeof source !== 'string' || source.length === 0) return { score: 0, evidence: '缺少参数 regex' };
  const abs = resolveWithinRoot(projectRoot, p);
  if (!abs) return { score: 0, evidence: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { score: 0, evidence: '无法读取 ' + p + '：' + r.error };
  try {
    const re = new RegExp(source);
    if (re.test(r.content)) return { score: item.max_score, evidence: '匹配（正则：' + source + '）' };
    return { score: 0, evidence: '未匹配（正则：' + source + '）' };
  } catch {
    return { score: 0, evidence: '正则无效：' + source };
  }
}

/**
 * file_count_in_dir：{dir, pattern, min} —— 匹配文件数 ≥ min → 满分；partial 同理按比例。
 * @param {object} item - 规则项
 * @param {object} params - 参数
 * @param {string} projectRoot - 工程根
 * @returns {{score: number, evidence: string}}
 */
function execFileCountInDir(item, params, projectRoot) {
  const dir = params.dir;
  const pattern = params.pattern;
  if (typeof dir !== 'string' || typeof pattern !== 'string') {
    return { score: 0, evidence: '缺少参数 dir/pattern' };
  }
  const absDir = resolveWithinRoot(projectRoot, dir);
  if (!absDir) return { score: 0, evidence: '目录无效或越界：' + dir };
  const re = globToRegExp(pattern);
  const count = collectFiles(absDir).filter((f) => {
    const target = pattern.includes('/') ? path.relative(absDir, f) : path.basename(f);
    return re.test(target);
  }).length;
  const min = Number(params.min);
  const minValue = Number.isFinite(min) ? min : 0;
  const evidence = '匹配文件 ' + count + ' 个（需 ≥' + minValue + '）';
  if (count >= minValue) return { score: item.max_score, evidence };
  if (params.partial === true && minValue > 0) {
    return { score: Math.round((item.max_score * count) / minValue), evidence };
  }
  return { score: 0, evidence };
}

// ==================== tree-sitter 语法检查 ====================

/**
 * JS 解析器。注意：tree-sitter 同一 Parser 连续 parse 会使旧树节点失效（缓冲复用），
 * 因此每次解析都新建实例（创建开销极小，实测 100 次解析 9ms）。
 */
function getJSParser() {
  const p = new Parser();
  p.setLanguage(JS);
  return p;
}

/**
 * Vue 解析器。2026-08-18：tree-sitter-vue（ABI 13）与 tree-sitter 0.25 原生二进制冲突，
 * require 会污染进程内 tree-sitter 核心状态（节点失效）。统一返回 null，
 * 调用方回退 <script> 提取 + JS 解析（功能等价，行号映射由调用方处理）。
 */
function getVueParser() {
  return null;
}

/**
 * 遍历解析树收集语法错误：ERROR 节点与 isMissing 节点（ERROR 子树不深入，避免重复上报）。
 * @param {object} tree - tree-sitter 解析树
 * @returns {Array<{line: number, message: string}>} 错误行号（1 基）与描述
 */
function collectSyntaxErrors(tree) {
  const errors = [];
  const walk = (n) => {
    if (n.type === 'ERROR') {
      errors.push({ line: n.startPosition.row + 1, message: '语法错误' });
      return;
    }
    if (n.isMissing) {
      errors.push({ line: n.startPosition.row + 1, message: '缺少 ' + n.type });
      return;
    }
    for (const c of n.namedChildren) walk(c);
  };
  walk(tree.rootNode);
  return errors;
}

/**
 * 把错误列表拼成 evidence 文本（同一文件同一行只报一次，去重）。
 * @param {Array<{line: number, message: string}>} errs
 * @returns {string}
 */
function describeSyntaxErrors(errs) {
  const seen = new Set();
  const parts = [];
  for (const e of errs) {
    if (seen.has(e.line)) continue;
    seen.add(e.line);
    parts.push('第 ' + e.line + ' 行' + (e.message ? '：' + e.message : ''));
  }
  return parts.join('；');
}

/**
 * 单文件语法检查（tree-sitter）：
 *   - .js/.mjs/.cjs/.ts/.jsx/.tsx 用 tree-sitter-javascript 直接解析全文；
 *   - .vue 优先 tree-sitter-vue 整体解析，失败（ABI 不兼容等）回退 <script> 提取 + JS 解析
 *     （错误行号映射回原 .vue 文件行号）。
 * 解析树中任一 ERROR / isMissing 节点 → 语法错误。
 * @param {string} absPath - 文件绝对路径
 * @returns {{ok: boolean, error?: string}}
 */
function checkSyntaxOfFile(absPath) {
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return { ok: false, error: errorSummary(err) };
  }
  const ext = extOf(absPath);
  if (ext === 'vue') {
    const vueParser = getVueParser();
    if (vueParser) {
      const errs = collectSyntaxErrors(vueParser.parse(content));
      if (errs.length > 0) return { ok: false, error: describeSyntaxErrors(errs) };
      return { ok: true };
    }
    const { script, startOffset } = extractVueScriptWithOffset(content);
    if (!script.trim()) return { ok: false, error: '未找到 <script> 内容' };
    const jsParser = getJSParser(); // 保持引用：tree-sitter 树节点惰性访问 parser 内存，parser 被 GC 后树失效
    const errs = collectSyntaxErrors(jsParser.parse(script));
    if (errs.length === 0) return { ok: true };
    const baseLine = lineNumberOf(content, startOffset) - 1; // script 内容起始行（0 基）
    const mapped = errs.map((e) => ({ line: baseLine + e.line, message: e.message }));
    return { ok: false, error: describeSyntaxErrors(mapped) };
  }
  const jsParser = getJSParser(); // 保持引用（同 2026-08-18 GC 修复）
  const errs = collectSyntaxErrors(jsParser.parse(content));
  if (errs.length > 0) return { ok: false, error: describeSyntaxErrors(errs) };
  return { ok: true };
}

/**
 * syntax_check：{dir, pattern} —— dir 下所有匹配文件语法检查；
 * 任何失败 → 该项 0 分，evidence 含失败文件路径与错误摘要；全部通过 → 满分。
 * @param {object} item - 规则项
 * @param {object} params - 参数
 * @param {string} projectRoot - 工程根
 * @returns {{score: number, evidence: string}}
 */
function execSyntaxCheck(item, params, projectRoot) {
  const dir = params.dir;
  const pattern = params.pattern;
  if (typeof dir !== 'string' || typeof pattern !== 'string') {
    return { score: 0, evidence: '缺少参数 dir/pattern' };
  }
  const absDir = resolveWithinRoot(projectRoot, dir);
  if (!absDir) return { score: 0, evidence: '目录无效或越界：' + dir };
  const re = globToRegExp(pattern);
  const targets = collectFiles(absDir).filter((f) => {
    const target = pattern.includes('/') ? path.relative(absDir, f) : path.basename(f);
    return re.test(target) && CHECKABLE_EXTS.has(extOf(f));
  });
  if (targets.length === 0) {
    return { score: 0, evidence: '未找到可检查的源码文件（模式：' + pattern + '）' };
  }
  for (const abs of targets) {
    const rel = path.relative(projectRoot, abs);
    const r = checkSyntaxOfFile(abs);
    if (!r.ok) {
      logger.error({ file: rel, error: r.error }, '语法检查失败');
      return { score: 0, evidence: '语法错误：' + rel + ' —— ' + r.error };
    }
  }
  return { score: item.max_score, evidence: '语法检查通过（' + targets.length + ' 个文件）' };
}

// ==================== fact 规则 ====================

/**
 * 把事实值转成 evidence 用文本（字符串原样、boolean 转 true/false、其余 String）。
 * @param {unknown} v
 * @returns {string}
 */
function factValueText(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/**
 * fact：{fact, op, value} —— 用 extractFacts 提取的工程事实字段与 value 比较：
 *   - 数字比较（>= > <= <）：facts[fact] 与 value 数值比较；
 *   - includes / not_includes：facts[fact] 为数组/字符串时判断是否包含 value；
 *   - == / !=：严格相等比较（boolean 相等如 hasCreateRouter == true）。
 * 满足 → 满分；不满足 → 0 分；字段不存在 / 类型不符 → 0 分。
 * @param {object} item - 规则项
 * @param {object} params - 参数
 * @param {object} facts - 本次 runRules 提取的工程事实（缓存于本次调用）
 * @returns {{score: number, evidence: string}}
 */
function execFact(item, params, facts) {
  const fact = params.fact;
  const op = params.op;
  const value = params.value;
  const label = FACT_LABELS[fact] || fact;
  const actual = facts[fact];

  if (actual === undefined || actual === null) {
    return { score: 0, evidence: '事实字段不存在：' + fact };
  }

  if (op === 'includes' || op === 'not_includes') {
    // value 支持字符串或字符串数组（数组 = 全部包含才满足）
    const values = Array.isArray(value) ? value : [value];
    const hit = values.every((v) => (Array.isArray(actual) ? actual.includes(v) : String(actual).includes(String(v))));
    const desc = Array.isArray(value) ? value.join(',') : value;
    if ((op === 'includes' && hit) || (op === 'not_includes' && !hit)) {
      return { score: item.max_score, evidence: label + (op === 'includes' ? '包含 ' : '未包含 ') + desc };
    }
    return { score: 0, evidence: label + (op === 'includes' ? '未包含 ' : '包含 ') + desc };
  }

  if (['>=', '>', '<=', '<'].includes(op)) {
    const a = Number(actual);
    const v = Number(value);
    if (!Number.isFinite(a)) {
      return { score: 0, evidence: '事实字段非数字：' + fact + '（实际 ' + factValueText(actual) + '）' };
    }
    let ok = false;
    if (op === '>=') ok = a >= v;
    else if (op === '>') ok = a > v;
    else if (op === '<=') ok = a <= v;
    else ok = a < v;
    if (ok) return { score: item.max_score, evidence: label + ' ' + a + ' ' + op + ' ' + v };
    // 失败时展示真实关系（如 routes>=3 实际 2 → "路由数量 2 < 3"）
    return { score: 0, evidence: label + ' ' + a + ' ' + INVERSE_OPS[op] + ' ' + v };
  }

  // == / !=（严格相等；boolean 相等如 hasCreateRouter == true）
  const ok = op === '==' ? actual === value : actual !== value;
  return {
    score: ok ? item.max_score : 0,
    evidence: label + ' ' + factValueText(actual) + ' ' + op + ' ' + factValueText(value),
  };
}

/**
 * 按 rule_type 分派到对应执行器。
 * @param {object} item - 规则项（已通过校验）
 * @param {string} projectRoot - 工程根
 * @param {object} [facts] - fact 规则用的工程事实（由 runRules 提前提取并缓存于本次调用）
 * @returns {{score: number, evidence: string}}
 */
function executeItem(item, projectRoot, facts) {
  const params = item.params || {};
  switch (item.rule_type) {
    case 'file_exists':
      return execFileExists(item, params, projectRoot);
    case 'dir_contains_file':
      return execDirContainsFile(item, params, projectRoot);
    case 'contains_text':
      return execContainsText(item, params, projectRoot);
    case 'count_regex':
      return execCountRegex(item, params, projectRoot);
    case 'contains_regex':
      return execContainsRegex(item, params, projectRoot);
    case 'file_count_in_dir':
      return execFileCountInDir(item, params, projectRoot);
    case 'syntax_check':
      return execSyntaxCheck(item, params, projectRoot);
    case 'fact':
      return execFact(item, params, facts);
    default:
      // 已通过 validateRules，理论不可达；防御性兜底
      return { score: 0, evidence: '不支持的规则类型：' + String(item.rule_type) };
  }
}

/**
 * 按 group 汇总（无 group 的归入 '其他'），保持首次出现顺序。
 * @param {Array<{group?: string, score: number, max_score: number}>} items - 已执行结果
 * @returns {Array<{group: string, score: number, maxScore: number}>}
 */
function buildGroupSummary(items) {
  const map = new Map();
  for (const it of items) {
    const g = typeof it.group === 'string' && it.group ? it.group : '其他';
    if (!map.has(g)) map.set(g, { group: g, score: 0, maxScore: 0 });
    const entry = map.get(g);
    entry.score += it.score;
    entry.maxScore += it.max_score;
  }
  return [...map.values()];
}

// ==================== 导出函数 ====================

/**
 * 规则校验（纯函数，绝不抛错）。
 *
 * 校验项：
 *   - rules 为对象；max_score 为正数；
 *   - objective_items / subjective_items 为数组；
 *   - 每项有 id / item / max_score；objective 项还需 rule_type（在白名单内）与 params；
 *   - fact 规则额外校验：params.fact/op 存在、op 在白名单内、value 类型合法；
 *   - 总和校验：所有 objective max_score 之和 + 所有 subjective max_score 之和 === max_score
 *     （防止 103 分问题）。
 *
 * @param {object} rules - 评分规则 JSON
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateRules(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    return { ok: false, error: '规则必须是对象' };
  }
  const maxScore = rules.max_score;
  if (typeof maxScore !== 'number' || !Number.isFinite(maxScore) || maxScore <= 0) {
    return { ok: false, error: 'max_score 必须为正数' };
  }
  const objective = rules.objective_items;
  const subjective = rules.subjective_items;
  if (!Array.isArray(objective)) return { ok: false, error: 'objective_items 必须是数组' };
  if (!Array.isArray(subjective)) return { ok: false, error: 'subjective_items 必须是数组' };

  for (const item of objective) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: '客观项必须是对象' };
    }
    if (typeof item.id !== 'string' || item.id.length === 0) {
      return { ok: false, error: '客观项缺少 id' };
    }
    if (typeof item.item !== 'string' || item.item.length === 0) {
      return { ok: false, error: '客观项缺少 item' };
    }
    if (!RULE_TYPES.includes(item.rule_type)) {
      return { ok: false, error: '不支持的规则类型：' + String(item.rule_type) };
    }
    if (typeof item.max_score !== 'number' || !Number.isFinite(item.max_score) || item.max_score <= 0) {
      return { ok: false, error: '客观项 max_score 必须为正数：' + item.id };
    }
    if (!item.params || typeof item.params !== 'object' || Array.isArray(item.params)) {
      return { ok: false, error: '客观项缺少 params：' + item.id };
    }
    if (item.rule_type === 'fact') {
      const p = item.params;
      if (typeof p.fact !== 'string' || p.fact.length === 0) {
        return { ok: false, error: 'fact 规则缺少 params.fact：' + item.id };
      }
      if (typeof p.op !== 'string' || !FACT_OPS.includes(p.op)) {
        return { ok: false, error: 'fact 规则 op 非法：' + String(p.op) + '（' + item.id + '）' };
      }
      const vt = typeof p.value;
      const isStrArr = Array.isArray(p.value) && p.value.every((x) => typeof x === 'string');
      if (vt !== 'number' && vt !== 'string' && vt !== 'boolean' && !isStrArr) {
        return { ok: false, error: 'fact 规则 value 类型非法：' + String(p.value) + '（' + item.id + '）' };
      }
      if (['>=', '>', '<=', '<'].includes(p.op) && (vt !== 'number' || !Number.isFinite(p.value))) {
        return { ok: false, error: 'fact 规则数值比较 op 要求 value 为有限数字：' + item.id };
      }
      if (['includes', 'not_includes'].includes(p.op) && vt !== 'string' && !isStrArr) {
        return { ok: false, error: 'fact 规则 includes op 要求 value 为字符串或字符串数组：' + item.id };
      }
    }
  }

  for (const item of subjective) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: '主观项必须是对象' };
    }
    if (typeof item.id !== 'string' || item.id.length === 0) {
      return { ok: false, error: '主观项缺少 id' };
    }
    if (typeof item.item !== 'string' || item.item.length === 0) {
      return { ok: false, error: '主观项缺少 item' };
    }
    if (typeof item.max_score !== 'number' || !Number.isFinite(item.max_score) || item.max_score <= 0) {
      return { ok: false, error: '主观项 max_score 必须为正数：' + item.id };
    }
  }

  const objectiveTotal = objective.reduce((s, i) => s + i.max_score, 0);
  const subjectiveTotal = subjective.reduce((s, i) => s + i.max_score, 0);
  if (objectiveTotal + subjectiveTotal !== maxScore) {
    return {
      ok: false,
      error: '分数总和校验失败：客观项合计 ' + objectiveTotal + ' + 主观项合计 ' + subjectiveTotal
        + ' = ' + (objectiveTotal + subjectiveTotal) + '，不等于 max_score（' + maxScore + '）',
    };
  }
  return { ok: true };
}

/**
 * 工程根探测：rootDir 为解压根；若 rootDir 下只有一个子目录、且该子目录包含源码文件
 * （扩展名命中 SOURCE_EXTS 或含 package.json），返回该子目录；否则返回 rootDir。
 *
 * 供路径解析使用 —— 学生压缩包常见「外层解压根包一个工程目录」结构，规则里的路径
 * （如 package.json）是相对工程目录写的。
 *
 * @param {string} rootDir - 解压根
 * @returns {string} 工程根（绝对路径或原值）
 */
export function resolveProjectRoot(rootDir) {
  if (!rootDir || typeof rootDir !== 'string') return rootDir;
  const root = path.resolve(rootDir);
  let stat = null;
  try {
    stat = fs.statSync(root);
  } catch {
    return rootDir;
  }
  if (!stat.isDirectory()) return rootDir;

  let subdirs = [];
  try {
    subdirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .map((e) => e.name);
  } catch {
    return rootDir;
  }
  if (subdirs.length !== 1) return rootDir;

  const candidate = path.join(root, subdirs[0]);
  const hasSource = collectFiles(candidate).some((f) => {
    const name = path.basename(f);
    return name === 'package.json' || SOURCE_EXTS.has(extOf(f));
  });
  return hasSource ? candidate : rootDir;
}

/**
 * 执行评分（核心）：先 validateRules（不通过抛错拒绝执行），再解析工程根，
 * 逐项执行 objective_items，返回客观分合计 + 明细 + 主观项 + 分组汇总。
 *
 * 强制约束：
 *   - 每项 score = max(0, min(max_score, 计算得分))，永不超上限；
 *   - totalScore = 客观项得分之和（不超客观项总分；不包含 subjective）；
 *   - 含 fact 规则时，每次 runRules 只执行一次 extractFacts，结果缓存于本次调用
 *     （多条 fact 规则共享同一份事实）；提取失败 → 该项 0 分 + 证据，绝不抛错。
 *
 * @param {object} rules - 评分规则 JSON（须通过 validateRules）
 * @param {string} rootDir - 解压根目录
 * @returns {
 *   totalScore: number,
 *   items: Array<{id: string, group?: string, item: string, max_score: number, score: number, pass: boolean, evidence: string}>,
 *   subjective: Array<{id: string, item: string, max_score: number}>,
 *   groupSummary: Array<{group: string, score: number, maxScore: number}>,
 * }}
 * @throws {Error} 规则校验不通过时抛错（拒绝执行）
 */
export function runRules(rules, rootDir) {
  const v = validateRules(rules);
  if (!v.ok) {
    logger.error({ error: v.error }, '评分规则校验失败，拒绝执行');
    throw new Error('规则校验失败：' + v.error);
  }

  const projectRoot = resolveProjectRoot(rootDir);
  const items = [];
  let totalScore = 0;
  let facts;          // undefined = 尚未提取；null = 提取失败
  let factError = null;

  for (const item of rules.objective_items) {
    let r;
    if (item.rule_type === 'fact') {
      // 每次 runRules 只提取一次事实，缓存于本次调用（多条 fact 规则共享）
      if (facts === undefined) {
        try {
          facts = extractFacts(projectRoot);
        } catch (err) {
          facts = null;
          factError = errorSummary(err);
        }
      }
      r = facts === null
        ? { score: 0, evidence: '事实提取失败：' + (factError || '未知错误') }
        : executeItem(item, projectRoot, facts);
    } else {
      r = executeItem(item, projectRoot);
    }
    const score = clampScore(r.score, item.max_score);
    totalScore += score;
    items.push({
      id: item.id,
      group: item.group,
      item: item.item,
      max_score: item.max_score,
      score,
      pass: score === item.max_score,
      evidence: r.evidence,
    });
  }

  // 客观分合计不超客观项总分（每项已钳制，这里再兜底一次）
  const objectiveMax = rules.objective_items.reduce((s, i) => s + i.max_score, 0);
  totalScore = Math.min(totalScore, objectiveMax);

  const subjective = rules.subjective_items.map((s) => ({
    id: s.id,
    item: s.item,
    max_score: s.max_score,
  }));

  return {
    totalScore,
    items,
    subjective,
    groupSummary: buildGroupSummary(items),
  };
}
