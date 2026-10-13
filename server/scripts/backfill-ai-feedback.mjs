#!/usr/bin/env node
/**
 * R2-B41（t14）：确定性回填 submissions.ai_feedback.breakdown 的**分项依据**（title/status/reason 含「证据: <路径>」）。
 *
 * ★铁律：
 *  1) **只 UPDATE ai_feedback 列**，绝不触碰 ai_score / final_score（脚本前后各读一次做「分数零变化」断言）；
 *  2) **默认 dry-run**（只打印 BEFORE/AFTER 与断言，不写库）；写库必须显式 `--apply`；
 *  3) **幂等**：重复执行结果一致（第二遍 `changed=0`）；
 *  4) **禁止对生产执行**：脚本不自带任何生产连接；由运行者显式提供 DATABASE_URL（生产回填由队长授权后执行）。
 *
 * 用法：
 *   node scripts/backfill-ai-feedback.mjs --from /srv/grader/runs/21 [--assignment 123] [--apply] [--limit 5]
 *   node scripts/backfill-ai-feedback.mjs --job 21 [--runs-root /srv/grader/runs] [--apply]
 *   node scripts/backfill-ai-feedback.mjs --from <dir-with-grading-result/> --map <mapping.json> [--apply]
 *   选项：--map <json> 显式 slug→submissionId 映射（{ "<slug>": 123 } 或 { "submissions": {...} }）
 *        --student-key name|username  按学生姓名/账号映射（默认 name=realName；两者都会尝试）
 *        --force-score-mismatch       允许「源总分 ≠ 行 ai_score」的行也回填（默认跳过并报告）
 *        --json                       以 JSON 输出汇总（便于机器判读）
 *
 * 源形状兼容（读码结论 + 云端归档实测形状）：
 *   · <src>/out/grading-result/<slug>.json          ⇒ 每份一份（**优先**）
 *   · <src>/out/grading-result.json                 ⇒ 单份契约（items 数组 / {results|submissions:[…]}）
 *   · <src>/grading-results.json | <src>/out/grading-results.json ⇒ 归档形状（[{submission:{id,student_name},items:[…]}] 或 items 数组）
 *   · <src>/out/results/<slug>*.json                ⇒ 兼容旧布局
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../src/utils/prisma.js';

const NL = String.fromCharCode(10);
const COMMENT_MAX = 300;
const TITLE_MAX = 80;

function parseArgs(argv) {
  const out = { apply: false, limit: 0, json: false, forceScoreMismatch: false, studentKey: 'name' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--json') out.json = true;
    else if (a === '--force-score-mismatch') out.forceScoreMismatch = true;
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--job') out.job = argv[++i];
    else if (a === '--runs-root') out.runsRoot = argv[++i];
    else if (a === '--assignment') out.assignmentId = Number(argv[++i]);
    else if (a === '--map') out.mapFile = argv[++i];
    else if (a === '--student-key') out.studentKey = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]) || 0;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const USAGE = [
  '用法：node scripts/backfill-ai-feedback.mjs --from <dir|file> [--assignment <id>] [--apply] [--limit N]',
  '      node scripts/backfill-ai-feedback.mjs --job <jobId> [--runs-root /srv/grader/runs] [--apply]',
  '默认 dry-run（不写库）；--apply 才写；仅更新 ai_feedback 列。',
].join(NL);

/** 归一单份 doc ⇒ {items, totals}（items 数组 / {items:[…]} 两种形状） */
function normalizeDoc(doc) {
  if (!doc) return null;
  if (Array.isArray(doc)) return { items: doc, totals: null };
  if (Array.isArray(doc.items)) return { items: doc.items, totals: doc.totals || null };
  return null;
}

