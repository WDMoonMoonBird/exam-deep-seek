/**
 * infrastructure/dsh/runs/read-model.js —— 管理员「批改记录」的**只读读模型**（R2-B65：从 controllers/adminGradingRunsController.js 原样拆出）。
 *
 * 分层（★铁律）：本文件属 **infrastructure**，接口层（interface/http/controllers/admin/grading-runs/*）
 *   **不得** import 本模块（check-layers 对静态与动态 import() 都查）——由组合根 infrastructure/bootstrap/compose.js
 *   装配 `dshRuns` 并挂 app.locals，接口层经 ./deps.js 端口取用。
 *
 * ★只读：无任何写路径（无 create/update/delete/$executeRaw*、无 fs 写）——只 SELECT（$queryRawUnsafe）与读归档文件。
 * 口径与拆分前逐字一致：failed 列缺失回退、BigInt 归一（toJsonSafe/normalizeRawRow）、
 *   不可得一律如实 null + reason（不显示假 0）、评语会话单独分账、sk- 脱敏。
 * 注入：prisma 可经 createDshRunsReadModel({ prisma }) 覆盖（默认取 utils/prisma.js 进程内单例）；
 *   日志沿用进程 logger。
 */
import fs from 'node:fs';
import path from 'node:path';
import defaultPrisma from '../../../utils/prisma.js';
import defaultLogger from '../../../utils/logger.js';
import { isAutoBuildChecker } from '../worker/autoBuild.js';
import { listArchiveDirs, maskSecrets, parseTeardown, readArchiveFile, readJsonSafe, runsRootDir, safeArchiveDir } from './archive-fs.js';
import { parseJsonCol, loadRunMeta } from './run-meta.js';

/**
 * ★D2（t7）：自动造尺/存量记录的统一行形状。
 * - run_kind：build（本次造尺）/ reuse（内容命中复用）/ worker（普通批改 job / 历史任务）/ ruler（存量尺子记录）
 * - archive_present：归档目录是否真的存在（旧运行归档会被 keep_days 清理 ⇒ 页面要能提示"无归档"）
 * - checker_label：A1-R2 兜底 —— job.checker_id 仍是 '__AUTO_BUILD__'（对齐失败）时显示「自动造尺（未对齐）」
 * - teacher_name/teacher_id/classes/class_count：列表/详情统一由 attachAssignmentDisplayMeta 补齐（先置 null 占位）
 */
