/**
 * W21（R2-B6b）：生产回填/回滚的 **apply 路径**必须真的越过守卫 —— 按**机制**断言，不只比 rc。
 *  - 拒绝态：rc=2（数字）、含 REFUSE_PROD_DB、含 REFUSED_BEFORE_CONNECT=yes、**不含** STAGE=connect、**不含**连接错误；
 *  - 放行态：rc=1、含 STAGE=connect、含连接错误、**不含** REFUSE_PROD_DB（反向断言在这里最重要）；
 *  - 任何输出都不得出现 TypeError 文案（F-R2B6-2 的字符串退出码症状）。
 * 全部指向不可达端口 127.0.0.1:1 ⇒ 绝不连真库、绝不写库。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKFILL = path.resolve(__dirname, '../../prisma/scripts/backfill-snapshots.js');
const ROLLBACK = path.resolve(__dirname, '../../prisma/scripts/rollback-snapshots.js');
const DEAD_PROD = 'mysql://u:p@127.0.0.1:1/exam_system';
const TYPE_ERR = 'must be of type number';

function run(script, args) {
  const res = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20000 });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

describe('W21 backfill --apply 路径机制', () => {
  it('W21-1 默认拒：rc=2（数字）、REFUSE_PROD_DB、REFUSED_BEFORE_CONNECT、无 STAGE=connect、无连接错误', () => {
    const r = run(BACKFILL, ['--apply', '--db-url', DEAD_PROD]);
    expect(r.status).toBe(2);
    expect(r.out).toContain('RESULT=REFUSE_PROD_DB');
    expect(r.out).toContain('REFUSED_BEFORE_CONNECT=yes');
    expect(r.out).not.toContain('STAGE=connect');
    expect(r.out).not.toContain('BACKFILL_ERROR');
    expect(r.out).not.toContain(TYPE_ERR);
  });

  it('W21-2 单开关（--allow-db 或 --allow-prod）：均 rc=2、REFUSE、无连接错误/无 TypeError', () => {
    for (const args of [
      ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system'],
      ['--apply', '--db-url', DEAD_PROD, '--allow-prod'],
    ]) {
      const r = run(BACKFILL, args);
      expect(r.status).toBe(2);
      expect(r.out).toContain('REFUSE_PROD_DB');
      expect(r.out).toContain('REFUSED_BEFORE_CONNECT=yes');
      expect(r.out).not.toContain('STAGE=connect');
      expect(r.out).not.toContain('BACKFILL_ERROR');
      expect(r.out).not.toContain(TYPE_ERR);
    }
  });

  it('W21-3 ★双开关 + --apply：必须越过守卫 —— 含 STAGE=connect 与连接错误、rc=1、**不得**出现 REFUSE', () => {
    const r = run(BACKFILL, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod']);
    expect(r.out).toContain('STAGE=connect');
    expect(r.out).toContain('BACKFILL_ERROR');
    expect(r.status).toBe(1);
    // ★反向断言（F-R2B6-1 的回归门）：放行路径一旦出现 REFUSE 即失败
    expect(r.out).not.toContain('REFUSE_PROD_DB');
    expect(r.out).not.toContain('REFUSED_BEFORE_CONNECT');
    expect(r.out).toContain('AUDIT target_db=exam_system');
    expect(r.out).toContain('authorized_prod=yes');
    expect(r.out).not.toContain(TYPE_ERR);
  });
});

describe('W21 rollback 对称路径机制', () => {
  it('W21-4 默认拒/单开关（--apply）：rc=2、REFUSE、无连接错误、无 TypeError', () => {
    const a = run(ROLLBACK, ['--apply', '--db-url', DEAD_PROD]);
    expect(a.status).toBe(2);
    expect(a.out).toContain('REFUSE_PROD_DB');
    expect(a.out).toContain('REFUSED_BEFORE_CONNECT=yes');
    expect(a.out).not.toContain('ROLLBACK_ERROR');
    expect(a.out).not.toContain(TYPE_ERR);
    const b = run(ROLLBACK, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system']);
    expect(b.status).toBe(2);
    expect(b.out).toContain('db_not_allowed_for_apply');
    expect(b.out).not.toContain('STAGE=connect');
    expect(b.out).not.toContain(TYPE_ERR);
  });

  it('W21-5 ★双开关 + --apply：越过守卫 ⇒ STAGE=connect + 连接错误 + rc=1，且不得出现 REFUSE', () => {
    const r = run(ROLLBACK, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('STAGE=connect');
    expect(r.out).toContain('ROLLBACK_ERROR');
    expect(r.out).not.toContain('REFUSE_PROD_DB');
    expect(r.out).not.toContain('REFUSED_BEFORE_CONNECT');
    expect(r.out).not.toContain(TYPE_ERR);
  });
});

describe('W21 退出码可区分性', () => {
  it('W21-6 「守卫拒绝」=2 与「连接失败」=1 严格可区分（两脚本、两者都非 1 混用）', () => {
    const denyBf = run(BACKFILL, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system']);
    const allowBf = run(BACKFILL, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod']);
    const denyRb = run(ROLLBACK, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system']);
    const allowRb = run(ROLLBACK, ['--apply', '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod']);
    expect([denyBf.status, denyRb.status]).toEqual([2, 2]);
    expect([allowBf.status, allowRb.status]).toEqual([1, 1]);
    // 机制串与退出码一一对应：2 ⇔ REFUSED_BEFORE_CONNECT / 1 ⇔ STAGE=connect
    expect(denyBf.out).toContain('REFUSED_BEFORE_CONNECT');
    expect(allowBf.out).toContain('STAGE=connect');
    expect(denyRb.out).toContain('REFUSED_BEFORE_CONNECT');
    expect(allowRb.out).toContain('STAGE=connect');
  });
});
