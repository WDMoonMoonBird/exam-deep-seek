#!/usr/bin/env node
/**
 * W8（R2-B1）回填回滚（数据级）—— 只清 snapshot_origin='backfill' 的行，发布态（publish）行永不触碰。
 * 默认 dry-run；--apply 需要白名单库 + --allow-db 双确认；生产库一律 exit 2。
 * 用法：node server/prisma/scripts/rollback-snapshots.js [--dry-run|--apply --allow-db exam_system_test] [--db-url <url>]
 */
import { PrismaClient } from '@prisma/client';

export const ALLOWED_APPLY_DBS = ['exam_system_test'];
export const REFUSE_PROD = 'REFUSE_PROD_DB';

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

export function buildRollbackSelectSql() {
  return "SELECT COUNT(*) AS n FROM assignment_questions WHERE snapshot_origin = 'backfill'";
}

export function buildRollbackUpdateSql() {
  return "UPDATE assignment_questions SET rubric_snapshot = NULL, material_snapshot = NULL, standard_hash = NULL, snapshot_origin = NULL " +
    "WHERE snapshot_origin = 'backfill'";
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) { console.log('RESULT=USAGE_ERROR reason=' + opts.error); return 4; }
  const url = opts.dbUrl || process.env.DATABASE_URL || '';
  if (!url) { console.log('RESULT=USAGE_ERROR reason=no_db_url'); return 4; }
  const dbName = (() => { try { return new URL(url).pathname.replace(/^\//, ''); } catch { return ''; } })();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await prisma.$queryRawUnsafe(buildRollbackSelectSql());
    const n = Number(rows && rows[0] ? (rows[0].n ?? rows[0].N ?? 0) : 0);
    console.log('MODE=' + opts.mode + ' DB=' + dbName + ' WOULD_NULL=' + n);
    if (opts.mode === 'dry-run') { console.log('ROLLBACK_DRY_RUN_OK would_null=' + n + ' (未写库)'); return 0; }
    if (!ALLOWED_APPLY_DBS.includes(dbName) || opts.allowDb !== dbName) {
      console.log('RESULT=' + REFUSE_PROD + ' reason=db_not_allowed_or_mismatch:' + dbName); return 2;
    }
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
