/**
 * infrastructure/dsh/checker/measure-results.js —— DSH 结果产物的**只读叶子模块**（R2-B65）。
 *
 * 内容（全部为纯读逻辑，逐字来自拆分前的两个模块）：
 *   · normalizeDetailDoc / loadGradingResultIndex —— out/grading-result*、out/results 的「逐项依据」投影；
 *   · SUMMARIES_REL / SUMMARIES_SCHEMA / parseSummariesDoc / loadSummaries —— out/summaries.json（第二会话总评）；
 *   · listMeasureResults —— 量尺产物清单（合并依据 + 总评）。
 *
 * ★存在理由（破环）：原先 dshCheckerConsumer（静态 import loadSummaries）与 dshSummarySession
 *   （动态 import listMeasureResults）互为依赖，构成唯一 SCC（cycle-check rc=1，consumer:15 ↔ summary:241）。
 *   把两侧共用的「读产物」逻辑下沉到本模块后，两侧**同向**依赖本模块 ⇒ SCC 归零。
 * ★纪律：本模块只允许依赖 node 内置（fs/path），**不得** import 任何 dsh / 业务模块，
 *   否则会把环重新引回来（保持叶子地位）。
 * ★只读：绝不写文件、绝不写库、绝不改分数来源。
 */
import fs from 'node:fs';
import path from 'node:path';

export const SUMMARIES_REL = path.join('out', 'summaries.json');
export const SUMMARIES_SCHEMA = 'summaries/1';

/**
 * ★R2-B41：逐项「依据」投影归一 —— 只取 items（+totals 便于对账），其余字段不参与回写。
 * 支持三种形状：①单份 doc `{items:[…]}` ②裸 items 数组 ③`{results|submissions:[{slug,items}]}`（由调用方按 slug 拆分）
 */
export function normalizeDetailDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (Array.isArray(doc)) return { items: doc, totals: null, source_shape: 'items_array' };
  const items = Array.isArray(doc.items) ? doc.items : null;
  if (items) return { items, totals: doc.totals || null, source_shape: 'items_doc' };
  return null;
}

/**
 * ★R2-B41：读装置**带依据**的逐项结果投影（title/status/reason 含「证据: <路径>」），按 slug 建索引。
 * 优先级：`out/grading-result/<slug>.json` > `out/grading-result.json`（单份契约）> `out/results/<slug>*.json`（兼容）。
 * 只读、绝不改分数来源：分数与「是否写分」仍由 listMeasureResults()/decideScoreWrite() 的原来源决定。
 * @returns {{bySlug: Map<string,object>, fallback: object|null, sources: string[]}}
 */
export function loadGradingResultIndex(runRoot) {
  const bySlug = new Map();
  const sources = [];
  let fallback = null;
  const put = (slug, doc, rel) => {
    const norm = normalizeDetailDoc(doc);
    if (!slug || !norm || !norm.items || norm.items.length === 0) return;
    if (bySlug.has(String(slug))) return;                       // 先到先得（顺序=优先级）
    bySlug.set(String(slug), { ...norm, source: rel });
    sources.push(rel + ':' + String(slug));
  };
  // ① 单份文件（优先）
  const perDir = path.join(runRoot, 'out', 'grading-result');
  if (fs.existsSync(perDir)) {
    for (const f of fs.readdirSync(perDir).sort()) {
      if (!f.endsWith('.json')) continue;
      try { put(f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(perDir, f), 'utf8')), 'out/grading-result/' + f); } catch { /* 坏文件跳过，不影响分数路径 */ }
    }
  }
  // ② 单份契约 out/grading-result.json：items 数组 ⇒ 全局兜底；带 slug 的条目数组 ⇒ 按 slug 索引
  const single = path.join(runRoot, 'out', 'grading-result.json');
  if (fs.existsSync(single)) {
    try {
      const doc = JSON.parse(fs.readFileSync(single, 'utf8'));
      const bare = normalizeDetailDoc(doc);
      if (bare) {
        fallback = { ...bare, source: 'out/grading-result.json' };
      } else {
        const arr = Array.isArray(doc) ? doc : (doc.results || doc.submissions || []);
        for (const it of arr || []) {
          const slug = it && (it.slug || (it.submission && it.submission.id) || it.submission_id);
          if (slug) put(String(slug), it, 'out/grading-result.json');
        }
      }
    } catch { /* 坏 JSON ⇒ 无依据可用（不崩、不改分数） */ }
  }
  // ③ 兼容旧布局 out/results/<slug>*.json
  const resDir = path.join(runRoot, 'out', 'results');
  if (fs.existsSync(resDir)) {
    for (const f of fs.readdirSync(resDir).sort()) {
      if (!f.endsWith('.json')) continue;
      const slug = f.replace(/\.[a-z0-9_]*\.?model\.json$/, '').replace(/\.json$/, '');
      try { put(slug, JSON.parse(fs.readFileSync(path.join(resDir, f), 'utf8')), 'out/results/' + f); } catch { /* 坏文件跳过 */ }
    }
  }
  return { bySlug, fallback, sources };
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

/** 读量尺产物（out/measure/*.json 优先，兼容 out/results/*.json） */
export function listMeasureResults(runRoot) {
  const out = [];
  const gradingIndex = loadGradingResultIndex(runRoot);   // ★R2-B41：依据投影（只读；不影响分数来源）
  const summaries = loadSummaries(runRoot);               // ★R2-B48：会话内产出的总评（缺失/坏 JSON ⇒ 空表 ⇒ 降级不写 summary）
  for (const dir of ['out/measure', 'out/results']) {
    const d = path.join(runRoot, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).sort()) {
      if (!f.endsWith('.json')) continue;
      if (dir.endsWith('measure') && (f.startsWith('matrix-') || f.startsWith('coverage-'))) continue;
      const p = path.join(d, f);
      try {
        const result = JSON.parse(fs.readFileSync(p, 'utf8'));
        // ★R2-B41：按 slug 挂上**依据**投影（单份契约的 items 数组作为兜底）；找不到 ⇒ null（原行为）
        const slug = result?.submission?.id ?? null;
        const detail = (slug && gradingIndex.bySlug.get(String(slug))) || gradingIndex.fallback || null;
        const summary = (slug && summaries.bySlug.get(String(slug))) || null;             // ★R2-B48：按 slug 取总评
        const merged = { ...result, ...(detail ? { grading_detail: detail } : {}), ...(summary ? { summary } : {}) };
        out.push({ path: p, result: merged });
      } catch { /* 跳过坏文件 */ }
    }
  }
  return out;
}
