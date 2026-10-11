/**
 * grading-scheduler.js —— DSH 作业级批改调度器（进程内骨架）。
 *
 * 依据：docs/plan/2026-10-11-基于DSH的作业级批改方案.md §4.1.1（峰谷）/ §4.2（队列与并发闸）/ §6.2。
 *
 * ★四条不变量（改这个文件前先读，任何一条被破坏都是生产事故）
 *   ① **闸 = 1（可配）**：同一时刻在跑的 DSH 会话数不超过 `dsh_grading_concurrency`（默认 1）。
 *      服务器 2C4G，一个会话 0.3~1 GB，并发 ≥3 有 OOM 风险（§6.2）。
 *   ② **同作业单任务**：同一 `projectId` 在「排队中 ∪ 运行中」只允许存在一个任务（重复 enqueue 直接拒绝）。
 *   ③ **只在空闲窗口开新任务**：起始时刻一律由 `computeStartPlan`（domain 纯函数）给出 —— 高峰中不启动、
 *      距窗口结束不足 T 分钟不启动；高峰期间入队的作业等到下一个空闲窗口。
 *   ④ **运行中不打断（软截止）**：`stop()` 与窗口切换都**不 kill** 正在跑的作业，它跑完为止；
 *      只有**超时**才判失败并释放闸（§4.2 超时=30 分钟可配）。
 *
 * ★可测试性（本项目无 jest fake timer 先例，故不依赖假时钟）
 *   - `now` 可注入：所有时刻判定走它；
 *   - `tick()` 可手动驱动：**不含任何定时器**，`start()` 只是「按 tick 的结论安排下一次唤醒」的壳；
 *   - `config` / `runJob` / `abortJob` / `setTimeoutFn` 均可注入 ⇒ C 不需要真实等待、不需要连库。
 *
 * ★进程边界（本轮已知限制，方案 §5 R10）：闸与队列都在**进程内**，PM2 的 exam-server 与 exam-worker
 *   各有各的闸 ⇒ 调度器必须与执行端同进程（或后续引入跨进程锁）。本轮只交付单进程语义。
 *
 * 分层：infrastructure ⇒ 可依赖 domain（纯计算内核）+ 本层（配置读取）+ utils（日志）。
 */

import loggerDefault from '../../utils/logger.js';
import { formatBeijingDateTime } from '../../domain/services/scheduler/beijing-time.js';
import { computeStartPlan } from '../../domain/services/scheduler/peak-hours.js';
import { readSchedulerConfig, SCHEDULER_DEFAULTS } from './read-config.js';

/** 唤醒间隔下限（毫秒）：避免 tick 自激造成忙轮询 */
const MIN_WAKE_MS = 1000;

/** 队列里单个作业项的字段（内部结构，不外泄） */
// { projectId, submissionIds, deadline, estimatedMs }

/** 规整注入时钟的返回值 */
function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * 创建一个调度器实例（**不启动任何定时器**；定时器只在 `start()` 里起）。
 *
 * @param {object} deps
 * @param {(job:{projectId:number, submissionIds:number[]}) => Promise<*>} deps.runJob
 *        真正执行一次作业级批改（P2 才接 DSH；本轮可注入桩）。★必须自行吞掉业务异常：
 *        本调度器只保证「异常不会让闸泄漏」，不重试（重试策略见 §4.2，属 P2）。
 * @param {() => Promise<object>} [deps.config] 配置读取（默认 readSchedulerConfig，DB→ENV→默认）
 * @param {() => Date} [deps.now] 注入时钟（默认 `() => new Date()`）
 * @param {object} [deps.logger] 日志器（默认 pino，即 ../../utils/logger.js）
 * @param {(job:object) => Promise<*>} [deps.abortJob] 超时清理钩子（P2 用它 kill DSH 子进程；默认不调用）
 * @param {Function} [deps.setTimeoutFn] 定时器注入（测试用；默认全局 setTimeout）
 * @param {Function} [deps.clearTimeoutFn] 定时器注入（测试用；默认全局 clearTimeout）
 * @param {Set<string>} [deps.holidays] 覆盖节假日表（透传给 computeStartPlan）
 * @param {number[][]} [deps.peakWindows] 覆盖高峰窗口（透传给 computeStartPlan）
 * @returns {{enqueue:Function, tick:Function, start:Function, stop:Function, status:Function}}
 */
