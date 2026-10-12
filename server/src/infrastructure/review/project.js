/**
 * project.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 763-780 · 782-841 · 843-888）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import fs from 'fs';
import path from 'path';
import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { parseProjectAnswer, toTeacherView } from '../../utils/projectView.js';
import { submissionDir, standardDir, ROOT } from '../../utils/projectPaths.js';
import { readProjectTree } from '../../utils/projectFiles.js';
import { isStudentVisibleToTeacher } from './scope.js';
import { loadAssignmentSnapshot, resolveSnapshot } from '../../services/assignmentSnapshot.js';

// ===================== 实训题（体系C）教师审核 =====================

/**
 * 读取标准答案文件树：优先 project-standards/{questionId}，
 * 兼容历史上传（question.attachmentUrl）。
 */
async function readStandardTree(question) {
  const newDir = standardDir(question.id);
  if (fs.existsSync(newDir)) {
    const t = readProjectTree(newDir);
    if (t.tree.length || Object.keys(t.contents).length) return t;
  }
  if (question.attachmentUrl) {
    const legacyDir = path.join(ROOT, 'uploads', question.attachmentUrl);
    if (fs.existsSync(legacyDir)) return readProjectTree(legacyDir);
  }
  return { tree: [], contents: {} };
}

/**
 * GET /teacher/submissions/:id/project
 *
 * 教师查看实训题提交详情：双栏所需数据（标准答案 + 学生提交 + AI 结果）。
 * 仅面向教师，含 AI 原始评语（R3 不约束教师端）。
 */
export const getProjectReview = async (req, res) => {
  try {
    const id = +req.params.id;
    const sub = await prisma.submission.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, username: true, realName: true } },
        question: { select: { id: true, title: true, material: true, scoringRubric: true, maxScore: true, attachmentUrl: true, type: true } },
        assignment: { select: { id: true, title: true, teacherId: true } },
      },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });
    if (sub.question.type !== 'project') return res.status(400).json({ code: 1001, message: '非实训题提交', data: null });

    // W2（R2-B2）：教师复核视图与评分同源（snapshot ?? live）
    const std = resolveSnapshot(await loadAssignmentSnapshot(prisma, sub.assignmentId, sub.questionId), sub.question);
    // R6：仅作业所属教师可查看实训提交（作业/班级/学校归属校验）
    if (sub.assignment.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    // t4：再收敛到该教师的可见班级范围（与其它按 id 直取的入口一致）
    if (!(await isStudentVisibleToTeacher(req.user.id, sub.studentId))) {
      return res.status(403).json({ code: 1003, message: '无权访问该提交', data: null });
    }

    const env = parseProjectAnswer(sub.answer);
    const version = env.currentVersion;

    const studentFiles = version ? readProjectTree(submissionDir(sub.questionId, sub.studentId, version)) : { tree: [], contents: {} };
    const standardFiles = await readStandardTree(sub.question);

    let aiResult = null;
    if (sub.aiFeedback) {
      try {
        aiResult = JSON.parse(sub.aiFeedback);
      } catch {
        aiResult = { overallComment: sub.aiFeedback };
      }
    }

    res.json({
      code: 0,
      message: 'ok',
      data: {
        submission: toTeacherView(sub),
        question: sub.question,
        assignment: sub.assignment,
        student: sub.student,
        version,
        studentFiles,
        standardFiles,
        aiResult,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取实训题审核详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/**
 * PUT /teacher/submissions/:id/project/review
 *
 * 教师审核通过实训题提交。R3：教师必须显式提供评语（teacherFeedback），
 * 绝不回退到 AI 评语。审核后状态置 reviewed → 学生可见分数（D3）。
 */
export const reviewProjectSubmission = async (req, res) => {
  try {
    const id = +req.params.id;
    const { finalScore, teacherFeedback } = req.body;

    const sub = await prisma.submission.findUnique({
      where: { id },
      include: {
        question: { select: { type: true, maxScore: true } },
        assignment: { select: { teacherId: true } },
      },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });
    if (sub.question.type !== 'project') return res.status(400).json({ code: 1001, message: '非实训题提交', data: null });
    // R6：仅作业所属教师可审核实训提交
    if (sub.assignment.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    // t4：越权校验前置——不可见班级的提交一律 403，且不产生任何写入
    if (!(await isStudentVisibleToTeacher(req.user.id, sub.studentId))) {
      return res.status(403).json({ code: 1003, message: '无权访问该提交', data: null });
    }

    const data = { status: 'reviewed', reviewedAt: new Date() };
    if (finalScore !== undefined) {
      const max = sub.question.maxScore || 100;
      data.finalScore = Math.max(0, Math.min(max, Number(finalScore)));
    }
    // R3：教师评语以显式传入为准；未传则保留已有（初始为空），绝不取 AI 评语
    data.teacherFeedback = teacherFeedback !== undefined ? String(teacherFeedback || '') : (sub.teacherFeedback || '');

    const updated = await prisma.submission.update({ where: { id }, data });
    res.json({
      code: 0,
      message: '审核成功',
      data: { id, status: updated.status, finalScore: updated.finalScore, teacherFeedback: updated.teacherFeedback },
    });
  } catch (err) {
    logger.error({ err }, '实训题审核失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
