/**
 * W66b（R2-B50 / t33）：三态**不依赖归档**（F1：recordSummaryUsage 落 mode/cache_hit/cache_hits/generated）
 * + 归档清单含 out/summaries.json（F2）+ 旧数据安全降级。
 *
 * 说明：与 W66（呈现侧形状/降级/三态/分账）互补；本文件聚焦 B49 记录 §4 提出的两条后续是否真落地。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { recordSummaryUsage } from '../../src/infrastructure/dsh/checker/dshSummarySession.js';
import { shapeUsageBlock, shapeSummarySession } from '../../src/infrastructure/dsh/runs/read-model.js';
import { archiveRun } from '../../src/infrastructure/dsh/runs/dshRunArchiver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROW_BASE = { cost_total: 1.004, cost_currency: 'CNY', model: 'deepseek-v4-flash', model_calls: 12, uncached_input_tokens: 100, cache_read_tokens: 900, output_tokens: 50, cache_write_tokens: 0, cache_hit_rate: 0.9, price_version: '2026-10-13', price_tier: 'idle', no_model_session: 0 };
const roots = [];
const runRefs = [];

const usageJsonOf = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);

describe('W66b R2-B50：三态字段落库（F1）+ 归档含 summaries.json（F2）', () => {
  afterAll(async () => {
    for (const ref of runRefs) await prisma.$executeRawUnsafe('DELETE FROM grading_run_usage WHERE run_ref = ?', ref).catch(() => {});
    for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
  }, 60000);

  it('★W66b-1（F1）recordSummaryUsage 落 mode/cache_hit/cache_hits/generated ⇒ 无需归档即可判三态', async () => {
    const jobId = 990000 + (Date.now() % 9000);
    const ref = 'job:' + jobId;
    runRefs.push(ref);
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_run_usage (run_ref, job_id, model_calls, uncached_input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_total, cost_currency, price_version, no_model_session, usage_json, created_at, updated_at) '
      + 'VALUES (?, ?, 12, 100, 50, 900, 0, 1.004, ?, ?, 0, CAST(? AS JSON), NOW(3), NOW(3))',
      ref, jobId, 'CNY', '2026-10-13:db', JSON.stringify({ schema: 'session-usage/1' }),
    );
    // ① 全命中（cached）：generated=0 且 cache_hits>0 ⇒ cache_hit=true ⇒ state=cached_hit（**无归档**）
    const okHit = await recordSummaryUsage(prisma, { runRef: ref, tokens: { prompt: 900, completion: 130, reasoning: 90 }, cost: 0, model: 'deepseek-v4-flash', mode: 'cached', cacheHits: 3, generated: 0 });
    expect(okHit).toBe(true);
    let raw = (await prisma.$queryRawUnsafe('SELECT usage_json FROM grading_run_usage WHERE run_ref = ?', ref))[0].usage_json;
    const ss = usageJsonOf(raw).summary_session;
    expect(ss).toMatchObject({ mode: 'cached', cache_hit: true, cache_hits: 3, generated: 0, model: 'deepseek-v4-flash' });
    expect(ss.tokens).toMatchObject({ prompt: 900, completion: 130, reasoning: 90 });
    const shapedHit = shapeUsageBlock({ row: { ...ROW_BASE, usage_json: typeof raw === 'string' ? raw : JSON.stringify(raw) } });
    expect(shapedHit.summary_session.state).toBe('cached_hit');            // ★无需归档 meta 兜底
    // ★R2-B51：生产真实路径是 Prisma 直接把 JSON 列给成**对象**（不 stringify）⇒ 这一形态也必须判出 cached_hit
    //   （反例：String(object) === '[object Object]' 不可恢复 —— 故调用方须原样传对象/字符串，不得 String() 转换）
    const shapedAsObject = shapeUsageBlock({ row: { ...ROW_BASE, usage_json: usageJsonOf(raw) } });
    expect(shapedAsObject.summary_session.state).toBe('cached_hit');
    expect(shapedAsObject.summary_session.source).toBe('usage_json');
    expect(shapedHit.summary_session.cache_hit).toBe(true);
    expect(shapedHit.summary_session.mode).toBe('cached');
    // B49 的 shapeSummarySession 对外暴露 cache_hit/mode（判定三态用），原始计数留在 usage_json（可审计/后续可展示）
    expect(usageJsonOf(raw).summary_session.cache_hits).toBe(3);
    expect(usageJsonOf(raw).summary_session.generated).toBe(0);
    // ② always/miss：generated>0 ⇒ cache_hit=false ⇒ state=generated
    await recordSummaryUsage(prisma, { runRef: ref, tokens: { prompt: 1000, completion: 200, reasoning: 0 }, cost: 0.02, model: 'deepseek-v4-flash', mode: 'always', cacheHits: 0, generated: 2 });
    raw = (await prisma.$queryRawUnsafe('SELECT usage_json FROM grading_run_usage WHERE run_ref = ?', ref))[0].usage_json;
    const shapedGen = shapeUsageBlock({ row: { ...ROW_BASE, usage_json: typeof raw === 'string' ? raw : JSON.stringify(raw) } });
    expect(shapedGen.summary_session.state).toBe('generated');
    expect(shapedGen.summary_session.cache_hit).toBe(false);
    expect(usageJsonOf(raw).summary_session.cost_total).toBe(0.02);
    expect(shapedGen.cost_split).toMatchObject({ judge: 1.004, summary: 0.02, total: 1.024 });
    // ③ 判据费用不被覆盖（只动 usage_json）
    expect(Number((await prisma.$queryRawUnsafe('SELECT cost_total FROM grading_run_usage WHERE run_ref = ?', ref))[0].cost_total)).toBe(1.004);
  }, 120000);

  it('★W66b-2（F2）归档清单含 out/summaries.json：与既有归档并列且字节一致 ⇒ 归档 meta 可精确判三态', async () => {
    const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w66b-runs-'));
    const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w66b-run-'));
    roots.push(runsRoot, runRoot);
    fs.mkdirSync(path.join(runRoot, 'out'), { recursive: true });
    const doc = { schema: 'summaries/1', assignment_id: 1, mode: 'cached', generated_at: '2026-10-13T06:00:00.000Z', summaries: { s1: { text: 't1', cache_hit: true }, s2: { text: 't2', cache_hit: true } } };
    const srcText = JSON.stringify(doc, null, 2);
    fs.writeFileSync(path.join(runRoot, 'out', 'summaries.json'), srcText);
    const jobId = 991000 + (Date.now() % 900);
    const res = await archiveRun({ runRoot, jobId, success: true, runsRoot, log: { log() {}, warn() {} } });
    expect(res.files).toContain('summaries.json');                            // ★进入归档清单
    const archived = fs.readFileSync(path.join(res.dir, 'summaries.json'), 'utf8');
    expect(archived).toBe(srcText);                                           // ★字节一致（不重序列化）
    // 归档 meta（模拟 B49 readSummariesMeta 的取数规则）⇒ 老数据缺 cache_hit 时也能精确判三态
    const parsed = JSON.parse(archived);
    const entries = Object.values(parsed.summaries);
    const meta = { mode: parsed.mode, entries: entries.length, cache_hits: entries.filter((x) => x.cache_hit === true).length, truncated: 0, generated_at: parsed.generated_at };
    const shaped = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({ summary_session: { tokens: { prompt: 1 }, cost_total: 0.01 } }) }, summaryMeta: meta });
    expect(shaped.state).toBe('cached_hit');
    expect(shaped.mode).toBe('cached');
    expect(shaped.entries).toBe(2);
  }, 120000);
  it('★W66b-4（F-T32-1）worker 的真实调用形状：**只传 tokens.__session**、不传数值参数 ⇒ 三态照常落库（回归锁）', async () => {
    const jobId = 992000 + (Date.now() % 800);
    const ref = 'job:' + jobId;
    runRefs.push(ref);
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_run_usage (run_ref, job_id, model_calls, cost_total, cost_currency, price_version, no_model_session, usage_json, created_at, updated_at) '
      + 'VALUES (?, ?, 0, 0, ?, ?, 1, CAST(? AS JSON), NOW(3), NOW(3))',
      ref, jobId, 'CNY', '2026-10-13:db', JSON.stringify({ schema: 'session-usage/1' }),
    );
    // ★worker 只传 tokens/cost/model —— 三态 meta 全在 tokens.__session；旧实现因 Number(null)===0 被当成「显式 0」⇒ 兜底永不生效
    const ok = await recordSummaryUsage(prisma, { runRef: ref, tokens: { prompt: 800, completion: 120, reasoning: 340, __session: { mode: 'cached', cache_hit: true, cache_hits: 2, generated: 0 } }, cost: 0, model: 'deepseek-v4-flash' });
    expect(ok).toBe(true);
    const raw = (await prisma.$queryRawUnsafe('SELECT usage_json FROM grading_run_usage WHERE run_ref = ?', ref))[0].usage_json;
    const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(doc.summary_session).toMatchObject({ mode: 'cached', cache_hit: true, cache_hits: 2, generated: 0 });   // ★不再是 0/false
    expect(doc.summary_session.tokens).toMatchObject({ prompt: 800, completion: 120, reasoning: 340 });
    expect(doc.summary_session.tokens.__session).toBe(undefined);                                                 // tokens 形状干净
    const shaped = shapeUsageBlock({ row: { ...ROW_BASE, usage_json: typeof raw === 'string' ? raw : JSON.stringify(raw) } });
    expect(shaped.summary_session.state).toBe('cached_hit');                                                      // ★三态对新数据正确（无需归档）
    // 对照：显式传数值参数时仍以显式值为准（不回归 B50 语义）
    await recordSummaryUsage(prisma, { runRef: ref, tokens: { __session: { mode: 'cached', cache_hits: 2, generated: 0 } }, cost: 0, model: 'm', cacheHits: 0, generated: 3 });
    const raw2 = (await prisma.$queryRawUnsafe('SELECT usage_json FROM grading_run_usage WHERE run_ref = ?', ref))[0].usage_json;
    const doc2 = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2;
    expect(doc2.summary_session).toMatchObject({ cache_hits: 0, generated: 3, cache_hit: false });
  }, 120000);
  it('★W66b-5（T32-O1）归档候选白名单契约：只保留平铺 summaries.json（不再含恒 inert 的 out/summaries.json 候选）', () => {
    const ctrl = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'infrastructure', 'dsh', 'runs', 'read-model.js'), 'utf8');
    expect(ctrl).toContain("for (const rel of ['summaries.json'])");                  // ★唯一候选（白名单只放行不含 '/' 的文件名）
    expect(ctrl).not.toContain("for (const rel of ['out/summaries.json'");           // 无效候选已删除
    expect(ctrl).toContain('文件名白名单按设计拒绝');                                    // 选择与理由留痕（记录 §2 同口径）
    // 平铺读取仍可用：shapeSummarySession 在 summaryMeta 注入下判 cached_hit（A8/A10 同语义）
    const shaped = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({}) }, summaryMeta: { mode: 'cached', entries: 2, cache_hits: 2, truncated: 0, generated_at: null } });
    expect(shaped.state).toBe('cached_hit');
  }, 60000);

  it('★W66b-3 旧数据安全降级：无字段 + 无归档文件 ⇒ not_generated/null（不报错、不假 0）', async () => {
    const missing = await recordSummaryUsage(prisma, { runRef: 'job:does-not-exist-' + Date.now(), tokens: null, cost: 0, model: null, mode: 'cached', cacheHits: 1, generated: 0 });
    expect(missing).toBe(false);                                              // 行不存在 ⇒ 静默 false（不抛）
    const shaped = shapeSummarySession({ row: { ...ROW_BASE, usage_json: JSON.stringify({}) }, archive: null, summaryMeta: null });
    expect(shaped.state).toBe('not_generated');
    expect(shaped.cost_total).toBe(null);
    expect(shaped.cache_hit).toBe(null);
    expect(shapeUsageBlock({}).cost_split).toMatchObject({ judge: null, summary: null, total: null });   // ★不假 0
  }, 60000);
});
