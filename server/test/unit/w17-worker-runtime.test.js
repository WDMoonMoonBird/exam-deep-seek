/**
 * W17（R2-B5）：常驻循环的纯语义 —— 空闲退避、失败退避与上限、优雅退出（可打断睡眠）、DB 级闸的 SQL 形态。
 * 不触库、不起服务。
 */
import { EXIT, nextBackoff, parseWorkerConfig, runWorkerLoop, sleepInterruptible } from '../../src/infrastructure/dsh/worker/dshGradingWorkerRuntime.js';
import { buildClaimSql } from '../../src/infrastructure/dsh/worker/index.js';

describe('W17 配置与退避', () => {
  it('W17-1 parseWorkerConfig：默认值可被环境覆盖（空闲/上限/失败/次数/DB 闸）', () => {
    const d = parseWorkerConfig({});
    expect(d.idleBackoffMs).toBe(500);
    expect(d.maxBackoffMs).toBe(30000);
    expect(d.failureBackoffMs).toBe(2000);
    expect(d.maxConsecutiveFailures).toBe(5);
    const e = parseWorkerConfig({ DSH_WORKER_IDLE_BACKOFF_MS: '20', DSH_WORKER_MAX_BACKOFF_MS: '200', DSH_WORKER_FAILURE_BACKOFF_MS: '30', DSH_WORKER_MAX_CONSECUTIVE_FAILURES: '2', DSH_WORKER_DB_LIMIT: '3' });
    expect(e).toMatchObject({ idleBackoffMs: 20, maxBackoffMs: 200, failureBackoffMs: 30, maxConsecutiveFailures: 2, dbLimit: 3 });
  });

  it('W17-2 nextBackoff：空闲指数增长并有上限；失败按次数增长', () => {
    expect(nextBackoff({ current: 500, max: 30000 })).toBe(1000);
    expect(nextBackoff({ current: 30000, max: 30000 })).toBe(30000);
    expect(nextBackoff({ current: 1, max: 30000 })).toBe(500); // 下限
    expect(nextBackoff({ current: 0, max: 60000, failures: 1, failureBase: 2000 })).toBe(2000);
    expect(nextBackoff({ current: 0, max: 60000, failures: 3, failureBase: 2000 })).toBe(8000);
    expect(nextBackoff({ current: 0, max: 5000, failures: 9, failureBase: 2000 })).toBe(5000); // 封顶
  });
});

describe('W17 常驻循环', () => {
  const cfg = { idleBackoffMs: 10, maxBackoffMs: 80, failureBackoffMs: 10, maxConsecutiveFailures: 3, dbLimit: undefined };

  it('W17-3 无活可干 ⇒ 空闲退避并继续；消费到活 ⇒ 不额外 sleep', async () => {
    let calls = 0;
    const res = await runWorkerLoop({
      prisma: {},
      runOnceImpl: async () => { calls += 1; return calls <= 2 ? { consumed: true } : { consumed: false, reason: 'no_pending_job' }; },
      config: cfg,
      maxIterations: 4,
    });
    expect(calls).toBe(4);
    expect(res.consumed).toBe(2);
    expect(res.exitCode).toBe(EXIT.ok);
  });

  it('W17-4 优雅退出：stop() 后当前迭代结束即退出（退出码 0，可打断退避等待）', async () => {
    const stopSignal = { stopped: false };
    let iterations = 0;
    const t0 = Date.now();
    const p = runWorkerLoop({
      prisma: {},
      runOnceImpl: async () => { iterations += 1; return { consumed: false, reason: 'no_pending_job' }; },
      config: { ...cfg, idleBackoffMs: 5000, maxBackoffMs: 5000 },
      stopSignal,
      maxIterations: 100,
    });
    setTimeout(() => { stopSignal.stopped = true; }, 30);
    const res = await p;
    expect(res.exitCode).toBe(EXIT.stopRequested);
    expect(iterations).toBe(1); // 不吞掉后续迭代
    expect(Date.now() - t0).toBeLessThan(3000); // 退避被立即打断（未等满 5s）
  });

  it('W17-5 失败不热循环：连续失败达上限 ⇒ 退出码 3（并逐次退避）', async () => {
    let calls = 0;
    const t0 = Date.now();
    const res = await runWorkerLoop({
      prisma: {},
      runOnceImpl: async () => { calls += 1; throw new Error('boom'); },
      config: { ...cfg, maxConsecutiveFailures: 3 },
      maxIterations: 50,
    });
    expect(calls).toBe(3);
    expect(res.exitCode).toBe(EXIT.tooManyFailures);
    expect(res.failures).toBe(3);
    expect(Date.now() - t0).toBeLessThan(3000); // 有退避但不是热循环（3×10ms + 开销）
  });

  it('W17-6 sleepInterruptible：stopping 时立即返回，否则按时返回', async () => {
    const t0 = Date.now();
    expect(await sleepInterruptible(5000, () => true)).toBe('stopping');
    expect(Date.now() - t0).toBeLessThan(500);
    expect(await sleepInterruptible(30, () => false)).toBe('timeout');
  });
});

describe('W17 DB 级闸 SQL', () => {
  it('W17-7 buildClaimSql：开闸时含「running 行数 < limit」子句；关闸时不含', () => {
    const gated = buildClaimSql({ hasDbGate: true });
    expect(gated).toContain("status = 'pending'");
    expect(gated).toContain('COUNT(*)');
    expect(gated).toContain("status = 'running'");
    expect(gated).toContain('< ?');
    const plain = buildClaimSql({ hasDbGate: false });
    expect(plain).not.toContain('COUNT(*)');
    expect(plain).toContain("status = 'pending'");
  });
});
