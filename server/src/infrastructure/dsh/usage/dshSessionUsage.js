/**
 * dshSessionUsage.js —— R2-B36（P1）：**销毁前**从 run-root 抽取会话用量（tokens/缓存/工具/费用）。
 *
 * 取证时机：teardown（purgeRunRootSessions）在删除 home/sessions + home/storages/session_projcache **之前**调用
 *   captureSessionUsage() ⇒ 写 <run-root>/out/session-usage.json（与 run-teardown.json 并列）⇒ 随 run-root 归档。
 *
 * 数据来源（★实测探针结论，2026-10-13，见 docs/dsh/R2-B36-实施记录.md §2）：
 *  ① projcache（明文 JSON，唯一 token 权威来源）：
 *     <run-root>/home/storages/session_projcache/sessions/*.json → {version, record:{identity:{createdAt,cwd}, rows:{
 *       tokenUsage:{val:{totals:{uncachedInputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}, last:{turn,step,buckets:{…}}}},
 *       sessionStats:{val:{turns,steps,llmMs,toolMs,ttftMs,decodeMs,decodeTokens,lastTurn}}, sessionListMetadata:{val:{lastPromptAt}}}}}
 *     兼容聚合文件 <…>/session_projcache.json 的 tables.sessions['session-<id>']。
 *  ② 会话 jsonl（可选，取**工具调用**）：<run-root>/home/sessions/<slug>/<session-id>/session*.jsonl(.zstd)
 *     记录族（实测）：tool/call{name,callId} + tool/result（用 time 差算耗时）；run_code 内层工具为
 *     tool/code-dispatch-start + tool/code-dispatch（旧版）或 tool/ptc-dispatch-start + tool/ptc-dispatch（v4，实测）；
 *     request/header.data.header.config.model 给出**实际模型**。
 *     .zstd 是**多帧拼接**（Node 的 createZstdDecompress 只吃第一帧 ⇒ 本模块按帧魔数切分逐帧解压，带上限）。
 *  ③ ★**逐次分桶不可得**（探针结论）：projcache 只给 totals + 最后一次 buckets，jsonl 无 per-call usage 记录
 *     ⇒ calls 如实写 null（不伪造）；费用按「会话参考时刻」所属时段计（保守口径，见 computeCost）。
 *
 * 费用口径：价目表来自 system_configs.llm_prices（可配置；缺省=官网默认值），单位 元/百万 tokens；
 *   高峰时段 = 北京时间周一至周五 09:00–12:00 与 14:00–18:00（法定节假日除外，holidays 可配置）；其余=空闲（高峰半价）。
 *   计算按**每次调用所属时段**（computeCost 支持 calls[] 跨时段求和）；本批数据只到会话级 ⇒ 用参考时刻单档，
 *   并在 session-usage.json 与运行记录里如实标注（cost_basis=session_reference_time）。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const SESSION_USAGE_SCHEMA = 'session-usage/1';
export const USAGE_REL_PATH = 'out/session-usage.json';
/** 逐帧解压/解析上限（teardown 里绝不能拖死）：单会话日志最多处理这么多帧/字节 */
export const JSONL_MAX_FRAMES = 20000;
export const JSONL_MAX_BYTES = 64 * 1024 * 1024;

