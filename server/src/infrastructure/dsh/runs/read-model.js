/**
 * infrastructure/dsh/runs/read-model.js —— 管理员「批改记录」的**只读读模型入口**（B3 纯搬运拆分：原 781 行）。
 *
 * 分层（★铁律）：本文件属 **infrastructure**，接口层（interface/http/controllers/admin/grading-runs/*）
 *   **不得** import 本模块（check-layers 对静态与动态 import() 都查）——由组合根 infrastructure/bootstrap/compose.js
 *   装配 `dshRuns` 并挂 app.locals，接口层经 ./deps.js 端口取用。
 *
 * B3 拆分边界（行为/字段/契约不变；子模块不反向 import 本文件 ⇒ 无环）：
 *   · ./read-model/list-runs.js     列表聚合（四源合并/过滤/分页/老师班级标题）
 *   · ./read-model/detail-run.js    详情聚合（run/teardown/逐份/用量·元信息·工具/日志）
 *   · ./read-model/legacy-jobs.js   旧任务索引 / 内容键→尺子索引 / 存量尺子记录
 *   · ./read-model/display-meta.js  列表元信息补齐 / 详情逐份 DB 兜底
 *   · ./read-model/job-runs.js      grading_job_runs 只读取数（failed 列缺失回退）
 *   · ./read-model/json-safe.js     JSON 安全化 / 原始行 BIGINT 归一
 *   · 本文件保留：行形状 shapeRow、用量/评语分账（usage*）与读模型工厂/日志读取。
 *
 * ★只读：无任何写路径（无 create/update/delete/$executeRaw*、无 fs 写）——只 SELECT（$queryRawUnsafe）与读归档文件。
 * 口径与拆分前逐字一致：failed 列缺失回退、BigInt 归一（toJsonSafe/normalizeRawRow）、
 *   不可得一律如实 null + reason（不显示假 0）、评语会话单独分账、sk- 脱敏。
 * 注入：prisma 可经 createDshRunsReadModel({ prisma }) 覆盖（默认取 utils/prisma.js 进程内单例）；
 *   日志沿用进程 logger。
 */
import defaultPrisma from '../../../utils/prisma.js';
import defaultLogger from '../../../utils/logger.js';
import { isAutoBuildChecker } from '../worker/autoBuild.js';
import { maskSecrets, readArchiveFile, readJsonSafe, safeArchiveDir, runsRootDir } from './archive-fs.js';
import { parseJsonCol } from './run-meta.js';
import { toJsonSafe, normalizeRawRow } from './read-model/json-safe.js';
import { createListRuns } from './read-model/list-runs.js';
import { createGetRunDetail } from './read-model/detail-run.js';

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
  contentKey = null, rulerId = null, rulerStatus = null, historicalArchiveOnly = false,
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
    // ★D5：内容键 + 尺子（管理员页需要看到 job → 尺子 的对应关系；content_key 非机密）
    content_key: contentKey || (row && row.content_key ? String(row.content_key) : null),
    ruler_id: rulerId === null || rulerId === undefined ? null : Number(rulerId),
    ruler_status: rulerStatus || null,
    // ★D5：只有归档、DB 运行行已被清理的历史目录 ⇒ 页面显示「历史归档」而不是空白行
    historical_archive_only: !!historicalArchiveOnly,
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
 * 读模型工厂：组合根唯一装配点（compose.js ⇒ app.locals.dshRuns）。
 * 返回面与拆分前**逐字一致**：{ listRuns, getRunDetail, readLog, safeArchiveDir, runsRootDir, toJsonSafe }。
 * B3：list/detail 实现下沉到 ./read-model/*.js；共享依赖经闭包注入（子模块不反向 import 入口 ⇒ 无环）。
 */
export function createDshRunsReadModel({ prisma: prismaClient = defaultPrisma, logger: loggerClient = defaultLogger } = {}) {
  const shared = { prisma: prismaClient, logger: loggerClient, usageKeyFor, loadUsageIndex, toJsonSafe, normalizeRawRow, shapeRow };
  const listRuns = createListRuns(shared);
  const getRunDetail = createGetRunDetail({ ...shared, shapeUsageBlock, shapeToolsBlock, normalizeRawRow });

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

export { toJsonSafe, normalizeRawRow };
