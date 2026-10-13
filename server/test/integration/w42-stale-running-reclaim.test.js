/**
 * W42（R2-B17）：僵尸 running 行回收 —— 超阈值 ⇒ pending/failed；未超阈值不误伤；活动键冲突明确处理；回收后可正常领取并完成。
 * 仅测试库；探针自清理；零模型调用（消费用 stub）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { DEFAULT_STALE_RUNNING_MS, RECLAIM_REASON_CONFLICT, RECLAIM_REASON_FAILED, RECLAIM_REASON_PENDING, formatReclaimSummary, reclaimStaleRunning, resolveStaleMs } from '../../src/infrastructure/dsh/worker/dshStaleJobReclaimer.js';
import { runOnce } from '../../src/infrastructure/dsh/worker/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const tag = 'w42-stale-' + Date.now();
let assignmentId = null;
let questionId = null;
const future = new Date('2099-01-01');

async function backdate(jobId, minutes) {
  // ★R2-B18：夹具必须用**生产口径**的时钟（SQL 侧会话时钟 NOW(3)），不得用与判据共享的客户端 UTC 转换——
  //   否则夹具与判据同错相消 ⇒ 假绿（t65 即由该缺陷漏检）。
  await prisma.$executeRawUnsafe('UPDATE grading_jobs SET updated_at = (UTC_TIMESTAMP(3) - INTERVAL ? MINUTE) WHERE id = ?', minutes, jobId);
}
async function mkJob(checkerIdSuffix, status, attempts = 0) {
  return prisma.gradingJob.create({ data: { assignmentId, checkerId: tag + '-' + checkerIdSuffix, status, attempts } });
}

describe('W42 僵尸 running 回收', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: future } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    const u = await prisma.user.create({ data: { username: tag + '-stu', password: 'x', role: 'student', realName: tag + '-real1' } });
    await prisma.submission.create({ data: { assignmentId, questionId, studentId: u.id, status: 'submitted' } });
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
  }, 60000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
  }, 60000);

  it('W42-0 阈值可配：resolveStaleMs 读 env、缺省 15 分钟', () => {
    expect(DEFAULT_STALE_RUNNING_MS).toBe(15 * 60 * 1000);
    expect(resolveStaleMs({})).toBe(DEFAULT_STALE_RUNNING_MS);
    expect(resolveStaleMs({ DSH_WORKER_STALE_RUNNING_MS: '60000' })).toBe(60000);
    expect(resolveStaleMs({ DSH_WORKER_STALE_RUNNING_MS: 'abc' })).toBe(DEFAULT_STALE_RUNNING_MS);
  });

  it('★W42-1 超阈值 running：未超次数 ⇒ pending（last_error=stale_running_reclaimed）；超次数 ⇒ failed', async () => {
    const stale = await mkJob('stale1', 'running', 1);
    await backdate(stale.id, 20);
    const exhausted = await mkJob('stale2', 'running', 3);
    await backdate(exhausted.id, 20);
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, maxAttempts: 3 });
    expect(r.total).toBeGreaterThanOrEqual(2);
    expect(r.toPending).toBeGreaterThanOrEqual(1);
    expect(r.toFailed).toBeGreaterThanOrEqual(1);
    const a = await prisma.gradingJob.findUnique({ where: { id: stale.id }, select: { status: true, lastError: true } });
    expect(a.status).toBe('pending');
    expect(a.lastError).toBe(RECLAIM_REASON_PENDING);
    const b = await prisma.gradingJob.findUnique({ where: { id: exhausted.id }, select: { status: true, lastError: true } });
    expect(b.status).toBe('failed');
    expect(b.lastError).toBe(RECLAIM_REASON_FAILED);
    // ★R2-B19：摘要行新增 clock_ahead / clock_tolerance_ms（形状断言同步扩展，未放松）
    expect(formatReclaimSummary(r)).toMatch(/^STALE_RECLAIMED n=\d+ to_pending=\d+ to_failed=\d+ conflicts=\d+ clock_ahead=\d+ stale_ms=\d+ clock_tolerance_ms=\d+$/);
  }, 60000);

  it('★W42-2 未超阈值的 running 不被误伤（更新的 updated_at 保持 running）', async () => {
    const fresh = await mkJob('fresh', 'running', 1);
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, maxAttempts: 3 });
    const after = await prisma.gradingJob.findUnique({ where: { id: fresh.id }, select: { status: true, lastError: true } });
    expect(after.status).toBe('running');
    expect(after.lastError).toBe(null);
    expect(r.details.find((d) => d.id === fresh.id)).toBeUndefined();
    await prisma.gradingJob.update({ where: { id: fresh.id }, data: { status: 'failed', lastError: 'cleanup' } });
  }, 60000);

  it('★W42-3 活动键语义：DB 层本就禁止「同 (assignment,checker) 两条活动行」（回收的冲突分支是防御性的）', async () => {
    const pending = await mkJob('conflict', 'pending', 0);
    // 活动键（R2-B12）保证：同 (assignment, checker) 的 pending+running 不可能共存 ⇒ 冲突只能来自历史/异常数据
    let code = null;
    try { await mkJob('conflict', 'running', 1); } catch (e) { code = e.code; }
    expect(code).toBe('P2002');
    const active = await prisma.gradingJob.findMany({ where: { assignmentId, checkerId: tag + '-conflict', status: { in: ['pending', 'running'] } } });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(pending.id);
  }, 60000);

  it('★W42-3b 冲突分支（防御性）：同对已有 pending 时，僵尸行必须置 failed 而不是 pending（假 prisma 直测分支）', async () => {
    const staleRow = { id: 901, assignment_id: 5, checker_id: 'sha256:ffff', attempts: 1 };
    const calls = [];
    const fakePrisma = {
      $queryRawUnsafe: async (sql, ...args) => {
        // ★R2-B19：两相位 SQL 都含 INTERVAL ? SECOND ⇒ 必须按相位特征区分（否则同一行被两个相位各处置一次）
        if (sql.includes('updated_at >')) return [];                                          // 相位 2（时钟异常）：本用例不涉及
        if (sql.includes('updated_at <')) return [staleRow];                                 // 相位 1（正常过期）：候选僵尸行
        if (sql.includes('AND status = ? LIMIT 1')) return [{ id: 777 }];                      // 已存在 pending ⇒ 冲突
        return [];
      },
      $executeRawUnsafe: async (sql, ...args) => { calls.push(args); return 1; },
    };
    const r = await reclaimStaleRunning({ prisma: fakePrisma, staleMs: 1000, maxAttempts: 3 });
    expect(r.conflicts).toBe(1);
    expect(r.toFailed).toBe(1);
    expect(r.toPending).toBe(0);
    expect(calls[0][0]).toBe('failed');                    // 目标是 failed
    expect(calls[0][1]).toBe(RECLAIM_REASON_CONFLICT);     // 留痕原因
  }, 60000);

  it('★W42-4 回收后可正常领取并完成一个 job（端到端，stub 装置）', async () => {
    const stale = await mkJob('e2e', 'running', 1);
    await backdate(stale.id, 20);
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, maxAttempts: 3 });
    const reclaimed = await prisma.gradingJob.findUnique({ where: { id: stale.id }, select: { status: true } });
    expect(reclaimed.status).toBe('pending');
    const res = await runOnce({
      prisma, jobId: stale.id, dbLimit: 5, deviceCommand: process.execPath, deviceArgs: [STUB],
      stubEnv: { STUB_MODE: 'ok', STUB_SLUG: '1', STUB_SUBMISSIONS: 's01', STUB_MANIFEST_IDS: tag + '-real1', STUB_SCORE: '77' },
      repoRoot: SERVER + '/..', runRootBase: '/tmp', timeoutMs: 60000,
    });
    expect(res.consumed).toBe(true);
    expect(res.status).toBe('done');
    const after = await prisma.gradingJob.findUnique({ where: { id: stale.id }, select: { status: true, writtenCount: true } });
    expect(after.status).toBe('done');
    expect(after.writtenCount).toBe(1);
    const sub = await prisma.submission.findFirst({ where: { assignmentId }, select: { aiScore: true } });
    expect(sub.aiScore).toBe(77);
    expect(r.toPending).toBeGreaterThanOrEqual(1);
    for (const d of fs.readdirSync('/tmp').filter((x) => x.startsWith('r2b4-job-' + stale.id + '-'))) fs.rmSync(path.join('/tmp', d), { recursive: true, force: true });
  }, 120000);
});
