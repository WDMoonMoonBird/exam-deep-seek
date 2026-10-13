/**
 * finalScore.js —— 教师定案分（finalScore）的取值校验与「改分后状态机」（R3-D5 / G2 · G3）。
 *
 * 两条链路共用（同一条口径，避免一处收紧一处漏）：
 *   - 实训题审核/重评：infrastructure/review/project-review-ops.js
 *   - 编程题改分/审核：application/use-cases/review.use-cases.js
 *
 * 口径：有限数字 + 整数（submissions.final_score 为 Int 列）+ 0 ≤ 分 ≤ 满分（缺省 100）。
 *   ★非法值一律返回**可读文案**（不再 Math.min/Math.max 静默夹取、也不再让 NaN 落库 → 500）。
 *
 * 状态机（US-A2 AC2 / G3：已发布提交改分后学生端仍能看到新分）：
 *   published  → published（保持发布态，学生端即时可见新 finalScore）
 *   其它状态    → reviewed
 *
 * 纯函数、无 import（domain 层约束）。
 */

export const DEFAULT_MAX_SCORE = 100;

/** 解析满分：非法/缺省 ⇒ 100（与题目 maxScore 的既有缺省一致） */
function resolveMax(maxScore) {
  const n = Number(maxScore);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_SCORE;
}

/**
 * 语法级校验（不需要题目上下文）：空值 / 非数字 / 非整数 / 负数。
 * @param {unknown} value
 * @returns {{ok:true, value:number} | {ok:false, empty:boolean, message:string}}
 */
export function checkScoreSyntax(value) {
  if (value === undefined || value === null || value === '') {
    return { ok: false, empty: true, message: '分数不合法：请填写最终分数' };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return { ok: false, empty: false, message: '分数不合法：必须是数字' };
  if (!Number.isInteger(n)) return { ok: false, empty: false, message: '分数不合法：必须是整数' };
  if (n < 0) return { ok: false, empty: false, message: '分数不合法：不能为负数' };
  return { ok: true, value: n };
}

/**
 * 范围校验（需要题目满分）。
 * @param {number} value 已通过语法校验的分数
 * @param {number} [maxScore]
 * @returns {{ok:true, value:number, max:number} | {ok:false, message:string}}
 */
export function checkScoreRange(value, maxScore) {
  const max = resolveMax(maxScore);
  if (value > max) return { ok: false, message: `分数不合法：需在 0 ~ ${max} 之间` };
  return { ok: true, value, max };
}

/**
 * 一次性校验（语法 + 范围）。
 * @param {{value?: unknown, maxScore?: number}} input
 */
export function normalizeFinalScore({ value, maxScore } = {}) {
  const syntax = checkScoreSyntax(value);
  if (!syntax.ok) return syntax;
  return checkScoreRange(syntax.value, maxScore);
}

/**
 * 改分/审核后的状态机（G3）：published 保持 published，其余一律 reviewed。
 * @param {string|null|undefined} currentStatus
 * @returns {'published'|'reviewed'}
 */
export function statusAfterReview(currentStatus) {
  return currentStatus === 'published' ? 'published' : 'reviewed';
}
