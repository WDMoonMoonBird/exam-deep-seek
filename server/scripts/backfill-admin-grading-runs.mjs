#!/usr/bin/env node
/**
 * backfill-admin-grading-runs.mjs —— D2（t7）：把「有 grading_jobs 行、但没有 grading_job_runs 行」的旧批改任务
 * 回填成管理员「批改记录」可读的运行记录。
 *
 * 背景：/api/admin/grading-runs 的历史读法是 grading_job_runs ∪ 造尺归档；实验2 的 80 份（assignment 15/16、
 *   ruler 4）在 10-13 由旧进程写分，可能没有 grading_job_runs 行、且归档已被 keep_days 清理 ⇒ 管理员页看不到。
 *   ★默认路径是 read-model 的只读合成（grading_jobs ∪ ruler 记录，D2 已实现，页面已经能看到，无需本脚本）；
 *     本脚本是可选的物化工具：给仍只读 grading_job_runs 的其他消费方补行。
 *
 * 铁律：
 *   - 只 INSERT 到 grading_job_runs；绝不 update submissions / grading_jobs / 任何分数；
 *   - 默认 dry-run（只统计 + 打印将写入的行），必须显式 --apply 才写库；
 *   - 幂等：已存在 run 行的 job 一律跳过；
 *   - 只处理终态 job（done / failed / needs_rerun）；pending/running 不回填（可能仍在跑）。
 *   - ★诚实口径：measured / unmeasurable 在旧行里没有证据 ⇒ 写 0，并在 teardown_json / run_dir 标记
 *     backfill:grading_jobs；written / skipped 来自 grading_jobs（可直接对账）。
 *
 * 用法（从 server/ 运行）：
 *   node scripts/backfill-admin-grading-runs.mjs                      # dry-run，看候选
 *   node scripts/backfill-admin-grading-runs.mjs --apply              # 真写（仅补 grading_job_runs）
 *   node scripts/backfill-admin-grading-runs.mjs --apply --assignment 15 --limit 200
 *   node scripts/backfill-admin-grading-runs.mjs --db-url 'mysql://…/exam_system'
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..');
const TERMINAL = ['done', 'failed', 'needs_rerun'];
const BACKFILL_MARK = 'backfill:grading_jobs';

function parseArgs(argv) {
  const o = { apply: false, dbUrl: '', limit: 500, assignment: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--db-url') o.dbUrl = String(argv[++i] || '');
    else if (a === '--limit') o.limit = Math.max(1, Math.min(5000, Number(argv[++i]) || 500));
    else if (a === '--assignment') o.assignment = Number(argv[++i]) || null;
    else if (a === '--help') {
      console.log('usage: node scripts/backfill-admin-grading-runs.mjs [--dry-run|--apply] [--db-url <url>] [--limit N] [--assignment <id>]');
      console.log('  --dry-run     只统计候选（缺省行为，不写库）');
      console.log('  --apply       真写：仅 INSERT 缺失的 grading_job_runs 行（不改分）');
      console.log('  --assignment  只处理该作业');
      process.exit(0);
    } else {
      console.log('RESULT=USAGE_ERROR unknown_arg=' + a);
      process.exit(2);
    }
  }
  return o;
}

function resolveDbUrl(explicit) {
  if (explicit) return explicit;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = fs.readFileSync(path.join(SERVER, '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.*)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

const opts = parseArgs(process.argv.slice(2));
const url = resolveDbUrl(opts.dbUrl);
if (!url) { console.log('RESULT=NO_DB_URL'); process.exit(3); }
const dbName = (() => { try { return new URL(url).pathname.replace(/^\//, ''); } catch { return '(unknown)'; } })();
console.log('BACKFILL_TARGET db=' + dbName + ' apply=' + (opts.apply ? 'yes' : 'no') + ' limit=' + opts.limit + (opts.assignment ? ' assignment=' + opts.assignment : ''));

const prisma = new PrismaClient({ datasources: { db: { url } } });
let exitCode = 0;
try {
  const params = [...TERMINAL];
  let sql = 'SELECT j.id AS job_id, j.assignment_id, j.checker_id, j.status, j.written_count, j.skipped_count, j.created_at, j.updated_at '
    + 'FROM grading_jobs j LEFT JOIN grading_job_runs r ON r.job_id = j.id '
    + 'WHERE r.job_id IS NULL AND j.status IN (' + TERMINAL.map(() => '?').join(',') + ')';
  if (opts.assignment) { sql += ' AND j.assignment_id = ?'; params.push(opts.assignment); }
  sql += ' ORDER BY j.id ASC LIMIT ' + Number(opts.limit);
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  const candidates = (rows || []).map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[k] = typeof v === 'bigint' ? Number(v) : v;
    return o;
  });
  const byStatus = {};
  for (const c of candidates) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  console.log('BACKFILL_CANDIDATES n=' + candidates.length + ' by_status=' + JSON.stringify(byStatus)
    + '（有 grading_jobs 行但没有 grading_job_runs 行的终态任务）');
  if (candidates.length) {
    console.log('BACKFILL_SAMPLE ' + JSON.stringify(candidates.slice(0, 5).map((c) => ({ job: c.job_id, assignment: c.assignment_id, status: c.status, written: c.written_count, skipped: c.skipped_count }))));
    console.log('BACKFILL_FIELDS written/skipped 来自 grading_jobs；measured/unmeasurable 无旧证据 ⇒ 0（已在记录里标记 ' + BACKFILL_MARK + '）');
  }
  if (!opts.apply) {
    console.log('BACKFILL dry_run=yes would_insert=' + candidates.length + '（加 --apply 才写库；只 INSERT grading_job_runs，不改分）');
  } else {
    let inserted = 0;
    let failed = 0;
    for (const c of candidates) {
      const note = JSON.stringify({
        source: 'backfill_admin_grading_runs',
        mark: BACKFILL_MARK,
        note: '回填自 grading_jobs：只补管理员可见的运行记录，不改分数；measured/unmeasurable 无原始证据 ⇒ 0；written/skipped 来自 grading_jobs',
        job_status: c.status,
        backfilled_at: new Date().toISOString(),
      });
      try {
        await prisma.$executeRawUnsafe(
          'INSERT INTO grading_job_runs (job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, teardown_json, run_dir, created_at, updated_at) '
          + 'VALUES (?, ?, ?, ?, ?, NULL, 0, 0, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
          Number(c.job_id), Number(c.assignment_id), c.checker_id || null,
          c.created_at || null, c.updated_at || null,
          Number(c.skipped_count) || 0, Number(c.written_count) || 0,
          note, BACKFILL_MARK,
        );
        inserted += 1;
      } catch (err) {
        failed += 1;
        console.log('BACKFILL_ROW_FAILED job=' + c.job_id + ' reason=' + String((err && err.message) || err).slice(0, 200));
      }
    }
    console.log('BACKFILL updated=' + inserted + ' failed=' + failed + '（仅 grading_job_runs；submissions/grading_jobs 未改动）');
    if (failed) exitCode = 4;
  }
} catch (err) {
  exitCode = 4;
  console.log('BACKFILL_FAIL reason=' + String((err && err.message) || err).slice(0, 240));
} finally {
  await prisma.$disconnect().catch(() => {});
}
process.exit(exitCode);
