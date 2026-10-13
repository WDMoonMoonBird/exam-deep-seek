#!/usr/bin/env node
/**
 * ★R2-B48（t29）起：本脚本**退役为「回填 / 兜底」工具**——总评的主路径已改为「平台同运行的第二个会话」：
 *   runDshGradingJobWorker.js（装置后、consumeMeasureResults 前）⇒ runSummarySession()
 *   ⇒ <run-root>/out/summaries.json（schema=summaries/1）⇒ consumer 写 submissions.ai_feedback.summary。
 *   本脚本保留可用，用于：①历史数据回填；②会话路径不可用/需人工复核时补生成；③口径对齐的参考实现。
 *   两者 summary 结构**同构**（text/facts/model/prompt_version/tokens/generated_at[/truncated]）⇒ 前端解析零差异。
 *
 * R2-B43（t18）：为每份提交生成**自然语言总评**（教师视角「像老师说的话」），写入 submissions.ai_feedback.summary。
 *
 * ★铁律：
 *  1) **绝不改分数/状态**：只 UPDATE \`ai_feedback\` 一列（读-改-写，保留既有键）；脚本前后各读一次分数做零变化断言；
 *  2) **默认 dry-run**；写库必须 \`--apply\`；已有 summary 默认跳过（\`--force\` 才重生成）；
 *  3) 模型是**推理型**：max_tokens 太小会被 reasoning_tokens 吃光 ⇒ 默认 2000；\`finish_reason==='length'\` ⇒ 放大预算重试 1 次，
 *     仍截断则存文本并标 \`truncated:true\`；HTTP/解析失败 ⇒ 重试 ≤2 次后跳过并记 \`summary_error\`；
 *  4) 成本护栏：逐份打印 usage + 累计估算（¥），超 \`--max-cost\` 立即停止（退出码 2）；
 *  5) **禁止对生产执行**：由运行者显式提供 DATABASE_URL（生产生成由队长授权后运行）。
 *
 * 用法：
 *   node scripts/gen-ai-summary.mjs --assignment 123 [--limit 5] [--json]              # dry-run
 *   node scripts/gen-ai-summary.mjs --submission 456 --apply                            # 单份写入
 *   node scripts/gen-ai-summary.mjs --assignment 123 --apply --max-cost 1.5 --max-tokens 2500
 *   node scripts/gen-ai-summary.mjs --assignment 123 --force --limit 80                # 覆盖已有 summary
 *   测试可注入假模型：\`--base-url http://127.0.0.1:PORT\`（脚本 POST \`<base-url>/v1/chat/completions\`）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../src/utils/prisma.js';
import { computeCost, priceModelKey, resolvePriceTable } from '../src/services/dshSessionUsage.js';

const NL = String.fromCharCode(10);
export const PROMPT_VERSION = 'ai-summary/1';
export const RUBRIC_MAX_CHARS = 1200;
export const FAILED_ITEMS_MAX = 12;
export const DEFAULT_MAX_TOKENS = 2000;
export const DEFAULT_MAX_COST = 5;
export const SUMMARY_RETRY_MAX = 2;          // 失败重试次数上限
export const LENGTH_RETRY_EXTRA = 1200;      // 截断后放大预算的增量

export function parseArgs(argv) {
  const out = { apply: false, force: false, json: false, limit: 0, maxTokens: DEFAULT_MAX_TOKENS, maxCost: DEFAULT_MAX_COST };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--force') out.force = true;
    else if (a === '--json') out.json = true;
    else if (a === '--assignment') out.assignmentId = Number(argv[++i]);
    else if (a === '--submission') out.submissionId = Number(argv[++i]);
    else if (a === '--limit') out.limit = Number(argv[++i]) || 0;
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--max-tokens') out.maxTokens = Number(argv[++i]) || DEFAULT_MAX_TOKENS;
    else if (a === '--max-cost') out.maxCost = Number(argv[++i]);
    else if (a === '--base-url') out.baseUrl = argv[++i];
    else if (a === '--api-key') out.apiKey = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const USAGE = [
  '用法：node scripts/gen-ai-summary.mjs --assignment <id> [--limit N] [--model m] [--max-tokens N] [--max-cost 元] [--apply] [--force] [--json]',
  '      node scripts/gen-ai-summary.mjs --submission <id> [--apply]',
  '默认 dry-run（不写库）；只更新 ai_feedback 列；已有 summary 默认跳过（--force 覆盖）。',
].join(NL);

/** 节选 rubric（≤1200 字，超出截断并加后缀） */
export function excerptRubric(rubric) {
  const text = String(rubric || '').replace(/\s+$/u, '');
  if (text.length <= RUBRIC_MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, RUBRIC_MAX_CHARS) + '…（评分标准节选，已截断）', truncated: true };
}

