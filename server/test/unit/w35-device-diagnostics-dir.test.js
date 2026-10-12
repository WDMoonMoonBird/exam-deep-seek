/**
 * W35（R2-B13①）：复用路径写 out/diagnostics/measurable.json 前必须自建目录。
 * 双重证据：(a) 结构断言（lib_assignment.sh 里 mkdir 出现在写入之前）；(b) 机制沙箱（set -e 下缺目录会静默 exit 1）。
 * 不跑真实装置（该命令会调用 dsh/模型）：只复现「重定向到缺失目录」这一类故障。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const LIB = path.join(REPO, 'scripts', 'dsh-grader', 'lib_assignment.sh');

describe('W35 复用路径 diagnostics 目录', () => {
  it('W35-1 ★结构断言：measurable.json 的写入之前存在 mkdir -p "$OUT/diagnostics"', () => {
    const src = fs.readFileSync(LIB, 'utf8').split(/\r?\n/);
    // 复用路径唯一的「重定向写入」行（line 127 只是把路径当 argv 传给 python，不匹配 > 重定向）
    const writeIdx = src.findIndex((l) => / > "\$OUT\/diagnostics\/measurable\.json"/.test(l));
    expect(writeIdx).toBeGreaterThan(-1);
    const mkdirIdx = src.findIndex((l, i) => i < writeIdx && /mkdir -p "\$OUT\/diagnostics"/.test(l));
    expect(mkdirIdx).toBeGreaterThan(-1);
    expect(mkdirIdx).toBeLessThan(writeIdx); // 顺序：先建目录、再写文件
  });

  it('W35-2 机制沙箱：set -e 下写入缺失目录 ⇒ exit 1；先 mkdir ⇒ exit 0（与装置同一失败类）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w35-diag-'));
    // 与装置一致：OUT = <workdir>/out（装置里 OUT="$WORKDIR/out"）
    const bad = spawnSync('bash', ['-c', 'set -e; OUT="$1/out"; printf x > "$OUT/diagnostics/measurable.json"; echo SHOULD_NOT_REACH', '-', root], { encoding: 'utf8' });
    expect(bad.status).not.toBe(0);
    expect(bad.stdout).not.toContain('SHOULD_NOT_REACH');
    const good = spawnSync('bash', ['-c', 'set -e; OUT="$1/out"; mkdir -p "$OUT/diagnostics"; printf x > "$OUT/diagnostics/measurable.json"; echo REACHED', '-', root], { encoding: 'utf8' });
    expect(good.status).toBe(0);
    expect(good.stdout).toContain('REACHED');
    expect(fs.existsSync(path.join(root, 'out', 'diagnostics', 'measurable.json'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('W35-3 装置侧不变式：selftest 与运行脚本语法仍可用（bash -n）', () => {
    for (const f of ['lib_assignment.sh', 'run.sh', 'lib.sh']) {
      const res = spawnSync('bash', ['-n', path.join(REPO, 'scripts', 'dsh-grader', f)], { encoding: 'utf8' });
      expect(res.status).toBe(0);
    }
  });
});
