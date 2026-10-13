/**
 * 管理员「批改记录」只读控制器（R2-B24 / t91）
 *
 * ★只读：本文件不含任何写路径（无 create/update/delete/$executeRaw*）；只 SELECT + 读归档文件。
 * 数据来源：①表 grading_job_runs（worker 路径）②归档目录 <DSH_GRADER_RUNS_ROOT>/<jobId>/（worker）
 *          ③归档目录 <DSH_GRADER_RUNS_ROOT>/build-<assignmentId>-<ts>/（造尺路径，无表行 ⇒ 由目录合成行）。
 * 安全：日志/证据输出前做 sk- 脱敏；归档目录名白名单 + 前缀校验（防目录穿越）。
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { DEFAULT_RUNS_ROOT, RUNS_ROOT_ENV } from '../services/dshRunArchiver.js';
import { EXPORT_MANIFEST_NAME, MATERIALS_ROOT_ENV, resolveMaterialsForAssignment } from '../services/dshMaterialsResolver.js';
import { standardPackSha256 } from '../utils/snapshotHash.js';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const LOG_LINE_LIMIT = 200;
const LOG_LIMIT_MAX = 20000;   // ★R2-B38：单次日志窗口上限（防超大响应；不带窗口参数仍是全量）

/** 归档根目录（可经 env 覆盖，与 worker 同口径） */
export function runsRootDir() {
  const env = process.env[RUNS_ROOT_ENV];
  return env && String(env).trim() ? String(env).trim() : DEFAULT_RUNS_ROOT;
}

/** ★目录名白名单 + 前缀校验（防目录穿越）：只允许单层、纯 [A-Za-z0-9._-]、且 resolve 后仍在根内 */
export function safeArchiveDir(name, { root = null } = {}) {
  const base = root || runsRootDir();
  if (typeof name !== 'string' || !name) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (name === '.' || name === '..') return null;
  const resolved = path.resolve(base, name);
  const rootResolved = path.resolve(base);
  if (resolved !== path.join(rootResolved, name)) return null;
  if (!resolved.startsWith(rootResolved + path.sep)) return null;
  return resolved;
}

/** ★sk- 扫描/脱敏（日志与证据输出前必须过这一层） */
export function maskSecrets(text) {
  if (text === null || text === undefined) return text;
  return String(text).replace(/sk-[A-Za-z0-9_-]{4,}/g, 'sk-****');
}

/** 读归档内的文件（白名单目录 + 固定文件名），带行数截断/行窗口与脱敏（★先脱敏再开窗） */
function readArchiveFile(dirName, fileName, { maxLines = null, offset = null, limit = null, root = null } = {}) {
  const dir = safeArchiveDir(dirName, { root });
  if (!dir) return { ok: false, reason: 'invalid_archive_dir' };
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) return { ok: false, reason: 'invalid_file_name' };
  const file = path.join(dir, fileName);
  if (!file.startsWith(dir + path.sep)) return { ok: false, reason: 'invalid_file_name' };
  if (!fs.existsSync(file)) return { ok: false, reason: 'missing' };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const masked = maskSecrets(raw);   // ★R2-B38：脱敏在开窗之前完成 —— 窗口内绝不出现原文
    const NL = String.fromCharCode(10);
    if (maxLines === null && offset === null && limit === null) return { ok: true, text: masked };
    const lines = masked.split(NL);
    const total = lines.length;
    if (offset !== null || limit !== null) {
      // ★R2-B38：行窗口（offset 从 0 起、limit=行数）——不带窗口参数=全量；窗口用于分页查看大日志
      const from = Math.max(0, Number.isFinite(Number(offset)) ? Number(offset) : 0);
      const to = limit === null ? total : from + Math.max(0, Number(limit));
      return {
        ok: true,
        text: lines.slice(from, Math.max(from, to)).join(NL),
        total_lines: total,
        offset: from,
        limit: limit === null ? null : Number(limit),
        truncated: from > 0 || to < total,
        more: to < total,
      };
    }
    const tail = lines.slice(-maxLines);
    return { ok: true, text: tail.join(NL), truncated: total > maxLines, total_lines: total };
  } catch (err) {
    return { ok: false, reason: 'read_failed:' + String(err && err.message).slice(0, 120) };
  }
}

function readJsonSafe(dirName, fileName) {
  const r = readArchiveFile(dirName, fileName);
  if (!r.ok) return null;
  try { return JSON.parse(r.text); } catch { return null; }
}

function parseTeardown(dirName) {
  const d = readJsonSafe(dirName, 'run-teardown.json');
  if (!d) return null;
  return { ...d, sessions_purged: d.sessions_purged === true, keep_scene: d.keep_scene === true };
}

