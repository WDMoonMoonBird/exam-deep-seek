/**
 * dshGradingJobWorker.js —— R2-B4（W7 续）：pending job 的消费执行器。
 *
 * 铁律：
 *  1) 并发闸 = dsh_grading_concurrency（默认 1，见 infrastructure/ai/deepseek/config.js）：闸满时**不领取** job
 *     （job 保持 pending 排队），绝不并发拉起装置；跑完在 finally 释放。
 *  2) 原子领取：单条 UPDATE … WHERE id=? AND status='pending' ⇒ affectedRows=1 才算领到，
 *     同一 job 不可能被两个 worker 同时消费。
 *  3) 不写分语义沿用批 3：装置 exit 5/6、产物缺失、全部 needs_rerun ⇒ job 标 needs_rerun（**不写分、不落 0 分**）。
 *  4) 超时 ⇒ kill + 释放闸 + attempts 递增 + 回到 pending（可重试）；超过 maxAttempts ⇒ failed。
 *  5) 安全：装置在隔离 DSH_HOME 下运行（env 注入），凭据只经子进程 env（批 1 runner），run-root 在 /tmp。
 */
import fs from 'fs';
import path from 'path';
import { runDshGrader } from './dshGraderRunner.js';
import { consumeChecker, consumeMeasureResults, resolveCheckerPath } from './dshCheckerConsumer.js';
import { materializeAnchor, persistAnchor } from './dshGradingAnchor.js';
import { fileURLToPath } from 'url';
import { getDshGradingConcurrency } from '../infrastructure/ai/deepseek/config.js';

/** server/ 目录（相对装置参数的次级基准：平台自带脚本如 scripts/stub-device.mjs） */
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
import logger from '../utils/logger.js';

export const JOB_STATUS = { pending: 'pending', running: 'running', done: 'done', failed: 'failed', needsRerun: 'needs_rerun' };

/** R2-B10②：复用模式常量与装置约定路径（以 scripts/dsh-grader 代码为准：
 *  run.sh 在 measure-only-reuse 下**不清 out/**，并按 --checker 复制到 out/checker/checker.json；
 *  lib_assignment.sh 的作业级流程读 out/assignment/checker.frozen.json。 */
export const REUSE_CHECKER_MODE = 'measure-only-reuse';
export const CHECKER_FROZEN_REL = 'out/assignment/checker.frozen.json';
export const CHECKER_JSON_REL = 'out/checker/checker.json';

/** 装置输出的落盘文件名（R2-B13②：失败可诊断，不必手工复现） */
export const DEVICE_LOG_FILES = { stdout: 'out/device.stdout.log', stderr: 'out/device.stderr.log' };

/** 凭据兜底脱敏：任何形如 sk-xxxx 的串都替换为 [redacted:sk-***]（沿用既有 sk- 扫描口径） */
export function redactSecrets(text) {
  return String(text ?? '').replace(/sk-[A-Za-z0-9_-]{6,}/g, '[redacted:sk-***]');
}

/** 只保留尾部 capBytes 字节（避免大日志撑爆磁盘；保留尾部因为错误在末尾） */
export function tailTruncate(text, capBytes = 262144) {
  const s = String(text ?? '');
  if (Buffer.byteLength(s, 'utf8') <= capBytes) return s;
  return '…[truncated head]…' + String.fromCharCode(10) + Buffer.from(s, 'utf8').subarray(-capBytes).toString('utf8');
}

/** ★R2-B13②：把装置 stdout/stderr 落盘到 run-root（out/device.{stdout,stderr}.log），返回路径 */
export function persistDeviceLogs({ runRoot, stdout = '', stderr = '', capBytes = 262144 } = {}) {
  const dir = path.join(runRoot, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const paths = { stdout: path.join(runRoot, DEVICE_LOG_FILES.stdout), stderr: path.join(runRoot, DEVICE_LOG_FILES.stderr) };
  fs.writeFileSync(paths.stdout, tailTruncate(redactSecrets(stdout), capBytes));
  fs.writeFileSync(paths.stderr, tailTruncate(redactSecrets(stderr), capBytes));
  return paths;
}

/** ★R2-B13②：从装置输出提取「可诊断尾巴」（优先 stderr 末 N 行非空行，回退 stdout），供 last_error 使用 */
export function errorTail({ stderr = '', stdout = '', lines = 2, maxChars = 300 } = {}) {
  const pick = (t) => String(redactSecrets(t ?? '')).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(-lines).join(' | ');
  const tail = pick(stderr) || pick(stdout);
  return tail.length > maxChars ? tail.slice(-maxChars) : tail;
}

/** R2-B12①：把**本次 run-root** 作为 `--workdir` 传给装置。
 *  装置 run.sh 不读 GRADER_RUN_ROOT（未给 --workdir 时自己 mktemp -d）⇒ 产物会落到别处、
 *  frozen 尺子也不在装置的 workdir 里 ⇒ 闸判不合格（exit 5）。本函数剥掉已有 --workdir 再追加本次 run-root。 */
export function withWorkdirArg(args = [], workdir) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir') { i++; continue; }
    out.push(args[i]);
  }
  return [...out, '--workdir', String(workdir)];
}