/** 从 ai_feedback 解析出的 breakdown 提炼事实（passed/total/failed 明细） */
export function extractBreakdownFacts(breakdown, { score = null, maxScore = null } = {}) {
  const rows = Array.isArray(breakdown) ? breakdown : [];
  const isOk = (b) => {
    const status = b && b.status !== undefined && b.status !== null ? String(b.status).toLowerCase() : null;
    if (status) return ['hit', 'pass', 'ok', 'true', 'met'].includes(status);
    const s = Number(b && b.score);
    const m = Number(b && (b.maxScore ?? b.max_score));
    if (Number.isFinite(s) && Number.isFinite(m)) return m > 0 ? s >= m : s >= 0;
    return null;
  };
  const failed = [];
  for (const b of rows) {
    if (b === null || b === undefined || typeof b !== 'object') continue;
    if (isOk(b) === true) continue;
    failed.push({
      item: String(b.item || b.name || ''),
      title: String(b.title || b.item || ''),
      score: Number.isFinite(Number(b.score)) ? Number(b.score) : null,
      maxScore: Number.isFinite(Number(b.maxScore ?? b.max_score)) ? Number(b.maxScore ?? b.max_score) : null,
      comment: String(b.comment || ''),
    });
  }
  const total = rows.length;
  const passed = rows.filter((b) => isOk(b) === true).length;
  return {
    total,
    passed,
    failed_count: failed.length,
    failed,
    failed_items: failed.slice(0, FAILED_ITEMS_MAX).map((f) => f.item).filter(Boolean),
    score,
    max_score: maxScore,
  };
}

/**
 * 组装 prompt（三条要求必须保留：①总体结论 ②失分点及可能原因（只依据未通过项，不得编造）③1 条可执行建议；
 * 禁止逐条复述与客套话）。返回 {system, user, rubric, facts, truncated_failed}
 */
export function buildSummaryPrompt({ rubric = '', facts = {}, subject = '本次提交' } = {}) {
  const rb = excerptRubric(rubric);
  const failed = Array.isArray(facts.failed) ? facts.failed : [];
  const listed = failed.slice(0, FAILED_ITEMS_MAX);
  const failedLines = listed.map((f) => '- ' + [
    f.item || '(未命名)',
    f.title ? '｜' + f.title : '',
    '｜' + (f.score === null ? '?' : f.score) + '/' + (f.maxScore === null ? '?' : f.maxScore),
    f.comment ? '｜' + String(f.comment).slice(0, 300) : '',
  ].join('')).join(NL);
  const system = '你是一位负责项目式课程（Java Web 工程实践）的助教，正在给教师写「AI 评分总评」。'
    + '要求：用 2~4 句话，分三部分：①总体结论（整体完成度如何）②失分点及**可能原因**（**只能依据下面给出的未通过项**，不得编造未提供的信息、不得臆测学生写了什么）'
    + '③1 条可执行的改进建议（具体到文件/类/方法或检查项）。禁止逐条复述检查项、禁止客套话与套话；语气专业、简洁。';
  const user = [
    '【评分标准节选（可能已截断）】' + NL + (rb.text || '（无评分标准快照，按检查项名称理解要求）'),
    NL + '【本次结果】' + NL
      + '得分：' + (facts.score === null || facts.score === undefined ? '（未知）' : facts.score)
      + ' / ' + (facts.max_score === null || facts.max_score === undefined ? '（未知）' : facts.max_score)
      + '；检查项 ' + (facts.total || 0) + ' 项，通过 ' + (facts.passed || 0) + ' 项，未通过 ' + (facts.failed_count || 0) + ' 项。',
    NL + '【未通过项（最多列出 ' + FAILED_ITEMS_MAX + ' 条：id｜分项名｜得分/满分｜判据与证据）】' + NL + (failedLines || '（无未通过项）'),
    NL + '请直接输出总评正文（不要 JSON、不要标题、不要列表符号）。',
  ].join(NL);
  return { system, user, rubric: rb, facts, listed_failed: listed.length, truncated_failed: failed.length > listed.length };
}

