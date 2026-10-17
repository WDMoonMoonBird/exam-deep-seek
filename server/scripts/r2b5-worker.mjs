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
import { runOnce } from '../src/infrastructure/dsh/worker/index.js';
import { EXIT, parseWorkerConfig, runWorkerLoop } from '../src/infrastructure/dsh/worker/dshGradingWorkerRuntime.js';
import { describeLlmConfig, llmEnv, readPlatformLlmConfig } from '../src/infrastructure/dsh/config/dshPlatformLlmConfig.js';
import { checkTimeoutVsStale, formatReclaimSummary, reclaimStaleRunning, resolveClockToleranceMs, resolveStaleMs } from '../src/infrastructure/dsh/worker/dshStaleJobReclaimer.js';
import { MATERIALS_ROOT_ENV, formatMaterialsRoot } from '../src/infrastructure/dsh/materials/dshMaterialsResolver.js';
import { scanDueAssignments } from '../src/infrastructure/dsh/worker/dueAssignmentScanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const o = { once: false, maxIterations: Infinity, timeoutMs: 600000, device: null, deviceArgs: [], stubEnv: {}, allowDb: '', allowProd: false, dbUrl: '', reuseChecker: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') o.once = true;
    else if (a === '--max-iterations') o.maxIterations = Number(argv[++i]);
    else if (a === '--timeout-ms') o.timeoutMs = Number(argv[++i]);
    else if (a === '--device') o.device = argv[++i];
    else if (a === '--device-arg') o.deviceArgs.push(argv[++i]);
    else if (a === '--stub-env') { const kv = String(argv[++i] || ''); const i2 = kv.indexOf('='); if (i2 > 0) o.stubEnv[kv.slice(0, i2)] = kv.slice(i2 + 1); }
    else if (a === '--allow-db') o.allowDb = argv[++i];
    else if (a === '--allow-prod') o.allowProd = true; // R2-B9①：生产显式授权开关（默认仍拒绝非测试库）
    else if (a === '--db-url') o.dbUrl = String(argv[++i] || '');
    // R2-B10②：复用已入库尺子（measure-only-reuse，零模型调用；无 ready 尺子 ⇒ fail-closed needs_rerun）
    else if (a === '--reuse-checker') o.reuseChecker = true;
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
/**
 * R2-B9①：worker 的库授权门（**连库/起子进程之前**判定）。
 *  - 测试库：默认放行（与批 5 行为一致）；
 *  - 其它库（生产）：必须**同时**给 --allow-db <同名> 与 --allow-prod，只给其一仍拒绝（数字 rc=2）。
 */
export function assertWorkerAuthorized({ dbName, allowDb, allowProd }) {
  if (!dbName) return { ok: false, exitCode: 4, code: 'NO_DB_URL', reason: 'no_db_url' };
  if (dbName === 'exam_system_test') return { ok: true, authorizedProd: false, authorization: 'test-db' };
  if (allowDb !== dbName) return { ok: false, exitCode: 2, code: 'REFUSE_PROD_DB', reason: 'allow_db_required:' + dbName };
  if (allowProd !== true) return { ok: false, exitCode: 2, code: 'REFUSE_PROD_DB', reason: 'allow_prod_required:' + dbName };
  return { ok: true, authorizedProd: true, authorization: '--allow-db+--allow-prod' };
}

/**
 * R2-B10①：装置是否是**假装置**（stub）。
 *  - 未给 --device-arg ⇒ 默认装置就是 scripts/stub-device.mjs（假装置）；
 *  - 显式参数里出现 stub-device.mjs（命令或任一参数）⇒ 也算假装置。
 */
export function isStubDevice({ device, deviceArgs } = {}) {
  const cmd = String(device || '');
  const args = deviceArgs && deviceArgs.length ? deviceArgs.join(' ') : '';
  if (/stub-device\.mjs/.test(cmd) || /stub-device\.mjs/.test(args)) return true;
  return !(deviceArgs && deviceArgs.length); // 默认值即 stub
}

