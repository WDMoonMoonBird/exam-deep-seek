/**
 * dshRulerStore.js —— R2-B35（P0）：内容指纹尺子的**持久化 + 解析（复用/等待/造尺）+ 绑定**。
 *
 * 表（纯增量迁移 20261013090000_r2b35_grading_rulers）：
 *   grading_rulers(content_key CHAR(64) UNIQUE, status building|ready|failed, checker_id, standard_sha256,
 *                  rubric_sha256, description_sha256, model, source_run_id, frozen_sha256, checker_raw LONGBLOB,
 *                  last_error TEXT, created_at, updated_at)
 *   assignment_question_rulers(assignment_id, question_id, ruler_id, bound_at, UNIQUE(assignment_id, question_id))
 *   grading_jobs.content_key CHAR(64) NULL + KEY
 * 老表 grading_checkers / grading_assignment_anchors **不动**（继续作为锚点/兼容层）。
 *
 * 解析时序（resolveRulerForContent）：
 *   ① READY      ⇒ 直接复用（★零 LLM；日志 RULER_REUSE_HIT content_key=… checker_id=…）
 *   ② BUILDING   ⇒ 等待（轮询；★等待者不写库、不造尺）
 *   ③ 无         ⇒ INSERT building 抢占（UNIQUE(content_key) 兜底并发）
 *                   → 老锚点可采纳 ⇒ 直接 ready（RULER_ADOPTED_OLD_ANCHOR，不重复造尺）
 *                   → 否则 buildFn() 造尺一次 ⇒ ready（写 checker_raw/frozen_sha256）
 *   ④ 失败 ⇒ status=failed + last_error 留痕（可重试：reclaimFailedRuler 原子抢占）；等待者超时/失败一律 fail-closed
 *
 * 存储读写走**原始 SQL**（不依赖 Prisma Client 模型生成——本仓库的既有约定，见 dshGradingAnchor.js）。
 */
import crypto from 'crypto';
import { dirSha256 } from '../utils/snapshotHash.js';
import { buildAssignmentDescription } from './dshRulerContentKey.js';

/** 装置口径：按 ignore 复算目录摘要（与 validate.py dir_sha256 同算法） */
export function standardDirDigest(dir, ignore = []) {
  try { return dirSha256(dir, ignore).digest; } catch { return null; }
}

export const RULER_STATUS = { building: 'building', ready: 'ready', failed: 'failed' };

/** 机制标记（测试与排障按行断言；★不得随意改名） */
export const RULER_TAG = {
  reuse: 'RULER_REUSE_HIT',
  adopted: 'RULER_ADOPTED_OLD_ANCHOR',
  built: 'RULER_BUILT',
  buildFailed: 'RULER_BUILD_FAILED',
  wait: 'RULER_WAIT',
  waitTimeout: 'RULER_WAIT_TIMEOUT',
  waitFailed: 'RULER_WAIT_FAILED',
  claim: 'RULER_BUILDING_CLAIMED',
  claimLost: 'RULER_BUILDING_CLAIM_LOST',
  bindConflict: 'RULER_BIND_CONFLICT',
  bindCreated: 'RULER_BOUND',
  unavailable: 'RULER_STORE_UNAVAILABLE',
  retryClaim: 'RULER_RETRY_CLAIMED',
  adoptSkip: 'RULER_ADOPT_SKIP',
};

/**
 * ★O2（R2-B38，in-scope 部分）：失败原因**前缀归一** —— 绝不把已带 `ruler_` 家族前缀的 last_error 再包一层
 * （历史数据/重试链里会出现 `ruler_failed:ruler_failed:…`，让 last_error 与日志难以判读）。
 * ★注意：worker 侧 `'ruler_' + reason`（=> `ruler_ruler_failed:…`）需改 `server/src/infrastructure/dsh/worker/run-once.js`，
 *   该文件**不在本批 inScope** ⇒ 已在 R2-B38 记录 §8 记档并给出单行修法；本函数只保证本层不产生嵌套前缀。
 */
export function composeFailedReason(lastError) {
  const raw = lastError === null || lastError === undefined || lastError === '' ? 'unknown' : String(lastError);
  const stripped = raw.replace(/^ruler_failed:/, '').replace(/^ruler_/, '');
  return 'ruler_failed:' + (stripped || 'unknown');
}

export const RULER_TABLE = 'grading_rulers';
export const BINDING_TABLE = 'assignment_question_rulers';
/** 等待者默认轮询间隔 / 超时（env 可覆盖；测试用参数注入缩短） */
export const RULER_POLL_MS_DEFAULT = 5000;
export const RULER_WAIT_MS_DEFAULT = 3600000;