/** 读-改-写：把 summary 合进既有 ai_feedback（保留既有键；仅在 force 时覆盖已有 summary） */
export function mergeSummary(currentRaw, summary) {
  let doc = null;
  const raw = currentRaw === null || currentRaw === undefined ? '' : String(currentRaw);
  if (raw.trim().startsWith('{')) { try { doc = JSON.parse(raw); } catch { doc = null; } }
  const base = doc && typeof doc === 'object' ? { ...doc } : { source: 'dsh-checker' };
  base.summary = summary;
  return { text: JSON.stringify(base), doc: base };
}

/**
 * ★O1（R2-B45）：未登记价目的型号 ⇒ `computeCost` 返回 `ok:false / cost_total:null`，
 * 旧实现把它当 0 ⇒ 逐份 cost=0.000000 ⇒ **`--max-cost` 静默失效**（C 实测 `--model deepseek-reasoner`）。
 * 修法（选项 a）：未知型号按价目表内**最高的 peak 档**作保守上限估算，并要求调用方打印 `PRICE_FALLBACK` 警示
 * ⇒ 成本护栏在未知型号下**仍然可信**（宁可高估、不可静默放过）。
 */
export function conservativeUpperBoundPrice(table = null) {
  const t = resolvePriceTable(table);
  let best = null;
  for (const [key, def] of Object.entries(t.models || {})) {
    const p = def && def.peak ? def.peak : null;
    if (!p) continue;
    const rank = Number(p.cache_hit || 0) + Number(p.cache_miss || 0) + Number(p.output || 0);
    if (!best || rank > best.rank) best = { model_key: key, peak: p, rank };
  }
  if (!best) best = { model_key: '(builtin-max)', peak: { cache_hit: 0.30, cache_miss: 9, output: 27 }, rank: 0 };
  return best;
}

/** 估算单次调用费用（复用平台价目口径；未知型号 ⇒ 保守上限 + fallback 标记） */
export function estimateCostOfUsage(usage, model, at = new Date()) {
  const totals = {
    cache_read_tokens: Number((usage && usage.prompt_cache_hit_tokens) || 0),
    uncached_input_tokens: Number((usage && (usage.prompt_cache_miss_tokens ?? usage.prompt_tokens)) || 0),
    output_tokens: Number((usage && usage.completion_tokens) || 0),
    cache_write_tokens: 0,
  };
  const c = computeCost({ totals, model: model || null, at });
  if (c.ok !== false && c.model_key) {
    return { cost_total: c.cost_total === null || c.cost_total === undefined ? 0 : c.cost_total, currency: c.currency || 'CNY', tier: c.tier || null, ok: true, fallback: false, model_key: c.model_key, reason: null };
  }
  // ★未知型号（未登记价目）⇒ 保守上限（峰值档）估算，并标记 fallback ⇒ 护栏仍可拦住
  const fb = conservativeUpperBoundPrice();
  const cost = (totals.cache_read_tokens * Number(fb.peak.cache_hit || 0)
    + totals.uncached_input_tokens * Number(fb.peak.cache_miss || 0)
    + totals.output_tokens * Number(fb.peak.output || 0)) / 1e6;
  return {
    cost_total: cost, currency: 'CNY', tier: 'fallback_upper_bound(peak)', ok: true,
    fallback: true, fallback_rule: fb.model_key + '.peak', model_key: null,
    reason: c.reason || 'model_not_priced',
  };
}

