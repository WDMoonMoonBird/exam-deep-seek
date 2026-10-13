/**
 * batch.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 114-143 · 318-372 · 374-420 · 422-444）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { getVisibleClassIds } from '../../../../controllers/teamController.js';

/**
 * 批量归属校验（供 submissionIds 批量端点使用）：两次查询完成全量判定，不随批量大小线性放大。
 *
 * @param {number} teacherId 教师 ID
 * @param {number[]} ids 待校验提交 id（已去重）
 * @param {number|null} [schoolId] 可选学校 ID
 * @returns {Promise<number[]>} 不在可见范围内的 id（含不存在与非法 id），供整批拒绝时回执
 */
async function filterRejectedSubmissionIds(teacherId, ids, schoolId = null) {
  const rejected = ids.filter((id) => !Number.isInteger(id) || id <= 0);
  const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (!validIds.length) return rejected;

  const rows = await prisma.submission.findMany({ where: { id: { in: validIds } }, select: { id: true, studentId: true } });
  const studentBySubmission = new Map(rows.map((r) => [r.id, r.studentId]));
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const visibleClassIds = await getVisibleClassIds(teacherId, schoolId ? +schoolId : null);
  const linked = (studentIds.length && visibleClassIds.length)
    ? await prisma.studentClass.findMany({
        where: { studentId: { in: studentIds }, classId: { in: visibleClassIds } },
        select: { studentId: true },
      })
    : [];
  const visibleStudentIds = new Set(linked.map((l) => l.studentId));

  for (const id of validIds) {
    if (!studentBySubmission.has(id) || !visibleStudentIds.has(studentBySubmission.get(id))) rejected.push(id);
  }
  return rejected;
}

export const batchReview = async (req, res) => {
  try {
    const { schoolId, classId, assignmentId } = req.body;
    // t4：schoolId/classId 均需有效且班级在可见范围内 —— 否则整批拒绝，不产生任何写入
    const sid = +schoolId;
    if (!schoolId || !Number.isInteger(sid) || sid <= 0) return res.status(400).json({ code: 1001, message: '请选择学校', data: null });
    const visibleClassIds = await getVisibleClassIds(req.user.id, sid);
    const cid = +classId;
    if (!Number.isInteger(cid) || !visibleClassIds.includes(cid)) {
      return res.status(403).json({ code: 1003, message: '无权操作该班级', data: null });
    }

    const classStudents = await prisma.studentClass.findMany({ where: { classId: cid }, select: { studentId: true } });
    const studentIds = classStudents.map(cs => cs.studentId);

    const subs = await prisma.submission.findMany({
      where: { assignmentId: +assignmentId, studentId: { in: studentIds } },
      select: { id: true, studentId: true, status: true, aiScore: true, aiFeedback: true, teacherFeedback: true, question: { select: { type: true } } },
    });
    const studentSubs = new Map();
    for (const s of subs) {
      if (!studentSubs.has(s.studentId)) studentSubs.set(s.studentId, []);
      studentSubs.get(s.studentId).push(s);
    }
    const toReview = [];
    const reviewedStudentIds = new Set();
    for (const [sid, ss] of studentSubs) {
      if (ss.some(s => s.status === 'submitted')) continue;
      if (ss.some(s => s.status === 'ai_graded')) {
        toReview.push(...ss);
        reviewedStudentIds.add(sid);
      }
    }
    if (toReview.length) {
      // t4：归属校验已在前置全量完成 → 批量写入放同一事务，杜绝「写一半」留下部分生效
      await prisma.$transaction(toReview.map((s) => {
        const isProject = s.question?.type === 'project';
        return prisma.submission.update({
          where: { id: s.id },
          // R3：实训题不把 AI 评语当作教师评语透传给学生
          data: { status: 'reviewed', reviewedAt: new Date(), finalScore: s.aiScore, teacherFeedback: isProject ? (s.teacherFeedback || '') : (s.aiFeedback || '') },
        });
      }));
    }
    res.json({ code: 0, message: `已审核 ${reviewedStudentIds.size} 名学生`, data: { count: reviewedStudentIds.size } });
  } catch (err) {
    logger.error({ err }, '批量审核失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const batchPublish = async (req, res) => {
  try {
    const { schoolId, classId, assignmentId } = req.body;
    // t4：schoolId/classId 均需有效且班级在可见范围内 —— 否则整批拒绝，不产生任何写入
    const sid = +schoolId;
    if (!schoolId || !Number.isInteger(sid) || sid <= 0) return res.status(400).json({ code: 1001, message: '请选择学校', data: null });
    const visibleClassIds = await getVisibleClassIds(req.user.id, sid);
    const cid = +classId;
    if (!Number.isInteger(cid) || !visibleClassIds.includes(cid)) {
      return res.status(403).json({ code: 1003, message: '无权操作该班级', data: null });
    }

    const classStudents = await prisma.studentClass.findMany({ where: { classId: cid }, select: { studentId: true } });
    const studentIds = classStudents.map(cs => cs.studentId);

    const subs = await prisma.submission.findMany({
      where: { assignmentId: +assignmentId, studentId: { in: studentIds } },
      select: { id: true, studentId: true, status: true },
    });
    const studentSubs = new Map();
    for (const s of subs) {
      if (!studentSubs.has(s.studentId)) studentSubs.set(s.studentId, []);
      studentSubs.get(s.studentId).push(s);
    }
    const toPublishIds = [];
    const publishedStudentIds = new Set();
    for (const [sid, ss] of studentSubs) {
      if (ss.every(s => s.status === 'reviewed')) {
        toPublishIds.push(...ss.map(s => s.id));
        publishedStudentIds.add(sid);
      }
    }
    if (toPublishIds.length) {
      await prisma.submission.updateMany({
        where: { id: { in: toPublishIds } },
        data: { status: 'published' },
      });
    }
    res.json({ code: 0, message: `已发布 ${publishedStudentIds.size} 名学生`, data: { count: publishedStudentIds.size } });
  } catch (err) {
    logger.error({ err }, '批量发布失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const publishScores = async (req, res) => {
  try {
    const { submissionIds } = req.body;
    if (!submissionIds?.length) return res.status(400).json({ code: 1001, message: '请选择提交', data: null });
    const ids = [...new Set(submissionIds.map(Number))];

    // t4：整批先全量校验，再执行——任何一条不可见/非法 → 整批拒绝（已可见的也不生效，原子性）
    const rejectedIds = await filterRejectedSubmissionIds(req.user.id, ids);
    if (rejectedIds.length) {
      return res.status(403).json({ code: 1003, message: '部分提交不在可见范围内，已整批拒绝', data: { rejectedIds } });
    }

    // 全部可见 → 单条 updateMany 原子执行（status 过滤保持既有语义：只发布 reviewed）
    await prisma.submission.updateMany({
      where: { id: { in: ids }, status: 'reviewed' },
      data: { status: 'published' },
    });
    res.json({ code: 0, message: '发布成功', data: null });
  } catch (err) {
    logger.error({ err }, '发布成绩失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
