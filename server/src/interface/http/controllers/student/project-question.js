/**
 * student/project-question.js —— 实训题的归属校验与详情（R2-B65：从 controllers/studentController.js 原样拆出）。
 *
 * 含 assertStudentInAssignment（作业归属校验）、findProjectQuestionInAssignment（题目 + 快照优先）、
 * GET /student/assignments/:assignmentId/project/:questionId。
 * 错误码 1001/1003/1004 与状态码 403/404 逐字不变。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { resolveSnapshot } from '../../../../services/assignmentSnapshot.js';
import { toStudentView, parseProjectAnswer } from '../../../../domain/services/project-view.js';
import { readVersionFiles } from './version-files.js';

/**
 * 校验学生是否属于该作业所覆盖的班级，并返回作业记录。
 *
 * 防止学生通过篡改 URL 里的 assignmentId 访问不属于自己的作业。
 *
 * @param {number} assignmentId 作业 ID
 * @param {number} studentId 学生 ID
 * @returns {Promise<{ok: true, assignment: object}|{ok: false, code: number, message: string}>} 校验结果
 */
export async function assertStudentInAssignment(assignmentId, studentId) {
  if (!Number.isInteger(assignmentId) || assignmentId < 1) {
    return { ok: false, code: 1001, message: '作业参数非法' };
  }

  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId },
    // R3-D7（t14）：一并取计分口径 —— 学生视图的「计入分」与学生其它路径同口径（best⇒bestScore / last⇒最新 aiScore）
    select: { id: true, title: true, locked: true, mode: true, startTime: true, endTime: true, allowResubmit: true, maxAttempts: true, scorePolicy: true },
  });
  if (!assignment) return { ok: false, code: 1004, message: '作业不存在' };
  if (assignment.locked) return { ok: false, code: 1003, message: '作业已被锁定' };

  // 学生必须在该作业所投放的某个班级内
  const classIds = (await prisma.studentClass.findMany({
    where: { studentId },
    select: { classId: true },
  })).map((c) => c.classId);

  if (classIds.length === 0) {
    return { ok: false, code: 1003, message: '无权访问该作业' };
  }

  const linked = await prisma.assignmentClass.findFirst({
    where: { assignmentId, classId: { in: classIds } },
    select: { assignmentId: true },
  });
  if (!linked) return { ok: false, code: 1003, message: '无权访问该作业' };

  return { ok: true, assignment };
}

/**
 * 校验题目属于该作业且为实训题。
 *
 * @param {number} assignmentId 作业 ID
 * @param {number} questionId 题目 ID
 * @returns {Promise<object|null>} 题目记录，不匹配时返回 null
 */
export async function findProjectQuestionInAssignment(assignmentId, questionId) {
  if (!Number.isInteger(questionId) || questionId < 1) return null;

  const link = await prisma.assignmentQuestion.findFirst({
    where: { assignmentId, questionId },
    // W2（R2-B2）：一并取快照列 —— 学生看到的评分标准必须与评分链路一致（snapshot ?? live）
    select: { assignmentId: true, rubricSnapshot: true, materialSnapshot: true, standardHash: true, snapshotOrigin: true },
  });
  if (!link) return null;

  // 只取展示所需字段。绝不 include subQuestions（内含 referenceAnswer 标准答案）
  const q = await prisma.question.findFirst({
    where: { id: questionId, type: 'project', deletedAt: null },
    select: {
      id: true,
      title: true,
      difficulty: true,
      maxScore: true,
      material: true,
      scoringRubric: true,
      type: true,
    },
  });
  if (!q) return null;
  const std = resolveSnapshot(link, q);
  return { ...q, material: std.material, scoringRubric: std.rubric };
}

/**
 * GET /student/assignments/:assignmentId/project/:questionId
 *
 * 学生查看实训题：返回题面 + 本人最新提交（经 toStudentView 脱敏）+ 文件树。
 */
export const getProjectQuestion = async (req, res) => {
  try {
    const assignmentId = +req.params.assignmentId;
    const questionId = +req.params.questionId;
    const studentId = req.user.id;

    const guard = await assertStudentInAssignment(assignmentId, studentId);
    if (!guard.ok) {
      return res.status(guard.code === 1004 ? 404 : 403)
        .json({ code: guard.code, message: guard.message, data: null });
    }

    const question = await findProjectQuestionInAssignment(assignmentId, questionId);
    if (!question) {
      return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    }

    // 该生在本作业本题下的提交（唯一键保证至多一行）
    const submission = await prisma.submission.findFirst({
      where: { assignmentId, studentId, questionId, subQuestionId: null },
    });

    let files = null;
    let studentView = null;

    if (submission) {
      // R2/R3/R4/R6：所有对外字段一律经 toStudentView 白名单裁剪
      // R3-D7（F1）：传入作业计分口径 ⇒ published 时下发「计入分」，与作业详情/列表/成绩页一致
      studentView = toStudentView(submission, question, guard.assignment.scorePolicy);

      const envelope = parseProjectAnswer(submission.answer);
      if (submission.status !== 'draft' && envelope.currentVersion > 0) {
        files = readVersionFiles(questionId, studentId, envelope.currentVersion);
      }
    }

    res.json({
      code: 0,
      message: 'ok',
      data: {
        question: {
          id: question.id,
          title: question.title,
          difficulty: question.difficulty,
          maxScore: question.maxScore,
          material: question.material,
          scoringRubric: question.scoringRubric,
        },
        submission: studentView,
        files,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取实训题失败');
    res.status(500).json({ code: 2001, message: '服务器错误: ' + (err.message || '未知'), data: null });
  }
};
