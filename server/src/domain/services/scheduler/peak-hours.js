/**
 * peak-hours.js —— 峰谷判定与窗口推演（调度器的**纯计算内核**）。
 *
 * 规则来源（官方原文，2026-10-11 取自 api-docs.deepseek.com/zh-cn/quick_start/pricing）：
 *   「空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）
 *    9:00-12:00、14:00-18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。」
 *
 * 三条不变量（改代码前先读）：
 *   ① **左闭右开**：9:00 算高峰、12:00 算空闲、14:00 算高峰、18:00 算空闲；
 *   ② **窗口一律用绝对时刻推演**（beijingTimeToDate 反解），绝不用「dow + N 小时」硬算 —— 空闲窗口
 *      18:00→次日 9:00 跨日，周五 18:00→周一 9:00 跨 2 日，国庆连休可跨 11 日；
 *   ③ **已启动的任务不打断**：本模块只回答「此刻能不能开新任务」，不负责结束任何东西（软截止）。
 *
 * 纯函数：无 IO、无全局状态、无定时器；时间一律入参化（本项目无 jest fake timer 先例）。
 * 分层：domain 层 ⇒ 只 import 同层相对路径 + 语言内置（Date/Intl/Set）。
 */

import { beijingParts, beijingTimeToDate, DAY_MS } from './beijing-time.js';
import { HOLIDAY_SET, checkCoverage, outOfRangeNotice, OUT_OF_RANGE_POLICY } from './holidays-cn.js';

/**
 * 默认高峰窗口 `[起时, 起分, 止时, 止分)`（左闭右开）。
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
export const DEFAULT_PEAK_WINDOWS = Object.freeze([
  Object.freeze([9, 0, 12, 0]),
  Object.freeze([14, 0, 18, 0]),
]);

/** 窗口结束前停止启动新任务的预留分钟数 T（方案 §4.1.1 ③，默认 60 分钟） */
export const DEFAULT_LEAD_MINUTES = 60;

/** 逐日扫描上限（春节/国庆连休最长约 11 天，60 天留足余量；亦是「窗口无界」时的退化边界） */
const MAX_SCAN_DAYS = 60;

/** 向后找窗口的迭代上限（防止退化配置下空转） */
const MAX_SCAN_WINDOWS = 128;

/** 把入参规整为 Date（非法时刻直接抛，避免静默算出 NaN 计划） */
function toDate(value, field) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new TypeError(`peak-hours: ${field} 不是合法时刻：${String(value)}`);
  return d;
}

/** 校验单个高峰窗口（拒绝跨零点/零长度窗口，否则窗口推演可能不收敛） */
function normalizeWindow(w) {
  const ok = Array.isArray(w) && w.length === 4 && w.every((n) => Number.isInteger(n) && n >= 0);
  if (!ok) throw new TypeError(`peak-hours: 高峰窗口必须是 4 个非负整数 [起时,起分,止时,止分]，收到 ${JSON.stringify(w)}`);
  const [sh, sm, eh, em] = w;
  if (sh * 60 + sm >= eh * 60 + em) {
    throw new RangeError(`peak-hours: 高峰窗口起止必须递增（不支持跨零点），收到 ${JSON.stringify(w)}`);
  }
  return [sh, sm, eh, em];
}

/**
 * 规整可选项：节假日集合与高峰窗口（缺省 = 内置中国节假日表 + 官方高峰窗口）。
 * @param {{holidays?:Set<string>, peakWindows?:number[][]}} [opts]
 */
function resolveOpts(opts = {}) {
  return {
    holidays: opts.holidays instanceof Set ? opts.holidays : HOLIDAY_SET,
    peakWindows: (Array.isArray(opts.peakWindows) && opts.peakWindows.length ? opts.peakWindows : DEFAULT_PEAK_WINDOWS)
      .map(normalizeWindow),
  };
}

/** 分钟制时间点是否落在窗口 [起,止) 内 */
function inWindow(minuteOfDay, w) {
  return minuteOfDay >= w[0] * 60 + w[1] && minuteOfDay < w[2] * 60 + w[3];
}

/**
 * 某时刻的峰谷状态（**唯一判定入口**：isPeak 与 computeStartPlan 共用，避免两套真相）。
 *
 * 超范围年份（放假日表未收录）按 OUT_OF_RANGE_POLICY 处理：
 *   - 'peak'（当前）：工作日白天的钟点保守当作高峰 ⇒ peak=true，且 unknownMatters=true（调用方必须记 TODO 日志）；
 *   - 'idle'：当作空闲 ⇒ peak=false，但 unknownMatters 仍为 true。
 *
 * @param {Date} t 绝对时刻
 * @param {{holidays:Set<string>, peakWindows:number[][]}} o 已规整的选项
 * @returns {{p:object, cov:object, weekend:boolean, holiday:boolean, inWindow:boolean,
 *            peak:boolean, outOfRange:boolean, unknownMatters:boolean}}
 */
