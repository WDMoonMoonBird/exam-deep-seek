/**
 * dueAssignmentScanner.js —— 截止后自动触发「该教师/该班级/该作业」的批改会话。
 *
 * 用户流程：教师布置 → 学生提交 → 作业截止 → 为该作业生成一个会话造尺 → 下次同作业直接复用尺。
 * 本模块只负责「到点建一个 pending job」；真正造尺/复用/量尺由 dsh-grader-worker 的 runOnce 完成：
 *   - 该作业还没有尺子 ⇒ worker 走 build 流程（装置 --checker-mode build-and-measure 造尺一次）；
 *   - 该作业（同内容）已有 ready 尺子 ⇒ worker 走 reuse 流程（零 LLM 量尺）。
 *
 * OP-1（D1）：新增「开放模式」——无标准工程包的实训题作业在截止后也自动评分（评价式，无标准答案段）：
 *   扫描候选放宽后按 hasStandardPackage() 分类：有标准包 ⇒ __AUTO_BUILD__（装置链路不变）；
 *   无标准包 ⇒ __AUTO_OPEN__（worker 早分支直接评价式评分，不导物料/不造尺/不算 content_key）；
 *   有标准包但发布快照缺失/无效 ⇒ skip:standard_snapshot_missing（保持旧语义，不自动造尺）。
 *
 * 幂等与边界：
 *   1) 只挑「已截止、有非草稿提交、恰好一道实训题」的作业（开放/标准由分类决定）；
 *   2) 已有任意 grading_jobs 行（含失败/终态）⇒ 不自动重投，避免每 60s 重复造尺烧钱；失败后由教师/运维显式重试；
 *   3) 回看窗口默认 7 天，避免首次部署把历史作业一次性全排进来；
 *   4) 建 job 用哨兵 checker_id，靠既有 active_key 唯一索引兜住并发。
 */
import { AUTO_BUILD_CHECKER } from './autoBuild.js';
import { AUTO_OPEN_CHECKER } from './autoOpen.js';
import { hasStandardPackage } from '../../../utils/projectPaths.js';
import { STANDARD_HASH_ABSENT } from '../../../utils/snapshotHash.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ★OP-1 纯函数：截止候选作业的自动评分模式（单一分类真源；C1 可单测）。
 * 判据与 AI 实评/布置确认一致：hasStandardPackage(qid, attachmentUrl) 是**唯一**开放/标准信号；
 * standard_hash 只用于「冻结快照是否可用」的判定，且 'sha256:absent' 是哨兵、绝不能当真实哈希。
 * @returns {'open'|'standard'|'skip:standard_snapshot_missing'}
 */
export function classifyDueAssignment({ attachmentUrl = null, standardHash = null, hasStdPackage = false } = {}) {
  if (!hasStdPackage) return 'open';
  const hash = standardHash === null || standardHash === undefined ? '' : String(standardHash).trim();
  if (hash && hash !== STANDARD_HASH_ABSENT) return 'standard';
  return 'skip:standard_snapshot_missing';
}

/**
 * 批量解析候选作业的题目信息并分类（一次查询；不可用/失败 ⇒ ok:false，由调用方回落既有 __AUTO_BUILD__ 行为）。
 * @returns {Promise<{ok:boolean, reason?:string, modes:Map<number,string>}>}
 */
