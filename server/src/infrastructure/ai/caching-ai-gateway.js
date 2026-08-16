/**
 * CachingAiGateway —— AI 网关缓存装饰器（装饰器模式）。
 * 相同评分请求（按入参 JSON 哈希）命中缓存直接返回，避免重复扣费；
 * 缓存以提交内容为键，重评/改分不受影响（人工调整走 manual 路径不经过本网关）。
 */

import { createHash } from 'node:crypto';

export class CachingAiGateway {
  /**
   * @param {object} inner 被装饰的 AiGateway
   * @param {object} [opts]
   * @param {number} [opts.maxEntries] 最大缓存条数（LRU 淘汰），默认 2000
   */
  constructor(inner, { maxEntries = 2000 } = {}) {
    this.inner = inner;
    this.cache = new Map();
    this.maxEntries = maxEntries;
  }

  #key(req) {
    return createHash('sha1').update(JSON.stringify(req)).digest('hex');
  }

  async grade(req) {
    const key = this.#key(req);
    if (this.cache.has(key)) return this.cache.get(key);
    const result = await this.inner.grade(req);
    this.cache.set(key, result);
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    return result;
  }

  async parsePaper(paperText) {
    const key = 'paper:' + createHash('sha1').update(paperText).digest('hex');
    if (this.cache.has(key)) return this.cache.get(key);
    const result = await this.inner.parsePaper(paperText);
    this.cache.set(key, result);
    return result;
  }

  clear() { this.cache.clear(); }
}