/**
 * student/submission.js —— 提交/草稿/重答（R2-B65：从 controllers/studentController.js 原样拆出）。
 *
 * 走 app.locals.submissionUseCases（组合根注入），错误映射复用 view.js 的 mapSubmissionError（状态码/错误码不变）。
 */

import logger from '../../../../utils/logger.js';
import { mapSubmissionError } from './view.js';

/**
 * ★W1-r2（t4）：500 的**固定文案**。
 * 旧实现把 err.message 直接拼进响应（"服务器错误: " + err.message）⇒ 内部实现细节（如依赖库报错文本）会送到浏览器；
 * 现在：原文只进 logger.error（排障不受影响），上屏一律用这句固定文案。
 * 登记为独立后续项：同款写法还有 6 处（student/assignments.js:120,177、student/scores.js:63,77、
 *   student/project-question.js:150、student/project-submit.js:208）—— 客户端已由 errorCopy 的 5xx 口径兜住（不再上屏）。
 */
const FALLBACK_500_MESSAGE = '服务器开小差了，请稍后重试';

export const submitAnswer = async (req, res) => {
  try {
    const { message } = await req.app.locals.submissionUseCases.submit({
      assignmentId: +req.params.id,
      studentId: req.user.id,
      questionId: req.body.questionId,
      subQuestionId: req.body.subQuestionId,
      answer: req.body.answer,
      force: req.body.force,
    });
    res.json({ code: 0, message, data: null });
  } catch (err) {
    const mapped = mapSubmissionError(res, err);
    if (mapped) return mapped;
    logger.error({ err }, '提交答案失败');
    // ★W1-r2（t4）：500 一律给**固定文案**，内部细节只进上面的日志（不随响应上屏）
    res.status(500).json({ code: 2001, message: FALLBACK_500_MESSAGE, data: null });
  }
};

export const saveDraft = async (req, res) => {
  try {
    const { message } = await req.app.locals.submissionUseCases.saveDraft({
      assignmentId: +req.params.id,
      studentId: req.user.id,
      questionId: req.body.questionId,
      subQuestionId: req.body.subQuestionId,
      answer: req.body.answer,
    });
    res.json({ code: 0, message, data: null });
  } catch (err) {
    const mapped = mapSubmissionError(res, err);
    if (mapped) return mapped;
    logger.error({ err }, '保存草稿失败');
    // ★W1-r2（t4）：500 一律给**固定文案**，内部细节只进上面的日志（不随响应上屏）
    res.status(500).json({ code: 2001, message: FALLBACK_500_MESSAGE, data: null });
  }
};

export const retryAssignment = async (req, res) => {
  try {
    const { message } = await req.app.locals.submissionUseCases.retry({
      assignmentId: +req.params.id,
      studentId: req.user.id,
    });
    logger.info({ assignmentId: +req.params.id, studentId: req.user.id }, '练习重新答题');
    res.json({ code: 0, message, data: null });
  } catch (err) {
    const mapped = mapSubmissionError(res, err);
    if (mapped) return mapped;
    logger.error({ err }, '重新答题失败');
    // ★W1-r2（t4）：500 一律给**固定文案**，内部细节只进上面的日志（不随响应上屏）
    res.status(500).json({ code: 2001, message: FALLBACK_500_MESSAGE, data: null });
  }
};
