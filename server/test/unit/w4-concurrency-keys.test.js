/**
 * W4（R2-B1）：独立并发键 dsh_grading_concurrency —— 默认 1、env 可覆盖、后台可配；
 * ai_concurrency 行为不变（本文件只读断言，不改任何既有语义）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearConfigCache,
  concurrencyKeyLabel,
  getConcurrency,
  getConcurrencyWithKey,
  getDshGradingConcurrency,
  getDshGradingConcurrencyWithKey,
} from '../../src/infrastructure/ai/deepseek/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_CTRL = path.resolve(__dirname, '../../src/controllers/adminController.js');

describe('W4 并发键分离', () => {
  const oldEnv = process.env.DSH_GRADING_CONCURRENCY;
  afterEach(() => {
    if (oldEnv === undefined) delete process.env.DSH_GRADING_CONCURRENCY;
    else process.env.DSH_GRADING_CONCURRENCY = oldEnv;
    clearConfigCache();
  });

  it('W4-1 无键时默认 1（且与 ai_concurrency 不是同一个值来源）', async () => {
    delete process.env.DSH_GRADING_CONCURRENCY;
    clearConfigCache();
    const v = await getDshGradingConcurrency();
    expect(v).toBe(1);
    const ai = await getConcurrency();
    expect(typeof ai).toBe('number');
    expect(ai).toBeGreaterThanOrEqual(1);
  });

  it('W4-2 env DSH_GRADING_CONCURRENCY 可覆盖（且不改动父进程之外的东西）', async () => {
    process.env.DSH_GRADING_CONCURRENCY = '7';
    clearConfigCache();
    expect(await getDshGradingConcurrency()).toBe(7);
  });

  it('W4-3 非法/越界值收敛：0 ⇒ 1，999 ⇒ 64', async () => {
    process.env.DSH_GRADING_CONCURRENCY = '0';
    clearConfigCache();
    expect(await getDshGradingConcurrency()).toBe(1);
    process.env.DSH_GRADING_CONCURRENCY = '999';
    clearConfigCache();
    expect(await getDshGradingConcurrency()).toBe(64);
  });

  it('W4-4 键名标签可区分两条链路的单位', async () => {
    const dsh = await getDshGradingConcurrencyWithKey();
    const ai = await getConcurrencyWithKey();
    expect(dsh.key).toBe('dsh_grading_concurrency');
    expect(dsh.unit).toBe('sessions');
    expect(dsh.label).toBe('dsh_grading_concurrency(sessions)');
    expect(ai.key).toBe('ai_concurrency');
    expect(ai.unit).toBe('model_calls');
    expect(ai.label).toBe('ai_concurrency(model_calls)');
    expect(concurrencyKeyLabel('unknown_key')).toBe('unknown_key');
  });

  it('W4-5 后台可配：adminController 的读写白名单都含新键，且 ai_concurrency 校验档位未变', () => {
    const src = fs.readFileSync(ADMIN_CTRL, 'utf8');
    const listHits = src.split("'dsh_grading_concurrency'").length - 1;
    expect(listHits).toBeGreaterThanOrEqual(3); // 两个 in 白名单 + items.push 的 key
    expect(src).toContain("key: 'dsh_grading_concurrency'");
    expect(src).toContain('[1,8,16,32,64,128].includes(c)'); // ai_concurrency 档位原样
    expect(src).toContain('ai_concurrency: +map.ai_concurrency || 16'); // 默认值原样
  });
});
