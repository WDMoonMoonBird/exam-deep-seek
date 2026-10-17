/**
 * infrastructure/dsh/runs/read-model/display-meta.js —— **列表元信息补齐 / 详情逐份兜底**（B3 纯搬运：从 read-model.js 原样搬出）。
 *
 * ★只读：元信息批量 SELECT；逐份兜底只取 id/分数/学生名（绝不取 answer），不改分。
 */
import defaultPrisma from '../../../../utils/prisma.js';
import defaultLogger from '../../../../utils/logger.js';
import { isAutoBuildChecker } from '../../worker/autoBuild.js';

/** 列表行补齐：作业标题 / 老师 / 班级（批量 3~4 条查询；失败降级 null，不 500） */
export async function attachAssignmentDisplayMeta({ items = [], prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
  const ids = [...new Set(items.map((x) => Number(x && x.assignment_id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return;
  try {
    const assignments = await prismaClient.assignment.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, teacherId: true } });
    const teacherIds = [...new Set((assignments || []).map((a) => Number(a.teacherId)).filter((n) => Number.isFinite(n)))];
    const teachers = teacherIds.length
      ? await prismaClient.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, username: true, realName: true } })
      : [];
    const links = await prismaClient.assignmentClass.findMany({ where: { assignmentId: { in: ids } }, select: { assignmentId: true, classId: true } });
    const classIds = [...new Set((links || []).map((l) => Number(l.classId)).filter((n) => Number.isFinite(n)))];
    const classes = classIds.length ? await prismaClient.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }) : [];
    const aById = new Map((assignments || []).map((a) => [Number(a.id), a]));
    const tById = new Map((teachers || []).map((t) => [Number(t.id), t]));
    const cById = new Map((classes || []).map((c) => [Number(c.id), c]));
    const classesByAssignment = new Map();
    for (const l of links || []) {
      const aid = Number(l.assignmentId);
      if (!classesByAssignment.has(aid)) classesByAssignment.set(aid, []);
      const c = cById.get(Number(l.classId));
      if (c) classesByAssignment.get(aid).push({ id: c.id, name: c.name || ('class-' + c.id) });
    }
    for (const item of items) {
      const a = aById.get(Number(item.assignment_id));
      if (!a) continue;
      const t = tById.get(Number(a.teacherId));
      item.assignment_title = item.assignment_title || a.title || null;
      item.teacher_id = a.teacherId === null || a.teacherId === undefined ? null : Number(a.teacherId);
      item.teacher_name = t ? (t.realName || t.username || ('user-' + t.id)) : null;
      item.classes = classesByAssignment.get(Number(item.assignment_id)) || [];
      item.class_count = item.classes.length;
    }
  } catch (err) {
    log.warn({ err: String((err && err.message) || err).slice(0, 120) }, 'D2：列表元信息（老师/班级）读取失败（降级 null，不 500）');
  }
}

/**
 * 详情逐份结果兜底：归档里的 evidence-summary.json 不存在（旧运行/归档被清理）时，从 DB 取「该作业 + 该 checker 已写分」的提交。
 * ★只取 id/分数/学生名；**绝不取 answer 字段**（不泄露答题全文），也不改任何分数。
 */
export async function loadSubmissionsByChecker({ prisma: prismaClient = defaultPrisma, assignmentId, checkerId, limit = 200 } = {}) {
  if (!assignmentId || !checkerId || isAutoBuildChecker(checkerId)) return null;
  try {
    const rows = await prismaClient.submission.findMany({
      where: { assignmentId: Number(assignmentId), checkerId: String(checkerId), aiScore: { not: null } },
      select: { id: true, aiScore: true, student: { select: { realName: true, username: true } } },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return (rows || []).map((s) => ({
      slug: (s.student && (s.student.realName || s.student.username)) || ('submission-' + s.id),
      score: s.aiScore === null || s.aiScore === undefined ? null : Number(s.aiScore),
      hits: null,
      reason: '存量记录（无逐份产物；分数来自数据库，不含答题全文）',
      student: (s.student && (s.student.realName || s.student.username)) || null,
    }));
  } catch { return null; }
}
