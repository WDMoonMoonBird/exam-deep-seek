/**
 * openProjectUsage.js —— OP-2（D1-4）：把「开放题自动评价」的真实模型调用聚合成 **session-usage/1 同构** usage 对象。
 *
 * 用途：open job 没有 DSH 设备会话（无 run-root/home），不能走 captureSessionUsage；但 legacy gradeProject
 *   的每个 200 响应都带 data.usage（A1-usage-audit §3）。本模块把 N 份提交 × 若干次调用聚合成一行
 *   grading_run_usage（由 run-once 以 run_ref='job:<id>' + job_id UPSERT 落库），使管理员
 *   list/detail 的 token/缓存/费用/model_calls/价目版本 等字段与普通题**同类型呈现**（read-model/UI 零改动命中）。
 *
 * 口径（A1 §5.4/§6/§8）：
 *   · 费用 = computeCost({calls, model, table}) —— 与普通题同一价目表/同一函数；多调用跨时段 ⇒ tier=mixed；
 *   · price_version/price_tier 来自价目表解析结果（和普通题同源）；
 *   · cache_write_tokens 平台 API 未提供 ⇒ 0 + calls_note 注明「不可得，非真实缓存写入」（列 NOT NULL 限制）；
 *   · 未知型号 ⇒ cost_total=null + cost.reason（不伪造 0），tokens 仍如实给出；
 *   · 0 次调用 ⇒ 返回 null（调用方不写行，详情如实 no_usage_record）。
 */
import { SESSION_USAGE_SCHEMA, cacheHitRate, computeCost, resolvePriceTable } from './dshSessionUsage.js';

export const CACHE_WRITE_UNAVAILABLE_NOTE = 'cache_write_tokens 平台 API 未提供 ⇒ 0（不可得，非真实缓存写入）';
export const OPEN_USAGE_BASE_NOTE = '开放题自动评价：按每次 DeepSeek API 响应的 usage 聚合（cost_basis=api_call_time）；'
  + 'model_calls=200 响应次数（含解析失败重试的真实调用；429/非 2xx 无 usage 不计）';

const num0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * @param {object} args
 * @param {Array<{at?:string, model?:string|null, prompt_tokens?:number|null, cache_hit_tokens?:number, cache_miss_tokens?:number|null,
 *   output_tokens?:number|null, reasoning_tokens?:number|null, submissionId?:number|null,
 *   cache_fields_unavailable?:boolean, cache_hit_derived?:boolean, cache_miss_derived?:boolean}>} args.calls
 * @param {object|null} [args.priceTable] 价目表（loadLlmPrices().table）
 * @param {Date|string} [args.now]
 * @returns {object|null} session-usage/1 同构对象；无调用 ⇒ null
 */
