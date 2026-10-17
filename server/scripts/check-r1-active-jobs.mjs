#!/usr/bin/env node
/**
 * check-r1-active-jobs.mjs —— R1（Wave 3 / t22）**只读** preflight：
 *   「同一 assignment 在活动态（pending / running）至多一个 grading_job」是否满足。
 *
 * 用途：
 *   · 应用迁移 20261017123000_r1_grading_jobs_active_assignment **之前**先跑一次；
 *   · 重复 ⇒ migration 的 guard（临时表 PK + INSERT SELECT）会 1062 失败（结构零改动），
 *     先按本脚本输出归并（保留最新一条，其余置 failed）再重试；
 *   · 干净 ⇒ 可直接 prisma migrate deploy。
 *
 * 铁律：
 *   · 只读：仅 SELECT（grading_jobs + information_schema），无任何写路径；
 *   · 默认读 server/.env 的 DATABASE_URL（只读），或用 --db-url 指定；
 *   · 退出码：0=干净；1=存在重复（迁移会被 guard 拦住）；2=参数/连接/查询错误。
 *
 * 用法（从 server/ 或仓库根均可）：
 *   node server/scripts/check-r1-active-jobs.mjs
 *   node server/scripts/check-r1-active-jobs.mjs --json
 *   node server/scripts/check-r1-active-jobs.mjs --db-url 'mysql://…/exam_system_test'
 *
 * ★纯函数 findDuplicateActiveAssignments(rows) 已导出，供 C 单测（不触库）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..');

export const ACTIVE_STATUSES = ['pending', 'running'];
export const R1_INDEX_NAME = 'uniq_grading_jobs_active_assignment';
export const R1_COLUMN_NAME = 'active_assignment_key';
export const R1_MIGRATION_NAME = '20261017123000_r1_grading_jobs_active_assignment';

/**
 * 纯函数：从活动态 job 行中找出「同一 assignment 多于一个活动 job」的分组。
 * @param {Array<object>} rows 行对象（支持 assignment_id/assignmentId、checker_id/checkerId 两种键；BigInt 自动归一）
 * @returns {Array<{assignment_id:number, count:number, ids:Array<number|null>, checkers:Array<string|null>, jobs:Array<object>}>}
 *   按 count 降序、assignment_id 升序；组内 jobs 按 id 升序。无重复 ⇒ []。
 */
export function findDuplicateActiveAssignments(rows = []) {
  const byAssignment = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const rawAssignment = row.assignment_id !== undefined && row.assignment_id !== null ? row.assignment_id : row.assignmentId;
    const assignmentId = Number(rawAssignment);
    if (!Number.isFinite(assignmentId) || assignmentId <= 0) continue;
    const rawChecker = row.checker_id !== undefined ? row.checker_id : row.checkerId;
    const job = {
      id: row.id === undefined || row.id === null ? null : Number(row.id),
      checker_id: rawChecker === undefined || rawChecker === null ? null : String(rawChecker),
      status: row.status === undefined || row.status === null ? null : String(row.status),
      created_at: row.created_at !== undefined ? row.created_at : (row.createdAt !== undefined ? row.createdAt : null),
    };
    if (!byAssignment.has(assignmentId)) byAssignment.set(assignmentId, []);
    byAssignment.get(assignmentId).push(job);
  }
  const groups = [];
  for (const [assignmentId, jobs] of byAssignment.entries()) {
    if (jobs.length <= 1) continue;
    jobs.sort((a, b) => Number(a.id === null ? 0 : a.id) - Number(b.id === null ? 0 : b.id));
    groups.push({
      assignment_id: assignmentId,
      count: jobs.length,
      ids: jobs.map((j) => j.id),
      checkers: jobs.map((j) => j.checker_id),
      jobs,
    });
  }
  groups.sort((a, b) => b.count - a.count || a.assignment_id - b.assignment_id);
  return groups;
}

