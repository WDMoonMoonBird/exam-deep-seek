/**
 * W60（R2-B36）：会话用量抽取 + 价目表/费用口径的**纯函数与文件层**测试（不连库）。
 *
 * 覆盖：①价目表默认值与时段判定（高峰窗口/周末/节假日）；②命中率与费用（单档 + 跨时段两档）；
 *      ③projcache 读取（真形态）；④会话 jsonl 工具抽取（tool/call + dispatch 两代命名 + 错误标记）；
 *      ⑤.zstd **多帧**日志读取（帧切分器）；⑥零 LLM/缺数据时的如实语义（不伪造）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  DEFAULT_LLM_PRICES, captureSessionUsage, cacheHitRate, computeCost, extractToolsFromLogText,
  normalizeTotals, priceModelKey, priceTierAt, readProjcacheSessions, readSessionLogText, referenceTimeOf,
  resolvePriceTable, summarizeUsageForEvidence,
} from '../../src/services/dshSessionUsage.js';
import { validateLlmPrices } from '../../src/services/dshRunUsageStore.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'w60-'));
const NL = String.fromCharCode(10);

/** 真形态 projcache 会话文件（字段名与实测一致） */
function writeProjcache(runRoot, sessions) {
  const dir = path.join(runRoot, 'home', 'storages', 'session_projcache', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of sessions) {
    fs.writeFileSync(path.join(dir, s.file + '.json'), JSON.stringify({
      version: 7,
      record: {
        identity: { createdAt: s.createdAt, cwd: '/tmp/x' },
        rows: {
          sessionStats: { ver: 1, seq: 1, val: { turns: s.turns, steps: s.steps, llmMs: s.llmMs || 0, toolMs: s.toolMs || 0, decodeTokens: s.outputTokens || 0, ttftMs: 0, lastTurn: s.turns } },
          sessionListMetadata: { ver: 1, seq: 1, val: { blank: false, lastPromptAt: s.lastPromptAt } },
          tokenUsage: { ver: 1, seq: 1, val: { totals: s.totals, last: { turn: s.turns, step: s.steps, buckets: s.totals } } },
        },
      },
    }, null, 2));
  }
  return dir;
}

function writeSessionLog(runRoot, sessionId, records, { compress = true, multiFrame = true } = {}) {
  const dir = path.join(runRoot, 'home', 'sessions', '--slug--', sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const lines = records.map((r) => JSON.stringify(r));
  const file = path.join(dir, compress ? 'session.v4.jsonl.zstd' : 'session.v4.jsonl');
  if (!compress) { fs.writeFileSync(file, lines.join(NL) + NL); return file; }
  if (multiFrame) {
    // 每行一帧（模拟实测的多帧拼接文件）
    const frames = lines.map((l) => zlib.zstdCompressSync(Buffer.from(l + NL, 'utf8')));
    fs.writeFileSync(file, Buffer.concat(frames));
  } else {
    fs.writeFileSync(file, zlib.zstdCompressSync(Buffer.from(lines.join(NL) + NL, 'utf8')));
  }
  return file;
}

const toolLogRecords = [
  { type: 'session', version: 0, id: 'session-11111111-2222-3333-4444-555555555555', createdAt: 1000 },
  { type: 'request/header', time: 1000, data: { header: { config: { model: 'deepseek-v4-flash' } } } },
  { type: 'tool/call', time: 2000, data: { turn: 1, step: 1, callId: 'c1', name: 'run_code', arguments: '{}' } },
  { type: 'tool/code-dispatch-start', time: 2100, data: { rootCallId: 'c1', subCallId: 'c1:1', name: 'bash', arguments: { command: 'ls' } } },
  { type: 'tool/code-dispatch', time: 2400, data: { rootCallId: 'c1', subCallId: 'c1:1', name: 'bash', arguments: { command: 'ls' }, isError: false } },
  { type: 'tool/ptc-dispatch-start', time: 2500, data: { rootCallId: 'c1', subCallId: 'c1:2', name: 'read', arguments: {} } },
  { type: 'tool/ptc-dispatch', time: 2600, data: { rootCallId: 'c1', subCallId: 'c1:2', name: 'read', arguments: {}, isError: true } },
  { type: 'tool/result', time: 3000, data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'c1' }, content: [] } } },
];

