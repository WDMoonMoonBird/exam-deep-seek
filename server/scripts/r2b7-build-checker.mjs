#!/usr/bin/env node
/**
 * r2b7-build-checker.mjs —— R2-B7：运维入口「作业级造尺入库」（补「第一把尺」缺口）。
 *
 * 背景：assignmentGradingController 触发时要求该作业已有 ready checker（否则 409/1011），
 * 而 checker 只能由装置产物入库；此前唯一调用 consumeChecker 的地方是 job worker，job 又只能由触发接口创建
 * ⇒ 循环依赖，第一把尺无法产出。本脚本打通：真实拉起装置（build-and-measure）→ 产物经批 3 消费路径入库。
 *
 * 用法（从 server/ 运行）：
 *   node scripts/r2b7-build-checker.mjs --assignment <id> [--workdir <dir>] [--limit N]
 *        [--device <cmd>] [--device-arg <a>]... [--device-extra-arg <a>]... [--stub-env k=v]... [--timeout-ms N]
 *
 * 装置参数语义（R2-B9③ 澄清）：
 *   --device-arg <a>       **整体替换**默认参数（默认 = run.sh --checker-mode build-and-measure …）；传一个参数会丢掉默认集 ⇒ 慎用。
 *   --device-extra-arg <a> **追加**到默认参数之后（推荐用它微调，例如加 --allow-identical / --source-dir）。
 *   两者同时给出 ⇒ 用法错误 rc=4。
 *        [--dry-run] [--force-checker] [--db-url <url>] [--allow-db <name>] [--allow-prod]
 *
 * 退出码：0 成功；1 装置/消费失败；2 授权拒绝；3 已存在 ready 尺子（需 --force-checker）；4 用法错误。
 *
 * 铁律：
 *  - 授权拒绝发生在**建立任何连接、启动任何子进程之前**（打印 REFUSED_BEFORE_CONNECT=yes，无 STAGE=connect）；
 *  - 装置拉起复用批 1 runner（凭据仅经子进程 env、隔离 DSH_HOME、run-root 在 /tmp）；
 *  - 入库复用批 3 consumeChecker + consumeMeasureResults（「不写分」语义原样保留：exit6/score=null/stale/unsupported ⇒ 不写分 + needs_rerun）；
 *  - run-root 与 DSH home **不清理**，路径打印供审计/录制。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { runDshGrader } from '../src/services/dshGraderRunner.js';
import { consumeChecker, consumeMeasureResults } from '../src/services/dshCheckerConsumer.js';
import { persistAnchor } from '../src/services/dshGradingAnchor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..');
const REPO = path.resolve(SERVER, '..');
const TEST_DB = 'exam_system_test';

export function parseArgs(argv) {
  const o = { assignmentId: null, workdir: '', limit: 2, device: 'bash', deviceArgs: null, deviceExtraArgs: [], stubEnv: {}, timeoutMs: 1800000, dryRun: false, forceChecker: false, dbUrl: '', allowDb: '', allowProd: false, runRoot: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--assignment') o.assignmentId = Number(argv[++i]);
    else if (a === '--workdir') o.workdir = String(argv[++i] || '');
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--device') o.device = String(argv[++i] || 'bash');
    else if (a === '--device-arg') { o.deviceArgs = o.deviceArgs || []; o.deviceArgs.push(String(argv[++i] || '')); }
    // R2-B9③：**追加**到默认装置参数之后（不替换默认参数）；与 --device-arg 互斥
    else if (a === '--device-extra-arg') { o.deviceExtraArgs.push(String(argv[++i] || '')); }
    else if (a === '--stub-env') { const kv = String(argv[++i] || ''); const p = kv.indexOf('='); if (p > 0) o.stubEnv[kv.slice(0, p)] = kv.slice(p + 1); }
    else if (a === '--timeout-ms') o.timeoutMs = Number(argv[++i]);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--force-checker') o.forceChecker = true;
    else if (a === '--run-root') o.runRoot = String(argv[++i] || ''); // R2-B8②：复用已有产物入库（跳过装置）
    else if (a === '--db-url') o.dbUrl = String(argv[++i] || '');
    else if (a === '--allow-db') o.allowDb = String(argv[++i] || '');
    else if (a === '--allow-prod') o.allowProd = true;
    else if (a === '--help') { console.log('usage: node scripts/r2b7-build-checker.mjs --assignment <id> [--dry-run] [--force-checker] [--allow-db <name>] [--allow-prod]'); return { help: true }; }
    else return { error: 'unknown_arg:' + a };
  }
  return o;
}

export function dbNameOf(url) {
  try { return new URL(url).pathname.replace(/^\//, ''); } catch { return ''; }
}

/** R2-B7 授权门（连库/起进程之前）：测试库默认放行；其它库需 --allow-db <同名> 且 --allow-prod 同时给出 */
export function assertAuthorized({ dbName, allowDb, allowProd }) {
  if (!dbName) return { ok: false, exitCode: 4, code: 'USAGE_ERROR', reason: 'no_db_url' };
  if (dbName === TEST_DB) return { ok: true, authorizedProd: false, authorization: 'test-db' };
  if (allowDb !== dbName) return { ok: false, exitCode: 2, code: 'REFUSE_PROD_DB', reason: 'allow_db_required:' + dbName };
  if (allowProd !== true) return { ok: false, exitCode: 2, code: 'REFUSE_PROD_DB', reason: 'allow_prod_required:' + dbName };
  return { ok: true, authorizedProd: true, authorization: '--allow-db+--allow-prod' };
}

