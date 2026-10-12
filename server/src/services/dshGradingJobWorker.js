/**
 * dshGradingJobWorker.js —— R2-B4（W7 续）：pending job 的消费执行器。
 *
 * 铁律：
 *  1) 并发闸 = dsh_grading_concurrency（默认 1，见 infrastructure/ai/deepseek/config.js）：闸满时**不领取** job
 *     （job 保持 pending 排队），绝不并发拉起装置；跑完在 finally 释放。
 *  2) 原子领取：单条 UPDATE … WHERE id=? AND status='pending' ⇒ affectedRows=1 才算领到，
 *     同一 job 不可能被两个 worker 同时消费。
 *  3) 不写分语义沿用批 3：装置 exit 5/6、产物缺失、全部 needs_rerun ⇒ job 标 needs_rerun（**不写分、不落 0 分**）。
 *  4) 超时 ⇒ kill + 释放闸 + attempts 递增 + 回到 pending（可重试）；超过 maxAttempts ⇒ failed。
 *  5) 安全：装置在隔离 DSH_HOME 下运行（env 注入），凭据只经子进程 env（批 1 runner），run-root 在 /tmp。
 */
import fs from 'fs';
import path from 'path';
import { runDshGrader } from './dshGraderRunner.js';
import { consumeChecker, consumeMeasureResults, resolveCheckerPath } from './dshCheckerConsumer.js';
import { getDshGradingConcurrency } from '../infrastructure/ai/deepseek/config.js';
import logger from '../utils/logger.js';

export const JOB_STATUS = { pending: 'pending', running: 'running', done: 'done', failed: 'failed', needsRerun: 'needs_rerun' };
export const DEFAULT_MAX_ATTEMPTS = 3;

/** 并发闸（FIFO；tryAcquire 失败 ⇒ 调用方不得领取 job） */
export function createGate(limit = 1) {
  const cap = Math.max(1, Math.floor(Number(limit) || 1));
  let active = 0;
  const queue = [];
  return {
    get limit() { return cap; },
    get active() { return active; },
    get waiting() { return queue.length; },
    tryAcquire() { if (active < cap) { active += 1; return true; } return false; },
    async acquire() {
      if (active < cap) { active += 1; return; }
      await new Promise((resolve) => queue.push(resolve));
      active += 1;
    },
    release() {
      if (active > 0) active -= 1;
      const next = queue.shift();
      if (next) next();
    },
  };
}

/** 原子领取：先选候选，再用单条条件 UPDATE 抢（affectedRows=1 才算领到） */
export function buildClaimSql({ hasDbGate }) {
  const base = 'UPDATE grading_jobs SET status = \'running\', attempts = attempts + 1, last_error = NULL, '
    + 'updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = \'pending\'';
  if (!hasDbGate) return base;
  // ★R2-B5 DB 级闸：同一语句内要求「当前 running 行数 < limit」⇒ 多进程下也不超发。
  //   MySQL 不允许 UPDATE 的子查询直接引用目标表 ⇒ 用派生表包一层（经典合法写法）。
  return base + ' AND (SELECT COUNT(*) FROM (SELECT id FROM grading_jobs WHERE status = \'running\') AS r) < ?';
}

/**
 * 原子领取（+ 可选 DB 级闸）。
 * @param {{prisma:object, jobId?:number|null, dbLimit?:number|null}} args
 */
export async function claimJobAtomic({ prisma, jobId = null, dbLimit = null }) {
  let candidateId = jobId ? Number(jobId) : null;
  if (!candidateId) {
    const cand = await prisma.gradingJob.findFirst({ where: { status: JOB_STATUS.pending }, orderBy: { id: 'asc' }, select: { id: true } });
    if (!cand) return null;
    candidateId = cand.id;
  }
  const useGate = Number.isFinite(Number(dbLimit)) && Number(dbLimit) > 0;
  const sql = buildClaimSql({ hasDbGate: useGate });
  const affected = useGate
    ? await prisma.$executeRawUnsafe(sql, candidateId, Number(dbLimit))
    : await prisma.$executeRawUnsafe(sql, candidateId);
  if (Number(affected) !== 1) return null; // 已被别的 worker 领走 / DB 级闸已满 ⇒ 不消费
  return prisma.gradingJob.findUnique({ where: { id: candidateId } });
}