/** 归档目录枚举：worker（<jobId>，纯数字）与造尺（build-<assignmentId>-<ts>） */
function listArchiveDirs({ root = null } = {}) {
  const base = root || runsRootDir();
  let names = [];
  try { names = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch (err) {
    logger.warn({ err, base }, 'R2-B24：归档根不可读（返回空列表，不 500）');
    return [];
  }
  const out = [];
  for (const n of names.sort()) {
    if (/^\d+$/.test(n)) out.push({ type: 'worker', jobId: Number(n), archive: n });
    else if (/^build-\d+-\d{8}T\d{6}Z$/.test(n)) out.push({ type: 'build', assignmentId: Number(n.split('-')[1]), archive: n });
  }
  return out;
}

function shapeRow(row, { teardown = null, type = 'worker', archive = null, assignmentTitle = null, usage = null } = {}) {
  const ev = teardown || {};
  const u = usageListFields(usage);
  const started = row && row.started_at ? new Date(row.started_at).getTime() : null;
  const finished = row && row.finished_at ? new Date(row.finished_at).getTime() : null;
  return {
    id: type === 'worker' ? 'job-' + row.job_id : 'archive-' + archive,
    type,
    archive: archive || (row ? String(row.job_id) : null),
    job_id: row ? row.job_id : null,
    assignment_id: row ? row.assignment_id : null,
    assignment_title: assignmentTitle,
    checker_id: row && row.checker_id ? maskSecrets(String(row.checker_id)).slice(0, 24) : null,
    status: row ? row.status || null : null,
    measured: row ? Number(row.measured) : (ev.session_files_before === undefined ? null : null),
    unmeasurable: row ? Number(row.unmeasurable) : null,
    skipped: row ? Number(row.skipped) : null,
    written: row ? Number(row.written) : null,
    // ★R2-B37：failed 列可能不存在（差量建表）⇒ 回落 run-teardown.json 的 failed（R2-B31 已写入证据）；都没有则 null（不假 0）
    failed: row && row.failed !== undefined && row.failed !== null ? Number(row.failed || 0)
      : (ev.failed === undefined || ev.failed === null ? null : Number(ev.failed) || 0),
    device_exit: row ? row.device_exit : null,
    elapsed_ms: started !== null && finished !== null ? Math.max(0, finished - started) : null,
    sessions_purged: ev.sessions_purged === undefined ? null : ev.sessions_purged,
    keep_scene: ev.keep_scene === undefined ? null : ev.keep_scene,
    home_policy: ev.home_policy || null,
    source: ev.source || (type === 'build' ? 'build' : 'worker'),
    created_at: row ? row.created_at : null,
    // ★R2-B37：用量列（来自 grading_run_usage；无记录 ⇒ null，不显示假 0）
    cost_total: u.cost_total,
    cost_currency: u.cost_currency,
    cache_hit_rate: u.cache_hit_rate,
    no_model_session: u.no_model_session,
    model_calls: u.model_calls,
    // ★R2-B37：元信息摘要（老师 / 班级数）——班级全量在详情 meta，列表只给计数避免放大
    teacher_name: (teardown && teardown.__teacher_name) || null,
  };
}


// ===================== ★R2-B37（P1）：用量 / 元信息 / 工具调用（只读扩展） =====================
// 数据来源：① grading_run_usage（R2-B36 落库；job_id / run_ref 唯一）② run-teardown.json 的 usage 摘要（旧运行兜底）
// ★R2-B49 口径（监测呈现侧）：**尺子零 LLM；评语（总评）按需生成、单独计量、可关**——
//   评语会话的 tokens/费用由 worker 落在 usage_json.summary_session（R2-B48 数据侧），此处**单独分列**为
//   usage.summary_session 与 usage.cost_split{judge,summary,total}；开关 DSH_SUMMARY_MODE=off|cached|always：
//   off ⇒ 未生成评语（summary_session.state='not_generated'）；cached ⇒ 命中/未命中可辨（state='cached_hit'|'generated'）；
//   always ⇒ 每次生成（state='generated'）。旧运行/未开启 ⇒ 如实返回 not_generated + note，**不报错、不显示假 0**。
// 口径：不可得一律**如实置 null + reason**（不显示假 0）；零 LLM 运行 no_model_session=true（页面显示「本次无模型会话（零 token）」）。

/** 运行 → 用量键：worker = job:<id>；造尺 = build:<assignmentId>:<归档目录名>（与 R2-B36 落库口径一致） */
export function usageKeyFor({ type, jobId = null, assignmentId = null, archive = null } = {}) {
  if (type === 'build') return assignmentId && archive ? 'build:' + assignmentId + ':' + archive : null;
  return jobId ? 'job:' + jobId : null;
}

/** 批量取用量行（1~2 条 SQL；表缺失/查询失败 ⇒ 不 500，返回 tableMissing 供 reason 使用） */
/** ★递归 JSON 安全化：Prisma 原始 SQL 的 BIGINT 会返回 BigInt（res.json 直接抛 TypeError）⇒ 出口统一归一 */
export function toJsonSafe(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

/** ★BIGINT（id/job_id/token 列）经 Prisma 原始查询返回 BigInt ⇒ 必须先归一为 Number，否则 res.json 抛错 */
export function normalizeRawRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
}

export async function loadUsageIndex({ jobIds = [], runRefs = [] } = {}) {
  const index = new Map();
  const info = { table_missing: false, error: null };
  const q = async (sql, params) => prisma.$queryRawUnsafe(sql, ...params);
  try {
    if (jobIds.length) {
      const rows = await q('SELECT * FROM grading_run_usage WHERE job_id IN (' + jobIds.map(() => '?').join(',') + ')', jobIds);
      for (const r of rows || []) { const n = normalizeRawRow(r); index.set('job:' + n.job_id, n); }
    }
    if (runRefs.length) {
      const rows = await q('SELECT * FROM grading_run_usage WHERE run_ref IN (' + runRefs.map(() => '?').join(',') + ')', runRefs);
      for (const r of rows || []) { const n = normalizeRawRow(r); index.set(String(n.run_ref), n); }
    }
  } catch (err) {
    const msg = String((err && err.message) || err);
    info.table_missing = /doesn't exist|Unknown table|1146/i.test(msg);
    info.error = info.table_missing ? 'usage_table_missing' : msg.slice(0, 160);
    logger.warn({ err: info.error }, 'R2-B37：grading_run_usage 读取失败（如实降级，不 500）');
  }
  return { index, info };
}

const parseJsonCol = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : (v === undefined ? null : v); } catch { return null; } };
const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

