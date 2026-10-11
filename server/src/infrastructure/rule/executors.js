/**
 * executors.js —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 279-776）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import fs from 'node:fs';
import path from 'node:path';
import { countMatches, globToRegExp } from '../../domain/services/rule/evaluators.js';
import { collectFiles, readFileUtf8, resolveWithinRoot } from './file-access.js';

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

/**
 * normalized_text：{path, text} —— 文件内容归一化（去全部空白）后包含 text（同样归一化）。
 * 解决空格/换行/缩进差异导致的误失分。
 * @returns {{score: number, evidence: string}}
 */
function execCountImports(item, params, projectRoot) {
  const p = params.path;
  const moduleName = params.module;
  if (typeof p !== 'string' || p.length === 0) return { score: 0, evidence: '缺少参数 path' };
  if (typeof moduleName !== 'string' || moduleName.length === 0) return { score: 0, evidence: '缺少参数 module' };
  const abs = resolveWithinRoot(projectRoot, p);
  if (!abs) return { score: 0, evidence: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { score: 0, evidence: '无法读取 ' + p + '：' + r.error };
  // 跨语言 import 语句行扫描（正则字面量，零转义问题）：
  //   JS: import x from 'm' / require('m') / import('m')
  //   Java: import m.x.y;
  //   Python: import m / from m import x
  //   C/C++: #include <m.h>
  let count = 0;
  const srcLines = String(r.content).split('\n');
  for (const line of srcLines) {
    const t = line.trim();
    if (/^(import|require|from|include)\b/.test(t) && t.includes(moduleName)) count += 1;
  }
  const min = Number(params.min);
  const minValue = Number.isFinite(min) ? min : 1;
  const evidence = 'import 命中 ' + count + ' 次（需 ≥' + minValue + '）';
  if (count >= minValue) return { score: item.max_score, evidence };
  if (params.partial === true && minValue > 0) {
    return { score: Math.round((item.max_score * count) / minValue), evidence };
  }
  return { score: 0, evidence };
}

function execNormalizedText(item, params, projectRoot) {
  const p = params.path;
  const text = params.text;
  if (typeof p !== 'string' || p.length === 0) return { score: 0, evidence: '缺少参数 path' };
  if (typeof text !== 'string' || text.length === 0) return { score: 0, evidence: '缺少参数 text' };
  const abs = resolveWithinRoot(projectRoot, p);
  if (!abs) return { score: 0, evidence: '路径无效或越界：' + p };
  const r = readFileUtf8(abs);
  if (!r.ok) return { score: 0, evidence: '无法读取 ' + p + '：' + r.error };
  const normContent = r.content.replace(/\s+/g, '');
  const normText = text.replace(/\s+/g, '');
  if (normContent.includes(normText)) {
    return { score: item.max_score, evidence: '包含（归一化后）' + text };
  }
  return { score: 0, evidence: '未包含（归一化后）' + text };
}

export { execFileExists, execDirContainsFile, execContainsText, execCountRegex, execContainsRegex, execFileCountInDir, execCountImports, execNormalizedText };
