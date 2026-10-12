/**
 * W26（R2-B9①）：常驻 worker 的生产双重授权门 —— 按**机制标记**断言（不只比 rc）。
 * 拒绝必须在连库与起子进程之前：REFUSED_BEFORE_CONNECT=yes 且无 STAGE=connect；放行 ⇒ STAGE=connect。
 * 全部指向不可达端口 127.0.0.1:1（库名仍 exam_system 以触发生产门）⇒ 绝不连真库。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.resolve(__dirname, '../../scripts/r2b5-worker.mjs');
const DEAD_PROD = 'mysql://u:p@127.0.0.1:1/exam_system';
const TYPE_ERR = 'must be of type number';

function run(args, env) {
  const res = spawnSync(process.execPath, [WORKER, ...args], { encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env } });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

describe('W26 worker 生产授权三态（CLI，不可达 URL）', () => {
  it('W26-1 默认 / 仅 --allow-db / 仅 --allow-prod ⇒ rc=2（数字）+ REFUSED_BEFORE_CONNECT + 无 STAGE=connect', () => {
    const cases = [
      ['--once', '--db-url', DEAD_PROD],
      ['--once', '--db-url', DEAD_PROD, '--allow-db', 'exam_system'],
      ['--once', '--db-url', DEAD_PROD, '--allow-prod'],
    ];
    for (const args of cases) {
      const r = run(args);
      expect(r.status).toBe(2);
      expect(r.out).toContain('REFUSE_PROD_DB');
      expect(r.out).toContain('REFUSED_BEFORE_CONNECT=yes');
      expect(r.out).not.toContain('STAGE=connect');
      expect(r.out).not.toContain(TYPE_ERR);
      // 未起进程/未连库：没有 worker 循环痕迹
      expect(r.out).not.toContain('WORKER_START');
    }
  });

  it('W26-2 拒绝原因可判定：allow_db_required / allow_prod_required', () => {
    expect(run(['--once', '--db-url', DEAD_PROD]).out).toContain('allow_db_required:exam_system');
    expect(run(['--once', '--db-url', DEAD_PROD, '--allow-db', 'exam_system']).out).toContain('allow_prod_required:exam_system');
  });

  // 注（R2-B10① 行为变更，已在 R2-B10 记录披露）：生产库下假装置（默认 stub）现在 fail-closed 拒绝；
  // 因此「越过守卫」用例必须显式给真实装置 —— 这正是新防呆要求的口径。
  it('W26-3 ★双开关 + 真实装置 ⇒ 越过守卫：STAGE=connect + 真的去连库（failures=1），且**不得**出现 REFUSE', () => {
    const r = run(['--once', '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod', '--device', 'bash', '--device-arg', 'scripts/dsh-grader/run.sh']);
    expect(r.out).toContain('STAGE=connect target_db=exam_system');
    expect(r.out).toContain('AUDIT target_db=exam_system');
    expect(r.out).toContain('authorized_prod=yes');
    expect(r.out).toContain('failures=1'); // 已越过守卫并尝试连库（不可达 ⇒ 失败计数 1）
    expect(r.out).not.toContain('REFUSE_PROD_DB');
    expect(r.out).not.toContain('REFUSED_BEFORE_CONNECT');
    expect(r.out).not.toContain(TYPE_ERR);
  });

  it('W26-4 测试库默认放行（行为不变）：AUDIT authorization=test-db + STAGE=connect（不真的跑 job：--max-iterations 1 且闸满场景略）', () => {
    // 用测试库 URL 但指向不可达端口会失去「测试库」判定 ⇒ 这里只验证「库名判定由 URL 决定」
    const r = run(['--once', '--db-url', 'mysql://u:p@127.0.0.1:1/exam_system_test']);
    expect(r.out).toContain('STAGE=connect target_db=exam_system_test');
    expect(r.out).toContain('authorization=test-db');
    expect(r.out).not.toContain('REFUSED_BEFORE_CONNECT');
  });

  it('W26-5 --help/未知参数：未知参数 ⇒ rc=4（用法错误，数字退出码）', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(4);
    expect(r.out).toContain('USAGE_ERROR');
    expect(r.out).not.toContain(TYPE_ERR);
  });
});