/** 列表行（形状与详情 usage 一致、但只取列表需要的 4 列） */
export function usageListFields(row) {
  if (!row) return { cost_total: null, cost_currency: null, cache_hit_rate: null, no_model_session: null, model_calls: null, summary_session_cost: null };
  const ssList = shapeSummarySession({ row });
  return {
    // ★R2-B49：列表也带上「评语消耗」一列（null ⇒ 未生成评语，不显示假 0）
    summary_session_cost: ssList.generated ? ssList.cost_total : null,
    cost_total: numOrNull(row.cost_total),
    cost_currency: row.cost_currency || null,
    cache_hit_rate: numOrNull(row.cache_hit_rate),
    no_model_session: Number(row.no_model_session) === 1,
    model_calls: numOrNull(row.model_calls),
  };
}

/** 安全解析（字符串/对象都接受；坏值 ⇒ null） */
function parseMaybeJson(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch { return null; }
}

/**
 * 读归档里的 out/summaries.json（R2-B48 产物）meta —— 仅取**呈现所需**的统计字段。
 * 归档未包含该文件（旧归档/未开启评语）⇒ null（调用方降级为"未生成评语"）。
 */
function readSummariesMeta(archive) {
  if (!archive) return null;
  for (const rel of ['out/summaries.json', 'summaries.json']) {
    const doc = readJsonSafe(archive, rel);
    if (!doc || typeof doc !== 'object' || !doc.summaries) continue;
    const entries = Object.values(doc.summaries).filter((x) => x && typeof x === 'object');
    if (entries.length === 0) continue;
    return {
      mode: doc.mode || null,
      entries: entries.length,
      cache_hits: entries.filter((x) => x.cache_hit === true).length,
      truncated: entries.filter((x) => x.truncated === true).length,
      generated_at: doc.generated_at || null,
    };
  }
  return null;
}

/**
 * ★R2-B49：评语（总评）会话消耗块 —— 判据/评语**分账**呈现，三态可辨（见文件头口径注释）。
 * 数据优先级：usage_json.summary_session（B48 落库）> run-teardown 摘要 > 归档 out/summaries.json 的 meta > 无。
 */
export function shapeSummarySession({ row = null, teardownUsage = null, archive = null, summaryMeta = null } = {}) {
  const uj = row ? parseMaybeJson(row.usage_json) : null;
  const ss = (uj && uj.summary_session) || (teardownUsage && teardownUsage.summary_session) || null;
  const meta = summaryMeta === null ? readSummariesMeta(archive) : summaryMeta;   // 归档 meta 兜底（可注入，便于测试与复用）
  const cacheHit = ss && ss.cache_hit !== undefined && ss.cache_hit !== null
    ? ss.cache_hit === true
    : (meta ? meta.cache_hits > 0 && meta.cache_hits >= meta.entries : null);
  const mode = (ss && ss.mode) || (meta && meta.mode) || null;
  if (!ss && !meta) {
    return {
      generated: false, available: false, state: 'not_generated', note: '未生成评语（开关 off 或旧运行）',
      tokens: null, cost_total: null, model: null, cache_hit: null, mode: null, entries: null, truncated: null,
      generated_at: null, source: null,
    };
  }
  const state = cacheHit === true ? 'cached_hit' : 'generated';
  return {
    generated: true,
    available: true,
    state,
    note: state === 'cached_hit' ? '评语已生成（缓存命中，未新增模型调用）' : '评语已生成（本次会话生成）',
    tokens: (ss && ss.tokens) || null,
    cost_total: numOrNull(ss && ss.cost_total),
    model: (ss && ss.model) || null,
    cache_hit: cacheHit,
    mode,
    entries: meta ? meta.entries : null,
    truncated: meta ? meta.truncated : null,
    generated_at: (ss && ss.recorded_at) || (meta && meta.generated_at) || null,
    source: ss ? 'usage_json' : 'archive_meta',
  };
}

/** ★R2-B49：判据 / 评语 成本分账（任一缺失 ⇒ 该项 null；合计只在两项都可算时给出，避免假 0） */
export function costSplit({ judgeCost = null, summaryCost = null } = {}) {
  // ★负值视作不可得（坏数据不参与分账，避免把审计数字算歪）
  const sanitize = (v) => { const n = numOrNull(v); return n === null || n < 0 ? null : n; };
  const judge = sanitize(judgeCost);
  const summary = sanitize(summaryCost);
  const total = judge === null && summary === null ? null : Number(((judge || 0) + (summary || 0)).toFixed(6));
  return { judge, summary, total, currency: 'CNY' };
}

