#!/usr/bin/env node
/**
 * W8（R2-B1）历史回填脚本 —— assignment_questions 的快照列。
 *
 * 契约：
 *  - **默认 dry-run**（只读，打印 matched 与逐行摘要，不写库）；写库必须显式 --apply。
 *  - **幂等**：写入条件含 rubric_snapshot IS NULL ⇒ 二次 --apply matched=0。
 *  - **生产库永不写入**：--apply 只允许白名单库（ALLOWED_APPLY_DBS），其余一律 exit 2。
 *  - 回填行带 snapshot_origin='backfill'（不得声称历史重评逐位一致）。
 *  - 迁移未落地（快照列不存在）时：dry-run 自动退化为「preflight 计数」（等价目标集，不引用新列），
 *    而 --apply 直接 exit 3（PRECONDITION_MIGRATION_NOT_APPLIED）。
 *
 * 用法：
 *   node server/prisma/scripts/backfill-snapshots.js --dry-run                 # 默认
 *   node server/prisma/scripts/backfill-snapshots.js --dry-run --db-url <url>
 *   node server/prisma/scripts/backfill-snapshots.js --apply --allow-db exam_system_test --db-url <test-url>
 *   node server/prisma/scripts/backfill-snapshots.js --apply --standard-hash sha256:...
 */
import { PrismaClient } from '@prisma/client';

export const ALLOWED_APPLY_DBS = ['exam_system_test'];
export const SNAPSHOT_COLUMNS = ['rubric_snapshot', 'material_snapshot', 'standard_hash', 'snapshot_origin'];
export const REFUSE_PROD = 'REFUSE_PROD_DB';      // exit 2
export const NEED_MIGRATION = 'PRECONDITION_MIGRATION_NOT_APPLIED'; // exit 3
export const USAGE = 'USAGE_ERROR';              // exit 4

export function parseArgs(argv) {
  const opts = { mode: 'dry-run', limit: 200, dbUrl: '', allowDb: '', allowProd: false, standardHash: '', json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.mode = 'dry-run';
    else if (a === '--apply') opts.mode = 'apply';
    else if (a === '--json') opts.json = true;
    else if (a === '--limit') { const v = parseInt(argv[++i], 10); opts.limit = Number.isFinite(v) && v > 0 ? v : 200; }
    else if (a === '--db-url') opts.dbUrl = argv[++i] || '';
    else if (a === '--allow-db') opts.allowDb = argv[++i] || '';
    else if (a === '--allow-prod') opts.allowProd = true; // R2-B6：显式生产授权开关（每调用显式给出，不写死）
    else if (a === '--standard-hash') opts.standardHash = argv[++i] || '';
    else return { error: 'unknown_arg:' + a };
  }
  return opts;
}