/** 生产防呆：授权到生产库时，假装置必须 fail-closed（绝不把假分写进生产） */
export function assertDeviceAllowedOnProd({ dbName, device, deviceArgs, testDb = 'exam_system_test' } = {}) {
  if (dbName === testDb) return { ok: true };
  if (isStubDevice({ device, deviceArgs })) {
    return { ok: false, exitCode: 2, code: 'REFUSE_STUB_DEVICE_ON_PROD', reason: 'device_is_stub:must_pass_real_device_args' };
  }
  return { ok: true };
}

const url = opts.dbUrl || testDbUrl();
if (!url) { console.log('RESULT=NO_DB_URL'); process.exit(4); }
const dbName = new URL(url).pathname.replace(/^\//, '');
const guard = assertWorkerAuthorized({ dbName, allowDb: opts.allowDb, allowProd: opts.allowProd });
if (!guard.ok) {
  console.log('RESULT=' + guard.code + ' reason=' + guard.reason);
  console.log('REFUSED_BEFORE_CONNECT=yes target_db=' + dbName);
  process.exit(Number.isFinite(Number(guard.exitCode)) ? Number(guard.exitCode) : 2); // 数字退出码
}
// ★R2-B10①：生产 + 假装置 ⇒ fail-closed（在任何连接/领取 job/写库之前）
const deviceGuard = assertDeviceAllowedOnProd({ dbName, device: opts.device, deviceArgs: opts.deviceArgs });
if (!deviceGuard.ok) {
  console.log('RESULT=' + deviceGuard.code + ' reason=' + deviceGuard.reason + ' target_db=' + dbName);
  console.log('REFUSED_BEFORE_CONNECT=yes target_db=' + dbName);
  console.log('HINT=生产请显式给真实装置：--device bash --device-arg scripts/dsh-grader/run.sh --device-arg --checker-mode --device-arg build-and-measure（或 --reuse-checker 复用已入库尺子）');
  process.exit(Number.isFinite(Number(deviceGuard.exitCode)) ? Number(deviceGuard.exitCode) : 2); // 数字退出码
}

console.log('AUDIT target_db=' + dbName + ' allow_db=' + (opts.allowDb || '(empty)') + ' allow_prod=' + (opts.allowProd ? 'yes' : 'no') + ' authorization=' + guard.authorization + ' authorized_prod=' + (guard.authorizedProd ? 'yes' : 'no'));
console.log('STAGE=connect target_db=' + dbName); // ★机制标记：只有越过守卫才会打印

const prisma = new PrismaClient({ datasources: { db: { url } } });
const config = parseWorkerConfig();
const stopSignal = { stopped: false };
let signalled = null;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { signalled = sig; stopSignal.stopped = true; console.log('WORKER_SIGNAL=' + sig + '（跑完当前 job 后退出）'); });
}

// R2-B9②：平台模型/端点（DB → env；未配置则不注入）
const platform = await readPlatformLlmConfig(prisma);
const llmDesc = describeLlmConfig(platform);
console.log('PLATFORM_MODEL=' + llmDesc.platformModel + ' PLATFORM_BASE_URL=' + llmDesc.platformBaseUrl);

// R2-B17：僵尸回收阈值（env DSH_WORKER_STALE_RUNNING_MS ⇒ config；缺省 15 分钟）
const staleMs = config.staleRunningMs === undefined ? resolveStaleMs(process.env) : config.staleRunningMs;
// ★R2-B18/O-2：单 job 超时上限 ≥ 回收阈值 ⇒ 显式告警（避免「仍在跑却被回收」）
// ★R2-B19：时钟异常容差（env DSH_WORKER_CLOCK_TOLERANCE_MS ⇒ config；缺省 60 秒）
const clockToleranceMs = config.clockToleranceMs === undefined ? resolveClockToleranceMs(process.env) : config.clockToleranceMs;
const staleWarn = checkTimeoutVsStale({ timeoutMs: opts.timeoutMs, staleMs });
if (staleWarn) console.log(staleWarn.message);

