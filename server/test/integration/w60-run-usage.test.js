/**
 * W60（R2-B36）集成：真实形态夹具下的**取证阶段抽取 + 落库 + 归档 + 价目表管理接口 + 迁移回滚往返**。
 *
 * 关键判据：
 *  ① 夹具（真形态 projcache + 会话 jsonl + 4 份干扰产物）⇒ 抽取数值与源文件**逐项一致**；
 *  ② 取证时机：purgeRunRootSessions（销毁会话）后 session-usage.json 仍在、会话已销毁、teardown 证据含 usage 摘要；
 *  ③ 零 LLM 运行 ⇒ no_model_session=true 且 token 全 0（落库行同样）；
 *  ④ 工具调用 可用/不可得 两条路径（不可得 ⇒ tools=null，不伪造）；
 *  ⑤ 落库 grading_run_usage：UPSERT 幂等 + 读回逐字段一致；
 *  ⑥ 管理员价目表读写（鉴权 + 校验失败不改库）；
 *  ⑦ 迁移 rollback 往返（DROP → 重建；finally 必恢复）。
 * 仅测试库；探针自清理。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import {
  captureSessionUsage, computeCost, summarizeUsageForEvidence, USAGE_REL_PATH,
} from '../../src/services/dshSessionUsage.js';
import { loadLlmPrices, loadRunUsage, persistRunUsage, LLM_PRICES_KEY } from '../../src/services/dshRunUsageStore.js';
import { archiveRun, purgeRunRootSessions, USAGE_NAME } from '../../src/services/dshRunArchiver.js';
import { authReq, request } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const MIG_DIR = path.join(__dirname, '..', '..', 'prisma', 'migrations', '20261013120000_r2b36_grading_run_usage');
const NL = String.fromCharCode(10);
const TAG = 'w60-' + Date.now();
const roots = [];
const runRefs = [];

const tmpRoot = (name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), name)); roots.push(d); return d; };

/** 真形态 projcache（字段名与实测一致） */
function writeProjcache(runRoot, sessions) {
  const dir = path.join(runRoot, 'home', 'storages', 'session_projcache', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of sessions) {
    fs.writeFileSync(path.join(dir, s.file + '.json'), JSON.stringify({
      version: 7,
      record: {
        identity: { createdAt: s.createdAt, cwd: '/tmp/w60' },
        rows: {
          sessionStats: { ver: 1, seq: 1, val: { turns: s.turns, steps: s.steps, llmMs: s.llmMs, toolMs: s.toolMs, decodeTokens: s.totals.outputTokens, ttftMs: 11, lastTurn: s.turns } },
          sessionListMetadata: { ver: 1, seq: 1, val: { blank: false, lastPromptAt: s.lastPromptAt } },
          tokenUsage: { ver: 1, seq: 1, val: { totals: s.totals, last: { turn: s.turns, step: s.steps, buckets: s.lastBuckets || s.totals } } },
        },
      },
    }, null, 2));
  }
}

/** 会话日志（多帧 zstd，真形态记录族） */
function writeSessionLog(runRoot, sessionId, records) {
  const dir = path.join(runRoot, 'home', 'sessions', '--w60--', sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const frames = records.map((r) => zlib.zstdCompressSync(Buffer.from(JSON.stringify(r) + NL, 'utf8')));
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), Buffer.concat(frames));
}

/** 4 份干扰产物（coverage/matrix/逐份结果）——抽取器必须完全无视它们 */
function writeDistractors(runRoot) {
  const out = path.join(runRoot, 'out');
  fs.mkdirSync(path.join(out, 'results'), { recursive: true });
  fs.writeFileSync(path.join(out, 'coverage-matrix.json'), JSON.stringify({ schema: 'coverage-matrix/1', rows: [{ sid: 'S001' }] }));
  fs.writeFileSync(path.join(out, 'coverage-report.json'), JSON.stringify({ schema: 'coverage/1', covered: 5 }));
  fs.writeFileSync(path.join(out, 'matrix-result.json'), JSON.stringify({ schema: 'matrix/1', totals: { score: 999 } }));
  fs.writeFileSync(path.join(out, 'results', 'sub-s01.json'), JSON.stringify({ submission: { id: 's01' }, totals: { score: 62 } }));
}

