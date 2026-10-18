/**
 * openProjectEvaluation.js —— OP-1（D1）：开放性实训题（无标准工程包）截止后**评价式评分**执行器。
 *
 * 为什么单独一个执行器：开放题与 DSH 装置链路物理隔离（装置契约硬依赖标准包三件套），
 *   所以开放 job 在 run-once 里**早于物料/尺子/装置**分派到本模块；这里只做：
 *   查题 → 防御性复核（绝不能把标准题当开放题评）→ 取待评提交（status='submitted'）→
 *   复用 services/projectGrading.gradeProjectSubmission（其内部 hasStandardPackage=false ⇒ mode='open'
 *   ⇒ OPEN_PROJECT_ROLE + buildOpenProjectGradePrompt，无标准答案段）→ 计数。
 *
 * 幂等/失败可见（A1 §3.9）：
 *   · 只评 status='submitted'（已 ai_graded/reviewed/published 一律跳过）⇒ job 重跑只补差、不重复扣费；
 *   · 单份失败继续下一份（gradeProjectSubmission 内部 markFailed 会还原 status=submitted ⇒ 重跑可补）；
 *   · graded=0 或 failed>0 ⇒ 调用方把 job 置 needs_rerun + last_error（open_grade_*），绝不伪造 done/假分；
 *   · 标准包题误入开放 job ⇒ 不评分，返回 open_job_on_standard_assignment（防误伤）。
 *
 * OP-2（D1-3）：汇总本次 job 内**每次真实模型调用**的 token 用量（成功/失败份都计 —— 失败调用同样计费），
 *   以 { model, calls[] } 挂在返回值 usage 上；run-once open 分支据此构造 grading_run_usage 行。
 *   模型调用次数可 > graded 数（如重试/解析失败），不伪造。
 *
 * 依赖可注入（C1 用）：gradeOne（默认 gradeProjectSubmission）、hasStdPackage（默认 hasStandardPackage）。
 */
import logger from '../../../utils/logger.js';
import { parseProjectAnswer } from '../../../domain/services/project-view.js';
import { hasStandardPackage } from '../../../utils/projectPaths.js';
import { gradeProjectSubmission } from '../../../services/projectGrading.js';

/** 失败明细只留前 N 条（不进 DB，仅回传/日志摘要，避免大班把内存/日志撑爆） */
export const OPEN_GRADE_MAX_FAILURE_DETAILS = 5;

function emit(log, level, line) {
  try {
    const fn = log && (log[level] || log.log || log.info);
    if (typeof fn === 'function') fn.call(log, line);
  } catch { /* 日志失败不影响评分 */ }
}

function shortErr(err) {
  return String((err && err.message) || err || 'unknown').slice(0, 160);
}

/**
 * 对一个「开放模式 job」的作业做评价式评分（顺序处理该作业全部待评提交）。
 * @param {object} args
 * @param {object} args.prisma PrismaClient
 * @param {{id:number, assignmentId:number}} args.job 已领取的 job（checker_id=__AUTO_OPEN__）
 * @param {object} [args.log] logger（默认 utils/logger）
 * @param {Function} [args.gradeOne] 注入用：默认 gradeProjectSubmission
 * @param {Function} [args.hasStdPackage] 注入用：默认 hasStandardPackage
 * @returns {Promise<{graded:number, failed:number, skipped:number, failures:Array, reason:string|null, questionId?:number}>}
 *   注意：不抛（所有异常归一为 reason），调用方据 graded/failed 决定 job 终态。
 */
