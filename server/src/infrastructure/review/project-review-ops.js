/**
 * project-review-ops.js —— 实训题「审核改分 / 重新评分」的共用核心（R3-D5 / t12）。
 *
 * 下沉来源（行为逐字保留，只把可见性守卫参数化）：
 *   - infrastructure/review/project.js:reviewProjectSubmission（教师改分/审核）
 *   - controllers/projectReviewController.js:regradeProjectSubmission（教师重评）
 *
 * ★可见性口径（R3-D5 ④）：与其它按 id 直取的教师端入口统一为「教师可见班级」===
 *   isStudentVisibleToTeacher（直连班级 ∪ 团队班级）。传 checkVisibility=false 供**管理员**链路使用
 *   （super_admin 由路由层鉴权，可操作任意班级，US-A3 AC2）；越权教师仍由该守卫 403。
 * ★G2：非法分值（非数字/NaN/小数/超范围）→ 400 + 可读文案（不再 Math.min/Math.max 静默夹取、更不落 500）。
 * ★G3：改分后状态机 —— 原本 published 的提交保持 published（学生端即时可见新 finalScore）。
 */
import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { parseProjectAnswer, serializeProjectAnswer } from '../../domain/services/project-view.js';
import { normalizeFinalScore, statusAfterReview } from '../../domain/services/finalScore.js';
import { isStudentVisibleToTeacher } from './scope.js';
import { enqueueProjectGrade } from '../../services/projectGrading.js';
import { decideStale, loadAssignmentSnapshot, resolveSnapshot } from '../../services/assignmentSnapshot.js';
import { standardPackSha256, textSha256 } from '../../utils/snapshotHash.js';

const json = (status, body) => ({ status, body });

/**
 * 教师/管理员「审核通过（改分 + 评语）」。
 * @param {{submissionId:number, finalScore?:unknown, teacherFeedback?:unknown, actorId:number|null, checkVisibility?:boolean}} input
 * @returns {Promise<{status:number, body:object}>}
 */
export async function reviewProjectSubmissionCore({
  submissionId, finalScore, teacherFeedback, actorId = null, checkVisibility = true,
} = {}) {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      question: { select: { type: true, maxScore: true } },
      assignment: { select: { teacherId: true } },
    },
  });
  if (!sub) return json(404, { code: 1004, message: '提交不存在', data: null });
  if (sub.question.type !== 'project') return json(400, { code: 1001, message: '非实训题提交', data: null });
  // R6/t4 → R3-D5：可见性统一为「可见班级」（不再要求是作业所属教师；越权仍 403 且零写入）
  if (checkVisibility && !(await isStudentVisibleToTeacher(actorId, sub.studentId))) {
    return json(403, { code: 1003, message: '无权访问该提交', data: null });
  }

  // G2：传了分值就必须合法；未传（undefined）＝「只改评语不改分」，保留既有 finalScore
  let score = null;
  const hasScore = !(finalScore === undefined || finalScore === null || finalScore === '');
  if (hasScore) {
    const v = normalizeFinalScore({ value: finalScore, maxScore: sub.question.maxScore });
    if (!v.ok) return json(400, { code: 1001, message: v.message, data: null });
    score = v.value;
  }

  // G3：published 保持 published（学生端即时可见），其余 → reviewed
  const data = { status: statusAfterReview(sub.status), reviewedAt: new Date() };
  if (hasScore) data.finalScore = score;
  // R3：教师评语以显式传入为准；未传则保留已有（初始为空），绝不取 AI 评语
  data.teacherFeedback = teacherFeedback !== undefined ? String(teacherFeedback || '') : (sub.teacherFeedback || '');

  const updated = await prisma.submission.update({ where: { id: submissionId }, data });
  return json(200, {
    code: 0,
    message: '审核成功',
    data: { id: submissionId, status: updated.status, finalScore: updated.finalScore, teacherFeedback: updated.teacherFeedback },
  });
}

/**
 * 教师/管理员「重新评分」（AI 重跑；任意状态可重评，保留 status 与 finalScore）。
 * @param {{submissionId:number, confirm?:boolean, actorId:number|null, checkVisibility?:boolean}} input
 * @returns {Promise<{status:number, body:object}>}
 */
export async function regradeProjectSubmissionCore({
  submissionId, confirm = false, actorId = null, checkVisibility = true,
} = {}) {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { question: { select: { id: true, type: true, scoringRubric: true, material: true, rubricItems: true } } },
  });
  if (!sub) return json(404, { code: 1004, message: '提交不存在', data: null });
  if (sub.question?.type !== 'project') return json(400, { code: 1001, message: '非实训题提交', data: null });
  // t6 → R3-D5：写操作前置归属校验（可见班级口径）；管理员链路由路由层 super_admin 鉴权后跳过
  if (checkVisibility && !(await isStudentVisibleToTeacher(actorId, sub.studentId))) {
    return json(403, { code: 1003, message: '无权访问该提交', data: null });
  }

  // 重评幂等——已触发（grading.state=pending 且 prevStatus 有值）时拒绝重复触发
  const curEnv = parseProjectAnswer(sub.answer);
  if (curEnv.grading?.state === 'pending' && curEnv.grading?.prevStatus) {
    return json(400, { code: 1001, message: '评分进行中，请稍候再试', data: null });
  }

  // W3（R2-B2）：重评前 stale 判定 —— 本次评分依据的标准（哈希）与当前活值不一致时要求显式确认
  const snapRow = await loadAssignmentSnapshot(prisma, sub.assignmentId, sub.questionId);
  const std = resolveSnapshot(snapRow, sub.question);
  const stale = decideStale({
    storedRubricHash: curEnv.grading?.rubricHash,
    storedStandardHash: curEnv.grading?.standardHash,
    currentRubricHash: textSha256(std.rubric),
    currentStandardHash: std.standardHash || standardPackSha256(sub.questionId),
  });
  if (stale.stale && !confirm) {
    logger.warn({ submissionId, reasons: stale.reasons }, '重评被拦：评分标准已变化（stale）');
    return json(409, {
      code: 1010,
      message: '该题评分标准已在评分后发生变化，重新评分会使用新标准（历史成绩不可比）。确认重评请加 ?confirm=1（将记录审计日志）。',
      data: { requiresConfirmation: true, code: 'RUBRIC_STALE_REQUIRES_CONFIRMATION', stale_reason: stale.reasons },
    });
  }
  if (stale.stale) {
    logger.warn({ submissionId, actorId, reasons: stale.reasons, confirm: true }, '重评放行（confirm=1）：标准已变，留痕');
  }

  // 重置版本信封的评分任务态，记录重评前状态（Worker 完成后恢复）
  const env = parseProjectAnswer(sub.answer);
  env.grading = {
    state: 'pending',
    version: env.currentVersion,
    startedAt: null,
    finishedAt: null,
    error: null,
    prevStatus: sub.status,
  };

  await prisma.submission.update({
    where: { id: submissionId },
    data: { aiScore: null, aiFeedback: null, answer: serializeProjectAnswer(env) },
  });

  // 异步投递（fire-and-forget，R5）
  enqueueProjectGrade(submissionId);

  logger.info({ submissionId, actorId }, '实训题已重新触发评分');
  return json(200, { code: 0, message: '已重新触发评分', data: null });
}
