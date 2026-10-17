/**
 * 截止自动造尺（F1/F2/F6）：扫描器 + 触发端点的**独立**语义测试。
 *
 * 覆盖（对应 C1 报告 ①/⑤）：
 *   · 截止扫描 SQL 边界：UTC_TIMESTAMP(3)、7 天回看、standard_hash 冻结快照、非草稿提交、
 *     NOT EXISTS 既有 job、恰好一道 project 题、INTERVAL/LIMIT 钳制；
 *   · 建 job 用哨兵 checker_id；P2002 并发跳过；建前按作业复查活动 job（A1-R1 缓解）；关闭开关；
 *   · 触发端点（assignmentGradingController）：无尺 ⇒ 建自动造尺 job（不再 409）；有尺 ⇒ 建普通 job；
 *     活动 job **按作业**判重（跨 checker）；P2002 竞态复用；正在造尺/无快照仍 409。
 *
 * 全部使用 fake prisma + 模块替身：不查库、不起服务。
 * （仓库的 test/setup.js 会在 exam_system_test 上 seed；本套件自身不读业务表。）
 */
import { jest } from '@jest/globals';
import {
  findDueAssignments,
  resolveAutoGradeConfig,
  scanDueAssignments,
} from '../../../src/infrastructure/dsh/worker/dueAssignmentScanner.js';
import { AUTO_BUILD_CHECKER } from '../../../src/infrastructure/dsh/worker/autoBuild.js';

const silent = { info() {}, warn() {}, log() {} };

/** fake prisma：记录 SQL / 建 job / 活动 job 复查调用；rawImpl 可让查询抛错 */
function fakePrisma({ rows = [], createImpl = null, activeRow = null, rawImpl = null, withActiveLookup = true } = {}) {
  const calls = { sql: [], created: [], activeLookups: [] };
  const gradingJob = {
    create: async ({ data }) => {
      calls.created.push(data);
      if (createImpl) return createImpl(data, calls.created.length);
      return { id: calls.created.length };
    },
  };
  if (withActiveLookup) {
    gradingJob.findFirst = async (args) => { calls.activeLookups.push(args); return activeRow; };
  }
  return {
    calls,
    $queryRawUnsafe: async (sql) => { calls.sql.push(sql); if (rawImpl) return rawImpl(sql); return rows; },
    gradingJob,
  };
}