/** 详情 usage 块（字段齐备：token 四项 + 命中率 + 费用 + 模型调用次数 + 价目版本 + ★评语分账） */
export function shapeUsageBlock({ row = null, teardownUsage = null, archive = null } = {}) {
  const summarySession = shapeSummarySession({ row, teardownUsage, archive });
  if (row) {
    const judgeCost = numOrNull(row.cost_total);
    return {
      available: true,
      source: 'grading_run_usage',
      summary_session: summarySession,
      cost_split: costSplit({ judgeCost, summaryCost: summarySession.cost_total }),
      model: row.model || null,
      model_calls: numOrNull(row.model_calls) || 0,
      uncached_input_tokens: numOrNull(row.uncached_input_tokens) || 0,
      output_tokens: numOrNull(row.output_tokens) || 0,
      cache_read_tokens: numOrNull(row.cache_read_tokens) || 0,
      cache_write_tokens: numOrNull(row.cache_write_tokens) || 0,
      input_tokens: (numOrNull(row.uncached_input_tokens) || 0) + (numOrNull(row.cache_read_tokens) || 0),
      cache_hit_rate: numOrNull(row.cache_hit_rate),
      cost_total: numOrNull(row.cost_total),
      cost_currency: row.cost_currency || null,
      price_version: row.price_version || null,
      price_tier: row.price_tier || null,
      no_model_session: Number(row.no_model_session) === 1,
    };
  }
  if (teardownUsage) {
    // 旧运行（R2-B36 之前）：只有 run-teardown.json 里的摘要 ⇒ 如实标注来源与缺失字段
    return {
      available: true,
      source: 'teardown_json',
      summary_session: summarySession,
      cost_split: costSplit({ judgeCost: numOrNull(teardownUsage.cost_total), summaryCost: summarySession.cost_total }),
      model: null,
      model_calls: numOrNull(teardownUsage.model_calls) || 0,
      uncached_input_tokens: numOrNull(teardownUsage.uncached_input_tokens) || 0,
      output_tokens: numOrNull(teardownUsage.output_tokens) || 0,
      cache_read_tokens: numOrNull(teardownUsage.cache_read_tokens) || 0,
      cache_write_tokens: numOrNull(teardownUsage.cache_write_tokens) || 0,
      input_tokens: (numOrNull(teardownUsage.uncached_input_tokens) || 0) + (numOrNull(teardownUsage.cache_read_tokens) || 0),
      cache_hit_rate: numOrNull(teardownUsage.cache_hit_rate),
      cost_total: numOrNull(teardownUsage.cost_total),
      cost_currency: teardownUsage.cost_currency || null,
      price_version: teardownUsage.price_version || null,
      price_tier: teardownUsage.price_tier || null,
      no_model_session: teardownUsage.no_model_session === true,
    };
  }
  return { available: false, reason: 'no_usage_record', summary_session: summarySession, cost_split: costSplit({ judgeCost: null, summaryCost: summarySession.cost_total }) };
}

/** 详情 tools 块：可取 ⇒ items；不可得（无记录/未采集）⇒ items:null + reason（不伪造） */
export function shapeToolsBlock({ row = null } = {}) {
  if (!row) return { available: false, items: null, reason: 'no_usage_record', source: null };
  const items = parseJsonCol(row.tools_json);
  if (Array.isArray(items)) {
    return {
      available: true,
      items: items.map((t) => ({ name: String(t && t.name || ''), count: numOrNull(t && t.count) || 0, ms: numOrNull(t && t.ms) || 0, errors: numOrNull(t && t.errors) || 0 })),
      reason: null,
      source: 'session_jsonl',
    };
  }
  return { available: false, items: null, reason: 'tools_unavailable', source: (row.usage_json ? 'session_jsonl' : null) };
}

/** 短 sha（前 12 位 hex）+ 原值；非 hex 形态照原样返回前 12 字符 */
export function shortSha(v) {
  if (!v) return null;
  const s = String(v);
  const hex = s.startsWith('sha256:') ? s.slice(7) : s;
  if (hex === 'absent') return 'absent';
  return hex.slice(0, 12);
}

/** 标准工程包展示块（短 sha + 文件名 + 可折叠 manifest 摘要；不提供下载） */
export function shapeStandardPackage({ question = {}, link = {}, exportManifest = null } = {}) {
  const snapshotHash = link.standardHash || null;
  let sha = snapshotHash;
  let source = snapshotHash ? 'publish_snapshot' : 'unknown';
  if (!sha) {
    try { sha = standardPackSha256(question.id); source = sha === 'sha256:absent' ? 'absent' : 'live_dir'; } catch { sha = null; source = 'unknown'; }
  }
  const fileName = (() => {
    const url = question.attachmentUrl ? String(question.attachmentUrl) : '';
    const base = url ? url.split(/[\\/]/).pop() : '';
    return base || (exportManifest && exportManifest.standard && exportManifest.standard.file) || '标准工程包.zip';
  })();
  const manifest = exportManifest
    ? {
      source: 'export_manifest',
      file: exportManifest.standard && exportManifest.standard.file,
      sha256: exportManifest.standard && exportManifest.standard.sha256,
      bytes: exportManifest.standard && exportManifest.standard.bytes,
      entries: Array.isArray(exportManifest.standard && exportManifest.standard.entries) ? exportManifest.standard.entries.length : null,
      rubric_chars: exportManifest.rubric && exportManifest.rubric.chars,
      assignment_doc_chars: exportManifest.assignment_doc && exportManifest.assignment_doc.chars,
      n_submissions: exportManifest.n_submissions,
      generated_at: exportManifest.generated_at || null,
    }
    : {
      source: 'snapshot',
      standard_hash: sha,
      standard_hash_source: source,
      snapshot_origin: link.snapshotOrigin || null,
      captured_at: (() => { const s = parseJsonCol(link.rubricSnapshot); return (s && s.capturedAt) || null; })(),
      rubric_sha256: (() => { const s = parseJsonCol(link.rubricSnapshot); return (s && s.rubricSha256) || null; })(),
      material_chars: link.materialSnapshot ? String(link.materialSnapshot).length : null,
      rubric_chars: (() => { const s = parseJsonCol(link.rubricSnapshot); return s && s.rubric ? String(s.rubric).length : null; })(),
    };
  return {
    sha256: sha || null,
    short_sha256: shortSha(sha),
    file_name: fileName,
    source,
    download: false, // 明确：不提供下载
    manifest,
  };
}

