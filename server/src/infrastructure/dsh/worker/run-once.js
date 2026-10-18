/**
 * worker/run-once.js —— 单次 job 消费（runOnce 外包装 + runOnceInner 主链路）。
 *
 * R2-B65：从 services/dshGradingJobWorker.js（582 行）原样拆出；导出名与语义逐字保留（见 ./index.js barrel）。
 */

import fs from 'fs';
import path from 'path';
import { runDshGrader } from '../device/dshGraderRunner.js';
import { consumeChecker, consumeMeasureResults, resolveCheckerPath } from '../checker/dshCheckerConsumer.js';
import { runSummarySession, recordSummaryUsage } from '../checker/dshSummarySession.js';   // ★R2-B48：第二会话（总评）
import { loadAnchor, materializeAnchor, persistAnchor, readAnchorFromRunRoot } from '../runs/dshGradingAnchor.js';
import { findRulerByContentKey, resolvePollMs, resolveWaitMs, setJobContentKey } from '../ruler/dshRulerStore.js';
import { captureSessionUsage, summarizeUsageForEvidence } from '../usage/dshSessionUsage.js';
import { loadLlmPrices, persistRunUsage } from '../usage/dshRunUsageStore.js';
import {
  bindResolvedRuler, completeClaimedRuler, failClaimedRuler, resolveAssignmentContent,
  resolveRulerForAssignment, writeRulerCheckerFiles,
} from '../ruler/dshRulerAssignment.js';
import { collectRunCountInputs, finalizeRunRoot, persistJobRun, resolveRunCounts, resolveRunsRoot, tailText } from '../runs/dshRunArchiver.js';
import { formatMaterialsMissing, formatMaterialsResolved, resolveMaterialsForAssignment, withMaterialsArgs } from '../materials/dshMaterialsResolver.js';
import { getDshGradingConcurrency } from '../../ai/deepseek/config.js';
import logger from '../../../utils/logger.js';
import { JOB_STATUS, DEFAULT_MAX_ATTEMPTS, claimJobAtomic, createGate, finishJob } from './claim.js';
import { REUSE_CHECKER_MODE, absolutizeDeviceArgs, placeCheckerFiles, withBuildCheckerArgs, withReuseCheckerArgs, withWorkdirArg } from './device-args.js';
import { AUTO_BUILD_CHECKER, isAutoBuildChecker } from './autoBuild.js';
import { AUTO_OPEN_CHECKER, isAutoOpenChecker } from './autoOpen.js';
import { REEXPORT_ENV, alignJobCheckerId, ensureMaterialsForAssignment, logSessionScope } from './autoBuildSession.js';
import { errorTail, persistDeviceLogs } from './device-logs.js';

/**
 * ★O2（R2-B38）：失败原因前缀**幂等** —— reason 已带 `ruler_` 家族前缀（如 store 层 `ruler_failed:<cause>`）时
 * 不再重复拼接，避免 `grading_jobs.last_error` 出现 `ruler_ruler_failed:`（C 的 191-t2-wiring.txt:23 实测）。
 * 未带前缀时仍补 `ruler_`（既有语义与 w58/w59 的 `ruler_failed` 断言逐字不变）。
 */
export function withRulerPrefix(reason) {
  const r = reason === null || reason === undefined || reason === '' ? 'unknown' : String(reason);
  return /^ruler_/.test(r) ? r : 'ruler_' + r;
}

/**
 * 读装置产出的 teardown 证据（<run-root>/out/run-teardown.json）
 */
export function readTeardownEvidence(runRoot) {
  try {
    const p = path.join(runRoot, 'out', 'run-teardown.json');
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  } catch { return null; }
}

/**
 * ★R2-B23：消费一个 job 的**外包装** —— 运行结束后归档证据、落库摘要、按策略处理 run-root。
 * 归档/落库失败都不改变 job 终态（只记日志与 RUN_ARCHIVED 行）。
 */