/** 读源目录/文件 ⇒ [{slug, studentName, items, totals, source}] */
export function loadDetailRows(src) {
  const rows = [];
  const stat = fs.existsSync(src) ? fs.statSync(src) : null;
  if (!stat) return { rows, sources: [], error: 'source_not_found:' + src };
  const sources = [];
  const pushRow = (row) => { if (row && Array.isArray(row.items) && row.items.length) rows.push(row); };

  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const asRow = (doc, slug, studentName, rel) => {
    const norm = normalizeDoc(doc);
    if (!norm) return;
    pushRow({ slug: slug ? String(slug) : null, studentName: studentName || null, items: norm.items, totals: norm.totals, source: rel });
  };

  const roots = [];
  if (stat.isDirectory()) {
    roots.push(src);
    if (fs.existsSync(path.join(src, 'out'))) roots.push(path.join(src, 'out'));
  }

  // ① out/grading-result/<slug>.json（优先）
  for (const root of roots) {
    const dir = path.join(root, 'grading-result');
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.json')) continue;
      const rel = path.relative(src, path.join(dir, f));
      const doc = readJson(path.join(dir, f));
      asRow(doc, f.replace(/\.json$/, ''), (doc && doc.submission && (doc.submission.student_name || doc.submission.studentName)) || null, rel);
      sources.push(rel);
    }
  }
  // ② 归档 / 单份契约 JSON 文件
  const candidates = stat.isFile() ? [src] : [];
  for (const root of roots) {
    for (const name of ['grading-results.json', 'grading-result.json']) {
      const p = path.join(root, name);
      if (fs.existsSync(p)) candidates.push(p);
    }
  }
  for (const p of candidates) {
    const rel = path.relative(src.endsWith(path.sep) ? src : path.dirname(src), p) || path.basename(p);
    const doc = readJson(p);
    if (doc === null) continue;
    const bare = normalizeDoc(doc);
    if (bare) {
      const studentName = (doc && doc.submission && (doc.submission.student_name || doc.submission.studentName)) || null;
      const slug = (doc && (doc.slug || (doc.submission && doc.submission.id))) || null;
      pushRow({ slug: slug ? String(slug) : null, studentName, items: bare.items, totals: bare.totals, source: rel });
      sources.push(rel);
      continue;
    }
    const arr = Array.isArray(doc) ? doc : (doc.results || doc.submissions || doc.items || []);
    for (const entry of arr || []) {
      const inner = normalizeDoc(entry);
      if (!inner) continue;
      const sub = entry.submission || {};
      pushRow({
        slug: entry.slug || sub.id || null,
        studentName: sub.student_name || sub.studentName || entry.student_name || entry.student || null,
        items: inner.items,
        totals: inner.totals || entry.totals || null,
        source: rel,
      });
    }
    sources.push(rel);
  }
  // ③ 兼容 out/results/<slug>*.json
  for (const root of roots) {
    const dir = path.join(root, 'results');
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.json')) continue;
      const slug = f.replace(/\.[a-z0-9_]*\.?model\.json$/, '').replace(/\.json$/, '');
      const rel = path.relative(src, path.join(dir, f));
      asRow(readJson(path.join(dir, f)), slug, null, rel);
      sources.push(rel);
    }
  }
  return { rows, sources: [...new Set(sources)] };
}

/** 由 items 生成 breakdown（与写入侧同口径：title≤80 / comment≤300 / 分数取源） */
export function buildBreakdown(items) {
  return (Array.isArray(items) ? items : []).slice(0, 200).map((it) => ({
    item: String((it && (it.id || it.name)) || '').slice(0, 50),
    title: String((it && it.title) || '').slice(0, TITLE_MAX),
    status: it && it.status !== undefined && it.status !== null ? String(it.status).slice(0, 24) : null,
    score: Number(it && it.score) || 0,
    maxScore: Number(it && (it.max_score ?? it.maxScore)) || 0,
    comment: String((it && (it.comment || it.reason)) || '').slice(0, COMMENT_MAX),
    kind: 'checker',
  }));
}

/** 合并进既有 ai_feedback（保留既有键；只替换 breakdown 并补 detail_source/detail_items） */
export function mergeFeedback(currentRaw, { items, totals, source }) {
  let doc = null;
  const raw = currentRaw === null || currentRaw === undefined ? '' : String(currentRaw);
  if (raw.trim().startsWith('{')) { try { doc = JSON.parse(raw); } catch { doc = null; } }
  const breakdown = buildBreakdown(items);
  const base = doc && typeof doc === 'object' ? { ...doc } : {
    source: 'dsh-checker',
    raw_score: totals && totals.score !== undefined ? Number(totals.score) : null,
    raw_max_score: totals && totals.max_score !== undefined ? Number(totals.max_score) : null,
    score_rounding: 'trunc(ai_score INT 列；原始分见 raw_score)',
  };
  base.source = base.source || 'dsh-checker';
  base.breakdown = breakdown;
  base.detail_source = source || null;
  base.detail_items = breakdown.length;
  base.detail_backfilled_at_rule = 'R2-B41：仅补分项依据（title/status/comment），未改分数';
  return { text: JSON.stringify(base), breakdown, doc: base, previous: doc };
}

