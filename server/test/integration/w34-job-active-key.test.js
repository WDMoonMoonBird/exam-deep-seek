/**
 * W34（R2-B12②③）：grading_jobs 活动键语义（活动态唯一、终态可多行）+ 触发端点幂等 + 记账不再 P2002。
 * 只在测试库；自建探针并清理。
 */
import prisma from '../../src/utils/prisma.js';
import { triggerAssignmentGrading, ACTIVE_JOB_STATUSES } from '../../src/controllers/assignmentGradingController.js';
import { finishJob, runOnce } from '../../src/infrastructure/dsh/worker/index.js';

const tag = 'w34-activekey-' + Date.now();
let assignmentId = null;
let questionId = null;
let teacherId = null;
const CHECKER = 'sha256:' + 'c'.repeat(64);

function fakeRes() {
  const out = {};
  out.status = (c) => { out._status = c; return out; };
  out.json = (b) => { out._body = b; return out; };
  return out;
}

describe('W34 活动键语义', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    teacherId = teacher.id;
    const q = await prisma.question.create({ data: { teacherId, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
  }, 60000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
  }, 60000);

  it('W34-1 ★终态可多行共存（done/failed/needs_rerun 各自可重复）', async () => {
    for (const status of ['needs_rerun', 'needs_rerun', 'failed', 'failed', 'done', 'done']) {
      await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHECKER, status } });
    }
    const rows = await prisma.gradingJob.groupBy({ by: ['status'], where: { assignmentId, checkerId: CHECKER }, _count: { _all: true } });
    const map = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    expect(map.needs_rerun).toBe(2);
    expect(map.failed).toBe(2);
    expect(map.done).toBe(2);
  }, 60000);

  it('W34-2 ★活动态每 (assignment, checker) 至多一行：第二行被唯一键拒绝（P2002）', async () => {
    const first = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHECKER, status: 'pending' } });
    let code = null;
    try { await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHECKER, status: 'pending' } }); } catch (e) { code = e.code; }
    expect(code).toBe('P2002');
    // running 与 pending 同属活动态 ⇒ 也互斥
    await prisma.gradingJob.update({ where: { id: first.id }, data: { status: 'running' } });
    let code2 = null;
    try { await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHECKER, status: 'pending' } }); } catch (e) { code2 = e.code; }
    expect(code2).toBe('P2002');
    // ★终态不占活动键 ⇒ 活动行结束（置终态）后可再建新的活动行
    await prisma.gradingJob.update({ where: { id: first.id }, data: { status: 'needs_rerun' } });
    const next = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHECKER, status: 'pending' } });
    expect(next.id).toBeGreaterThan(0);
    await prisma.gradingJob.update({ where: { id: next.id }, data: { status: 'failed' } });
    expect(ACTIVE_JOB_STATUSES).toEqual(['pending', 'running']);
  }, 60000);

  it('W34-3 ★记账不再 P2002：已有终态行 + 一次失败 ⇒ finishJob 正常写入', async () => {
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHECKER, status: 'pending' } });
    const res = await runOnce({
      prisma, jobId: job.id, deviceCommand: 'node', deviceArgs: ['does-not-matter.mjs'],
      repoRoot: '/tmp', runRootBase: '/tmp', timeoutMs: 5000,
      deps: { runDshGrader: async () => ({ exitCode: 6, timedOut: false, stdout: '', stderr: '' }) },
    });
    expect(res.status).toBe('needs_rerun');
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, lastError: true } });
    expect(after.status).toBe('needs_rerun');
    // 无产物时 runOnce 先判 artifacts_missing（exit=6 也记录在原因串里）；两者都属正常记账，关键是「不抛 P2002」
    expect(after.lastError).toMatch(/^(device_exit_6|artifacts_missing:exit=6)$/);
    // 再记一次同名终态（模拟第二条历史行）⇒ 不抛 P2002
    const job2 = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHECKER, status: 'pending' } });
    await expect(finishJob({ prisma, jobId: job2.id, status: 'needs_rerun', error: 'device_exit_127' })).resolves.toBeTruthy();
  }, 90000);

  it('W34-4 ★触发端点幂等：重复触发复用同一活动 job；终态行不阻塞新活动 job', async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.create({ data: { checkerId: CHECKER, assignmentId, questionId, versionHash: 'v', rubricHash: 'r', standardHash: 's', status: 'ready', checkerJson: { checker_id: CHECKER, sections: [] } } });
    const req = { params: { id: String(assignmentId) }, user: { id: teacherId } };
    const r1 = fakeRes(); await triggerAssignmentGrading(req, r1);
    expect(r1._body.data.reused).toBe(false);
    const r2 = fakeRes(); await triggerAssignmentGrading(req, r2);
    expect(r2._body.data.reused).toBe(true);
    expect(r2._body.data.jobId).toBe(r1._body.data.jobId);
    const active = await prisma.gradingJob.findMany({ where: { assignmentId, checkerId: CHECKER, status: { in: ACTIVE_JOB_STATUSES } } });
    expect(active).toHaveLength(1);
    // 把该活动 job 置终态 ⇒ 再触发应**新建**（终态不占活动键）
    await prisma.gradingJob.update({ where: { id: active[0].id }, data: { status: 'done' } });
    const r3 = fakeRes(); await triggerAssignmentGrading(req, r3);
    expect(r3._body.data.reused).toBe(false);
    expect(r3._body.data.jobId).not.toBe(r1._body.data.jobId);
  }, 90000);
});