const TOOL_RECORDS = [
  { type: 'session', version: 0, id: 'session-11111111-2222-3333-4444-555555555555', createdAt: 1786870403947 },
  { type: 'request/header', time: 1786870404000, data: { header: { config: { model: 'deepseek-v4-flash' } } } },
  { type: 'tool/call', time: 1786870405000, data: { turn: 1, step: 1, callId: 'c1', name: 'run_code' } },
  { type: 'tool/code-dispatch-start', time: 1786870405100, data: { subCallId: 'c1:1', name: 'bash' } },
  { type: 'tool/code-dispatch', time: 1786870405400, data: { subCallId: 'c1:1', name: 'bash' } },
  { type: 'tool/ptc-dispatch-start', time: 1786870405500, data: { subCallId: 'c1:2', name: 'read' } },
  { type: 'tool/ptc-dispatch', time: 1786870405600, data: { subCallId: 'c1:2', name: 'read', isError: true } },
  { type: 'tool/result', time: 1786870406000, data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'c1' }, content: [] } } },
];

const SRC_TOTALS = { uncachedInputTokens: 63015, outputTokens: 36521, cacheReadTokens: 3494528, cacheWriteTokens: 0 };

describe('W60 运行用量取证与落库（R2-B36）', () => {
  afterAll(async () => {
    for (const ref of runRefs) await prisma.$executeRawUnsafe('DELETE FROM grading_run_usage WHERE run_ref = ?', ref);
    await prisma.$executeRawUnsafe('DELETE FROM system_configs WHERE `key` = ?', LLM_PRICES_KEY);
    for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
    const runs = path.join('/tmp', 'w60-runs-' + TAG);
    fs.rmSync(runs, { recursive: true, force: true });
  }, 60000);

  it('W60-1 ★真实形态夹具（+4 份干扰产物）⇒ 抽取数值与源文件逐项一致；费用按价目表算对', async () => {
    const root = tmpRoot('w60-fixture-');
    writeProjcache(root, [{
      file: 'session-11111111-2222-3333-4444-555555555555', createdAt: 1786870403947, lastPromptAt: 1786870406000,
      turns: 1, steps: 46, llmMs: 190223, toolMs: 4670, totals: SRC_TOTALS,
    }]);
    writeSessionLog(root, 'session-11111111-2222-3333-4444-555555555555', TOOL_RECORDS);
    writeDistractors(root);
    const cap = captureSessionUsage({ runRoot: root, log: { log() {} } });
    expect(cap.ok).toBe(true);
    const u = cap.usage;
    // ① 逐项一致（源文件 → 抽取）
    expect(u.totals.uncached_input_tokens).toBe(SRC_TOTALS.uncachedInputTokens);
    expect(u.totals.output_tokens).toBe(SRC_TOTALS.outputTokens);
    expect(u.totals.cache_read_tokens).toBe(SRC_TOTALS.cacheReadTokens);
    expect(u.totals.cache_write_tokens).toBe(SRC_TOTALS.cacheWriteTokens);
    expect(u.totals.model_calls).toBe(46);
    expect(u.totals.cache_hit_rate).toBeCloseTo(SRC_TOTALS.cacheReadTokens / (SRC_TOTALS.cacheReadTokens + SRC_TOTALS.uncachedInputTokens), 6);
    // ② 干扰产物不被读取（金额/份数不受它们影响）
    const expectCost = computeCost({ totals: {
      cache_read_tokens: SRC_TOTALS.cacheReadTokens, uncached_input_tokens: SRC_TOTALS.uncachedInputTokens,
      output_tokens: SRC_TOTALS.outputTokens, cache_write_tokens: 0,
    }, model: 'deepseek-v4-flash', at: new Date(u.reference_time) });
    expect(u.cost.cost_total).toBeCloseTo(expectCost.cost_total, 6);
    expect(u.model).toBe('deepseek-v4-flash');
    // ③ 工具调用（两代 dispatch 命名 + 错误标记）
    expect(u.tools_source).toBe('session_jsonl');
    const byName = Object.fromEntries(u.tools.map((t) => [t.name, t]));
    expect(byName.run_code).toEqual({ name: 'run_code', count: 1, ms: 1000, errors: 0 });
    expect(byName.bash).toEqual({ name: 'bash', count: 1, ms: 300, errors: 0 });
    expect(byName.read).toEqual({ name: 'read', count: 1, ms: 100, errors: 1 });
    expect(u.calls).toBeNull(); // 逐次分桶不可得 ⇒ 如实 null（不伪造）
    // ④ 产物落盘
    expect(fs.existsSync(path.join(root, USAGE_REL_PATH))).toBe(true);
    // ⑤ 落库 + 读回逐字段一致
    const runRef = TAG + ':job:1';
    runRefs.push(runRef);
    const persisted = await persistRunUsage({ prisma, runRef, jobId: 987654321, usage: u, log: { log() {} } });
    expect(persisted.ok).toBe(true);
    const back = await loadRunUsage({ prisma, runRef });
    expect(back.model_calls).toBe(46);
    expect(back.uncached_input_tokens).toBe(SRC_TOTALS.uncachedInputTokens);
    expect(back.output_tokens).toBe(SRC_TOTALS.outputTokens);
    expect(back.cache_read_tokens).toBe(SRC_TOTALS.cacheReadTokens);
    expect(back.cost_total).toBeCloseTo(u.cost.cost_total, 6);
    expect(back.cost_currency).toBe('CNY');
    expect(back.price_version).toBe(u.price_version);
    expect(back.no_model_session).toBe(false);
    expect(back.tools).toHaveLength(3);
    expect(back.job_id).toBe(987654321);
    // ⑥ UPSERT 幂等：同 run_ref 再落一次 ⇒ 仍 1 行且值更新
    const u2 = { ...u, totals: { ...u.totals, output_tokens: 1 }, no_model_session: false };
    await persistRunUsage({ prisma, runRef, jobId: 987654321, usage: u2, log: { log() {} } });
    const n = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM grading_run_usage WHERE run_ref = ?', runRef);
    expect(Number(n[0].n)).toBe(1);
    expect((await loadRunUsage({ prisma, runRef })).output_tokens).toBe(1);
  }, 120000);

  it('W60-2 ★取证时机：teardown 销毁会话后 session-usage.json 仍在、证据含 usage 摘要、归档目录含同名文件', async () => {
    const root = tmpRoot('w60-teardown-');
    writeProjcache(root, [{
      file: 'session-11111111-2222-3333-4444-555555555555', createdAt: 1786870403947, lastPromptAt: 1786870406000,
      turns: 1, steps: 9, llmMs: 1, toolMs: 2, totals: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 0 },
    }]);
    writeSessionLog(root, 'session-11111111-2222-3333-4444-555555555555', TOOL_RECORDS);
    fs.mkdirSync(path.join(root, 'out'), { recursive: true });
    fs.writeFileSync(path.join(root, 'home', '.credentials.yaml'), 'secret: x');
    const filesBefore = fs.readdirSync(path.join(root, 'home', 'sessions'), { recursive: true }).length;
    expect(filesBefore).toBeGreaterThan(0);
    const td = purgeRunRootSessions({ runRoot: root, exitCode: 0, purge: true, source: 'worker', log: { log() {} } });
    // ① 会话已销毁
    expect(td.sessionsPurged).toBe(true);
    expect(td.evidence.session_files_after).toBe(0);
    expect(td.evidence.credentials_removed).toBe('yes');
    // ② 用量产物仍在且数值正确（取证发生在销毁之前）
    const usageFile = path.join(root, USAGE_REL_PATH);
    expect(fs.existsSync(usageFile)).toBe(true);
    const u = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    expect(u.schema).toBe('session-usage/1');
    expect(u.totals.uncached_input_tokens).toBe(1000);
    expect(u.totals.cache_read_tokens).toBe(2000);
    expect(u.cost.cost_total).toBeGreaterThan(0);
    // ③ teardown 证据里带用量摘要（UI/落库可直接读）
    expect(td.evidence.usage).toBeTruthy();
    expect(td.evidence.usage.uncached_input_tokens).toBe(1000);
    expect(td.evidence.usage.cache_hit_rate).toBeCloseTo(2000 / 3000, 6);
    // ④ 归档目录含 session-usage.json（文件级证据）
    const runsRoot = path.join('/tmp', 'w60-runs-' + TAG);
    const arch = await archiveRun({ runRoot: root, jobId: 4242, success: false, runsRoot, log: { log() {} } });
    expect(arch.files).toContain(USAGE_NAME);
    const archived = JSON.parse(fs.readFileSync(path.join(arch.dir, USAGE_NAME), 'utf8'));
    expect(archived.totals.uncached_input_tokens).toBe(1000);
    // ⑤ 幂等：已有产物 ⇒ 复算不覆盖（reused）
    const again = captureSessionUsage({ runRoot: root, log: { log() {} } });
    expect(again.reused).toBe(true);
    expect(again.usage.totals.uncached_input_tokens).toBe(1000);
  }, 120000);

  it('W60-3 ★零 LLM 运行 ⇒ no_model_session=true 且 token 全 0（含落库行）；工具不可得 ⇒ tools=null', async () => {
    const root = tmpRoot('w60-zero-');
    // 会话存在但零 token（复用命中/未起模型会话的真实形态）
    writeProjcache(root, [{
      file: 'session-33333333-2222-3333-4444-555555555555', createdAt: 1786870403947, lastPromptAt: 1786870403947,
      turns: 0, steps: 0, llmMs: 0, toolMs: 0, totals: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }]);
    // 无会话 jsonl ⇒ 工具不可得（如实 null）
    const cap = captureSessionUsage({ runRoot: root, log: { log() {} } });
    expect(cap.usage.no_model_session).toBe(true);
    expect(cap.usage.tools).toBeNull();
    expect(cap.usage.tools_source).toBe('unavailable');
    expect(cap.usage.cost.cost_total).toBe(0);
    const runRef = TAG + ':build:1';
    runRefs.push(runRef);
    await persistRunUsage({ prisma, runRef, jobId: null, usage: cap.usage, log: { log() {} } });
    const back = await loadRunUsage({ prisma, runRef });
    expect(back.no_model_session).toBe(true);
    expect([back.uncached_input_tokens, back.output_tokens, back.cache_read_tokens, back.cache_write_tokens]).toEqual([0, 0, 0, 0]);
    expect(back.cost_total).toBe(0);
    expect(back.tools).toBeNull();
    expect(back.model_calls).toBe(0);
    const sum = summarizeUsageForEvidence(cap.usage);
    expect(sum.no_model_session).toBe(true);
    expect(sum.tools).toBeNull();
    // 无 projcache 目录（连会话都没有）也必须如实零
    const empty = tmpRoot('w60-noprojcache-');
    const cap2 = captureSessionUsage({ runRoot: empty, log: { log() {} } });
    expect(cap2.usage.sessions).toHaveLength(0);
    expect(cap2.usage.no_model_session).toBe(true);
    expect(cap2.usage.totals.output_tokens).toBe(0);
    expect(cap2.usage.cost.cost_total).toBe(0);
  }, 60000);

  it('W60-4 ★价目表管理员读写：未登录 401/403；默认值=官网口径；写覆盖生效；非法配置 400 且不改库', async () => {
    // 未登录 ⇒ 401/403（可达性证据：不是 404）
    const anon = await request().get('/api/admin/settings');
    expect([401, 403]).toContain(anon.status);
    // 管理员登录（app.js 启动时预置 admin/***REDACTED***）
    const login = await request().post('/api/auth/login').send({ username: 'admin', password: '***REDACTED***' });
    expect(login.body.code).toBe(0);
    const admin = authReq(login.body.data.token);
    const got = await admin.get('/api/admin/settings');
    expect(got.status).toBe(200);
    const prices = got.body.data.llm_prices;
    expect(prices.models['deepseek-flash'].idle).toEqual({ cache_hit: 0.02, cache_miss: 1, output: 4 });
    expect(prices.models['deepseek-flash'].peak).toEqual({ cache_hit: 0.04, cache_miss: 2, output: 8 });
    expect(prices.models['deepseek-v4-pro'].idle).toEqual({ cache_hit: 0.15, cache_miss: 4.5, output: 13.5 });
    expect(prices.peak_windows).toHaveLength(2);
    expect(prices.models['deepseek-flash'].idle.cache_hit).toBe(0.02);
    expect(got.body.data.llm_prices_source).toBe('default');
    // 写覆盖 ⇒ 生效（DB + 读回）
    const override = { currency: 'CNY', effective_from: '2026-10-13', note: 'w60 覆盖', holidays: ['2026-01-01'], models: { 'deepseek-flash': { match: ['deepseek-flash', 'deepseek-v4-flash'], idle: { cache_hit: 0.01, cache_miss: 0.5, output: 2 }, peak: { cache_hit: 0.02, cache_miss: 1, output: 4 } } } };
    const put = await admin.put('/api/admin/settings', { llm_prices: override });
    expect(put.status).toBe(200);
    const row = await prisma.systemConfig.findUnique({ where: { key: LLM_PRICES_KEY } });
    expect(row).toBeTruthy();
    const got2 = await admin.get('/api/admin/settings');
    expect(got2.body.data.llm_prices_source).toBe('db');
    expect(got2.body.data.llm_prices.models['deepseek-flash'].idle.cache_hit).toBe(0.01);
    const loaded = await loadLlmPrices({ prisma });
    expect(loaded.source).toBe('db');
    expect(loaded.table.holidays).toEqual(['2026-01-01']);
    // 非法配置 ⇒ 400 且不改库
    const bad = await admin.put('/api/admin/settings', { llm_prices: { models: { x: { idle: { cache_hit: -5 } } } } });
    expect(bad.status).toBe(400);
    expect(bad.body.data.reason).toContain('bad_price');
    const still = await loadLlmPrices({ prisma });
    expect(still.table.models['deepseek-flash'].idle.cache_hit).toBe(0.01); // 未被非法值覆盖
  }, 120000);

  it('W60-5 ★迁移 rollback 往返：DROP 后表消失，重放 migration.sql 后表/唯一键/键恢复（finally 必恢复）', async () => {
    const mig = fs.readFileSync(path.join(MIG_DIR, 'migration.sql'), 'utf8');
    const roll = fs.readFileSync(path.join(MIG_DIR, 'rollback.sql'), 'utf8');
    const tableExists = async () => {
      const rows = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'grading_run_usage'");
      return Number(rows[0].n) === 1;
    };
    const indexNames = async () => {
      const rows = await prisma.$queryRawUnsafe("SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'grading_run_usage'");
      return rows.map((r) => r.index_name || r.INDEX_NAME);
    };
    expect(await tableExists()).toBe(true);
    const before = await indexNames();
    expect(before).toContain('uniq_grading_run_usage_run_ref');
    // rollback.sql 只允许 DROP 本表（不得触碰既有表）
    expect(roll).not.toMatch(/DROP TABLE(?! IF EXISTS \`grading_run_usage\`)/);
    expect(roll).toContain('DROP TABLE IF EXISTS \`grading_run_usage\`');
    try {
      for (const stmt of roll.split(';').map((s) => s.split(NL).filter((l) => !l.trim().startsWith('--')).join(NL)).map((s) => s.trim()).filter(Boolean)) {
        await prisma.$executeRawUnsafe(stmt);
      }
      expect(await tableExists()).toBe(false);          // ① 回滚生效
      for (const stmt of mig.split(';').map((s) => s.split(NL).filter((l) => !l.trim().startsWith('--')).join(NL)).map((s) => s.trim()).filter(Boolean)) {
        await prisma.$executeRawUnsafe(stmt);
      }
      expect(await tableExists()).toBe(true);           // ② 重放恢复
      expect(await indexNames()).toContain('uniq_grading_run_usage_run_ref');
    } finally {
      if (!(await tableExists())) {
        for (const stmt of mig.split(';').map((s) => s.split(NL).filter((l) => !l.trim().startsWith('--')).join(NL)).map((s) => s.trim()).filter(Boolean)) {
          await prisma.$executeRawUnsafe(stmt).catch(() => {});
        }
      }
    }
  }, 120000);
});
