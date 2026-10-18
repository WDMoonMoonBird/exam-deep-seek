/**
 * W44（R2-B19）：时钟异常（未来时刻）running 行处置 + 测试基建孤儿清理边界。
 * 仅测试库；探针自清理；零模型调用（消费用 stub）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { cleanupOrphanGradingRows } from '../setup.js';
import { buildClaimSql, runOnce } from '../../src/infrastructure/dsh/worker/index.js';
import { DEFAULT_CLOCK_TOLERANCE_MS, RECLAIM_REASON_CLOCK_AHEAD, RECLAIM_REASON_CLOCK_AHEAD_CONFLICT, RECLAIM_REASON_CLOCK_AHEAD_EXHAUSTED, formatReclaimSummary, reclaimStaleRunning, resolveClockToleranceMs, toleranceSeconds } from '../../src/infrastructure/dsh/worker/dshStaleJobReclaimer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const tag = 'w44-clock-' + Date.now();
let assignmentId = null;
let questionId = null;
let studentId = null;
let teacherId = null;
/** ★task-40：R1 约束「每 assignment 至多一个活动 job」⇒ 探针 running job 各用独立 assignment */
const extraAssignmentIds = [];
const ORPHAN_ASSIGNMENT_ID = 999999999;

const ahead = (seconds) => prisma.$executeRawUnsafe('UPDATE grading_jobs SET updated_at = (UTC_TIMESTAMP(3) + INTERVAL ? SECOND) WHERE id = ?', seconds, arguments[1]);
async function setUpdatedAhead(jobId, seconds) {
  await prisma.$executeRawUnsafe('UPDATE grading_jobs SET updated_at = (UTC_TIMESTAMP(3) + INTERVAL ? SECOND) WHERE id = ?', seconds, jobId);
}
async function mkAssignment(suffix) {
  const a = await prisma.assignment.create({ data: { teacherId, title: tag + '-' + suffix, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
  extraAssignmentIds.push(a.id);
  return a.id;
}
/** ★task-40：每个探针 running job 独立 assignment（R1：活动 job 每作业至多一条） */
async function mkRunningJob(suffix, attempts = 1) {
  const aid = await mkAssignment(suffix);
  return prisma.gradingJob.create({ data: { assignmentId: aid, checkerId: tag + '-' + suffix, status: 'running', attempts } });
}
async function utcAge(id) {
  const rows = await prisma.$queryRawUnsafe('SELECT TIMESTAMPDIFF(SECOND, updated_at, UTC_TIMESTAMP(3)) AS utc_age FROM grading_jobs WHERE id = ?', id);
  return Number(rows[0].utc_age);
}

describe('W44 时钟异常处置 + 孤儿清理', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    teacherId = teacher.id;
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    const u = await prisma.user.create({ data: { username: tag + '-stu', password: 'x', role: 'student', realName: tag + '-real1' } });
    studentId = u.id;
    await prisma.submission.create({ data: { assignmentId, questionId, studentId, status: 'submitted' } });
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
  }, 60000);

  afterAll(async () => {
    const allAsg = [assignmentId, ...extraAssignmentIds, ORPHAN_ASSIGNMENT_ID].filter(Boolean);
    await prisma.gradingJob.deleteMany({ where: { assignmentId: { in: allAsg } } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId: { in: allAsg } } });
    await prisma.submission.deleteMany({ where: { assignmentId: { in: allAsg } } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: allAsg } } });
    await prisma.assignment.deleteMany({ where: { id: { in: allAsg } } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
  }, 60000);

  it('W44-0 容差可配：缺省 60s、env 覆盖、非法值回退、0 允许', () => {
    expect(DEFAULT_CLOCK_TOLERANCE_MS).toBe(60000);
    expect(resolveClockToleranceMs({})).toBe(60000);
    expect(resolveClockToleranceMs({ DSH_WORKER_CLOCK_TOLERANCE_MS: '120000' })).toBe(120000);
    expect(resolveClockToleranceMs({ DSH_WORKER_CLOCK_TOLERANCE_MS: 'abc' })).toBe(60000);
    expect(resolveClockToleranceMs({ DSH_WORKER_CLOCK_TOLERANCE_MS: '0' })).toBe(0);
    expect(toleranceSeconds(60000)).toBe(60);
  });

  it('★W44-1 未来时刻 running（+2h）⇒ 识别为时钟异常：置 pending + last_error=stale_running_clock_ahead + 摘要 clock_ahead=1', async () => {
    const job = await mkRunningJob('ahead', 1);
    await setUpdatedAhead(job.id, 7200);
    expect(await utcAge(job.id)).toBeLessThan(-7000);   // 确实在未来
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, clockToleranceMs: 60000, maxAttempts: 3 });
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, lastError: true } });
    expect(after.status).toBe('pending');
    expect(after.lastError).toBe(RECLAIM_REASON_CLOCK_AHEAD);
    expect(r.clockAhead).toBeGreaterThanOrEqual(1);
    expect(r.details.find((d) => d.id === job.id).phase).toBe('clock_ahead');
    expect(formatReclaimSummary(r)).toMatch(/clock_ahead=\d+/);
    expect(formatReclaimSummary(r)).toMatch(/clock_tolerance_ms=\d+/);
    expect(Math.abs(await utcAge(job.id))).toBeLessThan(5);   // 处置时把 updated_at 归位到当前 UTC
  }, 60000);

  it('★W44-2 容差内的行不被误伤（+30s 与新鲜行都保持 running）', async () => {
    const inside = await mkRunningJob('inside', 1);
    await setUpdatedAhead(inside.id, 30);        // < 60s 容差
    const fresh = await mkRunningJob('fresh', 1);
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, clockToleranceMs: 60000, maxAttempts: 3 });
    for (const id of [inside.id, fresh.id]) {
      const row = await prisma.gradingJob.findUnique({ where: { id }, select: { status: true, lastError: true } });
      expect(row.status).toBe('running');
      expect(row.lastError).toBe(null);
      expect(r.details.find((d) => d.id === id)).toBeUndefined();
    }
    await prisma.gradingJob.updateMany({ where: { id: { in: [inside.id, fresh.id] } }, data: { status: 'failed', lastError: 'cleanup' } });
  }, 60000);

  it('★W44-3 时钟异常 + attempts 用尽 ⇒ failed（stale_running_clock_ahead_exhausted）', async () => {
    const job = await mkRunningJob('exhausted', 3);
    await setUpdatedAhead(job.id, 7200);
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, clockToleranceMs: 60000, maxAttempts: 3 });
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, lastError: true } });
    expect(after.status).toBe('failed');
    expect(after.lastError).toBe(RECLAIM_REASON_CLOCK_AHEAD_EXHAUSTED);
    expect(r.clockAhead).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('W44-4 时钟异常 + 同对已有 pending（防御分支，假 prisma）⇒ failed + stale_running_clock_ahead_conflict', async () => {
    const staleRow = { id: 950, assignment_id: 7, checker_id: 'sha256:cccc', attempts: 1 };
    const calls = [];
    const fakePrisma = {
      $queryRawUnsafe: async (sql) => {
        if (sql.includes('status = ? AND updated_at >')) return [staleRow];                                            // 相位 2：有时钟异常行（先判：两相位 SQL 都含 INTERVAL ? SECOND）
        if (sql.includes('updated_at <')) return [];                                                                   // 相位 1：无过期行
        if (sql.includes('AND status = ? LIMIT 1')) return [{ id: 888 }];                                             // 已有 pending ⇒ 冲突
        return [];
      },
      $executeRawUnsafe: async (sql, ...args) => { calls.push(args); return 1; },
    };
    const r = await reclaimStaleRunning({ prisma: fakePrisma, staleMs: 1000, clockToleranceMs: 60000, maxAttempts: 3 });
    expect(r.clockAhead).toBe(1);
    expect(r.conflicts).toBe(1);
    expect(calls[0][0]).toBe('failed');
    expect(calls[0][1]).toBe(RECLAIM_REASON_CLOCK_AHEAD_CONFLICT);
  }, 60000);

  it('★★W44-5 闸解锁端到端：未来时刻 running 占闸 ⇒ 领不到 job；回收后可领取并完成', async () => {
    // 制造「占闸的未来行」：先按生产领取语句把 pending 置为 running（正常量写一次），再把 updated_at 推到未来
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId: tag + '-gate', status: 'pending' } });
    const claimed = await prisma.$executeRawUnsafe(buildClaimSql({ hasDbGate: false }), job.id);
    expect(Number(claimed)).toBe(1);
    await setUpdatedAhead(job.id, 7200);
    const blocked = await runOnce({ prisma, jobId: job.id, dbLimit: 1, deviceCommand: process.execPath, deviceArgs: [STUB], repoRoot: SERVER + '/..', timeoutMs: 30000 });
    expect(blocked.consumed).toBe(false);                       // 复现事故：未来行占满 DB 闸 ⇒ 领不到
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, clockToleranceMs: 60000, maxAttempts: 3 });
    expect(r.clockAhead).toBeGreaterThanOrEqual(1);
    const mid = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true } });
    expect(mid.status).toBe('pending');
    const res = await runOnce({
      prisma, jobId: job.id, dbLimit: 1, deviceCommand: process.execPath, deviceArgs: [STUB],
      stubEnv: { STUB_MODE: 'ok', STUB_SLUG: '1', STUB_SUBMISSIONS: 's01', STUB_MANIFEST_IDS: tag + '-real1', STUB_SCORE: '83' },
      repoRoot: SERVER + '/..', timeoutMs: 60000,
    });
    expect(res.consumed).toBe(true);                            // 闸已解锁
    expect(res.status).toBe('done');
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, writtenCount: true } });
    expect(after.status).toBe('done');
    expect(after.writtenCount).toBe(1);
    const sub = await prisma.submission.findFirst({ where: { assignmentId }, select: { aiScore: true } });
    expect(sub.aiScore).toBe(83);
  }, 120000);

  it('★W44-6 孤儿清理边界：assignment 已不存在的 job/checker 被清；assignment 仍存在的行一行不动', async () => {
    // 孤儿：assignment_id 指向不存在的作业（该表无外键 ⇒ 可直接插入）
    const orphanJob = await prisma.gradingJob.create({ data: { assignmentId: ORPHAN_ASSIGNMENT_ID, checkerId: tag + '-orphan', status: 'running' } });
    const orphanChecker = await prisma.gradingChecker.create({ data: { assignmentId: ORPHAN_ASSIGNMENT_ID, questionId, checkerId: 'sha256:' + 'b'.repeat(64), versionHash: 'v', rubricHash: 'r', standardHash: 's', status: 'ready', checkerJson: { checker_id: 'sha256:' + 'b'.repeat(64), sections: [] } } });
    // 在产：assignment 存在（本轮 probe 作业）
    const validJob = await prisma.gradingJob.create({ data: { assignmentId, checkerId: tag + '-valid', status: 'pending' } });
    const r = await cleanupOrphanGradingRows(prisma);
    expect(r.jobs).toBeGreaterThanOrEqual(1);
    expect(r.checkers).toBeGreaterThanOrEqual(1);
    expect(await prisma.gradingJob.findUnique({ where: { id: orphanJob.id } })).toBe(null);
    expect(await prisma.gradingChecker.findUnique({ where: { id: orphanChecker.id } })).toBe(null);
    expect(await prisma.gradingJob.findUnique({ where: { id: validJob.id } })).not.toBe(null);   // 边界：不删在产数据
    await prisma.gradingJob.deleteMany({ where: { id: validJob.id } });
  }, 60000);
});