export async function runOnce(args = {}) {
  const res = await runOnceInner(args);
  if (!res || !res.consumed || !res.jobId || !res.runRoot) return res;
  // ★R2-B36：**销毁会话之前**抽取用量（tokens/缓存命中/工具/费用）⇒ out/session-usage.json + 落库 grading_run_usage。
  //   必须在 finalizeRunRoot（teardown 会删 home/sessions）之前；失败 fail-soft（绝不改 job 终态）。
  try {
    const prices = await loadLlmPrices({ prisma: args.prisma }).catch(() => ({ table: null, source: 'default' }));
    const cap = captureSessionUsage({ runRoot: res.runRoot, priceTable: prices.table, log: console });
    if (cap && cap.usage) {
      res.usage = summarizeUsageForEvidence(cap.usage);
      const persisted = await persistRunUsage({ prisma: args.prisma, runRef: 'job:' + res.jobId, jobId: res.jobId, usage: cap.usage, log: console });
      res.usagePersisted = persisted.ok;
    } else {
      console.log('RUN_USAGE_PERSISTED=no job=' + res.jobId + ' reason=' + ((cap && cap.reason) || 'unknown'));
    }
  } catch (err) {
    console.log('RUN_USAGE_PERSISTED=no job=' + res.jobId + ' reason=' + String(err && err.message).slice(0, 160));
  }
  try {
    const success = res.status === JOB_STATUS.done;
    // ★R2-B27（路线 2）：**先 teardown**（销毁会话+凭据；失败保留现场）⇒ 再归档 ⇒ 成功时清理 run-root
    const purgeWanted = String((args.extraEnv && args.extraEnv.DSH_GRADER_PURGE_HOME) ?? process.env.DSH_GRADER_PURGE_HOME ?? '1') !== '0';
    const keepDays = Number((args.extraEnv && args.extraEnv.DSH_GRADER_SCENE_KEEP_DAYS) ?? process.env.DSH_GRADER_SCENE_KEEP_DAYS ?? 3) || 3;
    // ★R2-B30/B31：计数映射必须在 teardown/归档/**清理之前**采集（成功会剪掉 run-root）
    const countInputs = collectRunCountInputs(res.runRoot);
    const counts = resolveRunCounts({
      deviceTail: countInputs.deviceTail, summary: countInputs.summary, comparability: countInputs.comparability,
      deviceExit: res.exitCode === undefined ? null : res.exitCode,
      writtenHint: res.written === undefined ? null : res.written,
      skippedHint: res.skipped === undefined ? null : res.skipped,
    });
    console.log('RUN_COUNTS measured=' + counts.measured + ' unmeasurable=' + counts.unmeasurable + ' failed=' + counts.failed + ' skipped=' + counts.skipped + ' written=' + counts.written + ' total=' + (counts.total === null ? 'na' : counts.total) + ' source=' + counts.source);
    // 能力守卫（R2-B28b）：极简/老 fake prisma 没有 gradingJob.findUnique ⇒ 视为无作业元信息（不抛、不影响 job 终态）
    const jobLookup = args.prisma && args.prisma.gradingJob && typeof args.prisma.gradingJob.findUnique === 'function' ? await args.prisma.gradingJob.findUnique({ where: { id: res.jobId }, select: { assignmentId: true, checkerId: true, createdAt: true } }).catch(() => null) : null;
    // ★R2-B31：共享生命周期 helper（teardown → 归档 → 清理）；批改路径 source=worker、归档目录 <jobId>/
    const lifecycle = await finalizeRunRoot({
      runRoot: res.runRoot, success, exitCode: res.exitCode === undefined ? 0 : res.exitCode,
      source: 'worker', jobId: res.jobId, dirName: String(res.jobId), runsRoot: resolveRunsRoot(), purge: purgeWanted, keepDays,
      failed: counts.failed, log: console,
    });
    const teardown = readTeardownEvidence(res.runRoot);
    const arch = lifecycle.archive || { dir: null, bytes: 0, pruned: false };
    const dir = arch.dir;
    const persisted = await persistJobRun({
      prisma: args.prisma, jobId: res.jobId,
      assignmentId: jobLookup ? jobLookup.assignmentId : 0, checkerId: jobLookup ? jobLookup.checkerId : null,
      startedAt: jobLookup ? jobLookup.createdAt : null, finishedAt: new Date(), deviceExit: res.exitCode === undefined ? null : res.exitCode,
      measured: counts.measured, unmeasurable: counts.unmeasurable, skipped: counts.skipped, written: counts.written,
      teardown, runDir: dir,
      logStdout: dir ? tailText(path.join(dir, 'device.stdout.log'), 8192) : null,
      logStderr: dir ? tailText(path.join(dir, 'device.stderr.log'), 8192) : null,
    });
    if (!persisted.persisted) console.log('RUN_PERSIST=no reason=' + persisted.reason);
  } catch (err) {
    console.log('RUN_ARCHIVED dir=(none) bytes=0 pruned_run_root=no reason=' + String(err && err.message).slice(0, 160));
  }
  return res;
}

// 自动造尺的物料导出 / 会话作用域 / checker 对齐已拆到 ./autoBuildSession.js
// （A1 t1 建议的拆分点；run-once 主链路 finalizeRunRoot→persistJobRun 顺序不变，w51/w55 源码文本守卫仍成立）
export { ensureMaterialsForAssignment, materialsDirReady } from './autoBuildSession.js';

/**
 * 消费一个 job（默认取最早的 pending）。
 * @returns {{consumed:boolean, reason?:string, jobId?:number, status?:string, written?:number, skipped?:number, runRoot?:string, exitCode?:number, timedOut?:boolean}}
 */
