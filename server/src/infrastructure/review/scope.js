/**
 * scope.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 54-73 · 75-107 · 109-112）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import prisma from '../../utils/prisma.js';
import { getVisibleClassIds } from '../../controllers/teamController.js';

/**
 * 学生是否落在教师可见班级范围内（t4 越权防线的最小判定单元）。
 *
 * 可见集合来自 getVisibleClassIds(teacherId, schoolId)：schoolId 传入时收窄到该校，
 * 为空时保持既有语义（全部可见班级）。学生不在任何可见班级 → false。
 *
 * @param {number} teacherId 教师 ID
 * @param {number} studentId 学生 ID
 * @param {number|null} [schoolId] 可选学校 ID
 * @returns {Promise<boolean>}
 */
export async function isStudentVisibleToTeacher(teacherId, studentId, schoolId = null) {
  const visibleClassIds = await getVisibleClassIds(teacherId, schoolId ? +schoolId : null);
  if (!visibleClassIds.length) return false;
  const linked = await prisma.studentClass.findFirst({
    where: { studentId, classId: { in: visibleClassIds } },
    select: { classId: true },
  });
  return !!linked;
}

/**
 * 「按提交 id 直取」入口的统一归属校验（t4 · 越权收敛）。
 *
 * 详情 / 提示词 / 改分 / 审核 / 重评 / 发布 等所有以 submission id 定位的教师端入口
 * 必须先过这里，杜绝「换一个 id 就能读到/改到别的学校、别的班级」的横向越权。
 *
 * 语义约定（错误码与信息量）：
 *   - id 非法（非正整数）      → 400 / 1001，响应体不含任何提交内容
 *   - 提交不存在               → 404 / 1004
 *   - 存在但不在可见范围        → 403 / 1003（不区分「不存在」与「不可见」以外的信息，响应体同样不含内容）
 *
 * @param {number} teacherId 教师 ID
 * @param {number} submissionId 提交 ID
 * @param {number|null} [schoolId] 可选学校 ID（批量端点从 body 取；传入时收窄到该校）
 * @returns {Promise<{ok:true, submission:{id:number,studentId:number,assignmentId:number,questionId:number}}|{ok:false,status:number,body:object}>}
 */
async function loadVisibleSubmission(teacherId, submissionId, schoolId = null) {
  if (!Number.isInteger(submissionId) || submissionId < 1) {
    return { ok: false, status: 400, body: { code: 1001, message: '参数错误', data: null } };
  }
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, studentId: true, assignmentId: true, questionId: true },
  });
  if (!submission) {
    return { ok: false, status: 404, body: { code: 1004, message: '提交不存在', data: null } };
  }
  const visible = await isStudentVisibleToTeacher(teacherId, submission.studentId, schoolId);
  if (!visible) {
    return { ok: false, status: 403, body: { code: 1003, message: '无权访问该提交', data: null } };
  }
  return { ok: true, submission };
}

/** 发送归属校验失败响应（响应体只含 code/message/data:null，绝不含题目、答案、评分等内容） */
function sendScopeError(res, guard) {
  return res.status(guard.status).json(guard.body);
}

export { loadVisibleSubmission, sendScopeError };
