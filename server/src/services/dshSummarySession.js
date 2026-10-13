/**
 * dshSummarySession.js —— R2-B48（t29）：**在平台同运行内**用第二会话产出「自然语言总评」。
 *
 * 设计依据：docs/dsh/R2-A26-总评入会话设计.md（只读设计）。要点与边界：
 *   · 产物 = <run-root>/out/summaries.json（schema='summaries/1'，**按 slug 键控**）；★**绝不写进 check.py 的结果文档**
 *     （否则污染 canonical_sha256 / 触发 stale 判定）；
 *   · summary 形状与 gen-ai-summary.mjs 落库结构**同构**（text/facts/model/prompt_version/tokens/generated_at/…）
 *     ⇒ client 侧 parseCheckerFeedback.js 与两个教师页**零改动**（有断言证明）；
 *   · 缓存：grading_summaries(summary_key PK)，summary_key = sha256(content_key + 结果摘要) ⇒ rubric/尺子内容变化 ⇒ content_key 变 ⇒ **自然失效**；
 *   · 开关：DSH_SUMMARY_MODE=off|cached|always（默认 cached）；预算护栏 DSH_SUMMARY_MAX_COST（元，默认 1.0）⇒ 超出即停止生成并告警，**不影响分数**；
 *   · 降级：任何失败（模型/坏 JSON/超预算/表缺失）⇒ **不写 summary 键**，教师页回落旧面板；本模块**永不抛**到调用方（除非显式要求）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import logger from '../utils/logger.js';
import { computeCost } from './dshSessionUsage.js';

export const SUMMARIES_REL = path.join('out', 'summaries.json');
export const SUMMARIES_SCHEMA = 'summaries/1';
export const SUMMARY_PROMPT_VERSION = 'ai-summary/1';
export const SUMMARY_MODES = ['off', 'cached', 'always'];
export const FAILED_ITEMS_MAX = 12;
export const RUBRIC_MAX_CHARS = 1200;

/** 开关（默认 cached：命中缓存跳过、miss 生成） */
export function resolveSummaryMode(env = process.env) {
  const v = String((env && env.DSH_SUMMARY_MODE) || 'cached').trim().toLowerCase();
  return SUMMARY_MODES.includes(v) ? v : 'cached';
}
/** 预算护栏（元）；<=0 视为不限制 */
export function resolveSummaryBudget(env = process.env) {
  const v = Number((env && env.DSH_SUMMARY_MAX_COST));
  return Number.isFinite(v) && v > 0 ? v : 1.0;
}

export function sha256Hex(text) { return 'sha256:' + crypto.createHash('sha256').update(String(text)).digest('hex'); }

/** 内容键：优先发布冻结快照的 standard_hash/rubricSha256；都缺 ⇒ 用 rubric 文本兜底（同内容同键） */
export function contentKeyOf({ standardHash = null, rubricSha256 = null, questionId = null, rubric = '' } = {}) {
  if (standardHash) return sha256Hex('std:' + standardHash + '|q:' + (questionId ?? ''));
  if (rubricSha256) return sha256Hex('rubric:' + rubricSha256 + '|q:' + (questionId ?? ''));
  return sha256Hex('rubric-text:' + String(rubric || '').slice(0, 4000) + '|q:' + (questionId ?? ''));
}

/** 结果摘要：分项 id+判定+得分（与判据文本无关，避免文案微调导致整体 miss）；无 id ⇒ 回落序号 */
export function resultDigestOf(items) {
  const rows = (Array.isArray(items) ? items : []).map((it, i) => {
    const id = String((it && (it.id ?? it.name ?? it.item)) || ('#' + i));
    const st = String((it && it.status) || '');
    const sc = Number((it && (it.score ?? it.maxScore)) || 0);
    const mx = Number((it && (it.maxScore ?? it.max_score)) || 0);
    return id + ':' + st + ':' + sc + '/' + mx;
  }).sort();
  return sha256Hex(rows.join('|'));
}

export function summaryKeyOf(contentKey, resultDigest) { return sha256Hex(String(contentKey) + '|' + String(resultDigest)); }

