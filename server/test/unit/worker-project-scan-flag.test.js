/**
 * worker-project-scan-flag.test.js — task-45 ①：WORKER_ENABLE_PROJECT_SCAN 静态/启动日志断言
 *
 * D（task-44）改动仅 server/src/infrastructure/worker/grading-worker.js：
 *   ① 模块级严格比较 const WORKER_ENABLE_PROJECT_SCAN = process.env.WORKER_ENABLE_PROJECT_SCAN === 'true';
 *   ② start() 启动日志带 projectScan: on/off；
 *   ③ 主循环 tasks=[scanSubmissions()]，flag===true 时才 push scanProjectSubmissions()（函数保留）。
 * 本文件：静态三处断言 + 子进程启动日志矩阵（缺省/false/1/TRUE/带空格 ⇒ off；'true' ⇒ on）。
 * 子进程用**不可达 DB**（127.0.0.1:1）⇒ getConcurrency 走 catch 回退，启动日志可捕获，且绝不写库/不调 AI。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SERVER_ROOT = process.cwd();                       // cd server 后 npx jest
const WORKER_SRC = path.join(SERVER_ROOT, 'src/infrastructure/worker/grading-worker.js');
const ENTRY = path.join(SERVER_ROOT, 'src/worker.js');

describe('task-45 ① · 静态：flag 三处 + 默认 off + 函数保留', () => {
  const src = fs.readFileSync(WORKER_SRC, 'utf8');

  it('①-1 模块级严格比较 === \'true\'（缺省/false/其它值均 off）', () => {
    expect(src).toMatch(/const WORKER_ENABLE_PROJECT_SCAN = process\.env\.WORKER_ENABLE_PROJECT_SCAN === 'true';/);
    // 不得出现的宽松写法（任一都会让默认路径行为漂移）
    expect(src).not.toMatch(/WORKER_ENABLE_PROJECT_SCAN\s*!==\s*'false'/);
    expect(src).not.toMatch(/WORKER_ENABLE_PROJECT_SCAN\s*\|\|/);
    expect(src).not.toMatch(/!!process\.env\.WORKER_ENABLE_PROJECT_SCAN/);
  });

  it('①-2 启动日志包含 projectScan: on/off', () => {
    expect(src).toMatch(/projectScan: WORKER_ENABLE_PROJECT_SCAN \? 'on' : 'off'/);
  });

  it('①-3 主循环 tasks=[scanSubmissions()]，仅 flag 时追加 scanProjectSubmissions()', () => {
    expect(src).toMatch(/const tasks = \[scanSubmissions\(\)\];/);
    expect(src).toMatch(/if \(WORKER_ENABLE_PROJECT_SCAN\) tasks\.push\(scanProjectSubmissions\(\)\);/);
  });

  it('①-4 scanProjectSubmissions 函数保留（回滚可用，未删除）', () => {
    expect(src).toMatch(/async function scanProjectSubmissions\(\)/);
    expect(src).toMatch(/export async function start\(\)/);
    expect(src).toMatch(/export function stop\(\)/);
  });
});

/** 启动 worker 子进程，捕获「评分 Worker 已启动」JSON 日志后立即 SIGTERM */
function runWorkerForStartupLog(envExtra, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, DATABASE_URL: 'mysql://u:p@127.0.0.1:1/exam_system_test', INTERNAL_SECRET: 't'.repeat(32), PORT: '0' };
    delete env.WORKER_ENABLE_PROJECT_SCAN;
    Object.assign(env, envExtra);
    const child = spawn(process.execPath, [ENTRY], { cwd: SERVER_ROOT, env });
    let out = '';
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => { err ? reject(err) : resolve(out); }, 150);
    };
    const timer = setTimeout(() => finish(new Error('未在超时内看到启动日志；out=' + out.slice(-800))), timeoutMs);
    const onData = (d) => {
      out += String(d);
      if (out.includes('评分 Worker 已启动')) finish(null);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => finish(e));
  });
}

function projectScanFlagFromLog(out) {
  for (const line of out.split(String.fromCharCode(10))) {
    const i = line.indexOf('{');
    if (i < 0) continue;
    try {
      const obj = JSON.parse(line.slice(i));
      if (obj && obj.msg === '评分 Worker 已启动') return obj.projectScan;
    } catch { /* 非 JSON 行忽略 */ }
  }
  return undefined;
}

describe('task-45 ① · 子进程启动日志矩阵（默认 off；严格 true 才 on）', () => {
  const cases = [
    ['缺省（env 不存在）', {}, 'off'],
    ["'false'", { WORKER_ENABLE_PROJECT_SCAN: 'false' }, 'off'],
    ["'1'", { WORKER_ENABLE_PROJECT_SCAN: '1' }, 'off'],
    ["'TRUE'（大小写）", { WORKER_ENABLE_PROJECT_SCAN: 'TRUE' }, 'off'],
    ["' true '（带空格）", { WORKER_ENABLE_PROJECT_SCAN: ' true ' }, 'off'],
    ["'true'", { WORKER_ENABLE_PROJECT_SCAN: 'true' }, 'on'],
  ];

  it.each(cases)('①-5 %s ⇒ projectScan=%s', async (_label, envExtra, expected) => {
    const out = await runWorkerForStartupLog(envExtra);
    const flag = projectScanFlagFromLog(out);
    expect(flag).toBe(expected);
    expect(out).toContain('评分 Worker 已启动');
  }, 15000);
});
