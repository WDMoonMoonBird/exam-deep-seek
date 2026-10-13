/**
 * worker/claim.js —— job 状态常量、并发闸与原子领取/结账（原样 SQL 与 UPDATE ... WHERE 语义不变）。
 *
 * R2-B65：从 services/dshGradingJobWorker.js（582 行）原样拆出；导出名与语义逐字保留（见 ./index.js barrel）。
 */

import logger from '../../../utils/logger.js';

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
    + 'updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND status = \'pending\''; // ★R2-B18：与 Prisma(@updatedAt 写 UTC) 统一时钟，避免同列两种时区
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

/**
 * 记账（R2-B12③：不再因唯一键冲突 P2002 而炸）。
 *  - 新活动键方案下，终态（done/failed/needs_rerun）可多行共存 ⇒ 正常路径不会 P2002；
 *  - 仍保留兜底：若命中 P2002（老 schema 或极端竞态），退化为「只写计数与原因、不改状态」重试一次，
 *    并打印 FINISH_P2002_RETRY 供排障；再失败则抛出（不静默吞）。
 */
export async function finishJob({ prisma, jobId, status, written = 0, skipped = 0, error = null }) {
  const data = { status, writtenCount: written, skippedCount: skipped, lastError: error };
  try {
    return await prisma.gradingJob.update({ where: { id: +jobId }, data });
  } catch (err) {
    if (err && err.code === 'P2002') {
      console.log('FINISH_P2002_RETRY job=' + jobId + ' status=' + status + ' error=' + (err && err.message));
      logger.warn({ jobId, status }, 'R2-B12：记账命中唯一键冲突 ⇒ 退化为只写计数重试一次');
      await new Promise((r) => setTimeout(r, 50));
      return prisma.gradingJob.update({ where: { id: +jobId }, data: { writtenCount: written, skippedCount: skipped, lastError: error } });
    }
    throw err;
  }
}
