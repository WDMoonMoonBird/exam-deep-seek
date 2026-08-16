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
    rl.map.get('old-key').since = Date.now() - 3000;
    await rl.recordFailure('fresh-key');
    rl.cleanup();
    expect(rl.map.has('old-key')).toBe(false);
    expect(rl.map.has('fresh-key')).toBe(true);
  });
});