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
import logger from '../utils/logger.js';

/** 默认阈值：15 分钟（env DSH_WORKER_STALE_RUNNING_MS 可覆盖） */
export const DEFAULT_STALE_RUNNING_MS = 15 * 60 * 1000;
export const RECLAIM_REASON_PENDING = 'stale_running_reclaimed';
export const RECLAIM_REASON_FAILED = 'stale_running_exhausted';
export const RECLAIM_REASON_CONFLICT = 'stale_running_active_key_conflict';

export function resolveStaleMs(env = process.env) {
  const v = Number(env.DSH_WORKER_STALE_RUNNING_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_STALE_RUNNING_MS;
}

/** 时间戳：MySQL DATETIME(3) 字面量（本地时区与 CURRENT_TIMESTAMP(3) 一致） */
function mysqlDateTime(ms) {
  return new Date(ms).toISOString().slice(0, 23).replace('T', ' ');
}

/**
 * 回收僵尸 running 行（幂等；可反复调用）。
 * @returns {Promise<{total:number,toPending:number,toFailed:number,conflicts:number,staleMs:number,details:Array}>}
 */
export async function reclaimStaleRunning({ prisma, staleMs = DEFAULT_STALE_RUNNING_MS, maxAttempts = 3, nowMs = Date.now(), log = console } = {}) {
  const cutoff = mysqlDateTime(nowMs - staleMs);
  const result = { total: 0, toPending: 0, toFailed: 0, conflicts: 0, staleMs, details: [] };
  const canRaw = prisma && typeof prisma.$queryRawUnsafe === 'function' && typeof prisma.$executeRawUnsafe === 'function';
  if (!canRaw) { result.skipped = 'prisma_raw_unavailable'; return result; }

  const candidates = await prisma.$queryRawUnsafe(
    'SELECT id, assignment_id, checker_id, attempts FROM grading_jobs WHERE status = ? AND updated_at < ? ORDER BY id ASC',
    'running', cutoff,
  );
  result.total = (candidates || []).length;
  if (!candidates || candidates.length === 0) return result;

  for (const row of candidates) {
    const id = Number(row.id);
    const assignmentId = Number(row.assignment_id);
    const checkerId = row.checker_id;
    const attempts = Number(row.attempts);
    const exhausted = attempts >= maxAttempts;
    // 活动键冲突检测：同 (assignment, checker) 是否已有 pending 行
    const pend = await prisma.$queryRawUnsafe(
      'SELECT id FROM grading_jobs WHERE assignment_id = ? AND checker_id = ? AND status = ? LIMIT 1',
      assignmentId, checkerId, 'pending',
    );
    const hasPending = (pend || []).length > 0;
    const targetStatus = exhausted || hasPending ? 'failed' : 'pending';
    const reason = exhausted ? RECLAIM_REASON_FAILED : (hasPending ? RECLAIM_REASON_CONFLICT : RECLAIM_REASON_PENDING);
    // 条件更新：只动「仍是 running 且仍超阈值」的行（并发安全、绝不误伤刚启动的 job）
    const affected = await prisma.$executeRawUnsafe(
      'UPDATE grading_jobs SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = ? AND updated_at < ?',
      targetStatus, reason, id, 'running', cutoff,
    );
    if (Number(affected) === 1) {
      if (targetStatus === 'pending') result.toPending += 1; else result.toFailed += 1;
      if (hasPending) result.conflicts += 1;
      result.details.push({ id, assignmentId, checkerId, attempts, status: targetStatus, reason });
    }
  }
  logger.warn({ ...result, details: undefined }, 'R2-B17：回收僵尸 running 行');
  return result;
}

/** 打印摘要行（不得静默） */
export function formatReclaimSummary(r) {
  return 'STALE_RECLAIMED n=' + r.total + ' to_pending=' + r.toPending + ' to_failed=' + r.toFailed
    + ' conflicts=' + r.conflicts + ' stale_ms=' + r.staleMs;
}
