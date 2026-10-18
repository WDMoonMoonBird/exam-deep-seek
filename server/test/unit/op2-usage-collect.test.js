/**
 * op2-usage-collect.test.js — OP-2 / C1：open job 模型调用 usage 的**采集 → 聚合**纯逻辑 + gradeProject 计次。
 *
 * 覆盖（无 DB 夹具；grading 出网被 mock，其余真实实现）：
 *   ① collectLlmCallUsage：完整字段映射 / fallback model / 无 usage⇒null / usage={}⇒null /
 *      cache 双缺⇒hit=0 miss=prompt+标记 / 单侧缺失⇒反推 derived；
 *   ② buildLlmUsage：model 取首个非空、calls_count；
 *   ③ gradeProject：成功携带 llm_usage（open 角色 OPEN_PROJECT_ROLE）；标准题路径同样携带（向后兼容）；
 *      解析失败重试 ⇒ **每次 200 响应都计**（model_calls > 评分份数）；最终失败仍带真实计费调用，
 *      且 429/非 2xx（无 usage）不计；
 *   ④ buildOpenProjectUsage：2 调用聚合 totals/4 token/cache_write=0/model_calls/cache_hit_rate；
 *      费用 = 独立 computeCost 复算且一致；price_version/price_tier/currency；no_model_session=false；
 *      calls[] 明细（submissionId/tier/cost）+ calls_note（API 调用口径/cache_write 不可得）；
 *      未知型号 ⇒ cost_total=null + reason（不伪造 0）；0 调用 ⇒ null。
 */
import { collectLlmCallUsage, buildLlmUsage } from '../../src/infrastructure/ai/deepseek/llm-usage.js';
import { gradeProject } from '../../src/infrastructure/ai/deepseek/project-grading.js';
import {
  buildOpenProjectUsage, CACHE_WRITE_UNAVAILABLE_NOTE, OPEN_USAGE_BASE_NOTE,
} from '../../src/infrastructure/dsh/usage/openProjectUsage.js';
import { computeCost, resolvePriceTable, SESSION_USAGE_SCHEMA } from '../../src/infrastructure/dsh/usage/dshSessionUsage.js';
import { OPEN_PROJECT_ROLE, PROJECT_ROLE } from '../../src/infrastructure/ai/deepseek/index.js';

const MOCK_GRADE = {
  totalScore: 88,
  breakdown: [
    { item: '功能完整性', score: 53, maxScore: 60, comment: '增删改查齐备' },
    { item: '代码规范', score: 20, maxScore: 20, comment: '结构清晰' },
  ],
  highlights: ['代码结构清晰'],
  issues: ['缺少异常处理'],
  overallComment: '整体完成度较好，建议补充异常处理与边界校验。',
};
const USAGE_A = {
  prompt_tokens: 1000, completion_tokens: 100, prompt_cache_hit_tokens: 400,
  prompt_cache_miss_tokens: 600, completion_tokens_details: { reasoning_tokens: 30 },
};
const USAGE_B = {
  prompt_tokens: 500, completion_tokens: 50, prompt_cache_hit_tokens: 100,
  prompt_cache_miss_tokens: 400,
};

const jsonResponse = (body, status = 200) => ({
  status, ok: status >= 200 && status < 300, json: async () => body,
});

/** 构造一个 chat/completions 响应 */
function aiResponse({ content = JSON.stringify(MOCK_GRADE), usage = null, model = 'deepseek-v4-flash', status = 200 } = {}) {
  if (status !== 200) return jsonResponse({ error: 'boom' }, status);
  return jsonResponse({ model, usage, choices: [{ message: { content }, finish_reason: 'stop' }] });
}

/** 按调用序号返回不同响应，并记录请求体 */
function installFetch(handler) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return handler(calls.length, body);
  };
  return { calls, restore: () => { global.fetch = original; } };
}