/** 分项事实（passed/total/failed_count/failed_items），与脚本 extractBreakdownFacts 同口径 */
export function extractSummaryFacts(items, { score = null, maxScore = null } = {}) {
  const rows = (Array.isArray(items) ? items : []).filter((x) => x && typeof x === 'object');
  const isOk = (b) => {
    const st = b.status === undefined || b.status === null ? null : String(b.status).toLowerCase();
    if (st) return ['hit', 'pass', 'ok', 'true', 'met'].includes(st);
    const s = Number(b.score); const m = Number(b.maxScore ?? b.max_score);
    if (Number.isFinite(s) && Number.isFinite(m)) return m > 0 ? s >= m : s >= 0;
    return null;
  };
  const failed = [];
  for (const b of rows) {
    if (isOk(b) === true) continue;
    failed.push({ item: String(b.id ?? b.item ?? b.name ?? ''), title: String(b.title ?? b.item ?? ''), score: Number.isFinite(Number(b.score)) ? Number(b.score) : null, maxScore: Number.isFinite(Number(b.maxScore ?? b.max_score)) ? Number(b.maxScore ?? b.max_score) : null, comment: String(b.comment ?? b.reason ?? '') });
  }
  return { total: rows.length, passed: rows.filter((b) => isOk(b) === true).length, failed_count: failed.length, failed, failed_items: failed.slice(0, FAILED_ITEMS_MAX).map((f) => f.item).filter(Boolean), score, max_score: maxScore };
}

export function excerptRubricText(rubric) {
  const text = String(rubric || '').replace(/\s+$/u, '');
  if (text.length <= RUBRIC_MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, RUBRIC_MAX_CHARS) + '…（评分标准节选，已截断）', truncated: true };
}

/** 与 gen-ai-summary.mjs 同口径的提示词（W65-7 用等价性断言锁死两者不漂移） */
export function buildSummaryPrompt({ rubric = '', facts = {} } = {}) {
  const rb = excerptRubricText(rubric);
  const failed = Array.isArray(facts.failed) ? facts.failed : [];
  const listed = failed.slice(0, FAILED_ITEMS_MAX);
  const NL = String.fromCharCode(10);
  const failedLines = listed.map((f) => '- ' + [f.item || '(未命名)', f.title ? '｜' + f.title : '', '｜' + (f.score === null ? '?' : f.score) + '/' + (f.maxScore === null ? '?' : f.maxScore), f.comment ? '｜' + String(f.comment).slice(0, 300) : ''].join('')).join(NL);
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

/** 组装产物文档（schema=summaries/1，按 slug 键控） */
export function buildSummariesDoc({ assignmentId = null, mode = 'cached', entries = {}, generatedAt = null } = {}) {
  return {
    schema: SUMMARIES_SCHEMA,
    assignment_id: assignmentId === null ? null : Number(assignmentId),
    mode,
    generated_at: generatedAt || new Date().toISOString(),
    note: 'R2-B48：本文件由平台第二会话产出；**不写入 check.py 结果文档**（不污染 canonical_sha256/stale）。',
    summaries: entries,
  };
}

/** 解析（严格形状校验；坏 JSON/错版本 ⇒ ok:false） */
export function parseSummariesDoc(text) {
  let doc = null;
  try { doc = JSON.parse(String(text || '')); } catch { return { ok: false, reason: 'bad_json', doc: null }; }
  if (!doc || typeof doc !== 'object') return { ok: false, reason: 'not_object', doc: null };
  if (doc.schema !== SUMMARIES_SCHEMA) return { ok: false, reason: 'schema_mismatch:' + doc.schema, doc: null };
  const sm = doc.summaries && typeof doc.summaries === 'object' ? doc.summaries : {};
  const entries = {};
  for (const [slug, s] of Object.entries(sm)) {
    if (!s || typeof s !== 'object' || !s.text) continue;                       // 缺正文 ⇒ 丢弃（降级）
    entries[String(slug)] = s;
  }
  return { ok: true, reason: null, doc: { ...doc, summaries: entries } };
}

/** 读 run-root 的产品（不存在/坏文件 ⇒ 空表：调用方据此降级） */
export function loadSummaries(runRoot) {
  const p = path.join(runRoot, SUMMARIES_REL);
  if (!fs.existsSync(p)) return { ok: false, reason: 'summaries_missing', bySlug: new Map(), path: p };
  const parsed = parseSummariesDoc(fs.readFileSync(p, 'utf8'));
  if (!parsed.ok) return { ok: false, reason: parsed.reason, bySlug: new Map(), path: p };
  return { ok: true, reason: null, bySlug: new Map(Object.entries(parsed.doc.summaries)), path: p, doc: parsed.doc };
}

function writeJsonAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export function writeSummaries(runRoot, doc) { const p = path.join(runRoot, SUMMARIES_REL); writeJsonAtomic(p, JSON.stringify(doc, null, 2)); return p; }

/** 缓存读（表缺失/字段坏 ⇒ miss，不抛） */
export async function getCachedSummary(prisma, summaryKey) {
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT summary_key, text, facts, model, prompt_version, tokens, source FROM grading_summaries WHERE summary_key = ? LIMIT 1', summaryKey);
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r) return null;
    return { ...r, facts: typeof r.facts === 'string' ? safeParse(r.facts) : r.facts, tokens: typeof r.tokens === 'string' ? safeParse(r.tokens) : r.tokens };
  } catch { return null; }
}
function safeParse(t) { try { return JSON.parse(t); } catch { return null; } }

