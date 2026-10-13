/**
 * student/view.js —— 学生端提交行的错误映射与**可见字段白名单**（R2-B65：从 controllers/studentController.js 原样拆出）。
 *
 * 安全关键：白名单字段名（含"不下发 aiScore/aiFeedback"）不得增删，详见 toStudentSubmissionView 注释。
 */

import { DomainError, EntityNotFoundError } from '../../../../domain/errors.js';
import { pickCountedScore } from '../../../../domain/services/scorePolicy.js';

// ===================== 提交答案 =====================

export function mapSubmissionError(res, err) {
  if (err instanceof EntityNotFoundError) return res.status(404).json({ code: 1004, message: err.message, data: null });
  if (err instanceof DomainError) {
    if (err.code === 'LOCKED') return res.status(403).json({ code: 1003, message: err.message, data: null });
    return res.status(400).json({ code: 1001, message: err.message, data: null });
  }
  return null;
}

/**
 * 学生端提交行白名单（安全关键，铁律同 utils/projectView.js）。
 *
 * 必须「显式字段拷贝」：黑名单写法（{...submission} 再置空）在新增敏感列时会静默泄漏，
 * 且 aiScore / aiFeedback 的**字段名**本身也不得出现（字段名即暴露「AI 已打分 / 已有 AI 评语」）。
 *
 * 可见性规则（与 /student/scores 同口径）：
 *   - published：finalScore / teacherFeedback 可见；
 *   - practice 模式且 ai_graded / reviewed：分数/评语可见（现有规则不变）；
 *   - 其余状态：finalScore / teacherFeedback / bestScore 一律置空。
 *
 * R3-D1（US-B4）：可见分 = **计入分** —— 教师定案分 finalScore 优先（权威值，不被机器分覆盖），
 * 否则按作业计分口径取机器分（scorePolicy='best' ⇒ bestScore；'last' ⇒ 最新 aiScore；
 * 未配置/历史作业 ⇒ 'last'，与改动前逐字等价）。字段名集合不变（安全白名单铁律）。
 *
 * @param {object} s submission 行
 * @param {boolean} isPractice 作业是否为练习模式（历史兼容分支，US-B5 后由开关驱动）
 * @param {string|null} [scorePolicy] 作业计分口径（'best'|'last'；缺省 ⇒ 'last'）
 * @returns {object} 学生可见字段的白名单视图
 */
export function toStudentSubmissionView(s, isPractice, scorePolicy) {
  const published = s.status === 'published';
  const practiceScored = isPractice && (s.status === 'ai_graded' || s.status === 'reviewed');
  const showScore = published || practiceScored;
  const finalScore = showScore
    ? pickCountedScore({ scorePolicy, finalScore: s.finalScore, aiScore: s.aiScore, bestScore: s.bestScore })
    : null;
  const teacherFeedback = published
    ? (s.teacherFeedback ?? null)
    : (practiceScored ? (s.teacherFeedback || s.aiFeedback || null) : null);
  return {
    id: s.id,
    assignmentId: s.assignmentId,
    studentId: s.studentId,
    questionId: s.questionId,
    subQuestionId: s.subQuestionId,
    answer: s.answer,
    status: s.status,
    submittedAt: s.submittedAt,
    attemptCount: s.attemptCount,
    // bestScore 是 AI 分派生值：exam 模式未发布时不下发，practice 模式按「分数可见」的既有规则保留
    bestScore: (published || isPractice) ? (s.bestScore ?? null) : null,
    finalScore,
    teacherFeedback,
  };
}
