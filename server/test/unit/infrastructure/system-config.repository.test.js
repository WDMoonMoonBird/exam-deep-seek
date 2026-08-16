import { SystemConfigRepository } from '../../../src/infrastructure/persistence/system-config.repository.js';

function makePrisma(rows = []) {
  return {
    systemConfig: {
      findMany: async () => rows,
      upsert: async ({ where, update, create }) => ({ where, update, create }),
    },
  };
}

describe('SystemConfigRepository（等价迁移自 deepseek.js 配置读取）', () => {
  it('DB 命中 → 返回配置值', async () => {
    const repo = new SystemConfigRepository({ prisma: makePrisma([{ key: 'deepseek_model', value: 'custom-model' }]) });
    expect(await repo.get('deepseek_model', 'fallback')).toBe('custom-model');
  });

  it('DB 未命中 → ENV 兜底', async () => {
    const repo = new SystemConfigRepository({ prisma: makePrisma([]) });
    expect(await repo.get('nonexistent_key', 'env-fallback')).toBe('env-fallback');
  });

  it('1 分钟缓存：重复 get 只查库一次', async () => {
    let calls = 0;
    const prisma = {
      systemConfig: {
        findMany: async () => { calls++; return [{ key: 'ai_concurrency', value: '8' }]; },
        upsert: async (a) => a,
      },
    };
    const repo = new SystemConfigRepository({ prisma });
    expect(await repo.get('ai_concurrency')).toBe('8');
    expect(await repo.get('ai_concurrency')).toBe('8');
    expect(calls).toBe(1);
  });

  it('getConcurrency 解析为数字，非法值回退 16', async () => {
    const repo = new SystemConfigRepository({ prisma: makePrisma([{ key: 'ai_concurrency', value: 'abc' }]) });
    expect(await repo.getConcurrency()).toBe(16);
  });

  it('clearCache 后重新查库', async () => {
    let calls = 0;
    const prisma = {
      systemConfig: {
        findMany: async () => { calls++; return [{ key: 'k', value: 'v' }]; },
        upsert: async (a) => a,
      },
    };
    const repo = new SystemConfigRepository({ prisma });
    await repo.get('k');
    repo.clearCache();
    await repo.get('k');
    expect(calls).toBe(2);
  });

  it('DB 读取失败 → 回退缓存/空对象，不抛出', async () => {
    const repo = new SystemConfigRepository({
      prisma: { systemConfig: { findMany: async () => { throw new Error('db down'); }, upsert: async (a) => a } },
      logger: { warn() {} },
    });
    expect(await repo.get('k', 'fb')).toBe('fb');
  });
});