/** 缓存写（upsert + hits 计数；表缺失 ⇒ 静默跳过） */
export async function putCachedSummary(prisma, { summaryKey, contentKey, resultDigest, text, facts, model, promptVersion, tokens, source }) {
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_summaries (summary_key, content_key, result_digest, text, facts, model, prompt_version, tokens, source, hits, created_at, updated_at)'
      + ' VALUES (?,?,?,?,?,?,?,?,?,0,NOW(),NOW())'
      + ' ON DUPLICATE KEY UPDATE text=VALUES(text), facts=VALUES(facts), model=VALUES(model), prompt_version=VALUES(prompt_version), tokens=VALUES(tokens), source=VALUES(source), updated_at=NOW()',
      summaryKey, contentKey, resultDigest, String(text || ''), JSON.stringify(facts || null), model || null, promptVersion || null, JSON.stringify(tokens || null), source || null,
    );
    return true;
  } catch (err) { return false; }
}

export async function bumpCachedSummaryHit(prisma, summaryKey) {
  try { await prisma.$executeRawUnsafe('UPDATE grading_summaries SET hits = hits + 1, updated_at = NOW() WHERE summary_key = ?', summaryKey); return true; } catch { return false; }
}

/** 默认模型调用（平台配置：DB → ENV；测试注入 callModel ⇒ 零真实调用） */
export async function defaultCallModel({ system, user, model, maxTokens = 2000, fetchImpl = fetch, timeoutMs = 120000 }) {
  const cfg = await import('../infrastructure/ai/deepseek/config.js');
  const baseUrl = String(await cfg.getBaseUrl()).replace(/\/+$/u, '');
  const apiKey = await cfg.getApiKey();
  const useModel = model || (await cfg.getModel());
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (apiKey || '') },
      body: JSON.stringify({ model: useModel, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature: 0.3, stream: false }),
      signal: ac.signal,
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: 'http_' + res.status };
    const data = safeParse(body) || {};
    const choice = (data.choices && data.choices[0]) || {};
    const text = String((choice.message && choice.message.content) || '').trim();
    if (!text) return { ok: false, error: 'empty_content' };
    const u = data.usage || {};
    return {
      ok: true, text, model: useModel, finish_reason: choice.finish_reason || null,
      tokens: { prompt: Number(u.prompt_tokens || 0), completion: Number(u.completion_tokens || 0), reasoning: Number((u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens) || u.reasoning_tokens || 0), cache_hit: Number(u.prompt_cache_hit_tokens || 0), cache_miss: Number(u.prompt_cache_miss_tokens || 0) },
      usage: u,
    };
  } catch (err) { return { ok: false, error: 'request_failed:' + String(err && err.message).slice(0, 120) }; } finally { clearTimeout(timer); }
}

