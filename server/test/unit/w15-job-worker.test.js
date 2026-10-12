/**
 * W15（R2-B4）：执行器的纯语义 —— 并发闸（不重叠）、原子领取（不双消费）、
 * 失败/超时语义（needs_rerun 不写分；超时可重试）。全部用假 prisma/假装置：不触库、不起服务。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_MAX_ATTEMPTS,
  JOB_STATUS,
  claimJobAtomic,
  createGate,
  finishJob,
  runOnce,
} from '../../src/services/dshGradingJobWorker.js';

/** 极简假 prisma：只实现 worker 用到的四个方法 */
function fakePrisma({ initialJobs = [], affectedByClaim = 1 } = {}) {
  const jobs = new Map(initialJobs.map((j) => [j.id, { attempts: 0, status: 'pending', writtenCount: 0, skippedCount: 0, lastError: null, assignmentId: 1, checkerId: 'sha256:x', ...j }]));
  const updates = [];
  return {
    jobs, updates,
    gradingJob: {
      findFirst: async ({ where }) => [...jobs.values()].find((j) => j.status === where.status) || null,
      findUnique: async ({ where }) => jobs.get(where.id) || null,
      update: async ({ where, data }) => { updates.push({ id: where.id, data }); jobs.set(where.id, { ...jobs.get(where.id), ...data }); return jobs.get(where.id); },
    },
    submission: { update: async ({ where, data }) => { updates.push({ sub: where.id, data }); return { id: where.id }; } },
    $executeRawUnsafe: async (_sql, id) => {
      if (Number(affectedByClaim) === 1 && jobs.has(id)) {
        const cur = jobs.get(id);
        jobs.set(id, { ...cur, status: 'running', attempts: (cur.attempts || 0) + 1 });
      }
      return affectedByClaim;
    },
  };
}

// 假装置：从 runOnce 传入的 args 里取真实 runRoot（否则产物写偏，判据会退化成 artifacts_missing）
const okDevice = ({ exitCode = 0, artifacts = true, timedOut = false } = {}) => async (args) => {
  if (artifacts && args && args.runRoot) {
    const dir = path.join(args.runRoot, 'out', 'checker');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.resolve(process.cwd(), 'scripts', 'fixtures', 'checker.sample.json'), path.join(dir, 'checker.json'));
    const mdir = path.join(args.runRoot, 'out', 'measure');
    fs.mkdirSync(mdir, { recursive: true });
    const checker = JSON.parse(fs.readFileSync(path.join(dir, 'checker.json'), 'utf8'));
    fs.writeFileSync(path.join(mdir, 'sub-1.json'), JSON.stringify({
      schema_version: 'checker-result/1', checker_id: checker.checker_id,
      canonical_sha256: 'sha256:' + 'z'.repeat(64),
      submission: { id: 1, root_rel: '.', digest: 'sha256:' + 'd'.repeat(64), file_count: 3 },
      totals: { score: 55, max_score: checker.scoring.max_score, aggregate: checker.scoring.aggregate },
      items: [], reconciliation: { expected_items: 1, evaluated_items: 1, unsupported: [], errors: [] },
      stale: false, run_meta: { exit_code: exitCode },
    }));
  }
  return { exitCode, timedOut, stdout: '', stderr: '', key_len: 12, env_keys: [] };
};

describe('W15 并发闸（不并发拉起）', () => {
  it('W15-1 limit=1 ⇒ 两个任务不重叠；limit=2 ⇒ 允许重叠（对照组）', async () => {
    const runSpan = async (gate, log, ms) => {
      expect(gate.tryAcquire()).toBe(true);
      const start = Date.now();
      await new Promise((r) => setTimeout(r, ms));
      log.push([start, Date.now()]);
      gate.release();
    };
    const log1 = [];
    const g1 = createGate(1);
    const t1 = (async () => { await runSpan(g1, log1, 120); })();
    await new Promise((r) => setTimeout(r, 30));
    expect(g1.tryAcquire()).toBe(false); // ★闸满 ⇒ 第二个任务不得启动（不并发拉起）
    const waited = Date.now();
    while (!g1.tryAcquire()) { await new Promise((r) => setTimeout(r, 15)); if (Date.now() - waited > 3000) break; }
    const start2 = Date.now();
    await new Promise((r) => setTimeout(r, 60));
    log1.push([start2, Date.now()]);
    g1.release();
    await t1;
    expect(log1).toHaveLength(2);
    const spans1 = log1.slice().sort((x, y) => x[0] - y[0]); // 按开始时间排序（记录顺序≠时间顺序）
    expect(spans1[1][0]).toBeGreaterThanOrEqual(spans1[0][1]); // ★两段区间不重叠（limit=1 时不并发拉起）

    const log2 = [];
    const g2 = createGate(2);
    await Promise.all([runSpan(g2, log2, 120), runSpan(g2, log2, 120)]);
    const spans2 = log2.slice().sort((x, y) => x[0] - y[0]);
    expect(spans2[1][0]).toBeLessThan(spans2[0][1]); // 对照组：limit=2 时允许重叠
  });

  it('W15-2 闸满 ⇒ runOnce 不领取（job 保持 pending，attempts 不变）', async () => {
    const prisma = fakePrisma({ initialJobs: [{ id: 11 }] });
    const gate = createGate(1);
    gate.tryAcquire();
    const out = await runOnce({ prisma, jobId: 11, gate, deps: { runDshGrader: okDevice() } });
    expect(out.consumed).toBe(false);
    expect(out.reason).toBe('gate_full');
    expect(prisma.jobs.get(11).status).toBe('pending');
    expect(prisma.jobs.get(11).attempts).toBe(0);
    gate.release();
  });
});

