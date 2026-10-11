/**
 * guards.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 13-67）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import { getVisibleClassIds, getMyTeamIds } from '../../../../controllers/teamController.js';

/** 获取教师当前学校ID（从 query 参数） */
function getSchoolId(req) { return req.query.schoolId ? +req.query.schoolId : null; }

/**
 * 资源归属守卫（round 5 · 安全项 S-2）：写操作前校验目标班级是否落在教师的可见班级内。
 *
 * 语义来源与本文件读端点完全一致（getAllClasses:790 / getMyStudents:933 同款调用形态）：
 * getVisibleClassIds = 直连班级 ∪ 团队班级（teamController.js:146-166）；schoolId 为空时
 * 沿用其「不做学校过滤」的既有行为。403 契约与 lockAssignment:738 对齐。
 *
 * ⚠️ 调用方必须在**任何写库动作之前**调用本函数；未命中时立即 return —— 保证零写入。
 */
async function canTeacherManageClass(teacherId, classId, schoolId) {
  const visibleIds = await getVisibleClassIds(teacherId, schoolId);
  return visibleIds.includes(+classId);
}

/** 同上，目标为学生：学生必须属于教师可见的某个班级（班级来源同 assertStudentInAssignment 的口径）。 */
async function canTeacherManageStudent(teacherId, studentId, schoolId) {
  const visibleIds = await getVisibleClassIds(teacherId, schoolId);
  if (visibleIds.length === 0) return false;
  const link = await prisma.studentClass.findFirst({
    where: { studentId: +studentId, classId: { in: visibleIds } },
    select: { classId: true },
  });
  return !!link;
}

/**
 * 资源归属守卫（round 6 · body 目标资源）：目标班级**集合**必须全部落在教师可见班级内。
 *
 * 与 canTeacherManageClass 同源（getVisibleClassIds = 直连 ∪ 团队）；空集合 = 无目标资源 ⇒ 放行
 * （例如 updateClass 的 teamIds:[] 表示「清空团队关联」，不引入任何他人资源）。
 */
async function canTeacherManageClasses(teacherId, classIds, schoolId) {
  if (!classIds?.length) return true;
  const visibleIds = await getVisibleClassIds(teacherId, schoolId);
  return classIds.every(cid => visibleIds.includes(+cid));
}

/** 同上，目标为团队集合：teamIds 必须 ⊆ 本人所属团队（teamController.getMyTeamIds）。 */
async function canTeacherManageTeams(teacherId, teamIds) {
  if (!teamIds?.length) return true;
  const myTeamIds = await getMyTeamIds(teacherId);
  return teamIds.every(tid => myTeamIds.includes(+tid));
}

/** 教师是否属于该学校（schoolId 来自 query 的建资源类写端点用；判据同 switchClassSchool:922）。 */
async function isTeacherInSchool(teacherId, schoolId) {
  const link = await prisma.teacherSchool.findFirst({
    where: { teacherId, schoolId: +schoolId },
    select: { schoolId: true },
  });
  return !!link;
}

export { getSchoolId, canTeacherManageClass, canTeacherManageStudent, canTeacherManageClasses, canTeacherManageTeams, isTeacherInSchool };