/** ★R2-B51（F-T32-1）：严格数值归一（null/undefined/'' ⇒ null；非有限数 ⇒ null）
 *  —— 必须先把 null 归一，否则 Number(null)===0 会被当成"显式 0"（这正是 tokens.__session 兜底失效的根因）。 */
export function numOrNullStrict(v) { return v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null); }

/** 预算：单次 usage 折算费用（平台价目口径） */
export function costOfTokens(tokens, model, at = new Date()) {
  const hit = Number((tokens && tokens.cache_hit) || 0);
  const miss = Number((tokens && (tokens.cache_miss ?? tokens.prompt)) || 0);
  const out = Number((tokens && tokens.completion) || 0);
  const c = computeCost({ totals: { cache_read_tokens: hit, uncached_input_tokens: miss, output_tokens: out, cache_write_tokens: 0 }, model: model || null, at });
  if (c && c.model_key && Number.isFinite(Number(c.cost_total))) {
    return { cost_total: Number(c.cost_total), model_key: c.model_key, fallback: false };
  }
  // ★未登记价目的型号（如测试假模型/新模型）⇒ 按价目表**最高 peak 档**作保守上限（与 R2-B45 O1 同口径）
  //   ⇒ 预算护栏在未知型号下**仍然可信**（宁可高估，不可静默放过）。
  const cost = (hit * 0.3 + miss * 9 + out * 27) / 1e6;
  return { cost_total: cost, model_key: null, fallback: true };
}

/**
 * 主入口：**装置跑完之后、consumeMeasureResults 之前**调用；永不抛出。
 * 返回 { ok, mode, written, generated, cache_hits, failed, stopped, cost, reason }
 */
