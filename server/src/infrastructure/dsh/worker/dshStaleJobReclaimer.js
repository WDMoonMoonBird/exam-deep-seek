/**
 * dshStaleJobReclaimer.js —— R2-B17：回收「僵尸 running 行」。
 *
 * 为什么需要：并发闸是 DB 级（按 `status='running'` 行数 < dsh_grading_concurrency 判定）。
 *   进程被中断/断电/重启会留下 running 行 ⇒ 后续每个窗口都领不到 job，而且**不报错**（静默停摆）。
 * 策略：启动时（领取第一个 job 之前）把 `status='running'` 且 `updated_at` 超过阈值的行回收：
 *   - attempts 未用尽 ⇒ 置回 `pending`（last_error=stale_running_reclaimed）可重试；
 *   - attempts 已用尽 ⇒ 置 `failed`；
 *   - 若同 (assignment_id, checker_id) 已有 **pending**（活动键冲突）⇒ 该僵尸行置 `failed` 并留痕
 *     （保证「同 (作业, 尺子) 至多一条活动行」的活动键语义不被破坏）。
 * 安全：更新语句带 `status='running' AND updated_at < 阈值` 条件 ⇒ 正在跑的真实 job（updated_at 新）**绝不可能**被误伤。
 */
import logger from '../../../utils/logger.js';

/** 默认阈值：15 分钟（env DSH_WORKER_STALE_RUNNING_MS 可覆盖） */
export const DEFAULT_STALE_RUNNING_MS = 15 * 60 * 1000;
export const RECLAIM_REASON_PENDING = 'stale_running_reclaimed';
export const RECLAIM_REASON_FAILED = 'stale_running_exhausted';
export const RECLAIM_REASON_CONFLICT = 'stale_running_active_key_conflict';
// ★R2-B19：时钟异常（updated_at 在未来）⇒ 唯一判据永远不满足 ⇒ 永久占闸、静默停摆（F-T66-1）
export const RECLAIM_REASON_CLOCK_AHEAD = 'stale_running_clock_ahead';
export const RECLAIM_REASON_CLOCK_AHEAD_EXHAUSTED = 'stale_running_clock_ahead_exhausted';
export const RECLAIM_REASON_CLOCK_AHEAD_CONFLICT = 'stale_running_clock_ahead_conflict';

/** 默认时钟容差：60 秒（env DSH_WORKER_CLOCK_TOLERANCE_MS 可覆盖）；容差内的行绝不回收（正常并发写） */
export const DEFAULT_CLOCK_TOLERANCE_MS = 60 * 1000;

export function resolveClockToleranceMs(env = process.env) {
  const v = Number(env.DSH_WORKER_CLOCK_TOLERANCE_MS);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_CLOCK_TOLERANCE_MS;
}

