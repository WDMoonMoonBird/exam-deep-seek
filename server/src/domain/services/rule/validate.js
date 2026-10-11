/**
 * validate.js —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 835-928）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { FACT_OPS, RULE_TYPES } from './constants.js';

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
