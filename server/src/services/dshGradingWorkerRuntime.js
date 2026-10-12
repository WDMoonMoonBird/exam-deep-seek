/**
 * dshGradingWorkerRuntime.js —— R2-B5（1）：常驻 worker 循环。
 *
 * 形态：轮询 pending job → runOnce（内置进程内闸 + DB 级闸）→ 空闲指数退避 → 循环。
 *  - 空闲/闸满：退避从 idleBackoffMs 起、乘 2 增长到 maxBackoffMs（全部可配，见 parseWorkerConfig）。
 *  - 失败：单独计数 + 退避；连续失败 ≥ maxConsecutiveFailures ⇒ 停止并返回退出码 3（可判定）。
 *  - 优雅退出：stop()（SIGINT/SIGTERM 触发）只置标志 ⇒ 当前 job 跑完后再退出，返回退出码 0，退避等待可被立即打断。
 *  - 不热循环：任何一次迭代都不会在无退避的情况下重复消费同一个 job（runOnce = 原子领取 + attempts 上限）。
 */
export const EXIT = { ok: 0, stopRequested: 0, tooManyFailures: 3, fatal: 4 };

export function parseWorkerConfig(env = process.env) {
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    idleBackoffMs: num(env.DSH_WORKER_IDLE_BACKOFF_MS, 500),
    maxBackoffMs: num(env.DSH_WORKER_MAX_BACKOFF_MS, 30000),
    failureBackoffMs: num(env.DSH_WORKER_FAILURE_BACKOFF_MS, 2000),
    maxConsecutiveFailures: num(env.DSH_WORKER_MAX_CONSECUTIVE_FAILURES, 5),
    dbLimit: env.DSH_WORKER_DB_LIMIT ? num(env.DSH_WORKER_DB_LIMIT, null) : undefined,
    // R2-B17：僵尸 running 行回收阈值（默认 15 分钟；见 dshStaleJobReclaimer）
    staleRunningMs: env.DSH_WORKER_STALE_RUNNING_MS ? num(env.DSH_WORKER_STALE_RUNNING_MS, 15 * 60 * 1000) : undefined,
  };
}

export function nextBackoff({ current, max, failures = 0, failureBase = 2000 }) {
  if (failures > 0) return Math.min(failureBase * 2 ** (failures - 1), max);
  return Math.min(Math.max(current * 2, 500), max);
}

/** 可被 stop() 打断的睡眠（优雅退出不必等满退避） */
export function sleepInterruptible(ms, isStopping) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { clearInterval(chk); resolve('timeout'); }, ms);
    const chk = setInterval(() => {
      if (isStopping()) { clearTimeout(t); clearInterval(chk); resolve('stopping'); }
    }, Math.min(50, Math.max(10, Math.floor(ms / 4) || 10)));
    if (chk.unref) chk.unref();
  });
}

/**
 * 常驻循环（每轮尝试消费一个 job；消费不到就退避）。
 * @returns {Promise<{exitCode:number, iterations:number, consumed:number, failures:number}>}
 */
export async function runWorkerLoop({
  prisma,
  runOnceImpl,
  config = parseWorkerConfig(),
  stopSignal = { stopped: false },
  log = console,
  maxIterations = Infinity,
} = {}) {
  let backoff = config.idleBackoffMs;
  let failures = 0;
  let iterations = 0;
  let consumed = 0;
  const isStopping = () => !!stopSignal.stopped;

  while (iterations < maxIterations) {
    iterations += 1;
    if (isStopping()) return { exitCode: EXIT.stopRequested, iterations, consumed, failures };
    let out = null;
    try {
      out = await runOnceImpl({ prisma, dbLimit: config.dbLimit });
      failures = 0;
      backoff = config.idleBackoffMs;
    } catch (err) {
      failures += 1;
      const wait = nextBackoff({ current: backoff, max: config.maxBackoffMs, failures, failureBase: config.failureBackoffMs });
      if (log && log.warn) log.warn('[r2b5-worker] runOnce 抛错：' + (err && err.message) + '，退避 ' + wait + 'ms（连续失败 ' + failures + '）');
      if (failures >= config.maxConsecutiveFailures) {
        return { exitCode: EXIT.tooManyFailures, iterations, consumed, failures };
      }
      const why = await sleepInterruptible(wait, isStopping);
      if (why === 'stopping') return { exitCode: EXIT.stopRequested, iterations, consumed, failures };
      continue;
    }
    if (out && out.consumed) { consumed += 1; continue; }
    const wait = nextBackoff({ current: backoff, max: config.maxBackoffMs });
    backoff = wait;
    const why = await sleepInterruptible(wait, isStopping);
    if (why === 'stopping') return { exitCode: EXIT.stopRequested, iterations, consumed, failures };
  }
  return { exitCode: EXIT.ok, iterations, consumed, failures };
}