export async function runSummarySession({
  prisma, runRoot, assignmentId = null, questionId = null, rubric = null, standardHash = null, rubricSha256 = null,
  mode = null, maxCost = null, callModel = defaultCallModel, env = process.env, log = logger,
} = {}) {
  const useMode = mode || resolveSummaryMode(env);
  const budget = maxCost === null || maxCost === undefined ? resolveSummaryBudget(env) : Number(maxCost);
  const result = { ok: true, mode: useMode, written: 0, generated: 0, cache_hits: 0, failed: 0, stopped: false, cost: 0, reason: null, entries: {}, tokens: { prompt: 0, completion: 0, reasoning: 0 }, model: null };
  if (useMode === 'off') { result.reason = 'mode_off'; return result; }
  try {
    const { listMeasureResults } = await import('./dshCheckerConsumer.js');
    const rows = listMeasureResults(runRoot);
    if (rows.length === 0) { result.reason = 'no_results'; return result; }

    // rubric / 内容键（缺 rubric ⇒ 仍可生成，但内容键退化到 rubric 文本='' ⇒ 稳定）
    let rubricText = rubric;
    let stdHash = standardHash;
    let rubSha = rubricSha256;
    let qid = questionId;
    if ((rubricText === null || rubricText === undefined) && prisma && assignmentId) {
      try {
        const aqs = await prisma.assignmentQuestion.findMany({ where: { assignmentId: Number(assignmentId) }, select: { questionId: true, rubricSnapshot: true, standardHash: true } });
        const hit = aqs.find((x) => qid === null || Number(x.questionId) === Number(qid)) || aqs[0] || null;
        if (hit) {
          qid = hit.questionId ?? qid;
          stdHash = stdHash || hit.standardHash || null;
          const snap = typeof hit.rubricSnapshot === 'string' ? safeParse(hit.rubricSnapshot) : hit.rubricSnapshot;
          rubricText = (snap && snap.rubric) || '';
          rubSha = rubSha || (snap && snap.rubricSha256) || null;
        }
      } catch (err) { log.warn({ err: err && err.message }, 'R2-B48：rubric 快照读取失败（按空 rubric 继续）'); }
    }
    const contentKey = contentKeyOf({ standardHash: stdHash, rubricSha256: rubSha, questionId: qid, rubric: rubricText || '' });

    const entries = {};
    for (const { result: r } of rows) {
      const slug = String((r && r.submission && r.submission.id) || '');
      if (!slug) continue;
      const items = (r && ((r.grading_detail && r.grading_detail.items) || r.items)) || [];
      const score = r && r.totals && r.totals.score !== undefined ? Number(r.totals.score) : null;
      const maxScore = r && r.totals && r.totals.max_score !== undefined ? Number(r.totals.max_score) : null;
      const facts = extractSummaryFacts(items, { score, maxScore });
      const resultDigest = resultDigestOf(items);
      const summaryKey = summaryKeyOf(contentKey, resultDigest);

      if (useMode === 'cached' && prisma) {
        const hit = await getCachedSummary(prisma, summaryKey);
        if (hit && hit.text) {
          await bumpCachedSummaryHit(prisma, summaryKey);
          entries[slug] = { text: hit.text, facts: hit.facts || { passed: facts.passed, total: facts.total, score: facts.score, failed_count: facts.failed_count, failed_items: facts.failed_items }, model: hit.model || null, prompt_version: hit.prompt_version || SUMMARY_PROMPT_VERSION, tokens: hit.tokens || null, generated_at: new Date().toISOString(), source: 'session', session_id: slug, cache_hit: true };
          result.cache_hits += 1;
          continue;
        }
      }
      const prompt = buildSummaryPrompt({ rubric: rubricText || '', facts });
      const gen = await callModel({ system: prompt.system, user: prompt.user, facts, slug, runRoot });
      if (!gen || !gen.ok || !gen.text) { result.failed += 1; continue; }              // ★降级：不写该 slug
      const cost = costOfTokens(gen.tokens, gen.model).cost_total;
      if (budget > 0 && result.cost + cost > budget) {
        result.stopped = true; result.reason = 'budget_exceeded';
        log.warn({ budget, spent: Number((result.cost + cost).toFixed(6)) }, 'R2-B48：总评预算超限 ⇒ 停止生成（不影响分数）');
        break;
      }
      result.cost = Number((result.cost + cost).toFixed(6));
      const entry = { text: gen.text, facts: { passed: facts.passed, total: facts.total, score: facts.score, failed_count: facts.failed_count, failed_items: facts.failed_items }, model: gen.model || null, prompt_version: SUMMARY_PROMPT_VERSION, tokens: gen.tokens || null, generated_at: new Date().toISOString(), source: 'session', session_id: slug, cache_hit: false, ...(gen.truncated ? { truncated: true } : {}) };
      entries[slug] = entry;
      result.generated += 1;
      // 监测用聚合（供 worker 写入 usage_json.summary_session）
      if (entry.tokens) {
        result.tokens.prompt += Number(entry.tokens.prompt || 0);
        result.tokens.completion += Number(entry.tokens.completion || 0);
        result.tokens.reasoning += Number(entry.tokens.reasoning || 0);
      }
      if (!result.model && entry.model) result.model = entry.model;
      if (prisma) await putCachedSummary(prisma, { summaryKey, contentKey, resultDigest, text: entry.text, facts: entry.facts, model: entry.model, promptVersion: entry.prompt_version, tokens: entry.tokens, source: 'session' });
    }
    result.entries = entries;
    // ★R2-B50（F1）：把三态 meta 随 tokens 一并返回（__session 命名空间，由 recordSummaryUsage 拆出并落库）
    //   —— 这样**无需改动调用方（worker）**即可让 usage_json.summary_session 带上 mode/cache_hit/cache_hits/generated。
    result.tokens = { ...(result.tokens || { prompt: 0, completion: 0, reasoning: 0 }), __session: {
      mode: useMode, cache_hit: result.generated === 0 && result.cache_hits > 0, cache_hits: result.cache_hits, generated: result.generated,
    } };
    if (Object.keys(entries).length > 0) {
      const doc = buildSummariesDoc({ assignmentId, mode: useMode, entries });
      writeSummaries(runRoot, doc);
      result.written = Object.keys(entries).length;
    } else {
      result.reason = result.reason || (result.failed > 0 ? 'all_failed' : 'no_entries');
    }
    return result;
  } catch (err) {
    return { ...result, ok: false, reason: 'session_error:' + String(err && err.message).slice(0, 160) };
  }
}

