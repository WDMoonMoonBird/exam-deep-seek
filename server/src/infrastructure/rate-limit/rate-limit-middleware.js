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

/** 解析正整数 env（非法/越界 ⇒ 回落默认并 clamp；供阈值按部署调整，缺失环境变量不影响既有测试） */
function envPositiveInt(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = Number(process.env && process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

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

/**
 * ★P2-RATE-a（2026-10-18，A batch2 复核）：登录全局失败熔断的阈值**可配**（原硬编码 100/min 是「攻击者维持
 *   100 次失败/分即可让所有人登录被 429」的全局 DoS 杠杆）——
 *   · `LOGIN_GLOBAL_FAIL_MAX`（默认 300；clamp 10–10000）：高于正常失败量一个量级；
 *   · `LOGIN_GLOBAL_FAIL_WINDOW_MS`（默认 60000；clamp 1s–10min）：需要更短熔断窗口时设为 10000 等，
 *     攻击成本不变但误伤时长缩短（与 nginx 登录边缘 20r/s 叠加评估）。
 *   app.js 在熔断打开瞬间打一条 warn 告警（不随每次被拒请求刷屏）。
 */
export const LOGIN_GLOBAL_FAIL_KEY = 'global:login:fail';
export const LOGIN_GLOBAL_FAIL_MAX = envPositiveInt('LOGIN_GLOBAL_FAIL_MAX', 300, { min: 10, max: 10000 });
export const LOGIN_GLOBAL_FAIL_WINDOW_MS = envPositiveInt('LOGIN_GLOBAL_FAIL_WINDOW_MS', 60 * 1000, { min: 1000, max: 600000 });

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