export function dbNameOf(url) {
  try { return new URL(url).pathname.replace(/^\//, ''); } catch { return ''; }
}

/**
 * R2-B6：--apply 的库授权（**连库之前**判定）。
 *  - 白名单内的库（默认只有测试库）：--allow-db <同名> 即可（与批 1/2 行为一致）；
 *  - 白名单外的库（生产）：**双重显式 opt-in** —— 必须同时给 --allow-db <同名> 与 --allow-prod，
 *    只给其一仍拒绝（退出码 2，且不发生任何连接）。
 *  - 授权永远来自本次调用的命令行，不写死进常量（ALLOWED_APPLY_DBS 仍只含测试库）。
 */
export function assertApplyAllowed({ mode, dbName, allowDb, allowProd = false }) {
  if (mode !== 'apply') return { ok: true, authorizedProd: false };
  if (!dbName) return { ok: false, exitCode: 4, code: USAGE, reason: 'no_db_url' };
  const inWhitelist = ALLOWED_APPLY_DBS.includes(dbName);
  if (!inWhitelist) {
    if (allowDb !== dbName) return { ok: false, exitCode: 2, code: REFUSE_PROD, reason: 'allow_db_required:' + dbName };
    if (allowProd !== true) return { ok: false, exitCode: 2, code: REFUSE_PROD, reason: 'allow_prod_required:' + dbName };
    return { ok: true, authorizedProd: true, authorization: '--allow-db+--allow-prod' };
  }
  if (allowDb !== dbName) return { ok: false, exitCode: 2, code: REFUSE_PROD, reason: 'allow_db_mismatch:' + (allowDb || '(empty)') };
  return { ok: true, authorizedProd: false, authorization: 'whitelist+--allow-db' };
}

/** 目标集：project 型题 + 该链接尚无快照（有快照列时附加 IS NULL 保证幂等） */
export function buildTargetSql({ hasSnapshotColumns }) {
  const base = 'SELECT aq.assignment_id, aq.question_id, q.id AS question_id2, ' +
    'SHA2(COALESCE(q.scoring_rubric, \'\'), 256) AS rubric_sha ' +
    'FROM assignment_questions aq JOIN questions q ON q.id = aq.question_id ' +
    "WHERE q.type = 'project'";
  return hasSnapshotColumns ? base + ' AND aq.rubric_snapshot IS NULL ORDER BY aq.assignment_id, aq.question_id' : base + ' ORDER BY aq.assignment_id, aq.question_id';
}

export function buildRowUpdateSql() {
  // 内容在 DB 侧从 questions 复制（绝不把 rubric 正文经 JS/日志中转），WHERE 带 IS NULL 保证幂等。
  // ★rubric_snapshot 是 JSON 列：必须用 JSON_OBJECT 构造与「发布时快照」同形状的对象
  //   （{rubric, rubricItems, rubricSha256, capturedAt, backfilled}）；直接拷 TEXT 会报
  //   Invalid JSON text (MySQL 3140)。
  // ★rubricSha256 与平台口径（utils/snapshotHash.textSha256）一致：sha256(utf8(rubric)) 的 hex。
  return 'UPDATE assignment_questions aq JOIN questions q ON q.id = aq.question_id ' +
    "SET aq.rubric_snapshot = JSON_OBJECT(" +
    "'rubric', q.scoring_rubric, " +
    "'rubricItems', q.rubric_items, " +
    "'rubricSha256', CONCAT('sha256:', SHA2(COALESCE(q.scoring_rubric, ''), 256)), " +
    "'capturedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'), " +
    "'backfilled', TRUE), " +
    "aq.material_snapshot = q.material, " +
    "aq.standard_hash = ?, aq.snapshot_origin = 'backfill' " +
    'WHERE aq.assignment_id = ? AND aq.question_id = ? AND aq.rubric_snapshot IS NULL';
}

export function summarize(rows) {
  return {
    matched: rows.length,
    samples: rows.slice(0, 10).map((r) => ({
      assignment_id: r.assignment_id, question_id: r.question_id, rubric_sha12: String(r.rubric_sha || '').slice(0, 12),
    })),
  };
}

async function detectSnapshotColumns(prisma) {
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
  const dbName = dbNameOf(url);
  if (!url) { console.log('RESULT=' + USAGE + ' reason=no_db_url（用 --db-url 或 DATABASE_URL）'); return 4; }

  // ★守卫前置：--apply 的目标库检查在建连接/任何查询之前完成（生产库连都不连）
  if (opts.mode === 'apply') {
    const pre = assertApplyAllowed({ mode: opts.mode, dbName, allowDb: opts.allowDb, allowProd: opts.allowProd });
    if (!pre.ok) { console.log('RESULT=' + pre.code + ' reason=' + pre.reason); console.log('REFUSED_BEFORE_CONNECT=yes target_db=' + dbName); return pre.exitCode; }
    // R2-B6 可审计：放行时打印授权来源与目标库名
    console.log('AUDIT target_db=' + dbName + ' allow_db=' + (opts.allowDb || '(empty)') + ' allow_prod=' + (opts.allowProd ? 'yes' : 'no') + ' authorization=' + pre.authorization + ' authorized_prod=' + (pre.authorizedProd ? 'yes' : 'no'));
  }

  console.log('STAGE=connect target_db=' + dbName + ' mode=' + opts.mode); // 机制标记：只有越过守卫才会打印
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const cols = await detectSnapshotColumns(prisma);
    const rows = await prisma.$queryRawUnsafe(buildTargetSql({ hasSnapshotColumns: cols.applied }) + ' LIMIT ' + opts.limit);
    const sum = summarize(rows);
    console.log('MODE=' + opts.mode + ' DB=' + dbName + ' COLUMNS_APPLIED=' + (cols.applied ? 'yes' : 'no') +
      ' MATCHED=' + sum.matched + (cols.applied ? '' : ' (preflight：迁移未落地，按等价目标集计数)'));
    for (const s of sum.samples) {
      console.log('ROW assignment_id=' + s.assignment_id + ' question_id=' + s.question_id + ' rubric_sha12=' + s.rubric_sha12);
    }
    if (opts.mode === 'dry-run') {
      console.log('DRY_RUN_OK would_update=' + sum.matched + ' snapshot_origin=backfill (未写库)');
      return 0;
    }
    // F-R2B6-1 修复：apply 阶段必须**转发 allowProd**（此前漏传 ⇒ 取默认 false ⇒ 被自己的守卫拒绝）
    const guard = assertApplyAllowed({ mode: opts.mode, dbName, allowDb: opts.allowDb, allowProd: opts.allowProd });
    if (!guard.ok) { console.log('RESULT=' + guard.code + ' reason=' + guard.reason); console.log('REFUSED_BEFORE_CONNECT=yes target_db=' + dbName); return guard.exitCode; } // F-R2B6-2：返回**数字**退出码
    if (!cols.applied) { console.log('RESULT=' + NEED_MIGRATION + ' reason=snapshot_columns_missing'); return 3; }

    let updated = 0;
    for (const r of rows) {
      const n = await prisma.$executeRawUnsafe(buildRowUpdateSql(),
        opts.standardHash || null, r.assignment_id, r.question_id);
      updated += Number(n) || 0;
    }
    const rows2 = await prisma.$queryRawUnsafe(buildTargetSql({ hasSnapshotColumns: true }) + ' LIMIT ' + opts.limit);
    console.log('APPLY_OK updated=' + updated + ' remaining_matched=' + rows2.length + ' standard_hash=' + (opts.standardHash || '(null)'));
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('backfill-snapshots.js');
if (invokedDirectly) {
  // F-R2B6-2：退出码强制为数字（字符串 code 曾被 process.exit 拒绝 ⇒ TypeError ⇒ 退出码变 1，掩盖守卫语义）
  const exitWith = (c) => process.exit(Number.isFinite(Number(c)) ? Number(c) : 1);
  main().then(exitWith).catch((e) => { console.error('BACKFILL_ERROR ' + (e && e.message)); exitWith(1); });
}
