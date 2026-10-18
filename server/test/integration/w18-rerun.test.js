/**
 * W18（R2-B5）：重跑入口 —— 只重跑 needs_rerun/failed、不动 done；幂等；留痕。
 * ★task-40：R1 迁移后 DB 强制「每 assignment 至多一个活动 job」
 *   （uniq_grading_jobs_active_assignment：active_assignment_key 生成列唯一）⇒ 同一作业 requeue 两条
 *   needs_rerun/failed 会同时产生两条 pending 而违反约束。故本套件改为**每个探针 job 独立 assignment**，
 *   rerun 逐 assignment 调用；语义断言不变（只动 needs_rerun/failed、done/pending 不动、幂等、留痕）。
 * 仅测试库；自建探针行并在 afterAll 清理。
 */
import prisma from '../../src/utils/prisma.js';
import { RERUNNABLE, buildRerunMarker, rerunJobs } from '../../src/infrastructure/dsh/worker/dshGradingRerun.js';

const tag = 'w18-rerun-' + Date.now();
let teacherId = null;
const assignmentIds = [];
const ids = {};

async function mkAssignment(suffix) {
  const a = await prisma.assignment.create({
    data: { teacherId, title: tag + '-' + suffix, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') },
  });
  assignmentIds.push(a.id);
  return a.id;
}

describe('W18 重跑入口', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    teacherId = teacher.id;
    ids.aNeeds = await mkAssignment('needs');
    ids.aFailed = await mkAssignment('failed');
    ids.aDone = await mkAssignment('done');
    ids.aPending = await mkAssignment('pending');
    ids.needs = (await prisma.gradingJob.create({ data: { assignmentId: ids.aNeeds, checkerId: 'sha256:' + '1'.repeat(64), status: 'needs_rerun', attempts: 1, lastError: 'all_needs_rerun:unmapped_submission_id:s02' } })).id;
    ids.failed = (await prisma.gradingJob.create({ data: { assignmentId: ids.aFailed, checkerId: 'sha256:' + '2'.repeat(64), status: 'failed', attempts: 3, lastError: 'timeout:attempt=3:exhausted' } })).id;
    ids.done = (await prisma.gradingJob.create({ data: { assignmentId: ids.aDone, checkerId: 'sha256:' + '3'.repeat(64), status: 'done', attempts: 1, writtenCount: 2 } })).id;
    ids.pending = (await prisma.gradingJob.create({ data: { assignmentId: ids.aPending, checkerId: 'sha256:' + '4'.repeat(64), status: 'pending', attempts: 0 } })).id;
  });

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  });

  it('W18-1 只把 needs_rerun/failed 置回 pending；done/pending 原样不动', async () => {
    const outNeeds = await rerunJobs({ prisma, assignmentId: ids.aNeeds, actor: 'w18-test', reason: 'integration', log: { info: () => {} } });
    const outFailed = await rerunJobs({ prisma, assignmentId: ids.aFailed, actor: 'w18-test', reason: 'integration', log: { info: () => {} } });
    expect(outNeeds.requeued).toBe(1);
    expect(outFailed.requeued).toBe(1);
    expect([...outNeeds.jobIds, ...outFailed.jobIds].sort()).toEqual([ids.failed, ids.needs].sort());
    const rows = Object.fromEntries((await prisma.gradingJob.findMany({ where: { assignmentId: { in: assignmentIds } }, select: { id: true, status: true, attempts: true, lastError: true, writtenCount: true } })).map((r) => [r.id, r]));
    expect(rows[ids.needs].status).toBe('pending');
    expect(rows[ids.failed].status).toBe('pending');
    expect(rows[ids.done].status).toBe('done');       // ★不动 done
    expect(rows[ids.done].writtenCount).toBe(2);
    expect(rows[ids.pending].status).toBe('pending'); // 本来 pending 的也不受影响
    expect(rows[ids.needs].attempts).toBe(1);         // attempts 保留（供上限判断）
  });

  it('W18-2 留痕：last_error 含 actor/@时间/reason（可检索），且不绕过不写分语义（只入队）', async () => {
    const row = await prisma.gradingJob.findUnique({ where: { id: ids.needs }, select: { lastError: true } });
    expect(row.lastError).toContain('rerun_by=w18-test@');
    expect(row.lastError).toContain('::integration');
    expect(buildRerunMarker({ actor: 'a', reason: 'b', at: 'T' })).toBe('rerun_by=a@T::b');
    expect(RERUNNABLE).toEqual(['needs_rerun', 'failed']);
  });

  it('W18-3 幂等：第二次调用命中 0 行（已是 pending，不会重复执行）', async () => {
    const againNeeds = await rerunJobs({ prisma, assignmentId: ids.aNeeds, actor: 'w18-test', reason: 'again', log: { info: () => {} } });
    const againFailed = await rerunJobs({ prisma, assignmentId: ids.aFailed, actor: 'w18-test', reason: 'again', log: { info: () => {} } });
    expect(againNeeds.requeued).toBe(0);
    expect(againFailed.requeued).toBe(0);
    const pendingCount = await prisma.gradingJob.count({ where: { assignmentId: { in: assignmentIds }, status: 'pending' } });
    expect(pendingCount).toBe(3); // needs + failed + 原本的 pending
  });
});
