/**
 * InMemoryRateLimiter —— 进程内限流器（实现 RateLimiterPort 契约）。
 * 固定窗口 → 滑动窗口：记录失败时间戳数组，窗口内计数，最早失败过期即解除，杜绝窗口边界绕过。
 */

export class InMemoryRateLimiter {
  constructor({ maxFailures = 10, windowMs = 300000 } = {}) {
    this.map = new Map(); // key -> number[]（失败时间戳，仅保留窗口内）
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
  }

  #recent(key, now) {
    const stamps = this.map.get(key) || [];
    const cutoff = now - this.windowMs;
    return stamps.filter((t) => t >= cutoff);
  }

  async isBlocked(key) {
    const recent = this.#recent(key, Date.now());
    // maxFailures=0 语义：未记录不封锁，有 1 次失败即封锁（length 0 >= 0 陷阱）
    return recent.length >= this.maxFailures && recent.length > 0;
  }

  async recordFailure(key) {
    const now = Date.now();
    const recent = this.#recent(key, now);
    recent.push(now);
    this.map.set(key, recent);
  }

  async recordSuccess(key) {
    this.map.delete(key);
  }

  /** 清理过期记录（窗口两倍外） */
  cleanup() {
    const cutoff = Date.now() - this.windowMs * 2;
    for (const [k, stamps] of this.map) {
      this.map.set(k, stamps.filter((t) => t >= cutoff));
      if ((this.map.get(k) || []).length === 0) this.map.delete(k);
    }
  }
}