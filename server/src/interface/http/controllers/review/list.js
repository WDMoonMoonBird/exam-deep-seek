/**
 * list.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 13-37 · 39-52 · 170-196 · 198-221）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { getVisibleClassIds } from '../../../../controllers/teamController.js';
import { resolveVisibleClassScope } from './class-scope.js';

/**
 * 根据教师可见范围 + 学校/班级/题目构建筛选条件。
 *
 * 越权防线（本函数是 /teacher/submissions 的唯一入口）：
 * 起点不再是 {}——即使不传 schoolId/classId，也必须收敛到「该教师可见班级」的学生，
 * 绝不返回全库提交。classId / questionId / assignmentId / status 仅在可见范围内做附加筛选；
 * 传入不可见（或不存在）的 classId 时收敛为空集，而不是放行。
 */
async function buildFilter({ teacherId, schoolId, classId, questionId, assignmentId, status }) {
  const where = {};
  if (status) where.status = status.includes(',') ? { in: status.split(',') } : status;
  if (questionId) where.questionId = +questionId;
  if (assignmentId) where.assignmentId = +assignmentId;

  const visibleClassIds = await getVisibleClassIds(teacherId, schoolId ? +schoolId : null);
  const scopeClassIds = classId ? visibleClassIds.filter((id) => id === +classId) : visibleClassIds;
  const studentIds = scopeClassIds.length
    ? (await prisma.studentClass.findMany({
        where: { classId: { in: scopeClassIds } },
        select: { studentId: true },
      })).map((s) => s.studentId)
    : [];
  where.studentId = { in: [...new Set(studentIds)] };
  return where;
}

/** 查学生及所在学校 */
async function enrichWithSchool(list) {
  const studentIds = [...new Set(list.map(s => s.student?.id).filter(Boolean))];
  if (!studentIds.length) return list;
  const scs = await prisma.studentClass.findMany({
    where: { studentId: { in: studentIds } },
    include: { class: { include: { school: { select: { id: true, name: true } } } } },
  });
  const map = {};
  for (const sc of scs) {
    if (!map[sc.studentId]) map[sc.studentId] = sc.class?.school?.name;
  }
  return list.map(s => ({ ...s, schoolName: map[s.student?.id] || '' }));
}

export const getSubmissions = async (req, res) => {
  try {
    const { schoolId, classId, questionId, status, page = 1, pageSize = 20 } = req.query;
    const where = await buildFilter({ teacherId: req.user.id, schoolId, classId, questionId, status });

    const [list, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        select: {
          id: true, status: true, aiScore: true, finalScore: true, submittedAt: true,
          student: { select: { id: true, username: true, realName: true } },
          question: { select: { id: true, title: true, maxScore: true } },
          assignment: { select: { id: true, title: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      prisma.submission.count({ where }),
    ]);
    const enriched = await enrichWithSchool(list);
    res.json({ code: 0, message: 'ok', data: { list: enriched, total, page: +page, pageSize: +pageSize } });
  } catch (err) {
    logger.error({ err }, '获取提交列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getReviewQuestions = async (req, res) => {
  try {
    // t6：旧实现不传 classId 时 where={} → 全局返回（实测含跨校教师 B 的题目）。
    // 现统一收敛到「教师可见班级」；显式传入不可见 classId → 403（fail-closed，见交付说明）。
    const scope = await resolveVisibleClassScope(req.user.id, { schoolId: req.query.schoolId, classId: req.query.classId });
    if (!scope.ok) return res.status(403).json({ code: 1003, message: '无权访问该班级', data: null });

    const studentIds = scope.classIds.length
      ? (await prisma.studentClass.findMany({ where: { classId: { in: scope.classIds } }, select: { studentId: true } })).map(s => s.studentId)
      : [];
    if (!studentIds.length) return res.json({ code: 0, message: 'ok', data: [] });

    const subs = await prisma.submission.findMany({
      where: { studentId: { in: [...new Set(studentIds)] }, status: { not: 'draft' } },
      select: { question: { select: { id: true, title: true } } },
      distinct: ['questionId'],
      orderBy: { questionId: 'asc' },
    });
    res.json({ code: 0, message: 'ok', data: subs.map(s => s.question) });
  } catch (err) {
    logger.error({ err }, '获取可审题目失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