async function runOnceInner({
  prisma, jobId = null, gate = null, dbLimit = undefined, deviceCommand, deviceArgs = [], stubEnv = {}, extraEnv = {}, reuseChecker = false,
  runRootBase = '/tmp', timeoutMs = 600000, maxAttempts = DEFAULT_MAX_ATTEMPTS,
  materialsRoot = null,
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

    // ★自动造尺 job：截止调度器用哨兵 checker_id 建 job；worker 负责「没尺就造、有尺就复用」。
    const autoBuild = isAutoBuildChecker(job.checkerId);
    if (autoBuild) console.log('AUTO_BUILD_SESSION assignment=' + job.assignmentId + ' job=' + job.id + ' checker=' + AUTO_BUILD_CHECKER);
    await logSessionScope({ prisma, job, log: logger });

    // ★OP-1（D1）：开放模式 job —— 无标准工程包的实训题，截止后走**服务端评价式评分**。
    //   在物料/尺子/装置之前短路：不导物料、不造尺、不算 content_key、不跑装置（开放题无标准包，
    //   装置三件套与内容指纹尺子均不适用）；复用 gradeProjectSubmission 的 open 评分链路
    //   （hasStandardPackage=false ⇒ mode='open' ⇒ OPEN_PROJECT_ROLE，prompt 无标准答案段）。
    //   幂等/失败可见：只评 status='submitted'（重跑只补差）；graded=0 或 failed>0 ⇒ needs_rerun + open_grade_*。
    if (isAutoOpenChecker(job.checkerId)) {
      console.log('OPEN_PROJECT_SESSION assignment=' + job.assignmentId + ' job=' + job.id + ' checker=' + AUTO_OPEN_CHECKER);
      let open = null;
      try {
        // 动态导入：开放评分链路（services/projectGrading）只在真正消费开放 job 时加载，
        // 不改变既有造尺/复用/量尺路径的模块加载面（w15/w31 等 fake-prisma 测试零影响）。
        const evaluator = deps.evaluateOpenProject || (await import('./openProjectEvaluation.js')).evaluateOpenProjectAssignment;
        open = await evaluator({ prisma, job, log: logger });
      } catch (err) {
        const reason = 'open_grade_exception:' + String((err && err.message) || err).slice(0, 160);
        await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: reason });
        console.log('OPEN_PROJECT_DONE graded=0 failed=0 skipped=0 status=' + JOB_STATUS.needsRerun + ' job=' + job.id + ' error=' + reason);
        return { consumed: true, jobId: job.id, status: JOB_STATUS.needsRerun, reason: 'open_grade_exception' };
      }
      const openDone = !!open && open.failed === 0 && open.graded > 0;
      const openStatus = openDone ? JOB_STATUS.done : JOB_STATUS.needsRerun;
      const openError = open && open.failed > 0
        ? 'open_grade_partial:failed=' + open.failed + ':graded=' + open.graded
        : (openDone ? null : 'open_grade_no_success:' + ((open && (open.reason || ('graded=' + open.graded))) || 'unknown'));
      await finishJob({
        prisma, jobId: job.id, status: openStatus,
        written: open ? open.graded : 0, skipped: open ? open.skipped : 0, error: openError,
      });
      console.log('OPEN_PROJECT_DONE graded=' + ((open && open.graded) || 0) + ' failed=' + ((open && open.failed) || 0)
        + ' skipped=' + ((open && open.skipped) || 0) + ' status=' + openStatus + ' job=' + job.id
        + (openError ? ' error=' + openError : ''));
      return { consumed: true, jobId: job.id, status: openStatus, written: open ? open.graded : 0, skipped: open ? open.skipped : 0, reason: 'open_project', open };
    }

    const runRoot = path.join(runRootBase, 'r2b4-job-' + job.id + '-' + Date.now());
    fs.mkdirSync(runRoot, { recursive: true });
    const home = path.join(runRoot, 'home');
    fs.mkdirSync(home, { recursive: true });

    // ★F4（自动造尺）：先用平台数据导出该作业物料（与 ops 的 r2b20 同源），再做尺子解析/拉起装置。
    //   顺序很关键：物料拿不到就不该抢占尺子（claimed_here 会让别的作业等待一个永远没有产物的 builder）。
    //   失败 ⇒ fail-closed：job needs_rerun，不写分、不进入装置流程。
    if (autoBuild) {
      const prep = await ensureMaterialsForAssignment({
        prisma, materialsRoot, assignmentId: job.assignmentId, jobId: job.id, log: logger,
        force: String(process.env[REEXPORT_ENV] || '') === '1',
      });
      if (!prep.ok) {
        console.log('MATERIALS_EXPORT_FAILED assignment=' + job.assignmentId + ' reason=' + prep.reason + ' job=' + job.id);
        logger.warn({ jobId: job.id, assignmentId: job.assignmentId, reason: prep.reason }, '自动造尺：物料导出失败 ⇒ fail-closed（不写分、不跑装置）');
        await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'materials_export_failed:' + prep.reason });
        return { consumed: true, jobId: job.id, runRoot, status: JOB_STATUS.needsRerun, reason: 'materials_export_failed:' + prep.reason, materials: { ok: false, reason: prep.reason } };
      }
    }

    // R2-B10②：复用已入库尺子（measure-only-reuse，零模型调用、尺子不变）
    let reuse = null;
    // 自动造尺 job 的装置参数必须显式切到 build-and-measure（run.sh 默认 per-submission ⇒ 永远不会造尺）
    let runArgs = autoBuild ? withBuildCheckerArgs(deviceArgs) : deviceArgs;
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

    // ★R2-B35：内容指纹尺子解析（ready ⇒ 零 LLM 复用；building ⇒ 等待；无 ⇒ 抢占后由本次装置流程造尺一次 + 首次绑定）
    //   假 prisma / 迁移未落地 / 无发布快照 ⇒ 一律回落旧路径（不改变既有行为）
    //   ★F3/F6：--reuse-checker 只约束「普通 job 只许复用」；自动造尺 job 必须保留「无尺则造」能力，
    //     否则峰谷窗口形态（worker 带 --reuse-checker）下自动 job 永远不会造尺（只会 needs_rerun）。
    const reuseOnly = reuseChecker && !autoBuild;
    let rulerPlan = null;
    let jobCheckerId = job.checkerId;
    // ★R2：对齐失败原因（成功打分也会写进 last_error，避免 job.checker_id 只剩哨兵且无迹可查）
    let alignFailedReason = null;
    try {
      const contentRes = await resolveAssignmentContent({ prisma, assignmentId: job.assignmentId });
      if (contentRes.ok) {
        await setJobContentKey({ prisma, jobId: job.id, contentKey: contentRes.contentKey });
        // ★R2-CAP2（真机端到端暴露的接线缺口）：`mode='build'` 时必须显式告诉 store「本次由调用方
        //   （装置流程）造尺」——否则 canProduce() 只剩「可采纳的旧锚点」这一条路 ⇒ 对全新内容必然
        //   fail-closed(reason=no_ruler_source)，即「无尺则本次造尺一次」在 worker 侧从未生效。
        //   并发安全不受影响：抢占仍是 store 内原子完成（claimBuildingRuler），抢输者回到等待分支。
        const rr = await resolveRulerForAssignment({
          prisma, assignmentId: job.assignmentId, questionId: contentRes.questionId,
          mode: reuseOnly ? 'reuse' : 'build',
          claimOnly: !reuseOnly,
          pollIntervalMs: resolvePollMs(), waitTimeoutMs: resolveWaitMs(),
          log: console, jobTag: 'job=' + job.id,
        });
        if (rr.ok && rr.status === 'claimed_here') {
          rulerPlan = { mode: 'build', contentKey: rr.contentKey, questionId: rr.questionId };
          console.log('RULER_RESOLVE=claimed_here content_key=' + rr.contentKey + ' job=' + job.id + '（本次装置流程造尺一次）');
        } else if (rr.ok) {
          rulerPlan = { mode: 'reuse', contentKey: rr.contentKey, ruler: rr.ruler, zeroLlm: rr.zeroLlm, via: rr.status };
          console.log('RULER_RESOLVE=' + rr.status + ' content_key=' + rr.contentKey + ' checker_id=' + ((rr.ruler && rr.ruler.checkerId) || '(none)') + ' job=' + job.id);
        } else if (rr.failClosed) {
          console.log('RULER_RESOLVE=fail_closed reason=' + rr.reason + ' content_key=' + rr.contentKey + ' job=' + job.id);
          console.log('CHECKER_REUSE=none checker_id=(none) reason=' + withRulerPrefix(rr.reason) + ' job=' + job.id);
          await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: withRulerPrefix(rr.reason) });
          logger.warn({ jobId: job.id, reason: rr.reason }, 'R2-B35：内容尺子不可用 ⇒ fail-closed needs_rerun（不跑装置、不产出分数）');
          return { consumed: true, jobId: job.id, runRoot, status: JOB_STATUS.needsRerun, reason: withRulerPrefix(rr.reason), reuse: { applied: false, reason: withRulerPrefix(rr.reason) } };
        } else {
          console.log('RULER_RESOLVE=legacy reason=' + rr.reason + ' job=' + job.id);
        }
      } else {
        console.log('RULER_CONTENT=unresolved reason=' + contentRes.reason + ' job=' + job.id);
      }
    } catch (err) {
      rulerPlan = null;
      console.log('RULER_RESOLVE=error reason=' + String(err && err.message).slice(0, 160) + ' job=' + job.id);
    }

    // 真实 checker 的 job 也可能因内容变化进入 build；统一保证 build 模式参数
    if (rulerPlan && rulerPlan.mode === 'build') {
      runArgs = withBuildCheckerArgs(runArgs);
    }

    if (reuseOnly || (rulerPlan && rulerPlan.mode === 'reuse')) {
      if (rulerPlan && rulerPlan.mode === 'reuse') {
        // ★内容命中：尺子原始字节**逐字节**落位（不重序列化 ⇒ 装置 frozen_intact 预检不会被误判篡改）
        const ruler = rulerPlan.ruler || null;
        const placed = writeRulerCheckerFiles({ runRoot, ruler });
        if (!placed.ok) {
          console.log('CHECKER_REUSE=none checker_id=(none) reason=' + placed.reason + ' job=' + job.id);
          await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: withRulerPrefix(placed.reason) });
          return { consumed: true, jobId: job.id, runRoot, status: JOB_STATUS.needsRerun, reason: withRulerPrefix(placed.reason), reuse: { applied: false, reason: placed.reason } };
        }
        // ★不变量：grading_jobs.checker_id == grading_rulers.checker_id == 锚点行.checker_id（不一致会让装置 frozen 预检找不到锚点）
        if (ruler.checkerId && String(ruler.checkerId) !== String(jobCheckerId)) {
          try {
            await prisma.$executeRawUnsafe('UPDATE grading_jobs SET checker_id = ? WHERE id = ?', ruler.checkerId, job.id);
            console.log('RULER_JOB_CHECKER_ALIGNED job=' + job.id + ' from=' + (jobCheckerId || '(none)') + ' to=' + ruler.checkerId);
            jobCheckerId = ruler.checkerId;
          } catch (err) {
            console.log('RULER_JOB_CHECKER_ALIGN_FAILED job=' + job.id + ' reason=' + String(err && err.message).slice(0, 160));
            await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'ruler_job_checker_align_failed' });
            return { consumed: true, jobId: job.id, runRoot, status: JOB_STATUS.needsRerun, reason: 'ruler_job_checker_align_failed', reuse: { applied: false, reason: 'checker_align_failed' } };
          }
        }
        runArgs = withReuseCheckerArgs(deviceArgs, placed.frozenPath);
        reuse = { applied: true, checkerId: ruler.checkerId, mode: REUSE_CHECKER_MODE, frozenPath: placed.frozenPath, via: 'ruler_content_key', contentKey: rulerPlan.contentKey, byteExact: placed.byteExact };
        console.log('CHECKER_REUSE=applied checker_id=' + (ruler.checkerId || '(none)') + ' mode=' + REUSE_CHECKER_MODE + ' frozen=' + placed.frozenPath + ' via=ruler_content_key bytes=' + placed.bytes + ' byte_exact=' + (placed.byteExact ? 'yes' : 'no') + ' job=' + job.id);
        logger.info({ jobId: job.id, checkerId: ruler.checkerId, contentKey: rulerPlan.contentKey }, 'R2-B35：内容指纹命中 ⇒ 复用尺子（零模型调用）');
      } else if (!readyChecker) {
        console.log('CHECKER_REUSE=none checker_id=(none) reason=no_ready_checker_for_assignment job=' + job.id);
        await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'no_ready_checker_for_assignment' });
        logger.warn({ jobId: job.id, assignmentId: job.assignmentId }, 'R2-B10：该作业无 ready 尺子 ⇒ fail-closed 标 needs_rerun（不跑装置、零成本）');
        return { consumed: true, jobId: job.id, runRoot, status: JOB_STATUS.needsRerun, reason: 'no_ready_checker', reuse: { applied: false, reason: 'no_ready_checker_for_assignment' } };
      } else {
        const frozenPath = placeCheckerFiles({ runRoot, checkerJson: readyChecker.checkerJson });
        runArgs = withReuseCheckerArgs(deviceArgs, frozenPath);
        reuse = { applied: true, checkerId: readyChecker.checkerId, mode: REUSE_CHECKER_MODE, frozenPath };
        console.log('CHECKER_REUSE=applied checker_id=' + readyChecker.checkerId + ' mode=' + REUSE_CHECKER_MODE + ' frozen=' + frozenPath + ' job=' + job.id);
        logger.info({ jobId: job.id, checkerId: readyChecker.checkerId, mode: REUSE_CHECKER_MODE }, 'R2-B10：复用已入库尺子（零模型调用）');
      }
    } else if (readyChecker) {
      console.log('HINT=ready_checker_exists_consider_--reuse-checker checker_id=' + readyChecker.checkerId + ' job=' + job.id);
    }

    // ★R2-B14②：复用拉起装置前回填作业锚点（恢复装置 frozen_intact 预检与 ASSIGNMENT_FROZEN_SHA256）
    const anchor = await materializeAnchor({ prisma, assignmentId: job.assignmentId, checkerId: jobCheckerId, runRoot });
    console.log(anchor.materialized
      ? 'ANCHOR_MATERIALIZED=yes target=' + anchor.target + ' frozen_sha256=' + (anchor.frozenSha256 || 'na') + ' bytes=' + anchor.bytes + ' written_sha256=' + anchor.sha256 + ' sha_matches_anchor=' + (anchor.shaMatchesAnchor ? 'yes' : 'no') + ' n_submissions=' + anchor.nSubmissions
      : 'ANCHOR_MATERIALIZED=no reason=' + anchor.reason + '（历史数据：明确记录并继续，不静默装成功）');

    // ★R2-B21：按 **job 的 assignmentId** 解析该作业自己的物料目录与份数（多作业场景必需）
    //   设定 DSH_GRADER_MATERIALS_ROOT ⇒ 覆盖启动时写死的 --source-dir/--submissions；目录缺失/为空 ⇒ fail-closed（不回落实验/、不写分）
    if (materialsRoot) {
      // 自动 job 的物料已在上方（F4）导出；这里只做解析 + 缺失 fail-closed（既有 R2-B21 语义）
      const m = resolveMaterialsForAssignment({ materialsRoot, assignmentId: job.assignmentId });
      if (!m.ok) {
        console.log(formatMaterialsMissing({ assignmentId: job.assignmentId, dir: m.dir }));
        logger.warn({ jobId: job.id, assignmentId: job.assignmentId, dir: m.dir }, 'R2-B21：该作业物料缺失 ⇒ fail-closed（不回落装置默认源目录、不写分）');
        await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: m.reason });
        return { consumed: true, jobId: job.id, runRoot, status: JOB_STATUS.needsRerun, reason: m.reason, materials: { dir: m.dir, ok: false } };
      }
      console.log(formatMaterialsResolved({ assignmentId: job.assignmentId, dir: m.dir, submissions: m.submissions, source: m.source }));
      runArgs = withMaterialsArgs(runArgs, m);
    }

    // ★R2-B11：装置必须在**仓库根**下运行（相对装置路径才解析得对）；参数里的相对路径同时绝对化（双保险）
    const repoRootAbs = path.resolve(repoRoot);
    // ★R2-B12①：装置必须在**本次 run-root** 下工作（否则产物/frozen 尺子错位 ⇒ 闸 exit 5、消费失败）
    runArgs = withWorkdirArg(runArgs, runRoot);
    const finalArgs = absolutizeDeviceArgs(runArgs, repoRootAbs);
    // 造尺会话比纯量尺慢（实测 8.7 min + 物料导出）；build 单独放宽超时，measure 保持原值
    const isBuildRun = autoBuild || !!(rulerPlan && rulerPlan.mode === 'build');
    const buildTimeoutMs = Math.max(Number(timeoutMs) || 0, Number(process.env.DSH_BUILD_TIMEOUT_MS) || 1200000);
    const effectiveTimeoutMs = isBuildRun ? buildTimeoutMs : timeoutMs;

    const res = await (deps.runDshGrader || runDshGrader)({
      command: deviceCommand || 'node',
      args: finalArgs,
      runRoot,
      cwd: repoRootAbs, // ★R2-B11：此前是 cwd=runRoot ⇒ 相对装置路径（scripts/dsh-grader/run.sh）解析失败 ⇒ bash exit 127
      timeoutMs: effectiveTimeoutMs,
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

    // ★R2-B35：内容命中复用 ⇒ 为该作业补锚点行（**用本作业自己的名单**：device 刚产出的 materials-manifest；
    //   绝不把别的作业/班级的名单搬过来——否则消费侧 slug 映射会写到错的学生上）
    if (reuse && reuse.via === 'ruler_content_key') {
      try {
        const existingAnchor = await loadAnchor({ prisma, assignmentId: job.assignmentId, checkerId: jobCheckerId });
        if (existingAnchor) {
          console.log('ANCHOR_ROW_PRESENT=yes checker_id=' + jobCheckerId + ' n_submissions=' + existingAnchor.nSubmissions);
        } else {
          const saved = await persistAnchor({ prisma, assignmentId: job.assignmentId, checkerId: jobCheckerId, runRoot });
          console.log('ANCHOR_ROW_BACKFILLED=' + (saved.persisted ? 'yes' : 'no')
            + (saved.persisted ? ' checker_id=' + jobCheckerId + ' frozen_sha256=' + (saved.frozenSha256 || 'na') + ' n_submissions=' + saved.nSubmissions + ' checker_raw_bytes=' + saved.rawBytes : ' reason=' + saved.reason));
        }
      } catch (err) {
        console.log('ANCHOR_ROW_BACKFILL_FAILED reason=' + String(err && err.message).slice(0, 160));
      }
    }

    const base = { consumed: true, jobId: job.id, runRoot, exitCode: res.exitCode, timedOut: !!res.timedOut, reuse, deviceLogs, alignFailed: alignFailedReason };

    if (res.timedOut) {
      if (rulerPlan && rulerPlan.mode === 'build') {
        await failClaimedRuler({ prisma, contentKey: rulerPlan.contentKey, reason: 'timeout:attempt=' + job.attempts + (job.attempts < maxAttempts ? ':retryable' : ':exhausted') });
      }
      const retryable = job.attempts < maxAttempts;
      await finishJob({
        prisma, jobId: job.id,
        status: retryable ? JOB_STATUS.pending : JOB_STATUS.failed,
        error: 'timeout:attempt=' + job.attempts + (retryable ? ':retryable' : ':exhausted') + tailSuffix,
      });
      logger.warn({ jobId: job.id, attempts: job.attempts, retryable }, 'R2-B4：装置超时（kill + 释放闸）');
      return { ...base, status: retryable ? JOB_STATUS.pending : JOB_STATUS.failed, reason: 'timeout', retryable };
    }

    // ★R2-B35：本 worker 拥有造尺权却拿不到可用尺子 ⇒ 让等待者立刻 fail-closed（不产出分数、可重试）
    const rulerBuildFailed = async (reason) => {
      if (rulerPlan && rulerPlan.mode === 'build') {
        await failClaimedRuler({ prisma, contentKey: rulerPlan.contentKey, reason });
      }
    };

    const checkerPath = resolveCheckerPath(runRoot);
    if (!checkerPath) {
      await rulerBuildFailed('artifacts_missing:exit=' + res.exitCode + tailSuffix);
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'artifacts_missing:exit=' + res.exitCode + tailSuffix });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'artifacts_missing' };
    }
    if (Number(res.exitCode) === 5 || Number(res.exitCode) === 6) {
      await rulerBuildFailed('device_exit_' + res.exitCode + tailSuffix);
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'device_exit_' + res.exitCode + tailSuffix });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'device_exit_' + res.exitCode };
    }
    if (Number(res.exitCode) !== 0) {
      await rulerBuildFailed('device_exit_' + res.exitCode + tailSuffix);
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'device_exit_' + res.exitCode + tailSuffix });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'device_exit_' + res.exitCode };
    }

    const stored = await consumeChecker({ prisma, runRoot, assignmentId: job.assignmentId, repoRoot });
    if (!stored.ok) {
      // ★R2-B35：本次是「内容首次出现、由本 worker 造尺」⇒ 造尺失败要让等待者看到 failed（不产出分数）
      await rulerBuildFailed('checker_invalid:' + stored.reason);
      await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'checker_invalid:' + stored.reason });
      return { ...base, status: JOB_STATUS.needsRerun, reason: 'checker_invalid:' + stored.reason };
    }
    // ★R2-B35：造尺一次 ⇒ 置 ready（写 checker_id/frozen_sha256/原始字节）+ 首次绑定（内容指纹尺子）
    if (rulerPlan && rulerPlan.mode === 'build') {
      const anchorInfo = readAnchorFromRunRoot(runRoot);
      await completeClaimedRuler({
        prisma, contentKey: rulerPlan.contentKey, checkerId: stored.checkerId,
        frozenSha256: anchorInfo.frozenSha256 || null, checkerRaw: anchorInfo.checkerRaw || null,
        model: null, sourceRunId: job.id,
      });
      const builtRuler = await findRulerByContentKey(prisma, rulerPlan.contentKey);
      jobCheckerId = stored.checkerId;
      // ★自动 job 的 checker_id 从哨兵对齐到真实尺子（否则审计/归档仍显示 __AUTO_BUILD__）
      const alignedBuild = await alignJobCheckerId({ prisma, jobId: job.id, to: stored.checkerId });
      if (!alignedBuild.ok) alignFailedReason = alignedBuild.reason;
      const b = await bindResolvedRuler({
        prisma, assignmentId: job.assignmentId, questionId: rulerPlan.questionId,
        ruler: builtRuler, contentKey: rulerPlan.contentKey,
      });
      if (!b.ok) {
        console.log('RULER_RESOLVE=bind_conflict content_key=' + rulerPlan.contentKey + ' job=' + job.id + ' reason=' + b.reason);
        await finishJob({ prisma, jobId: job.id, status: JOB_STATUS.needsRerun, error: 'ruler_bind_conflict' });
        return { ...base, status: JOB_STATUS.needsRerun, reason: 'ruler_bind_conflict' };
      }
    }
    // 兼容：内容不可解析（无冻结快照）但仍是自动 job ⇒ 装置可能已产出 checker，至少把 job 对齐到真实 checker
    if (!rulerPlan && isAutoBuildChecker(job.checkerId) && stored.checkerId) {
      const alignedLegacy = await alignJobCheckerId({ prisma, jobId: job.id, to: stored.checkerId });
      // 锚点/绑定一律用真实 checker；job 行对齐失败只影响审计字段（已记 last_error）
      jobCheckerId = stored.checkerId;
      if (!alignedLegacy.ok) alignFailedReason = alignedLegacy.reason;
    }

    // ★R2-B14①：入库时持久化作业锚点（供后续复用回填；upsert 幂等）
    const anchorSaved = await persistAnchor({ prisma, assignmentId: job.assignmentId, checkerId: jobCheckerId, runRoot });
    console.log('ANCHOR_PERSISTED=' + (anchorSaved.persisted ? 'yes' : 'no') + (anchorSaved.persisted ? ' frozen_sha256=' + (anchorSaved.frozenSha256 || 'na') + ' n_submissions=' + anchorSaved.nSubmissions + ' ANCHOR_RAW_PERSISTED=' + (anchorSaved.rawBytes > 0 ? 'yes bytes=' + anchorSaved.rawBytes + ' sha256=' + anchorSaved.rawSha256 : 'no') : ' reason=' + anchorSaved.reason));

    // ★R2-B48（设计 R2-A26）：**第二会话** —— 装置跑完之后、消费之前，产出 <run-root>/out/summaries.json。
    //   语义：尺子零 LLM；**评语按需生成、单独计量、可关**（DSH_SUMMARY_MODE=off|cached|always，默认 cached）。
    //   永不抛出：预算超限/模型失败/坏 JSON ⇒ 只是「本次没有总评」⇒ 消费侧不写 summary 键、教师页回落旧面板，**分数不受影响**。
    let summaryRun = null;
    try {
      summaryRun = await runSummarySession({ prisma, runRoot, assignmentId: job.assignmentId, log: logger });
      console.log('SUMMARY_SESSION mode=' + summaryRun.mode + ' ok=' + (summaryRun.ok ? 'yes' : 'no')
        + ' generated=' + summaryRun.generated + ' cache_hits=' + summaryRun.cache_hits + ' written=' + summaryRun.written
        + ' failed=' + summaryRun.failed + ' cost=' + summaryRun.cost + (summaryRun.reason ? ' reason=' + summaryRun.reason : '') + ' job=' + job.id);
      if (summaryRun.written > 0) {
        // 监测：同一 run-root ⇒ 消耗并入既有 usage_json（分列 summary_session，便于把"判据/评语"分开算）
        const merged = await recordSummaryUsage(prisma, { runRef: 'job:' + job.id, tokens: summaryRun.tokens || null, cost: summaryRun.cost, model: summaryRun.model || null });
        console.log('SUMMARY_SESSION_USAGE merged=' + (merged ? 'yes' : 'no') + ' job=' + job.id);
      }
    } catch (err) {
      console.log('SUMMARY_SESSION ok=no reason=' + String(err && err.message).slice(0, 160) + ' job=' + job.id);
    }

    const consumed = await consumeMeasureResults({ prisma, runRoot, assignmentId: job.assignmentId });
    const status = consumed.written > 0 ? JOB_STATUS.done : JOB_STATUS.needsRerun;
    // ★R2：打分成功但对齐失败 ⇒ last_error 留明确线索（D2 管理员页/排障可据此显示「job.checker_id 仍是哨兵」）
    const alignWarning = alignFailedReason
      ? 'ruler_job_checker_align_failed:' + alignFailedReason + '（打分已完成；真实 checker=' + (stored.checkerId || '(none)') + '，job.checker_id 仍为 ' + AUTO_BUILD_CHECKER + '）'
      : null;
    await finishJob({
      prisma, jobId: job.id, status,
      written: consumed.written, skipped: consumed.skipped.length,
      // ★repair-2：needs_rerun 出口也要留对齐线索（否则 job.checker_id 仍是哨兵却只剩 all_needs_rerun）
      error: consumed.written > 0 ? alignWarning : ('all_needs_rerun:' + consumed.skipped.map((r) => r.reason).join(',') + (alignFailedReason ? '; align=' + alignFailedReason : '')),
    });
    logger.info({ jobId: job.id, status, written: consumed.written, skipped: consumed.skipped.length }, 'R2-B4：job 消费完成');
    return { ...base, status, written: consumed.written, skipped: consumed.skipped.length, checkerId: stored.checkerId };
  } finally {
    g.release();
  }
}