export async function evaluateOpenProjectAssignment({
  prisma, job, log = logger, gradeOne = gradeProjectSubmission, hasStdPackage = hasStandardPackage,
} = {}) {
  const out = { graded: 0, failed: 0, skipped: 0, failures: [], reason: null };
  const assignmentId = Number(job && job.assignmentId);
  const jobId = Number(job && job.id);
  if (!prisma || !Number.isFinite(assignmentId) || assignmentId <= 0) {
    return { ...out, reason: 'open_project_assignment_missing' };
  }

  // 1) 该作业唯一 project 题（与 resolveAssignmentContent / r2b20 的 project_question_not_unique 同口径）
  let question = null;
  try {
    const links = await prisma.assignmentQuestion.findMany({
      where: { assignmentId },
      select: { questionId: true },
    });
    const qids = [...new Set((links || []).map((l) => Number(l && l.questionId)).filter((n) => Number.isFinite(n) && n > 0))];
    const questions = qids.length
      ? await prisma.question.findMany({
        where: { id: { in: qids } },
        select: { id: true, type: true, attachmentUrl: true },
      })
      : [];
    const projects = (questions || []).filter((q) => q && q.type === 'project');
    if (projects.length !== 1) return { ...out, reason: 'open_project_question_not_unique:' + projects.length };
    question = projects[0];
  } catch (err) {
    return { ...out, reason: 'open_project_question_query_failed:' + shortErr(err) };
  }

  // 2) 防御性复核：标准包题误入开放 job ⇒ 不评分（不把标准题当开放题评，避免误伤）
  let stdPkg = false;
  try { stdPkg = hasStdPackage(Number(question.id), question.attachmentUrl ?? null) === true; } catch { stdPkg = false; }
  if (stdPkg) {
    emit(log, 'warn', 'OPEN_PROJECT_STANDARD_ASSIGNMENT_REFUSED assignment=' + assignmentId + ' job=' + jobId);
    return { ...out, reason: 'open_job_on_standard_assignment' };
  }

  // 3) 待评提交：只评 submitted（已评分/已审核/已发布/草稿一律跳过 ⇒ 重跑幂等）
  let submissions = [];
  try {
    submissions = await prisma.submission.findMany({
      where: { assignmentId, questionId: Number(question.id), status: 'submitted' },
      select: { id: true, studentId: true, answer: true },
      orderBy: { id: 'asc' },
    });
  } catch (err) {
    return { ...out, reason: 'open_project_submissions_query_failed:' + shortErr(err) };
  }
  if (!submissions || submissions.length === 0) {
    emit(log, 'info', 'OPEN_PROJECT_EMPTY assignment=' + assignmentId + ' job=' + jobId + '（无待评提交）');
    return { ...out, reason: 'open_grade_no_pending_submission', questionId: Number(question.id) };
  }

  // 4) 逐份评分：单份失败不中断（失败可见；已成功份保留）；★OP-2：同时汇总每次调用的 llmUsage
  const usageCalls = [];
  const collectUsage = (llmUsage, submissionId) => {
    const list = llmUsage && Array.isArray(llmUsage.calls) ? llmUsage.calls : [];
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      usageCalls.push({ ...c, submissionId: Number.isFinite(submissionId) ? submissionId : null });
    }
  };
  for (const sub of submissions) {
    const submissionId = Number(sub.id);
    const studentId = Number(sub.studentId);
    let version = 0;
    try { version = Number(parseProjectAnswer(sub.answer).currentVersion) || 0; } catch { version = 0; }
    if (!Number.isFinite(submissionId) || submissionId <= 0 || !Number.isFinite(studentId) || studentId <= 0 || version < 1) {
      out.skipped += 1;
      continue;
    }
    try {
      const res = await gradeOne({ submissionId, questionId: Number(question.id), studentId, version });
      // ★OP-2：成功/失败都先记真实调用（失败调用已计费；模型调用数 gte 评分份数）
      collectUsage(res && res.llmUsage, submissionId);
      if (res && res.ok) {
        out.graded += 1;
      } else {
        out.failed += 1;
        if (out.failures.length < OPEN_GRADE_MAX_FAILURE_DETAILS) {
          out.failures.push({ submissionId, reason: (res && res.reason) || 'unknown' });
        }
        emit(log, 'warn', 'OPEN_PROJECT_GRADE_FAILED submission=' + submissionId + ' job=' + jobId + ' reason=' + ((res && res.reason) || 'unknown'));
      }
    } catch (err) {
      out.failed += 1;
      // ★OP-2：异常 path 也把已发生的调用带出（gradeProject 在 err.llm_usage 上挂真实 token）
      collectUsage(err && err.llm_usage, submissionId);
      if (out.failures.length < OPEN_GRADE_MAX_FAILURE_DETAILS) {
        out.failures.push({ submissionId, reason: 'exception:' + shortErr(err) });
      }
      emit(log, 'warn', 'OPEN_PROJECT_GRADE_FAILED submission=' + submissionId + ' job=' + jobId + ' reason=exception:' + shortErr(err));
    }
  }

  // 5) 汇总 reason（仅描述本次结果；job 终态由 run-once 依计数决定，不伪造绿）
  if (out.failed > 0) out.reason = 'open_grade_partial';
  else if (out.graded === 0) out.reason = 'open_grade_no_success';
  const usageModel = (usageCalls.find((c) => c && c.model) || {}).model || null;
  return { ...out, questionId: Number(question.id), usage: { model: usageModel, calls: usageCalls } };
}
