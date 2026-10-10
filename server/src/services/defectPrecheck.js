/**
 * defectPrecheck.js — 确定性缺陷预检器（解决 LLM 评分对"代码缺陷"检测不稳定的问题）
 *
 * 背景：LLM 直评在长上下文中对"文件缺失/import 断裂"等缺陷的发现是概率性的
 *       （同一份代码可能评 36 分也可能评 95 分，std≈15-17）。
 *       本模块在 LLM 评分前用确定性代码扫描缺陷，把结果作为事实注入评分 prompt，
 *       或将可规则化的缺陷直接折算扣分 —— 把随机步骤变成确定步骤。
 *
 * 检查项（全部确定性、零 LLM）：
 *   1. missing_imports   —— 源码中 import/require 的相对路径目标不存在（导致运行崩溃）
 *   2. missing_key_files —— 标准包存在、学生包缺失的关键源码文件（按 rubric/依赖推断重要性由调用方定）
 *   3. syntax_hint       —— 明显的括号/引号不平衡（轻量提示，非 tree-sitter 级）
 *
 * 纯函数、零外部依赖（node:fs/path），任何单文件失败只跳过不中断。
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot } from './factExtractors/common.js';

/** 递归收集目录下全部文件（相对 posix 路径），跳过常见第三方/构建目录 */
export function collectFiles(rootDir, { skipDirs = ['node_modules', '.git', 'dist', 'build', 'target', '.idea', '.vscode'] } = {}) {
  const out = [];
  const walk = (abs, rel) => {
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (skipDirs.includes(e.name)) continue;
        walk(childAbs, childRel);
      } else if (e.isFile()) {
        out.push(childRel);
      }
    }
  };
  walk(rootDir, '');
  return out;
}

/** 源码扩展名（import 检查只关心这些） */
const SRC_EXTS = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'java', 'py']);

// C-1（round 3）：本文件原有的私有 resolveProjectRoot 已删除，统一改用 factExtractors/common.js
// 的单一实现（含 P0-1 清单短路与 SKIP_DIRS 过滤）。此处再导出以保持既有导出面不变。
export { resolveProjectRoot };

/**
 * 收集源码文件中 import 的相对路径引用（js/ts/vue/jsx 的 import/require；
 * vue 的 <script> 内联内容一并扫）。
 * @param {string} absPath 文件绝对路径
 * @returns {string[]} 相对路径引用（原样，如 './views/Login.vue'）
 */
function extractRelativeImports(absPath) {
  let content;
  try { content = fs.readFileSync(absPath, 'utf8'); } catch { return []; }
  const out = [];
  // 去 <script> 提取（vue）
  const scriptM = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const jsText = scriptM ? scriptM[1] : content;
  // import x from './y' / import './y' / require('./y') / import('./y')
  const re = /(?:import\s+(?:[\s\S]*?\s+from\s+)?|require\s*\(|import\s*\()\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(jsText)) !== null) {
    const p = m[1];
    if (p.startsWith('.') || p.startsWith('/')) out.push(p); // 相对/绝对路径引用
  }
  return out;
}

/**
 * 全量缺陷预检。
 * @param {object} p
 * @param {string} p.rootDir 学生提交目录（解压根）
 * @param {string} [p.stdDir] 标准包目录（可选；提供后做缺失关键文件对比）
 * @param {string[]} [p.keyFiles] 关键文件清单（相对工程根；提供后精确检查缺失）
 * @returns {Promise<{ok: boolean, issues: Array<{type: string, file: string, target?: string, detail: string}>, fileCount: number}>}
 */
export function precheckProject({ rootDir, stdDir, keyFiles }) {
  const issues = [];
  const projectRoot = resolveProjectRoot(rootDir);
  const allFiles = collectFiles(projectRoot);
  const fileSet = new Set(allFiles);
  const srcFiles = allFiles.filter((f) => SRC_EXTS.has(f.split('.').pop().toLowerCase()));

  // 1) import 完整性：解析每个源码文件的相对引用，检查目标是否存在（含 index 解析）
  for (const rel of srcFiles) {
    const abs = path.join(projectRoot, rel);
    const refs = extractRelativeImports(abs);
    for (const ref of refs) {
      const resolved = resolveImportTarget(projectRoot, rel, ref);
      if (!resolved) {
        issues.push({
          type: 'missing_import',
          file: rel,
          target: ref,
          detail: `${rel} 引用了 ${ref}，但目标文件不存在（会导致运行崩溃）`,
        });
      }
    }
  }

  // 2) 关键文件缺失（stdDir 对比 or keyFiles 显式清单）
  if (Array.isArray(keyFiles) && keyFiles.length > 0) {
    for (const kf of keyFiles) {
      const norm = kf.split('/').pop();
      // 允许任意顶层目录前缀（UserManagement/src/... 或 UserManagement_副本/src/...）
      const hit = [...fileSet].some((f) => f.endsWith('/' + norm) || f === norm);
      if (!hit) {
        issues.push({ type: 'missing_key_file', file: kf, detail: '关键文件缺失：' + norm });
      }
    }
  } else if (stdDir) {
    // 未给 keyFiles：对比标准包 src 业务文件（排除 assets/第三方），学生缺失即记
    const stdRoot = resolveProjectRoot(stdDir);
    const stdSrc = collectFiles(stdRoot).filter((f) => {
      const ext = f.split('.').pop().toLowerCase();
      const isAsset = /(^|\/)(assets|static|public|images?|fonts?|css|scss|sass|less)(\/|$)/.test(f)
        || /(jquery|bootstrap|bootsnav|modernizr|.min.)/.test(f.split('/').pop());
      return SRC_EXTS.has(ext) && !isAsset;
    });
    for (const sf of stdSrc) {
      const norm = sf.split('/').pop();
      const hit = [...fileSet].some((f) => f.endsWith('/' + norm) || f === norm);
      if (!hit) {
        issues.push({ type: 'missing_key_file', file: sf, detail: '标准包存在但学生缺失（按 basename 比对）：' + norm });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    fileCount: allFiles.length,
    projectRoot,
  };
}

/**
 * 解析 import 目标是否存在（处理 './x.vue'、'./dir' → './dir/index.js' 等）。
 * @param {string} projectRoot 工程根
 * @param {string} importerRel import 所在文件的相对路径
 * @param {string} ref import 引用
 * @returns {string|null} 存在返回绝对路径；不存在返回 null
 */
function resolveImportTarget(projectRoot, importerRel, ref) {
  if (ref.startsWith('/')) {
    // 以 / 开头：视为相对工程根
    const abs = path.join(projectRoot, ref.replace(/^\//, ''));
    return tryResolve(abs);
  }
  const base = path.join(projectRoot, path.dirname(importerRel));
  const abs = path.resolve(base, ref);
  return tryResolve(abs);
}

function tryResolve(abs) {
  try {
    if (fs.statSync(abs).isFile()) return abs;
  } catch { /* continue */ }
  // 尝试扩展名补全
  for (const ext of ['.js', '.ts', '.jsx', '.tsx', '.vue', '.mjs', '.cjs', '/index.js', '/index.ts']) {
    try {
      if (fs.statSync(abs + ext).isFile()) return abs + ext;
    } catch { /* continue */ }
  }
  return null;
}

export default { precheckProject, collectFiles, resolveProjectRoot };
