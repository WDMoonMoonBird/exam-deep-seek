/**
 * rate-limit-middleware.js —— ★R3-RATE（P1，2026-10-18 / M5 · R16 · R24）
 *
 * 两个出口：
 *   1) createRateLimitMiddleware —— 应用层限流中间件工厂（LLM 生成/解析、文件上传等写入口）；
 *   2) createLoginGlobalFailureGuard —— 登录**全局失败速率**守卫（跨 IP 密码喷洒的公共熔断面）。
 *
 * 为什么在 infrastructure：app.js 与 interface/controllers 都要用；复用 InMemoryRateLimiter 的
 * 滑动窗口实现（把 recordFailure 当作「命中计数」使用，窗口/过期语义完全一致，避免再造第二套窗口）。
 *
 * 429 口径与全站一致：{ code: 1003, message: '请求过于频繁，请稍后再试', data: null }（与 nginx 429 同码）。
 */
import { InMemoryRateLimiter } from './in-memory-rate-limiter.js';

export const RATE_LIMIT_MESSAGE = '请求过于频繁，请稍后再试';

/**
 * 默认限流键：已鉴权入口用 user:<id>（同一账号跨 IP 也聚合）；未鉴权/早于 auth 的入口回落 ip:<ip>。
 * @param {object} req
 * @returns {string}
 */
export function defaultRateLimitKey(req) {
  if (req && req.user && req.user.id != null) return 'user:' + req.user.id;
  const ip = (req && (req.ip || (req.socket && req.socket.remoteAddress))) || 'unknown';
  return 'ip:' + ip;
}

/**
 * 应用层限流中间件工厂（计数型：每次请求记一个时间戳；窗口内达到 max 后 429）。
 * 语义：第 max 次通过、第 max+1 次起拦截（isBlocked 判定 len >= max）。
 * @param {object} [opts]
 * @param {InMemoryRateLimiter} [opts.limiter] 可注入（测试/共享实例）；缺省按 max/windowMs 新建
 * @param {number} [opts.max=10] 窗口内允许次数
 * @param {number} [opts.windowMs=60000] 窗口毫秒
 * @param {(req:object)=>string} [opts.keyFn] 键函数（默认 defaultRateLimitKey）
 * @param {string} [opts.message] 429 文案
 * @returns {Function & {check:Function, store:InMemoryRateLimiter, keyOf:Function}}
 */
export function createRateLimitMiddleware({
  limiter,
  max = 10,
  windowMs = 60000,
  keyFn = defaultRateLimitKey,
  message = RATE_LIMIT_MESSAGE,
} = {}) {
  const store = limiter || new InMemoryRateLimiter({ maxFailures: max, windowMs });

  /** 计数检查：返回 { limited, key }（limited=true 时**不**记录，避免被拒请求继续抬高计数） */
  async function check(req) {
    const key = keyFn(req);
    if (await store.isBlocked(key)) return { limited: true, key };
    await store.recordFailure(key);
    return { limited: false, key };
  }

  async function middleware(req, res, next) {
    const result = await check(req);
    if (result.limited) {
      return res.status(429).json({ code: 1003, message, data: null });
    }
    return next();
  }

  middleware.check = check;
  middleware.store = store;
  middleware.keyOf = keyFn;
  return middleware;
}

/** 登录全局失败速率（R16）：100 次失败/分钟（显著高于正常失败量）⇒ 登录端点短时熔断（**不锁账号**） */
export const LOGIN_GLOBAL_FAIL_KEY = 'global:login:fail';
export const LOGIN_GLOBAL_FAIL_MAX = 100;
export const LOGIN_GLOBAL_FAIL_WINDOW_MS = 60 * 1000;

/**
 * 登录全局失败守卫：跨 IP 的「每账号只试 1 次」喷洒三键都不达阈值，必须另有全局面。
 * 可注入 store 便于单测阈值边界（±1）。
 * @param {{store?: InMemoryRateLimiter}} [opts]
 */
export function createLoginGlobalFailureGuard({ store } = {}) {
  const limiter = store || new InMemoryRateLimiter({
    maxFailures: LOGIN_GLOBAL_FAIL_MAX,
    windowMs: LOGIN_GLOBAL_FAIL_WINDOW_MS,
    maxKeys: 8,
  });
  return {
    isBlocked: () => limiter.isBlocked(LOGIN_GLOBAL_FAIL_KEY),
    recordFailure: () => limiter.recordFailure(LOGIN_GLOBAL_FAIL_KEY),
    cleanup: () => limiter.cleanup(),
    store: limiter,
  };
}

export default { createRateLimitMiddleware, createLoginGlobalFailureGuard, defaultRateLimitKey };