const GRADE_ARGS = {
  title: '待办事项管理程序', description: '实现增删改查', scoringRubric: '功能完整性 60；代码规范 20；健壮性 20',
  standardFiles: '// std', studentFiles: '// student', mode: 'open', fixedItems: null, maxScore: 100,
};

describe('OP-2 usage 采集/聚合（C1）', () => {
  let restoreFetch = null;
  afterEach(() => { if (restoreFetch) { restoreFetch(); restoreFetch = null; } });

  // ---------------- ① collector ----------------
  it('①-1 collectLlmCallUsage：完整字段映射（含 reasoning/model/at）', () => {
    const call = collectLlmCallUsage({
      data: { model: 'deepseek-v4-flash', usage: USAGE_A },
      fallbackModel: 'fallback-model',
      at: '2026-10-18T00:00:00Z',
    });
    expect(call).toMatchObject({
      model: 'deepseek-v4-flash',
      prompt_tokens: 1000,
      completion_tokens: 100,
      cache_hit_tokens: 400,
      cache_miss_tokens: 600,
      output_tokens: 100,
      reasoning_tokens: 30,
    });
    expect(call.at).toBe('2026-10-18T00:00:00.000Z');
    expect(call.model).not.toBe('fallback-model');
  });

  it('①-2 collectLlmCallUsage：无 usage⇒null；空 usage⇒null；fallback model 生效', () => {
    expect(collectLlmCallUsage({ data: { choices: [] } })).toBeNull();
    expect(collectLlmCallUsage({ data: null })).toBeNull();
    expect(collectLlmCallUsage({ data: { usage: {} } })).toBeNull();
    const fallback = collectLlmCallUsage({ data: { usage: USAGE_A }, fallbackModel: 'm-fallback' });
    expect(fallback.model).toBe('m-fallback');
  });

  it('①-3 collectLlmCallUsage：cache 双缺⇒hit=0/miss=prompt+标记；单侧缺失⇒反推 derived', () => {
    const missingBoth = collectLlmCallUsage({ data: { usage: { prompt_tokens: 1000, completion_tokens: 10 } } });
    expect(missingBoth.cache_hit_tokens).toBe(0);
    expect(missingBoth.cache_miss_tokens).toBe(1000);       // miss=prompt，绝不把 prompt 当 hit
    expect(missingBoth.cache_fields_unavailable).toBe(true);

    const onlyHit = collectLlmCallUsage({ data: { usage: { prompt_tokens: 1000, prompt_cache_hit_tokens: 300 } } });
    expect(onlyHit.cache_hit_tokens).toBe(300);
    expect(onlyHit.cache_miss_tokens).toBe(700);            // 反推
    expect(onlyHit.cache_miss_derived).toBe(true);

    const onlyMiss = collectLlmCallUsage({ data: { usage: { prompt_tokens: 1000, prompt_cache_miss_tokens: 800 } } });
    expect(onlyMiss.cache_miss_tokens).toBe(800);
    expect(onlyMiss.cache_hit_tokens).toBe(200);
    expect(onlyMiss.cache_hit_derived).toBe(true);
  });

  it('①-4 buildLlmUsage：model 取首个非空、calls_count 正确', () => {
    const env = buildLlmUsage([
      { model: null, prompt_tokens: 1 },
      { model: 'deepseek-v4-flash', prompt_tokens: 2 },
      { model: 'other', prompt_tokens: 3 },
    ]);
    expect(env.model).toBe('deepseek-v4-flash');
    expect(env.calls).toHaveLength(3);
    expect(env.calls_count).toBe(3);
    expect(buildLlmUsage([])).toEqual({ model: null, calls: [], calls_count: 0 });
  });

  // ---------------- ③ gradeProject 计次 ----------------
  it('③-1 gradeProject 成功：返回 llm_usage（1 调用、真实 tokens）；open 用 OPEN_PROJECT_ROLE', async () => {
    const h = installFetch(() => aiResponse({ usage: USAGE_A }));
    restoreFetch = h.restore;
    const res = await gradeProject({ ...GRADE_ARGS, mode: 'open' });
    expect(res.totalScore).toBe(88);
    expect(res.llm_usage.model).toBe('deepseek-v4-flash');
    expect(res.llm_usage.calls).toHaveLength(1);
    expect(res.llm_usage.calls[0]).toMatchObject({
      prompt_tokens: 1000, completion_tokens: 100, cache_hit_tokens: 400, cache_miss_tokens: 600, reasoning_tokens: 30,
    });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].messages[0].content).toBe(OPEN_PROJECT_ROLE);
  });

  it('③-2 gradeProject 标准题（普通题回归）：同样携带 llm_usage，system=PROJECT_ROLE（向后兼容）', async () => {
    const h = installFetch(() => aiResponse({ usage: USAGE_A }));
    restoreFetch = h.restore;
    const res = await gradeProject({ ...GRADE_ARGS, mode: 'standard' });
    expect(res.totalScore).toBe(88);
    expect(res.llm_usage.calls).toHaveLength(1);
    expect(h.calls[0].messages[0].content).toBe(PROJECT_ROLE);
  });

  it('③-3 gradeProject 解析失败重试：两次 200 响应都计入 llm_usage（model_calls>1）', async () => {
    const h = installFetch((n) => (n === 1
      ? aiResponse({ content: 'not-a-json', usage: USAGE_A })
      : aiResponse({ usage: USAGE_B })));
    restoreFetch = h.restore;
    const res = await gradeProject({ ...GRADE_ARGS, mode: 'open' });
    expect(h.calls).toHaveLength(2);
    expect(res.llm_usage.calls).toHaveLength(2);          // ★重试的真实调用也计费
    expect(res.llm_usage.calls[0].prompt_tokens).toBe(1000);
    expect(res.llm_usage.calls[1].prompt_tokens).toBe(500);
  }, 30000);

  it('③-4 gradeProject 最终失败：err.llm_usage 带真实 200 调用；429/非 2xx（无 usage）不计', async () => {
    const h = installFetch((n) => {
      if (n === 1) return aiResponse({ content: 'bad-json-1', usage: USAGE_A });   // 200 计
      if (n === 2) return aiResponse({ status: 500 });                            // 非 2xx 不计
      return aiResponse({ content: 'bad-json-3', usage: USAGE_B });               // 200 计
    });
    restoreFetch = h.restore;
    let err = null;
    try { await gradeProject({ ...GRADE_ARGS, mode: 'open' }); } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(h.calls).toHaveLength(3);
    expect(err.llm_usage.calls).toHaveLength(2);          // 只计两次 200；500 无 usage 不计
    expect(err.llm_usage.calls.map((c) => c.prompt_tokens)).toEqual([1000, 500]);
  }, 30000);

  // ---------------- ④ buildOpenProjectUsage 聚合 ----------------
  const twoCalls = () => ([
    { at: '2026-10-18T00:00:00.000Z', model: 'deepseek-v4-flash', prompt_tokens: 1000, cache_hit_tokens: 400, cache_miss_tokens: 600, output_tokens: 100, reasoning_tokens: 30, submissionId: 111 },
    { at: '2026-10-18T00:00:01.000Z', model: 'deepseek-v4-flash', prompt_tokens: 1000, cache_hit_tokens: 400, cache_miss_tokens: 600, output_tokens: 100, reasoning_tokens: 30, submissionId: 222 },
  ]);

  it('④-1 聚合 2 调用：totals 4 token/cache_write=0/model_calls/cache_hit_rate + 费用与独立 computeCost 一致', () => {
    const table = resolvePriceTable(null);
    const usage = buildOpenProjectUsage({ calls: twoCalls(), priceTable: null, now: '2026-10-18T00:00:02Z' });
    expect(usage.schema).toBe(SESSION_USAGE_SCHEMA);
    expect(usage.mode).toBe('open_project_evaluation');
    expect(usage.totals).toMatchObject({
      uncached_input_tokens: 1200, output_tokens: 200, cache_read_tokens: 800, cache_write_tokens: 0,
      input_tokens: 2000, model_calls: 2, cache_hit_rate: 0.4,
    });
    expect(usage.no_model_session).toBe(false);
    expect(usage.cost_basis).toBe('api_call_time');
    expect(usage.model).toBe('deepseek-v4-flash');
    expect(usage.price_version).toBe(table.price_version);
    expect(['peak', 'idle', 'mixed']).toContain(usage.price_tier);
    expect(usage.cost.currency).toBe(table.currency);
    expect(usage.cost.ok).toBe(true);
    // ★费用独立性：用独立 computeCost 复算（非调 buildOpenProjectUsage 自身）应一致
    const expected = computeCost({
      calls: twoCalls().map((c) => ({ at: c.at, cache_hit_tokens: c.cache_hit_tokens, cache_miss_tokens: c.cache_miss_tokens, output_tokens: c.output_tokens })),
      model: 'deepseek-v4-flash', table,
    });
    expect(expected.ok).toBe(true);
    expect(usage.cost.cost_total).toBeCloseTo(expected.cost_total, 6);
    expect(usage.cost.per_call).toHaveLength(2);
    // calls 明细
    expect(usage.calls).toHaveLength(2);
    expect(usage.calls.map((c) => c.submissionId)).toEqual([111, 222]);
    expect(usage.calls[0]).toMatchObject({ prompt_tokens: 1000, cache_hit_tokens: 400, cache_miss_tokens: 600, output_tokens: 100, reasoning_tokens: 30 });
    expect(typeof usage.calls[0].tier).toBe('string');
    expect(typeof usage.calls[0].cost).toBe('number');
    // 口径 note：API 调用聚合 + cache_write 不可得
    expect(usage.calls_note).toContain(CACHE_WRITE_UNAVAILABLE_NOTE);
    expect(usage.calls_note).toContain('cost_basis=api_call_time');
    expect(OPEN_USAGE_BASE_NOTE).toContain('model_calls=200 响应次数');
  });

  it('④-2 未知型号：cost_total=null + reason（不伪造 0），tokens 仍如实', () => {
    const calls = twoCalls().map((c) => ({ ...c, model: 'unknown-model-zzz' }));
    const usage = buildOpenProjectUsage({ calls, priceTable: null });
    expect(usage.cost.ok).toBe(false);
    expect(usage.cost.cost_total).toBeNull();
    expect(usage.cost.reason).toContain('model_not_priced');
    expect(usage.price_tier).toBeNull();
    expect(usage.totals.input_tokens).toBe(2000);         // token 仍给出
    expect(usage.totals.model_calls).toBe(2);
    expect(usage.calls_note).toContain('费用不可得');
  });

  it('④-3 0 调用 ⇒ null（调用方不写行，绝不伪造全 0 行）', () => {
    expect(buildOpenProjectUsage({ calls: [], priceTable: null })).toBeNull();
    expect(buildOpenProjectUsage({ calls: null, priceTable: null })).toBeNull();
  });

  it('④-4 cache 字段缺失的调用：按 hit=0/miss=prompt 拆分并注明（不把 prompt 当命中）', () => {
    const usage = buildOpenProjectUsage({
      calls: [{ at: '2026-10-18T00:00:00.000Z', model: 'deepseek-v4-flash', prompt_tokens: 1000, cache_hit_tokens: 0, cache_miss_tokens: 1000, output_tokens: 10, cache_fields_unavailable: true }],
      priceTable: null,
    });
    expect(usage.totals.cache_read_tokens).toBe(0);
    expect(usage.totals.uncached_input_tokens).toBe(1000);
    expect(usage.totals.cache_hit_rate).toBe(0);
    expect(usage.calls_note).toContain('非真实缓存命中');
    expect(usage.calls[0].cache_fields_unavailable).toBe(true);
  });
});
