/**
 * prompts.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 890-925 · 927-964）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { buildSystemPrompt, buildGradingUserMessage } from '../ai/prompt-builder.js';
import { loadVisibleSubmission, sendScopeError } from './scope.js';

// ===================== AI 提示词查看（教师可见，与实评共用构建函数） =====================

/**
 * GET /api/teacher/questions/:id/prompt-preview — 编程题提示词模板预览（编辑页用）。
 * 展示每个小题的 system + user 模板（不含学生代码，评分时才拼接）。
 */
export const getQuestionPromptPreview = async (req, res) => {
  try {
    const q = await prisma.question.findUnique({
      where: { id: +req.params.id },
      include: { subQuestions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    // t6：提示词模板含参考答案/评分标准，仅题目归属教师可预览（题库/编辑页本身即 owner-only）。
    // 拒绝响应体不含任何题目、答案、评分标准内容
    if (q.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权访问该题目', data: null });

    const subs = (q.subQuestions || []).map(sq => ({
      id: sq.id,
      title: sq.title,
      system: buildSystemPrompt(),
      user: buildGradingUserMessage({
        material: q.material || null,
        subQuestionTitle: sq.title || '',
        scoringCriteria: sq.scoringCriteria || null,   // ★L4：预览与评分同口径
        subQuestionContent: sq.content || '',
        referenceAnswer: sq.referenceAnswer || '',
        studentAnswer: '【学生提交的答案将在此拼接】',
        maxScore: sq.score || 100,
      }),
    }));
    res.json({ code: 0, message: 'ok', data: { type: 'code', subs } });
  } catch (err) {
    logger.error({ err }, '获取提示词模板失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/**
 * GET /api/teacher/review/:submissionId/prompt — 该次评分的实际提示词（审核页用，含学生答案）。
 */
export const getSubmissionPrompt = async (req, res) => {
  try {
    // t4：提示词含学生答案与参考答案，同属「按 id 直取」的详情类入口 → 先过归属校验
    const guard = await loadVisibleSubmission(req.user.id, +req.params.id);
    if (!guard.ok) return sendScopeError(res, guard);

    const sub = await prisma.submission.findUnique({
      where: { id: +req.params.id },
      include: {
        question: { include: { subQuestions: true } },
        subQuestion: true,
      },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });
    // 仅编程题（code）提交可查该提示词；project 提交走 /project/prompt，此处对称返回 400
    if (sub.question?.type && sub.question.type !== 'code') {
      return res.status(400).json({ code: 1001, message: '该提交不是编程题', data: null });
    }

    const sq = sub.subQuestion || sub.question?.subQuestions?.[0] || {};
    const system = buildSystemPrompt();
    const user = buildGradingUserMessage({
      material: sub.question?.material || null,
      subQuestionTitle: sq.title || '',
      scoringCriteria: sq.scoringCriteria || null,   // ★L4：预览与评分同口径（此前漏传 ⇒ 预览会静默回落 DEFAULT_CRITERIA）
      subQuestionContent: sq.content || '',
      referenceAnswer: sq.referenceAnswer || '',
      studentAnswer: sub.answer || '',
      maxScore: sq.score || 100,
    });
    res.json({ code: 0, message: 'ok', data: { type: 'code', system, user } });
  } catch (err) {
    logger.error({ err }, '获取提交提示词失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
