/**
 * evaluators.js —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 128-831）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { ERROR_SUMMARY_LEN, FACT_LABELS, INVERSE_OPS } from './constants.js';

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
 * 简化 glob → 正则：`*` 通配（不跨目录分隔符）、`?` 单字符（不跨目录分隔符），其余原样转义。
 * 支持 *.vue 这类后缀通配；含 `/` 的模式按相对路径匹配，否则按文件名匹配。
 * @param {string} pattern - glob 模式
 * @returns {RegExp}
 */
export function globToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp('^' + re + '$');
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

export { clampScore, countMatches, extractVueScriptWithOffset, lineNumberOf, errorSummary, factValueText, execFact, buildGroupSummary };