// ★R2-B21：按 job 解析该作业物料目录（env DSH_GRADER_MATERIALS_ROOT；空 ⇒ 沿用装置默认源目录）
const materialsRoot = String(process.env[MATERIALS_ROOT_ENV] || '').trim() || null;

const device = opts.device || 'node';
const deviceArgs = opts.deviceArgs.length ? opts.deviceArgs : [path.join(SERVER, 'scripts', 'stub-device.mjs')];
console.log('WORKER_START db=/' + dbName + ' idle_backoff_ms=' + config.idleBackoffMs + ' max_backoff_ms=' + config.maxBackoffMs
  + ' failure_backoff_ms=' + config.failureBackoffMs + ' max_consecutive_failures=' + config.maxConsecutiveFailures
  + ' db_limit=' + (config.dbLimit === undefined ? 'auto' : config.dbLimit) + ' stale_running_ms=' + staleMs + ' clock_tolerance_ms=' + clockToleranceMs + ' ' + formatMaterialsRoot(materialsRoot) + ' device=' + device);
console.log('AUTO_GRADE=' + (config.autoGrade ? 'on' : 'off') + ' lookback_days=' + config.autoGradeLookbackDays
  + ' scan_ms=' + config.autoGradeScanMs + ' limit=' + config.autoGradeLimit
  + ' schedule=' + (opts.once ? 'once' : 'daemon'));
if (config.autoGrade && opts.reuseChecker) {
  // ★自动造尺 job 必须保留「无尺则造」：--reuse-checker 只约束普通 job（否则新作业永远造不出尺）
  console.log('AUTO_GRADE_BUILD_OVERRIDE=on reason=auto_build_job --reuse-checker 只约束普通 job；自动造尺 job 仍走 build-and-measure');
}

// ★R2-B17：领取第一个 job **之前**回收僵尸 running 行（否则 DB 级闸会被永久占住且静默停摆）
let reclaim;
try {
  reclaim = await reclaimStaleRunning({ prisma, staleMs, clockToleranceMs, maxAttempts: opts.maxAttempts || 3, log: console });
  console.log(formatReclaimSummary(reclaim));
} catch (err) {
  // 回收失败不应拦住窗口：明确记录后继续（连不上库时循环自己会报错，行为与既有版本一致）
  console.log('STALE_RECLAIMED n=0 to_pending=0 to_failed=0 conflicts=0 stale_ms=' + staleMs + ' skipped=reclaim_failed:' + (err && err.message));
}

const res = await runWorkerLoop({
  prisma,
  runOnceImpl: ({ dbLimit }) => runOnce({
    prisma, dbLimit, deviceCommand: device, deviceArgs, stubEnv: opts.stubEnv, extraEnv: llmEnv(platform), reuseChecker: opts.reuseChecker,
    timeoutMs: opts.timeoutMs, materialsRoot, repoRoot: path.resolve(SERVER, '..'),
  }),
  config,
  stopSignal,
  log: console,
  maxIterations: opts.once ? 1 : opts.maxIterations,
  // ★截止后自动为「该教师/该班级/该作业」建会话；造尺/复用由上面的 runOnce 完成
  scanDueImpl: config.autoGrade
    ? ({ prisma: p, log }) => scanDueAssignments({ prisma: p, log, lookbackDays: config.autoGradeLookbackDays, limit: config.autoGradeLimit })
    : null,
});

console.log('WORKER_EXIT=' + res.exitCode + ' iterations=' + res.iterations + ' consumed=' + res.consumed + ' failures=' + res.failures + (signalled ? ' signal=' + signalled : ''));
await prisma.$disconnect();
process.exit(res.exitCode);