function peakStateAt(t, o) {
  const p = beijingParts(t);
  const cov = checkCoverage(p.dateKey);
  const weekend = p.dow === 0 || p.dow === 6;
  const holiday = !weekend && o.holidays.has(p.dateKey);
  const minuteOfDay = p.hh * 60 + p.mm;
  const inWin = !weekend && o.peakWindows.some((w) => inWindow(minuteOfDay, w));
  const known = !weekend && !holiday && cov.covered;
  const peak = known ? inWin : (!weekend && !holiday && OUT_OF_RANGE_POLICY === 'peak' && inWin);
  return {
    p,
    cov,
    weekend,
    holiday,
    inWindow: inWin,
    peak,
    outOfRange: !cov.covered,
    // 「表未收录」确实改变了结论：工作日 + 落在高峰钟点 + 表里没有它
    unknownMatters: !cov.covered && !weekend && !holiday && inWin,
  };
}

/**
 * 某北京日历日的高峰区间（绝对毫秒，左闭右开，升序）；周末或放假日返回 []（全天空闲）。
 * 入参 d 允许溢出（如 d=45），内部先归一化到真实日历日 ⇒ 跨月/跨年安全。
 *
 * @param {number} y 年
 * @param {number} m 月（1-12）
 * @param {number} d 日（允许溢出）
 * @param {{holidays:Set<string>, peakWindows:number[][]}} o 已规整的选项
 * @returns {Array<[number, number]>}
 */
function peakIntervalsOfDay(y, m, d, o) {
  const np = beijingParts(beijingTimeToDate(y, m, d, 12, 0));
  if (np.dow === 0 || np.dow === 6) return [];
  if (o.holidays.has(np.dateKey)) return [];
  if (!checkCoverage(np.dateKey).covered && OUT_OF_RANGE_POLICY !== 'peak') return [];
  return o.peakWindows.map((w) => [
    beijingTimeToDate(np.y, np.m, np.d, w[0], w[1]).getTime(),
    beijingTimeToDate(np.y, np.m, np.d, w[2], w[3]).getTime(),
  ]);
}

/**
 * 空闲段结束时刻 = 之后第一个高峰区间的起点。
 * ★调用前提：t 处于空闲（peak=false）；退化配置（无高峰窗口）下返回 t + 扫描上限，语义 = 窗口无界。
 *
 * @param {number} t 绝对毫秒
 * @param {{holidays:Set<string>, peakWindows:number[][]}} o 已规整的选项
 * @returns {number} 绝对毫秒
 */
function idleRunEndMs(t, o) {
  const anchor = beijingParts(new Date(t));
  for (let i = 0; i < MAX_SCAN_DAYS; i += 1) {
    for (const [s] of peakIntervalsOfDay(anchor.y, anchor.m, anchor.d + i, o)) {
      if (s > t) return s;
    }
  }
  return t + MAX_SCAN_DAYS * DAY_MS;
}

/**
 * 空闲段起始时刻 = 之前最后一个高峰区间的止点（跨零点/跨连休一次算清）。
 * @param {number} t 绝对毫秒
 * @param {{holidays:Set<string>, peakWindows:number[][]}} o 已规整的选项
 * @returns {number} 绝对毫秒
 */
function idleRunStartMs(t, o) {
  const anchor = beijingParts(new Date(t));
  for (let i = 0; i < MAX_SCAN_DAYS; i += 1) {
    const iv = peakIntervalsOfDay(anchor.y, anchor.m, anchor.d - i, o);
    for (let k = iv.length - 1; k >= 0; k -= 1) {
      if (iv[k][1] <= t) return iv[k][1];
    }
  }
  return t - MAX_SCAN_DAYS * DAY_MS;
}

/**
 * 从某个空闲段起点起，向后找第一个「整段时长 > T」的空闲窗口。
 * 为什么需要它：若下一段空闲本身短于预留期 T（如 T 调到 3 小时、只剩 2 小时午休），
 * 在那儿启动等于一开跑就撞高峰 ⇒ 必须继续往后找。
 *
 * @param {number} fromMs 空闲段起点（绝对毫秒）
 * @param {{holidays:Set<string>, peakWindows:number[][]}} o 已规整的选项
 * @param {number} leadMs 预留期 T（毫秒）
 * @returns {{immediate:boolean, start:number, end:number}|null} 扫描上限内找不到则 null
 */