function parseArgs(argv) {
  const o = { dbUrl: '', json: false, sample: 20, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db-url') o.dbUrl = String(argv[++i] || '');
    else if (a === '--json') o.json = true;
    else if (a === '--sample') o.sample = Math.max(1, Math.min(200, Number(argv[++i]) || 20));
    else if (a === '--help') o.help = true;
    else { console.log('RESULT=USAGE_ERROR unknown_arg=' + a); process.exit(2); }
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

function dbNameOf(url) {
  try { return new URL(url).pathname.replace(/^\//, ''); } catch { return '(unknown)'; }
}

function normalizeRows(rows) {
  return (rows || []).map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[k] = typeof v === 'bigint' ? Number(v) : v;
    return o;
  });
}

async function fetchActiveJobs(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT id, assignment_id, checker_id, status, created_at FROM grading_jobs '
    + 'WHERE status IN (' + ACTIVE_STATUSES.map(() => '?').join(',') + ') ORDER BY assignment_id ASC, id ASC',
    ...ACTIVE_STATUSES,
  );
  return normalizeRows(rows);
}

async function fetchSchemaState(prisma) {
  const col = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    'grading_jobs', R1_COLUMN_NAME,
  );
  const idx = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    'grading_jobs', R1_INDEX_NAME,
  );
  return { column_present: Number(col && col[0] && col[0].n) > 0, index_present: Number(idx && idx[0] && idx[0].n) > 0 };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('usage: node server/scripts/check-r1-active-jobs.mjs [--db-url <url>] [--json] [--sample N]');
    console.log('  只读 preflight：检查是否满足「每 assignment 至多一个活动 job」（R1 迁移前置条件）');
    console.log('  exit 0=干净 / 1=存在重复 / 2=参数或连接错误');
    process.exit(0);
  }
  const url = resolveDbUrl(opts.dbUrl);
  if (!url) { console.log('RESULT=NO_DB_URL'); process.exit(2); }
  const dbName = dbNameOf(url);
  let prisma = null;
  try {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const activeRows = await fetchActiveJobs(prisma);
    const schema = await fetchSchemaState(prisma);
    const duplicates = findDuplicateActiveAssignments(activeRows);
    const out = {
      ok: duplicates.length === 0,
      db: dbName,
      active: activeRows.length,
      duplicate_groups: duplicates.length,
      duplicates: duplicates.slice(0, opts.sample),
      sample_limit: opts.sample,
      schema,
      migration: R1_MIGRATION_NAME,
      generated_at: new Date().toISOString(),
    };
    if (opts.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log('R1_PREFLIGHT db=' + dbName + ' active=' + activeRows.length + ' duplicate_groups=' + duplicates.length
        + ' schema.column=' + (schema.column_present ? 'yes' : 'no') + ' schema.index=' + (schema.index_present ? 'yes' : 'no'));
      if (out.ok) {
        console.log('R1_OK 无重复活动 assignment ⇒ 可安全应用迁移 ' + R1_MIGRATION_NAME);
      } else {
        for (const g of duplicates.slice(0, opts.sample)) {
          console.log('R1_DUPLICATE assignment=' + g.assignment_id + ' jobs=' + g.count + ' ids=[' + g.ids.join(',') + '] checkers=[' + g.checkers.map((c) => (c === null ? '(null)' : c)).join(',') + ']');
        }
        console.log('R1_HINT 迁移会因 1062 在 guard 处失败（结构零改动）。先归并：保留 id 最大的一条，'
          + '其余 UPDATE grading_jobs SET status=\'failed\', last_error=\'superseded_by_r1_migration\' WHERE id IN (…)；再重试。');
        console.log('R1_RESULT=BLOCKED duplicate_groups=' + duplicates.length);
      }
    }
    process.exit(out.ok ? 0 : 1);
  } catch (err) {
    const reason = String((err && err.message) || err).slice(0, 300);
    if (opts.json) console.log(JSON.stringify({ ok: false, db: dbName, error: reason }, null, 2));
    else console.log('R1_PREFLIGHT_FAIL reason=' + reason);
    process.exit(2);
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