export async function resolveDueAssignmentModes({ prisma, rows = [], hasStdPackage = hasStandardPackage } = {}) {
  const modes = new Map();
  const ids = [...new Set((rows || []).map((r) => Number(r && r.assignmentId)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return { ok: true, modes };
  // 兼容精简 fake prisma / 迁移未落地：无 Prisma 模型能力 ⇒ 交给调用方回落既有标准造尺语义（行为不变）
  // 只需要 assignmentQuestion.findMany（题目信息经 relation 一并取出 ⇒ 一次查询；不额外依赖 prisma.question）
  const canQuery = !!(prisma && prisma.assignmentQuestion && typeof prisma.assignmentQuestion.findMany === 'function');
  if (!canQuery) return { ok: false, reason: 'prisma_capability_missing', modes };
  let links = [];
  try {
    links = await prisma.assignmentQuestion.findMany({
      where: { assignmentId: { in: ids } },
      select: { assignmentId: true, standardHash: true, question: { select: { id: true, type: true, attachmentUrl: true } } },
    });
  } catch (err) {
    return { ok: false, reason: 'query_failed:' + String((err && err.message) || err).slice(0, 160), modes };
  }
  for (const link of links || []) {
    const q = link && link.question;
    if (!q || q.type !== 'project') continue;
    const assignmentId = Number(link.assignmentId);
    const questionId = Number(q.id);
    if (!Number.isFinite(assignmentId) || assignmentId <= 0 || !Number.isFinite(questionId) || questionId <= 0) continue;
    let hasStd = false;
    try { hasStd = hasStdPackage(questionId, q.attachmentUrl ?? null) === true; } catch { hasStd = false; }
    modes.set(assignmentId, classifyDueAssignment({
      attachmentUrl: q.attachmentUrl ?? null,
      standardHash: link.standardHash,
      hasStdPackage: hasStd,
    }));
  }
  return { ok: true, modes };
}

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
export async function findDueAssignments({ prisma, lookbackDays = 7, limit = 20, includeOpenProjects = false } = {}) {
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
  //     ★OP-1：includeOpenProjects=true 时**不**在 SQL 里卡 standard_hash（开放题没有标准包），
  //     改由 resolveDueAssignmentModes 用 hasStandardPackage 分类后决定 open/standard/skip；
  //   · 至少一份非草稿提交（status <> 'draft'）；
  //   · 该作业还没有任何 grading_jobs 行（含失败/终态）⇒ 自动流程每作业最多跑一次。
  const snapshotSql = includeOpenProjects ? '' : "    AND aq.standard_hash IS NOT NULL\n    AND aq.standard_hash <> ''\n";
  const sql = `SELECT DISTINCT a.id AS assignmentId, a.teacher_id AS teacherId, a.title AS title, a.end_time AS endTime
  FROM assignments a
  JOIN assignment_questions aq ON aq.assignment_id = a.id
  JOIN questions q ON q.id = aq.question_id AND q.type = 'project' AND q.deleted_at IS NULL
  WHERE a.deleted_at IS NULL
    AND a.end_time <= UTC_TIMESTAMP(3)
    AND a.end_time >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${days} DAY)
${snapshotSql}    AND EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.status <> 'draft')
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
export async function scanDueAssignments({
  prisma, enabled = true, lookbackDays = 7, limit = 20, log = console,
  // ★OP-1：默认纳入开放题；分类失败/能力缺失时回落既有 __AUTO_BUILD__ 行为（不改变旧环境语义）
  includeOpenProjects = true, hasStdPackage = hasStandardPackage,
} = {}) {
  if (!enabled) return { ok: true, disabled: true, due: 0, enqueued: 0, skipped: [], errors: [] };
  const found = await findDueAssignments({ prisma, lookbackDays, limit, includeOpenProjects });
  if (!found.ok) {
    logLine(log, 'warn', 'AUTO_GRADE_SCAN_FAILED reason=' + found.reason);
    return { ok: false, reason: found.reason, due: 0, enqueued: 0, skipped: [], errors: [] };
  }
  const skipped = [];
  const errors = [];
  let enqueued = 0;
  // ★OP-1：批量分类（open / standard / skip）；分类不可用/失败 ⇒ 全部按既有 standard 语义处理（行为不变）
  const classified = await resolveDueAssignmentModes({ prisma, rows: found.rows, hasStdPackage });
  if (!classified.ok) {
    logLine(log, 'warn', 'AUTO_GRADE_CLASSIFY_FALLBACK reason=' + classified.reason + '（按既有 __AUTO_BUILD__ 语义处理）');
  }
  for (const row of found.rows) {
    try {
      const mode = classified.modes.get(row.assignmentId) || 'standard';
      if (mode.startsWith('skip:')) {
        skipped.push({ assignmentId: row.assignmentId, reason: mode.slice('skip:'.length) });
        continue;
      }
      const checkerId = mode === 'open' ? AUTO_OPEN_CHECKER : AUTO_BUILD_CHECKER;
      // ★R1（Wave 3）：DB 已强制「每作业一个活动 job」（生成列 active_assignment_key + UNIQUE，
      //   迁移 20261017123000_r1_grading_jobs_active_assignment；旧 active_key 保留）。
      //   这里先按作业查一次只是**优化**（少打一次 P2002、少写一行日志），并发窗口由 DB 兜底；
      //   下面的 P2002 分支即 DB 约束命中时的正常路径（skipped=active_job_exists）。
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
        data: { assignmentId: row.assignmentId, checkerId, status: 'pending' },
        select: { id: true },
      });
      enqueued += 1;
      logLine(log, 'info', 'AUTO_GRADE_ENQUEUE assignment=' + row.assignmentId + ' teacher=' + (row.teacherId ?? '(unknown)')
        + ' job=' + (job && job.id) + ' mode=' + mode + ' checker=' + checkerId + ' end=' + (row.endTime ? new Date(row.endTime).toISOString() : 'na'));
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
