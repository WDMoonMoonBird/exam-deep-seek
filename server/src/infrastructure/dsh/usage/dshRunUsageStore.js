/**
 * dshRunUsageStore.js —— R2-B36（P1）：价目表（system_configs.llm_prices）与运行用量落库（grading_run_usage）。
 *
 * 铁律：
 *  1) 价目表**可配置**（管理员读写，沿用既有 AiConfig 形态 GET/PUT /api/admin/settings）；缺省=官网默认值；
 *     非法配置**不改库**（返回可判定 reason），读取时永远返回「默认值 + 覆盖」的完整有效表；
 *  2) 落库按 run_ref 幂等 UPSERT（job:<jobId> / build:<assignmentId>:<runRootBasename>），失败**不改变** job 终态（fail-soft）；
 *  3) 零 LLM 运行如实落 0 token + no_model_session=1（不伪造费用）；
 *  4) 存储读写走**原始 SQL**（不依赖 Prisma Client 模型生成——本仓库既有约定）。
 */
import { DEFAULT_LLM_PRICES, resolvePriceTable } from './dshSessionUsage.js';

export const LLM_PRICES_KEY = 'llm_prices';
export const RUN_USAGE_TABLE = 'grading_run_usage';

export function hasRawSql(prisma) {
  return !!(prisma && typeof prisma.$executeRawUnsafe === 'function' && typeof prisma.$queryRawUnsafe === 'function');
}

/** 价目表结构校验（只做「能不能安全算费用」的判定；返回 {ok, reason?, prices?}） */
export function validateLlmPrices(payload) {
  let obj = payload;
  if (typeof payload === 'string') {
    try { obj = JSON.parse(payload); } catch { return { ok: false, reason: 'not_json' }; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'not_object' };
  if (obj.models !== undefined && (typeof obj.models !== 'object' || Array.isArray(obj.models) || obj.models === null)) return { ok: false, reason: 'models_not_object' };
  for (const [key, def] of Object.entries(obj.models || {})) {
    if (!def || typeof def !== 'object') return { ok: false, reason: 'model_not_object:' + key };
    for (const tier of ['peak', 'idle']) {
      const t = def[tier];
      if (t === undefined) continue;
      if (!t || typeof t !== 'object') return { ok: false, reason: 'tier_not_object:' + key + '.' + tier };
      for (const f of ['cache_hit', 'cache_miss', 'output']) {
        if (t[f] === undefined) continue;
        const n = Number(t[f]);
        if (!Number.isFinite(n) || n < 0) return { ok: false, reason: 'bad_price:' + key + '.' + tier + '.' + f };
      }
    }
    if (def.match !== undefined && !Array.isArray(def.match)) return { ok: false, reason: 'bad_match:' + key };
  }
  if (obj.holidays !== undefined && !Array.isArray(obj.holidays)) return { ok: false, reason: 'holidays_not_array' };
  if (obj.peak_windows !== undefined && !Array.isArray(obj.peak_windows)) return { ok: false, reason: 'peak_windows_not_array' };
  for (const w of obj.peak_windows || []) {
    if (!w || typeof w !== 'object') return { ok: false, reason: 'peak_window_not_object' };
    for (const f of ['start', 'end']) {
      if (w[f] !== undefined && !/^\d{1,2}:\d{2}$/.test(String(w[f]))) return { ok: false, reason: 'bad_window_time:' + f };
    }
  }
  return { ok: true, prices: obj };
}

/** 读价目表：system_configs.llm_prices ⇒ 与官网默认值合并（缺省/坏配置都返回可用表） */
export async function loadLlmPrices({ prisma } = {}) {
  let raw = null;
  let source = 'default';
  let invalidReason = null;
  try {
    if (hasRawSql(prisma)) {
      const rows = await prisma.$queryRawUnsafe('SELECT `value` FROM system_configs WHERE `key` = ? LIMIT 1', LLM_PRICES_KEY);
      const v = rows && rows[0] && rows[0].value;
      if (v) {
        const v2 = validateLlmPrices(String(v));
        if (v2.ok) { raw = v2.prices; source = 'db'; } else { invalidReason = v2.reason; }
      }
    }
  } catch { /* 读不到 ⇒ 默认值（不抛） */ }
  const table = resolvePriceTable(raw ? { ...raw, source } : null);
  return { table, source, raw, invalid_reason: invalidReason };
}

/** 写价目表（管理员写接口调用；校验失败**不改库**） */
export async function saveLlmPrices({ prisma, prices } = {}) {
  const v = validateLlmPrices(prices);
  if (!v.ok) return { ok: false, reason: v.reason };
  const body = JSON.stringify({ ...v.prices, saved_at: new Date().toISOString() });
  try {
    await prisma.systemConfig.upsert({
      where: { key: LLM_PRICES_KEY },
      update: { value: body },
      create: { key: LLM_PRICES_KEY, value: body },
    });
    return { ok: true, saved: JSON.parse(body) };
  } catch (err) {
    return { ok: false, reason: 'db_error:' + String(err && err.message).slice(0, 120) };
  }
}

/** 落库用行（从 session-usage 对象映射；字段缺失一律 0/null，不猜） */
export function runUsageRowFromUsage(usage = {}) {
  const t = usage.totals || {};
  const cost = usage.cost || {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    model_calls: n(t.model_calls),
    uncached_input_tokens: n(t.uncached_input_tokens),
    output_tokens: n(t.output_tokens),
    cache_read_tokens: n(t.cache_read_tokens),
    cache_write_tokens: n(t.cache_write_tokens),
    cache_hit_rate: t.cache_hit_rate === null || t.cache_hit_rate === undefined ? null : Number(t.cache_hit_rate),
    cost_total: cost.cost_total === null || cost.cost_total === undefined ? null : Number(cost.cost_total),
    cost_currency: cost.currency || null,
    model: usage.model || (cost.model_key === null || cost.model_key === undefined ? null : String(cost.model_key)),
    price_version: usage.price_version || null,
    price_tier: usage.price_tier || null,
    no_model_session: usage.no_model_session === true ? 1 : 0,
    tools_json: Array.isArray(usage.tools) ? JSON.stringify(usage.tools) : null,
    sessions_json: JSON.stringify(Array.isArray(usage.sessions) ? usage.sessions : []),
    usage_json: JSON.stringify(usage),
  };
}

/**
 * ★落库（UPSERT by run_ref；幂等）。失败**不抛**（调用方只记日志，绝不改 job 终态）。
 * @param {{prisma:object, runRef:string, jobId?:number|null, usage:object, log?:object}} args
 */
export async function persistRunUsage({ prisma, runRef, jobId = null, usage = {}, log = console } = {}) {
  if (!hasRawSql(prisma)) return { ok: false, reason: 'no_raw_sql' };
  if (!runRef) return { ok: false, reason: 'no_run_ref' };
  const r = runUsageRowFromUsage(usage);
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO ' + RUN_USAGE_TABLE + ' (run_ref, job_id, model, model_calls, uncached_input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, '
      + 'cache_hit_rate, cost_total, cost_currency, price_version, price_tier, no_model_session, tools_json, sessions_json, usage_json, created_at, updated_at) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)) '
      + 'ON DUPLICATE KEY UPDATE job_id = VALUES(job_id), model = VALUES(model), model_calls = VALUES(model_calls), '
      + 'uncached_input_tokens = VALUES(uncached_input_tokens), output_tokens = VALUES(output_tokens), cache_read_tokens = VALUES(cache_read_tokens), '
      + 'cache_write_tokens = VALUES(cache_write_tokens), cache_hit_rate = VALUES(cache_hit_rate), cost_total = VALUES(cost_total), '
      + 'cost_currency = VALUES(cost_currency), price_version = VALUES(price_version), price_tier = VALUES(price_tier), '
      + 'no_model_session = VALUES(no_model_session), tools_json = VALUES(tools_json), sessions_json = VALUES(sessions_json), '
      + 'usage_json = VALUES(usage_json), updated_at = CURRENT_TIMESTAMP(3)',
      String(runRef), jobId === null || jobId === undefined ? null : Number(jobId), r.model, r.model_calls,
      r.uncached_input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_write_tokens, r.cache_hit_rate,
      r.cost_total, r.cost_currency, r.price_version, r.price_tier, r.no_model_session,
      r.tools_json, r.sessions_json, r.usage_json,
    );
    if (typeof log?.log === 'function') {
      log.log('RUN_USAGE_PERSISTED=yes run_ref=' + runRef + ' job=' + (jobId === null || jobId === undefined ? 'na' : jobId)
        + ' model_calls=' + r.model_calls + ' tokens_in=' + (r.uncached_input_tokens + r.cache_read_tokens) + ' tokens_out=' + r.output_tokens
        + ' hit_rate=' + (r.cache_hit_rate === null ? 'na' : r.cache_hit_rate) + ' cost_total=' + (r.cost_total === null ? 'na' : r.cost_total)
        + ' currency=' + (r.cost_currency || 'na') + ' price_version=' + (r.price_version || 'na') + ' no_model_session=' + r.no_model_session
        + ' tools=' + (r.tools_json ? JSON.parse(r.tools_json).length : 'null'));
    }
    return { ok: true, runRef, row: r };
  } catch (err) {
    const reason = String(err && err.message).slice(0, 200);
    if (typeof log?.log === 'function') log.log('RUN_USAGE_PERSISTED=no run_ref=' + runRef + ' reason=' + reason + '（fail-soft：不改 job 终态）');
    return { ok: false, reason };
  }
}

