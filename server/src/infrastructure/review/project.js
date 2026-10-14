/**
 * project.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 763-780 · 782-841 · 843-888）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import fs from 'fs';
import path from 'path';
import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { parseProjectAnswer, toTeacherView } from '../../domain/services/project-view.js';
import { submissionDir, standardDir, ROOT } from '../../utils/projectPaths.js';
import { readProjectTree } from '../storage/project-files.js';
import { isStudentVisibleToTeacher } from './scope.js';
import { loadAssignmentSnapshot, resolveSnapshot } from '../../services/assignmentSnapshot.js';
import { reviewProjectSubmissionCore } from './project-review-ops.js';

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

    // W2（R2-B2）：教师复核视图与评分同源（snapshot ?? live）—— 与评分链路（projectGrading.js:203-205）
    //   及同族入口（projectReviewController.js:107/144-145）同一口径：已发布作业读快照，无快照的历史作业回落活值。
    const std = resolveSnapshot(await loadAssignmentSnapshot(prisma, sub.assignmentId, sub.questionId), sub.question);
    // R3-D5（④）：可见性口径与其它按 id 直取的教师端入口统一为「教师可见班级」
    //（直连班级 ∪ 团队班级）—— 原先额外的「仅作业所属教师」判定比可见班级更严（同团队教师被 403），已移除；
    //   越权教师（不可见班级/跨校）仍在此 403，且不返回任何提交内容。
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
        // W2（R2-B2）：显示与评分同源 —— material/scoringRubric 取快照值（无快照自动回落活值），
        //   其余字段仍透传题目行；standardFiles 仍按 attachmentUrl 读取（快照只冻结 rubric/material/哈希）。
        question: { ...sub.question, material: std.material, scoringRubric: std.rubric },
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
    const { finalScore, teacherFeedback } = req.body;
    // 行为全部下沉到 project-review-ops（教师端与管理员端同一实现）：
    //   可见性=教师可见班级（越权 403 零写入）· G2 非法分值 400 可读文案 · G3 published 保持 published
    const r = await reviewProjectSubmissionCore({
      submissionId: +req.params.id, finalScore, teacherFeedback, actorId: req.user.id,
    });
    res.status(r.status).json(r.body);
  } catch (err) {
    logger.error({ err }, '实训题审核失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