/** 官网默认价目（元/百万 tokens；flash 与 pro 两档；peak=高峰、idle=空闲） */
export const DEFAULT_LLM_PRICES = {
  schema: 'llm-prices/1',
  currency: 'CNY',
  unit: 'per_1m_tokens',
  effective_from: '2026-10-13',
  note: 'DeepSeek 官网价（元/百万 tokens）；高峰=北京时间周一至周五 09:00–12:00/14:00–18:00（法定节假日除外），其余为空闲（高峰半价）。缓存未命中=输入未命中档。',
  peak_windows: [
    { weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' },
    { weekdays: [1, 2, 3, 4, 5], start: '14:00', end: '18:00' },
  ],
  /** 中国法定节假日（YYYY-MM-DD，北京时间）；默认空 —— 运维按官方公布填入即可（本模块只做查表，不猜日期） */
  holidays: [],
  models: {
    'deepseek-flash': { match: ['deepseek-flash', 'deepseek-v4-flash'], peak: { cache_hit: 0.04, cache_miss: 2, output: 8 }, idle: { cache_hit: 0.02, cache_miss: 1, output: 4 } },
    'deepseek-v4-pro': { match: ['deepseek-v4-pro'], peak: { cache_hit: 0.30, cache_miss: 9, output: 27 }, idle: { cache_hit: 0.15, cache_miss: 4.5, output: 13.5 } },
  },
};

const BJ_OFFSET_MIN = 480; // 北京 UTC+8
/** 数字归一：null/undefined/'' ⇒ null（★否则 Number(null)=0 会被误当 0 参与判定） */
const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

/** 价目表归一化（DB/默认值合并；非法字段回退默认值 —— 绝不因配置坏掉而崩） */
export function resolvePriceTable(raw = null) {
  const base = DEFAULT_LLM_PRICES;
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const models = {};
  const srcModels = cfg.models && typeof cfg.models === 'object' ? cfg.models : base.models;
  for (const [key, def] of Object.entries({ ...base.models, ...srcModels })) {
    const fallback = base.models[key] || { match: [key], peak: { cache_hit: 0, cache_miss: 0, output: 0 }, idle: { cache_hit: 0, cache_miss: 0, output: 0 } };
    // ★O1（R2-B39）：负值一律**拒绝**（回落默认档）——价格负数会让费用算成负、审计不可用；
    //   读取路径也要拦（写路径 validateLlmPrices 已有校验，但库里的值可能被直改/坏配置）。
    const pick = (tier) => {
      const t = (def && def[tier]) || {};
      const f = fallback[tier] || {};
      const pickOne = (k) => {
        const v = num(t[k]);
        if (v === null || v < 0) return f[k];
        return v;
      };
      return { cache_hit: pickOne('cache_hit'), cache_miss: pickOne('cache_miss'), output: pickOne('output') };
    };
    models[key] = { match: Array.isArray(def && def.match) && def.match.length ? def.match.map(String) : fallback.match, peak: pick('peak'), idle: pick('idle') };
  }
  return {
    schema: 'llm-prices/1',
    currency: String(cfg.currency || base.currency),
    unit: 'per_1m_tokens',
    effective_from: String(cfg.effective_from || base.effective_from),
    note: String(cfg.note || base.note),
    price_version: String(cfg.price_version || cfg.effective_from || base.effective_from) + (cfg.source ? ':' + cfg.source : ''),
    peak_windows: Array.isArray(cfg.peak_windows) && cfg.peak_windows.length ? cfg.peak_windows : base.peak_windows,
    holidays: Array.isArray(cfg.holidays) ? cfg.holidays.map(String) : base.holidays,
    models,
  };
}

/** 北京时间分量（不依赖宿主时区） */
export function beijingParts(at = new Date()) {
  const t = at instanceof Date ? at : new Date(at);
  const shifted = new Date(t.getTime() + BJ_OFFSET_MIN * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  return {
    date: y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
    weekday: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(), // 1=周一 … 7=周日
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

const parseHm = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** ★时段判定：高峰=周一至周五的配置窗口内且非节假日；其余（含周末/节假日全天）=空闲 */
export function priceTierAt(at, table = DEFAULT_LLM_PRICES) {
  const t = resolvePriceTable(table);
  const p = beijingParts(at);
  if (t.holidays.includes(p.date)) return 'idle';
  for (const w of t.peak_windows || []) {
    const days = Array.isArray(w.weekdays) && w.weekdays.length ? w.weekdays.map(Number) : [1, 2, 3, 4, 5];
    if (!days.includes(p.weekday)) continue;
    const s = parseHm(w.start);
    const e = parseHm(w.end);
    if (s === null || e === null) continue;
    if (p.minutes >= s && p.minutes < e) return 'peak';
  }
  return 'idle';
}

/** 型号 → 价目档（前缀/子串匹配；未知型号 ⇒ null，费用如实置 null 并给 reason） */
export function priceModelKey(model, table = DEFAULT_LLM_PRICES) {
  const t = resolvePriceTable(table);
  const m = String(model || '').toLowerCase();
  if (!m) return null;
  for (const [key, def] of Object.entries(t.models)) {
    for (const pat of def.match || []) {
      const p = String(pat).toLowerCase();
      if (m === p || m.includes(p) || p.includes(m)) return key;
    }
  }
  return null;
}

export const TOKENS_PER_MILLION = 1e6;

/**
 * ★费用计算（支持跨时段：calls=[{at, buckets}] 逐次按所属时段分档求和）。
 * @returns {{ok:boolean, cost_total:number|null, currency:string, tier:string|null, per_call:Array|null,
 *            units:object|null, breakdown:{input_hit:number,input_miss:number,output:number}|null, reason?:string, price_version:string}}
 */
export function computeCost({ calls = null, totals = null, model = null, table = DEFAULT_LLM_PRICES, at = null, cacheHitTokens = null, cacheMissTokens = null, outputTokens = null } = {}) {
  const t = resolvePriceTable(table);
  const modelKey = priceModelKey(model, t);
  const mk = modelKey || (model ? null : 'deepseek-flash'); // 未给型号 ⇒ 按平台默认档（flash）计，并标注
  if (!mk) {
    return { ok: false, cost_total: null, currency: t.currency, tier: null, per_call: null, units: null, breakdown: null, reason: 'model_not_priced:' + model, price_version: t.price_version };
  }
  const unit = t.models[mk];
  const list = Array.isArray(calls) && calls.length
    ? calls.map((c) => ({
      at: c.at || at || new Date(),
      cache_hit: num(c.cache_hit_tokens) || 0,
      cache_miss: num(c.cache_miss_tokens) || 0,
      output: num(c.output_tokens) || 0,
    }))
    : [{
      at: at || new Date(),
      cache_hit: num(cacheHitTokens) !== null ? num(cacheHitTokens) : num(totals && totals.cache_read_tokens) || 0,
      cache_miss: num(cacheMissTokens) !== null ? num(cacheMissTokens) : num(totals && totals.uncached_input_tokens) || 0,
      output: num(outputTokens) !== null ? num(outputTokens) : num(totals && totals.output_tokens) || 0,
    }];
  const perCall = [];
  let sum = 0; let hitUnits = 0; let missUnits = 0; let outUnits = 0;
  let anyPeak = false;
  for (const c of list) {
    const tier = priceTierAt(c.at, t);
    if (tier === 'peak') anyPeak = true;
    const p = unit[tier];
    const cost = (c.cache_hit * p.cache_hit + c.cache_miss * p.cache_miss + c.output * p.output) / TOKENS_PER_MILLION;
    sum += cost;
    hitUnits += c.cache_hit; missUnits += c.cache_miss; outUnits += c.output;
    perCall.push({ at: new Date(c.at).toISOString(), tier, cache_hit_tokens: c.cache_hit, cache_miss_tokens: c.cache_miss, output_tokens: c.output, cost: round6(cost) });
  }
  return {
    ok: true,
    cost_total: round6(sum),
    currency: t.currency,
    tier: perCall.length === 1 ? perCall[0].tier : (anyPeak ? 'mixed' : 'idle'),
    per_call: perCall.length > 1 ? perCall : null,
    model_key: mk,
    model: model || null,
    units: { price_per_1m_tokens: { peak: unit.peak, idle: unit.idle }, applied_tier: perCall.length === 1 ? perCall[0].tier : 'mixed' },
    breakdown: { input_hit: hitUnits, input_miss: missUnits, output: outUnits },
    price_version: t.price_version,
  };
}

export function round6(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
}

/** 命中率 = cache_read / (cache_read + uncached_input)（无任何输入 ⇒ null，不伪造 0/1） */
export function cacheHitRate(totals = {}) {
  const hit = num(totals.cache_read_tokens) || 0;
  const miss = num(totals.uncached_input_tokens) || 0;
  const denom = hit + miss;
  if (denom <= 0) return null;
  return Math.round((hit / denom) * 1e6) / 1e6;
}

/** 归一化 projcache 的 tokenUsage.totals（蛇形字段名） */
export function normalizeTotals(t = {}) {
  return {
    uncached_input_tokens: num(t.uncachedInputTokens ?? t.uncached_input_tokens) || 0,
    output_tokens: num(t.outputTokens ?? t.output_tokens) || 0,
    cache_read_tokens: num(t.cacheReadTokens ?? t.cache_read_tokens) || 0,
    cache_write_tokens: num(t.cacheWriteTokens ?? t.cache_write_tokens) || 0,
  };
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** 从 projcache 目录（或聚合文件）读会话用量行 */
export function readProjcacheSessions(runRoot) {
  const base = path.join(String(runRoot), 'home', 'storages', 'session_projcache');
  const dir = path.join(base, 'sessions');
  const out = [];
  const push = (id, record) => {
    if (!record || typeof record !== 'object') return;
    const rows = record.rows || {};
    const tu = rows.tokenUsage && rows.tokenUsage.val;
    const stats = (rows.sessionStats && rows.sessionStats.val) || {};
    const meta = (rows.sessionListMetadata && rows.sessionListMetadata.val) || {};
    const identity = record.identity || {};
    out.push({
      session_id: id,
      totals: normalizeTotals(tu && tu.totals),
      last_buckets: tu && tu.last && tu.last.buckets ? normalizeTotals(tu.last.buckets) : null,
      last_step: tu && tu.last ? num(tu.last.step) : null,
      turns: num(stats.turns) || 0,
      steps: num(stats.steps) || 0,
      llm_ms: num(stats.llmMs) || 0,
      tool_ms: num(stats.toolMs) || 0,
      decode_tokens: num(stats.decodeTokens) || 0,
      ttft_ms: num(stats.ttftMs) || 0,
      last_prompt_at: num(meta.lastPromptAt) || null,
      created_at: num(identity.createdAt) || null,
      has_token_usage: !!(tu && tu.totals),
    });
  };
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); } catch { files = []; }
  for (const f of files) {
    const j = readJsonSafe(path.join(dir, f));
    if (!j) continue;
    const record = j.record || (j.rows ? j : null);
    const id = j.id || (j.record && j.record.id) || f.replace(/\.json$/, '');
    push(id, record);
  }
  if (out.length === 0) {
    // 兼容聚合文件：<…>/session_projcache.json → tables.sessions['session-<id>']
    const agg = readJsonSafe(path.join(base, 'session_projcache.json')) || readJsonSafe(path.join(String(runRoot), 'home', 'storages', 'session_projcache.json'));
    const sessions = agg && agg.tables && agg.tables.sessions;
    if (sessions && typeof sessions === 'object') {
      for (const [id, entry] of Object.entries(sessions)) push(id, entry);
    }
  }
  return out;
}

/** 会话 jsonl 候选文件（明文或 .zstd；含 device 侧 home/sessions/**） */
export function listSessionLogs(runRoot) {
  const home = path.join(String(runRoot), 'home');
  const out = [];
  const walk = (d, depth) => {
    if (depth > 4) return;
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const abs = path.join(d, it.name);
      if (it.isDirectory()) { walk(abs, depth + 1); continue; }
      if (/^session.*\.jsonl(\.zstd)?$/.test(it.name)) out.push(abs);
    }
  };
  walk(path.join(home, 'sessions'), 0);
  return out.sort();
}

/** zstd 多帧解压（Node 的流式解码器只吃第一帧 ⇒ 按帧魔数切分逐帧解压；超上限即停） */
export function readSessionLogText(file, { maxFrames = JSONL_MAX_FRAMES, maxBytes = JSONL_MAX_BYTES } = {}) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return { ok: false, reason: 'unreadable', text: '' }; }
  if (!file.endsWith('.zstd')) return { ok: true, text: buf.toString('utf8'), frames: 0, truncated: false };
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const offs = [];
  let i = 0;
  while (offs.length < maxFrames + 1) {
    const p = buf.indexOf(magic, i);
    if (p < 0) break;
    offs.push(p);
    i = p + 4;
  }
  const parts = [];
  let bytes = 0;
  const n = Math.max(0, offs.length - 1);
  for (let k = 0; k < n; k += 1) {
    let text = '';
    try { text = zlib.zstdDecompressSync(buf.subarray(offs[k], offs[k + 1])).toString('utf8'); } catch { text = ''; }
    if (text) { parts.push(text); bytes += text.length; }
    if (bytes > maxBytes) return { ok: true, text: parts.join(''), frames: k + 1, truncated: true };
  }
  // 末帧（到文件尾）
  if (offs.length) {
    try {
      const text = zlib.zstdDecompressSync(buf.subarray(offs[offs.length - 1])).toString('utf8');
      if (text) { parts.push(text); bytes += text.length; }
    } catch { /* ignore */ }
  }
  return { ok: true, text: parts.join(''), frames: offs.length, truncated: bytes > maxBytes };
}