export async function finishJob({ prisma, jobId, status, written = 0, skipped = 0, error = null }) {
  await prisma.gradingJob.update({
    where: { id: +jobId },
    data: { status, writtenCount: written, skippedCount: skipped, lastError: error },
  });
}

/**
 * 消费一个 job（默认取最早的 pending）。
 * @returns {{consumed:boolean, reason?:string, jobId?:number, status?:string, written?:number, skipped?:number, runRoot?:string, exitCode?:number, timedOut?:boolean}}
 */
export async function runOnce({
  prisma, jobId = null, gate = null, dbLimit = undefined, deviceCommand, deviceArgs = [], stubEnv = {},
  runRootBase = '/tmp', timeoutMs = 600000, maxAttempts = DEFAULT_MAX_ATTEMPTS,
  repoRoot = path.resolve(process.cwd(), '..'), deps = {},
} = {}) {
  const limit = await getDshGradingConcurrency();
  const g = gate || createGate(limit);
  if (!g.tryAcquire()) {
    return { consumed: false, reason: 'gate_full', active: g.active, limit: g.limit };
  }
  try {
    // 进程内闸（第一层）+ DB 级闸（第二层，多进程也生效）：默认都用 dsh_grading_concurrency
    const job = await claimJobAtomic({ prisma, jobId, dbLimit: dbLimit === undefined ? limit : dbLimit });
    if (!job) return { consumed: false, reason: 'no_pending_job' };

    const runRoot = path.join(runRootBase, 'r2b4-job-' + job.id + '-' + Date.now());
    fs.mkdirSync(runRoot, { recursive: true });
    const home = path.join(runRoot, 'home');
    fs.mkdirSync(home, { recursive: true });

    const res = await (deps.runDshGrader || runDshGrader)({
      command: deviceCommand || 'node',
      args: deviceArgs,
      runRoot,
      cwd: runRoot,
      timeoutMs,
      extraEnv: { DSH_HOME: home, ...stubEnv },
      spawnImpl: deps.spawnImpl,
      logImpl: deps.logImpl || logger,
    });

    const base = { consumed: true, jobId: job.id, runRoot, exitCode: res.exitCode, timedOut: !!res.timedOut };

    if (res.timedOut) {
      const retryable = job.attempts < maxAttempts;
      await finishJob({
        prisma, jobId: job.id,
        status: retryable ? JOB_STATUS.pending : JOB_STATUS.failed,
        error: 'timeout:attempt=' + job.attempts + (retryable ? ':retryable' : ':exhausted'),
      });
      logger.warn({ jobId: job.id, attempts: job.attempts, retryable }, 'R2-B4：装置超时（kill + 释放闸）');
      return { ...base, status: retryable ? JOB_STATUS.pending : JOB_STATUS.failed, reason: 'timeout', retryable };
    }

    const checkerPath = resolveCheckerPath(runRoot);
    if (!checkerPath) {
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'artifacts_missing:exit=' + res.exitCode });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'artifacts_missing' };
    }
    if (Number(res.exitCode) === 5 || Number(res.exitCode) === 6) {
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'device_exit_' + res.exitCode });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'device_exit_' + res.exitCode };
    }
    if (Number(res.exitCode) !== 0) {
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'device_exit_' + res.exitCode });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'device_exit_' + res.exitCode };
    }

    const stored = await consumeChecker({ prisma, runRoot, assignmentId: job.assignmentId, repoRoot });
    if (!stored.ok) {
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'checker_invalid:' + stored.reason });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'checker_invalid:' + stored.reason };
    }
    const consumed = await consumeMeasureResults({ prisma, runRoot, assignmentId: job.assignmentId });
    const status = consumed.written > 0 ? JOB_STATUS.done : JOB_STATUS.needsRerun;
    await finishJob({
      prisma, jobId: job.id, status,
      written: consumed.written, skipped: consumed.skipped.length,
      error: consumed.written > 0 ? null : 'all_needs_rerun:' + consumed.skipped.map((r) => r.reason).join(','),
    });
    logger.info({ jobId: job.id, status, written: consumed.written, skipped: consumed.skipped.length }, 'R2-B4：job 消费完成');
    return { ...base, status, written: consumed.written, skipped: consumed.skipped.length, checkerId: stored.checkerId };
  } finally {
    g.release();
  }
}