/** 复用模式的装置参数：剥掉已有的 --checker/--checker-mode，再追加复用两项（顺序稳定，便于断言） */
export function withReuseCheckerArgs(args = [], checkerPath) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--checker') { i++; continue; }
    if (args[i] === '--checker-mode') { i++; continue; }
    out.push(args[i]);
  }
  return [...out, '--checker', checkerPath, '--checker-mode', REUSE_CHECKER_MODE];
}

/** R2-B11：装置参数里的**相对路径**绝对化（相对仓库根解析；仅当目标确实存在时才替换，避免误改普通值）。
 *  背景：worker 曾未给子进程传 cwd ⇒ 相对路径 `scripts/dsh-grader/run.sh` 在 server/ 下解析失败 ⇒ bash exit 127。
 *  本函数与 cwd 双保险：即使调用方 cwd 不对，脚本路径也不会再解析错。 */
export const DEVICE_PATH_FLAGS = new Set(['--workdir', '--checker', '--source-dir', '--checker-out', '--out', '--manifest']);

export function absolutizeDeviceArgs(args = [], repoRoot, extraBases = [SERVER_DIR]) {
  // 基准顺序：仓库根优先（装置脚本 scripts/dsh-grader/… 以仓库根为准），其次 server/（平台自带脚本 scripts/stub-device.mjs）
  const bases = [path.resolve(repoRoot || process.cwd()), ...extraBases.map((b) => path.resolve(b))];
  const resolveRel = (p) => {
    for (const b of bases) { try { if (fs.existsSync(path.join(b, p))) return path.join(b, p); } catch { /* ignore */ } }
    return null;
  };
  const exists = (p) => resolveRel(p) !== null;
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (DEVICE_PATH_FLAGS.has(a) && i + 1 < args.length) {
      const v = args[i + 1];
      out.push(a, path.isAbsolute(v) ? v : (resolveRel(v) || v));
      i++;
      continue;
    }
    if (!a.startsWith('-') && !path.isAbsolute(a)) { const abs = exists(a) ? resolveRel(a) : null; if (abs) { out.push(abs); continue; } }
    out.push(a);
  }
  return out;
}

/** 把已入库的尺子落位到 run-root（两条路径都写；返回传给 --checker 的路径） */
export function placeCheckerFiles({ runRoot, checkerJson }) {
  const body = typeof checkerJson === 'string' ? checkerJson : JSON.stringify(checkerJson, null, 2);
  const frozen = path.join(runRoot, CHECKER_FROZEN_REL);
  fs.mkdirSync(path.dirname(frozen), { recursive: true });
  fs.writeFileSync(frozen, body);
  const plain = path.join(runRoot, CHECKER_JSON_REL);
  fs.mkdirSync(path.dirname(plain), { recursive: true });
  fs.writeFileSync(plain, body);
  return frozen;
}
export const DEFAULT_MAX_ATTEMPTS = 3;

/** 并发闸（FIFO；tryAcquire 失败 ⇒ 调用方不得领取 job） */
export function createGate(limit = 1) {
  const cap = Math.max(1, Math.floor(Number(limit) || 1));
  let active = 0;
  const queue = [];
  return {
    get limit() { return cap; },
    get active() { return active; },
    get waiting() { return queue.length; },
    tryAcquire() { if (active < cap) { active += 1; return true; } return false; },
    async acquire() {
      if (active < cap) { active += 1; return; }
      await new Promise((resolve) => queue.push(resolve));
      active += 1;
    },
    release() {
      if (active > 0) active -= 1;
      const next = queue.shift();
      if (next) next();
    },
  };
}