/** 单次 chat/completions 调用（可注入 fetchImpl；返回 {ok, text, finish_reason, usage, error, status}） */
export async function callChatCompletion({ baseUrl, apiKey, model, system, user, maxTokens, fetchImpl = fetch, timeoutMs = 120000 } = {}) {
  const url = String(baseUrl || '').replace(/\/+$/u, '') + '/v1/chat/completions';
  const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature: 0.3, stream: false };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (apiKey || '') }, body: JSON.stringify(body), signal: ac.signal });
    const textBody = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: 'http_' + res.status + ':' + String(textBody).slice(0, 160) };
    let data = null;
    try { data = JSON.parse(textBody); } catch { return { ok: false, status: res.status, error: 'bad_json_response' }; }
    const choice = (data.choices && data.choices[0]) || {};
    const text = String((choice.message && choice.message.content) || '').trim();
    if (!text) return { ok: false, status: res.status, error: 'empty_content', finish_reason: choice.finish_reason || null, usage: data.usage || null };
    return { ok: true, text, finish_reason: choice.finish_reason || null, usage: data.usage || null, status: res.status };
  } catch (err) {
    return { ok: false, error: 'request_failed:' + String(err && err.message).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

/** 生成一份总评（含截断放大重试 + 失败重试；返回 {ok, text, truncated, usage, tokens, attempts, error}） */
export async function generateSummaryText({ prompt, baseUrl, apiKey, model, maxTokens = DEFAULT_MAX_TOKENS, fetchImpl = fetch, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let attempts = 0;
  let lastError = null;
  for (let attempt = 1; attempt <= SUMMARY_RETRY_MAX + 1; attempt += 1) {
    attempts = attempt;
    const r = await callChatCompletion({ baseUrl, apiKey, model, system: prompt.system, user: prompt.user, maxTokens, fetchImpl });
    if (r.ok) {
      const usage = r.usage || {};
      const truncated = r.finish_reason === 'length';
      if (truncated) {
        // ★推理型模型：reasoning_tokens 可能吃光预算 ⇒ 放大预算重试 1 次
        const bigger = Math.max(Number(maxTokens) + LENGTH_RETRY_EXTRA, Math.round(Number(maxTokens) * 1.6));
        log('SUMMARY_LENGTH_RETRY max_tokens=' + maxTokens + '⇒' + bigger + ' reasoning_tokens=' + (usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens !== undefined
          ? usage.completion_tokens_details.reasoning_tokens : (usage.reasoning_tokens !== undefined ? usage.reasoning_tokens : 'na')));
        const r2 = await callChatCompletion({ baseUrl, apiKey, model, system: prompt.system, user: prompt.user, maxTokens: bigger, fetchImpl });
        attempts = attempt + 1;
        if (r2.ok) {
          const usage2 = r2.usage || {};
          return {
            ok: true, text: r2.text, truncated: r2.finish_reason === 'length', usage: usage2, attempts,
            tokens: pickTokens(usage2), cost: estimateCostOfUsage(usage2, model),
          };
        }
        return { ok: true, text: r.text, truncated: true, usage, attempts, tokens: pickTokens(usage), cost: estimateCostOfUsage(usage, model) };
      }
      return { ok: true, text: r.text, truncated: false, usage, attempts, tokens: pickTokens(usage), cost: estimateCostOfUsage(usage, model) };
    }
    lastError = r.error;
    log('SUMMARY_CALL_FAIL attempt=' + attempt + '/' + (SUMMARY_RETRY_MAX + 1) + ' error=' + r.error);
    if (attempt <= SUMMARY_RETRY_MAX) await sleep(500 * attempt);
  }
  return { ok: false, error: lastError || 'unknown', attempts };
}

export function pickTokens(usage) {
  const u = usage || {};
  const reasoning = (u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens !== undefined)
    ? Number(u.completion_tokens_details.reasoning_tokens)
    : (u.reasoning_tokens !== undefined ? Number(u.reasoning_tokens) : null);
  return {
    prompt: Number(u.prompt_tokens || 0),
    completion: Number(u.completion_tokens || 0),
    reasoning,
    cache_hit: Number(u.prompt_cache_hit_tokens || 0),
    cache_miss: Number(u.prompt_cache_miss_tokens || 0),
  };
}

export default {
  PROMPT_VERSION, buildSummaryPrompt, excerptRubric, extractBreakdownFacts, mergeSummary,
  estimateCostOfUsage, callChatCompletion, generateSummaryText, pickTokens, parseArgs,
};


/** 解析模型配置：CLI 覆盖 > 平台配置（DB → ENV） */
async function resolveModelConfig(args) {
  let platform = { apiKey: null, baseUrl: null, model: null };
  try {
    const cfg = await import('../src/infrastructure/ai/deepseek/config.js');
    platform = { apiKey: await cfg.getApiKey(), baseUrl: await cfg.getBaseUrl(), model: await cfg.getModel() };
  } catch { /* 平台配置不可用 ⇒ 只认 CLI/env */ }
  return {
    apiKey: args.apiKey || process.env.DEEPSEEK_API_KEY || platform.apiKey || '',
    baseUrl: args.baseUrl || process.env.DEEPSEEK_BASE_URL || platform.baseUrl || 'https://api.deepseek.com',
    model: args.model || process.env.DEEPSEEK_MODEL || platform.model || 'deepseek-v4-flash',
  };
}

/** 读待生成的行（提交 + 该题 rubric 快照；--limit/--submission/--assignment 过滤） */
async function loadRows(args) {
  const where = args.submissionId ? { id: Number(args.submissionId) } : { assignmentId: Number(args.assignmentId) };
  const subs = await prisma.submission.findMany({
    where,
    select: { id: true, assignmentId: true, questionId: true, aiScore: true, finalScore: true, status: true, aiFeedback: true },
    orderBy: { id: 'asc' },
    ...(args.limit ? { take: Number(args.limit) } : {}),
  });
  if (subs.length === 0) return [];
  const assignmentIds = [...new Set(subs.map((s) => Number(s.assignmentId)))];
  const questionIds = [...new Set(subs.map((s) => Number(s.questionId)).filter(Number.isFinite))];
  const aqs = await prisma.assignmentQuestion.findMany({ where: { assignmentId: { in: assignmentIds } }, select: { assignmentId: true, questionId: true, rubricSnapshot: true } });
  const qs = questionIds.length ? await prisma.question.findMany({ where: { id: { in: questionIds } }, select: { id: true, scoringRubric: true } }) : [];
  const rubricOf = (assignmentId, questionId) => {
    const hit = aqs.find((x) => Number(x.assignmentId) === Number(assignmentId) && (questionId === null || Number(x.questionId) === Number(questionId)))
      || aqs.find((x) => Number(x.assignmentId) === Number(assignmentId));
    const snap = hit && hit.rubricSnapshot ? (typeof hit.rubricSnapshot === 'string' ? safeJson(hit.rubricSnapshot) : hit.rubricSnapshot) : null;
    if (snap && snap.rubric) return { rubric: String(snap.rubric), from: 'snapshot' };
    const q = qs.find((x) => Number(x.id) === Number(questionId));
    return { rubric: String((q && q.scoringRubric) || ''), from: q ? 'live' : 'none' };
  };
  return subs.map((s) => ({ ...s, ...rubricOf(s.assignmentId, s.questionId) }));
}

function safeJson(text) { try { return JSON.parse(text); } catch { return null; } }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.assignmentId && !args.submissionId)) { console.log(USAGE); process.exit(args.help ? 0 : 1); }
  const cfg = await resolveModelConfig(args);
  // ★O1（R2-B45）：未登记价目的型号 ⇒ 先声明保守上限（否则 computeCost 返回 null ⇒ 旧实现当成 0 ⇒ 护栏静默失效）
  const priceTable = resolvePriceTable(null);
  const modelPriced = !!priceModelKey(cfg.model, priceTable);
  let priceFallback = null;
  if (!modelPriced) {
    const fb = conservativeUpperBoundPrice(priceTable);
    priceFallback = { model: cfg.model, rule: fb.model_key + '.peak', peak: fb.peak };
    console.log('PRICE_FALLBACK model=' + cfg.model + ' rule=' + fb.model_key + '.peak'
      + '（未登记价目 ⇒ 按价目表最高档作**保守上限**估算：cache_hit=' + fb.peak.cache_hit + ' cache_miss=' + fb.peak.cache_miss + ' output=' + fb.peak.output
      + ' 元/百万 token ⇒ 成本护栏仍可信；如需精确价目请在 system_configs.llm_prices 登记该型号）');
  }
  console.log('MODEL=' + cfg.model + ' BASE_URL=' + cfg.baseUrl + ' MODE=' + (args.apply ? 'apply' : 'dry-run')
    + ' MAX_TOKENS=' + args.maxTokens + ' MAX_COST=' + args.maxCost + ' FORCE=' + (args.force ? 'yes' : 'no')
    + (modelPriced ? '' : ' PRICE_FALLBACK=yes'));
  const rows = await loadRows(args);
  console.log('ROWS=' + rows.length);
  const before = rows.map((r) => ({ id: Number(r.id), aiScore: r.aiScore === null || r.aiScore === undefined ? null : Number(r.aiScore), finalScore: r.finalScore === null || r.finalScore === undefined ? null : Number(r.finalScore), status: String(r.status || '') }));
  const summary = { mode: args.apply ? 'apply' : 'dry-run', rows: rows.length, generated: 0, changed: 0, skipped_existing: 0, no_breakdown: 0, failed: 0, truncated: 0, cost_estimated: 0, price_fallback: priceFallback, results: [] };
  let spent = 0;
  for (const row of rows) {
    const doc = row.aiFeedback && String(row.aiFeedback).trim().startsWith('{') ? safeJson(row.aiFeedback) : null;
    const breakdown = doc && Array.isArray(doc.breakdown) ? doc.breakdown : null;
    if (!breakdown || breakdown.length === 0) {
      summary.no_breakdown += 1;
      console.log('ROW sub=' + row.id + ' status=no_breakdown（无分项依据 ⇒ 不生成，避免编造）');
      summary.results.push({ id: Number(row.id), status: 'no_breakdown' });
      continue;
    }
    if (doc.summary && !args.force) {
      summary.skipped_existing += 1;
      console.log('ROW sub=' + row.id + ' status=skipped_existing（已有 summary；--force 才覆盖）');
      summary.results.push({ id: Number(row.id), status: 'skipped_existing' });
      continue;
    }
    const facts = extractBreakdownFacts(breakdown, {
      score: row.aiScore === null || row.aiScore === undefined ? (doc.score_int ?? doc.raw_score ?? null) : Number(row.aiScore),
      maxScore: doc.max_score === null || doc.max_score === undefined ? null : Number(doc.max_score),
    });
    const prompt = buildSummaryPrompt({ rubric: row.rubric, facts });
    const gen = await generateSummaryText({
      prompt, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, maxTokens: args.maxTokens,
      log: (m) => console.log(m),
    });
    if (!gen.ok) {
      summary.failed += 1;
      console.log('ROW sub=' + row.id + ' status=summary_error error=' + gen.error + ' attempts=' + gen.attempts);
      summary.results.push({ id: Number(row.id), status: 'summary_error', error: gen.error, attempts: gen.attempts });
      continue;
    }
    const cost = gen.cost && Number.isFinite(Number(gen.cost.cost_total)) ? Number(gen.cost.cost_total) : 0;
    spent += cost;
    summary.generated += 1;
    if (gen.truncated) summary.truncated += 1;
    const payload = {
      text: gen.text,
      // ★O2（R2-B45）：failed_count = **真实**失分项数（prompt 仍只列 ≤12 条 ⇒ 展示不再少报）
      facts: { passed: facts.passed, total: facts.total, score: facts.score, failed_count: facts.failed_count, failed_items: facts.failed_items },
      model: cfg.model,
      prompt_version: PROMPT_VERSION,
      tokens: gen.tokens,
      generated_at: new Date().toISOString(),
      ...(gen.truncated ? { truncated: true } : {}),
    };
    console.log('ROW sub=' + row.id + ' status=' + (gen.truncated ? 'ok_truncated' : 'ok') + ' ai_score=' + row.aiScore
      + ' items=' + facts.total + ' passed=' + facts.passed + ' failed=' + facts.failed_count
      + ' listed=' + prompt.listed_failed + (prompt.truncated_failed ? '(截断到' + FAILED_ITEMS_MAX + '条)' : '')
      + ' usage={prompt:' + gen.tokens.prompt + ',completion:' + gen.tokens.completion + ',reasoning:' + (gen.tokens.reasoning === null ? 'na' : gen.tokens.reasoning) + '}'
      + ' cost=' + cost.toFixed(6) + ' spent=' + spent.toFixed(6) + (gen.truncated ? ' truncated=yes' : ''));
    if (args.apply) {
      const merged = mergeSummary(row.aiFeedback, payload);
      await prisma.submission.update({ where: { id: Number(row.id) }, data: { aiFeedback: merged.text } });   // ★只改 ai_feedback
      summary.changed += 1;
    }
    summary.results.push({ id: Number(row.id), status: gen.truncated ? 'ok_truncated' : 'ok', cost, tokens: gen.tokens, facts: { passed: facts.passed, total: facts.total, failed: facts.failed_count } });
    if (spent > args.maxCost) {
      console.log('COST_GUARD_STOP spent=' + spent.toFixed(6) + ' > max_cost=' + args.maxCost + '（立即停止）');
      break;
    }
  }
  summary.cost_estimated = Number(spent.toFixed(6));
  const rowsAfter = await loadRows(args);
  const afterById = new Map(rowsAfter.map((r) => [Number(r.id), r]));
  const changed = before.filter((b) => {
    const a = afterById.get(b.id);
    if (!a) return false;
    return Number(a.aiScore ?? -1) !== Number(b.aiScore ?? -1) || Number(a.finalScore ?? -1) !== Number(b.finalScore ?? -1) || String(a.status || '') !== b.status;
  });
  summary.score_unchanged = changed.length === 0;
  console.log('SCORE_UNCHANGED=' + (summary.score_unchanged ? 'yes' : 'no') + ' rows_checked=' + before.length);
  if (args.json) console.log('SUMMARY_JSON=' + JSON.stringify(summary));
  console.log('MODE=' + summary.mode + ' generated=' + summary.generated + ' changed=' + summary.changed
    + ' skipped_existing=' + summary.skipped_existing + ' no_breakdown=' + summary.no_breakdown + ' failed=' + summary.failed
    + ' truncated=' + summary.truncated + ' cost_estimated=' + summary.cost_estimated);
  if (!summary.score_unchanged) process.exit(3);
  if (spent > args.maxCost) process.exit(2);
}

/** 只有直接运行时才执行 main（被测试 import 时不得触发副作用/进程退出） */
const invokedDirectly = (() => {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const self = path.resolve(fileURLToPath(import.meta.url));
  return entry === self;
})();

if (invokedDirectly) main().then(() => prisma.$disconnect()).catch(async (err) => {
  console.error('FAIL ' + (err && err.message));
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
