/**
 * infrastructure/dsh/runs/read-model/detail-run.js —— 管理员「批改记录」**详情聚合**（B3 纯搬运：从 read-model.js 原样搬出）。
 *
 * 运行行/teardown/逐份结果/用量-元信息-工具三块/日志尾部 + 存量尺子记录；行为/字段/兜底口径与拆分前逐字一致。
 * 共享依赖（shapeRow/用量/JSON 归一）由入口 read-model.js 注入 —— 子模块不反向 import 入口（无环）。
 */
import fs from 'node:fs';
import { parseTeardown, readArchiveFile, readJsonSafe, safeArchiveDir } from '../archive-fs.js';
import { loadRunMeta } from '../run-meta.js';
import { selectJobRuns } from './job-runs.js';
import { classifyJobKind } from './legacy-jobs.js';
import { loadSubmissionsByChecker } from './display-meta.js';

export function createGetRunDetail({
  prisma: prismaClient, logger: loggerClient, usageKeyFor, loadUsageIndex,
  shapeRow, shapeUsageBlock, shapeToolsBlock, toJsonSafe, normalizeRawRow,
}) {
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
  return getRunDetail;
}