const DISPATCH_START_TYPES = new Set(['tool/code-dispatch-start', 'tool/ptc-dispatch-start']);
const DISPATCH_END_TYPES = new Set(['tool/code-dispatch', 'tool/ptc-dispatch']);

/** 从会话日志文本抽工具调用（tool/call + 内层 dispatch；同名聚合 count/ms） */
export function extractToolsFromLogText(text) {
  const tools = new Map();
  const add = (name, ms, isError) => {
    if (!name) return;
    const key = String(name);
    const cur = tools.get(key) || { name: key, count: 0, ms: 0, errors: 0 };
    cur.count += 1;
    cur.ms += Math.max(0, Number(ms) || 0);
    if (isError) cur.errors += 1;
    tools.set(key, cur);
  };
  const pendingCall = new Map();   // callId → {name, time}
  const pendingDispatch = new Map(); // subCallId → time
  let model = null;
  const lines = String(text || '').split(String.fromCharCode(10));
  for (const line of lines) {
    if (!line || line.charCodeAt(0) !== 123) continue; // '{'
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const t = o && o.type;
    const d = (o && o.data) || {};
    if (t === 'request/header' || t === 'request/context') {
      const m = (d.header && d.header.config && d.header.config.model) || d.model || null;
      if (m && !model) model = String(m);
      continue;
    }
    if (t === 'tool/call') {
      if (d.callId && d.name) pendingCall.set(String(d.callId), { name: String(d.name), time: num(o.time) || 0 });
      continue;
    }
    if (t === 'tool/result') {
      const callId = d.message && d.message.source && d.message.source.callId ? String(d.message.source.callId) : null;
      const p = callId ? pendingCall.get(callId) : null;
      if (p) { add(p.name, (num(o.time) || 0) - p.time, false); pendingCall.delete(callId); }
      continue;
    }
    if (DISPATCH_START_TYPES.has(t)) {
      const id = String(d.subCallId || d.callId || d.parentCallId || '');
      if (id) pendingDispatch.set(id, num(o.time) || 0);
      continue;
    }
    if (DISPATCH_END_TYPES.has(t)) {
      const id = String(d.subCallId || d.callId || d.parentCallId || '');
      const start = id ? pendingDispatch.get(id) : null;
      add(d.name, (num(o.time) || 0) - (start === null || start === undefined ? num(o.time) || 0 : start), d.isError === true);
      if (id) pendingDispatch.delete(id);
    }
  }
  return { tools: [...tools.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), model };
}

