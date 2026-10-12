/**
 * W22（R2-B7）：造尺入口的授权三态 + dry-run 机制 —— 全部按**机制标记**断言（不只比 rc）。
 * 拒绝必须在连库与起子进程之前：REFUSED_BEFORE_CONNECT=yes 且无 STAGE=connect / 无 CONNECT_FAILED。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAuthorized, dbNameOf, defaultDeviceArgs, parseDeviceSummary, toTestDbUrl } from '../../scripts/r2b7-build-checker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../../scripts/r2b7-build-checker.mjs');
const DEAD_PROD = 'mysql://u:p@127.0.0.1:1/exam_system';
const TYPE_ERR = 'must be of type number';

function run(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 30000 });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

describe('W22 纯函数', () => {
  it('W22-1 toTestDbUrl：把库名换成测试库（不依赖源库名）；非法输入返回空串', () => {
    expect(dbNameOf(toTestDbUrl('mysql://u:p@h:3306/exam_system?x=1'))).toBe('exam_system_test');
    expect(dbNameOf(toTestDbUrl('mysql://u:p@h:3306/whatever'))).toBe('exam_system_test');
    expect(toTestDbUrl('not-a-url')).toBe('');
  });
  it('W22-2 assertAuthorized：测试库放行；生产需双开关（单开关拒 + 数字 2）', () => {
    expect(assertAuthorized({ dbName: 'exam_system_test', allowDb: '', allowProd: false }).ok).toBe(true);
    const onlyDb = assertAuthorized({ dbName: 'exam_system', allowDb: 'exam_system', allowProd: false });
    expect(onlyDb.ok).toBe(false);
    expect(onlyDb.exitCode).toBe(2);
    expect(onlyDb.reason).toBe('allow_prod_required:exam_system');
    const both = assertAuthorized({ dbName: 'exam_system', allowDb: 'exam_system', allowProd: true });
    expect(both.ok).toBe(true);
    expect(both.authorizedProd).toBe(true);
  });
  it('W22-3 defaultDeviceArgs 用真实装置 build-and-measure；parseDeviceSummary 解析装置摘要', () => {
    const args = defaultDeviceArgs({ limit: 3, workdir: '/tmp/x' });
    expect(args[0]).toBe('scripts/dsh-grader/run.sh');
    expect(args).toContain('build-and-measure');
    expect(args).toContain('3');
    const got = parseDeviceSummary('MODEL_CALLS=1\nASSIGNMENT_RESULT=PASS N=2\nCHECKER_ID_FILLED=sha256:abc\nRUN_EXIT=0\n');
    expect(got).toEqual({ modelCalls: 1, assignmentResult: 'PASS', checkerId: 'sha256:abc', runExit: 0 });
  });
});

describe('W22 授权三态（CLI，不可达 URL）', () => {
  it('W22-4 默认拒 / 仅 --allow-db / 仅 --allow-prod ⇒ rc=2 + REFUSED_BEFORE_CONNECT + 无 STAGE=connect + 无连接错误', () => {
    const cases = [
      ['--assignment', '1', '--db-url', DEAD_PROD],
      ['--assignment', '1', '--db-url', DEAD_PROD, '--allow-db', 'exam_system'],
      ['--assignment', '1', '--db-url', DEAD_PROD, '--allow-prod'],
    ];
    for (const args of cases) {
      const r = run(args);
      expect(r.status).toBe(2);
      expect(r.out).toContain('REFUSE_PROD_DB');
      expect(r.out).toContain('REFUSED_BEFORE_CONNECT=yes');
      expect(r.out).not.toContain('STAGE=connect');
      expect(r.out).not.toContain('CONNECT_FAILED');
      expect(r.out).not.toContain(TYPE_ERR);
    }
  });
  it('W22-5 ★双开关 ⇒ 越过守卫：STAGE=connect + CONNECT_FAILED=yes + rc=1，且**不得**出现 REFUSE', () => {
    const r = run(['--assignment', '1', '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod']);
    expect(r.out).toContain('STAGE=connect target_db=exam_system');
    expect(r.out).toContain('CONNECT_FAILED=yes');
    expect(r.status).toBe(1);
    expect(r.out).not.toContain('REFUSE_PROD_DB');
    expect(r.out).not.toContain('REFUSED_BEFORE_CONNECT');
    expect(r.out).toContain('AUDIT target_db=exam_system');
    expect(r.out).toContain('authorized_prod=yes');
    expect(r.out).not.toContain(TYPE_ERR);
  });
});

describe('W22 dry-run', () => {
  it('W22-6 dry-run：打印计划与现场路径、不连库不启动装置（无 STAGE=connect/无 STAGE=device）、rc=0', () => {
    const r = run(['--assignment', '1', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('DRY_RUN=yes');
    expect(r.out).toContain('PLAN assignment=1');
    expect(r.out).toContain('RUN_ROOT=');
    expect(r.out).toContain('DSH_HOME=');
    expect(r.out).toContain('SUMMARY_BEGIN');
    expect(r.out).toContain('MODEL_CALLS=0');
    expect(r.out).not.toContain('STAGE=connect');
    expect(r.out).not.toContain('STAGE=device');
  });
  it('W22-7 缺少 --assignment ⇒ rc=4（用法错误，数字退出码）', () => {
    const r = run(['--dry-run']);
    expect(r.status).toBe(4);
    expect(r.out).toContain('USAGE_ERROR');
    expect(r.out).not.toContain(TYPE_ERR);
  });
});