export function resolveStaleMs(env = process.env) {
  const v = Number(env.DSH_WORKER_STALE_RUNNING_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_STALE_RUNNING_MS;
}

/**
 * ★R2-B18：阈值比较必须与**写入方同一时钟源**。
 *   写方有两处：Prisma（@updatedAt ⇒ **UTC**）与领取语句（原 CURRENT_TIMESTAMP(3) ⇒ **会话本地**）⇒ 同一列两种时钟；
 *   若判据再用客户端拼的 UTC 字面量，就会出现「真僵尸永不被回收」（t65 判定的阻断缺陷）。
 *   因此本轮把**写方与判据统一为 UTC**：领取语句与判据都用 `UTC_TIMESTAMP(3)`（与 Prisma 一致），判据走 SQL 侧
 *   `updated_at < (UTC_TIMESTAMP(3) - INTERVAL ? SECOND)`。
 */
// ★R2-B18：统一时钟 = **UTC**。实测（测试库，会话 time_zone=SYSTEM=UTC+8）：
//   · Prisma 写 updated_at（@updatedAt）⇒ TIMESTAMPDIFF(updated_at, UTC_TIMESTAMP(3)) = 0  ⇒ **UTC**
//   · 旧领取语句 CURRENT_TIMESTAMP(3) ⇒ TIMESTAMPDIFF(updated_at, NOW(3)) = 0             ⇒ **会话本地**
//   ⇒ 同一列存在两种时钟；判据与写方（领取语句/Prisma）必须同为 UTC，否则相差一个时区偏移（本环境 28800s）。
export const STALE_CLOCK_SQL = 'UTC_TIMESTAMP(3)';
export const WRITER_CLOCK_SQL = 'UTC_TIMESTAMP(3)';

/** 候选查询 SQL（导出供回归守卫断言「判据与写方同源」） */
export function buildStaleSelectSql() {
  return 'SELECT id, assignment_id, checker_id, attempts FROM grading_jobs WHERE status = ? AND updated_at < (' + STALE_CLOCK_SQL + ' - INTERVAL ? SECOND) ORDER BY id ASC';
}

/** 条件更新 SQL（同上） */
export function buildStaleUpdateSql() {
  return 'UPDATE grading_jobs SET status = ?, last_error = ?, updated_at = ' + WRITER_CLOCK_SQL + ' WHERE id = ? AND status = ? AND updated_at < (' + STALE_CLOCK_SQL + ' - INTERVAL ? SECOND)';
}

/** ★R2-B19：时钟异常候选查询（updated_at 在未来且超出容差） */
export function buildClockAheadSelectSql() {
  return 'SELECT id, assignment_id, checker_id, attempts FROM grading_jobs WHERE status = ? AND updated_at > (' + STALE_CLOCK_SQL + ' + INTERVAL ? SECOND) ORDER BY id ASC';
}

/** ★R2-B19：时钟异常行的条件更新（同时把 updated_at 归位 ⇒ 恢复正常判据语义） */
export function buildClockAheadUpdateSql() {
  return 'UPDATE grading_jobs SET status = ?, last_error = ?, updated_at = ' + WRITER_CLOCK_SQL + ' WHERE id = ? AND status = ? AND updated_at > (' + STALE_CLOCK_SQL + ' + INTERVAL ? SECOND)';
}

/** 容差毫秒 ⇒ 秒 */
export function toleranceSeconds(ms) {
  return Math.max(0, Math.ceil((Number.isFinite(Number(ms)) ? Number(ms) : DEFAULT_CLOCK_TOLERANCE_MS) / 1000));
}

/** 毫秒阈值 ⇒ 秒（SQL 侧 INTERVAL 的单位） */
export function staleSeconds(staleMs) {
  return Math.max(1, Math.ceil((Number.isFinite(Number(staleMs)) ? Number(staleMs) : DEFAULT_STALE_RUNNING_MS) / 1000));
}

/**
 * ★R2-B18/O-2：`--timeout-ms` ≥ 回收阈值 ⇒ 显式告警（否则可能出现「仍在跑却被回收」）。
 * @returns {null|{warn:true,message:string,timeoutMs:number,staleMs:number}}
 */
export function checkTimeoutVsStale({ timeoutMs, staleMs } = {}) {
  const t = Number(timeoutMs);
  const s = Number(staleMs);
  if (!Number.isFinite(t) || !Number.isFinite(s) || s <= 0) return null;
  if (t < s) return null;
  return {
    warn: true, timeoutMs: t, staleMs: s,
    message: 'WARN=timeout_ms_ge_stale_ms timeout_ms=' + t + ' stale_ms=' + s
      + ' ⇒ 单 job 超时上限已≥回收阈值：正在运行的 job 可能被判为僵尸并被回收；请让 DSH_WORKER_STALE_RUNNING_MS > --timeout-ms',
  };
}

/**
 * 回收僵尸 running 行（幂等；可反复调用）。
 * @returns {Promise<{total:number,toPending:number,toFailed:number,conflicts:number,staleMs:number,details:Array}>}
 */
export async function reclaimStaleRunning({ prisma, staleMs = DEFAULT_STALE_RUNNING_MS, maxAttempts = 3, nowMs = Date.now(), clockToleranceMs = DEFAULT_CLOCK_TOLERANCE_MS, _log = console } = {}) {
  const staleSec = staleSeconds(staleMs); // ★与写方同源：SQL 侧 UTC_TIMESTAMP(3) 计算阈值
  const result = { total: 0, toPending: 0, toFailed: 0, conflicts: 0, clockAhead: 0, staleMs, staleSec, clockToleranceMs, details: [] };
  const canRaw = prisma && typeof prisma.$queryRawUnsafe === 'function' && typeof prisma.$executeRawUnsafe === 'function';
  if (!canRaw) { result.skipped = 'prisma_raw_unavailable'; return result; }

  // 相位 1：正常过期（updated_at < now - 阈值）
  const candidates = await prisma.$queryRawUnsafe(buildStaleSelectSql(), 'running', staleSec);
  // 相位 2 ★R2-B19：时钟异常（updated_at > now + 容差）—— 这类行永远不满足相位 1 的判据 ⇒ 必须单独处置
  const ahead = await prisma.$queryRawUnsafe(buildClockAheadSelectSql(), 'running', toleranceSeconds(clockToleranceMs));
  result.total = (candidates || []).length + (ahead || []).length;
  result.clockAhead = (ahead || []).length;

  const handle = async (row, phase) => {
    const id = Number(row.id);
    const assignmentId = Number(row.assignment_id);
    const checkerId = row.checker_id;
    const attempts = Number(row.attempts);
    const exhausted = attempts >= maxAttempts;
    // 活动键冲突检测：同 (assignment, checker) 是否已有 pending 行（相位 2 走既有防御分支）
    const pend = await prisma.$queryRawUnsafe(
      'SELECT id FROM grading_jobs WHERE assignment_id = ? AND checker_id = ? AND status = ? LIMIT 1',
      assignmentId, checkerId, 'pending',
    );
    const hasPending = (pend || []).length > 0;
    const targetStatus = exhausted || hasPending ? 'failed' : 'pending';
    const reason = phase === 'clock_ahead'
      ? (exhausted ? RECLAIM_REASON_CLOCK_AHEAD_EXHAUSTED : (hasPending ? RECLAIM_REASON_CLOCK_AHEAD_CONFLICT : RECLAIM_REASON_CLOCK_AHEAD))
      : (exhausted ? RECLAIM_REASON_FAILED : (hasPending ? RECLAIM_REASON_CONFLICT : RECLAIM_REASON_PENDING));
    // 条件更新：只动「仍是 running 且仍在同一相位条件内」的行（并发安全、绝不误伤刚启动的 job）
    const affected = phase === 'clock_ahead'
      ? await prisma.$executeRawUnsafe(buildClockAheadUpdateSql(), targetStatus, reason, id, 'running', toleranceSeconds(clockToleranceMs))
      : await prisma.$executeRawUnsafe(buildStaleUpdateSql(), targetStatus, reason, id, 'running', staleSec);
    if (Number(affected) === 1) {
      if (targetStatus === 'pending') result.toPending += 1; else result.toFailed += 1;
      if (hasPending) result.conflicts += 1;
      result.details.push({ id, assignmentId, checkerId, attempts, status: targetStatus, reason, phase });
    }
  };

  for (const row of candidates || []) await handle(row, 'expired');
  for (const row of ahead || []) await handle(row, 'clock_ahead');
  logger.warn({ ...result, details: undefined }, 'R2-B17/B19：回收僵尸 running 行（含时钟异常）');
  return result;
}

/** 打印摘要行（不得静默） */
export function formatReclaimSummary(r) {
  return 'STALE_RECLAIMED n=' + r.total + ' to_pending=' + r.toPending + ' to_failed=' + r.toFailed
    + ' conflicts=' + r.conflicts + ' clock_ahead=' + (r.clockAhead || 0) + ' stale_ms=' + r.staleMs
    + ' clock_tolerance_ms=' + (r.clockToleranceMs === undefined ? DEFAULT_CLOCK_TOLERANCE_MS : r.clockToleranceMs);
}