function countEmptyComments(feedbackRaw) {
  if (feedbackRaw === null || feedbackRaw === undefined) return null;
  try {
    const doc = JSON.parse(String(feedbackRaw));
    const b = Array.isArray(doc.breakdown) ? doc.breakdown : [];
    return b.filter((x) => !String((x && x.comment) || '').trim()).length;
  } catch { return null; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.from && !args.job)) { console.log(USAGE); process.exit(args.help ? 0 : 1); }
  const runsRoot = args.runsRoot || process.env.DSH_GRADER_RUNS_ROOT || '/srv/grader/runs';
  const src = args.from || path.join(runsRoot, String(args.job));
  const loaded = loadDetailRows(src);
  if (loaded.error) { console.error('FAIL ' + loaded.error); process.exit(2); }
  console.log('SOURCE=' + src);
  console.log('SOURCES=' + (loaded.sources.join(',') || '(none)'));
  console.log('DETAIL_ROWS=' + loaded.rows.length);

  // 显式映射（slug → submissionId）
  let explicitMap = {};
  if (args.mapFile) {
    try {
      const m = JSON.parse(fs.readFileSync(args.mapFile, 'utf8'));
      explicitMap = m && m.submissions ? m.submissions : m;
    } catch (err) { console.error('FAIL map_read:' + (err && err.message)); process.exit(2); }
  }

  // 候选提交行（默认全库；给 --assignment 则限定）
  const subs = await prisma.submission.findMany({
    where: args.assignmentId ? { assignmentId: args.assignmentId } : {},
    select: { id: true, assignmentId: true, studentId: true, aiScore: true, finalScore: true, aiFeedback: true },
  });
  const studentIds = [...new Set(subs.map((s) => Number(s.studentId)))];
  const users = studentIds.length
    ? await prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, realName: true, username: true } })
    : [];
  const userById = new Map(users.map((u) => [Number(u.id), u]));
  const byName = new Map();
  for (const s of subs) {
    const u = userById.get(Number(s.studentId)) || {};
    for (const key of [u.realName, u.username].filter(Boolean)) {
      const k = String(key).trim();
      if (k && !byName.has(k)) byName.set(k, s);
    }
  }
  const bySlug = new Map(Object.entries(explicitMap).map(([k, v]) => [String(k), Number(v)]));
  const subById = new Map(subs.map((s) => [Number(s.id), s]));

  const plan = [];
  for (const row of loaded.rows) {
    let target = null; let via = null;
    if (row.slug && bySlug.has(String(row.slug))) { target = subById.get(bySlug.get(String(row.slug))) || null; via = 'explicit_map'; }
    if (!target && row.studentName && byName.has(String(row.studentName).trim())) { target = byName.get(String(row.studentName).trim()); via = args.studentKey === 'username' ? 'username' : 'student_name'; }
    if (!target && row.slug) { // 兜底：slug 恰好等于提交 id（平台侧手工建的映射）
      const n = Number(String(row.slug).replace(/^s/, ''));
      if (Number.isFinite(n) && subById.has(n)) { target = subById.get(n); via = 'slug_as_id'; }
    }
    if (!target) { plan.push({ row, matched: false, reason: 'unmapped' }); continue; }
    const srcScore = row.totals && row.totals.score !== undefined && row.totals.score !== null ? Number(row.totals.score) : null;
    const scoreMismatch = srcScore !== null && Number(target.aiScore) !== Math.trunc(srcScore);
    if (scoreMismatch && !args.forceScoreMismatch) { plan.push({ row, target, matched: true, skip: 'score_mismatch', via, srcScore }); continue; }
    const merged = mergeFeedback(target.aiFeedback, { items: row.items, totals: row.totals, source: row.source });
    plan.push({ row, target, matched: true, via, srcScore, merged, changed: merged.text !== String(target.aiFeedback || '') });
  }

  // BEFORE 摘要
  let changed = 0; let unmapped = 0; let skipped = 0;
  const applied = [];
  const before = subs.map((s) => ({ id: Number(s.id), aiScore: s.aiScore === null ? null : Number(s.aiScore), finalScore: s.finalScore === null ? null : Number(s.finalScore) }));
  for (const p of plan) {
    if (!p.matched) { unmapped += 1; console.log('UNMAPPED detail_slug=' + (p.row.slug || '-') + ' student=' + (p.row.studentName || '-') + ' items=' + p.row.items.length); continue; }
    if (p.skip) { skipped += 1; console.log('SKIP reason=' + p.skip + ' sub=' + p.target.id + ' student=' + (p.row.studentName || '-') + ' src_score=' + p.srcScore + ' ai_score=' + p.target.aiScore); continue; }
    const t = p.target;
    const items = p.merged.breakdown.length;
    const emptyBefore = countEmptyComments(t.aiFeedback);
    const emptyAfter = p.merged.breakdown.filter((x) => !String(x.comment || '').trim()).length;
    const withTitle = p.merged.breakdown.filter((x) => String(x.title || '').trim()).length;
    const withEvidence = p.merged.breakdown.filter((x) => String(x.comment || '').includes('证据:') || String(x.comment || '').includes('证据：')).length;
    if (p.changed) changed += 1;
    console.log('ROW sub=' + t.id + ' via=' + p.via + ' student=' + (p.row.studentName || '-') + ' ai_score=' + t.aiScore
      + ' items=' + items + ' BEFORE{empty_comment=' + (emptyBefore === null ? 'na' : emptyBefore) + '}'
      + ' AFTER{empty_comment=' + emptyAfter + ' title=' + withTitle + ' evidence=' + withEvidence + '} changed=' + (p.changed ? 'yes' : 'no'));
    if (args.apply && p.changed && (!args.limit || applied.length < args.limit)) {
      await prisma.submission.update({ where: { id: Number(t.id) }, data: { aiFeedback: p.merged.text } });
      applied.push(Number(t.id));
    }
  }

  // ★分数零变化断言（脚本前后各读一次；即使只改 ai_feedback 也必须证明）
  const after = (await prisma.submission.findMany({ where: args.assignmentId ? { assignmentId: args.assignmentId } : {}, select: { id: true, aiScore: true, finalScore: true } }))
    .map((s) => ({ id: Number(s.id), aiScore: s.aiScore === null ? null : Number(s.aiScore), finalScore: s.finalScore === null ? null : Number(s.finalScore) }));
  const scoreChanged = before.filter((b, i) => { const a = after.find((x) => x.id === b.id) || {}; return a.aiScore !== b.aiScore || a.finalScore !== b.finalScore; });

  // ★幂等断言：apply 后再算一遍，应无任何 changed
  let secondPassChanged = null;
  if (args.apply && applied.length) {
    const fresh = await prisma.submission.findMany({ where: { id: { in: applied } }, select: { id: true, aiFeedback: true } });
    const freshById = new Map(fresh.map((s) => [Number(s.id), s.aiFeedback]));
    secondPassChanged = 0;
    for (const p of plan) {
      if (!p.matched || p.skip || !applied.includes(Number(p.target.id))) continue;
      const cur = freshById.get(Number(p.target.id));
      const again = mergeFeedback(cur, { items: p.row.items, totals: p.row.totals, source: p.row.source });
      if (again.text !== String(cur || '')) secondPassChanged += 1;
    }
  }

  const summary = {
    mode: args.apply ? 'apply' : 'dry-run',
    source: src, rows: loaded.rows.length, matched: plan.filter((p) => p.matched && !p.skip).length,
    unmapped, skipped, changed, applied: applied.length,
    score_unchanged: scoreChanged.length === 0, score_changed_rows: scoreChanged.map((x) => x.id),
    idempotent: secondPassChanged === null ? null : secondPassChanged === 0, second_pass_changed: secondPassChanged,
  };
  if (args.json) console.log('SUMMARY_JSON=' + JSON.stringify(summary));
  console.log('SCORE_UNCHANGED=' + (summary.score_unchanged ? 'yes' : 'no') + ' rows_checked=' + before.length);
  if (summary.idempotent !== null) console.log('IDEMPOTENT=' + (summary.idempotent ? 'yes' : 'no') + ' second_pass_changed=' + secondPassChanged);
  console.log('MODE=' + summary.mode + ' changed=' + changed + ' applied=' + applied.length + ' unmapped=' + unmapped + ' skipped=' + skipped);
  if (!summary.score_unchanged) process.exit(3);
}

/** ★只有直接运行时才执行 main（被测试 import 时不得触发副作用/进程退出） */
const invokedDirectly = (() => {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const self = path.resolve(fileURLToPath(import.meta.url));   // ★fileURLToPath：路径含空格/非 ASCII 时必须用它（pathname 是百分号编码）
  return entry === self;
})();

if (invokedDirectly) {
  main().then(() => prisma.$disconnect()).catch(async (err) => {
    console.error('FAIL ' + (err && err.message));
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    process.exit(1);
  });
}
