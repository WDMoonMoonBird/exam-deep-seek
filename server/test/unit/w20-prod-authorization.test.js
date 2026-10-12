/**
 * W20（R2-B6）：生产库授权三态（默认拒 / 单开关拒 / 双开关放行）。
 * 拒绝必须发生在**连库之前**：URL 指向不可达端口（127.0.0.1:1）时 rc=2（若已尝试连接必为连接错误 rc=1）。
 * 兼容口径：回滚脚本的生产 dry-run（只读）保持「单开关即可」；两个脚本的生产 --apply（写）都要求双开关。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_APPLY_DBS as BF_ALLOWED, REFUSE_PROD as BF_REFUSE, assertApplyAllowed } from '../../prisma/scripts/backfill-snapshots.js';
import { ALLOWED_APPLY_DBS as RB_ALLOWED, REFUSE_PROD as RB_REFUSE, assertDbAllowed } from '../../prisma/scripts/rollback-snapshots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKFILL = path.resolve(__dirname, '../../prisma/scripts/backfill-snapshots.js');
const ROLLBACK = path.resolve(__dirname, '../../prisma/scripts/rollback-snapshots.js');
const DEAD_PROD = 'mysql://u:p@127.0.0.1:1/exam_system';
const DEAD_TEST = 'mysql://u:p@127.0.0.1:1/exam_system_test';

function run(script, args) {
  const res = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20000 });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

describe('W20 白名单默认仍只含测试库（授权不写死）', () => {
  it('W20-1 两个脚本的 ALLOWED_APPLY_DBS 都只有 exam_system_test', () => {
    expect(BF_ALLOWED).toEqual(['exam_system_test']);
    expect(RB_ALLOWED).toEqual(['exam_system_test']);
  });
});

describe('W20 backfill：生产 --apply 三态（函数级）', () => {
  it('W20-2 默认拒（无任何开关）⇒ exitCode 2 + REFUSE_PROD_DB', () => {
    const d = assertApplyAllowed({ mode: 'apply', dbName: 'exam_system', allowDb: '', allowProd: false });
    expect(d.ok).toBe(false);
    expect(d.exitCode).toBe(2);
    expect(d.code).toBe(BF_REFUSE);
    expect(d.reason).toBe('allow_db_required:exam_system');
  });
  it('W20-3 只给 --allow-db ⇒ 仍拒（allow_prod_required）', () => {
    const d = assertApplyAllowed({ mode: 'apply', dbName: 'exam_system', allowDb: 'exam_system', allowProd: false });
    expect(d.ok).toBe(false);
    expect(d.exitCode).toBe(2);
    expect(d.reason).toBe('allow_prod_required:exam_system');
  });
  it('W20-4 只给 --allow-prod ⇒ 仍拒（allow_db_required）', () => {
    const d = assertApplyAllowed({ mode: 'apply', dbName: 'exam_system', allowDb: '', allowProd: true });
    expect(d.ok).toBe(false);
    expect(d.exitCode).toBe(2);
    expect(d.reason).toBe('allow_db_required:exam_system');
  });
  it('W20-5 双开关 ⇒ 放行（authorizedProd=true + 授权来源）', () => {
    const d = assertApplyAllowed({ mode: 'apply', dbName: 'exam_system', allowDb: 'exam_system', allowProd: true });
    expect(d.ok).toBe(true);
    expect(d.authorizedProd).toBe(true);
    expect(d.authorization).toBe('--allow-db+--allow-prod');
  });
  it('W20-6 测试库路径行为不变（同名 --allow-db 即可；不匹配则拒）', () => {
    expect(assertApplyAllowed({ mode: 'apply', dbName: 'exam_system_test', allowDb: 'exam_system_test' }).ok).toBe(true);
    expect(assertApplyAllowed({ mode: 'apply', dbName: 'exam_system_test', allowDb: 'other' }).ok).toBe(false);
    expect(assertApplyAllowed({ mode: 'dry-run', dbName: 'exam_system', allowDb: '' }).ok).toBe(true);
  });
});

describe('W20 backfill：生产 --apply 三态（CLI，不可达端口证明未连库）', () => {
  it('W20-7 默认拒 ⇒ rc=2 + REFUSE_PROD_DB，且无连接错误（未建立连接）', () => {
    const r = run(BACKFILL, ['--apply', '--db-url', DEAD_PROD]);
    expect(r.status).toBe(2);
    expect(r.out).toContain(BF_REFUSE);
    expect(r.out).not.toContain('BACKFILL_ERROR');
    expect(r.out).not.toContain('AUDIT target_db');
  });
  it('W20-8 单开关（--allow-db 或 --allow-prod）⇒ 均拒 rc=2，且未连接', () => {
    const a = run(BACKFILL, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system']);
    expect(a.status).toBe(2);
    expect(a.out).toContain('allow_prod_required');
    expect(a.out).not.toContain('BACKFILL_ERROR');
    const b = run(BACKFILL, ['--apply', '--db-url', DEAD_PROD, '--allow-prod']);
    expect(b.status).toBe(2);
    expect(b.out).toContain('allow_db_required');
    expect(b.out).not.toContain('BACKFILL_ERROR');
  });
  it('W20-9 双开关 ⇒ 放行到连接阶段（AUDIT 审计行 + 目标是生产库名；rc=1 因端口不可达，绝不写库）', () => {
    const r = run(BACKFILL, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod']);
    expect(r.out).toContain('AUDIT target_db=exam_system');
    expect(r.out).toContain('allow_prod=yes');
    expect(r.out).toContain('authorization=--allow-db+--allow-prod');
    expect(r.out).toContain('authorized_prod=yes');
    expect(r.out).not.toContain(BF_REFUSE);
    expect(r.status).toBe(1);
  });
  it('W20-10 测试库 dry-run 不受影响（无审计行；不可达端口 ⇒ rc=1）', () => {
    const r = run(BACKFILL, ['--dry-run', '--db-url', DEAD_TEST]);
    expect(r.status).toBe(1);
    expect(r.out).not.toContain('AUDIT target_db');
  });
});

describe('W20 rollback：对称处理（dry-run 单开关只读；--apply 双开关）', () => {
  it('W20-11 函数级：默认拒；生产 dry-run 单开关放行；生产 --apply 只给 --allow-db 仍拒；双开关放行', () => {
    expect(assertDbAllowed({ dbName: 'exam_system', allowDb: '', allowProd: false }).exitCode).toBe(2);
    expect(assertDbAllowed({ dbName: 'exam_system', allowDb: 'exam_system', allowProd: false, mode: 'dry-run' }).ok).toBe(true);
    const applyOnlyDb = assertDbAllowed({ dbName: 'exam_system', allowDb: 'exam_system', allowProd: false, mode: 'apply' });
    expect(applyOnlyDb.ok).toBe(false);
    expect(applyOnlyDb.reason).toBe('db_not_allowed_for_apply:exam_system');
    const both = assertDbAllowed({ dbName: 'exam_system', allowDb: 'exam_system', allowProd: true, mode: 'apply' });
    expect(both.ok).toBe(true);
    expect(both.authorizedProd).toBe(true);
  });
  it('W20-12 CLI：生产 --apply 单开关 rc=2（未连接）；双开关 rc=1 + AUDIT；生产 dry-run 单开关 rc=1 + AUDIT', () => {
    const denied = run(ROLLBACK, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system']);
    expect(denied.status).toBe(2);
    expect(denied.out).toContain('db_not_allowed_for_apply');
    expect(denied.out).not.toContain('ROLLBACK_ERROR');
    const allowed = run(ROLLBACK, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod']);
    expect(allowed.out).toContain('AUDIT target_db=exam_system');
    expect(allowed.out).toContain('authorized_prod=yes');
    expect(allowed.status).toBe(1);
    const dry = run(ROLLBACK, ['--dry-run', '--db-url', DEAD_PROD, '--allow-db', 'exam_system']);
    expect(dry.out).toContain('AUDIT target_db=exam_system');
    expect(dry.out).toContain('authorization=--allow-db(dry-run)');
    expect(dry.status).toBe(1);
  });
  it('W20-13 无 --allow-db 一律拒（生产 dry-run 也一样），测试库 apply 单开关放行', () => {
    const noAllow = run(ROLLBACK, ['--dry-run', '--db-url', DEAD_PROD]);
    expect(noAllow.status).toBe(2);
    expect(noAllow.out).toContain(RB_REFUSE);
    expect(assertDbAllowed({ dbName: 'exam_system_test', allowDb: 'exam_system_test', mode: 'apply' }).ok).toBe(true);
  });
});
