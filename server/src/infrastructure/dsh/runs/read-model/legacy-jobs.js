/**
 * infrastructure/dsh/runs/read-model/legacy-jobs.js —— **旧任务索引 / 内容键→尺子索引 / 存量尺子记录**（B3 纯搬运：从 read-model.js 原样搬出）。
 *
 * ★只读：仅 SELECT（$queryRawUnsafe）；表缺失/查询失败一律降级空索引（不 500，不伪造）。
 */
import defaultPrisma from '../../../../utils/prisma.js';
import defaultLogger from '../../../../utils/logger.js';
import { isAutoBuildChecker } from '../../worker/autoBuild.js';
import { isAutoOpenChecker } from '../../worker/autoOpen.js';
import { normalizeRawRow } from './json-safe.js';

// ===================== ★D2（t7）：自动造尺 / 存量记录（只读聚合，不新增表/迁移） =====================
const LEGACY_JOB_LIMIT = 1000;   // 旧任务索引上限（grading_jobs 最近的 N 行；避免全表扫描放大）
const RULER_RECORD_LIMIT = 200;  // 存量尺子记录上限（按绑定时间倒序）

/**
 * 判据：job → open / build / reuse / worker（只读；ruler 表缺失 ⇒ 退化为 worker，不报错）
 * - open：__AUTO_OPEN__ 哨兵（开放题自动评价 job；无标准包、content_key 恒 NULL、无 ruler）；
 * - build：本 job 造出的尺子（grading_rulers.source_run_id = job.id），或 checker_id 仍是 '__AUTO_BUILD__' 哨兵；
 * - reuse：job 带 content_key 且同内容尺子已存在但由别的运行造出（零 LLM 复用）；
 * - worker：无内容键的历史/普通批改 job。
 */
export function classifyJobKind({ jobId = null, checkerId = null, contentKey = null, rulerByContent = null } = {}) {
  // ★OP-1：开放 job 必须先判（无 content_key、无 ruler，否则会落到 worker）
  if (isAutoOpenChecker(checkerId)) return 'open';
  if (isAutoBuildChecker(checkerId)) return 'build';
  if (!contentKey || !rulerByContent) return 'worker';
  const ruler = rulerByContent.get(String(contentKey));
  if (!ruler) return 'worker';
  const src = ruler.source_run_id === null || ruler.source_run_id === undefined ? null : Number(ruler.source_run_id);
  return src !== null && Number.isFinite(src) && src === Number(jobId) ? 'build' : 'reuse';
}

/** 最近的 grading_jobs 索引（id → 行）+ 内容键集合；表缺失/查询失败 ⇒ 空索引（旧任务行不可见，但不 500） */
export async function loadRecentJobsIndex({ prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
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
export async function loadRulerContentIndex({ contentKeys = [], prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
  const out = new Map();
  const keys = [...contentKeys].filter((k) => /^[A-Za-z0-9]{16,80}$/.test(String(k)));
  if (!keys.length) return out;
  try {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, content_key, source_run_id, status, checker_id FROM grading_rulers WHERE content_key IN (' + keys.map(() => '?').join(',') + ')',
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
export async function loadLegacyRulerRecords({ prisma: prismaClient = defaultPrisma, log = defaultLogger, limit = RULER_RECORD_LIMIT } = {}) {
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