describe('W15 原子领取', () => {
  it('W15-3 affectedRows=1 ⇒ 领到；=0 ⇒ 已被别的 worker 领走（不双消费）', async () => {
    const p1 = fakePrisma({ initialJobs: [{ id: 21 }], affectedByClaim: 1 });
    const claimed = await claimJobAtomic({ prisma: p1, jobId: 21 });
    expect(claimed).toBeTruthy();
    expect(claimed.status).toBe('running');
    const p2 = fakePrisma({ initialJobs: [{ id: 21 }], affectedByClaim: 0 });
    expect(await claimJobAtomic({ prisma: p2, jobId: 21 })).toBe(null);
  });
});

describe('W15 失败与超时语义', () => {
  it('W15-4 装置 exit 6 ⇒ job=needs_rerun，绝不写分（无 submission.update）', async () => {
    const prisma = fakePrisma({ initialJobs: [{ id: 31 }] });
    const runRootBase = fs.mkdtempSync(path.join(os.tmpdir(), 'w15-'));
    const out = await runOnce({
      prisma, jobId: 31, gate: createGate(1), runRootBase,
      deps: { runDshGrader: okDevice({ exitCode: 6 }) },
    });
    expect(out.consumed).toBe(true);
    expect(out.status).toBe(JOB_STATUS.needsRerun);
    expect(out.reason).toBe('device_exit_6');
    expect(prisma.jobs.get(31).status).toBe('needs_rerun');
    expect(prisma.jobs.get(31).lastError).toContain('device_exit_6');
    expect(prisma.updates.filter((u) => u.sub).length).toBe(0);
    fs.rmSync(runRootBase, { recursive: true, force: true });
  });

  it('W15-5 产物缺失 ⇒ needs_rerun/artifacts_missing', async () => {
    const prisma = fakePrisma({ initialJobs: [{ id: 41 }] });
    const runRootBase = fs.mkdtempSync(path.join(os.tmpdir(), 'w15-'));
    const out = await runOnce({ prisma, jobId: 41, runRootBase, deps: { runDshGrader: okDevice({ artifacts: false }) } });
    expect(out.reason).toBe('artifacts_missing');
    expect(prisma.jobs.get(41).status).toBe('needs_rerun');
    fs.rmSync(runRootBase, { recursive: true, force: true });
  });

  it('W15-6 超时 ⇒ 回 pending 可重试 + 释放闸；attempts 用尽 ⇒ failed', async () => {
    const runRootBase = fs.mkdtempSync(path.join(os.tmpdir(), 'w15-'));
    const p1 = fakePrisma({ initialJobs: [{ id: 51, attempts: 0 }] });
    const g1 = createGate(1);
    const out1 = await runOnce({ prisma: p1, jobId: 51, gate: g1, runRootBase, deps: { runDshGrader: okDevice({ timedOut: true }) } });
    expect(out1.timedOut).toBe(true);
    expect(p1.jobs.get(51).status).toBe(JOB_STATUS.pending); // 可重试
    expect(g1.active).toBe(0);                              // 闸已释放
    const p2 = fakePrisma({ initialJobs: [{ id: 52, attempts: DEFAULT_MAX_ATTEMPTS }] });
    const out2 = await runOnce({ prisma: p2, jobId: 52, runRootBase, deps: { runDshGrader: okDevice({ timedOut: true }) } });
    expect(out2.status).toBe(JOB_STATUS.failed);            // 次数用尽
    expect(p2.jobs.get(52).status).toBe('failed');
    fs.rmSync(runRootBase, { recursive: true, force: true });
  });

  it('W15-7 finishJob 只改状态/计数/错误（不改 assignment/checker 归属）', async () => {
    const prisma = fakePrisma({ initialJobs: [{ id: 61 }] });
    await finishJob({ prisma, jobId: 61, status: JOB_STATUS.needsRerun, written: 0, skipped: 2, error: 'all_needs_rerun' });
    const patch = prisma.updates.at(-1).data;
    expect(Object.keys(patch).sort()).toEqual(['lastError', 'skippedCount', 'status', 'writtenCount']);
  });
});
