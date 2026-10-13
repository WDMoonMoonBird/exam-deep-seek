/**
 * W66（R2-B49 / t31）：监测呈现侧 —— usage.summary_session（判据/评语分账）+ 三态 + 降级 + 前端文案契约。
 *
 * 数据来源（R2-B48 数据侧）：grading_run_usage.usage_json.summary_session{tokens,cost_total,model,recorded_at}；
 * 归档 out/summaries.json 作为 mode/命中 的 meta 兜底（旧数据缺字段 ⇒ 如实 null，不臆造）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shapeUsageBlock, shapeSummarySession, usageListFields, costSplit } from '../../src/infrastructure/dsh/runs/read-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(__dirname, '..', '..', '..', 'client');
const roots = [];
function mkArchive(summariesDoc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w66-arch-'));
  roots.push(dir);
  if (summariesDoc !== null) {
    fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'out', 'summaries.json'), JSON.stringify(summariesDoc));
  }
  return path.basename(dir) === '' ? dir : dir;
}
const ROW_BASE = { cost_total: 1.004, cost_currency: 'CNY', model: 'deepseek-v4-flash', model_calls: 12, uncached_input_tokens: 100, cache_read_tokens: 900, output_tokens: 50, cache_write_tokens: 0, cache_hit_rate: 0.9, price_version: '2026-10-13', price_tier: 'idle', no_model_session: 0 };
const SS = { tokens: { prompt: 900, completion: 130, reasoning: 90 }, cost_total: 0.02, model: 'deepseek-v4-flash', recorded_at: '2026-10-13T06:00:00.000Z' };

afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

describe('W66 监测呈现侧：判据 / 评语分账（R2-B49）', () => {
  it('★W66-1 usage 形状含 summary_session（tokens/cost/model/命中）与 cost_split 分账', () => {
    const row = { ...ROW_BASE, usage_json: JSON.stringify({ summary_session: { ...SS, cache_hit: false, mode: 'always' } }) };
    const u = shapeUsageBlock({ row });
    expect(u.available).toBe(true);
    expect(u.summary_session.generated).toBe(true);
    expect(u.summary_session.state).toBe('generated');
    expect(u.summary_session.tokens).toMatchObject({ prompt: 900, completion: 130, reasoning: 90 });
    expect(u.summary_session.cost_total).toBe(0.02);
    expect(u.summary_session.model).toBe('deepseek-v4-flash');
    expect(u.summary_session.cache_hit).toBe(false);
    expect(u.summary_session.mode).toBe('always');
    expect(u.cost_split).toMatchObject({ judge: 1.004, summary: 0.02, total: 1.024 });
    expect(usageListFields(row).summary_session_cost).toBe(0.02);
  }, 60000);

  it('★W66-2 降级：旧运行/未开启 ⇒ not_generated + note，不报错、不显示假 0', () => {
    // ① 无 usage 行、无 teardown、无归档
    const empty = shapeUsageBlock({});
    expect(empty.available).toBe(false);
    expect(empty.summary_session.state).toBe('not_generated');
    expect(empty.summary_session.note).toContain('未生成评语');
    expect(empty.summary_session.cost_total).toBe(null);
    expect(empty.cost_split).toMatchObject({ judge: null, summary: null, total: null });   // ★不假 0
    // ② 只有 teardown 摘要（旧运行）
    const td = shapeUsageBlock({ teardownUsage: { cost_total: 0.5, cost_currency: 'CNY', no_model_session: true } });
    expect(td.source).toBe('teardown_json');
    expect(td.summary_session.generated).toBe(false);
    expect(td.cost_split).toMatchObject({ judge: 0.5, summary: null, total: 0.5 });
    // ③ usage_json 坏值 ⇒ 不抛
    expect(() => shapeUsageBlock({ row: { ...ROW_BASE, usage_json: '{坏 JSON' } })).not.toThrow();
    expect(usageListFields({ ...ROW_BASE, usage_json: '{坏 JSON' }).summary_session_cost).toBe(null);
  }, 60000);

  it('★W66-3 三态可辨：off（未生成）/ cached 命中 / 本次生成（always 或 miss）', () => {
    // ① off（或旧运行）⇒ 未生成评语
    const off = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({}) } });
    expect(off.state).toBe('not_generated');
    expect(off.note).toContain('开关 off');
    // ② cached 命中
    const hit = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({ summary_session: { ...SS, cache_hit: true, mode: 'cached' } }) } });
    expect(hit.state).toBe('cached_hit');
    expect(hit.cache_hit).toBe(true);
    expect(hit.note).toContain('缓存命中');
    expect(hit.mode).toBe('cached');
    // ③ always / miss ⇒ 本次生成
    const gen = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({ summary_session: { ...SS, cache_hit: false, mode: 'always' } }) } });
    expect(gen.state).toBe('generated');
    expect(gen.note).toContain('本次会话生成');
    // ④ 老数据缺 cache_hit/mode ⇒ 从**归档 out/summaries.json 的 meta** 兜底推出（命中/未命中可辨）
    const a1 = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({ summary_session: SS }) }, summaryMeta: { mode: 'cached', entries: 2, cache_hits: 2, truncated: 0, generated_at: null } });
    expect(a1.state).toBe('cached_hit');
    expect(a1.mode).toBe('cached');
    expect(a1.entries).toBe(2);
    expect(a1.source).toBe('usage_json');
    const a2 = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({ summary_session: SS }) }, summaryMeta: { mode: 'cached', entries: 2, cache_hits: 1, truncated: 0, generated_at: null } });
    expect(a2.state).toBe('generated');                      // 混合 ⇒ 不宣称整体命中
    // ⑤ 归档里没有 summaries.json（或归档不存在）⇒ 仍降级，不报错
    const a3 = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({ summary_session: SS }) }, archive: mkArchive(null) });
    expect(a3.generated).toBe(true);
    expect(a3.cache_hit).toBe(null);                          // 未记录 ⇒ null（前端显示"生成方式未记录"）
    expect(a3.state).toBe('generated');
  }, 60000);

  it('★W66-4 成本分账计算：任一项缺失都不假 0，合计只在可算时给出', () => {
    expect(costSplit({ judgeCost: 1.004, summaryCost: 0.02 })).toMatchObject({ judge: 1.004, summary: 0.02, total: 1.024 });
    expect(costSplit({ judgeCost: 1.5, summaryCost: null })).toMatchObject({ judge: 1.5, summary: null, total: 1.5 });
    expect(costSplit({ judgeCost: null, summaryCost: 0.02 })).toMatchObject({ judge: null, summary: 0.02, total: 0.02 });
    expect(costSplit({})).toMatchObject({ judge: null, summary: null, total: null });      // ★不显示假 0
    expect(costSplit({ judgeCost: -1, summaryCost: null }).judge).toBe(null);              // 负值视作不可得
  }, 60000);

  it('★W66-5 前端呈现契约：分账/三态文案/未生成评语/口径齐备（且无裸根路径）', () => {
    const txt = fs.readFileSync(path.join(CLIENT, 'src', 'views', 'admin', 'GradingRuns.vue'), 'utf8');
    for (const s of ['消耗分账', '判据会话（打分）', '评语会话（总评）', '未生成评语', '缓存命中', '生成方式未记录', 'cost_split', 'summary_session', '尺子零 LLM；评语按需生成、单独计量、可关', 'DSH_SUMMARY_MODE=off|cached|always']) {
      expect(txt).toContain(s);
    }
    // 口径注释落在服务端（单一真值源）
    const ctrl = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'infrastructure', 'dsh', 'runs', 'read-model.js'), 'utf8');
    expect(ctrl).toContain('尺子零 LLM；评语（总评）按需生成、单独计量、可关');
    expect(ctrl).toContain('summary_session');
  }, 60000);
});
