#!/usr/bin/env node
/**
 * r2b5-worker.mjs —— R2-B5：常驻 worker（无人值守形态）。
 *
 * 用法（从 server/ 运行）：
 *   node scripts/r2b5-worker.mjs [--once] [--max-iterations N] [--timeout-ms N]
 *                               [--device <cmd>] [--device-arg <a>]... [--stub-env k=v]...
 * 环境：
 *   DSH_WORKER_IDLE_BACKOFF_MS / DSH_WORKER_MAX_BACKOFF_MS / DSH_WORKER_FAILURE_BACKOFF_MS /
 *   DSH_WORKER_MAX_CONSECUTIVE_FAILURES / DSH_WORKER_DB_LIMIT / DSH_WORKER_STUB_MODE ...
 *
 * 退出码：0 正常/收到 SIGINT|SIGTERM 且跑完当前 job；3 连续失败超上限；2 库名断言失败；4 用法错误。
 * 只写测试库（库名硬断言）；不执行学生代码（装置自身在 profile 层锁死工具）；凭据只经子进程 env。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { runOnce } from '../src/services/dshGradingJobWorker.js';
import { EXIT, parseWorkerConfig, runWorkerLoop } from '../src/services/dshGradingWorkerRuntime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const o = { once: false, maxIterations: Infinity, timeoutMs: 600000, device: null, deviceArgs: [], stubEnv: {}, allowDb: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') o.once = true;
    else if (a === '--max-iterations') o.maxIterations = Number(argv[++i]);
    else if (a === '--timeout-ms') o.timeoutMs = Number(argv[++i]);
    else if (a === '--device') o.device = argv[++i];
    else if (a === '--device-arg') o.deviceArgs.push(argv[++i]);
    else if (a === '--stub-env') { const kv = String(argv[++i] || ''); const i2 = kv.indexOf('='); if (i2 > 0) o.stubEnv[kv.slice(0, i2)] = kv.slice(i2 + 1); }
    else if (a === '--allow-db') o.allowDb = argv[++i];
    else if (a === '--help') { console.log('usage: node scripts/r2b5-worker.mjs [--once] [--max-iterations N] [--device <cmd>] [--device-arg <a>] [--stub-env k=v]'); process.exit(0); }
    else { console.log('RESULT=USAGE_ERROR unknown_arg=' + a); process.exit(4); }
  }
  return o;
}

function testDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(path.join(SERVER, '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  return m ? m[1].trim().replace('/exam_system', '/exam_system_test') : '';
}

const opts = parseArgs(process.argv.slice(2));
const url = testDbUrl();
if (!url) { console.log('RESULT=NO_DB_URL'); process.exit(4); }
const dbName = new URL(url).pathname.replace(/^\//, '');
if (dbName !== 'exam_system_test') { console.log('REFUSE ' + dbName); process.exit(2); }

const prisma = new PrismaClient({ datasources: { db: { url } } });
const config = parseWorkerConfig();
const stopSignal = { stopped: false };
let signalled = null;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { signalled = sig; stopSignal.stopped = true; console.log('WORKER_SIGNAL=' + sig + '（跑完当前 job 后退出）'); });
}

const device = opts.device || 'node';
const deviceArgs = opts.deviceArgs.length ? opts.deviceArgs : [path.join(SERVER, 'scripts', 'stub-device.mjs')];
console.log('WORKER_START db=/' + dbName + ' idle_backoff_ms=' + config.idleBackoffMs + ' max_backoff_ms=' + config.maxBackoffMs
  + ' failure_backoff_ms=' + config.failureBackoffMs + ' max_consecutive_failures=' + config.maxConsecutiveFailures
  + ' db_limit=' + (config.dbLimit === undefined ? 'auto' : config.dbLimit) + ' device=' + device);

const res = await runWorkerLoop({
  prisma,
  runOnceImpl: ({ dbLimit }) => runOnce({
    prisma, dbLimit, deviceCommand: device, deviceArgs, stubEnv: opts.stubEnv,
    timeoutMs: opts.timeoutMs, repoRoot: path.resolve(SERVER, '..'),
  }),
  config,
  stopSignal,
  log: console,
  maxIterations: opts.once ? 1 : opts.maxIterations,
});

console.log('WORKER_EXIT=' + res.exitCode + ' iterations=' + res.iterations + ' consumed=' + res.consumed + ' failures=' + res.failures + (signalled ? ' signal=' + signalled : ''));
await prisma.$disconnect();
process.exit(res.exitCode);
