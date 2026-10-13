/**
 * W5（R2-B1）：凭据只经子进程 env 注入，不落盘；日志只打 key_len。
 * （本文件不含任何 "sk" 前缀形态的真实/伪凭据字面量。）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CRED_ENV_KEY,
  RUN_ROOT_ENV_KEY,
  buildGraderEnv,
  describeConcurrencyKeys,
  runDshGrader,
} from '../../src/infrastructure/dsh/device/dshGraderRunner.js';

const FAKE_KEY = 'UNIT_TEST_KEY_1234567890'; // 刻意不含 "sk" 前缀

describe('W5 runner 凭据 env 注入', () => {
  it('W5-1 buildGraderEnv 注入凭据与 run-root，且不改动 process.env', () => {
    const before = process.env[CRED_ENV_KEY];
    const env = buildGraderEnv({ apiKey: FAKE_KEY, runRoot: '/tmp/run-root-x' });
    expect(env[CRED_ENV_KEY]).toBe(FAKE_KEY);
    expect(env[RUN_ROOT_ENV_KEY]).toBe('/tmp/run-root-x');
    expect(process.env[CRED_ENV_KEY]).toBe(before);
  });

  it('W5-2 子进程确实从 env 拿到凭据；日志只有 key_len；run-root 无凭据文件残留', async () => {
    const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w5-runroot-'));
    const stub = 'process.stdout.write("key_len=" + (process.env.' + CRED_ENV_KEY +
      ' || "").length + " run_root=" + (process.env.' + RUN_ROOT_ENV_KEY + ' || ""))';
    const logs = [];
    const res = await runDshGrader({
      command: process.execPath,
      args: ['-e', stub],
      runRoot,
      apiKey: FAKE_KEY,
      timeoutMs: 20000,
      logImpl: { info: (obj, msg) => logs.push(JSON.stringify(obj) + ' ' + msg) },
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('key_len=' + FAKE_KEY.length);
    expect(res.stdout).toContain('run_root=' + runRoot);
    expect(res.key_len).toBe(FAKE_KEY.length);
    expect(res.env_keys).toContain(CRED_ENV_KEY);
    expect(res.env_keys).toContain(RUN_ROOT_ENV_KEY);

    const logText = logs.join('\n');
    expect(logText).toContain('key_len');
    expect(logText).not.toContain(FAKE_KEY);           // 日志绝不出现凭据本体
    expect(fs.readdirSync(runRoot)).toEqual([]);       // 未落任何文件
    expect(fs.existsSync(path.join(runRoot, '.credentials.yaml'))).toBe(false);
    fs.rmSync(runRoot, { recursive: true, force: true });
  });

  it('W5-3 两条链路的并发键名都会打印（单位不同，便于区分）', async () => {
    const c = await describeConcurrencyKeys();
    expect(c.project_chain_key).toBe('ai_concurrency');
    expect(c.dsh_chain_key).toBe('dsh_grading_concurrency');
    expect(c.project_chain_label).not.toBe(c.dsh_chain_label);
  });
});
