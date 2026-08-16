import { InMemoryRateLimiter } from '../../../src/infrastructure/rate-limit/in-memory-rate-limiter.js';

describe('InMemoryRateLimiter', () => {
  it('未达阈值 → 不封锁', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 3, windowMs: 60000 });
    for (let i = 0; i < 2; i++) await rl.recordFailure('ip:1');
    expect(await rl.isBlocked('ip:1')).toBe(false);
  });
  it('达到阈值 → 封锁', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 3, windowMs: 60000 });
    for (let i = 0; i < 3; i++) await rl.recordFailure('ip:1');
    expect(await rl.isBlocked('ip:1')).toBe(true);
  });
  it('成功登录 → 重置', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 3, windowMs: 60000 });
    await rl.recordFailure('ip:1');
    await rl.recordSuccess('ip:1');
    expect(await rl.isBlocked('ip:1')).toBe(false);
  });
  it('窗口过期后解除封锁', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 2, windowMs: 100 });
    await rl.recordFailure('ip:1');
    await rl.recordFailure('ip:1');
    expect(await rl.isBlocked('ip:1')).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    expect(await rl.isBlocked('ip:1')).toBe(false);
  });
  it('cleanup 只清两倍窗口前的记录', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 2, windowMs: 1000 });
    await rl.recordFailure('old-key');
    rl.map.set('old-key', [Date.now() - 3000]); // 手动老化（滑动窗口：时间戳数组）
    await rl.recordFailure('fresh-key');
    rl.cleanup();
    expect(rl.map.has('old-key')).toBe(false);
    expect(rl.map.has('fresh-key')).toBe(true);
  });

  // BUG-009 修复验证：滑动窗口——最早失败过期后自动解除（固定窗口会持续封锁到窗口结束）
  it('滑动窗口：最早失败过期即解除封锁', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 3, windowMs: 200 });
    await rl.recordFailure('ip:1');
    await new Promise((r) => setTimeout(r, 100));
    await rl.recordFailure('ip:1');
    await rl.recordFailure('ip:1');
    expect(await rl.isBlocked('ip:1')).toBe(true);
    // 最早失败已过期（100ms 前），窗口内只剩 2 次 → 自动解除
    await new Promise((r) => setTimeout(r, 110));
    expect(await rl.isBlocked('ip:1')).toBe(false);
  });

  it('recordFailure 只保留窗口内时间戳（防内存增长）', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 10, windowMs: 100 });
    await rl.recordFailure('ip:1');
    await new Promise((r) => setTimeout(r, 120));
    await rl.recordFailure('ip:1');
    expect(rl.map.get('ip:1')).toHaveLength(1);
  });
});