export function createGradingScheduler(deps = {}) {
  const logger = deps.logger || loggerDefault;
  const config = typeof deps.config === 'function' ? deps.config : readSchedulerConfig;
  const runJob = deps.runJob;
  const abortJob = deps.abortJob;
  const now = typeof deps.now === 'function' ? deps.now : () => new Date();
  const setTimer = typeof deps.setTimeoutFn === 'function' ? deps.setTimeoutFn : setTimeout;
  const clearTimer = typeof deps.clearTimeoutFn === 'function' ? deps.clearTimeoutFn : clearTimeout;
  const { holidays, peakWindows } = deps;

  if (typeof runJob !== 'function') {
    throw new TypeError('createGradingScheduler: 必须注入 runJob（真正执行批改的函数）');
  }

  /** 待跑队列（FIFO） */
  const queue = [];
  /** 排队中 ∪ 运行中的 projectId（不变量②） */
  const knownProjectIds = new Set();
  /** 运行中的作业 */
  const activeJobs = [];

  let cfg = null;              // 最近一次读取的配置
  let running = false;         // start() 之后为 true
  let stopped = false;         // stop() 之后拒绝新任务（start() 可复位）
  let timer = null;
  let currentWakeAt = null;
  let outOfRangeNotified = ''; // 节假日表超范围的告警去重（按日期键）

  const effectiveCfg = () => cfg || SCHEDULER_DEFAULTS;

  /** 读配置：单次失败沿用上次/默认值，绝不抛（不变量：调度器不能因配置层抖动而停摆） */
  async function loadConfig() {
    try {
      const next = await config();
      if (next && typeof next === 'object') cfg = next;
    } catch (err) {
      logger.error?.({ err: err && err.message }, '调度配置读取异常：沿用上次/内置默认值');
    }
    return effectiveCfg();
  }

  function removeActive(job) {
    const i = activeJobs.indexOf(job);
    if (i >= 0) activeJobs.splice(i, 1);
  }

  /** 作业跑完（成功/失败）后的统一收尾：释放闸 + 允许同作业再次入队 + 唤醒队列 */
  function settleJob(job, err) {
    if (job.done) return; // 已判超时：状态已记失败，此处不再改（避免双份终态）
    job.done = true;
    removeActive(job);
    knownProjectIds.delete(job.projectId);
    if (err) logger.error?.({ projectId: job.projectId, err: err && err.message }, '批改作业失败，已释放并发闸');
    else logger.info?.({ projectId: job.projectId, projectCount: knownProjectIds.size }, '批改作业完成，已释放并发闸');
    if (running) wake(0); // 队列里还有作业 ⇒ 立刻推进
  }

  /** 启动一个作业（真正调用 runJob；同步抛错也走 reject 分支，不会逃逸成 unhandledRejection） */
  function startJob(job, tMs) {
    job.startedAtMs = tMs;
    activeJobs.push(job);
    logger.info?.(
      {
        projectId: job.projectId,
        submissions: Array.isArray(job.submissionIds) ? job.submissionIds.length : 0,
        active: activeJobs.length,
        queued: queue.length,
        startedAt: formatBeijingDateTime(new Date(tMs)),
      },
      '开始批改作业（闸内）',
    );
    Promise.resolve()
      .then(() => runJob({ projectId: job.projectId, submissionIds: job.submissionIds }))
      .then(() => settleJob(job, null), (err) => settleJob(job, err));
  }

  /**
   * 单次推进（★测试只调这个；不含定时器，全部时刻判定走注入时钟）。
   *
   * 顺序：① 超时清理（到点判失败 + 释放闸）→ ② 闸内启动（受峰谷窗口与截止约束）→ ③ 算下次唤醒时刻。
   *
   * @returns {Promise<{started:Array<{projectId:number, submissionIds:number[]}>,
   *                    queued:number, active:number, nextWakeAt:Date|null}>}
   */
  async function tick() {
    const cfgNow = await loadConfig();
    const t = toDate(now());
    const tMs = t.getTime();
    const started = [];
    const concurrency = Math.max(1, Number(cfgNow.concurrency) || 1);
    const timeoutMs = Math.max(1, Number(cfgNow.timeoutMinutes) || 0) * 60000;

    // ── ① 超时清理：到点判失败并释放闸（§4.2 超时=30 分钟可配；§4.7 可抢占） ──
    for (const job of [...activeJobs]) {
      if (tMs - job.startedAtMs < timeoutMs) continue;
      job.done = true;
      job.timedOut = true;
      removeActive(job);
      knownProjectIds.delete(job.projectId);
      logger.error?.(
        {
          projectId: job.projectId,
          startedAt: formatBeijingDateTime(new Date(job.startedAtMs)),
          timeoutMinutes: cfgNow.timeoutMinutes,
        },
        '批改作业超时：判失败并释放并发闸（子进程清理需 abortJob 钩子）',
      );
      if (typeof abortJob === 'function') {
        try {
          await abortJob(job);
        } catch (err) {
          logger.error?.({ projectId: job.projectId, err: err && err.message }, '超时清理钩子 abortJob 抛错');
        }
      }
    }

    // ── ② 闸内启动：起始时刻由 domain 纯函数给出（不变量③） ──
    // 迭代上限 = 队列长度 + 闸宽：闸内最多启动 N 个，其余是「已过截止 ⇒ 出队」的跳过次数。
    // ★为什么需要跳过：过了最晚启动时刻的作业**永远等不到窗口**，若把它留在队首会堵死后面所有作业。
    const maxAttempts = queue.length + concurrency;
    let nextWakeAt = null;
    for (let i = 0; i < maxAttempts; i += 1) {
      if (stopped || activeJobs.length >= concurrency) break;
      const head = queue[0];
      if (!head) break;
      const plan = computeStartPlan({
        now: t,
        deadline: head.deadline || null,
        estimatedMs: head.estimatedMs || 0,
        leadMinutes: cfgNow.leadMinutes,
        holidays,
        peakWindows,
      });
      if (plan.holidayTableOutOfRange && plan.notice && outOfRangeNotified !== plan.coverage.key) {
        outOfRangeNotified = plan.coverage.key; // 每个日期键只告警一次，避免每 tick 刷屏
        logger.warn?.({ notice: plan.notice }, '批改调度：节假日表未覆盖该年份（★TODO 待用户确认）');
      }
      if (!plan.canStartNow) {
        if (plan.reason === 'past-deadline') {
          queue.shift(); // 出队但不启动：既不违反「超过截止不启动」，也不阻塞后续作业
          knownProjectIds.delete(head.projectId); // 释放去重位（同作业可被重新入队，如教师手工重排）
          logger.warn?.({ projectId: head.projectId, reason: plan.reason }, '批改作业已过最晚启动时刻：出队不启动（不阻塞后续作业）');
          continue;
        }
        nextWakeAt = plan.startAt; // 可能为 null（扫描上限内暂无可启动窗口）
        break;
      }
      queue.shift();
      startJob(head, tMs);
      started.push({ projectId: head.projectId, submissionIds: head.submissionIds });
    }

    // ── ③ 下次唤醒：取「下一个窗口起点」与「运行中作业的超时时刻」中更早的一个 ──
    for (const job of activeJobs) {
      const due = job.startedAtMs + timeoutMs;
      if (nextWakeAt === null || due < nextWakeAt.getTime()) nextWakeAt = new Date(due);
    }
    currentWakeAt = nextWakeAt;
    return { started, queued: queue.length, active: activeJobs.length, nextWakeAt };
  }

  /** 安排下一次 tick（幂等：先清旧定时器；unref 保证不阻止进程退出） */
  function wake(delayMs) {
    if (!running) return;
    const cfgNow = effectiveCfg();
    const cap = Math.max(MIN_WAKE_MS, (Number(cfgNow.pollSeconds) || SCHEDULER_DEFAULTS.pollSeconds) * 1000);
    const delay = Math.min(Math.max(Number(delayMs) || 0, MIN_WAKE_MS), cap);
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    timer = setTimer(() => {
      timer = null;
      void runLoop();
    }, delay);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  /** 常驻循环的一拍：tick → 按结论安排下一次唤醒（异常吞掉并退化为轮询） */
  async function runLoop() {
    if (!running) return;
    let result = null;
    try {
      result = await tick();
    } catch (err) {
      logger.error?.({ err: err && err.stack ? err.stack : err }, '调度器 tick 异常（已吞，等待下一拍）');
    }
    if (!running) return;
    const cfgNow = effectiveCfg();
    const pollMs = Math.max(MIN_WAKE_MS, (Number(cfgNow.pollSeconds) || SCHEDULER_DEFAULTS.pollSeconds) * 1000);
    let delayMs = pollMs;
    if (result && result.nextWakeAt) delayMs = result.nextWakeAt.getTime() - toDate(now()).getTime();
    wake(delayMs);
  }

  /**
   * 入队一个作业级批改（不变量②：同 projectId 去重）。
   *
   * @param {{projectId:number|string, submissionIds?:number[], deadline?:Date|null, estimatedMs?:number}} job
   * @returns {{accepted:boolean, position?:number, reason?:string}}
   *   reason ∈ 'invalid-project-id' | 'scheduler-stopped' | 'duplicate-project'
   */
  function enqueue(job = {}) {
    const projectId = Number(job.projectId);
    if (!Number.isFinite(projectId)) return { accepted: false, reason: 'invalid-project-id' };
    if (stopped) return { accepted: false, reason: 'scheduler-stopped' };
    if (knownProjectIds.has(projectId)) return { accepted: false, reason: 'duplicate-project' };
    knownProjectIds.add(projectId);
    queue.push({
      projectId,
      submissionIds: Array.isArray(job.submissionIds) ? [...job.submissionIds] : [],
      deadline: job.deadline || null,
      estimatedMs: Number(job.estimatedMs) || 0,
      done: false,
      startedAtMs: null,
    });
    logger.info?.({ projectId, position: queue.length - 1, queued: queue.length }, '批改作业已入队');
    if (running) wake(0); // 闸空闲且当前是空闲窗口时立刻开跑（不必等下一拍）
    return { accepted: true, position: queue.length - 1 };
  }

  /** 启动常驻循环（幂等；★import 本模块不会起任何定时器，只有调用它才会） */
  function start() {
    if (running) return;
    running = true;
    stopped = false;
    logger.info?.(
      { concurrency: effectiveCfg().concurrency, pollSeconds: effectiveCfg().pollSeconds },
      'DSH 批改调度器已启动（峰谷调度：仅在空闲窗口开新任务）',
    );
    wake(0);
  }

  /** 停止：清定时器 + 拒绝新任务（不变量④：**不打断**运行中的作业） */
  function stop() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    running = false;
    stopped = true;
    currentWakeAt = null;
    logger.info?.(
      { active: activeJobs.length, queued: queue.length },
      'DSH 批改调度器已停止（运行中的作业不打断，跑完为止）',
    );
  }

  /**
   * 当前状态（同步、纯读取，供教师端「前面还有 N 个作业 / 预计何时开始」）。
   * `nextStartAt` 按队首作业**实时**推算（复用 domain 纯函数，与 tick 同一套判定）；
   * 闸已满时队首作业要等运行中的作业结束 ⇒ 无排期，返回 null。
   *
   * @returns {{active:number, queued:number, nextStartAt:Date|null, nextWakeAt:Date|null,
   *            running:boolean, stopped:boolean}}
   */
  function status() {
    const head = queue[0] || null;
    let nextStartAt = null;
    if (head && activeJobs.length < Math.max(1, Number(effectiveCfg().concurrency) || 1)) {
      nextStartAt = computeStartPlan({
        now: toDate(now()),
        deadline: head.deadline || null,
        estimatedMs: head.estimatedMs || 0,
        leadMinutes: effectiveCfg().leadMinutes,
        holidays,
        peakWindows,
      }).startAt;
    }
    // nextWakeAt = 常驻循环下一次被唤醒的时刻（含运行中作业的超时点；未 start()/无待办时为 null）
    return { active: activeJobs.length, queued: queue.length, nextStartAt, nextWakeAt: currentWakeAt, running, stopped };
  }

  return { enqueue, tick, start, stop, status };
}

