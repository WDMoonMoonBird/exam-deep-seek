/**
 * InMemoryRateLimiter —— 进程内限流器（实现 RateLimiterPort 契约）。
 * 固定窗口 → 滑动窗口：记录失败时间戳数组，窗口内计数，最早失败过期即解除，杜绝窗口边界绕过。
 *
 * ★R3-RATE（P1，2026-10-18 / R24）：**键数上限 + 淘汰** —— 原实现 recordFailure 直接 map.set 无限增长：
 *   攻击者可用任意 username 产生 acct#global:<username> 键（登录限流三键中的全局键），
 *   而 cleanup 每 10 分钟才回收一次 ⇒ 内存可被无界放大。现在：
 *     ① 写入**新键**前若已达 maxKeys：先清理过期键；
 *     ② 仍超限 ⇒ 按「每条键最早时间戳」升序批量淘汰 10%（最旧优先），保证 map.size ≤ maxKeys；
 *     ③ 既有 10 次/5 分钟语义与 isBlocked / recordSuccess 行为不变。
 */

export class InMemoryRateLimiter {
  constructor({ maxFailures = 10, windowMs = 300000, maxKeys = 50000 } = {}) {
    this.map = new Map(); // key -> number[]（失败时间戳，仅保留窗口内）
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    // ★R3-RATE：键数上限（默认 5 万；非法/过小值回落默认）
    this.maxKeys = Number.isFinite(Number(maxKeys)) && Number(maxKeys) >= 1 ? Math.floor(Number(maxKeys)) : 50000;
  }

  #recent(key, now) {
    const stamps = this.map.get(key) || [];
    const cutoff = now - this.windowMs;
    return stamps.filter((t) => t >= cutoff);
  }

  /** 清理窗口两倍外的过期键（原 cleanup 语义，抽出供上限保护复用） */
  #purgeExpired(now) {
    const cutoff = now - this.windowMs * 2;
    for (const [k, stamps] of this.map) {
      const recent = stamps.filter((t) => t >= cutoff);
      if (recent.length === 0) this.map.delete(k);
      else this.map.set(k, recent);
    }
  }

  /**
   * ★R3-RATE：键数上限保护（只在写入**新键**前调用）。
   * 先做过期清理（更便宜），仍超限则按最早时间戳批量淘汰 10%（最少 1 个），避免每写一个键都全表排序。
   */
  #evictIfNeeded(now) {
    if (this.map.size < this.maxKeys) return;
    this.#purgeExpired(now);
    if (this.map.size < this.maxKeys) return;
    const victims = Array.from(this.map.entries())
      .sort((a, b) => (a[1][0] || 0) - (b[1][0] || 0));
    const removeCount = Math.max(1, Math.floor(victims.length * 0.1));
    for (let i = 0; i < removeCount && i < victims.length; i += 1) {
      this.map.delete(victims[i][0]);
    }
  }

  async isBlocked(key) {
    const recent = this.#recent(key, Date.now());
    // maxFailures=0 语义：未记录不封锁，有 1 次失败即封锁（length 0 >= 0 陷阱）
    return recent.length >= this.maxFailures && recent.length > 0;
  }

  async recordFailure(key) {
    const now = Date.now();
    if (!this.map.has(key)) this.#evictIfNeeded(now);   // ★R3-RATE：新键写入前做上限保护
    const recent = this.#recent(key, now);
    recent.push(now);
    this.map.set(key, recent);
  }

  async recordSuccess(key) {
    this.map.delete(key);
  }

  /** 清理过期记录（窗口两倍外） */
  cleanup() {
    this.#purgeExpired(Date.now());
  }
}
