#!/usr/bin/env node
/**
 * W8（R2-B1）回填回滚（数据级）—— 只清 snapshot_origin='backfill' 的行，发布态（publish）行永不触碰。
 *
 * 契约（t30 修复 F-R2C1-1）：
 *  - 守卫前置：库名/白名单校验在 new PrismaClient 与任何查询之前完成；未通过时只打印 RESULT 并退出，
 *    一个连接都不建立（与 backfill-snapshots.js 同口径）。
 *  - 双确认：无论 dry-run 还是 --apply，都必须显式 --allow-db <目标库名> 且与 URL 库名一致；
 *    --apply 另需目标库属于 ALLOWED_APPLY_DBS（仅测试库）=> 生产库永不写入。
 *  - 迁移未落地：快照列不存在 => PRECONDITION_MIGRATION_NOT_APPLIED 且 exit 3（不再抛未捕获异常）。
 *  - 默认 dry-run；dry-run 只读，输出 WOULD_NULL。
 *
 * 用法：
 *   node server/prisma/scripts/rollback-snapshots.js --dry-run --db-url <url> --allow-db <该 URL 的库名>
 *   node server/prisma/scripts/rollback-snapshots.js --apply --db-url <测试库 url> --allow-db exam_system_test
 */
import { PrismaClient } from '@prisma/client';

export const ALLOWED_APPLY_DBS = ['exam_system_test'];
export const SNAPSHOT_COLUMNS = ['rubric_snapshot', 'material_snapshot', 'standard_hash', 'snapshot_origin'];
export const REFUSE_PROD = 'REFUSE_PROD_DB';
export const NEED_MIGRATION = 'PRECONDITION_MIGRATION_NOT_APPLIED';
export const USAGE = 'USAGE_ERROR';

export function parseArgs(argv) {
  const opts = { mode: 'dry-run', dbUrl: '', allowDb: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.mode = 'dry-run';
    else if (a === '--apply') opts.mode = 'apply';
    else if (a === '--db-url') opts.dbUrl = argv[++i] || '';
    else if (a === '--allow-db') opts.allowDb = argv[++i] || '';
    else return { error: 'unknown_arg:' + a };
  }
  return opts;
}

export function dbNameOf(url) {
  try { return new URL(url).pathname.replace(/^\//, ''); } catch { return ''; }
}

/**
 * 库守卫（必须在建连接之前调用）：导出以便单测直接覆盖。
 * 返回 { ok, exitCode, code, reason }；ok=false 时调用方不得建立任何数据库连接。
 */
export function assertDbAllowed({ dbName, allowDb, mode = 'dry-run' }) {
  if (!dbName) return { ok: false, exitCode: 4, code: USAGE, reason: 'no_db_url' };
  if (!allowDb) return { ok: false, exitCode: 2, code: REFUSE_PROD, reason: 'allow_db_required:' + dbName };
  if (allowDb !== dbName) return { ok: false, exitCode: 2, code: REFUSE_PROD, reason: 'allow_db_mismatch:' + allowDb + '!=' + dbName };
  if (mode === 'apply' && !ALLOWED_APPLY_DBS.includes(dbName)) {
    return { ok: false, exitCode: 2, code: REFUSE_PROD, reason: 'db_not_allowed_for_apply:' + dbName };
  }
  return { ok: true };
}

export function buildRollbackSelectSql() {
  return "SELECT COUNT(*) AS n FROM assignment_questions WHERE snapshot_origin = 'backfill'";
}

export function buildRollbackUpdateSql() {
  return "UPDATE assignment_questions SET rubric_snapshot = NULL, material_snapshot = NULL, standard_hash = NULL, snapshot_origin = NULL " +
    "WHERE snapshot_origin = 'backfill'";
}

/** 快照列是否已存在（迁移是否落地） */
export async function detectSnapshotColumns(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() " +
    "AND table_name = 'assignment_questions' AND column_name IN ('rubric_snapshot','material_snapshot','standard_hash','snapshot_origin')");
  const n = Number(rows && rows[0] ? (rows[0].n ?? rows[0].N ?? 0) : 0);
  return { applied: n === SNAPSHOT_COLUMNS.length, found: n };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) { console.log('RESULT=' + USAGE + ' reason=' + opts.error); return 4; }
  const url = opts.dbUrl || process.env.DATABASE_URL || '';
  if (!url) { console.log('RESULT=' + USAGE + ' reason=no_db_url（用 --db-url 或 DATABASE_URL）'); return 4; }
  const dbName = dbNameOf(url);

  // 守卫前置：任何库校验不通过 => 直接返回，绝不建立连接
  const guard = assertDbAllowed({ dbName, allowDb: opts.allowDb, mode: opts.mode });
  if (!guard.ok) { console.log('RESULT=' + guard.code + ' reason=' + guard.reason); return guard.exitCode; }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const cols = await detectSnapshotColumns(prisma);
    if (!cols.applied) {
      console.log('MODE=' + opts.mode + ' DB=' + dbName + ' COLUMNS_APPLIED=no');
      console.log('RESULT=' + NEED_MIGRATION + ' reason=snapshot_columns_missing');
      return 3;
    }
    const rows = await prisma.$queryRawUnsafe(buildRollbackSelectSql());
    const n = Number(rows && rows[0] ? (rows[0].n ?? rows[0].N ?? 0) : 0);
    console.log('MODE=' + opts.mode + ' DB=' + dbName + ' COLUMNS_APPLIED=yes WOULD_NULL=' + n);
    if (opts.mode === 'dry-run') { console.log('ROLLBACK_DRY_RUN_OK would_null=' + n + ' (未写库)'); return 0; }
    const affected = await prisma.$executeRawUnsafe(buildRollbackUpdateSql());
    console.log('ROLLBACK_APPLY_OK nulled=' + (Number(affected) || 0));
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith('rollback-snapshots.js')) {
  main().then((c) => process.exit(c)).catch((e) => { console.error('ROLLBACK_ERROR ' + (e && e.message)); process.exit(1); });
}