export function buildOpenProjectUsage({ calls = [], priceTable = null, now = new Date() } = {}) {
  const list = (Array.isArray(calls) ? calls : []).filter((c) => c && typeof c === 'object');
  if (list.length === 0) return null;
  const table = resolvePriceTable(priceTable);
  const model = (list.find((c) => c.model && String(c.model).trim()) || {}).model || null;
  const apiCalls = list.map((c) => ({
    at: c.at || now,
    cache_hit_tokens: num0(c.cache_hit_tokens),
    cache_miss_tokens: num0(c.cache_miss_tokens),
    output_tokens: num0(c.output_tokens === undefined || c.output_tokens === null ? c.completion_tokens : c.output_tokens),
  }));
  const cost = computeCost({ calls: apiCalls, model, table });
  const sums = apiCalls.reduce((acc, c) => {
    acc.cache_read_tokens += c.cache_hit_tokens;
    acc.uncached_input_tokens += c.cache_miss_tokens;
    acc.output_tokens += c.output_tokens;
    return acc;
  }, { cache_read_tokens: 0, uncached_input_tokens: 0, output_tokens: 0 });
  const totals = {
    uncached_input_tokens: sums.uncached_input_tokens,
    output_tokens: sums.output_tokens,
    cache_read_tokens: sums.cache_read_tokens,
    cache_write_tokens: 0,
    input_tokens: sums.cache_read_tokens + sums.uncached_input_tokens,
    model_calls: list.length,
    cache_hit_rate: cacheHitRate({ cache_read_tokens: sums.cache_read_tokens, uncached_input_tokens: sums.uncached_input_tokens }),
  };

  const anyCacheUnavailable = list.some((c) => c.cache_fields_unavailable === true);
  const anyDerived = list.some((c) => c.cache_hit_derived === true || c.cache_miss_derived === true);
  const notes = [OPEN_USAGE_BASE_NOTE, CACHE_WRITE_UNAVAILABLE_NOTE];
  if (anyCacheUnavailable) notes.push('部分调用缺少 prompt_cache_hit/miss 字段 ⇒ 按 prompt_tokens 拆分（hit=0 / miss=prompt），非真实缓存命中');
  else if (anyDerived) notes.push('部分调用仅提供 cache_hit 或 cache_miss 之一 ⇒ 另一侧由 prompt_tokens 反推（见 calls[] 的 derived 标记）');
  if (!cost.ok) notes.push('费用不可得：' + (cost.reason || 'model_not_priced'));

  const perCall = cost.ok && Array.isArray(cost.per_call) ? cost.per_call : null;
  const singleCall = perCall === null && cost.ok && list.length === 1;
  const detailCalls = list.map((c, i) => {
    const pc = perCall ? perCall[i] : null;
    return {
      submissionId: c.submissionId === undefined || c.submissionId === null ? null : Number(c.submissionId),
      at: c.at || null,
      model: c.model || model,
      tier: pc ? pc.tier : (singleCall ? cost.tier : null),
      prompt_tokens: c.prompt_tokens === undefined ? null : c.prompt_tokens,
      cache_hit_tokens: num0(c.cache_hit_tokens),
      cache_miss_tokens: num0(c.cache_miss_tokens),
      output_tokens: num0(c.output_tokens === undefined || c.output_tokens === null ? c.completion_tokens : c.output_tokens),
      reasoning_tokens: c.reasoning_tokens === undefined ? null : c.reasoning_tokens,
      cost: pc ? pc.cost : (singleCall ? cost.cost_total : null),
      ...(c.cache_fields_unavailable ? { cache_fields_unavailable: true } : {}),
      ...(c.cache_hit_derived ? { cache_hit_derived: true } : {}),
      ...(c.cache_miss_derived ? { cache_miss_derived: true } : {}),
    };
  });

  const computedAt = now instanceof Date ? now : new Date(now);
  const cleanAt = Number.isFinite(computedAt.getTime()) ? computedAt : new Date();
  return {
    schema: SESSION_USAGE_SCHEMA,
    mode: 'open_project_evaluation',
    computed_at: cleanAt.toISOString(),
    price_version: cost.price_version || table.price_version,
    price_effective_from: table.effective_from,
    price_tier: cost.ok ? (cost.tier || null) : null,
    cost_basis: 'api_call_time',
    reference_time: cleanAt.toISOString(),
    sessions: [],
    model,
    totals,
    tools: null,
    tools_source: 'unavailable',
    cost: {
      currency: cost.currency || table.currency,
      cost_total: cost.ok ? cost.cost_total : null,
      tier: cost.ok ? (cost.tier || null) : null,
      model_key: cost.ok ? (cost.model_key || null) : null,
      breakdown: cost.ok ? cost.breakdown : null,
      per_call: cost.ok ? cost.per_call : null,
      reason: cost.ok ? null : (cost.reason || 'model_not_priced'),
      ok: cost.ok === true,
    },
    no_model_session: false,
    calls: detailCalls,
    calls_note: notes.join('；'),
  };
}