function shapeRow(row, {
  teardown = null, type = 'worker', archive = null, assignmentTitle = null, usage = null,
  runKind = null, archivePresent = null, id = null, source = null,
} = {}) {
  const ev = teardown || {};
  const u = usageListFields(usage);
  const started = row && row.started_at ? new Date(row.started_at).getTime() : null;
  const finished = row && row.finished_at ? new Date(row.finished_at).getTime() : null;
  const rawChecker = row && row.checker_id ? String(row.checker_id) : null;
  const sentinel = isAutoBuildChecker(rawChecker);
  return {
    id: id || (type === 'worker' ? 'job-' + row.job_id : 'archive-' + archive),
    type,
    archive: archive || null,
    archive_present: archivePresent === null ? !!archive : !!archivePresent,
    job_id: row ? row.job_id : null,
    assignment_id: row ? row.assignment_id : null,
    assignment_title: assignmentTitle,
    teacher_id: null,
    teacher_name: null,
    classes: [],
    class_count: null,
    checker_id: sentinel ? null : (rawChecker ? maskSecrets(rawChecker).slice(0, 24) : null),
    checker_id_raw: rawChecker ? maskSecrets(rawChecker).slice(0, 80) : null,
    checker_label: sentinel ? '自动造尺（未对齐）' : null,
    run_kind: runKind || (type === 'build' ? 'build' : (type === 'ruler' ? 'ruler' : 'worker')),
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
    source: source || ev.source || (type === 'build' ? 'build' : (type === 'ruler' ? 'ruler' : 'worker')),
    created_at: row ? row.created_at : null,
    // ★R2-B37：用量列（来自 grading_run_usage；无记录 ⇒ null，不显示假 0）
    cost_total: u.cost_total,
    cost_currency: u.cost_currency,
    cache_hit_rate: u.cache_hit_rate,
    no_model_session: u.no_model_session,
    model_calls: u.model_calls,
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

export async function loadUsageIndex({ jobIds = [], runRefs = [], prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
  const index = new Map();
  const info = { table_missing: false, error: null };
  const q = async (sql, params) => prismaClient.$queryRawUnsafe(sql, ...params);
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
    log.warn({ err: info.error }, 'R2-B37：grading_run_usage 读取失败（如实降级，不 500）');
  }
  return { index, info };
}

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
  // ★R2-B51（T32-O1）：只读**平铺** summaries.json —— readArchiveFile 的**文件名白名单按设计拒绝 '/'**，
  //   嵌套候选 out/summaries.json 永远读不到（恒 inert，且会误导读者以为支持嵌套）；归档布局自 B50 起即平铺
  //   （dshRunArchiver：copy(out/summaries.json → summaries.json)）⇒ 删除无效候选，只保留平铺名。
  for (const rel of ['summaries.json']) {
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

/**
 * ★R2-B37 兼容层：`grading_job_runs.failed` 在**差量建表的库**里可能不存在（prisma diff 漏建列）。
 * 先带 failed 查；报 Unknown column 'failed' 时**回退到无该列**的 SELECT（并如实标注），绝不因缺列让整页退化。
 * @returns {{rows:Array, failed_column:boolean}}
 */
async function selectJobRuns({ whereSql = '', params = [], orderBy = 'created_at', dir = 'DESC', limit = 500, single = false, prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
  const base = ' FROM grading_job_runs' + whereSql + ' ORDER BY ' + orderBy + ' ' + dir + (single ? ' LIMIT 1' : ' LIMIT ' + Number(limit));
  const withFailed = 'SELECT job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, failed, created_at, updated_at';
  const withoutFailed = 'SELECT job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, created_at, updated_at';
  try {
    const rows = await prismaClient.$queryRawUnsafe(withFailed + base, ...params);
    return { rows: rows || [], failed_column: true };
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (!/Unknown column 'failed'/i.test(msg)) throw err;
    log.warn({}, 'R2-B37：grading_job_runs.failed 列缺失（差量建表）⇒ 回退无该列 SELECT，failed 取 teardown 证据');
    const rows = await prismaClient.$queryRawUnsafe(withoutFailed + base, ...params);
    return { rows: rows || [], failed_column: false };
  }
}

const SORTABLE = { created_at: 'created_at', finished_at: 'finished_at', job_id: 'job_id' };

// ===================== ★D2（t7）：自动造尺 / 存量记录（只读聚合，不新增表/迁移） =====================
const LEGACY_JOB_LIMIT = 1000;   // 旧任务索引上限（grading_jobs 最近的 N 行；避免全表扫描放大）
const RULER_RECORD_LIMIT = 200;  // 存量尺子记录上限（按绑定时间倒序）

/**
 * 判据：job → build / reuse / worker（只读；ruler 表缺失 ⇒ 退化为 worker，不报错）
 * - build：本 job 造出的尺子（grading_rulers.source_run_id = job.id），或 checker_id 仍是 '__AUTO_BUILD__' 哨兵；
 * - reuse：job 带 content_key 且同内容尺子已存在但由别的运行造出（零 LLM 复用）；
 * - worker：无内容键的历史/普通批改 job。
 */
function classifyJobKind({ jobId = null, checkerId = null, contentKey = null, rulerByContent = null } = {}) {
  if (isAutoBuildChecker(checkerId)) return 'build';
  if (!contentKey || !rulerByContent) return 'worker';
  const ruler = rulerByContent.get(String(contentKey));
  if (!ruler) return 'worker';
  const src = ruler.source_run_id === null || ruler.source_run_id === undefined ? null : Number(ruler.source_run_id);
  return src !== null && Number.isFinite(src) && src === Number(jobId) ? 'build' : 'reuse';
}

/** 最近的 grading_jobs 索引（id → 行）+ 内容键集合；表缺失/查询失败 ⇒ 空索引（旧任务行不可见，但不 500） */
async function loadRecentJobsIndex({ prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
  try {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, assignment_id, checker_id, status, written_count, skipped_count, content_key, created_at, updated_at '
      + 'FROM grading_jobs ORDER BY created_at DESC LIMIT ' + LEGACY_JOB_LIMIT,
    );
    const byId = new Map();
    const contentKeys = new Set();
    for (const raw of rows || []) {
      const r = normalizeRawRow(raw);
      byId.set(Number(r.id), r);
      if (r.content_key) contentKeys.add(String(r.content_key));
    }
    return { byId, contentKeys };
  } catch (err) {
    log.warn({ err: String((err && err.message) || err).slice(0, 120) }, 'D2：grading_jobs 读取失败（旧任务行不可见，不 500）');
    return { byId: new Map(), contentKeys: new Set() };
  }
}

/** content_key → 尺子行（source_run_id/checker_id），用于 build/reuse 分类；表缺失 ⇒ 空 Map */
async function loadRulerContentIndex({ contentKeys = [], prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
  const out = new Map();
  const keys = [...contentKeys].filter((k) => /^[A-Za-z0-9]{16,80}$/.test(String(k)));
  if (!keys.length) return out;
  try {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT content_key, source_run_id, status, checker_id FROM grading_rulers WHERE content_key IN (' + keys.map(() => '?').join(',') + ')',
      ...keys,
    );
    for (const raw of rows || []) { const r = normalizeRawRow(raw); out.set(String(r.content_key), r); }
  } catch (err) {
    log.warn({ err: String((err && err.message) || err).slice(0, 120) }, 'D2：grading_rulers 读取失败（build/reuse 分类退化为 worker）');
  }
  return out;
}

/**
 * 存量「尺子记录」：ready 尺子 × 作业绑定，且该作业确有以该 checker 写分的提交（written>0）。
 * 用途：实验2 的 80 份若没有 grading_job_runs 行（归档也已清理），管理员页仍能看到"这把尺子写过分"的记录。
 * 只读：只 SELECT；分数一律来自 submissions.ai_score（不写库、不改分）；不含答题全文。
 */
async function loadLegacyRulerRecords({ prisma: prismaClient = defaultPrisma, log = defaultLogger, limit = RULER_RECORD_LIMIT } = {}) {
  try {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT r.id AS ruler_id, r.content_key, r.status, r.checker_id, r.created_at, b.assignment_id, b.question_id, b.bound_at, '
      + '(SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = b.assignment_id AND s.checker_id = r.checker_id AND s.ai_score IS NOT NULL) AS written '
      + 'FROM grading_rulers r JOIN assignment_question_rulers b ON b.ruler_id = r.id '
      + 'WHERE r.status = ? AND r.checker_id IS NOT NULL '
      + 'ORDER BY b.bound_at DESC LIMIT ' + Number(limit),
      'ready',
    );
    return (rows || []).map(normalizeRawRow).filter((r) => r.checker_id && Number(r.written) > 0);
  } catch (err) {
    log.warn({ err: String((err && err.message) || err).slice(0, 120) }, 'D2：存量尺子记录读取失败（不 500）');
    return [];
  }
}

/** 列表行补齐：作业标题 / 老师 / 班级（批量 3~4 条查询；失败降级 null，不 500） */
async function attachAssignmentDisplayMeta({ items = [], prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
  const ids = [...new Set(items.map((x) => Number(x && x.assignment_id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return;
  try {
    const assignments = await prismaClient.assignment.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, teacherId: true } });
    const teacherIds = [...new Set((assignments || []).map((a) => Number(a.teacherId)).filter((n) => Number.isFinite(n)))];
    const teachers = teacherIds.length
      ? await prismaClient.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, username: true, realName: true } })
      : [];
    const links = await prismaClient.assignmentClass.findMany({ where: { assignmentId: { in: ids } }, select: { assignmentId: true, classId: true } });
    const classIds = [...new Set((links || []).map((l) => Number(l.classId)).filter((n) => Number.isFinite(n)))];
    const classes = classIds.length ? await prismaClient.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }) : [];
    const aById = new Map((assignments || []).map((a) => [Number(a.id), a]));
    const tById = new Map((teachers || []).map((t) => [Number(t.id), t]));
    const cById = new Map((classes || []).map((c) => [Number(c.id), c]));
    const classesByAssignment = new Map();
    for (const l of links || []) {
      const aid = Number(l.assignmentId);
      if (!classesByAssignment.has(aid)) classesByAssignment.set(aid, []);
      const c = cById.get(Number(l.classId));
      if (c) classesByAssignment.get(aid).push({ id: c.id, name: c.name || ('class-' + c.id) });
    }
    for (const item of items) {
      const a = aById.get(Number(item.assignment_id));
      if (!a) continue;
      const t = tById.get(Number(a.teacherId));
      item.assignment_title = item.assignment_title || a.title || null;
      item.teacher_id = a.teacherId === null || a.teacherId === undefined ? null : Number(a.teacherId);
      item.teacher_name = t ? (t.realName || t.username || ('user-' + t.id)) : null;
      item.classes = classesByAssignment.get(Number(item.assignment_id)) || [];
      item.class_count = item.classes.length;
    }
  } catch (err) {
    log.warn({ err: String((err && err.message) || err).slice(0, 120) }, 'D2：列表元信息（老师/班级）读取失败（降级 null，不 500）');
  }
}

