/**
 * answerVisibility.js —— 答案/解析可见性（三开关之③）。
 *
 * R3 / 需求 v1.0（US-B2）：
 *   - 'immediate'    （提交后立即）：**评分完成**（ai_graded / reviewed / published）即可看答案与解析
 *   - 'after_publish'（发布后可见）：仅 published 可见
 *   - 未配置 / 非法值 ⇒ 'after_publish'（安全默认，与历史数据既有行为一致：未发布不下发标准答案）
 *
 * ★R3-D4（US-B5）：完全由开关驱动 —— 原先「练习模式且已评分即可见」的 mode 后门已移除；
 *   历史作业（迁移列默认 after_publish）按 US-B1 AC3「发布后可见」口径读取，等价能力由开关复现。
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
 * 学生是否可以看到参考答案与解析（纯开关驱动，无 mode 分支）。
 * @param {{answerVisibility?: string|null, status?: string|null}} input
 * @returns {boolean} published 恒可见；immediate ⇒ 评分完成即可见；after_publish ⇒ 仅发布后
 */
export function canSeeAnswerAndAnalysis({ answerVisibility, status } = {}) {
  if (status === 'published') return true;
  if (!GRADED_STATUSES.includes(status)) return false;
  return resolveAnswerVisibility(answerVisibility) === 'immediate';
}
