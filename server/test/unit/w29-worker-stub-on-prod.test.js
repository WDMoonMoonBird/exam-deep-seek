/**
 * W29（R2-B10①）：生产防呆 —— 授权到生产库时，假装置（stub，含默认值）必须 fail-closed。
 * 机制断言：REFUSE_STUB_DEVICE_ON_PROD + REFUSED_BEFORE_CONNECT=yes + 无 STAGE=connect + 数字 rc=2。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.resolve(__dirname, '../../scripts/r2b5-worker.mjs');
const DEAD_PROD = 'mysql://u:p@127.0.0.1:1/exam_system';
const AUTH = ['--allow-db', 'exam_system', '--allow-prod'];

function run(args) {
  const res = spawnSync(process.execPath, [WORKER, ...args], { encoding: 'utf8', timeout: 30000 });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

describe('W29 生产防呆（假装置 fail-closed）', () => {
  it('W29-1 生产 + 默认装置（未给 --device-arg ⇒ stub） ⇒ REFUSE_STUB_DEVICE_ON_PROD + rc=2，不连库不起进程', () => {
    const r = run(['--once', '--db-url', DEAD_PROD, ...AUTH]);
    expect(r.status).toBe(2);
    expect(r.out).toContain('REFUSE_STUB_DEVICE_ON_PROD');
    expect(r.out).toContain('device_is_stub');
    expect(r.out).toContain('REFUSED_BEFORE_CONNECT=yes');
    expect(r.out).not.toContain('STAGE=connect');
    expect(r.out).not.toContain('WORKER_START');
    expect(r.out).not.toContain('consumed=1');
  });

  it('W29-2 生产 + **显式** stub 路径 ⇒ 同样拒（不能靠显式绕过）', () => {
    const r = run(['--once', '--db-url', DEAD_PROD, ...AUTH, '--device', 'node', '--device-arg', 'scripts/stub-device.mjs']);
    expect(r.status).toBe(2);
    expect(r.out).toContain('REFUSE_STUB_DEVICE_ON_PROD');
    expect(r.out).not.toContain('STAGE=connect');
  });

  it('W29-3 生产 + --reuse-checker 但不给真实装置 ⇒ 仍拒（复用也要真装置）', () => {
    const r = run(['--once', '--db-url', DEAD_PROD, ...AUTH, '--reuse-checker']);
    expect(r.status).toBe(2);
    expect(r.out).toContain('REFUSE_STUB_DEVICE_ON_PROD');
  });

  it('W29-4 生产 + 真实装置 ⇒ 越过防呆（出现 STAGE=connect；无 REFUSE_STUB_DEVICE_ON_PROD）', () => {
    const r = run(['--once', '--db-url', DEAD_PROD, ...AUTH, '--device', 'bash', '--device-arg', 'scripts/dsh-grader/run.sh']);
    expect(r.out).toContain('STAGE=connect target_db=exam_system');
    expect(r.out).not.toContain('REFUSE_STUB_DEVICE_ON_PROD');
    expect(r.out).toContain('failures=1'); // 已越过守卫并尝试连库（不可达 ⇒ 失败）
  });

  it('W29-5 测试库 + stub ⇒ 行为不变（不触发生产防呆）', () => {
    const r = run(['--once', '--db-url', 'mysql://u:p@127.0.0.1:1/exam_system_test']);
    expect(r.out).not.toContain('REFUSE_STUB_DEVICE_ON_PROD');
    expect(r.out).toContain('STAGE=connect target_db=exam_system_test');
  });
});