/** 元信息块：老师 / 班级（全部）/ 作业 / 标准工程包 / 题目描述 / 评分标准（快照优先，保证日后改名改标准可还原） */
export async function loadRunMeta({ assignmentId, archive = null } = {}) {
  const meta = {
    assignment: { id: assignmentId === null || assignmentId === undefined ? null : Number(assignmentId), title: null },
    teacher: null,
    classes: [],
    standard_package: null,
    description: null,
    rubric: null,
    questions: [],
    snapshot: { used: false, origin: null },
    warnings: [],
  };
  if (!assignmentId) { meta.warnings.push('assignment_id_missing'); return meta; }
  try {
    const a = await prisma.assignment.findUnique({
      where: { id: Number(assignmentId) },
      select: { id: true, title: true, teacherId: true, startTime: true, endTime: true },
    });
    if (a) {
      meta.assignment.title = a.title;
      try {
        const t = await prisma.user.findUnique({ where: { id: Number(a.teacherId) }, select: { id: true, username: true, realName: true } });
        meta.teacher = t ? { id: t.id, name: safeName(t.realName || t.username || ('user-' + t.id)), username: t.username ? safeName(t.username) : null } : null;
      } catch { meta.warnings.push('teacher_lookup_failed'); }
    } else {
      meta.warnings.push('assignment_not_found');
    }
    // 班级（全部：assignment_classes → classes）
    try {
      const links = await prisma.assignmentClass.findMany({ where: { assignmentId: Number(assignmentId) }, select: { classId: true } });
      const ids = links.map((x) => Number(x.classId)).filter((n) => Number.isFinite(n));
      if (ids.length) {
        const cls = await prisma.class.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, schoolId: true } });
        meta.classes = cls.map((c) => ({ id: c.id, name: c.name || ('class-' + c.id), school_id: c.schoolId ?? null }));
      }
    } catch { meta.warnings.push('classes_lookup_failed'); }
    // 题目 + 发布冻结快照（rubric/material/standard_hash）
    // 导出清单（标准工程包/评分标准/题面 的字节级摘要）：①归档内 ②平台物料根 <materialsRoot>/<assignmentId>/export-manifest.json
    let exportManifest = null;
    if (archive) {
      const exp = readJsonSafe(archive, EXPORT_MANIFEST_NAME);
      if (exp) exportManifest = exp;
    }
    if (!exportManifest) {
      try {
        const root = String(process.env[MATERIALS_ROOT_ENV] || '').trim();
        if (root) {
          const m = resolveMaterialsForAssignment({ materialsRoot: root, assignmentId: Number(assignmentId) });
          const p = m && m.dir ? path.join(String(m.dir), EXPORT_MANIFEST_NAME) : null;
          if (p && fs.existsSync(p)) exportManifest = JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch { /* 物料根不可读 ⇒ 回落快照摘要（不影响元信息主体） */ }
    }
    try {
      const links = await prisma.assignmentQuestion.findMany({
        where: { assignmentId: Number(assignmentId) },
        select: { questionId: true, rubricSnapshot: true, materialSnapshot: true, standardHash: true, snapshotOrigin: true, sortOrder: true },
        orderBy: { questionId: 'asc' },
      });
      const qids = links.map((l) => Number(l.questionId));
      const qs = qids.length ? await prisma.question.findMany({ where: { id: { in: qids } }, select: { id: true, title: true, type: true, material: true, scoringRubric: true, attachmentUrl: true } }) : [];
      const qById = new Map(qs.map((q) => [Number(q.id), q]));
      for (const link of links) {
        const q = qById.get(Number(link.questionId)) || {};
        const snap = parseJsonCol(link.rubricSnapshot);
        const rubricText = (snap && snap.rubric !== undefined && snap.rubric !== null) ? String(snap.rubric) : String(q.scoringRubric || '');
        const materialText = link.materialSnapshot !== null && link.materialSnapshot !== undefined ? String(link.materialSnapshot) : String(q.material || '');
        const std = shapeStandardPackage({ question: q, link, exportManifest });
        meta.questions.push({
          question_id: Number(link.questionId),
          question_title: q.title || null,
          question_type: q.type || null,
          from_snapshot: !!(snap || link.materialSnapshot),
          snapshot_origin: link.snapshotOrigin || null,
          standard_package: std,
          description: { text: materialText, chars: materialText.length, from_snapshot: link.materialSnapshot !== null && link.materialSnapshot !== undefined },
          rubric: { text: rubricText, chars: rubricText.length, from_snapshot: !!(snap && snap.rubric), rubric_sha256: (snap && snap.rubricSha256) || null },
        });
      }
      // 顶层面板取 type=project 的那道（与 r2b20/grading 口径一致）；没有则取第一道
      const primary = meta.questions.find((x) => x.question_type === 'project') || meta.questions[0] || null;
      if (primary) {
        meta.standard_package = primary.standard_package;
        meta.description = primary.description;
        meta.rubric = primary.rubric;
        meta.snapshot = { used: !!primary.from_snapshot, origin: primary.snapshot_origin };
      } else {
        meta.warnings.push('no_question_bound');
      }
    } catch (err) {
      meta.warnings.push('questions_lookup_failed:' + String(err && err.message).slice(0, 80));
    }
  } catch (err) {
    meta.warnings.push('meta_lookup_failed:' + String(err && err.message).slice(0, 80));
  }
  return meta;
}

