/**
 * scorePolicy.js —— 计分口径（三开关之②）：同一位学生同一题的多次提交中，「机器分」取哪一次。
 *
 * R3 / 需求 v1.0（US-B4）：
 *   - 'best'（取最高） ⇒ 机器分 = bestScore（历次最高；历史行该列为空时回落最新 aiScore）
 *   - 'last'（取最后） ⇒ 机器分 = 最新一次 aiScore
 *   - 未配置 / 非法值  ⇒ 'last' —— **本需求之前的既有行为**（历史作业零行为变化，US-B1 AC3）
 *
 * ★作用域（D4 定案）：只作用**机器分**。教师定案分 finalScore 是权威值，
 *   任何口径都不得覆盖它 —— 统一出口 pickCountedScore()（finalScore 非空即恒返回教师分）。
 * ★唯一键约束：每题每生仅一行提交（attemptCount/bestScore 在同一行上累积），
 *   故口径只能在**读路径**折算，不产生新的存储行。
 *
 * 领域层纯函数（无 import / 无 IO，符合 check-layers 的 domain 约束），
 * 学生端（assignments/scores/view）与后续教师端读路径共用同一实现，避免口径各自漂移。
 */

export const SCORE_POLICIES = ['best', 'last'];
/** 未配置时的生效口径 = 取最后（= 需求落地前的既有行为） */
export const DEFAULT_SCORE_POLICY = 'last';

/**
 * 校验口径取值（'best' | 'last'）；非法/缺省返回 null，由调用方决定回落策略。
 * @param {unknown} value
 * @returns {'best'|'last'|null}
 */
export function normalizeScorePolicy(value) {
  return SCORE_POLICIES.includes(value) ? value : null;
}

/**
 * 解析生效口径：入参可以是作业行，也可以是裸取值。
 * 未配置（历史数据）/ 非法值 ⇒ 'last'（既有行为不变）。
 * @param {{scorePolicy?: string|null}|string|null|undefined} assignmentOrValue
 * @returns {'best'|'last'}
 */
export function resolveScorePolicy(assignmentOrValue) {
  const raw = typeof assignmentOrValue === 'string'
    ? assignmentOrValue
    : assignmentOrValue?.scorePolicy;
  return normalizeScorePolicy(raw) ?? DEFAULT_SCORE_POLICY;
}

/** 只接受有限数值（0 是合法分数，null/NaN/undefined 一律视为「无分」） */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 按口径挑「机器分」。
 * @param {{scorePolicy?: string|null, aiScore?: number|null, bestScore?: number|null}} input
 * @returns {number|null} 无任何机器分时为 null
 */
export function pickMachineScore({ scorePolicy, aiScore, bestScore } = {}) {
  const ai = num(aiScore);
  // 'best'：优先历次最高；bestScore 为空（该列引入前的历史行 / 无多次提交）时回落最新分
  if (resolveScorePolicy(scorePolicy) === 'best') return num(bestScore) ?? ai;
  // 'last'：严格取最新一次，**不**回落 bestScore（保持既有口径 = finalScore ?? aiScore）
  return ai;
}

/**
 * 该题最终「计入分」：教师定案分优先，否则按口径取机器分。
 * US-B4 AC3：教师分不被机器分覆盖。
 * @param {{scorePolicy?: string|null, finalScore?: number|null, aiScore?: number|null, bestScore?: number|null}} input
 * @returns {number|null}
 */
export function pickCountedScore({ scorePolicy, finalScore, aiScore, bestScore } = {}) {
  const teacher = num(finalScore);
  if (teacher != null) return teacher;
  return pickMachineScore({ scorePolicy, aiScore, bestScore });
}