function findStartableWindow(fromMs, o, leadMs) {
  let cursor = fromMs;
  for (let i = 0; i < MAX_SCAN_WINDOWS; i += 1) {
    const end = idleRunEndMs(cursor, o);
    if (end - cursor > leadMs) return { immediate: false, start: cursor, end };
    // end 是下一个高峰区间的起点 ⇒ 该高峰区间结束处才是再下一段空闲的起点。
    // ★不能用 idleRunStartMs(end)：那是「往回找」，会退到上一段空闲的起点（跨连休时能退到 8 天前）。
    const nextIdle = nextIdleStart(new Date(end), o).getTime();
    if (!(nextIdle > cursor)) break; // 防御：退化配置下不空转
    cursor = nextIdle;
  }
  return null;
}

/**
 * 某时刻是否高峰（价格基准时段）。
 * 高峰 = 工作日（周一~周五）且 非法定节假日 且 落在任一高峰窗口内。
 *
 * @param {Date} [date=new Date()] 绝对时刻（不解释为本地时间）
 * @param {{holidays?:Set<string>, peakWindows?:number[][]}} [opts] 覆盖默认节假日表/窗口（测试与后续可配置化用）
 * @returns {boolean}
 */
export function isPeak(date = new Date(), opts) {
  return peakStateAt(toDate(date, 'date'), resolveOpts(opts)).peak;
}

/**
 * t 之后（含 t 自身）最近的空闲窗口起点。
 * @param {Date} [date=new Date()] 绝对时刻
 * @param {{holidays?:Set<string>, peakWindows?:number[][]}} [opts]
 * @returns {Date} 空闲时刻原样返回；高峰中返回当前高峰区间的结束时刻
 */
export function nextIdleStart(date = new Date(), opts) {
  const o = resolveOpts(opts);
  const t = toDate(date, 'date');
  if (!peakStateAt(t, o).peak) return new Date(t.getTime());
  const p = beijingParts(t);
  for (const [, e] of peakIntervalsOfDay(p.y, p.m, p.d, o)) {
    if (e > t.getTime()) return new Date(e);
  }
  return new Date(idleRunEndMs(t.getTime(), o)); // 防御性回退（peak 为真时理论不可达）
}

/**
 * 包含 t 的**连续空闲窗口**（跨周末/跨连休一路并到下一个高峰起点为止）。
 * 为什么取连续段而不是「当天 0 点~24 点」：软截止 T 是相对**窗口真正结束的那一刻**算的，
 * 周五 18:00 起算的窗口结束于周一 09:00，而不是周五 24:00。
 *
 * @param {Date} [date=new Date()] 绝对时刻
 * @param {{holidays?:Set<string>, peakWindows?:number[][]}} [opts]
 * @returns {{start:Date, end:Date}|null} 高峰中返回 null
 */
export function currentIdleWindow(date = new Date(), opts) {
  const o = resolveOpts(opts);
  const t = toDate(date, 'date');
  if (peakStateAt(t, o).peak) return null;
  const ms = t.getTime();
  return { start: new Date(idleRunStartMs(ms, o)), end: new Date(idleRunEndMs(ms, o)) };
}

