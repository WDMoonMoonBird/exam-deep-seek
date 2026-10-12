/**
 * W27（R2-B9③）：r2b7 的 --device-arg（整体替换）与 --device-extra-arg（追加）语义，及互斥 rc=4。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDeviceArgs, resolveDeviceArgs } from '../../scripts/r2b7-build-checker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../../scripts/r2b7-build-checker.mjs');

function plan(args) {
  const res = spawnSync(process.execPath, [SCRIPT, '--assignment', '1', '--dry-run', ...args], { encoding: 'utf8', timeout: 30000 });
  const out = (res.stdout || '') + (res.stderr || '');
  const m = out.match(/device_args=(\[[^\]]*\])/);
  return { status: res.status, out, args: m ? JSON.parse(m[1]) : null };
}

describe('W27 device-arg 语义', () => {
  it('W27-1 纯函数：无 --device-arg ⇒ 默认参数 + extra 追加；有 --device-arg ⇒ 整体替换（extra 不允许同给）', () => {
    const base = defaultDeviceArgs({ limit: 2, workdir: '/tmp/w' });
    expect(resolveDeviceArgs({ deviceExtraArgs: ['--allow-identical'] }, { limit: 2, workdir: '/tmp/w' }))
      .toEqual([...base, '--allow-identical']);
    expect(resolveDeviceArgs({ deviceArgs: ['x'] }, { limit: 2, workdir: '/tmp/w' })).toEqual(['x']);
    expect(resolveDeviceArgs({}, { limit: 2, workdir: '/tmp/w' })).toEqual(base);
  });

  it('W27-2 ★--device-extra-arg 追加：默认参数仍在（run.sh + build-and-measure），extra 在末尾', () => {
    const r = plan(['--device-extra-arg', '--allow-identical']);
    expect(r.status).toBe(0);
    expect(r.args[0]).toBe('scripts/dsh-grader/run.sh');
    expect(r.args).toContain('--checker-mode');
    expect(r.args).toContain('build-and-measure');
    expect(r.args[r.args.length - 1]).toBe('--allow-identical');
  });

  it('W27-3 --device-arg 仍是**整体替换**（既有语义不变，避免静默行为变化）', () => {
    const r = plan(['--device-arg', 'a', '--device-arg', 'b']);
    expect(r.status).toBe(0);
    expect(r.args).toEqual(['a', 'b']);
  });

  it('W27-4 两者同给 ⇒ rc=4 用法错误（不静默取其一）', () => {
    const r = plan(['--device-arg', 'x', '--device-extra-arg', 'y']);
    expect(r.status).toBe(4);
    expect(r.out).toContain('device_arg_conflicts_with_device_extra_arg');
  });
});