function foldSessions(sessions) {
  const totals = { uncached_input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
  let modelCalls = 0;
  let turns = 0;
  let llmMs = 0;
  let toolMs = 0;
  for (const s of sessions) {
    totals.uncached_input_tokens += s.totals.uncached_input_tokens;
    totals.output_tokens += s.totals.output_tokens;
    totals.cache_read_tokens += s.totals.cache_read_tokens;
    totals.cache_write_tokens += s.totals.cache_write_tokens;
    modelCalls += s.model_calls || 0;
    turns += s.turns || 0;
    llmMs += s.llm_ms || 0;
    toolMs += s.tool_ms || 0;
  }
  return { tokenTotals: totals, model_calls: modelCalls, turns, llm_ms: llmMs, tool_ms: toolMs };
}

/** 运行（会话）参考时刻：优先最后一次提示时间，其次会话创建时间，最后 now */
export function referenceTimeOf(sessions, now = new Date()) {
  const times = [];
  for (const s of sessions) {
    if (s.last_prompt_at) times.push(s.last_prompt_at);
    else if (s.created_at) times.push(s.created_at);
  }
  if (!times.length) return now instanceof Date ? now : new Date(now);
  return new Date(Math.max(...times));
}

/**
 * ★取证主入口（同步；**必须在 teardown 删除会话之前**调用）：
 * 读 projcache + 会话 jsonl（可选）⇒ 写 <run-root>/out/session-usage.json。
 * @param {object} args
 * @param {string} args.runRoot
 * @param {object|null} args.priceTable 价目表（缺省=官网默认值；调用方通常传 system_configs.llm_prices）
 * @param {boolean} args.force 已存在时是否重算（默认 false：幂等复用已写出的产物）
 */
export function captureSessionUsage({ runRoot, priceTable = null, now = new Date(), log = console, force = false, tools = true } = {}) {
  const outPath = path.join(String(runRoot), USAGE_REL_PATH);
  if (!force && fs.existsSync(outPath)) {
    const prev = readJsonSafe(outPath);
    if (prev && prev.schema === SESSION_USAGE_SCHEMA) {
      if (typeof log?.log === 'function') log.log('SESSION_USAGE=reused path=' + outPath + ' model_calls=' + (prev.totals ? prev.totals.model_calls : 'na') + ' cost_total=' + (prev.cost && prev.cost.cost_total));
      return { ok: true, reused: true, path: outPath, usage: prev };
    }
  }
  const raw = readProjcacheSessions(runRoot);
  const sessions = raw.map((s) => ({
    session_id: s.session_id,
    model_calls: s.steps || 0,
    turns: s.turns,
    totals: s.totals,
    last_buckets: s.last_buckets,
    // ★F-T5-1（R2-B39 修复）：顶层也要保留 llm_ms/tool_ms —— foldSessions() 累加的是这两个字段，
    //   此前只放进 session_stats ⇒ 顶层聚合恒 0（假 0；usage_json/归档审计失真）。
    llm_ms: s.llm_ms || 0,
    tool_ms: s.tool_ms || 0,
    session_stats: { llm_ms: s.llm_ms, tool_ms: s.tool_ms, decode_tokens: s.decode_tokens, ttft_ms: s.ttft_ms, last_step: s.last_step },
    created_at: s.created_at ? new Date(s.created_at).toISOString() : null,
    last_prompt_at: s.last_prompt_at ? new Date(s.last_prompt_at).toISOString() : null,
  }));
  const folded = foldSessions(sessions);
  // 工具调用（会话 jsonl；取**全部会话日志**里 latest 的一个即可 —— 设备一次运行通常单会话）
  let toolsAgg = null;
  let toolsSource = 'unavailable';
  let modelFromLog = null;
  if (tools) {
    const logs = listSessionLogs(runRoot);
    if (logs.length) {
      const merged = new Map();
      let any = false;
      for (const f of logs) {
        const r = readSessionLogText(f);
        if (!r.ok || !r.text) continue;
        const ext = extractToolsFromLogText(r.text);
        if (ext.model && !modelFromLog) modelFromLog = ext.model;
        if (ext.tools.length) any = true;
        for (const t of ext.tools) {
          const cur = merged.get(t.name) || { name: t.name, count: 0, ms: 0, errors: 0 };
          cur.count += t.count; cur.ms += t.ms; cur.errors += t.errors;
          merged.set(t.name, cur);
        }
        if (r.truncated) toolsSource = 'session_jsonl_truncated';
      }
      if (any) {
        toolsAgg = [...merged.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        if (toolsSource !== 'session_jsonl_truncated') toolsSource = 'session_jsonl';
      }
    }
  }
  const refAt = referenceTimeOf(raw, now);
  const table = resolvePriceTable(priceTable);
  const model = modelFromLog;
  const noModelSession = !sessions.some((s) => s.model_calls > 0) && folded.tokenTotals.output_tokens === 0 && folded.tokenTotals.cache_read_tokens === 0 && folded.tokenTotals.uncached_input_tokens === 0;
  const cost = noModelSession
    // ★O3（R2-B39）：无模型会话 ⇒ 没有「调用时刻」可言，档位如实写 na（不再给 peak/idle 这类无意义值）
    ? { ok: true, cost_total: 0, currency: table.currency, tier: 'na', per_call: null, model_key: null, model: null, units: null, breakdown: { input_hit: 0, input_miss: 0, output: 0 }, price_version: table.price_version }
    : computeCost({ totals: folded.tokenTotals, model, table, at: refAt });
  const usage = {
    schema: SESSION_USAGE_SCHEMA,
    run_root: String(runRoot),
    computed_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    price_version: cost.price_version,
    price_effective_from: table.effective_from,
    price_tier: cost.tier,
    cost_basis: 'session_reference_time',
    reference_time: refAt.toISOString(),
    sessions,
    // ★平面口径：totals 直接给四个 token 字段（与任务契约一致）+ 统计字段；命中率 = cache_read/(cache_read+uncached_input)
    totals: {
      uncached_input_tokens: folded.tokenTotals.uncached_input_tokens,
      output_tokens: folded.tokenTotals.output_tokens,
      cache_read_tokens: folded.tokenTotals.cache_read_tokens,
      cache_write_tokens: folded.tokenTotals.cache_write_tokens,
      input_tokens: folded.tokenTotals.uncached_input_tokens + folded.tokenTotals.cache_read_tokens,
      model_calls: folded.model_calls,
      turns: folded.turns,
      llm_ms: folded.llm_ms,
      tool_ms: folded.tool_ms,
      cache_hit_rate: cacheHitRate(folded.tokenTotals),
    },
    model,
    tools: toolsAgg,
    tools_source: toolsSource,
    cost: {
      currency: cost.currency,
      cost_total: cost.cost_total,
      // ★O3（R2-B39）：费用块自带档位（peak/idle/na）—— 审计面不必回看顶层字段才能判断口径
      tier: cost.tier,
      model_key: cost.model_key || null,
      breakdown: cost.breakdown,
      per_call: cost.per_call,
      reason: cost.reason || null,
    },
    no_model_session: noModelSession,
    calls: null,
    calls_note: '逐次分桶不可得：projcache 仅给 totals + 最后一次 buckets，会话 jsonl 无 per-call usage 记录 ⇒ calls=null（不伪造）；费用按会话参考时刻所属时段单档计（cost_basis=session_reference_time）',
  };
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(usage, null, 2) + String.fromCharCode(10));
  } catch (err) {
    return { ok: false, reason: 'write_failed:' + String(err && err.message).slice(0, 120), path: outPath, usage };
  }
  if (typeof log?.log === 'function') {
    log.log('SESSION_USAGE=written path=' + outPath + ' sessions=' + sessions.length + ' model_calls=' + folded.model_calls
      + ' uncached_input=' + folded.tokenTotals.uncached_input_tokens + ' output=' + folded.tokenTotals.output_tokens
      + ' cache_read=' + folded.tokenTotals.cache_read_tokens + ' cache_write=' + folded.tokenTotals.cache_write_tokens
      + ' hit_rate=' + (cacheHitRate(folded.tokenTotals) === null ? 'na' : cacheHitRate(folded.tokenTotals))
      + ' cost_total=' + (cost.cost_total === null ? 'na' : cost.cost_total) + ' currency=' + cost.currency
      + ' tier=' + cost.tier + ' price_version=' + cost.price_version
      + ' tools=' + (toolsAgg ? toolsAgg.length : 'null') + ' tools_source=' + toolsSource
      + ' no_model_session=' + (noModelSession ? 'yes' : 'no'));
  }
  return { ok: true, reused: false, path: outPath, usage };
}

/** 归档证据用的紧凑摘要（塞进 run-teardown.json / grading_job_runs.teardown_json，UI 直接可读） */
export function summarizeUsageForEvidence(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const t = usage.totals || {};
  return {
    schema: usage.schema,
    sessions: Array.isArray(usage.sessions) ? usage.sessions.length : 0,
    model_calls: t.model_calls || 0,
    uncached_input_tokens: t.uncached_input_tokens || 0,
    output_tokens: t.output_tokens || 0,
    cache_read_tokens: t.cache_read_tokens || 0,
    cache_write_tokens: t.cache_write_tokens || 0,
    cache_hit_rate: t.cache_hit_rate === undefined ? null : t.cache_hit_rate,
    cost_total: usage.cost ? usage.cost.cost_total : null,
    cost_currency: usage.cost ? usage.cost.currency : null,
    price_version: usage.price_version || null,
    price_tier: usage.price_tier || null,
    no_model_session: usage.no_model_session === true,
    tools: Array.isArray(usage.tools) ? usage.tools.length : null,
    tools_source: usage.tools_source || null,
  };
}