/** R2-B9③：装置参数解析 —— 给了 --device-arg 则**整体替换**（既有语义不变）；否则 默认参数 + --device-extra-arg（追加） */
export function resolveDeviceArgs({ deviceArgs, deviceExtraArgs = [] } = {}, { limit, workdir }) {
  if (deviceArgs && deviceArgs.length) return deviceArgs.slice();
  return [...defaultDeviceArgs({ limit, workdir }), ...deviceExtraArgs];
}

export function defaultDeviceArgs({ limit, workdir }) {
  return ['scripts/dsh-grader/run.sh', '--checker-mode', 'build-and-measure', '--submissions', String(limit), '--workdir', workdir, '--timeout', '1800'];
}

export function parseDeviceSummary(stdout) {
  const out = String(stdout || '');
  const num = (re) => { const m = out.match(re); return m ? Number(m[1]) : null; };
  return {
    modelCalls: num(/MODEL_CALLS=(\d+)/),
    assignmentResult: (out.match(/ASSIGNMENT_RESULT=(\S+)/) || [])[1] || null,
    checkerId: (out.match(/CHECKER_ID_FILLED=(sha256:[0-9a-f]+)/) || [])[1] || null,
    runExit: num(/RUN_EXIT=(\d+)/),
  };
}

/** 稳健派生：把 URL 的库名（pathname 首段）替换为测试库；解析失败返回空串 */
export function toTestDbUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    const segs = u.pathname.replace(/^\//, "").split("/");
    if (!segs.length || !segs[0]) return "";
    segs[0] = TEST_DB;
    u.pathname = "/" + segs.join("/");
    return u.toString();
  } catch { return ""; }
}

function testDbUrl() {
  const source = process.env.DATABASE_URL || (() => {
    const env = fs.readFileSync(path.join(SERVER, ".env"), "utf8");
    const m = env.match(/^DATABASE_URL=(.*)$/m);
    return m ? m[1].trim() : "";
  })();
  return toTestDbUrl(source);
}

/** R2-B8①：平台配置的模型/端点（system_configs → env；都没有则返回空 ⇒ 装置侧保持默认） */
export async function readPlatformLlmConfig(prisma, env = process.env) {
  let model = env.DEEPSEEK_MODEL || '';
  let baseUrl = env.DEEPSEEK_BASE_URL || '';
  try {
    const rows = await prisma.$queryRawUnsafe("SELECT `key`, `value` FROM system_configs WHERE `key` IN ('deepseek_model','deepseek_base_url')");
    for (const r of rows || []) {
      if (r.key === 'deepseek_model' && r.value) model = String(r.value);
      if (r.key === 'deepseek_base_url' && r.value) baseUrl = String(r.value);
    }
  } catch { /* 读不到就用 env/默认 */ }
  return { model, baseUrl };
}

