/**
 * beijing-time.js —— 北京时间换算（峰谷调度器的时区底座）。
 *
 * 为什么必须新写：全仓 `server/src` 内 `Intl`/`Asia/Shanghai`/`getTimezoneOffset` 零命中，
 * 而 DeepSeek 峰谷价格是按【北京时间】定义的（周一至周五 9:00-12:00、14:00-18:00 高峰）。
 * 目标机（阿里云 Ubuntu）默认多为 UTC，`ecosystem.config.cjs` 与 `.env.example` 均未设 `TZ`
 * ⇒ **绝不能依赖进程本地时区**，一律走 `Intl` 显式 `Asia/Shanghai`。
 *
 * 分层约束：domain 层禁止 import 任何 npm 包 / node 内置 ⇒ 本文件只用语言内置的
 * `Date` 与 `Intl`（两者都在 ECMAScript 规范内，不属于 Node IO）。
 */

/** 唯一时区标识：所有换算显式带它，不读进程 TZ */
export const BEIJING_TZ = 'Asia/Shanghai';

/** 一天毫秒数（供上层做日期算术，避免各处硬编码 86400000） */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 北京时间日历分量格式化器。
 * 用 formatToParts 而非 format：不依赖 locale 的拼接格式（'en-CA' 只是为了让各分量稳定输出数字）。
 * ★hourCycle: 'h23' —— 显式 24 小时制；不用 hour12:false（部分实现在午夜会给出 '24'）。
 */
const PARTS_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BEIJING_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** 两位补零 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 由北京日历日推星期几。用 UTC 反解而非本地 Date：与进程时区完全无关。
 * @param {number} y 年
 * @param {number} m 月（1-12）
 * @param {number} d 日（允许溢出，如 32 = 次月 1 日）
 * @returns {number} 0=周日 … 6=周六
 */
export function weekdayOf(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * 把任意绝对时刻换算成北京时间的日历分量。
 *
 * @param {Date} [date=new Date()] 绝对时刻（不解释为本地时间）
 * @returns {{y:number,m:number,d:number,hh:number,mm:number,ss:number,dow:number,dateKey:string}}
 *   dow：0=周日 … 6=周六；dateKey：'YYYY-MM-DD'（北京时间）
 */
export function beijingParts(date = new Date()) {
  const t = date instanceof Date ? date : new Date(date);
  const bag = Object.create(null);
  for (const p of PARTS_FMT.formatToParts(t)) bag[p.type] = p.value;
  const y = Number(bag.year);
  const m = Number(bag.month);
  const d = Number(bag.day);
  return {
    y,
    m,
    d,
    hh: Number(bag.hour),
    mm: Number(bag.minute),
    ss: Number(bag.second),
    dow: weekdayOf(y, m, d),
    dateKey: `${y}-${pad2(m)}-${pad2(d)}`,
  };
}

/**
 * 北京时间日期键。
 * @param {Date} [date=new Date()] 绝对时刻
 * @returns {string} 'YYYY-MM-DD'
 */
export function beijingDateKey(date = new Date()) {
  return beijingParts(date).dateKey;
}

/**
 * 实测某一时刻的北京时区偏移（分钟）。
 *
 * 不写死 +480：Asia/Shanghai 历史上实行过夏令时（1986-1991），
 * 用「同一时刻的北京日历分量 ↔ UTC 日历分量」之差反解，任何年份都自洽。
 *
 * @param {Date} [date=new Date()] 绝对时刻
 * @returns {number} 偏移分钟数（现代恒为 480）
 */
export function beijingOffsetMinutes(date = new Date()) {
  const t = date instanceof Date ? date : new Date(date);
  const p = beijingParts(t);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss, t.getUTCMilliseconds());
  return Math.round((asUtc - t.getTime()) / 60000);
}

/**
 * 由北京日历分量反解绝对时刻（跨零点/跨月/跨年安全）。
 *
 * 入参允许溢出：`beijingTimeToDate(2026, 10, 45)` 等价于 2026-11-14，
 * 上层做「加 N 天」时无需自己处理月份长度。
 *
 * @param {number} y 年
 * @param {number} m 月（1-12）
 * @param {number} d 日（允许溢出）
 * @param {number} [hh=0] 时
 * @param {number} [mm=0] 分
 * @param {number} [ss=0] 秒
 * @returns {Date} 对应的绝对时刻
 */
export function beijingTimeToDate(y, m, d, hh = 0, mm = 0, ss = 0) {
  // 墙上时间当作 UTC 解释后的毫秒数（后续用真实偏移校正）
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss);
  // 先按固定 +08:00 猜一次；再用实测偏移迭代校正（夏令时年份两次内收敛）
  let ms = wall - 8 * 3600000;
  for (let i = 0; i < 2; i += 1) {
    const next = wall - beijingOffsetMinutes(new Date(ms)) * 60000;
    if (next === ms) break;
    ms = next;
  }
  return new Date(ms);
}

/**
 * 北京时间 'YYYY-MM-DD HH:mm'（日志/教师端文案用；格式化属表现层，这里只提供唯一口径）。
 * @param {Date} [date=new Date()] 绝对时刻
 * @returns {string}
 */
export function formatBeijingDateTime(date = new Date()) {
  const p = beijingParts(date);
  return `${p.dateKey} ${pad2(p.hh)}:${pad2(p.mm)}`;
}