// ===================== 进程级单例（index.js 对外只暴露这三个 + 纯函数） =====================

/** 进程内唯一实例（null = 未启动） */
let singleton = null;

/**
 * 启动进程级调度器（幂等：已启动则原样返回，不重复起定时器）。
 * ★本轮**不接 app.js / worker.js**（方案 §5 R7：jest 里 app.js 是模块加载即 listen，
 *   定时器没有护栏）⇒ 由 P2 在显式判断 FEATURE 开关后调用。
 *
 * @param {object} deps 见 createGradingScheduler
 * @returns {ReturnType<typeof createGradingScheduler>}
 */
export function startScheduler(deps) {
  if (singleton) return singleton;
  singleton = createGradingScheduler(deps);
  singleton.start();
  return singleton;
}

/** 停止并丢弃单例（不打断运行中的作业；下次 startScheduler 会重建） */
export function stopScheduler() {
  if (!singleton) return null;
  singleton.stop();
  singleton = null;
  return null;
}

/**
 * 向进程级调度器入队（P2 的接线入口：把「学生提交」或「教师点批改」变成一次入队）。
 * @param {{projectId:number, submissionIds?:number[]}} job
 * @returns {{accepted:boolean, position?:number, reason?:string}} 未启动时 reason='scheduler-not-started'
 */
export function enqueueProjectGradingJob(job) {
  if (!singleton) return { accepted: false, reason: 'scheduler-not-started' };
  return singleton.enqueue(job);
}

/** 进程级状态查询（未启动返回 null） */
export function getSchedulerStatus() {
  return singleton ? singleton.status() : null;
}
