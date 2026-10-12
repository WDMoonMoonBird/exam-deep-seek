/**
 * W5（R2-B1）：DSH 批改 runner —— 凭据**只经子进程 env** 注入，不落盘。
 *
 * 契约：
 *  - 从既有配置读凭据（config.js getApiKey：DB deepseek_api_key → env DEEPSEEK_API_KEY）；
 *  - 只通过子进程 env 传递（DEEPSEEK_API_KEY / GRADER_RUN_ROOT），**不写任何凭据文件**；
 *  - 日志只打印 key_len 与两个并发键的键名，绝不打印凭据本身；
 *  - 运行结束由调用方对 run-root 做 "sk" 前缀形态扫描（本模块自身不落盘）。
 */
import { spawn } from 'node:child_process';
import logger from '../utils/logger.js';
import {
  getApiKey,
  getConcurrencyWithKey,
  getDshGradingConcurrencyWithKey,
} from '../infrastructure/ai/deepseek/config.js';

export const CRED_ENV_KEY = 'DEEPSEEK_API_KEY';
export const RUN_ROOT_ENV_KEY = 'GRADER_RUN_ROOT';

/** 构造子进程 env：凭据 + run-root；不改动父进程 env（返回副本）。 */
export function buildGraderEnv({ apiKey, runRoot, baseEnv = process.env } = {}) {
  const env = { ...baseEnv };
  if (apiKey) env[CRED_ENV_KEY] = String(apiKey);
  if (runRoot) env[RUN_ROOT_ENV_KEY] = String(runRoot);
  return env;
}

/** 两条链路的并发键名标签（W4：便于日志区分单位）。 */
export async function describeConcurrencyKeys() {
  const ai = await getConcurrencyWithKey();
  const dsh = await getDshGradingConcurrencyWithKey();
  return {
    project_chain_key: ai.key, project_chain_label: ai.label, project_chain_value: ai.value,
    dsh_chain_key: dsh.key, dsh_chain_label: dsh.label, dsh_chain_value: dsh.value,
  };
}

function safeLog(logImpl, obj, msg) {
  if (logImpl && typeof logImpl.info === 'function') logImpl.info(obj, msg);
  else if (logImpl && typeof logImpl === 'function') logImpl(obj, msg);
}

/**
 * 运行 DSH 批改子进程。
 * @returns {Promise<{exitCode:number, timedOut:boolean, stdout:string, stderr:string, key_len:number, env_keys:string[]}>}
 */
export async function runDshGrader({
  command = 'dsh',
  args = [],
  runRoot,
  apiKey,
  cwd,
  timeoutMs = 600000,
  spawnImpl = spawn,
  logImpl = logger,
} = {}) {
  const key = apiKey !== undefined ? apiKey : await getApiKey();
  const concurrency = await describeConcurrencyKeys();
  const env = buildGraderEnv({ apiKey: key, runRoot });

  safeLog(logImpl, {
    evt: 'dsh_grader_start',
    concurrency_key: concurrency.dsh_chain_key,
    concurrency_value: concurrency.dsh_chain_value,
    project_concurrency_key: concurrency.project_chain_key,
    project_concurrency_value: concurrency.project_chain_value,
    key_len: key ? String(key).length : 0,
    run_root: runRoot || '',
  }, 'dsh-grader 启动（凭据仅经子进程 env 注入，不落盘）');

  const child = spawnImpl(command, args, { env, cwd: cwd || undefined, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }, Math.max(1000, timeoutMs));

  child.stdout?.on('data', (d) => { stdout += String(d); });
  child.stderr?.on('data', (d) => { stderr += String(d); });

  const exitCode = await new Promise((resolve) => {
    child.on('error', (e) => { stderr += 'SPAWN_ERROR ' + (e && e.message); resolve(-1); });
    child.on('close', (code) => resolve(code === null ? -1 : code));
  });
  clearTimeout(timer);

  safeLog(logImpl, {
    evt: 'dsh_grader_end',
    exit_code: exitCode,
    timed_out: timedOut,
    key_len: key ? String(key).length : 0,
    stdout_len: stdout.length,
    stderr_len: stderr.length,
  }, 'dsh-grader 结束');

  return { exitCode, timedOut, stdout, stderr, key_len: key ? String(key).length : 0, env_keys: Object.keys(env).sort() };
}