/** 把本会话的用量并入既有 grading_run_usage.usage_json.summary_session（同 run-root 自动计入；表/行缺失 ⇒ 静默跳过） */
/**
 * ★R2-B50（B49-F1）：除 tokens/费用/型号外，**把三态判定所需字段一并落库** ⇒ 批改记录页无需依赖归档 meta 兜底即可精确显示
 *   `{ mode, cache_hit, cache_hits, generated }`。
 *   cache_hit 语义（与 B49 shapeSummarySession 对齐）：**本次运行的评语全部来自缓存**（generated===0 且 cache_hits>0）⇒ true；
 *   有任何一份是本次新生成 ⇒ false（混合情形不宣称"整体命中"，与 B49 的归档 meta 判定一致）。
 */
export async function recordSummaryUsage(prisma, { runRef, tokens, cost, model, mode = null, cacheHits = null, generated = null }) {
  if (!prisma || !runRef) return false;
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT usage_json FROM grading_run_usage WHERE run_ref = ? LIMIT 1', String(runRef));
    const cur = Array.isArray(rows) && rows[0] ? safeParse(rows[0].usage_json) || {} : null;
    if (!cur) return false;
    // 三态字段来源：显式参数优先；否则取 tokens.__session（R2-B50：runSummarySession 随 tokens 附带，
    //   ⇒ 调用方无需改动即可落三态）；tokens 落库前剥离 __session（保持 tokens 形状干净）。
    const meta = (tokens && typeof tokens === 'object' && tokens.__session) ? tokens.__session : null;
    const cleanTokens = (() => {
      if (!tokens || typeof tokens !== 'object') return tokens || null;
      const { __session, ...rest } = tokens;
      return Object.keys(rest).length ? rest : null;
    })();
    // ★R2-B51（F-T32-1）：**必须先把 null/undefined/'' 归一为 null 再判有限性**——
    //   旧写法 Number.isFinite(Number(null)) === Number.isFinite(0) === true ⇒ 默认参数 null 被当成"显式 0"
    //   ⇒ tokens.__session 兜底永不生效（页面把"全部命中缓存"显示成"本次会话生成"、cache_hits 审计恒 0）。
    const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
    const hits = numOrNull(cacheHits) ?? numOrNull(meta ? meta.cache_hits : null);
    const gen = numOrNull(generated) ?? numOrNull(meta ? meta.generated : null);
    const cacheHit = hits === null && gen === null ? null : (gen === 0 && hits > 0);
    cur.summary_session = {
      tokens: cleanTokens,
      mode: (mode || (meta && meta.mode) || null),
      cost_total: Number.isFinite(Number(cost)) ? Number(cost) : null,
      model: model || null,
      cache_hit: cacheHit,
      cache_hits: hits,
      generated: gen,
      recorded_at: new Date().toISOString(),
    };
    await prisma.$executeRawUnsafe('UPDATE grading_run_usage SET usage_json = ? WHERE run_ref = ?', JSON.stringify(cur), String(runRef));
    return true;
  } catch { return false; }
}

export default {
  SUMMARIES_REL, SUMMARIES_SCHEMA, SUMMARY_PROMPT_VERSION, resolveSummaryMode, resolveSummaryBudget,
  contentKeyOf, resultDigestOf, summaryKeyOf, extractSummaryFacts, buildSummaryPrompt, buildSummariesDoc,
  parseSummariesDoc, loadSummaries, writeSummaries, getCachedSummary, putCachedSummary, runSummarySession, recordSummaryUsage,
};
