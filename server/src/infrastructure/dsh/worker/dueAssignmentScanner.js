/**
 * dueAssignmentScanner.js —— 截止后自动触发「该教师/该班级/该作业」的批改会话。
 *
 * 用户流程：教师布置 → 学生提交 → 作业截止 → 为该作业生成一个会话造尺 → 下次同作业直接复用尺。
 * 本模块只负责「到点建一个 pending job」；真正造尺/复用/量尺由 dsh-grader-worker 的 runOnce 完成：
 *   - 该作业还没有尺子 ⇒ worker 走 build 流程（装置 --checker-mode build-and-measure 造尺一次）；
 *   - 该作业（同内容）已有 ready 尺子 ⇒ worker 走 reuse 流程（零 LLM 量尺）。
 *
 * 幂等与边界：
 *   1) 只挑「已截止、有非草稿提交、恰好一道实训题、有发布冻结快照（content_key 可推导）」的作业；
 *   2) 已有任意 grading_jobs 行（含失败/终态）⇒ 不自动重投，避免每 60s 重复造尺烧钱；失败后由教师/运维显式重试；
 *   3) 回看窗口默认 7 天，避免首次部署把历史作业一次性全排进来；
 *   4) 建 job 用哨兵 checker_id，靠既有 active_key 唯一索引兜住并发。
 */
import { AUTO_BUILD_CHECKER } from './autoBuild.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveAutoGradeConfig(env = process.env) {
  const bool = (v, d) => (v === undefined || v === null || v === '' ? d : String(v) !== '0');
  const int = (v, d, min, max) => {
    const n = Math.floor(Number(v));
    const base = Number.isFinite(n) ? n : d;
    return Math.max(min, Math.min(max, base));
  };
  return {
    enabled: bool(env.DSH_AUTO_GRADE, true),
    lookbackDays: int(env.DSH_AUTO_GRADE_LOOKBACK_DAYS, 7, 1, 90),
    limit: int(env.DSH_AUTO_GRADE_LIMIT, 20, 1, 100),
    scanMs: int(env.DSH_AUTO_GRADE_SCAN_MS, 60000, 5000, 24 * 60 * 60 * 1000),
  };
}

function logLine(log, fn, line) {
  try {
    if (log && typeof log[fn] === 'function') log[fn](line);
    else if (log && typeof log.log === 'function') log.log(line);
  } catch { /* 日志失败不影响调度 */ }
}

/**
 * 找出「已截止但还没有任何 job」的实训题作业。
 * @returns {Promise<Array<{assignmentId:number, teacherId:number|null, title:string|null, endTime:Date|null}>>}
 */
export async function findDueAssignments({ prisma, lookbackDays = 7, limit = 20 } = {}) {
  if (!prisma || typeof prisma.$queryRawUnsafe !== 'function') {
    return { ok: false, reason: 'no_raw_sql', rows: [] };
  }
  const days = Math.max(1, Math.min(90, Math.floor(Number(lookbackDays) || 7)));
  const cap = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
  // 时间口径统一用 UTC_TIMESTAMP：Prisma 写入的 DATETIME 是 UTC，MySQL NOW() 受 session timezone 影响。
  // 边界口径（缺一不可）：
  //   · 已截止且落在回看窗口内（默认 7 天，避免首次部署把历史作业一次性全排）；
  //   · 恰好一道未删除的 project 型实训题（与 resolveAssignmentContent / r2b20 的 project_question_not_unique 同口径，
  //     否则建出来的 job 必然在内容解析/物料导出处 fail-closed，白白占掉「每作业一次」的自动名额）；
  //   · 有发布冻结快照（standard_hash 非 NULL 且非空串）⇒ 才可能推导 content_key；
  //   · 至少一份非草稿提交（status <> 'draft'）；
  //   · 该作业还没有任何 grading_jobs 行（含失败/终态）⇒ 自动流程每作业最多跑一次。
  const sql = `SELECT DISTINCT a.id AS assignmentId, a.teacher_id AS teacherId, a.title AS title, a.end_time AS endTime
  FROM assignments a
  JOIN assignment_questions aq ON aq.assignment_id = a.id
  JOIN questions q ON q.id = aq.question_id AND q.type = 'project' AND q.deleted_at IS NULL
  WHERE a.deleted_at IS NULL
    AND a.end_time <= UTC_TIMESTAMP(3)
    AND a.end_time >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${days} DAY)
    AND aq.standard_hash IS NOT NULL
    AND aq.standard_hash <> ''
    AND EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.status <> 'draft')
    AND NOT EXISTS (SELECT 1 FROM grading_jobs j WHERE j.assignment_id = a.id)
    AND (SELECT COUNT(*) FROM assignment_questions aq2 JOIN questions q2 ON q2.id = aq2.question_id WHERE aq2.assignment_id = a.id AND q2.type = 'project' AND q2.deleted_at IS NULL) = 1
  ORDER BY a.end_time ASC
  LIMIT ${cap}`;
  try {
    const rows = await prisma.$queryRawUnsafe(sql);
    return { ok: true, rows: (rows || []).map((r) => ({
      assignmentId: Number(r.assignmentId),
      teacherId: r.teacherId === null || r.teacherId === undefined ? null : Number(r.teacherId),
      title: r.title || null,
      endTime: r.endTime || null,
    })).filter((r) => Number.isFinite(r.assignmentId) && r.assignmentId > 0) };
  } catch (err) {
    return { ok: false, reason: 'query_failed:' + String((err && err.message) || err).slice(0, 160), rows: [] };
  }
}

