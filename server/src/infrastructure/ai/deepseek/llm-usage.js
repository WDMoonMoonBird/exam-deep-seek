/**
 * llm-usage.js —— OP-2（D1-1）：从 OpenAI 兼容 /v1/chat/completions 的**单个 200 响应**采集 token 用量。
 *
 * 为什么需要：legacy gradeProject 解析 data.choices 后把 data.usage / data.model 丢弃 ⇒ open 题自动评价
 *   的模型调用成本不可见。这里只做**纯映射**（不碰 DB、不碰配置），供 gradeProject 每次 200 响应 push 一条。
 *
 * 口径（A1-usage-audit §8「不伪造 0」）：
 *   · data.usage 缺失 ⇒ 返回 null（不 push；全缺 ⇒ 不写 usage 行）；
 *   · 仅有 prompt_tokens/completion_tokens、无 cache 字段（部分 provider 变体）⇒
 *     hit=0、miss=prompt_tokens，并标记 cache_fields_unavailable（calls_note 会注明；不透支「命中」语义）；
 *   · 只有一个 cache 字段缺失时，用 prompt_tokens 反推另一个（miss=prompt-hit / hit=prompt-miss），并标记 derived；
 *   · 429 / 非 2xx 无 usage ⇒ 不采集（真实未计费/无 token 证据）。
 */

/** 严格数值归一：null/undefined/'' ⇒ null（★Number(null)=0 会被误当显式 0） */
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 单次 200 响应的 usage 采集（纯函数）。
 * @param {{data?:object, fallbackModel?:string|null, at?:Date|string|number}} args
 * @returns {null|{at:string, model:string|null, prompt_tokens:number|null, completion_tokens:number|null,
 *   cache_hit_tokens:number, cache_miss_tokens:number|null, output_tokens:number|null, reasoning_tokens:number|null,
 *   cache_fields_unavailable?:boolean, cache_hit_derived?:boolean, cache_miss_derived?:boolean}}
 */
export function collectLlmCallUsage({ data = null, fallbackModel = null, at = new Date() } = {}) {
  const u = data && typeof data === 'object' && data.usage && typeof data.usage === 'object' ? data.usage : null;
  if (!u) return null;
  const prompt = numOrNull(u.prompt_tokens);
  const completion = numOrNull(u.completion_tokens);
  const hitRaw = numOrNull(u.prompt_cache_hit_tokens);
  const missRaw = numOrNull(u.prompt_cache_miss_tokens);
  // usage.usage 存在但四项 token 全无 ⇒ 视为不可得（不伪造一行全 0）
  if (prompt === null && completion === null && hitRaw === null && missRaw === null) return null;

  let cacheHit = 0;
  let cacheMiss = null;
  let cacheFieldsUnavailable = false;
  let cacheHitDerived = false;
  let cacheMissDerived = false;
  if (hitRaw !== null && missRaw !== null) {
    cacheHit = hitRaw;
    cacheMiss = missRaw;
  } else if (hitRaw !== null) {
    cacheHit = hitRaw;
    cacheMiss = prompt !== null ? Math.max(0, prompt - hitRaw) : null;
    cacheMissDerived = prompt !== null;
  } else if (missRaw !== null) {
    cacheMiss = missRaw;
    cacheHit = prompt !== null ? Math.max(0, prompt - missRaw) : 0;
    cacheHitDerived = prompt !== null;
  } else {
    // 两个 cache 字段都缺：按 A1 §8 口径 hit=0、miss=prompt_tokens（标记不可得，绝不把 prompt 当 hit）
    cacheHit = 0;
    cacheMiss = prompt;
    cacheFieldsUnavailable = true;
  }

  const atDate = at instanceof Date ? at : new Date(at);
  const call = {
    at: (Number.isFinite(atDate.getTime()) ? atDate : new Date()).toISOString(),
    model: (data && typeof data.model === 'string' && data.model.trim() ? data.model.trim() : (fallbackModel || null)),
    prompt_tokens: prompt,
    completion_tokens: completion,
    cache_hit_tokens: cacheHit,
    cache_miss_tokens: cacheMiss,
    output_tokens: completion,
    reasoning_tokens: numOrNull(
      (u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens) !== undefined
        ? u.completion_tokens_details.reasoning_tokens
        : u.reasoning_tokens,
    ),
  };
  if (cacheFieldsUnavailable) call.cache_fields_unavailable = true;
  if (cacheHitDerived) call.cache_hit_derived = true;
  if (cacheMissDerived) call.cache_miss_derived = true;
  return call;
}

/** 把逐次调用包成 gradeProject 的返回/异常附加信封（model = 首个非空 model） */
export function buildLlmUsage(calls = []) {
  const list = (Array.isArray(calls) ? calls : []).filter((c) => c && typeof c === 'object');
  const first = list.find((c) => c.model);
  return { model: (first && first.model) || null, calls: list, calls_count: list.length };
}