/** 原子领取：先选候选，再用单条条件 UPDATE 抢（affectedRows=1 才算领到） */
export function buildClaimSql({ hasDbGate }) {
  const base = 'UPDATE grading_jobs SET status = \'running\', attempts = attempts + 1, last_error = NULL, '
    + 'updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = \'pending\'';
  if (!hasDbGate) return base;
  // ★R2-B5 DB 级闸：同一语句内要求「当前 running 行数 < limit」⇒ 多进程下也不超发。
  //   MySQL 不允许 UPDATE 的子查询直接引用目标表 ⇒ 用派生表包一层（经典合法写法）。
  return base + ' AND (SELECT COUNT(*) FROM (SELECT id FROM grading_jobs WHERE status = \'running\') AS r) < ?';
}

/**
 * 原子领取（+ 可选 DB 级闸）。
 * @param {{prisma:object, jobId?:number|null, dbLimit?:number|null}} args
 */
export async function claimJobAtomic({ prisma, jobId = null, dbLimit = null }) {
  let candidateId = jobId ? Number(jobId) : null;
  if (!candidateId) {
    const cand = await prisma.gradingJob.findFirst({ where: { status: JOB_STATUS.pending }, orderBy: { id: 'asc' }, select: { id: true } });
    if (!cand) return null;
    candidateId = cand.id;
  }
  const useGate = Number.isFinite(Number(dbLimit)) && Number(dbLimit) > 0;
  const sql = buildClaimSql({ hasDbGate: useGate });
  const affected = useGate
    ? await prisma.$executeRawUnsafe(sql, candidateId, Number(dbLimit))
    : await prisma.$executeRawUnsafe(sql, candidateId);
  if (Number(affected) !== 1) return null; // 已被别的 worker 领走 / DB 级闸已满 ⇒ 不消费
  return prisma.gradingJob.findUnique({ where: { id: candidateId } });
}

/**
 * 记账（R2-B12③：不再因唯一键冲突 P2002 而炸）。
 *  - 新活动键方案下，终态（done/failed/needs_rerun）可多行共存 ⇒ 正常路径不会 P2002；
 *  - 仍保留兜底：若命中 P2002（老 schema 或极端竞态），退化为「只写计数与原因、不改状态」重试一次，
 *    并打印 FINISH_P2002_RETRY 供排障；再失败则抛出（不静默吞）。
 */
export async function finishJob({ prisma, jobId, status, written = 0, skipped = 0, error = null }) {
  const data = { status, writtenCount: written, skippedCount: skipped, lastError: error };
  try {
    return await prisma.gradingJob.update({ where: { id: +jobId }, data });
  } catch (err) {
    if (err && err.code === 'P2002') {
      console.log('FINISH_P2002_RETRY job=' + jobId + ' status=' + status + ' error=' + (err && err.message));
      logger.warn({ jobId, status }, 'R2-B12：记账命中唯一键冲突 ⇒ 退化为只写计数重试一次');
      await new Promise((r) => setTimeout(r, 50));
      return prisma.gradingJob.update({ where: { id: +jobId }, data: { writtenCount: written, skippedCount: skipped, lastError: error } });
    }
    throw err;
  }
}

/**
 * 消费一个 job（默认取最早的 pending）。
 * @returns {{consumed:boolean, reason?:string, jobId?:number, status?:string, written?:number, skipped?:number, runRoot?:string, exitCode?:number, timedOut?:boolean}}
 */