/** 读回（供 API/测试；不存在返回 null） */
export async function loadRunUsage({ prisma, runRef } = {}) {
  if (!hasRawSql(prisma)) return null;
  const rows = await prisma.$queryRawUnsafe('SELECT * FROM ' + RUN_USAGE_TABLE + ' WHERE run_ref = ? LIMIT 1', String(runRef));
  const row = rows && rows[0];
  if (!row) return null;
  const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
  return {
    run_ref: row.run_ref,
    job_id: row.job_id === null || row.job_id === undefined ? null : Number(row.job_id),
    model: row.model || null,
    model_calls: Number(row.model_calls) || 0,
    uncached_input_tokens: Number(row.uncached_input_tokens) || 0,
    output_tokens: Number(row.output_tokens) || 0,
    cache_read_tokens: Number(row.cache_read_tokens) || 0,
    cache_write_tokens: Number(row.cache_write_tokens) || 0,
    cache_hit_rate: row.cache_hit_rate === null || row.cache_hit_rate === undefined ? null : Number(row.cache_hit_rate),
    cost_total: row.cost_total === null || row.cost_total === undefined ? null : Number(row.cost_total),
    cost_currency: row.cost_currency || null,
    price_version: row.price_version || null,
    price_tier: row.price_tier || null,
    no_model_session: Number(row.no_model_session) === 1,
    tools: parse(row.tools_json),
    sessions: parse(row.sessions_json),
    usage: parse(row.usage_json),
  };
}

export { DEFAULT_LLM_PRICES };
