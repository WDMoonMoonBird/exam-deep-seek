/**
 * in-memory-rate-limiter-extra.test.js — InMemoryRateLimiter 边界补充与缺陷取证。
 * 现有 in-memory-rate-limiter.test.js 覆盖基础封锁/重置/窗口/cleanup；本文件补：
 *   - maxFailures=0、未记录 key、recordSuccess 未记录 key、cleanup 空 map
 *   - 窗口过期后继续失败是否重新封锁（滑动窗口语义取证，见 BUG-UNIT-01）
 */
import { InMemoryRateLimiter } from '../../../src/infrastructure/rate-limit/in-memory-rate-limiter.js';

describe('InMemoryRateLimiter — 边界', () => {
  it('maxFailures=0 → 首次失败即封锁', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 0, windowMs: 60000 });
    expect(await rl.isBlocked('k')).toBe(false);
    await rl.recordFailure('k');
    expect(await rl.isBlocked('k')).toBe(true);
  });

  it('未记录 key → isBlocked=false', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 3, windowMs: 60000 });
    expect(await rl.isBlocked('never-seen')).toBe(false);
  });

  it('recordSuccess 未记录 key → 不抛错', async () => {
    const rl = new InMemoryRateLimiter();
    await expect(rl.recordSuccess('unknown')).resolves.toBeUndefined();
  });

  it('cleanup 空 map → 不抛错', async () => {
    const rl = new InMemoryRateLimiter();
    expect(() => rl.cleanup()).not.toThrow();
  });

  it('recordSuccess 后重新计数（同一窗口内再次失败可重新封锁）', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 2, windowMs: 60000 });
    await rl.recordFailure('ip'); await rl.recordFailure('ip');
    expect(await rl.isBlocked('ip')).toBe(true);
    await rl.recordSuccess('ip');
    await rl.recordFailure('ip'); await rl.recordFailure('ip');
    expect(await rl.isBlocked('ip')).toBe(true);
  });
});

describe('InMemoryRateLimiter — 滑动窗口语义取证（BUG-UNIT-01）', () => {
  it('【取证】窗口过期后继续失败 → 不再重新封锁（since 永不刷新）', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 2, windowMs: 100 });
    await rl.recordFailure('ip');
    await rl.recordFailure('ip');
    expect(await rl.isBlocked('ip')).toBe(true);
    // 窗口过期
    await new Promise((r) => setTimeout(r, 150));
    expect(await rl.isBlocked('ip')).toBe(false);
    // 继续失败（攻击者持续尝试）
    await rl.recordFailure('ip');
    await rl.recordFailure('ip');
    await rl.recordFailure('ip');
    // BUG-009 已修复（2026-08-16，滑动窗口）：窗口过期后继续失败，
    // 窗口内计数重新累积 → 再次封锁（取证断言已翻转）
    expect(await rl.isBlocked('ip')).toBe(true);
  });
});
