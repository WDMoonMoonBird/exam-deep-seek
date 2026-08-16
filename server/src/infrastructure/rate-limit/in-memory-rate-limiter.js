/**
 * InMemoryRateLimiter —— 进程内限流器（实现 RateLimiterPort 契约）。
 */

export class InMemoryRateLimiter {
  constructor({ maxFailures = 10, windowMs = 300000 } = {}) {
    this.map = new Map();
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
  }

  async isBlocked(key) {
    const rec = this.map.get(key);
    return !!(rec && rec.count >= this.maxFailures && (Date.now() - rec.since) < this.windowMs);
  }

  async recordFailure(key) {
    const now = Date.now();
    const rec = this.map.get(key) || { count: 0, since: now };
    rec.count++;
    if (!this.map.has(key)) rec.since = now;
    this.map.set(key, rec);
  }

  async recordSuccess(key) {
    this.map.delete(key);
  }

  cleanup() {
    const cutoff = Date.now() - this.windowMs * 2;
    for (const [k, rec] of this.map) {
      if (rec.since < cutoff) this.map.delete(k);
    }
  }
}