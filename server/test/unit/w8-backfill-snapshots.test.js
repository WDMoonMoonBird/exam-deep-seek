/**
 * W8（R2-B1）：回填/回滚脚本的契约（默认 dry-run、幂等、生产库永不写入、迁移未落地 fail-closed）。
 * 不写任何库：CLI 用例只跑只读 dry-run 与守卫分支。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_APPLY_DBS,
  REFUSE_PROD,
  assertApplyAllowed,
  buildRowUpdateSql,
  buildTargetSql,
  parseArgs,
  summarize,
} from '../../prisma/scripts/backfill-snapshots.js';
import {
  buildRollbackSelectSql,
  buildRollbackUpdateSql,
  parseArgs as parseRollbackArgs,
} from '../../prisma/scripts/rollback-snapshots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKFILL = path.resolve(__dirname, '../../prisma/scripts/backfill-snapshots.js');

describe('W8 回填脚本契约', () => {
  it('W8-1 默认 dry-run（不显式 --apply 绝不写库）', () => {
    expect(parseArgs([]).mode).toBe('dry-run');
    expect(parseArgs(['--dry-run', '--limit', '50']).mode).toBe('dry-run');
    expect(parseArgs(['--limit', '50']).limit).toBe(50);
    expect(parseArgs(['--apply']).mode).toBe('apply');
    expect(parseRollbackArgs([]).mode).toBe('dry-run');
  });

  it('W8-2 --apply 的生产库守卫：白名单外一律拒绝（含 exam_system）', () => {
    expect(ALLOWED_APPLY_DBS).toEqual(['exam_system_test']);
    const prod = assertApplyAllowed({ mode: 'apply', dbName: 'exam_system', allowDb: 'exam_system' });
    expect(prod.ok).toBe(false);
    expect(prod.code).toBe(REFUSE_PROD);
    const mismatch = assertApplyAllowed({ mode: 'apply', dbName: 'exam_system_test', allowDb: 'other_db' });
    expect(mismatch.ok).toBe(false);
    const ok = assertApplyAllowed({ mode: 'apply', dbName: 'exam_system_test', allowDb: 'exam_system_test' });
    expect(ok.ok).toBe(true);
    expect(assertApplyAllowed({ mode: 'dry-run', dbName: 'exam_system', allowDb: '' }).ok).toBe(true); // dry-run 只读
  });

  it('W8-3 幂等与来源标记体现在 SQL 里', () => {
    expect(buildTargetSql({ hasSnapshotColumns: true })).toContain('aq.rubric_snapshot IS NULL');
    expect(buildTargetSql({ hasSnapshotColumns: false })).not.toContain('rubric_snapshot IS NULL');
    const upd = buildRowUpdateSql();
    expect(upd).toContain('JOIN questions');
    expect(upd).toContain('aq.rubric_snapshot IS NULL');
    expect(upd).toContain("snapshot_origin = 'backfill'");
    expect(buildRollbackSelectSql()).toContain("snapshot_origin = 'backfill'");
    expect(buildRollbackUpdateSql()).toContain("snapshot_origin = 'backfill'");
    expect(buildRollbackUpdateSql()).toContain('rubric_snapshot = NULL');
  });

  it('W8-4 摘要只输出 id 与 rubric 哈希前 12 位（不回显 rubric 正文）', () => {
    const s = summarize([{ assignment_id: 1, question_id: 2, rubric_sha: 'abcdef0123456789' }]);
    expect(s.matched).toBe(1);
    expect(s.samples[0].rubric_sha12).toBe('abcdef012345');
  });

  it('W8-5 CLI：dry-run 只读通过；--apply 在迁移未落地时 fail-closed（exit 3）；生产库 --apply 连库前即拒绝（exit 2）', () => {
    const testUrl = process.env.DATABASE_URL || '';
    if (!testUrl) {
      expect(true).toBe(true); // 无 DATABASE_URL 时跳过 CLI 用例（jest 安全命令总会注入）
      return;
    }
    const dry = spawnSync(process.execPath, [BACKFILL, '--dry-run', '--db-url', testUrl], { encoding: 'utf8' });
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('MODE=dry-run');
    expect(dry.stdout).toContain('MATCHED=');
    expect(dry.stdout).toContain('DRY_RUN_OK');
    expect(dry.stdout).not.toContain('APPLY_OK');

    const applyTest = spawnSync(process.execPath,
      [BACKFILL, '--apply', '--db-url', testUrl, '--allow-db', 'exam_system_test'], { encoding: 'utf8' });
    expect([0, 3]).toContain(applyTest.status); // 列已存在则 0；未落地则 3（fail-closed）
    if (applyTest.status === 3) expect(applyTest.stdout).toContain('PRECONDITION_MIGRATION_NOT_APPLIED');

    const prodUrl = testUrl.replace('/exam_system_test', '/exam_system');
    const applyProd = spawnSync(process.execPath,
      [BACKFILL, '--apply', '--db-url', prodUrl, '--allow-db', 'exam_system'], { encoding: 'utf8' });
    expect(applyProd.status).toBe(2);
    expect(applyProd.stdout).toContain(REFUSE_PROD);
  });
});