/** 老师/班级名含邮箱样式时的轻脱敏（保留可读性，去掉域名部分） */
export function safeName(v) {
  const s = String(v || '');
  return s.length > 64 ? s.slice(0, 64) : s;
}

/**
 * ★R2-B37 兼容层：`grading_job_runs.failed` 在**差量建表的库**里可能不存在（prisma diff 漏建列）。
 * 先带 failed 查；报 Unknown column 'failed' 时**回退到无该列**的 SELECT（并如实标注），绝不因缺列让整页退化。
 * @returns {{rows:Array, failed_column:boolean}}
 */
async function selectJobRuns({ whereSql = '', params = [], orderBy = 'created_at', dir = 'DESC', limit = 500, single = false } = {}) {
  const base = ' FROM grading_job_runs' + whereSql + ' ORDER BY ' + orderBy + ' ' + dir + (single ? ' LIMIT 1' : ' LIMIT ' + Number(limit));
  const withFailed = 'SELECT job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, failed, created_at, updated_at';
  const withoutFailed = 'SELECT job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, created_at, updated_at';
  try {
    const rows = await prisma.$queryRawUnsafe(withFailed + base, ...params);
    return { rows: rows || [], failed_column: true };
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (!/Unknown column 'failed'/i.test(msg)) throw err;
    logger.warn({}, 'R2-B37：grading_job_runs.failed 列缺失（差量建表）⇒ 回退无该列 SELECT，failed 取 teardown 证据');
    const rows = await prisma.$queryRawUnsafe(withoutFailed + base, ...params);
    return { rows: rows || [], failed_column: false };
  }
}

const SORTABLE = { created_at: 'created_at', finished_at: 'finished_at', job_id: 'job_id' };

