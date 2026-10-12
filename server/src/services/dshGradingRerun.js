/**
 * dshGradingRerun.js —— R2-B5（3）：needs_rerun / failed 的可判定重跑入口。
 *
 * 语义：
 *  - 只把 status ∈ {needs_rerun, failed} 的 job 重新置回 pending（绝不动 done / pending / running）；
 *  - 幂等：重复调用不产生重复执行（第一次后已是 pending ⇒ 第二次命中 0 行）；
 *  - 留痕：actor/时间/原因写进 last_error（R2-B5 无新列权限 ⇒ 复用该列，格式固定可检索），保留 attempts；
 *  - 不绕过「不写分」语义：重跑只是重新入队，消费路径仍按 decideScoreWrite 判定（仍可能再次 needs_rerun）。
 */
export const RERUNNABLE = ['needs_rerun', 'failed'];

export function buildRerunMarker({ actor, reason, at = new Date().toISOString() }) {
  return 'rerun_by=' + (actor || 'unknown') + '@' + at + '::' + (reason || 'no_reason');
}

export async function rerunJobs({ prisma, jobIds = null, assignmentId = null, actor = 'cli', reason = 'manual', log = console }) {
  const where = { status: { in: RERUNNABLE } };
  if (Array.isArray(jobIds) && jobIds.length) where.id = { in: jobIds.map((n) => Number(n)) };
  if (assignmentId) where.assignmentId = Number(assignmentId);
  const candidates = await prisma.gradingJob.findMany({ where, select: { id: true, status: true, attempts: true } });
  if (!candidates.length) return { requeued: 0, jobIds: [], marker: null };
  const marker = buildRerunMarker({ actor, reason });
  const res = await prisma.gradingJob.updateMany({
    where: { id: { in: candidates.map((c) => c.id) }, status: { in: RERUNNABLE } },
    data: { status: 'pending', lastError: marker },
  });
  if (log && log.info) log.info({ requeued: res.count, actor, reason, jobIds: candidates.map((c) => c.id) }, 'R2-B5：job 已重新入队');
  return { requeued: res.count, jobIds: candidates.map((c) => c.id), marker };
}
