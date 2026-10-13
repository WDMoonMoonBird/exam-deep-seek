/**
 * summary.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 446-516 · 518-606）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { ABNORMAL_FEEDBACK } from '../../../../constants.js';
import { getVisibleClassIds } from '../../../../controllers/teamController.js';
import { resolveVisibleClassScope } from './class-scope.js';

export const getReviewSummary = async (req, res) => {
  try {
    // R5：非法 schoolId（如 abc / 0 / 小数）与 pending-summary 一致 fail-closed → 空数组（不越权、不 500）
    const schoolId = req.query.schoolId ? +req.query.schoolId : null;
    if (!Number.isInteger(schoolId) || schoolId <= 0) return res.json({ code: 0, data: [] });

    const { classId } = req.query;
    const visibleIds = await getVisibleClassIds(req.user.id, schoolId);
    // R16：classId 必须与可见集合求交（旧实现 classWhere.id = +classId 直接覆盖了 id:{in:visibleIds}，
    // 传同校但不可见的 classId 仍能读到该班汇总行）→ 不可见/非法 classId 收敛为空集
    const scopeClassIds = classId ? visibleIds.filter((id) => id === +classId) : visibleIds;
    const classWhere = { schoolId, id: { in: scopeClassIds } };

    const classes = await prisma.class.findMany({
      where: classWhere,
      include: {
        assignmentClasses: { include: { assignment: { select: { id: true, title: true, startTime: true, endTime: true, mode: true, locked: true, deletedAt: true, _count: { select: { assignmentQuestions: true } } } } } },
        studentClasses: true,
      },
      orderBy: { name: 'asc' },
    });

    const rows = [];
    for (const c of classes) {
      const studentIds = c.studentClasses.map(sc => sc.studentId);
      for (const ac of c.assignmentClasses) {
        const a = ac.assignment;
        if (a.deletedAt) continue;
        const totalStudents = c.studentClasses.length;
        const subs = await prisma.submission.findMany({
          where: { assignmentId: a.id, studentId: { in: studentIds } },
          select: { studentId: true, status: true, aiFeedback: true },
        });
        const studentSubMap = new Map();
        for (const s of subs) {
          if (s.status === 'draft') continue; // draft 不算已交
          if (!studentSubMap.has(s.studentId)) studentSubMap.set(s.studentId, []);
          studentSubMap.get(s.studentId).push({ status: s.status, feedback: s.aiFeedback });
        }
        const submittedStudents = studentSubMap.size;
        let aiPending = 0;
        let reviewPending = 0;
        let abnormal = 0;
        for (const [, items] of studentSubMap) {
          if (items.some(i => i.status === 'submitted')) aiPending++;
          else if (items.some(i => i.feedback === ABNORMAL_FEEDBACK)) abnormal++;
          else if (items.some(i => i.status === 'ai_graded')) reviewPending++;
        }
        // R3-D4（US-B5）：不再有「练习模式行无需审核」特判 —— 未发布一律对学生不可见，
        // 所有作业都必须经教师审核/发布，故 reviewPending 按实际 rollup 计数、aiCompleted 恒 0。
        const allAiDone = submittedStudents > 0 && aiPending === 0;
        const allReviewed = submittedStudents > 0 && aiPending === 0 && reviewPending === 0 && abnormal === 0;
        rows.push({
          assignmentId: a.id, title: a.title, classId: c.id, className: c.name,
          startTime: a.startTime, endTime: a.endTime,
          mode: a.mode || 'exam', locked: a.locked,
          totalStudents, submittedCount: submittedStudents,
          aiPending, reviewPending, abnormal,
          aiCompleted: 0,   // 保留字段（前端兼容）：新口径下「AI 完成」不再等价于「无需审核」
          _count: { assignmentQuestions: a._count?.assignmentQuestions ?? 0 },
          allAiDone, allReviewed,
        });
      }
    }
    // 最新作业排在最前面
    rows.sort((a, b) => b.assignmentId - a.assignmentId);
    res.json({ code: 0, data: rows });
  } catch (err) {
    logger.error({ err }, '获取审核汇总失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getReviewByClass = async (req, res) => {
  try {
    // t6：花名册越权收敛——classId 必须命中教师可见集合，否则 403 且响应体不含任何姓名/学号/分数
    const scope = await resolveVisibleClassScope(req.user.id, { schoolId: req.query.schoolId, classId: req.params.classId });
    if (!scope.ok) return res.status(403).json({ code: 1003, message: '无权访问该班级', data: null });
    const classId = scope.classIds[0];
    const { assignmentId, keyword, page = 1, pageSize = 20, filter, sortField, sortOrder } = req.query;

    const studentRecords = await prisma.studentClass.findMany({
      where: { classId },
      include: { student: true, class: { include: { school: { select: { name: true } } } } },
      orderBy: { student: { username: 'asc' } },
    });

    let filtered = studentRecords;
    if (keyword) filtered = filtered.filter(sc => sc.student.realName.includes(keyword));

    const submissions = await prisma.submission.findMany({
      where: { assignmentId: +assignmentId, studentId: { in: filtered.map(sc => sc.studentId) } },
      include: {
        question: { select: { title: true, type: true } },
        subQuestion: { select: { id: true, score: true } },
        assignment: { select: { title: true, mode: true } },
      },
    });
    const studentSubsMap = new Map();
    for (const s of submissions) {
      if (!studentSubsMap.has(s.studentId)) studentSubsMap.set(s.studentId, []);
      studentSubsMap.get(s.studentId).push(s);
    }

    const statusOrder = { draft: 0, submitted: 1, ai_graded: 2, reviewed: 3, published: 4 };
    let rows = filtered.map(sc => {
      const subs = studentSubsMap.get(sc.studentId);
      // 过滤掉草稿记录 — draft 不算正式提交
      const realSubs = subs ? subs.filter(s => s.status !== 'draft') : [];
      if (realSubs.length) {
        const aiTotal = realSubs.reduce((sum, s) => sum + (s.aiScore ?? 0), 0);
        const finalTotal = realSubs.reduce((sum, s) => sum + (s.finalScore ?? 0), 0);
        const hasAbnormal = realSubs.some(s => s.aiFeedback === ABNORMAL_FEEDBACK);
        const worstStatus = hasAbnormal ? 'abnormal'
          : realSubs.reduce((worst, s) =>
              (statusOrder[s.status] ?? 0) < (statusOrder[worst] ?? 0) ? s.status : worst, realSubs[0].status);
        // 新实训题流程（Submission.type=project）：透出项目提交 id，供前端跳转三栏审核（R4 成绩门禁在审核后开放）
        const projectSub = realSubs.find(s => s.question?.type === 'project');
        return {
          id: realSubs[0].id, studentId: sc.studentId,
          studentName: sc.student.realName, studentNo: sc.student.username,
          schoolName: sc.class?.school?.name || '',
          className: sc.class?.name || '', assignmentTitle: realSubs[0].assignment?.title || '',
          mode: realSubs[0].assignment?.mode || 'exam',
          aiScore: aiTotal, finalScore: finalTotal > 0 ? finalTotal : null,
          status: worstStatus, submitted: true,
          projectSubmissionId: projectSub ? projectSub.id : null,
        };
      }
      return {
        id: `ns-${sc.studentId}`, studentId: sc.studentId,
        studentName: sc.student.realName, studentNo: sc.student.username,
        schoolName: sc.class?.school?.name || '',
        className: sc.class?.name || '', assignmentTitle: '', mode: 'exam',
        aiScore: null, finalScore: null, status: 'not_submitted', submitted: false,
      };
    });

    if (filter === 'submitted') rows = rows.filter(r => r.submitted);
    else if (filter === 'not_submitted') rows = rows.filter(r => !r.submitted);
    else if (filter === 'pending_review') rows = rows.filter(r => r.status === 'ai_graded');
    else if (filter === 'abnormal') rows = rows.filter(r => r.status === 'abnormal');

    if (sortField && sortOrder) {
      const dir = sortOrder === 'ascend' ? 1 : -1;
      rows.sort((a, b) => {
        const va = a[sortField] != null ? a[sortField] : (typeof b[sortField] === 'string' ? '' : 0);
        const vb = b[sortField] != null ? b[sortField] : (typeof a[sortField] === 'string' ? '' : 0);
        if (typeof va === 'string') return va.localeCompare(vb) * dir;
        return (va - vb) * dir;
      });
    }

    const total = rows.length;
    const start = (+page - 1) * +pageSize;
    const paged = rows.slice(start, start + +pageSize);
    res.json({ code: 0, data: { list: paged, total } });
  } catch (err) {
    logger.error({ err }, '获取班级提交列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