export async function runOnce({
  prisma, jobId = null, gate = null, dbLimit = undefined, deviceCommand, deviceArgs = [], stubEnv = {}, extraEnv = {}, reuseChecker = false,
  runRootBase = '/tmp', timeoutMs = 600000, maxAttempts = DEFAULT_MAX_ATTEMPTS,
  repoRoot = path.resolve(process.cwd(), '..'), deps = {},
} = {}) {
  const limit = await getDshGradingConcurrency();
  const g = gate || createGate(limit);
  if (!g.tryAcquire()) {
    return { consumed: false, reason: 'gate_full', active: g.active, limit: g.limit };
  }
  try {
    // 进程内闸（第一层）+ DB 级闸（第二层，多进程也生效）：默认都用 dsh_grading_concurrency
    const job = await claimJobAtomic({ prisma, jobId, dbLimit: dbLimit === undefined ? limit : dbLimit });
    if (!job) return { consumed: false, reason: 'no_pending_job' };

    const runRoot = path.join(runRootBase, 'r2b4-job-' + job.id + '-' + Date.now());
    fs.mkdirSync(runRoot, { recursive: true });
    const home = path.join(runRoot, 'home');
    fs.mkdirSync(home, { recursive: true });

    // R2-B10②：复用已入库尺子（measure-only-reuse，零模型调用、尺子不变）
    let reuse = null;
    let runArgs = deviceArgs;
    // 容错：老测试的 fake prisma 没有 gradingChecker（抛错 ⇒ 视为「无 ready 尺子」，不改写既有语义）
    let readyChecker = null;
    try {
      readyChecker = await prisma.gradingChecker.findFirst({
        where: { assignmentId: job.assignmentId, status: 'ready' }, orderBy: { id: 'desc' },
        select: { checkerId: true, checkerJson: true },
      });
    } catch (err) {
      readyChecker = null;
      logger.warn({ jobId: job.id, err: err && err.message }, 'R2-B10：查询 ready 尺子失败 ⇒ 视为无尺子');
    }
    if (reuseChecker) {
      if (!readyChecker) {
        console.log('CHECKER_REUSE=none checker_id=(none) reason=no_ready_checker_for_assignment job=' + job.id);
        await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'no_ready_checker_for_assignment' });
        logger.warn({ jobId: job.id, assignmentId: job.assignmentId }, 'R2-B10：该作业无 ready 尺子 ⇒ fail-closed 标 needs_rerun（不跑装置、零成本）');
        return { consumed: true, jobId: job.id, runRoot, status: JOB_STATUS.needsRerun, reason: 'no_ready_checker', reuse: { applied: false, reason: 'no_ready_checker_for_assignment' } };
      }
      const frozenPath = placeCheckerFiles({ runRoot, checkerJson: readyChecker.checkerJson });
      runArgs = withReuseCheckerArgs(deviceArgs, frozenPath);
      reuse = { applied: true, checkerId: readyChecker.checkerId, mode: REUSE_CHECKER_MODE, frozenPath };
      console.log('CHECKER_REUSE=applied checker_id=' + readyChecker.checkerId + ' mode=' + REUSE_CHECKER_MODE + ' frozen=' + frozenPath + ' job=' + job.id);
      logger.info({ jobId: job.id, checkerId: readyChecker.checkerId, mode: REUSE_CHECKER_MODE }, 'R2-B10：复用已入库尺子（零模型调用）');
    } else if (readyChecker) {
      console.log('HINT=ready_checker_exists_consider_--reuse-checker checker_id=' + readyChecker.checkerId + ' job=' + job.id);
    }

    // ★R2-B14②：复用拉起装置前回填作业锚点（恢复装置 frozen_intact 预检与 ASSIGNMENT_FROZEN_SHA256）
    const anchor = await materializeAnchor({ prisma, assignmentId: job.assignmentId, checkerId: job.checkerId, runRoot });
    console.log(anchor.materialized
      ? 'ANCHOR_MATERIALIZED=yes target=' + anchor.target + ' frozen_sha256=' + (anchor.frozenSha256 || 'na') + ' bytes=' + anchor.bytes + ' written_sha256=' + anchor.sha256 + ' sha_matches_anchor=' + (anchor.shaMatchesAnchor ? 'yes' : 'no') + ' n_submissions=' + anchor.nSubmissions
      : 'ANCHOR_MATERIALIZED=no reason=' + anchor.reason + '（历史数据：明确记录并继续，不静默装成功）');

    // ★R2-B11：装置必须在**仓库根**下运行（相对装置路径才解析得对）；参数里的相对路径同时绝对化（双保险）
    const repoRootAbs = path.resolve(repoRoot);
    // ★R2-B12①：装置必须在**本次 run-root** 下工作（否则产物/frozen 尺子错位 ⇒ 闸 exit 5、消费失败）
    runArgs = withWorkdirArg(runArgs, runRoot);
    const finalArgs = absolutizeDeviceArgs(runArgs, repoRootAbs);
    const res = await (deps.runDshGrader || runDshGrader)({
      command: deviceCommand || 'node',
      args: finalArgs,
      runRoot,
      cwd: repoRootAbs, // ★R2-B11：此前是 cwd=runRoot ⇒ 相对装置路径（scripts/dsh-grader/run.sh）解析失败 ⇒ bash exit 127
      timeoutMs,
      // R2-B9②：平台模型/端点经 extraEnv 注入（未配置时 extraEnv 为空 ⇒ 行为不变）；stubEnv 最后合并（测试可覆盖）
      extraEnv: { DSH_HOME: home, ...extraEnv, ...stubEnv },
      spawnImpl: deps.spawnImpl,
      logImpl: deps.logImpl || logger,
    });

    // ★R2-B13②：装置输出落盘（失败可诊断）+ 计算可诊断尾巴
    const deviceLogs = persistDeviceLogs({ runRoot, stdout: res.stdout, stderr: res.stderr });
    const tail = errorTail({ stderr: res.stderr, stdout: res.stdout });
    const tailSuffix = tail ? ' :: ' + tail : '';
    console.log('DEVICE_LOGS stdout=' + deviceLogs.stdout + ' stderr=' + deviceLogs.stderr + (tail ? ' tail=' + JSON.stringify(tail) : ''));

    const base = { consumed: true, jobId: job.id, runRoot, exitCode: res.exitCode, timedOut: !!res.timedOut, reuse, deviceLogs };

    if (res.timedOut) {
      const retryable = job.attempts < maxAttempts;
      await finishJob({
        prisma, jobId: job.id,
        status: retryable ? JOB_STATUS.pending : JOB_STATUS.failed,
        error: 'timeout:attempt=' + job.attempts + (retryable ? ':retryable' : ':exhausted') + tailSuffix,
      });
      logger.warn({ jobId: job.id, attempts: job.attempts, retryable }, 'R2-B4：装置超时（kill + 释放闸）');
      return { ...base, status: retryable ? JOB_STATUS.pending : JOB_STATUS.failed, reason: 'timeout', retryable };
    }

    const checkerPath = resolveCheckerPath(runRoot);
    if (!checkerPath) {
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'artifacts_missing:exit=' + res.exitCode + tailSuffix });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'artifacts_missing' };
    }
    if (Number(res.exitCode) === 5 || Number(res.exitCode) === 6) {
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'device_exit_' + res.exitCode + tailSuffix });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'device_exit_' + res.exitCode };
    }
    if (Number(res.exitCode) !== 0) {
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'device_exit_' + res.exitCode + tailSuffix });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'device_exit_' + res.exitCode };
    }

    const stored = await consumeChecker({ prisma, runRoot, assignmentId: job.assignmentId, repoRoot });
    if (!stored.ok) {
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'checker_invalid:' + stored.reason });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'checker_invalid:' + stored.reason };
    }
    // ★R2-B14①：入库时持久化作业锚点（供后续复用回填；upsert 幂等）
    const anchorSaved = await persistAnchor({ prisma, assignmentId: job.assignmentId, checkerId: job.checkerId, runRoot });
    console.log('ANCHOR_PERSISTED=' + (anchorSaved.persisted ? 'yes' : 'no') + (anchorSaved.persisted ? ' frozen_sha256=' + (anchorSaved.frozenSha256 || 'na') + ' n_submissions=' + anchorSaved.nSubmissions + ' ANCHOR_RAW_PERSISTED=' + (anchorSaved.rawBytes > 0 ? 'yes bytes=' + anchorSaved.rawBytes + ' sha256=' + anchorSaved.rawSha256 : 'no') : ' reason=' + anchorSaved.reason));

    const consumed = await consumeMeasureResults({ prisma, runRoot, assignmentId: job.assignmentId });
    const status = consumed.written > 0 ? JOB_STATUS.done : JOB_STATUS.needsRerun;
    await finishJob({
      prisma, jobId: job.id, status,
      written: consumed.written, skipped: consumed.skipped.length,
      error: consumed.written > 0 ? null : 'all_needs_rerun:' + consumed.skipped.map((r) => r.reason).join(','),
    });
    logger.info({ jobId: job.id, status, written: consumed.written, skipped: consumed.skipped.length }, 'R2-B4：job 消费完成');
    return { ...base, status, written: consumed.written, skipped: consumed.skipped.length, checkerId: stored.checkerId };
  } finally {
    g.release();
  }
}
