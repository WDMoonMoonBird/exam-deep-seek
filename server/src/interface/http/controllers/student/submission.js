/**
 * student/submission.js —— 提交/草稿/重答（R2-B65：从 controllers/studentController.js 原样拆出）。
 *
 * 走 app.locals.submissionUseCases（组合根注入），错误映射复用 view.js 的 mapSubmissionError（状态码/错误码不变）。
 */

import logger from '../../../../utils/logger.js';
import { mapSubmissionError } from './view.js';

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
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
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
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
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
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};