/**
 * 详情逐份结果兜底：归档里的 evidence-summary.json 不存在（旧运行/归档被清理）时，从 DB 取「该作业 + 该 checker 已写分」的提交。
 * ★只取 id/分数/学生名；**绝不取 answer 字段**（不泄露答题全文），也不改任何分数。
 */
async function loadSubmissionsByChecker({ prisma: prismaClient = defaultPrisma, assignmentId, checkerId, limit = 200 } = {}) {
  if (!assignmentId || !checkerId || isAutoBuildChecker(checkerId)) return null;
  try {
    const rows = await prismaClient.submission.findMany({
      where: { assignmentId: Number(assignmentId), checkerId: String(checkerId), aiScore: { not: null } },
      select: { id: true, aiScore: true, student: { select: { realName: true, username: true } } },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return (rows || []).map((s) => ({
      slug: (s.student && (s.student.realName || s.student.username)) || ('submission-' + s.id),
      score: s.aiScore === null || s.aiScore === undefined ? null : Number(s.aiScore),
      hits: null,
      reason: '存量记录（无逐份产物；分数来自数据库，不含答题全文）',
      student: (s.student && (s.student.realName || s.student.username)) || null,
    }));
  } catch { return null; }
}


/**
 * 读模型工厂：组合根唯一装配点（compose.js ⇒ app.locals.dshRuns）。
 * 返回面暴露接口层需要的三个方法 + 目录守卫（避免 interface 直接依赖 infrastructure 的实现细节）。
 */
export function createDshRunsReadModel({ prisma: prismaClient = defaultPrisma, logger: loggerClient = defaultLogger } = {}) {
  /**
   * GET /api/admin/grading-runs —— 列表（worker 表行 ∪ 造尺归档）。
   * page/pageSize 的**范围裁剪在接口层**（HTTP 契约常量），本方法只负责读与整形；
   * 返回体在出口统一 toJsonSafe（BIGINT ⇒ Number，否则 res.json 直接抛错）。
   */
  async function listRuns({
    page = 1, pageSize = 20, assignmentId = null, status = null,
    archiveType = null, purgeFlag = null, runKind = null, orderBy = 'created_at', orderDir = 'desc',
  } = {}) {
    const order = SORTABLE[String(orderBy || 'created_at')] || 'created_at';
    const dir = String(orderDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    let rows = [];
    try {
      const where = [];
      const params = [];
      if (assignmentId && Number.isFinite(assignmentId)) { where.push('assignment_id = ?'); params.push(assignmentId); }
      if (status) { where.push('status = ?'); params.push(status); }
      const sel = await selectJobRuns({
        whereSql: where.length ? ' WHERE ' + where.join(' AND ') : '',
        params, orderBy: order, dir, limit: 500, prisma: prismaClient, log: loggerClient,
      });
      rows = (sel.rows || []).map(normalizeRawRow);
    } catch (err) {
      loggerClient.warn({ err }, 'R2-B24：grading_job_runs 读取失败（退化为仅归档视图，不 500）');
      rows = [];
    }
    const archives = listArchiveDirs();
    const byJob = new Map(rows.map((r) => [String(r.job_id), r]));
    // ★D2：grading_jobs 索引（旧任务无 grading_job_runs 行/无归档也必须可见）+ 尺子索引（build/reuse 判定）
    const jobsIndex = await loadRecentJobsIndex({ prisma: prismaClient, log: loggerClient });
    const rulerByContent = await loadRulerContentIndex({ contentKeys: jobsIndex.contentKeys, prisma: prismaClient, log: loggerClient });
    const jobById = jobsIndex.byId;
    const archiveWorkerIds = new Set(archives.filter((a) => a.type === 'worker').map((a) => String(a.jobId)));
    const seenJobIds = new Set([...rows.map((r) => String(r.job_id)), ...archiveWorkerIds]);
    // ★R2-B37：批量取用量（worker 按 job_id；造尺按 run_ref）—— 1~2 条 SQL，表缺失/失败如实降级
    const jobIds = [...new Set([...rows.map((r) => Number(r.job_id)), ...jobById.keys()])].filter((n) => Number.isFinite(n));
    const runRefs = archives.filter((a) => a.type === 'build').map((a) => usageKeyFor({ type: 'build', assignmentId: a.assignmentId, archive: a.archive })).filter(Boolean);
    const { index: usageIndex, info: usageInfo } = await loadUsageIndex({ jobIds, runRefs, prisma: prismaClient, log: loggerClient });
    const items = [];
    for (const a of archives) {
      if (a.type === 'worker') {
        const row = byJob.get(String(a.jobId)) || jobById.get(Number(a.jobId)) || { job_id: a.jobId };
        items.push(shapeRow(row, {
          teardown: parseTeardown(a.archive), type: 'worker', archive: a.archive, archivePresent: true,
          runKind: classifyJobKind({ jobId: a.jobId, checkerId: row.checker_id, contentKey: row.content_key, rulerByContent }),
          usage: usageIndex.get('job:' + a.jobId) || null,
        }));
        byJob.delete(String(a.jobId));
      } else {
        items.push(shapeRow({ job_id: null, assignment_id: a.assignmentId }, {
          teardown: parseTeardown(a.archive), type: 'build', archive: a.archive, archivePresent: true,
          usage: usageIndex.get(usageKeyFor({ type: 'build', assignmentId: a.assignmentId, archive: a.archive })) || null,
        }));
      }
    }
    for (const row of byJob.values()) {
      const archive = String(row.job_id);
      items.push(shapeRow(row, {
        teardown: null, type: 'worker', archive, archivePresent: fs.existsSync(path.join(runsRootDir(), archive)),
        runKind: classifyJobKind({ jobId: row.job_id, checkerId: row.checker_id, contentKey: (jobById.get(Number(row.job_id)) || {}).content_key, rulerByContent }),
        usage: usageIndex.get('job:' + row.job_id) || null,
      }));
    }
    // ★D2：旧任务（有 grading_jobs 行，但没有 run 行 / 没有归档）—— 实验2 的 80 份就是这一类的兜底可见性
    let legacyJobs = 0;
    for (const job of jobById.values()) {
      if (seenJobIds.has(String(job.id))) continue;
      if (status && String(job.status || '') !== String(status)) continue;
      items.push(shapeRow({
        job_id: job.id, assignment_id: job.assignment_id, checker_id: job.checker_id, status: job.status,
        written: job.written_count, skipped: job.skipped_count, measured: null, unmeasurable: null, failed: null, device_exit: null,
        started_at: job.created_at, finished_at: job.updated_at, created_at: job.created_at,
      }, {
        teardown: null, type: 'worker', archive: null, archivePresent: false,
        runKind: classifyJobKind({ jobId: job.id, checkerId: job.checker_id, contentKey: job.content_key, rulerByContent }),
        usage: usageIndex.get('job:' + job.id) || null,
      }));
      legacyJobs += 1;
    }
    // ★D2：存量尺子记录（ready 尺子 × 作业绑定，且该 checker 确实写过分）—— 没有 job 行时仍可见
    const jobContentPairs = new Set([...jobById.values()].filter((j) => j.content_key).map((j) => String(j.assignment_id) + ':' + String(j.content_key)));
    let rulerRecords = 0;
    for (const r of await loadLegacyRulerRecords({ prisma: prismaClient, log: loggerClient })) {
      if (jobContentPairs.has(String(r.assignment_id) + ':' + String(r.content_key))) continue; // 已有对应 job 行 ⇒ 不重复
      if (status && String(r.status || '') !== String(status)) continue;
      items.push(shapeRow({
        job_id: null, assignment_id: r.assignment_id, checker_id: r.checker_id, status: r.status,
        written: r.written, measured: null, unmeasurable: null, skipped: null, failed: null, device_exit: null,
        started_at: null, finished_at: null, created_at: r.created_at,
      }, {
        teardown: null, type: 'ruler', id: 'ruler-' + r.assignment_id + '-' + r.ruler_id, archive: null, archivePresent: false,
        runKind: 'ruler', source: 'ruler', usage: null,
      }));
      rulerRecords += 1;
    }
    let list = items;
    if (assignmentId && Number.isFinite(assignmentId)) list = list.filter((x) => Number(x.assignment_id) === assignmentId);
    if (archiveType) list = list.filter((x) => x.type === archiveType);
    if (runKind) list = list.filter((x) => x.run_kind === runKind);
    if (purgeFlag === 'no') list = list.filter((x) => x.sessions_purged === false);
    if (purgeFlag === 'yes') list = list.filter((x) => x.sessions_purged === true);
    const total = list.length;
    const start = (page - 1) * pageSize;
    const pageItems = list.slice(start, start + pageSize);
    await attachAssignmentDisplayMeta({ items: pageItems, prisma: prismaClient, log: loggerClient });
    return toJsonSafe({
      items: pageItems,
      total,
      page,
      pageSize,
      source: {
        table: 'grading_job_runs',
        jobs_table: 'grading_jobs',
        rulers_table: 'grading_rulers',
        archives_root: runsRootDir(),
        legacy_jobs: legacyJobs,
        ruler_records: rulerRecords,
        usage_table: usageInfo.table_missing ? null : 'grading_run_usage',
        usage_note: usageInfo.table_missing ? 'usage_table_missing（迁移未落地 ⇒ 用量列如实为 null）' : (usageInfo.error || null),
      },
    });
  }

  /**
   * GET /api/admin/grading-runs/:id —— 详情（含 teardown 全量、逐份摘要、日志尾部）。
   * @returns {{status:'ok',data:object}|{status:'bad_id'}|{status:'bad_archive'}|{status:'not_found'}}
   *   HTTP 状态码与文案由接口层映射（本模块不碰 res）。
   */
  async function getRunDetail({ id, logLineLimit = 200 } = {}) {
    const rid = String(id || '');
    let type = null; let archive = null; let jobId = null; let rulerId = null; let rulerAssignmentId = null;
    if (/^job-\d+$/.test(rid)) { type = 'worker'; jobId = Number(rid.slice(4)); archive = String(jobId); }
    else if (/^archive-build-\d+-\d{8}T\d{6}Z$/.test(rid)) { type = 'build'; archive = rid.slice('archive-'.length); }
    else if (/^ruler-\d+-\d+$/.test(rid)) {
      // ★D2：存量尺子记录（read-model 合成；无归档，纯只读）
      const m = /^ruler-(\d+)-(\d+)$/.exec(rid);
      type = 'ruler'; rulerAssignmentId = Number(m[1]); rulerId = Number(m[2]);
    }
    else if (/^\d+$/.test(rid)) { type = 'worker'; jobId = Number(rid); archive = String(jobId); }
    else return { status: 'bad_id' };
    if (type !== 'ruler' && !safeArchiveDir(archive)) return { status: 'bad_archive' };
    let row = null; let rowFromDb = false;   // ★R2-B34（O-1）：区分「库里有行」与「仅为渲染用的占位」
    if (type === 'worker') {
      try {
        const sel = await selectJobRuns({ whereSql: ' WHERE job_id = ?', params: [jobId], orderBy: 'job_id', dir: 'DESC', single: true, prisma: prismaClient, log: loggerClient });
        const rs = (sel.rows || []).map(normalizeRawRow);
        if (rs && rs[0]) { row = rs[0]; rowFromDb = true; }
      } catch (err) { row = null; }
      if (!row) {
        // ★D2：没有 grading_job_runs 行的旧任务（实验2 80 份）—— 详情直接从 grading_jobs 读（只读，不改分）
        try {
          const rs = await prismaClient.$queryRawUnsafe(
            'SELECT id AS job_id, assignment_id, checker_id, status, written_count, skipped_count, content_key, created_at, updated_at, last_error '
            + 'FROM grading_jobs WHERE id = ? LIMIT 1', jobId,
          );
          if (rs && rs[0]) {
            row = normalizeRawRow(rs[0]);
            row.started_at = row.created_at; row.finished_at = row.updated_at;
            row.written = row.written_count; row.skipped = row.skipped_count;
            rowFromDb = true;
          }
        } catch { /* grading_jobs 表缺失 ⇒ 保持占位行 */ }
      }
      if (!row) row = { job_id: jobId };
    } else if (type === 'ruler') {
      try {
        const rs = await prismaClient.$queryRawUnsafe(
          'SELECT id AS ruler_id, content_key, status, checker_id, source_run_id, created_at FROM grading_rulers WHERE id = ? LIMIT 1', rulerId,
        );
        if (!rs || !rs[0]) return { status: 'not_found' };
        const r = normalizeRawRow(rs[0]);
        const bind = await prismaClient.$queryRawUnsafe(
          'SELECT assignment_id, question_id FROM assignment_question_rulers WHERE ruler_id = ? AND assignment_id = ? LIMIT 1', rulerId, rulerAssignmentId,
        ).catch(() => []);
        const writtenCount = r.checker_id
          ? await prismaClient.submission.count({ where: { assignmentId: rulerAssignmentId, checkerId: String(r.checker_id), aiScore: { not: null } } }).catch(() => 0)
          : 0;
        row = {
          job_id: null, assignment_id: rulerAssignmentId, checker_id: r.checker_id, status: r.status,
          content_key: r.content_key, written: Number(writtenCount) || 0, created_at: r.created_at,
          binding: (bind && bind[0]) || null,
        };
        rowFromDb = true;
      } catch (err) {
        return { status: 'not_found' };
      }
    } else {
      row = { job_id: null, assignment_id: Number(archive.split('-')[1]) };
    }
    // ★R2-B34（O-1）：不存在的运行 ⇒ 404（此前返回 200 占位，误导页面）
    const dirAbs = safeArchiveDir(archive);
    const dirExists = !!(dirAbs && fs.existsSync(dirAbs));
    const hasRow = rowFromDb;   // 仅当库中确有该行才算「存在」；占位行不算（否则不存在 id 会返 200）
    if (!dirExists && !hasRow) {
      return { status: 'not_found' };
    }
    const teardown = parseTeardown(archive);
    const summary = readJsonSafe(archive, 'evidence-summary.json');
    const stdout = readArchiveFile(archive, 'device.stdout.log', { maxLines: logLineLimit });
    const stderr = readArchiveFile(archive, 'device.stderr.log', { maxLines: logLineLimit });
    let title = null;
    try {
      if (row.assignment_id) {
        const a = await prismaClient.assignment.findUnique({ where: { id: Number(row.assignment_id) }, select: { title: true } }).catch(() => null);
        title = a ? a.title : null;
      }
    } catch { /* 标题可选 */ }
    // ★D2：build/reuse 判定（只读；ruler 表缺失 ⇒ 退化为 worker，不影响页面）
    let runKind = type === 'build' ? 'build' : (type === 'ruler' ? 'ruler' : 'worker');
    if (type === 'worker' && row) {
      let rulerByContent = null;
      if (row.content_key) {
        try {
          const rr = await prismaClient.$queryRawUnsafe('SELECT content_key, source_run_id FROM grading_rulers WHERE content_key = ? LIMIT 1', String(row.content_key));
          if (rr && rr[0]) rulerByContent = new Map([[String(rr[0].content_key), normalizeRawRow(rr[0])]]);
        } catch { /* 分类可选 */ }
      }
      runKind = classifyJobKind({ jobId: row.job_id, checkerId: row.checker_id, contentKey: row.content_key, rulerByContent });
    }
    // ★R2-B37：用量 / 元信息 / 工具调用三块（只读；不可得一律 null + reason，不显示假 0）
    const usageKey = usageKeyFor({ type, jobId: row && row.job_id, assignmentId: row && row.assignment_id, archive });
    const { index: usageIndex, info: usageInfo } = await loadUsageIndex({
      jobIds: usageKey && usageKey.startsWith('job:') ? [Number(usageKey.slice(4))] : [],
      runRefs: usageKey && usageKey.startsWith('build:') ? [usageKey] : [],
      prisma: prismaClient,
      log: loggerClient,
    });
    const usageRow = usageKey ? (usageIndex.get(usageKey) || null) : null;
    const teardownUsage = teardown && teardown.usage ? teardown.usage : null;
    const usageBlock = shapeUsageBlock({ row: usageRow, teardownUsage, archive });   // ★R2-B49：带上归档 ⇒ 可读 out/summaries.json 的评语 meta
    const toolsBlock = shapeToolsBlock({ row: usageRow });
    const meta = await loadRunMeta({ assignmentId: row && row.assignment_id, archive, prisma: prismaClient });
    // ★D2：逐份结果兜底 —— 归档 evidence-summary.json 缺失（旧运行/归档被清理）时从 DB 取「该作业+该 checker 已写分」的提交。
    //   只取 id/分数/学生名，**不取 answer**（不泄露答题全文），也不改任何分数。
    let submissions = summary && Array.isArray(summary.submissions) ? summary.submissions : [];
    let submissionCounts = summary ? {
      n: summary.n, measurable: summary.measurable, unmeasurable: summary.unmeasurable,
      skipped_artifacts: summary.skipped_artifacts === undefined ? null : Number(summary.skipped_artifacts) || 0,
      skipped_kinds: summary.skipped_kinds || null,
    } : null;
    let submissionsSource = summary ? 'archive_evidence_summary' : null;
    if (!submissions.length) {
      const dbSubs = await loadSubmissionsByChecker({ prisma: prismaClient, assignmentId: row && row.assignment_id, checkerId: row && row.checker_id });
      if (dbSubs && dbSubs.length) {
        submissions = dbSubs;
        submissionsSource = 'db_by_checker';
        submissionCounts = {
          n: dbSubs.length,
          measurable: row && row.written !== undefined && row.written !== null ? Number(row.written) : dbSubs.length,
          unmeasurable: null, skipped_artifacts: null, skipped_kinds: null,
        };
      }
    }
    // ★D2：运行行（含 build/reuse 分类、归档是否存在、哨兵兜底文案）+ 老师/班级归属
    const run = shapeRow(row, {
      teardown, type, archive, assignmentTitle: title,
      usage: usageRow || (teardownUsage ? { cost_total: teardownUsage.cost_total, cost_currency: teardownUsage.cost_currency, cache_hit_rate: teardownUsage.cache_hit_rate, no_model_session: teardownUsage.no_model_session ? 1 : 0, model_calls: teardownUsage.model_calls } : null),
      runKind, archivePresent: type === 'ruler' ? false : dirExists, source: type === 'ruler' ? 'ruler' : null,
    });
    run.content_key = row && row.content_key ? String(row.content_key) : null;
    run.last_error = row && row.last_error ? String(row.last_error).slice(0, 300) : null;
    run.notice = type !== 'ruler' && !dirExists ? 'archive_missing（归档已清理或旧运行；逐份结果优先来自数据库，不含答题全文）' : null;
    if (meta) {
      run.teacher_id = meta.teacher ? meta.teacher.id : null;
      run.teacher_name = meta.teacher ? meta.teacher.name : null;
      run.classes = (meta.classes || []).map((c) => ({ id: c.id, name: c.name }));
      run.class_count = run.classes.length;
      run.assignment_title = run.assignment_title || (meta.assignment && meta.assignment.title) || null;
    }
    const usageReason = usageBlock.available ? null
      : (usageInfo.table_missing ? 'usage_table_missing' : (usageRow ? 'unsupported' : 'no_usage_record'));
    const toolsReason = toolsBlock.available ? null
      : (usageInfo.table_missing ? 'usage_table_missing' : toolsBlock.reason);
    return { status: 'ok', data: toJsonSafe({
      run,
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
      submissions,
      submission_counts: submissionCounts,
      submissions_source: submissionsSource,   // archive_evidence_summary | db_by_checker | null

      logs: {
        stdout: { present: stdout.ok, tail: stdout.ok ? stdout.text : null, truncated: !!stdout.truncated, missing_reason: stdout.ok ? null : stdout.reason },
        stderr: { present: stderr.ok, tail: stderr.ok ? stderr.text : null, truncated: !!stderr.truncated, missing_reason: stderr.ok ? null : stderr.reason },
      },
      read_only: true,
    }) };
  }

  /**
   * GET /api/admin/grading-runs/:id/log —— 归档日志只读读取（★先脱敏再开窗，口径与拆分前一致）。
   * 行窗口参数校验在接口层；本方法只负责目录守卫 + 读取。
   */
  function readLog({ archive, fileName, window = null } = {}) {
    if (!safeArchiveDir(archive)) return { ok: false, reason: 'invalid_archive_dir' };
    return readArchiveFile(archive, fileName, window || {});
  }

  return { listRuns, getRunDetail, readLog, safeArchiveDir, runsRootDir, toJsonSafe };
}