describe('AUTO 截止扫描', () => {
  it('AUTO-1 resolveAutoGradeConfig：默认开启、7 天回看、60s 扫描；环境可覆盖', () => {
    const d = resolveAutoGradeConfig({});
    expect(d).toMatchObject({ enabled: true, lookbackDays: 7, limit: 20, scanMs: 60000 });
    const e = resolveAutoGradeConfig({ DSH_AUTO_GRADE: '0', DSH_AUTO_GRADE_LOOKBACK_DAYS: '3', DSH_AUTO_GRADE_LIMIT: '5', DSH_AUTO_GRADE_SCAN_MS: '10000' });
    expect(e).toMatchObject({ enabled: false, lookbackDays: 3, limit: 5, scanMs: 10000 });
    // 钳制：回看 1..90 天、limit 1..100、扫描 5s..24h
    expect(resolveAutoGradeConfig({ DSH_AUTO_GRADE_LOOKBACK_DAYS: '0', DSH_AUTO_GRADE_LIMIT: '0', DSH_AUTO_GRADE_SCAN_MS: '1' })).toMatchObject({ lookbackDays: 1, limit: 1, scanMs: 5000 });
    expect(resolveAutoGradeConfig({ DSH_AUTO_GRADE_LOOKBACK_DAYS: '999', DSH_AUTO_GRADE_LIMIT: '9999', DSH_AUTO_GRADE_SCAN_MS: '999999999' })).toMatchObject({ lookbackDays: 90, limit: 100, scanMs: 86400000 });
  });

  it('AUTO-2 SQL 边界：UTC 时间、截止、冻结快照、非草稿提交、无既有 job、恰好一道 project 题', async () => {
    const prisma = fakePrisma({ rows: [] });
    const out = await findDueAssignments({ prisma, lookbackDays: 7, limit: 20 });
    expect(out.ok).toBe(true);
    const sql = prisma.calls.sql[0];
    expect(sql).toContain('UTC_TIMESTAMP(3)');                       // 不用 MySQL NOW()（session 时区）
    expect(sql).toContain('a.end_time <= UTC_TIMESTAMP(3)');         // 已截止
    expect(sql).toContain('DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)'); // 回看窗口
    expect(sql).toContain('a.deleted_at IS NULL');                   // 作业未软删
    expect(sql).toContain("q.type = 'project'");                     // 只认实训题
    expect(sql).toContain('q.deleted_at IS NULL');
    expect(sql).toContain('aq.standard_hash IS NOT NULL');           // 发布冻结快照
    expect(sql).toContain("aq.standard_hash <> ''");                 // 空串也不算（避免推导不出 content_key）
    expect(sql).toContain("s.status <> 'draft'");                    // 至少一份非草稿提交
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM grading_jobs j WHERE j.assignment_id = a.id)'); // 每作业最多一次
    expect(sql).toMatch(/COUNT\(\*\)[\s\S]*= 1/);                 // 恰好一道 project 题（与 r2b20 同口径）
    expect(sql).toContain('ORDER BY a.end_time ASC');
    expect(sql).toContain('LIMIT 20');
  });

  it('AUTO-3 回看天数/limit 钳制进 SQL（1..90 天、1..100 行；0 走默认值）', async () => {
    // 负数按 1 钳制（Math.max(1, …)）；实际链路由 resolveAutoGradeConfig 先行钳制，不会传 0 以下
    const low = fakePrisma({ rows: [] });
    await findDueAssignments({ prisma: low, lookbackDays: -5, limit: -5 });
    expect(low.calls.sql[0]).toContain('INTERVAL 1 DAY');
    expect(low.calls.sql[0]).toContain('LIMIT 1');
    const high = fakePrisma({ rows: [] });
    await findDueAssignments({ prisma: high, lookbackDays: 365, limit: 1000 });
    expect(high.calls.sql[0]).toContain('INTERVAL 90 DAY');
    expect(high.calls.sql[0]).toContain('LIMIT 100');
    // 0/非法值 ⇒ 回落默认 7 天 / 20 行（Number(v) || default 的既有口径；config 层已把 0 钳到 1）
    const zero = fakePrisma({ rows: [] });
    await findDueAssignments({ prisma: zero, lookbackDays: 0, limit: 0 });
    expect(zero.calls.sql[0]).toContain('INTERVAL 7 DAY');
    expect(zero.calls.sql[0]).toContain('LIMIT 20');
  });

  it('AUTO-4 到期作业 ⇒ 建 pending job（哨兵 checker）并返回计数', async () => {
    const prisma = fakePrisma({ rows: [
      { assignmentId: 15, teacherId: 7, title: 't', endTime: new Date('2026-10-20T15:59:00Z') },
      { assignmentId: 16, teacherId: 7, title: 't2', endTime: new Date('2026-10-20T15:59:00Z') },
    ] });
    const out = await scanDueAssignments({ prisma, lookbackDays: 7, limit: 20, log: silent });
    expect(out.ok).toBe(true);
    expect(out.due).toBe(2);
    expect(out.enqueued).toBe(2);
    expect(prisma.calls.created).toEqual([
      { assignmentId: 15, checkerId: AUTO_BUILD_CHECKER, status: 'pending' },
      { assignmentId: 16, checkerId: AUTO_BUILD_CHECKER, status: 'pending' },
    ]);
    expect(out.skipped).toEqual([]);
    // 建前复查：按**作业**查活动 job（不是按 checker）
    expect(prisma.calls.activeLookups[0]).toEqual({
      where: { assignmentId: 15, status: { in: ['pending', 'running'] } },
      select: { id: true },
    });
  });

  it('AUTO-5 ★建前复查发现同作业已有活动 job ⇒ 跳过（A1-R1 跨 checker 竞态收窄）', async () => {
    const prisma = fakePrisma({
      rows: [{ assignmentId: 15, teacherId: 7, title: 't', endTime: new Date() }],
      activeRow: { id: 3 }, // 例如手动触发/另一 worker 已占坑
    });
    const out = await scanDueAssignments({ prisma, log: silent });
    expect(out.ok).toBe(true);
    expect(out.enqueued).toBe(0);
    expect(out.skipped).toEqual([{ assignmentId: 15, reason: 'active_job_exists' }]);
    expect(prisma.calls.created).toEqual([]);
  });

  it('AUTO-6 无 gradingJob.findFirst 能力（精简 fake）⇒ 仍按 NOT EXISTS 语义建 job', async () => {
    const prisma = fakePrisma({
      rows: [{ assignmentId: 15, teacherId: 7, title: 't', endTime: new Date() }],
      withActiveLookup: false,
    });
    const out = await scanDueAssignments({ prisma, log: silent });
    expect(out.enqueued).toBe(1);
    expect(prisma.calls.created).toEqual([{ assignmentId: 15, checkerId: AUTO_BUILD_CHECKER, status: 'pending' }]);
  });

  it('AUTO-7 并发已占坑（P2002）⇒ 跳过，不报错', async () => {
    const prisma = fakePrisma({
      rows: [{ assignmentId: 15, teacherId: 7, title: 't', endTime: new Date() }],
      createImpl: () => { const e = new Error('dup'); e.code = 'P2002'; throw e; },
    });
    const out = await scanDueAssignments({ prisma, log: silent });
    expect(out.ok).toBe(true);
    expect(out.enqueued).toBe(0);
    expect(out.errors).toEqual([]);
    expect(out.skipped).toEqual([{ assignmentId: 15, reason: 'active_job_exists' }]);
  });

  it('AUTO-8 关闭开关 ⇒ 不查库、不建 job', async () => {
    const prisma = fakePrisma({ rows: [{ assignmentId: 15 }] });
    const out = await scanDueAssignments({ prisma, enabled: false, log: silent });
    expect(out).toMatchObject({ ok: true, disabled: true, due: 0, enqueued: 0 });
    expect(prisma.calls.sql).toEqual([]);
    expect(prisma.calls.created).toEqual([]);
  });

  it('AUTO-9 无 raw SQL 能力（fake/未迁移）⇒ ok:false，不炸', async () => {
    const out = await scanDueAssignments({ prisma: {}, log: silent });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('no_raw_sql');
  });

  it('AUTO-10 扫描查询抛错 ⇒ ok:false + query_failed 原因，不建任何 job', async () => {
    const prisma = fakePrisma({ rawImpl: () => { throw new Error('db down'); } });
    const out = await scanDueAssignments({ prisma, log: silent });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/^query_failed:.*db down/);
    expect(out.enqueued).toBe(0);
    expect(prisma.calls.created).toEqual([]);
  });

  it('AUTO-11 单个作业建 job 失败 ⇒ 记入 errors，其余作业继续（不中止扫描）', async () => {
    const prisma = fakePrisma({
      rows: [
        { assignmentId: 15, teacherId: 7, title: 't', endTime: new Date() },
        { assignmentId: 16, teacherId: 7, title: 't2', endTime: new Date() },
      ],
      createImpl: (data) => { if (data.assignmentId === 15) throw new Error('boom'); return { id: 2 }; },
    });
    const out = await scanDueAssignments({ prisma, log: silent });
    expect(out.ok).toBe(true);
    expect(out.enqueued).toBe(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toMatchObject({ assignmentId: 15 });
    expect(out.errors[0].reason).toContain('boom');
  });

  it('AUTO-12 结果行归一化：非法 assignmentId 丢弃、teacherId/title 空值归 null', async () => {
    const prisma = fakePrisma({ rows: [
      { assignmentId: 'abc', teacherId: 7, title: 'x', endTime: null },
      { assignmentId: 0, teacherId: 7, title: 'x', endTime: null },
      { assignmentId: '15', teacherId: null, title: '', endTime: null },
    ] });
    const out = await findDueAssignments({ prisma });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ assignmentId: 15, teacherId: null, title: null, endTime: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 触发端点（assignmentGradingController）：无尺建 build job / 活动 job 按作业判重
// 模块替身必须在动态 import 控制器之前注册（ESM 原生加载器不做 hoist，见 assignment-q9 套件同款写法）。
// ─────────────────────────────────────────────────────────────────────────────
const prismaMock = {
  assignment: { findFirst: jest.fn() },
  gradingChecker: { findFirst: jest.fn() },
  gradingJob: { findFirst: jest.fn(), create: jest.fn() },
};
const resolveRulerMock = jest.fn();
const setJobContentKeyMock = jest.fn();
const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../../../src/utils/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../../../src/utils/logger.js', () => ({ default: loggerMock }));
jest.unstable_mockModule('../../../src/infrastructure/dsh/ruler/dshRulerAssignment.js', () => ({ resolveRulerForAssignment: resolveRulerMock }));
jest.unstable_mockModule('../../../src/infrastructure/dsh/ruler/dshRulerStore.js', () => ({ setJobContentKey: setJobContentKeyMock }));

const { ACTIVE_JOB_STATUSES, triggerAssignmentGrading } = await import('../../../src/controllers/assignmentGradingController.js');

/** 请求/响应替身 */
const req = (id = 15) => ({ params: { id: String(id) }, user: { id: 7 } });
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

const READY_CHECKER = 'sha256:' + 'c'.repeat(64);
const readyRuler = { ok: true, status: 'reuse', zeroLlm: true, ruler: { id: 41, checkerId: READY_CHECKER }, contentKey: 'sha256:ck', contentOk: true };
const missingRuler = { ok: false, reason: 'missing', contentOk: true, contentKey: 'sha256:ck' };

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.assignment.findFirst.mockResolvedValue({ id: 15, title: '实训题' });
  prismaMock.gradingChecker.findFirst.mockResolvedValue(null);
  prismaMock.gradingJob.findFirst.mockResolvedValue(null);
  prismaMock.gradingJob.create.mockResolvedValue({ id: 9001 });
  setJobContentKeyMock.mockResolvedValue({ ok: true });
});

describe('AUTO 控制器触发（无尺建 build job / 活动 job 按作业判重）', () => {
  it('AUTO-T1 无 ready 尺子（missing）⇒ 建哨兵 build job，接口 200（不再 409）', async () => {
    resolveRulerMock.mockResolvedValue(missingRuler);
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(resolveRulerMock).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: 15, mode: 'reuse', waitTimeoutMs: 0, jobTag: 'trigger' }));
    expect(prismaMock.gradingJob.findFirst).toHaveBeenCalledWith({
      where: { assignmentId: 15, status: { in: ACTIVE_JOB_STATUSES } },
      orderBy: { id: 'desc' },
      select: { id: true, createdAt: true, status: true, checkerId: true },
    });
    expect(prismaMock.gradingJob.create).toHaveBeenCalledWith({
      data: { assignmentId: 15, checkerId: AUTO_BUILD_CHECKER, status: 'pending' },
      select: { id: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toContain('自动造尺');
    expect(res.body.data).toMatchObject({ jobId: 9001, checkerId: null, reused: false, build: true, contentKey: 'sha256:ck' });
    expect(setJobContentKeyMock).toHaveBeenCalledWith({ prisma: prismaMock, jobId: 9001, contentKey: 'sha256:ck' });
  });

  it('AUTO-T2 已有 ready 尺子 ⇒ 建普通 job（不造尺）', async () => {
    resolveRulerMock.mockResolvedValue(readyRuler);
    prismaMock.gradingJob.create.mockResolvedValue({ id: 9002 });
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(prismaMock.gradingJob.create).toHaveBeenCalledWith({
      data: { assignmentId: 15, checkerId: READY_CHECKER, status: 'pending' },
      select: { id: true },
    });
    expect(res.body.data).toMatchObject({ jobId: 9002, checkerId: READY_CHECKER, reused: false, build: false, contentKey: 'sha256:ck' });
    expect(res.body.message).not.toContain('自动造尺');
  });

  it('AUTO-T3 ★活动 job 按作业判重：已有别的 checker 的 running job ⇒ 不新建、复用', async () => {
    resolveRulerMock.mockResolvedValue(readyRuler);
    prismaMock.gradingJob.findFirst.mockResolvedValue({ id: 5, checkerId: READY_CHECKER, status: 'running', createdAt: new Date() });
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(prismaMock.gradingJob.create).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ jobId: 5, checkerId: READY_CHECKER, reused: true, build: false });
  });

  it('AUTO-T4 活动 job 本身就是自动造尺 job ⇒ 复用并标 build=true、checkerId=null', async () => {
    resolveRulerMock.mockResolvedValue(missingRuler);
    prismaMock.gradingJob.findFirst.mockResolvedValue({ id: 6, checkerId: AUTO_BUILD_CHECKER, status: 'pending', createdAt: new Date() });
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(prismaMock.gradingJob.create).not.toHaveBeenCalled();
    expect(res.body.data).toEqual({ jobId: 6, checkerId: null, reused: true, build: true });
  });

  it('AUTO-T5 P2002 竞态 ⇒ 复用重查到的活动 job（不 500）', async () => {
    resolveRulerMock.mockResolvedValue(missingRuler);
    prismaMock.gradingJob.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 7, checkerId: AUTO_BUILD_CHECKER });
    const dup = Object.assign(new Error('dup'), { code: 'P2002' });
    prismaMock.gradingJob.create.mockRejectedValueOnce(dup);
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(prismaMock.gradingJob.findFirst).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ jobId: 7, checkerId: null, reused: true, build: true });
  });

  it('AUTO-T6 该内容正在造尺（wait_timeout）⇒ 仍 409 RULER_BUILDING，不重复建 job', async () => {
    resolveRulerMock.mockResolvedValue({ ok: false, reason: 'wait_timeout', status: 'wait_timeout', contentOk: true, contentKey: 'sha256:ck' });
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(prismaMock.gradingJob.create).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 1011, data: { requiresChecker: true, code: 'RULER_BUILDING', reason: 'wait_timeout' } });
    expect(res.body.message).toContain('正在生成中');
  });

  it('AUTO-T7 无发布冻结快照且无 ready 尺子 ⇒ 409 RULER_NOT_READY（不可自动造尺）', async () => {
    resolveRulerMock.mockResolvedValue({ ok: false, reason: 'snapshot_missing', contentOk: false });
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(prismaMock.gradingJob.create).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.body.data).toMatchObject({ requiresChecker: true, code: 'RULER_NOT_READY', reason: 'snapshot_missing' });
    expect(res.body.message).toContain('发布冻结快照');
  });

  it('AUTO-T8 无快照但按作业能查到历史 ready 尺子 ⇒ 回落旧路径建普通 job（行为不变）', async () => {
    resolveRulerMock.mockResolvedValue({ ok: false, reason: 'snapshot_missing', contentOk: false });
    prismaMock.gradingChecker.findFirst.mockResolvedValue({ checkerId: 'sha256:old' });
    prismaMock.gradingJob.create.mockResolvedValue({ id: 9003 });
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(prismaMock.gradingJob.create).toHaveBeenCalledWith({
      data: { assignmentId: 15, checkerId: 'sha256:old', status: 'pending' },
      select: { id: true },
    });
    expect(res.body.data).toMatchObject({ jobId: 9003, checkerId: 'sha256:old', build: false });
    expect(setJobContentKeyMock).not.toHaveBeenCalled(); // 无 contentKey 不写
  });

  it('AUTO-T9 作业不属于该教师 ⇒ 404，不查尺子/不建 job', async () => {
    prismaMock.assignment.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await triggerAssignmentGrading(req(15), res);

    expect(res.statusCode).toBe(404);
    expect(resolveRulerMock).not.toHaveBeenCalled();
    expect(prismaMock.gradingJob.create).not.toHaveBeenCalled();
  });
});
