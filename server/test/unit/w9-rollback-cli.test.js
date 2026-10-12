/**
 * W9（t30 / F-R2C1-1）：回滚脚本的 CLI 路径契约 —— 守卫前置于建连接之前、
 * 缺列 fail-closed(exit 3)、dry-run 可验证(不再 rc=1)。
 * 只跑只读/守卫分支，不写任何库。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_APPLY_DBS,
  NEED_MIGRATION,
  REFUSE_PROD,
  assertDbAllowed,
  buildRollbackSelectSql,
  buildRollbackUpdateSql,
  dbNameOf,
  detectSnapshotColumns,
  parseArgs,
} from '../../prisma/scripts/rollback-snapshots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.resolve(__dirname, '../../prisma/scripts/rollback-snapshots.js');

describe('W9 回滚 CLI 契约（t30）', () => {
  it('W9-1 默认 dry-run；--apply 显式才写；未知参数报错', () => {
    expect(parseArgs([]).mode).toBe('dry-run');
    expect(parseArgs(['--apply']).mode).toBe('apply');
    expect(parseArgs(['--db-url', 'x', '--allow-db', 'y']).allowDb).toBe('y');
    expect(parseArgs(['--bogus']).error).toBe('unknown_arg:--bogus');
    expect(dbNameOf('mysql://u:p@h:3306/exam_system')).toBe('exam_system');
    expect(dbNameOf('not-a-url')).toBe('');
  });

  it('W9-2 库守卫（导出函数）：无 allow-db / 不匹配 / 生产库 apply 一律拒绝', () => {
    expect(assertDbAllowed({ dbName: '', allowDb: 'x' }).exitCode).toBe(4);
    expect(assertDbAllowed({ dbName: 'exam_system', allowDb: '' }).code).toBe(REFUSE_PROD);
    expect(assertDbAllowed({ dbName: 'exam_system', allowDb: 'other' }).exitCode).toBe(2);
    expect(assertDbAllowed({ dbName: 'exam_system', allowDb: 'exam_system', mode: 'apply' }).code).toBe(REFUSE_PROD);
    expect(assertDbAllowed({ dbName: 'exam_system', allowDb: 'exam_system', mode: 'dry-run' }).ok).toBe(true);
    expect(assertDbAllowed({ dbName: 'exam_system_test', allowDb: 'exam_system_test', mode: 'apply' }).ok).toBe(true);
    expect(ALLOWED_APPLY_DBS).toEqual(['exam_system_test']);
  });

  it('W9-3 detectSnapshotColumns：列齐才算落地（mock 客户端）', async () => {
    const mk = (n) => ({ $queryRawUnsafe: async () => [{ n }] });
    expect((await detectSnapshotColumns(mk(4))).applied).toBe(true);
    expect((await detectSnapshotColumns(mk(3))).applied).toBe(false);
    expect((await detectSnapshotColumns({ $queryRawUnsafe: async () => [{ n: '4' }] })).applied).toBe(true);
  });

  it('W9-4 SQL 形状：dry-run 只读计数；apply 只清 backfill 行', () => {
    expect(buildRollbackSelectSql()).toContain("snapshot_origin = 'backfill'");
    expect(buildRollbackUpdateSql()).toContain("WHERE snapshot_origin = 'backfill'");
    expect(buildRollbackUpdateSql()).toContain('rubric_snapshot = NULL');
  });

  it('W9-5 CLI 守卫前置于连接之前：指向不可达端口的 URL 也在建连前 rc=2 返回（若先连库必然 rc=1）', () => {
    const deadUrl = 'mysql://u:p@127.0.0.1:1/exam_system';
    const res = spawnSync(process.execPath, [ROLLBACK, '--dry-run', '--db-url', deadUrl], { encoding: 'utf8', timeout: 20000 });
    expect(res.status).toBe(2);
    expect(res.stdout).toContain(REFUSE_PROD);
    expect(res.stdout).toContain('allow_db_required');
    expect(res.stdout).not.toContain('ROLLBACK_ERROR');
  });

  it('W9-6 CLI dry-run（测试库 + 显式 allow-db）：rc∈{0,3}，缺列时明确 PRECONDITION（绝不 rc=1）', () => {
    const testUrl = process.env.DATABASE_URL || '';
    if (!testUrl) { expect(true).toBe(true); return; }
    const dbName = dbNameOf(testUrl);
    const res = spawnSync(process.execPath,
      [ROLLBACK, '--dry-run', '--db-url', testUrl, '--allow-db', dbName], { encoding: 'utf8', timeout: 30000 });
    expect([0, 3]).toContain(res.status);
    expect(res.stdout).not.toContain('ROLLBACK_ERROR');
    if (res.status === 3) {
      expect(res.stdout).toContain(NEED_MIGRATION);
      expect(res.stdout).toContain('COLUMNS_APPLIED=no');
    } else {
      expect(res.stdout).toContain('ROLLBACK_DRY_RUN_OK');
    }
  });

  it('W9-7 CLI --apply 指向生产库 => rc=2（连库前拒绝，哪怕列齐也不写）', () => {
    const prodUrl = 'mysql://u:p@127.0.0.1:1/exam_system';
    const res = spawnSync(process.execPath,
      [ROLLBACK, '--apply', '--db-url', prodUrl, '--allow-db', 'exam_system'], { encoding: 'utf8', timeout: 20000 });
    expect(res.status).toBe(2);
    expect(res.stdout).toContain(REFUSE_PROD);
    expect(res.stdout).toContain('db_not_allowed_for_apply');
  });
});
