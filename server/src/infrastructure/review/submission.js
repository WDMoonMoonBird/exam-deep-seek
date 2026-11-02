/**
 * submission.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 223-264 · 266-281 · 283-301 · 303-316）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { loadVisibleSubmission, sendScopeError } from './scope.js';
import { DomainError } from '../../domain/errors.js';
import { toDisplayStudentNo } from '../../utils/studentNo.js';

/**
 * R3-D5（G2）：领域校验错误（如分值非法 INVALID_SCORE）映射为 **400 + 可读文案**，
 * 不再落到 500「服务器内部错误」；错误码沿用既有 1001（参数/业务校验失败）。
 */
function sendDomainError(res, err) {
  if (!(err instanceof DomainError)) return false;
  const status = err.code === 'LOCKED' ? 403 : 400;
  res.status(status).json({ code: status === 403 ? 1003 : 1001, message: err.message, data: null });
  return true;
}

export const getSubmissionDetail = async (req, res) => {
  try {
    // t4：归属校验前置——教师只能看自己可见班级学生的提交，拒绝响应不含任何题目/答案内容
    const guard = await loadVisibleSubmission(req.user.id, +req.params.id);
    if (!guard.ok) return sendScopeError(res, guard);

    const s = await prisma.submission.findUnique({
      where: { id: +req.params.id },
      include: {
        student: { select: { id: true, username: true, realName: true } },
        question: { include: { subQuestions: { orderBy: { sortOrder: 'asc' } } } },
        subQuestion: true,
        assignment: { select: { id: true, title: true, mode: true } },
      },
    });
    if (!s) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });

    const allSubs = await prisma.submission.findMany({
      where: {
        assignmentId: s.assignmentId,
        studentId: s.studentId,
        questionId: s.questionId,
      },
      include: { subQuestion: true },
    });

    // 查学生所在学校
    let schoolName = '';
    if (s.studentId) {
      const sc = await prisma.studentClass.findFirst({
        where: { studentId: s.studentId },
        include: { class: { include: { school: { select: { name: true } } } } },
      });
      schoolName = sc?.class?.school?.name || '';
    }

    // ★展示投影（教务系统按纯学号匹配）：批改页头部/导出只用纯学号；账号真值
    //   users.username「学号@院校代码」不动，登录/唯一性判定不受影响。只投影响应，不回写库。
    const studentView = s.student
      ? { ...s.student, username: toDisplayStudentNo(s.student.username) }
      : s.student;
    res.json({ code: 0, message: 'ok', data: { ...s, student: studentView, allSubmissions: allSubs, schoolName } });
  } catch (err) {
    logger.error({ err }, '获取提交详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const regradeSubmission = async (req, res) => {
  try {
    // t4：越权校验前置（重评会改分，必须先确认提交在可见范围内）
    const guard = await loadVisibleSubmission(req.user.id, +req.params.id);
    if (!guard.ok) return sendScopeError(res, guard);

    const { aiScore, aiFeedback } = await req.app.locals.reviewUseCases.regrade({ submissionId: +req.params.id });
    res.json({ code: 0, message: '重新评分完成', data: { aiScore, aiFeedback } });
  } catch (err) {
    if (err.name === 'EntityNotFoundError') {
      return res.status(404).json({ code: 1004, message: err.message, data: null });
    }
    logger.error({ err }, '重新评分失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateScore = async (req, res) => {
  try {
    const id = +req.params.id;
    const { finalScore } = req.body;

    // t4：越权校验前置——跨教师改分一律 403，且不产生任何写入
    const guard = await loadVisibleSubmission(req.user.id, id);
    if (!guard.ok) return sendScopeError(res, guard);

    const updated = await req.app.locals.reviewUseCases.manualAdjust({ submissionId: id, finalScore });
    res.json({ code: 0, message: '分数已更新', data: updated });
  } catch (err) {
    if (err.name === 'EntityNotFoundError') {
      return res.status(404).json({ code: 1004, message: err.message, data: null });
    }
    if (sendDomainError(res, err)) return;
    logger.error({ err }, '修改分数失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const reviewSubmission = async (req, res) => {
  try {
    // t4：越权校验前置——跨教师审核一律 403，且不产生任何写入
    const guard = await loadVisibleSubmission(req.user.id, +req.params.id);
    if (!guard.ok) return sendScopeError(res, guard);

    const { finalScore, teacherFeedback } = req.body;
    await req.app.locals.reviewUseCases.review({ submissionId: +req.params.id, finalScore, teacherFeedback });
    res.json({ code: 0, message: '审核成功', data: null });
  } catch (err) {
    if (err.name === 'EntityNotFoundError') {
      return res.status(404).json({ code: 1004, message: err.message, data: null });
    }
    if (sendDomainError(res, err)) return;
    logger.error({ err }, '审核提交失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