/** GET /api/admin/grading-runs —— 列表（worker 表行 ∪ 造尺归档） */
export const listGradingRuns = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
    const assignmentId = req.query.assignmentId ? Number(req.query.assignmentId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const archiveType = req.query.type ? String(req.query.type) : null;
    const purgeFlag = req.query.sessions_purged ? String(req.query.sessions_purged) : null;
    const order = SORTABLE[String(req.query.order_by || 'created_at')] || 'created_at';
    const dir = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    let rows = [];
    try {
      const where = [];
      const params = [];
      if (assignmentId && Number.isFinite(assignmentId)) { where.push('assignment_id = ?'); params.push(assignmentId); }
      if (status) { where.push('status = ?'); params.push(status); }
      const sel = await selectJobRuns({
        whereSql: where.length ? ' WHERE ' + where.join(' AND ') : '',
        params, orderBy: order, dir, limit: 500,
      });
      rows = (sel.rows || []).map(normalizeRawRow);
    } catch (err) {
      logger.warn({ err }, 'R2-B24：grading_job_runs 读取失败（退化为仅归档视图，不 500）');
      rows = [];
    }
    const archives = listArchiveDirs();
    const byJob = new Map(rows.map((r) => [String(r.job_id), r]));
    // ★R2-B37：批量取用量（worker 按 job_id；造尺按 run_ref）—— 1~2 条 SQL，表缺失/失败如实降级
    const jobIds = rows.map((r) => Number(r.job_id)).filter((n) => Number.isFinite(n));
    const runRefs = archives.filter((a) => a.type === 'build').map((a) => usageKeyFor({ type: 'build', assignmentId: a.assignmentId, archive: a.archive })).filter(Boolean);
    const { index: usageIndex, info: usageInfo } = await loadUsageIndex({ jobIds, runRefs });
    const items = [];
    for (const a of archives) {
      if (a.type === 'worker') {
        const row = byJob.get(String(a.jobId)) || { job_id: a.jobId };
        items.push(shapeRow(row, { teardown: parseTeardown(a.archive), type: 'worker', archive: a.archive, usage: usageIndex.get('job:' + a.jobId) || null }));
        byJob.delete(String(a.jobId));
      } else {
        items.push(shapeRow({ job_id: null, assignment_id: a.assignmentId }, {
          teardown: parseTeardown(a.archive), type: 'build', archive: a.archive,
          usage: usageIndex.get(usageKeyFor({ type: 'build', assignmentId: a.assignmentId, archive: a.archive })) || null,
        }));
      }
    }
    for (const row of byJob.values()) items.push(shapeRow(row, { teardown: null, type: 'worker', archive: String(row.job_id), usage: usageIndex.get('job:' + row.job_id) || null }));
    let list = items;
    if (assignmentId && Number.isFinite(assignmentId)) list = list.filter((x) => Number(x.assignment_id) === assignmentId);
    if (archiveType) list = list.filter((x) => x.type === archiveType);
    if (purgeFlag === 'no') list = list.filter((x) => x.sessions_purged === false);
    if (purgeFlag === 'yes') list = list.filter((x) => x.sessions_purged === true);
    const total = list.length;
    const start = (page - 1) * pageSize;
    res.json({ code: 0, message: 'ok', data: toJsonSafe({
      items: list.slice(start, start + pageSize), total, page, pageSize,
      source: {
        table: 'grading_job_runs',
        archives_root: runsRootDir(),
        usage_table: usageInfo.table_missing ? null : 'grading_run_usage',
        usage_note: usageInfo.table_missing ? 'usage_table_missing（迁移未落地 ⇒ 用量列如实为 null）' : (usageInfo.error || null),
      },
    }) });
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** GET /api/admin/grading-runs/:id —— 详情（含 teardown 全量、逐份摘要、日志尾部） */
export const getGradingRun = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    let type = null; let archive = null; let jobId = null;
    if (/^job-\d+$/.test(id)) { type = 'worker'; jobId = Number(id.slice(4)); archive = String(jobId); }
    else if (/^archive-build-\d+-\d{8}T\d{6}Z$/.test(id)) { type = 'build'; archive = id.slice('archive-'.length); }
    else if (/^\d+$/.test(id)) { type = 'worker'; jobId = Number(id); archive = String(jobId); }
    else return res.status(400).json({ code: 1001, message: 'id 形式非法（应为 job-<n> 或 archive-build-…）', data: null });
    if (!safeArchiveDir(archive)) return res.status(400).json({ code: 1001, message: '归档目录名非法', data: null });
    let row = null; let rowFromDb = false;   // ★R2-B34（O-1）：区分「库里有行」与「仅为渲染用的占位」
    if (type === 'worker') {
      try {
        const sel = await selectJobRuns({ whereSql: ' WHERE job_id = ?', params: [jobId], orderBy: 'job_id', dir: 'DESC', single: true });
        const rs = (sel.rows || []).map(normalizeRawRow);
        if (rs && rs[0]) { row = rs[0]; rowFromDb = true; } else { row = { job_id: jobId }; }   // ★R2-B34（O-1）
      } catch (err) { row = { job_id: jobId }; }
    } else {
      row = { job_id: null, assignment_id: Number(archive.split('-')[1]) };
    }
    // ★R2-B34（O-1）：不存在的运行 ⇒ 404（此前返回 200 占位，误导页面）
    const dirAbs = safeArchiveDir(archive);
    const dirExists = !!(dirAbs && fs.existsSync(dirAbs));
    const hasRow = rowFromDb;   // 仅当库中确有该行才算「存在」；占位行不算（否则不存在 id 会返 200）
    if (!dirExists && !hasRow) {
      return res.status(404).json({ code: 1002, message: '运行记录不存在：归档目录与数据库行都不存在', data: null });
    }
    const teardown = parseTeardown(archive);
    const summary = readJsonSafe(archive, 'evidence-summary.json');
    const stdout = readArchiveFile(archive, 'device.stdout.log', { maxLines: LOG_LINE_LIMIT });
    const stderr = readArchiveFile(archive, 'device.stderr.log', { maxLines: LOG_LINE_LIMIT });
    let title = null;
    try {
      if (row.assignment_id) {
        const a = await prisma.assignment.findUnique({ where: { id: Number(row.assignment_id) }, select: { title: true } }).catch(() => null);
        title = a ? a.title : null;
      }
    } catch { /* 标题可选 */ }
    // ★R2-B37：用量 / 元信息 / 工具调用三块（只读；不可得一律 null + reason，不显示假 0）
    const usageKey = usageKeyFor({ type, jobId: row && row.job_id, assignmentId: row && row.assignment_id, archive });
    const { index: usageIndex, info: usageInfo } = await loadUsageIndex({
      jobIds: usageKey && usageKey.startsWith('job:') ? [Number(usageKey.slice(4))] : [],
      runRefs: usageKey && usageKey.startsWith('build:') ? [usageKey] : [],
    });
    const usageRow = usageKey ? (usageIndex.get(usageKey) || null) : null;
    const teardownUsage = teardown && teardown.usage ? teardown.usage : null;
    const usageBlock = shapeUsageBlock({ row: usageRow, teardownUsage, archive });   // ★R2-B49：带上归档 ⇒ 可读 out/summaries.json 的评语 meta
    const toolsBlock = shapeToolsBlock({ row: usageRow });
    const meta = await loadRunMeta({ assignmentId: row && row.assignment_id, archive });
    const usageReason = usageBlock.available ? null
      : (usageInfo.table_missing ? 'usage_table_missing' : (usageRow ? 'unsupported' : 'no_usage_record'));
    const toolsReason = toolsBlock.available ? null
      : (usageInfo.table_missing ? 'usage_table_missing' : toolsBlock.reason);
    res.json({ code: 0, message: 'ok', data: toJsonSafe({
      run: shapeRow(row, { teardown, type, archive, assignmentTitle: title, usage: usageRow || (teardownUsage ? { cost_total: teardownUsage.cost_total, cost_currency: teardownUsage.cost_currency, cache_hit_rate: teardownUsage.cache_hit_rate, no_model_session: teardownUsage.no_model_session ? 1 : 0, model_calls: teardownUsage.model_calls } : null) }),
      teardown_json: teardown,
      // 三块面板（字段齐备；不可得 ⇒ null + *_info.reason）
      usage: usageBlock.available ? usageBlock : null,
      usage_info: {
        available: usageBlock.available,
        reason: usageReason,
        source: usageBlock.source || null,
        key: usageKey,
        table: usageInfo.table_missing ? null : 'grading_run_usage',
        // ★表缺失时如实标注（若已回落到 run-teardown.json 摘要，也要让页面知道口径变了）
        table_missing: usageInfo.table_missing === true,
        note: usageInfo.table_missing
          ? (usageBlock.available ? 'usage_table_missing（已回落到 run-teardown.json 摘要：无逐次分桶/价目版本可能缺失）' : 'usage_table_missing（迁移未落地 ⇒ 用量不可得）')
          : (usageInfo.error || null),
      },
      meta,
      tools: toolsBlock.available ? toolsBlock.items : null,
      tools_info: { available: toolsBlock.available, reason: toolsReason, source: toolsBlock.source || null, count: toolsBlock.available ? toolsBlock.items.length : null },
      submissions: summary && Array.isArray(summary.submissions) ? summary.submissions : [],
      submission_counts: summary ? {
        n: summary.n, measurable: summary.measurable, unmeasurable: summary.unmeasurable,
        // ★R2-B38（t6）：干扰产物总数 + 按类型计数（旧 summary 无该字段 ⇒ 如实 null，不伪造 0）
        skipped_artifacts: summary.skipped_artifacts === undefined ? null : Number(summary.skipped_artifacts) || 0,
        skipped_kinds: summary.skipped_kinds || null,
      } : null,
      logs: {
        stdout: { present: stdout.ok, tail: stdout.ok ? stdout.text : null, truncated: !!stdout.truncated, missing_reason: stdout.ok ? null : stdout.reason },
        stderr: { present: stderr.ok, tail: stderr.ok ? stderr.text : null, truncated: !!stderr.truncated, missing_reason: stderr.ok ? null : stderr.reason },
      },
      read_only: true,
    }) });
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** GET /api/admin/grading-runs/:id/log?kind=stdout|stderr|run —— text/plain 下载（脱敏） */
export const getGradingRunLog = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const kind = String(req.query.kind || 'stdout');
    const fileMap = { stdout: 'device.stdout.log', stderr: 'device.stderr.log', run: 'run.log' };
    const fileName = fileMap[kind];
    if (!fileName) return res.status(400).json({ code: 1001, message: 'kind 只允许 stdout|stderr|run', data: null });
    let archive = null;
    if (/^job-\d+$/.test(id) || /^\d+$/.test(id)) archive = String(id.replace(/^job-/, ''));
    else if (/^archive-/.test(id)) archive = id.slice('archive-'.length);
    if (!safeArchiveDir(archive)) return res.status(400).json({ code: 1001, message: '归档目录名非法', data: null });
    // ★R2-B38（t6）：行窗口参数校验（非法一律 400，便于前端报错）
    const hasWindow = req.query.limit !== undefined || req.query.offset !== undefined;
    if (req.query.limit !== undefined && !Number.isFinite(Number(req.query.limit))) {
      return res.status(400).json({ code: 1001, message: 'limit 必须是数字（行数）', data: null });
    }
    if (req.query.offset !== undefined && !Number.isFinite(Number(req.query.offset))) {
      return res.status(400).json({ code: 1001, message: 'offset 必须是数字（起始行，0 起）', data: null });
    }
    const wantLimit = req.query.limit === undefined ? null : Math.min(LOG_LIMIT_MAX, Math.max(0, Number(req.query.limit)));
    const wantOffset = req.query.offset === undefined ? null : Math.max(0, Number(req.query.offset));
    const download = String(req.query.download || '') === '1' || String(req.query.download || '').toLowerCase() === 'true';
    const r = readArchiveFile(archive, fileName, hasWindow ? { offset: wantOffset === null ? 0 : wantOffset, limit: wantLimit } : {});
    if (!r.ok) {
      res.type('text/plain; charset=utf-8');
      res.setHeader('X-Log-Missing-Reason', String(r.reason || 'unknown'));
      return res.status(200).send('# 日志缺失\nreason=' + r.reason + '\narchive=' + archive + '\nkind=' + kind + '\n#');
    }
    res.type('text/plain; charset=utf-8');
    const from = r.offset === undefined ? 0 : r.offset;
    const gotLines = String(r.text).split(String.fromCharCode(10)).length;
    res.setHeader('X-Total-Lines', String(r.total_lines === undefined ? gotLines : r.total_lines));
    res.setHeader('X-Log-Range', from + '-' + (from + Math.max(0, gotLines - 1)) + (wantLimit === null ? '/全量' : '/limit=' + wantLimit));
    res.setHeader('X-Log-More', r.more ? 'yes' : 'no');
    res.setHeader('Content-Disposition', (download ? 'attachment' : 'inline') + '; filename="' + archive + '.' + kind + '.log"');
    res.send(r.text);
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录日志读取失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export default { listGradingRuns, getGradingRun, getGradingRunLog };