/** 消费 + 打印 SUMMARY（装置路径与 --run-root 复用路径共用，保证 SUMMARY 口径一致） */
async function consumeAndSummarize({ prisma, runRoot, assignmentId, questionId, modelCalls, device }) {
  const stored = await consumeChecker({ prisma, runRoot, assignmentId, questionId, repoRoot: REPO });
  if (!stored.ok) {
    console.log('RESULT=CHECKER_NOT_CONSUMED reason=' + stored.reason + ' violations=' + JSON.stringify(stored.violations || []));
    console.log('SUMMARY_BEGIN');
    console.log('ASSIGNMENT=' + assignmentId);
    console.log('CHECKER_ID=(none)');
    console.log('CONSUMED=0');
    console.log('WRITTEN=0');
    console.log('NEEDS_RERUN=0');
    console.log('MODEL_CALLS=' + (modelCalls || 0));
    console.log('SUMMARY_END');
    return 1;
  }
  // ★R2-B14①：入库时持久化作业锚点（供后续复用回填）
  const anchorSaved = await persistAnchor({ prisma, assignmentId, checkerId: stored.checkerId, runRoot });
  console.log('ANCHOR_PERSISTED=' + (anchorSaved.persisted ? 'yes' : 'no') + (anchorSaved.persisted ? ' frozen_sha256=' + (anchorSaved.frozenSha256 || 'na') + ' ANCHOR_RAW_PERSISTED=' + (anchorSaved.rawBytes > 0 ? 'yes bytes=' + anchorSaved.rawBytes + ' sha256=' + anchorSaved.rawSha256 : 'no') : ' reason=' + anchorSaved.reason));

  const consumed = await consumeMeasureResults({ prisma, runRoot, assignmentId });
  const needsRerun = consumed.skipped.filter((r) => r.status === 'needs_rerun').length;
  console.log('SUMMARY_BEGIN');
  console.log('ASSIGNMENT=' + assignmentId);
  console.log('CHECKER_ID=' + stored.checkerId);
  console.log('CONSUMED=' + consumed.rows.length);
  console.log('WRITTEN=' + consumed.written);
  console.log('NEEDS_RERUN=' + needsRerun);
  console.log('MODEL_CALLS=' + (modelCalls || 0));
  console.log('SUMMARY_END');
  console.log('KEPT_RUN_ROOT=' + runRoot + '（现场保留，未清理）');
  return 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return 0;
  if (opts.error) { console.log('RESULT=USAGE_ERROR reason=' + opts.error); return 4; }
  if (!Number.isFinite(opts.assignmentId) || opts.assignmentId < 1) { console.log('RESULT=USAGE_ERROR reason=assignment_required'); return 4; }
  // ★--run-root 与 --device-arg 互斥（前者跳过装置，后者是装置参数）
  if (opts.runRoot && ((opts.deviceArgs && opts.deviceArgs.length) || opts.deviceExtraArgs.length)) { console.log('RESULT=USAGE_ERROR reason=run_root_conflicts_with_device_arg'); return 4; }
  // ★--device-arg（整体替换默认参数）与 --device-extra-arg（追加）互斥，避免语义歧义
  if (opts.deviceArgs && opts.deviceArgs.length && opts.deviceExtraArgs.length) { console.log('RESULT=USAGE_ERROR reason=device_arg_conflicts_with_device_extra_arg'); return 4; }

  const url = opts.dbUrl || testDbUrl();
  const dbName = dbNameOf(url);
  // ★R2-B12 补充（t55 复核）：--workdir 的相对值同样要绝对化（与 --run-root 口径一致），
  //   否则 cd server 后用相对路径 ⇒ 装置 cwd=仓库根 ⇒ 目录错位（RUN_ROOT 原样透传、孤儿目录落在 server/ 下）。
  const workdir = opts.workdir ? path.resolve(opts.workdir) : path.join('/tmp', 'r2b7-checker-' + opts.assignmentId + '-' + Date.now());
  const home = path.join(workdir, 'home');

  // ★守卫：连库/起进程之前
  const guard = assertAuthorized({ dbName, allowDb: opts.allowDb, allowProd: opts.allowProd });
  if (!guard.ok) {
    console.log('RESULT=' + guard.code + ' reason=' + guard.reason);
    console.log('REFUSED_BEFORE_CONNECT=yes target_db=' + dbName);
    console.log('PLAN assignment=' + opts.assignmentId + ' workdir=' + workdir + ' dry_run=' + (opts.dryRun ? 'yes' : 'no'));
    return guard.exitCode; // 数字 2 / 4
  }
  console.log('AUDIT target_db=' + dbName + ' allow_db=' + (opts.allowDb || '(empty)') + ' allow_prod=' + (opts.allowProd ? 'yes' : 'no') + ' authorization=' + guard.authorization + ' authorized_prod=' + (guard.authorizedProd ? 'yes' : 'no'));

  if (opts.dryRun) {
    console.log('DRY_RUN=yes（不连库、不启动装置、不写库）');
    console.log('PLAN assignment=' + opts.assignmentId + ' db=' + dbName + ' workdir=' + workdir + ' limit=' + opts.limit
      + ' device=' + opts.device + ' device_args=' + JSON.stringify(resolveDeviceArgs(opts, { limit: opts.limit, workdir }))
      + ' force_checker=' + (opts.forceChecker ? 'yes' : 'no'));
    console.log('RUN_ROOT=' + workdir + ' (dry-run：尚未创建)');
    console.log('DSH_HOME=' + home + ' (dry-run：尚未创建)');
    console.log('SUMMARY_BEGIN');
    console.log('ASSIGNMENT=' + opts.assignmentId);
    console.log('CHECKER_ID=(dry-run)');
    console.log('CONSUMED=0');
    console.log('WRITTEN=0');
    console.log('NEEDS_RERUN=0');
    console.log('MODEL_CALLS=0');
    console.log('SUMMARY_END');
    return 0;
  }

  console.log('STAGE=connect target_db=' + dbName); // ★机制标记：只有越过守卫才会打印
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let deviceRan = false;
  let assignment = null;
  try {
    assignment = await prisma.assignment.findUnique({ where: { id: opts.assignmentId }, select: { id: true, title: true } });
  } catch (err) {
    console.log("CONNECT_FAILED=yes stage=connect reason=" + (err && (err.message || err.name)));
    console.log("RESULT=FAILED stage=connect");
    await prisma.$disconnect().catch(() => {});
    return 1;
  }
  try {
    if (!assignment) { console.log('RESULT=ASSIGNMENT_NOT_FOUND assignment=' + opts.assignmentId); return 1; }
    const links = await prisma.assignmentQuestion.findMany({ where: { assignmentId: opts.assignmentId }, select: { questionId: true } });
    const questionId = links.length ? links[0].questionId : null;

    // R2-B8①：解析平台配置的模型/端点（system_configs → env → 不提供⇒装置侧保持默认）
    const platform = await readPlatformLlmConfig(prisma);
    console.log('PLATFORM_MODEL=' + (platform.model || '(unset:device-default)'));
    console.log('PLATFORM_BASE_URL=' + (platform.baseUrl || '(unset:device-default)'));

    // R2-B8②：--run-root 复用已有产物（跳过装置）；先校验产物存在，绝不静默成功
    if (opts.runRoot) {
      const rr = path.resolve(opts.runRoot);
      const ck = path.join(rr, 'out', 'checker', 'checker.json');
      if (!fs.existsSync(ck)) {
        console.log('RESULT=RUN_ROOT_INVALID reason=checker_json_missing expected=' + ck);
        console.log('SUMMARY_BEGIN');
        console.log('ASSIGNMENT=' + opts.assignmentId);
        console.log('CHECKER_ID=(none)');
        console.log('CONSUMED=0');
        console.log('WRITTEN=0');
        console.log('NEEDS_RERUN=0');
        console.log('MODEL_CALLS=0');
        console.log('SUMMARY_END');
        return 1;
      }
      console.log('RUN_ROOT=' + rr + ' (复用已有产物，未启动装置)');
      console.log('DSH_HOME=(reuse: 未创建隔离 home)');
      const kept = await consumeAndSummarize({ prisma, runRoot: rr, assignmentId: opts.assignmentId, questionId, modelCalls: 0 });
      return kept;
    }

    const existing = await prisma.gradingChecker.findFirst({ where: { assignmentId: opts.assignmentId, status: 'ready' }, orderBy: { id: 'desc' }, select: { checkerId: true } });
    if (existing && !opts.forceChecker) {
      console.log('RESULT=CHECKER_ALREADY_READY checker_id=' + existing.checkerId + ' hint=--force-checker');
      console.log('SUMMARY_BEGIN');
      console.log('ASSIGNMENT=' + opts.assignmentId);
      console.log('CHECKER_ID=' + existing.checkerId);
      console.log('CONSUMED=0');
      console.log('WRITTEN=0');
      console.log('NEEDS_RERUN=0');
      console.log('MODEL_CALLS=0');
      console.log('SUMMARY_END');
      return 3;
    }

    // 现场保留：run-root 与隔离 home 不清理
    fs.mkdirSync(workdir, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    console.log('RUN_ROOT=' + workdir);
    console.log('DSH_HOME=' + home);

    const deviceArgs = resolveDeviceArgs(opts, { limit: opts.limit, workdir });
    console.log('STAGE=device command=' + opts.device + ' args=' + JSON.stringify(deviceArgs));
    const res = await runDshGrader({
      command: opts.device,
      args: deviceArgs,
      runRoot: workdir,
      cwd: REPO,
      timeoutMs: opts.timeoutMs,
      extraEnv: {
        DSH_HOME: home,
        // R2-B8①：只在平台配置提供时才传（否则不传 ⇒ 装置侧保持 deepseek-flash / 官方端点默认）
        ...(platform.model ? { DEEPSEEK_MODEL: platform.model } : {}),
        ...(platform.baseUrl ? { DEEPSEEK_BASE_URL: platform.baseUrl } : {}),
        ...opts.stubEnv,
      },
    });
    deviceRan = true;
    const dev = parseDeviceSummary(res.stdout);
    console.log('DEVICE exit=' + res.exitCode + ' timed_out=' + res.timedOut + ' stdout_len=' + String(res.stdout || '').length);

    const stored = await consumeChecker({ prisma, runRoot: workdir, assignmentId: opts.assignmentId, questionId, repoRoot: REPO });
    if (!stored.ok) {
      console.log('RESULT=CHECKER_NOT_CONSUMED reason=' + stored.reason + ' violations=' + JSON.stringify(stored.violations || []));
      console.log('SUMMARY_BEGIN');
      console.log('ASSIGNMENT=' + opts.assignmentId);
      console.log('CHECKER_ID=(none)');
      console.log('CONSUMED=0');
      console.log('WRITTEN=0');
      console.log('NEEDS_RERUN=0');
      console.log('MODEL_CALLS=' + (dev.modelCalls == null ? 0 : dev.modelCalls));
      console.log('SUMMARY_END');
      return Number(res.exitCode) === 5 || Number(res.exitCode) === 6 ? 1 : 1;
    }
    const consumed = await consumeMeasureResults({ prisma, runRoot: workdir, assignmentId: opts.assignmentId });
    const needsRerun = consumed.skipped.filter((r) => r.status === 'needs_rerun').length;

    console.log('SUMMARY_BEGIN');
    console.log('ASSIGNMENT=' + opts.assignmentId);
    console.log('CHECKER_ID=' + stored.checkerId);
    console.log('CONSUMED=' + consumed.rows.length);
    console.log('WRITTEN=' + consumed.written);
    console.log('NEEDS_RERUN=' + needsRerun);
    console.log('MODEL_CALLS=' + (dev.modelCalls == null ? 0 : dev.modelCalls));
    console.log('SUMMARY_END');
    console.log('KEPT_RUN_ROOT=' + workdir + ' KEPT_DSH_HOME=' + home + '（现场保留，未清理）');
    return 0;
  } catch (err) {
    console.log('RESULT=FAILED stage=' + (deviceRan ? 'consume' : 'device') + ' reason=' + (err && err.message));
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('r2b7-build-checker.mjs');
if (invokedDirectly) {
  const exitWith = (c) => process.exit(Number.isFinite(Number(c)) ? Number(c) : 1);
  main().then(exitWith).catch((e) => { console.error('BUILD_CHECKER_ERROR ' + (e && e.message)); exitWith(1); });
}
