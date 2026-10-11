/**
 * syntax.js —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 31-724）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import fs from 'node:fs';
import path from 'node:path';
import 'node:module';
import Parser from 'tree-sitter';
import JS from 'tree-sitter-javascript';
import { getJavaParser } from '../../services/factExtractors/java.js';
import { getPythonParser } from '../../services/factExtractors/python.js';
import logger from '../../utils/logger.js';
import { CHECKABLE_EXTS } from '../../domain/services/rule/constants.js';
import { errorSummary, extractVueScriptWithOffset, globToRegExp, lineNumberOf } from '../../domain/services/rule/evaluators.js';
import { collectFiles, extOf, readFileUtf8, resolveWithinRoot } from './file-access.js';

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

/**
 * 按扩展名选择语言解析器（vue 走 <script> 提取 + JS 解析，与 syntax_check 同语义）。
 * @param {string} absPath - 文件绝对路径
 * @returns {object|null} { parser, source } | null
 */
function parserForFile(absPath) {
  const ext = extOf(absPath);
  if (ext === 'vue') {
    let content;
    try { content = fs.readFileSync(absPath, 'utf8'); } catch { return null; }
    const m = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(content);
    if (!m) return null;
    const parser = getJSParser();
    return { parser, source: m[1] };
  }
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') {
    return { parser: getJSParser(), source: null };
  }
  if (ext === 'java') return { parser: getJavaParser(), source: null };
  if (ext === 'py') return { parser: getPythonParser(), source: null };
  return null;
}

/**
 * 收集 AST 中与 pattern 匹配的节点类型路径序列。
 * pattern 格式：以 '>' 分隔的节点类型链（如 'class_declaration > method_declaration'），
 * 匹配 AST 中任意「祖先→后代」链上的类型序列（忽略空白/换行/引号等格式差异）。
 * @param {object} root - tree-sitter 根节点
 * @param {string[]} types - pattern 拆出的类型数组
 * @returns {number} 匹配到的链数量
 */
function countAstPatternMatches(root, types) {
  if (!types || types.length === 0) return 0;
  let count = 0;
  const walk = (node) => {
    if (node.type === types[0]) {
      if (types.length === 1) {
        count += 1;
      } else {
        const subWalk = (n, depth) => {
          if (depth >= types.length) return;
          if (n.type === types[depth]) {
            if (depth === types.length - 1) count += 1;
            else for (const c of n.namedChildren) subWalk(c, depth + 1);
          }
          for (const c of n.namedChildren) subWalk(c, depth);
        };
        for (const c of node.namedChildren) subWalk(c, 1);
      }
    }
    for (const c of node.namedChildren) walk(c);
  };
  walk(root);
  return count;
}

/**
 * ast_pattern：{path, pattern} —— tree-sitter 解析后按节点类型链匹配。
 * pattern 形如 'class_declaration > method_declaration'（> 分隔，忽略格式差异）。
 * 匹配 ≥ 1 条链 → 满分；否则 0 分。
 * @returns {{score: number, evidence: string}}
 */
function execAstPattern(item, params, projectRoot) {
  const p = params.path;
  const pattern = params.pattern;
  if (typeof p !== 'string' || p.length === 0) return { score: 0, evidence: '缺少参数 path' };
  if (typeof pattern !== 'string' || pattern.length === 0) return { score: 0, evidence: '缺少参数 pattern' };
  const abs = resolveWithinRoot(projectRoot, p);
  if (!abs) return { score: 0, evidence: '路径无效或越界：' + p };
  const pff = parserForFile(abs);
  if (!pff) return { score: 0, evidence: '不支持解析该文件类型：' + extOf(abs) };
  try {
    let content = pff.source;
    if (content === null) {
      const r = readFileUtf8(abs);
      if (!r.ok) return { score: 0, evidence: '无法读取 ' + p + '：' + r.error };
      content = r.content;
    }
    const tree = pff.parser.parse(content);
    const types = pattern.split('>').map((x) => x.trim()).filter(Boolean);
    const count = countAstPatternMatches(tree.rootNode, types);
    if (count > 0) return { score: item.max_score, evidence: 'AST 匹配 ' + count + ' 处（' + pattern + '）' };
    return { score: 0, evidence: 'AST 未匹配（' + pattern + '）' };
  } catch {
    return { score: 0, evidence: 'AST 解析失败：' + p };
  }
}

export { getJSParser, getVueParser, collectSyntaxErrors, describeSyntaxErrors, checkSyntaxOfFile, execSyntaxCheck, parserForFile, countAstPatternMatches, execAstPattern };
