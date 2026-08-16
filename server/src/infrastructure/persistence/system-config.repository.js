/**
 * SystemConfigRepository —— 系统配置仓储适配器（实现 domain/ports/repositories.js 契约）。
 * 迁移来源：server/src/services/deepseek.js 的 loadConfig/getConfig/clearConfigCache。
 * 语义保持：DB 优先 → ENV 兜底；1 分钟缓存；DB 读取失败时回退缓存/空对象。
 */

/**
 * @param {object} deps
 * @param {object} deps.prisma Prisma Client（由组合根注入）
 * @param {object} [deps.logger] pino/console
 * @param {number} [deps.cacheTtlMs] 缓存有效期，默认 60000
 */
export class SystemConfigRepository {
  constructor({ prisma, logger = console, cacheTtlMs = 60000 }) {
    this.prisma = prisma;
    this.logger = logger;
    this.cacheTtlMs = cacheTtlMs;
    this.configCache = null;
    this.configCacheTime = 0;
  }

  /** 加载全部配置（缓存 1 分钟；DB 失败回退缓存或空对象，不阻断业务） */
  async loadAll() {
    if (this.configCache && Date.now() - this.configCacheTime < this.cacheTtlMs) return this.configCache;
    try {
      const rows = await this.prisma.systemConfig.findMany();
      const cfg = {};
      for (const r of rows) cfg[r.key] = r.value;
      this.configCache = cfg;
      this.configCacheTime = Date.now();
    } catch (err) {
      this.logger?.warn?.({ err: err.message }, 'systemConfig 读取失败，使用缓存/空配置');
      if (!this.configCache) this.configCache = {};
    }
    return this.configCache;
  }

  /** 读取配置：DB 优先，ENV 兜底（等价原 getConfig） */
  async get(key, envFallback) {
    const cfg = await this.loadAll();
    return cfg[key] || envFallback;
  }

  /** 便捷读取（等价原 getApiKey/getBaseUrl/getModel/getConcurrency） */
  async getApiKey()    { return this.get('deepseek_api_key', process.env.DEEPSEEK_API_KEY); }
  async getBaseUrl()   { return this.get('deepseek_base_url', process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'); }
  async getModel()     { return this.get('deepseek_model', process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'); }
  async getConcurrency() { const v = await this.get('ai_concurrency', '16'); return +v || 16; }

  /** 写入配置（契约 set），并失效缓存 */
  async set(key, value) {
    await this.prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.configCache = null;
    this.configCacheTime = 0;
  }

  /** 清缓存（等价原 clearConfigCache，供管理端修改配置后调用） */
  clearCache() {
    this.configCache = null;
    this.configCacheTime = 0;
  }
}