export function resolvePollMs(env = process.env) {
  const n = Number(env && env.DSH_RULER_POLL_MS);
  return Number.isFinite(n) && n > 0 ? n : RULER_POLL_MS_DEFAULT;
}
export function resolveWaitMs(env = process.env) {
  const n = Number(env && env.DSH_RULER_WAIT_MS);
  return Number.isFinite(n) && n >= 0 ? n : RULER_WAIT_MS_DEFAULT;
}

export function hasRawSql(prisma) {
  return !!(prisma && typeof prisma.$executeRawUnsafe === 'function' && typeof prisma.$queryRawUnsafe === 'function');
}

const toNum = (v) => (v === null || v === undefined ? null : Number(v));
const sha256Of = (buf) => 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');

/** 规范化一行 ruler（原始 SQL 返回；checker_raw 归一为 Buffer|null） */
export function normalizeRulerRow(row) {
  if (!row) return null;
  const raw = row.checker_raw ? Buffer.from(row.checker_raw) : null;
  return {
    id: toNum(row.id),
    contentKey: row.content_key,
    status: row.status,
    checkerId: row.checker_id || null,
    standardSha256: row.standard_sha256 || null,
    rubricSha256: row.rubric_sha256 || null,
    descriptionSha256: row.description_sha256 || null,
    model: row.model || null,
    sourceRunId: toNum(row.source_run_id),
    frozenSha256: row.frozen_sha256 || null,
    checkerRaw: raw,
    checkerRawBytes: raw ? raw.length : 0,
    checkerRawSha256: raw ? sha256Of(raw) : null,
    lastError: row.last_error || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/** 表可用性探针（迁移未落地的库 ⇒ false，调用方回落旧路径，绝不炸） */
export async function rulerStoreAvailable(prisma) {
  if (!hasRawSql(prisma)) return false;
  try {
    await prisma.$queryRawUnsafe('SELECT 1 FROM ' + RULER_TABLE + ' LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

export async function findRulerByContentKey(prisma, contentKey) {
  if (!hasRawSql(prisma)) return null;
  const rows = await prisma.$queryRawUnsafe(
    'SELECT * FROM ' + RULER_TABLE + ' WHERE content_key = ? LIMIT 1', String(contentKey),
  );
  return normalizeRulerRow(rows && rows[0]);
}

export async function findRulerById(prisma, rulerId) {
  if (!hasRawSql(prisma)) return null;
  const rows = await prisma.$queryRawUnsafe('SELECT * FROM ' + RULER_TABLE + ' WHERE id = ? LIMIT 1', Number(rulerId));
  return normalizeRulerRow(rows && rows[0]);
}

/**
 * ★并发去重第一步：抢建 building 行（UNIQUE(content_key) 兜底）。
 * @returns {{won:boolean, ruler:object|null}} won=true ⇒ 本调用者负责造尺；false ⇒ 已有行（按状态复用/等待）
 */
export async function claimBuildingRuler({ prisma, contentKey, meta = {} } = {}) {
  const affected = await prisma.$executeRawUnsafe(
    'INSERT IGNORE INTO ' + RULER_TABLE + ' (content_key, status, standard_sha256, rubric_sha256, description_sha256, model, source_run_id, created_at, updated_at) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))',
    String(contentKey), RULER_STATUS.building,
    meta.standardSha256 || null, meta.rubricSha256 || null, meta.descriptionSha256 || null,
    meta.model || null, meta.sourceRunId === undefined || meta.sourceRunId === null ? null : Number(meta.sourceRunId),
  );
  const ruler = await findRulerByContentKey(prisma, contentKey);
  return { won: Number(affected) === 1, ruler };
}

/** 建造超时（默认 30 分钟）：造尺进程被强杀留下的 building 行不应把同内容永久卡死 */
export const RULER_BUILDING_STALE_MS_DEFAULT = 1800000;
export function resolveBuildingStaleMs(env = process.env) {
  const n = Number(env && env.DSH_RULER_BUILDING_STALE_MS);
  return Number.isFinite(n) && n >= 0 ? n : RULER_BUILDING_STALE_MS_DEFAULT;
}

/**
 * ★陈旧 building 接管（仅造尺入口调用）：原子把「updated_at 早于阈值」的 building 行接管为本次建造。
 * 等待者/消费方**绝不**调用它（等待者只读 ⇒ 不会把别人的建造抢走）。
 */
export async function reclaimStaleBuildingRuler({ prisma, contentKey, staleMs = RULER_BUILDING_STALE_MS_DEFAULT, now = () => Date.now(), log = console } = {}) {
  const cutoff = new Date(now() - Math.max(0, Number(staleMs) || 0));
  const affected = await prisma.$executeRawUnsafe(
    'UPDATE ' + RULER_TABLE + ' SET updated_at = CURRENT_TIMESTAMP(3) WHERE content_key = ? AND status = ? AND updated_at < ?',
    String(contentKey), RULER_STATUS.building, cutoff,
  );
  if (Number(affected) !== 1) return { won: false };
  if (typeof log?.warn === 'function') {
    log.warn('RULER_STALE_BUILDING_RECLAIM content_key=' + contentKey + ' stale_ms=' + staleMs + ' cutoff=' + cutoff.toISOString());
  }
  return { won: true, ruler: await findRulerByContentKey(prisma, contentKey) };
}

/** 失败可重试：原子把 failed ⇒ building（affectedRows=1 才算抢到；同内容只会有一条） */
export async function reclaimFailedRuler({ prisma, contentKey, meta = {} } = {}) {
  const affected = await prisma.$executeRawUnsafe(
    'UPDATE ' + RULER_TABLE + ' SET status = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP(3) '
    + 'WHERE content_key = ? AND status = ?',
    RULER_STATUS.building, String(contentKey), RULER_STATUS.failed,
  );
  if (Number(affected) !== 1) return { won: false, ruler: await findRulerByContentKey(prisma, contentKey) };
  const ruler = await findRulerByContentKey(prisma, contentKey);
  return { won: true, ruler, meta };
}

/** 置 ready（写 checker_id / frozen_sha256 / checker_raw 原始字节；沿用现有锚点机制） */
export async function markRulerReady({ prisma, contentKey, checkerId, frozenSha256 = null, checkerRaw = null, model = null, sourceRunId = null, standardSha256 = null } = {}) {
  const raw = checkerRaw ? Buffer.from(checkerRaw) : null;
  const affected = await prisma.$executeRawUnsafe(
    'UPDATE ' + RULER_TABLE + ' SET status = ?, checker_id = ?, frozen_sha256 = ?, checker_raw = ?, model = COALESCE(?, model), '
    + 'source_run_id = COALESCE(?, source_run_id), standard_sha256 = COALESCE(?, standard_sha256), last_error = NULL, updated_at = CURRENT_TIMESTAMP(3) '
    + 'WHERE content_key = ?',
    RULER_STATUS.ready, checkerId || null, frozenSha256 || null, raw, model || null,
    sourceRunId === undefined || sourceRunId === null ? null : Number(sourceRunId),
    standardSha256 || null, String(contentKey),
  );
  return { ok: Number(affected) === 1, affectedRows: Number(affected), checkerRawBytes: raw ? raw.length : 0 };
}

/** 置 failed + 原因留痕（可重试；等待者据此 fail-closed） */
export async function markRulerFailed({ prisma, contentKey, reason, model = null } = {}) {
  const affected = await prisma.$executeRawUnsafe(
    'UPDATE ' + RULER_TABLE + ' SET status = ?, last_error = ?, model = COALESCE(?, model), updated_at = CURRENT_TIMESTAMP(3) WHERE content_key = ?',
    RULER_STATUS.failed, String(reason || 'unknown').slice(0, 1000), model || null, String(contentKey),
  );
  return { ok: Number(affected) === 1, affectedRows: Number(affected) };
}

/** grading_jobs.content_key 回填（审计 + 复用命中统计；控制器建 job 时也可写） */
export async function setJobContentKey({ prisma, jobId, contentKey } = {}) {
  if (!hasRawSql(prisma) || !jobId) return { ok: false, affectedRows: 0 };
  try {
    const affected = await prisma.$executeRawUnsafe('UPDATE grading_jobs SET content_key = ? WHERE id = ?', String(contentKey), Number(jobId));
    return { ok: Number(affected) === 1, affectedRows: Number(affected) };
  } catch {
    return { ok: false, affectedRows: 0, reason: 'content_key_column_missing' };
  }
}

export async function loadBinding({ prisma, assignmentId, questionId } = {}) {
  if (!hasRawSql(prisma)) return null;
  const rows = await prisma.$queryRawUnsafe(
    'SELECT id, assignment_id, question_id, ruler_id, bound_at FROM ' + BINDING_TABLE + ' WHERE assignment_id = ? AND question_id = ? LIMIT 1',
    Number(assignmentId), Number(questionId),
  );
  const row = rows && rows[0];
  if (!row) return null;
  return {
    id: toNum(row.id), assignmentId: toNum(row.assignment_id), questionId: toNum(row.question_id),
    rulerId: toNum(row.ruler_id), boundAt: row.bound_at || null,
  };
}

/**
 * ★绑定：首次绑定 (assignment_id, question_id) = ruler；已有绑定 ⇒ **校验一致**（按 content_key 判同尺）。
 * 不一致 ⇒ fail-closed（reason=bind_conflict，留痕由调用方写入 job.last_error/日志），**绝不静默换尺**。
 */
export async function bindRulerToQuestion({ prisma, assignmentId, questionId, rulerId, contentKey = null, log = console } = {}) {
  const aId = Number(assignmentId);
  const qId = Number(questionId);
  const rId = Number(rulerId);
  if (!Number.isFinite(aId) || !Number.isFinite(qId) || !Number.isFinite(rId)) {
    return { ok: false, reason: 'bind_bad_args', created: false };
  }
  const existing = await loadBinding({ prisma, assignmentId: aId, questionId: qId });
  if (existing) {
    if (existing.rulerId === rId) return { ok: true, created: false, consistent: true, binding: existing, reason: 'already_bound' };
    const bound = await findRulerById(prisma, existing.rulerId);
    const boundKey = bound ? bound.contentKey : null;
    const sameContent = !!(contentKey && boundKey && String(boundKey) === String(contentKey));
    const line = RULER_TAG.bindConflict + ' assignment=' + aId + ' question=' + qId
      + ' bound_ruler=' + existing.rulerId + ' bound_content_key=' + (boundKey || '(row_missing)')
      + ' current_ruler=' + rId + ' current_content_key=' + (contentKey || '(na)')
      + ' same_content=' + (sameContent ? 'yes' : 'no');
    if (typeof log?.warn === 'function') log.warn(line); else if (typeof log?.log === 'function') log.log(line);
    if (sameContent) return { ok: true, created: false, consistent: true, binding: existing, reason: 'same_content_alias_ruler' };
    return { ok: false, reason: 'bind_conflict', created: false, consistent: false, binding: existing, boundContentKey: boundKey };
  }
  const affected = await prisma.$executeRawUnsafe(
    'INSERT IGNORE INTO ' + BINDING_TABLE + ' (assignment_id, question_id, ruler_id, bound_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))',
    aId, qId, rId,
  );
  const after = await loadBinding({ prisma, assignmentId: aId, questionId: qId });
  if (after && after.rulerId === rId) {
    if (typeof log?.info === 'function') log.info(RULER_TAG.bindCreated + ' assignment=' + aId + ' question=' + qId + ' ruler=' + rId + ' content_key=' + (contentKey || '(na)') + ' first=' + (Number(affected) === 1 ? 'yes' : 'no'));
    return { ok: true, created: Number(affected) === 1, consistent: true, binding: after, reason: 'bound' };
  }
  // 竞态：别的进程刚绑了另一把尺 ⇒ 递归校验一次即为终态
  if (after && after.rulerId !== rId) {
    const bound = await findRulerById(prisma, after.rulerId);
    const sameContent = !!(contentKey && bound && String(bound.contentKey) === String(contentKey));
    if (typeof log?.warn === 'function') log.warn(RULER_TAG.bindConflict + ' assignment=' + aId + ' question=' + qId + ' bound_ruler=' + after.rulerId + ' current_ruler=' + rId + ' same_content=' + (sameContent ? 'yes' : 'no') + ' (race)');
    return sameContent
      ? { ok: true, created: false, consistent: true, binding: after, reason: 'same_content_alias_ruler' }
      : { ok: false, reason: 'bind_conflict', created: false, consistent: false, binding: after };
  }
  return { ok: false, reason: 'bind_insert_failed', created: false };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** row.updatedAt 是否早于 now - staleMs（无法解析时间 ⇒ 视为不陈旧，绝不误接管） */
export function updatedAtOlderThan(row, staleMs, nowMs) {
  const t = row && row.updatedAt ? new Date(row.updatedAt).getTime() : NaN;
  if (!Number.isFinite(t)) return false;
  return nowMs - t > Math.max(0, Number(staleMs) || 0);
}

/**
 * 等待同内容造尺完成（★等待者只读：不写库、不造尺）。
 * @returns {{status:'ready'|'failed'|'timeout'|'vanished', ruler?:object, waitedMs:number, polls:number}}
 */
export async function waitForRulerReady({
  prisma, contentKey, pollIntervalMs = RULER_POLL_MS_DEFAULT, waitTimeoutMs = RULER_WAIT_MS_DEFAULT,
  sleep = defaultSleep, now = () => Date.now(), log = console, jobTag = '',
} = {}) {
  const t0 = now();
  let polls = 0;
  if (typeof log?.log === 'function') log.log(RULER_TAG.wait + ' content_key=' + contentKey + ' poll_ms=' + pollIntervalMs + ' timeout_ms=' + waitTimeoutMs + (jobTag ? ' ' + jobTag : ''));
  for (;;) {
    const waited = now() - t0;
    if (waited >= waitTimeoutMs) {
      const ruler = await findRulerByContentKey(prisma, contentKey).catch(() => null);
      return { status: 'timeout', ruler, waitedMs: waited, polls };
    }
    await sleep(pollIntervalMs);
    polls += 1;
    const ruler = await findRulerByContentKey(prisma, contentKey).catch(() => null);
    if (!ruler) return { status: 'vanished', ruler: null, waitedMs: now() - t0, polls };
    if (ruler.status === RULER_STATUS.ready) return { status: 'ready', ruler, waitedMs: now() - t0, polls };
    if (ruler.status === RULER_STATUS.failed) return { status: 'failed', ruler, waitedMs: now() - t0, polls };
  }
}

/**
 * ★解析主流程（复用 / 等待 / 造尺一次 + 老锚点复用 + 并发去重）。
 *
 * 三条互斥的「谁来造尺」：
 *   · buildFn 提供  ⇒ 抢占成功后由本函数调用它造尺一次，并写 ready（失败 ⇒ failed + 原因）
 *   · claimOnly=true ⇒ 抢占成功后**不造尺**，把所有权交回调用方（status='claimed_here'；调用方必须
 *                      completeClaimedRuler/markRulerFailed 收尾）——worker 的装置流程用这条
 *   · 两者都没给且无可采纳来源 ⇒ **绝不抢占、绝不写库**，返回 status='missing'（fail-closed，不污染 failed 行）
 *
 * @param {object} args
 * @param {object} args.prisma
 * @param {string} args.contentKey
 * @param {Function|null} args.buildFn        造尺一次（真跑装置）⇒ {checkerId, frozenSha256, checkerRaw, model?, sourceRunId?}
 * @param {Function|null} args.adoptProvider  可采纳来源（老锚点 / 本地已入库 checker）⇒ 同上结构或 null；抢占前先问一次
 * @param {boolean} args.claimOnly            抢占成功即交回所有权（调用方造尺）
 * @param {boolean} args.allowRetryFailed     见到 status=failed 时是否原子重试（造尺入口=true；等待者=false）
 * @returns {{status:'reuse'|'adopted'|'built'|'claimed_here'|'missing'|'failed'|'wait_timeout'|'wait_failed'|'unavailable', ruler, contentKey, zeroLlm, reason?, waitedMs?, polls?}}
 */
export async function resolveRulerForContent({
  prisma, contentKey, meta = {}, buildFn = null, adoptProvider = null, claimOnly = false,
  pollIntervalMs = resolvePollMs(), waitTimeoutMs = resolveWaitMs(), sleep = defaultSleep,
  now = () => Date.now(), log = console, allowRetryFailed = false, jobTag = '',
} = {}) {
  if (!hasRawSql(prisma)) return { status: 'unavailable', ruler: null, contentKey, zeroLlm: false, reason: 'no_raw_sql' };
  if (!(await rulerStoreAvailable(prisma))) {
    if (typeof log?.log === 'function') log.log(RULER_TAG.unavailable + ' content_key=' + contentKey + ' reason=table_missing（回落旧路径）');
    return { status: 'unavailable', ruler: null, contentKey, zeroLlm: false, reason: 'ruler_store_unavailable' };
  }

  let candidateCache;
  const adoptCandidate = async () => {
    if (candidateCache !== undefined) return candidateCache;
    if (typeof adoptProvider !== 'function') { candidateCache = null; return null; }
    try { candidateCache = (await adoptProvider()) || null; } catch (err) {
      if (typeof log?.warn === 'function') log.warn(RULER_TAG.adoptSkip + ' content_key=' + contentKey + ' reason=' + String(err && err.message).slice(0, 200));
      candidateCache = null;
    }
    return candidateCache;
  };
  const canProduce = async () => (typeof buildFn === 'function') || claimOnly || !!(await adoptCandidate());

  const build = async (rulerRow, how) => {
    const adopted = await adoptCandidate();
    if (adopted && adopted.checkerId) {
      const marked = await markRulerReady({
        prisma, contentKey, checkerId: adopted.checkerId, frozenSha256: adopted.frozenSha256 || null,
        checkerRaw: adopted.checkerRaw || null, model: adopted.model || meta.model || null,
        sourceRunId: adopted.sourceRunId === undefined ? null : adopted.sourceRunId,
      });
      const ruler = await findRulerByContentKey(prisma, contentKey);
      if (typeof log?.log === 'function') {
        log.log(RULER_TAG.adopted + ' content_key=' + contentKey + ' checker_id=' + adopted.checkerId
          + ' source=' + (adopted.source || 'old_anchor') + ' checker_raw_bytes=' + (adopted.checkerRaw ? Buffer.from(adopted.checkerRaw).length : 0)
          + ' MARKED=' + (marked.ok ? 'yes' : 'no'));
      }
      return { status: 'adopted', ruler, contentKey, zeroLlm: true };
    }
    if (claimOnly) {
      if (typeof log?.log === 'function') log.log(RULER_TAG.claim + ' content_key=' + contentKey + ' owner=caller' + (jobTag ? ' ' + jobTag : ''));
      return { status: 'claimed_here', ruler: await findRulerByContentKey(prisma, contentKey), contentKey, zeroLlm: false };
    }
    if (typeof buildFn !== 'function') {
      await markRulerFailed({ prisma, contentKey, reason: 'no_builder_available', model: meta.model || null });
      return { status: 'failed', ruler: await findRulerByContentKey(prisma, contentKey), contentKey, zeroLlm: false, reason: 'no_builder_available' };
    }
    try {
      const built = await buildFn();
      if (!built || !built.checkerId) throw new Error('builder_returned_no_checker_id');
      await markRulerReady({
        prisma, contentKey, checkerId: built.checkerId,
        frozenSha256: built.frozenSha256 || null, checkerRaw: built.checkerRaw || null,
        model: built.model || meta.model || null, sourceRunId: built.sourceRunId === undefined ? null : built.sourceRunId,
      });
      const ruler = await findRulerByContentKey(prisma, contentKey);
      if (typeof log?.log === 'function') {
        log.log(RULER_TAG.built + ' content_key=' + contentKey + ' checker_id=' + built.checkerId + ' via=' + how
          + ' checker_raw_bytes=' + (built.checkerRaw ? Buffer.from(built.checkerRaw).length : 0));
      }
      return { status: 'built', ruler, contentKey, zeroLlm: false };
    } catch (err) {
      const reason = String((err && err.message) || err || 'build_failed').slice(0, 500);
      await markRulerFailed({ prisma, contentKey, reason, model: meta.model || null });
      if (typeof log?.warn === 'function') log.warn(RULER_TAG.buildFailed + ' content_key=' + contentKey + ' reason=' + reason);
      return { status: 'failed', ruler: await findRulerByContentKey(prisma, contentKey), contentKey, zeroLlm: false, reason };
    }
  };

  for (let guard = 0; guard < 1000; guard += 1) {
    const ruler = await findRulerByContentKey(prisma, contentKey);
    if (ruler && ruler.status === RULER_STATUS.ready) {
      if (typeof log?.log === 'function') {
        log.log(RULER_TAG.reuse + ' content_key=' + contentKey + ' checker_id=' + (ruler.checkerId || '(none)')
          + ' checker_raw_bytes=' + ruler.checkerRawBytes + ' hit=ready' + (jobTag ? ' ' + jobTag : ''));
      }
      return { status: 'reuse', ruler, contentKey, zeroLlm: true };
    }
    if (ruler && ruler.status === RULER_STATUS.building) {
      // ★造尺入口：陈旧 building（造尺进程被强杀）可原子接管，避免同内容永久 fail-closed；等待者不接管
      if (allowRetryFailed && (typeof buildFn === 'function' || claimOnly) && updatedAtOlderThan(ruler, resolveBuildingStaleMs(), now())) {
        const rc = await reclaimStaleBuildingRuler({ prisma, contentKey, staleMs: resolveBuildingStaleMs(), now, log });
        if (rc.won) return build(rc.ruler, 'stale_building_reclaim');
      }
      const w = await waitForRulerReady({ prisma, contentKey, pollIntervalMs, waitTimeoutMs, sleep, now, log, jobTag });
      if (w.status === 'ready') {
        if (typeof log?.log === 'function') {
          log.log(RULER_TAG.reuse + ' content_key=' + contentKey + ' checker_id=' + (w.ruler.checkerId || '(none)')
            + ' checker_raw_bytes=' + w.ruler.checkerRawBytes + ' hit=after_wait waited_ms=' + w.waitedMs + ' polls=' + w.polls + (jobTag ? ' ' + jobTag : ''));
        }
        return { status: 'reuse', ruler: w.ruler, contentKey, zeroLlm: true, waitedMs: w.waitedMs, polls: w.polls };
      }
      if (w.status === 'failed') {
        if (typeof log?.warn === 'function') log.warn(RULER_TAG.waitFailed + ' content_key=' + contentKey + ' last_error=' + (w.ruler.lastError || '(none)') + ' waited_ms=' + w.waitedMs);
        if (allowRetryFailed && (await canProduce())) { const rc = await reclaimFailedRuler({ prisma, contentKey, meta }); if (rc.won) return build(rc.ruler, 'wait_failed_retry'); }
        return { status: 'wait_failed', ruler: w.ruler, contentKey, zeroLlm: false, reason: 'builder_failed:' + (w.ruler.lastError || 'unknown'), waitedMs: w.waitedMs };
      }
      if (typeof log?.warn === 'function') log.warn(RULER_TAG.waitTimeout + ' content_key=' + contentKey + ' waited_ms=' + w.waitedMs + ' polls=' + w.polls + ' status=' + w.status);
      return { status: 'wait_timeout', ruler: w.ruler, contentKey, zeroLlm: false, reason: 'wait_' + w.status, waitedMs: w.waitedMs };
    }
    if (ruler && ruler.status === RULER_STATUS.failed) {
      if (allowRetryFailed && (await canProduce())) {
        const rc = await reclaimFailedRuler({ prisma, contentKey, meta });
        if (rc.won) {
          if (typeof log?.log === 'function') log.log(RULER_TAG.retryClaim + ' content_key=' + contentKey + ' previous_error=' + (ruler.lastError || '(none)'));
          return build(rc.ruler, 'retry_failed');
        }
        continue; // 别人抢先重试 ⇒ 回到循环等待
      }
      if (typeof log?.warn === 'function') log.warn(RULER_TAG.waitFailed + ' content_key=' + contentKey + ' status=failed last_error=' + (ruler.lastError || '(none)'));
      return { status: 'failed', ruler, contentKey, zeroLlm: false, reason: composeFailedReason(ruler.lastError) };
    }
    // 无行 ⇒ 先确认「有人能造尺」，否则绝不抢占（避免把本可复用的行污染成 failed）
    if (!(await canProduce())) {
      if (typeof log?.warn === 'function') log.warn('RULER_NO_SOURCE content_key=' + contentKey + ' reason=no_builder_and_no_adoptable_source（fail-closed，不写库）');
      return { status: 'missing', ruler: null, contentKey, zeroLlm: false, reason: 'no_ruler_source' };
    }
    // 无行 ⇒ 抢占 building
    const claim = await claimBuildingRuler({ prisma, contentKey, meta });
    if (!claim.won) {
      if (typeof log?.log === 'function') log.log(RULER_TAG.claimLost + ' content_key=' + contentKey + ' status=' + ((claim.ruler && claim.ruler.status) || 'unknown'));
      continue; // 别人抢到了 ⇒ 回到循环（走等待分支）
    }
    if (typeof log?.log === 'function') log.log(RULER_TAG.claim + ' content_key=' + contentKey + (jobTag ? ' ' + jobTag : ''));
    return build(claim.ruler, 'claimed');
  }
  return { status: 'failed', ruler: await findRulerByContentKey(prisma, contentKey), contentKey, zeroLlm: false, reason: 'resolve_loop_guard' };
}

/**
 * ★老锚点复用（不重复造尺）：在老表 grading_checkers × grading_assignment_anchors 里找**可用**（有 checker_raw）
 * 且内容可证一致（快照逐字段相等：standard_hash/rubric/material 规范化后相同）的锚点。
 * 判定顺序：优先本作业（快照行即本作业冻结内容），其次同内容的其他作业（跨班/跨教师/历史作业）。
 * 任何一致性不成立的候选一律**跳过并留痕**（fail-closed；绝不用无法证明同内容的锚点）。
 */
export async function findAdoptableOldAnchor({ prisma, content, assignmentId = 0, limit = 50, log = console } = {}) {
  if (!hasRawSql(prisma)) return null;
  // ★分两次单表查询（不做跨表 JOIN）：grading_checkers 与 grading_assignment_anchors 的列排序规则不同
  //   （utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci）⇒ 跨表比较 checker_id 会报 1267 Illegal mix of collations。
  let anchors = [];
  try {
    anchors = await prisma.$queryRawUnsafe(
      'SELECT a.assignment_id, a.checker_id, a.frozen_sha256, a.checker_raw FROM grading_assignment_anchors a '
      + 'WHERE a.checker_raw IS NOT NULL ORDER BY (a.assignment_id = ?) DESC, a.id DESC LIMIT ?',
      Number(assignmentId) || 0, Number(limit) || 50,
    );
  } catch { anchors = []; }
  const rows = [];
  for (const aRow of anchors || []) {
    const cRows = await prisma.$queryRawUnsafe(
      'SELECT c.checker_id, c.assignment_id, c.question_id, c.rubric_hash, c.standard_hash, c.status FROM grading_checkers c '
      + 'WHERE c.checker_id = ? AND c.assignment_id = ? AND c.status = ? LIMIT 1',
      aRow.checker_id, aRow.assignment_id, 'ready',
    ).catch(() => []);
    const cRow = cRows && cRows[0];
    if (!cRow) { if (typeof log?.log === 'function') log.log(RULER_TAG.adoptSkip + ' checker_id=' + aRow.checker_id + ' assignment=' + aRow.assignment_id + ' reason=no_ready_checker_row'); continue; }
    if (cRow.question_id === null || cRow.question_id === undefined) { if (typeof log?.log === 'function') log.log(RULER_TAG.adoptSkip + ' checker_id=' + aRow.checker_id + ' assignment=' + aRow.assignment_id + ' reason=checker_question_id_absent'); continue; }
    rows.push({ ...cRow, frozen_sha256: aRow.frozen_sha256, checker_raw: aRow.checker_raw });
  }
  for (const row of rows || []) {
    const skip = async (reason) => {
      if (typeof log?.log === 'function') {
        log.log(RULER_TAG.adoptSkip + ' checker_id=' + row.checker_id + ' assignment=' + row.assignment_id + ' reason=' + reason);
      }
    };
    // 判据 1：候选所在作业的**发布冻结快照**必须存在，且与目标同内容（快照口径：standard_hash/rubric/material）
    const meta = await loadSnapshotContent(prisma, row.assignment_id, row.question_id).catch(() => null);
    if (!meta || !meta.ok) { await skip('snapshot_unavailable:' + ((meta && meta.reason) || 'error')); continue; }
    if (!content.snapshotStandardSha256 || meta.standardSha256 !== content.snapshotStandardSha256) { await skip('snapshot_standard_hash_mismatch'); continue; }
    if (meta.rubric !== content.rubric) { await skip('rubric_text_mismatch'); continue; }
    if (meta.description !== content.description) { await skip('description_text_mismatch'); continue; }
    if (row.rubric_hash !== content.rubricSha256) { await skip('rubric_hash_mismatch'); continue; }
    const raw = row.checker_raw ? Buffer.from(row.checker_raw) : null;
    if (!raw || raw.length === 0) { await skip('raw_bytes_unavailable'); continue; }
    let parsed = null;
    try { parsed = JSON.parse(raw.toString('utf8')); } catch { await skip('checker_raw_not_json'); continue; }
    if (!parsed || parsed.checker_id !== row.checker_id) { await skip('checker_id_mismatch_in_raw'); continue; }
    // 判据 2（装置口径，与 check.py:412-423 同规则）：按候选 checker 自己的 ignore 复算**当前标准包目录**摘要，
    //   必须等于候选 assignment_ref.standard_hash（③）⇒ 证明「装置将读到的字节」与候选造尺时一致。
    //   目录/摘要不可得 ⇒ 跳过（fail-closed；无法证明同内容就不用它）。
    const deviceStd = (parsed.assignment_ref || {}).standard_hash || null;
    if (!deviceStd) { await skip('device_standard_hash_absent'); continue; }
    if (!content.standardDir) { await skip('current_standard_dir_unknown'); continue; }
    const ignore = ((parsed.input_contract || {}).ignore) || [];
    const recomputed = standardDirDigest(content.standardDir, ignore);
    if (recomputed !== deviceStd) { await skip('device_standard_digest_mismatch'); continue; }
    const frozen = row.frozen_sha256 || null;
    const rawSha = sha256Of(raw);
    if (frozen && frozen !== rawSha) { await skip('frozen_sha256_mismatch'); continue; }
    return {
      checkerId: row.checker_id,
      frozenSha256: frozen || rawSha,
      checkerRaw: raw,
      checkerJson: parsed,
      source: 'old_anchor',
      sourceAssignmentId: toNum(row.assignment_id),
      sourceQuestionId: toNum(row.question_id),
      sameAssignment: toNum(row.assignment_id) === Number(assignmentId),
    };
  }
  return null;
}

/**
 * 读某个 (assignment, question) 的**发布冻结快照**内容（老锚点一致性判据用；与 dshRulerAssignment 同口径）。
 * 无快照 ⇒ ok:false（不允许用活值证明「同内容」）。
 */
export async function loadSnapshotContent(prisma, assignmentId, questionId) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT aq.rubric_snapshot, aq.material_snapshot, aq.standard_hash, aq.snapshot_origin, q.scoring_rubric, q.material, q.title, q.type '
    + 'FROM assignment_questions aq JOIN questions q ON q.id = aq.question_id '
    + 'WHERE aq.assignment_id = ? AND aq.question_id = ? LIMIT 1',
    Number(assignmentId), Number(questionId),
  );
  const row = rows && rows[0];
  if (!row) return { ok: false, reason: 'link_missing' };
  if (row.standard_hash === null || row.standard_hash === undefined) return { ok: false, reason: 'snapshot_missing' };
  const snap = typeof row.rubric_snapshot === 'string' ? safeJson(row.rubric_snapshot) : row.rubric_snapshot;
  const rubric = (snap && snap.rubric !== undefined && snap.rubric !== null) ? snap.rubric : (row.scoring_rubric || '');
  const material = row.material_snapshot !== null && row.material_snapshot !== undefined ? row.material_snapshot : (row.material || '');
  return {
    ok: true,
    questionId: Number(questionId),
    title: row.title || '',
    material,
    // ★题目描述全文与导出/指纹**同源构造**（≡ r2b20 buildAssignmentMd 的字节）；老锚点一致性判据直接比它
    description: buildAssignmentDescription({ title: row.title || '', material }),
    rubric: String(rubric ?? ''),
    standardSha256: String(row.standard_hash),
    origin: row.snapshot_origin || null,
  };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
