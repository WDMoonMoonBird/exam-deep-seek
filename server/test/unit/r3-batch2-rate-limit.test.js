/**
 * r3-batch2-rate-limit.test.js — batch2 R3-RATE 回归断言（C 写域）
 * 覆盖：createRateLimitMiddleware（计数/429 body/键函数）、登录全局失败守卫阈值。
 */
import {
  createRateLimitMiddleware,
  createLoginGlobalFailureGuard,
  defaultRateLimitKey,
  RATE_LIMIT_MESSAGE,
  LOGIN_GLOBAL_FAIL_MAX,
} from '../../src/infrastructure/rate-limit/rate-limit-middleware.js';
import { InMemoryRateLimiter } from '../../src/infrastructure/rate-limit/in-memory-rate-limiter.js';

function makeRes() {
  const out = { statusCode: 200, body: null };
  const res = {
    status(code) { out.statusCode = code; return res; },
    json(body) { out.body = body; return res; },
  };
  return { res, out };
}

describe('R3-RATE · createRateLimitMiddleware', () => {
  it('窗口内第 max 次通过、第 max+1 次起 429(code 1003)', async () => {
    const limiter = new InMemoryRateLimiter({ maxFailures: 3, windowMs: 60000 });
    const mw = createRateLimitMiddleware({ limiter, max: 3 });
    let nextCount = 0;
    const req = { user: { id: 7 } };
    for (let i = 0; i < 3; i += 1) {
      const { res } = makeRes();
      await mw(req, res, () => { nextCount += 1; });
    }
    expect(nextCount).toBe(3);
    const { res, out } = makeRes();
    await mw(req, res, () => { nextCount += 1; });
    expect(out.statusCode).toBe(429);
    expect(out.body).toEqual({ code: 1003, message: RATE_LIMIT_MESSAGE, data: null });
    expect(nextCount).toBe(3);
  });

  it('默认键：已鉴权按 user:<id>、未鉴权按 ip:<addr>', () => {
    expect(defaultRateLimitKey({ user: { id: 42 }, ip: '203.0.113.10' })).toBe('user:42');
    expect(defaultRateLimitKey({ ip: '203.0.113.10' })).toBe('ip:203.0.113.10');
    expect(defaultRateLimitKey({ socket: { remoteAddress: '10.0.0.1' } })).toBe('ip:10.0.0.1');
  });

  it('注入 store 可检查 check() 结果（limited 不记录）', async () => {
    const limiter = new InMemoryRateLimiter({ maxFailures: 2, windowMs: 60000 });
    const mw = createRateLimitMiddleware({ limiter, max: 2, keyFn: () => 'k' });
    expect((await mw.check({})).limited).toBe(false);
    expect((await mw.check({})).limited).toBe(false);
    const third = await mw.check({});
    expect(third.limited).toBe(true);
    const fourth = await mw.check({});
    expect(fourth.limited).toBe(true);   // 被拒请求不得继续抬高计数
  });
});

describe('R3-RATE · 登录全局失败守卫', () => {
  it('阈值：达到 max 次失败后熔断；注入小窗口可测边界', async () => {
    const store = new InMemoryRateLimiter({ maxFailures: 3, windowMs: 60000, maxKeys: 8 });
    const guard = createLoginGlobalFailureGuard({ store });
    expect(await guard.isBlocked()).toBe(false);
    await guard.recordFailure();
    await guard.recordFailure();
    expect(await guard.isBlocked()).toBe(false);
    await guard.recordFailure();
    expect(await guard.isBlocked()).toBe(true);
    // cleanup 只回收窗口 2 倍外的过期键，不重置窗口内的熔断（语义正确）；新守卫/新 store 才从 0 开始
    guard.cleanup();
    expect(await guard.isBlocked()).toBe(true);
    const fresh = createLoginGlobalFailureGuard({ store: new InMemoryRateLimiter({ maxFailures: 3, windowMs: 60000, maxKeys: 8 }) });
    expect(await fresh.isBlocked()).toBe(false);
  });

  it('生产阈值常量固定为 100 次/分钟（不随单测漂移）', () => {
    expect(LOGIN_GLOBAL_FAIL_MAX).toBe(100);
  });
});