/**
 * 扫描并建 job。返回可审计计数；不抛（扫描失败只在 worker 日志里告警）。
 */
export async function scanDueAssignments({ prisma, enabled = true, lookbackDays = 7, limit = 20, log = console } = {}) {
  if (!enabled) return { ok: true, disabled: true, due: 0, enqueued: 0, skipped: [], errors: [] };
  const found = await findDueAssignments({ prisma, lookbackDays, limit });
  if (!found.ok) {
    logLine(log, 'warn', 'AUTO_GRADE_SCAN_FAILED reason=' + found.reason);
    return { ok: false, reason: found.reason, due: 0, enqueued: 0, skipped: [], errors: [] };
  }
  const skipped = [];
  const errors = [];
  let enqueued = 0;
  for (const row of found.rows) {
    try {
      // ★R1（A1 复核）缓解：建之前再按**作业**查一次活动 job，缩小「扫描与手动触发同时各建一个」的窗口。
      //   DB 唯一键只覆盖 (assignment, checker)（见 20261012030000_r2b12_grading_jobs_active_key）；
      //   跨 checker 的「每作业一个活动 job」DB 无法表达，最终仍以应用层判重为准 ⇒ 见 AUTO-FLOW §2.3 已知限制。
      if (prisma.gradingJob && typeof prisma.gradingJob.findFirst === 'function') {
        const active = await prisma.gradingJob.findFirst({
          where: { assignmentId: row.assignmentId, status: { in: ['pending', 'running'] } },
          select: { id: true },
        });
        if (active) {
          skipped.push({ assignmentId: row.assignmentId, reason: 'active_job_exists' });
          continue;
        }
      }
      const job = await prisma.gradingJob.create({
        data: { assignmentId: row.assignmentId, checkerId: AUTO_BUILD_CHECKER, status: 'pending' },
        select: { id: true },
      });
      enqueued += 1;
      logLine(log, 'info', 'AUTO_GRADE_ENQUEUE assignment=' + row.assignmentId + ' teacher=' + (row.teacherId ?? '(unknown)')
        + ' job=' + (job && job.id) + ' checker=' + AUTO_BUILD_CHECKER + ' end=' + (row.endTime ? new Date(row.endTime).toISOString() : 'na'));
    } catch (err) {
      if (err && err.code === 'P2002') {
        skipped.push({ assignmentId: row.assignmentId, reason: 'active_job_exists' });
        continue;
      }
      errors.push({ assignmentId: row.assignmentId, reason: String((err && err.message) || err).slice(0, 160) });
      logLine(log, 'warn', 'AUTO_GRADE_ENQUEUE_FAILED assignment=' + row.assignmentId + ' reason=' + String((err && err.message) || err).slice(0, 160));
    }
  }
  if (enqueued > 0 || errors.length > 0) {
    logLine(log, 'info', 'AUTO_GRADE_SCAN due=' + found.rows.length + ' enqueued=' + enqueued + ' skipped=' + skipped.length + ' errors=' + errors.length);
  }
  return { ok: true, due: found.rows.length, enqueued, skipped, errors };
}

export { DAY_MS };