describe('W60 会话用量抽取（R2-B36）', () => {
  it('W60-1 ★价目表默认值 = 官网口径（flash 0.02/0.04、1/2、4/8；pro 同预置）+ 时段判定（高峰窗口/周末/节假日）', () => {
    const t = resolvePriceTable(null);
    expect(t.currency).toBe('CNY');
    expect(t.models['deepseek-flash'].idle).toEqual({ cache_hit: 0.02, cache_miss: 1, output: 4 });
    expect(t.models['deepseek-flash'].peak).toEqual({ cache_hit: 0.04, cache_miss: 2, output: 8 });
    expect(t.models['deepseek-v4-pro'].idle).toEqual({ cache_hit: 0.15, cache_miss: 4.5, output: 13.5 });
    expect(t.models['deepseek-v4-pro'].peak).toEqual({ cache_hit: 0.30, cache_miss: 9, output: 27 });
    expect(DEFAULT_LLM_PRICES.peak_windows).toHaveLength(2);
    // 北京时间：周三 10:00=峰；周三 13:00=闲；周三 15:00=峰；周六=闲；节假日=闲
    expect(priceTierAt(new Date('2026-10-14T02:00:00Z'), t)).toBe('peak');   // 北京 10:00
    expect(priceTierAt(new Date('2026-10-14T05:00:00Z'), t)).toBe('idle');   // 北京 13:00
    expect(priceTierAt(new Date('2026-10-14T07:00:00Z'), t)).toBe('peak');   // 北京 15:00
    expect(priceTierAt(new Date('2026-10-17T02:00:00Z'), t)).toBe('idle');   // 周六
    expect(priceTierAt(new Date('2026-10-14T02:00:00Z'), { ...t, holidays: ['2026-10-14'] })).toBe('idle'); // 节假日
    // 型号匹配
    expect(priceModelKey('deepseek-v4-flash', t)).toBe('deepseek-flash');
    expect(priceModelKey('DeepSeek-Flash', t)).toBe('deepseek-flash');
    expect(priceModelKey('deepseek-v4-pro', t)).toBe('deepseek-v4-pro');
    expect(priceModelKey('gpt-x', t)).toBeNull();
  });

  it('W60-2 ★命中率与费用：单档正确 + 跨时段两档求和（peak+idle）', () => {
    const totals = { cache_read_tokens: 3_494_528, uncached_input_tokens: 63_015, output_tokens: 36_521, cache_write_tokens: 0 };
    expect(cacheHitRate(totals)).toBeCloseTo(3_494_528 / (3_494_528 + 63_015), 6);
    expect(cacheHitRate({ cache_read_tokens: 0, uncached_input_tokens: 0 })).toBeNull(); // 无输入 ⇒ 不伪造
    const c = computeCost({ totals, model: 'deepseek-v4-flash', at: new Date('2026-10-14T14:00:00Z') }); // 北京 22:00 闲
    expect(c.ok).toBe(true);
    expect(c.tier).toBe('idle');
    expect(c.cost_total).toBeCloseTo((3_494_528 * 0.02 + 63_015 * 1 + 36_521 * 4) / 1e6, 6);
    const peak = computeCost({ totals, model: 'deepseek-v4-flash', at: new Date('2026-10-14T02:00:00Z') }); // 北京 10:00 峰
    expect(peak.tier).toBe('peak');
    expect(peak.cost_total).toBeCloseTo((3_494_528 * 0.04 + 63_015 * 2 + 36_521 * 8) / 1e6, 6);
    // ★跨时段：两次调用分别落在峰/闲 ⇒ 分档求和
    const cross = computeCost({
      model: 'deepseek-flash',
      calls: [
        { at: new Date('2026-10-14T02:00:00Z'), cache_hit_tokens: 1e6, cache_miss_tokens: 1e6, output_tokens: 1e6 },
        { at: new Date('2026-10-14T14:00:00Z'), cache_hit_tokens: 1e6, cache_miss_tokens: 1e6, output_tokens: 1e6 },
      ],
    });
    expect(cross.tier).toBe('mixed');
    expect(cross.cost_total).toBeCloseTo((0.04 + 2 + 8) + (0.02 + 1 + 4), 6);
    expect(cross.per_call.map((x) => x.tier)).toEqual(['peak', 'idle']);
    // 未知型号 ⇒ 如实 null（不猜）
    const unknown = computeCost({ totals, model: 'gpt-x', at: new Date() });
    expect(unknown.ok).toBe(false);
    expect(unknown.cost_total).toBeNull();
    expect(String(unknown.reason)).toContain('model_not_priced');
  });

  it('W60-3 ★projcache 读取：真形态字段归一（totals/last/统计）+ 参考时刻取最后一次提示', () => {
    const root = tmp();
    writeProjcache(root, [{
      file: 'session-11111111-2222-3333-4444-555555555555', createdAt: 1786870403947, lastPromptAt: 1786871474295,
      turns: 3, steps: 7, llmMs: 1234, toolMs: 567,
      totals: { uncachedInputTokens: 100, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 0 },
    }]);
    const rows = readProjcacheSessions(root);
    expect(rows).toHaveLength(1);
    expect(rows[0].session_id).toBe('session-11111111-2222-3333-4444-555555555555');
    expect(rows[0].totals).toEqual({ uncached_input_tokens: 100, output_tokens: 200, cache_read_tokens: 300, cache_write_tokens: 0 });
    expect(rows[0].steps).toBe(7);
    expect(rows[0].tool_ms).toBe(567);
    expect(referenceTimeOf(rows).getTime()).toBe(1786871474295);
    expect(normalizeTotals({ uncached_input_tokens: 5, output_tokens: '6' }).output_tokens).toBe(6);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('W60-4 ★工具抽取：tool/call 用 result 时间差算耗时；dispatch 两代命名 + isError 计数', () => {
    const { tools, model } = extractToolsFromLogText(toolLogRecords.map((r) => JSON.stringify(r)).join(NL));
    expect(model).toBe('deepseek-v4-flash');
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.run_code).toEqual({ name: 'run_code', count: 1, ms: 1000, errors: 0 });
    expect(byName.bash).toEqual({ name: 'bash', count: 1, ms: 300, errors: 0 });
    expect(byName.read).toEqual({ name: 'read', count: 1, ms: 100, errors: 1 });
    expect(tools.map((t) => t.name)).toEqual(['bash', 'read', 'run_code']); // count 倒序；同 count 按名字升序
  });

  it('W60-5 ★.zstd 多帧日志读取（帧切分器吃下整文件）+ 明文 jsonl 双通道', () => {
    const root = tmp();
    writeSessionLog(root, 'session-11111111-2222-3333-4444-555555555555', toolLogRecords, { compress: true, multiFrame: true });
    const logs = fs.readdirSync(path.join(root, 'home', 'sessions', '--slug--', 'session-11111111-2222-3333-4444-555555555555'));
    expect(logs).toContain('session.v4.jsonl.zstd');
    const f = path.join(root, 'home', 'sessions', '--slug--', 'session-11111111-2222-3333-4444-555555555555', 'session.v4.jsonl.zstd');
    const r = readSessionLogText(f);
    expect(r.ok).toBe(true);
    expect(r.text.split(NL).filter(Boolean)).toHaveLength(toolLogRecords.length); // 多帧全部读出
    const { tools } = extractToolsFromLogText(r.text);
    expect(tools.find((t) => t.name === 'bash').ms).toBe(300);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('W60-6 ★零 LLM / 无 jsonl 两条路径：如实 0 与 tools=null（不伪造）', () => {
    const root = tmp();
    writeProjcache(root, [{
      file: 'session-22222222-2222-3333-4444-555555555555', createdAt: Date.now(), lastPromptAt: Date.now(),
      turns: 0, steps: 0, totals: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }]);
    const cap = captureSessionUsage({ runRoot: root, log: { log() {} } });
    expect(cap.ok).toBe(true);
    expect(cap.usage.no_model_session).toBe(true);
    expect(cap.usage.totals.output_tokens).toBe(0);
    expect(cap.usage.totals.cache_read_tokens).toBe(0);
    expect(cap.usage.cost.cost_total).toBe(0);
    expect(cap.usage.tools).toBeNull();
    expect(cap.usage.tools_source).toBe('unavailable');
    expect(cap.usage.calls).toBeNull(); // 逐次分桶不可得：如实 null
    const sum = summarizeUsageForEvidence(cap.usage);
    expect(sum.no_model_session).toBe(true);
    expect(sum.cost_total).toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('W60-7 价目表校验：非法配置拒绝（bad price/holidays/peak window），合法覆盖被接受', () => {
    expect(validateLlmPrices({ models: { x: { idle: { cache_hit: -1 } } } }).ok).toBe(false);
    expect(validateLlmPrices({ models: 'x' }).ok).toBe(false);
    expect(validateLlmPrices({ holidays: 'x' }).ok).toBe(false);
    expect(validateLlmPrices({ peak_windows: [{ start: '9am' }] }).ok).toBe(false);
    expect(validateLlmPrices('{not json').ok).toBe(false);
    const ok = validateLlmPrices({ models: { 'deepseek-flash': { match: ['deepseek-flash'], idle: { cache_hit: 0.01, cache_miss: 0.5, output: 2 }, peak: { cache_hit: 0.02, cache_miss: 1, output: 4 } } }, holidays: ['2026-01-01'] });
    expect(ok.ok).toBe(true);
    const t = resolvePriceTable({ ...ok.prices, source: 'db' });
    expect(t.models['deepseek-flash'].idle.cache_hit).toBe(0.01);
    expect(t.models['deepseek-v4-pro'].idle.output).toBe(13.5); // 未覆盖的档仍取默认
    expect(t.price_version).toContain('db');
  });
});