/**
 * ★软截止核心：给出「此刻能否启动新任务」与「建议何时启动」。
 *
 * 判定顺序（先算窗口，再看截止）：
 *   1. 高峰中 ⇒ 推到下一个「整段时长 > T」的空闲窗口起点；
 *   2. 空闲中但距窗口结束 ≤ T ⇒ 不开新任务，推到下一个可启动窗口（当前空闲段若不够长则继续往后找）；
 *   3. 空闲中且余量充足 ⇒ 立即启动（canStartNow=true，startAt=now）；
 *   4. 最后校验 deadline（**最晚启动时刻**）：超了 ⇒ reason='past-deadline'、startAt=null，不再排期。
 *
 * ★已启动的任务不受本函数影响：它在跑就让它跑完（方案 §4.1.1 ②「软截止，不硬切」）。
 * ★estimatedMs 只用于推导 expectedFinishAt（供教师端显示「预计完成」），**不参与准入判定** ——
 *   准入只看预留期 T，避免同一件事被扣两次。
 *
 * @param {object} plan
 * @param {Date} [plan.now=new Date()] 当前时刻（★入参化，测试不依赖假时钟）
 * @param {Date|null} [plan.deadline=null] 最晚启动时刻（软截止）；null = 无上限
 * @param {number} [plan.estimatedMs=0] 单次批改预估耗时（仅用于 expectedFinishAt）
 * @param {number} [plan.leadMinutes=DEFAULT_LEAD_MINUTES] 预留期 T（分钟）：窗口结束前 T 分钟停止启动新任务
 * @param {Set<string>} [plan.holidays] 覆盖默认节假日表
 * @param {number[][]} [plan.peakWindows] 覆盖默认高峰窗口
 * @returns {{canStartNow:boolean, startAt:Date|null, windowEnd:Date|null, reason:string,
 *            waitMinutes:number, expectedFinishAt:Date|null, peakNow:boolean,
 *            holidayTableOutOfRange:boolean, notice:string, now:Date, coverage:object}}
 *   reason ∈ 'idle-now'（普通空闲）| 'weekend'（周末空闲）| 'holiday'（法定节假日空闲）
 *          | 'too-close-to-window-end'（距窗口结束 ≤ T）| 'peak'（高峰中）
 *          | 'past-deadline'（超过最晚启动时刻）| 'holiday-table-out-of-range'（★放假日表未覆盖该年，
 *            按 OUT_OF_RANGE_POLICY 保守处理，见 holidays-cn.js 的 TODO）
 *   startAt：null 仅出现在 'past-deadline' 或扫描上限内无可启动窗口时。
 */
export function computeStartPlan({
  now = new Date(),
  deadline = null,
  estimatedMs = 0,
  leadMinutes = DEFAULT_LEAD_MINUTES,
  holidays,
  peakWindows,
} = {}) {
  const o = resolveOpts({ holidays, peakWindows });
  const t0 = toDate(now, 'now');
  const t0ms = t0.getTime();
  const leadMs = Math.max(0, Number(leadMinutes) || 0) * 60000;
  const estMs = Math.max(0, Number(estimatedMs) || 0);

  const st = peakStateAt(t0, o);
  const notice = st.outOfRange ? outOfRangeNotice(st.p.dateKey) : '';

  // ---- 选窗口：当前窗口够用就用它，否则向后找第一个「整段时长 > T」的空闲窗口 ----
  let plan = null;
  if (!st.peak) {
    const end = idleRunEndMs(t0ms, o);
    if (end - t0ms > leadMs) plan = { immediate: true, start: t0ms, end };
  }
  if (!plan) {
    // 高峰中 ⇒ 当前区间结束处即下一段空闲起点；空闲但余量不足 ⇒ 越过紧随其后的高峰区间，再取空闲起点。
    // ★一律用 nextIdleStart（向前），不得用 idleRunStartMs（向后），否则会退到「上一段」空闲。
    const fromMs = st.peak
      ? nextIdleStart(t0, o).getTime()
      : nextIdleStart(new Date(idleRunEndMs(t0ms, o)), o).getTime();
    plan = findStartableWindow(fromMs, o, leadMs);
  }

  // ---- 汇总 ----
  let canStartNow = false;
  let startAt = null;
  let windowEnd = null;
  let reason;
  if (plan && plan.immediate) {
    canStartNow = true;
    startAt = new Date(t0ms);
    windowEnd = new Date(plan.end);
    if (st.weekend) reason = 'weekend';
    else if (st.holiday) reason = 'holiday';
    else reason = 'idle-now';
  } else {
    reason = st.peak ? 'peak' : 'too-close-to-window-end';
    if (plan) {
      startAt = new Date(plan.start);
      windowEnd = new Date(plan.end);
    }
  }
  if (st.unknownMatters) reason = 'holiday-table-out-of-range'; // ★表未覆盖：显式降级，不静默

  // ---- 最晚启动时刻（软截止）：超了就不排期 ----
  const dl = deadline === null || deadline === undefined ? null : toDate(deadline, 'deadline').getTime();
  if (dl !== null && (t0ms > dl || (startAt !== null && startAt.getTime() > dl))) {
    canStartNow = false;
    startAt = null;
    windowEnd = null;
    reason = 'past-deadline';
  }

  return {
    canStartNow,
    startAt,
    windowEnd,
    reason,
    waitMinutes: startAt ? Math.round((startAt.getTime() - t0ms) / 60000) : 0,
    expectedFinishAt: startAt ? new Date(startAt.getTime() + estMs) : null,
    peakNow: st.peak,
    holidayTableOutOfRange: st.outOfRange,
    notice,
    now: t0,
    coverage: st.cov,
  };
}
