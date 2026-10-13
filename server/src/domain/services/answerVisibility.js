/**
 * answerVisibility.js —— 答案/解析可见性（三开关之③）。
 *
 * R3 / 需求 v1.0（US-B2）：
 *   - 'immediate'    （提交后立即）：**评分完成**（ai_graded / reviewed / published）即可看答案与解析
 *   - 'after_publish'（发布后可见）：仅 published 可见
 *   - 未配置 / 非法值 ⇒ 'after_publish'（安全默认，与历史数据既有行为一致：未发布不下发标准答案）
 *
 * ★历史兼容：需求落地前「练习模式且已评分」即可见答案（mode='practice' 旧分支）。
 *   该分支由调用方以 isPractice 传入并**继续生效**，避免历史作业行为变化（US-B1 AC3）；
 *   新建作业不再依赖 mode，而由本开关驱动（US-B5）。
 *
 * 领域层纯函数（无 import / 无 IO）。
 */

export const ANSWER_VISIBILITIES = ['immediate', 'after_publish'];
/** 未配置时的生效可见性 = 发布后可见（安全默认 = 既有行为） */
export const DEFAULT_ANSWER_VISIBILITY = 'after_publish';

/**
 * 校验可见性取值（'immediate' | 'after_publish'）；非法/缺省返回 null。
 * @param {unknown} value
 * @returns {'immediate'|'after_publish'|null}
 */
export function normalizeAnswerVisibility(value) {
  return ANSWER_VISIBILITIES.includes(value) ? value : null;
}

/**
 * 解析生效可见性：入参可以是作业行，也可以是裸取值。
 * @param {{answerVisibility?: string|null}|string|null|undefined} assignmentOrValue
 * @returns {'immediate'|'after_publish'}
 */
export function resolveAnswerVisibility(assignmentOrValue) {
  const raw = typeof assignmentOrValue === 'string'
    ? assignmentOrValue
    : assignmentOrValue?.answerVisibility;
  return normalizeAnswerVisibility(raw) ?? DEFAULT_ANSWER_VISIBILITY;
}

/** 已出分的状态集合（AI 评完 / 教师看完 / 已发布） */
const GRADED_STATUSES = ['ai_graded', 'reviewed', 'published'];

/**
 * 学生是否可以看到参考答案与解析。
 * @param {{answerVisibility?: string|null, status?: string|null, isPractice?: boolean}} input
 * @returns {boolean}
 */
export function canSeeAnswerAndAnalysis({ answerVisibility, status, isPractice } = {}) {
  if (status === 'published') return true;
  const graded = GRADED_STATUSES.includes(status);
  if (!graded) return false;
  if (resolveAnswerVisibility(answerVisibility) === 'immediate') return true;
  // 历史兼容：开关落地前 practice 作业「已评分即可见」的既有规则继续生效
  return isPractice === true;
}
