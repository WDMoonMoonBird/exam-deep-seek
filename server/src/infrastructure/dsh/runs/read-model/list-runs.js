/**
 * infrastructure/dsh/runs/read-model/list-runs.js —— 管理员「批改记录」**列表聚合**（B3 纯搬运：从 read-model.js 原样搬出）。
 *
 * 四源合并（job_runs / 归档 / grading_jobs 旧任务 / 存量尺子记录）+ 过滤/分页 + 老师班级标题补齐；
 * 行为/字段/排序/上限与拆分前逐字一致。共享依赖（shapeRow/用量/JSON 归一）由入口 read-model.js 注入 —— 子模块不反向 import 入口（无环）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { listArchiveDirs, parseTeardown, runsRootDir } from '../archive-fs.js';
import { SORTABLE, selectJobRuns } from './job-runs.js';
import { classifyJobKind, loadLegacyRulerRecords, loadRecentJobsIndex, loadRulerContentIndex } from './legacy-jobs.js';
import { attachAssignmentDisplayMeta } from './display-meta.js';

export function createListRuns({ prisma: prismaClient, logger: loggerClient, usageKeyFor, loadUsageIndex, toJsonSafe, normalizeRawRow, shapeRow }) {
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
  return listRuns;
}
