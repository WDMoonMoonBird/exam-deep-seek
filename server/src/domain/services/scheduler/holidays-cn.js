/**
 * holidays-cn.js —— 中国法定节假日放假日表（峰谷判定的必需输入）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★口径（先读这段，再改数据）
 *  1. 官方原文：「空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）
 *     9:00-12:00、14:00-18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。」
 *     ⇒ 周末本来就是空闲，**本表只需登记【放假日】**，无需登记调休上班的周末（方案 §4.1.1 ③）。
 *  2. 登记的是「放假日」= 国务院办公厅年度《关于部分节假日安排的通知》里宣布放假的日期，
 *     含法定节假日当日 + 与之连休的调休日（后者多为工作日）。★漏登记一个连休日 = 那天照常按高峰跑 = 白付一倍价钱。
 *  3. **不登记**调休上班的周六周日：官方措辞「周末…均为空闲」，故周六周日恒空闲（不识别调休）。
 *  4. 错误的代价不对称（决定了保守方向）：
 *       多登记一天（把工作日当假日）→ 高峰时段照跑 → **多花钱**；
 *       漏登记一天（把假日当工作日）→ 该天不开新任务 → 只是**多等**。
 *     ⇒ 数据拿不准时，**宁可漏登记**，不要多登记。
 * ─────────────────────────────────────────────────────────────────────────────
 * ★数据来源与置信度（本表未经联网核验，禁联网约束下按公开日历整理，**必须由用户/官方确认**）：
 *   - 2025：已发生的年度安排，置信度高（国办发明电〔2024〕7 号，2024-11-12 发布）。
 *   - 2026：**未核验**（state='unverified'），尤其是国庆连休天数 —— 已按「宁可漏登记」取 7 天
 *     （10-01~10-07；若官方为 8 天，代价只是 10-08 多等一个窗口，不会多花钱）。
 *   - 2027 及以后：**未收录** ⇒ 触发年份覆盖自检（见 checkCoverage / OUT_OF_RANGE_POLICY）。
 *   - ★每年更新一次：新增下一年度放假日 + 同步 HOLIDAY_YEARS 与 HOLIDAY_TABLE_STATUS。
 * ─────────────────────────────────────────────────────────────────────────────
 * 分层：domain 层只允许语言内置 ⇒ 纯数据 + 纯函数，不打日志（日志由 infrastructure 层按
 * `outOfRangeNotice()` 的文案原样输出）。
 */

import { DAY_MS } from './beijing-time.js';

/** 日期键格式（唯一合法形态，禁止 'YYYY/M/D' 等变体） */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 展开闭区间日期为 'YYYY-MM-DD' 数组（UTC 日历日算术，与进程时区无关）。
 * 用区间写法而非逐日罗列：连休 8 天写一行，改表时不易漏、不易错。
 *
 * @param {string} startKey 起始日 'YYYY-MM-DD'（含）
 * @param {string} endKey 结束日 'YYYY-MM-DD'（含）
 * @returns {string[]}
 */
function dateRange(startKey, endKey) {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const end = Date.UTC(ey, em - 1, ed);
  const out = [];
  for (let cur = Date.UTC(sy, sm - 1, sd); cur <= end; cur += DAY_MS) {
    out.push(new Date(cur).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * 放假日表：年份 → 放假日数组。
 * @type {Record<number, string[]>}
 */
const HOLIDAYS_BY_YEAR = {
  // ── 2025（置信度高）───────────────────────────────────────────────────────
  2025: [
    ...dateRange('2025-01-01', '2025-01-01'), // 元旦
    ...dateRange('2025-01-28', '2025-02-04'), // 春节（除夕 01-28）
    ...dateRange('2025-04-04', '2025-04-06'), // 清明
    ...dateRange('2025-05-01', '2025-05-05'), // 劳动节
    ...dateRange('2025-05-31', '2025-06-02'), // 端午
    ...dateRange('2025-10-01', '2025-10-08'), // 国庆 + 中秋连休
  ],
  // ── 2026（★未核验，见文件头「数据来源与置信度」）─────────────────────────
  2026: [
    ...dateRange('2026-01-01', '2026-01-03'), // 元旦（01-01 周四、01-02 周五、01-03 周六）
    ...dateRange('2026-02-15', '2026-02-22'), // 春节（除夕 02-16 周一）
    ...dateRange('2026-04-04', '2026-04-06'), // 清明（04-05 周日，04-06 周一补休）
    ...dateRange('2026-05-01', '2026-05-05'), // 劳动节（05-01 周五）
    ...dateRange('2026-06-19', '2026-06-21'), // 端午（06-19 周五）
    ...dateRange('2026-09-25', '2026-09-27'), // 中秋（09-25 周五）
    // 国庆：★7 天与 8 天两说（中秋 2026 在 09-25，未与国庆连休；2025 是 8 天因为中秋落在 10-06）。
    // 取【7 天】= 保守方向：若实际放到 10-08，这天我们只是「多等一个窗口」（不花钱）；
    // 若取 8 天而实际 7 天，则 10-08 会在高峰照跑 ⇒ 白付一倍价钱。宁可漏登记，不可多登记。
    ...dateRange('2026-10-01', '2026-10-07'),
  ],
};

/** 表覆盖的年份（升序）——年份覆盖自检的唯一依据 */
export const HOLIDAY_YEARS = Object.freeze(Object.keys(HOLIDAYS_BY_YEAR).map(Number).sort((a, b) => a - b));

/** 全部放假日（'YYYY-MM-DD' 升序，扁平数组；对外只暴露这一份数据） */
export const HOLIDAYS_CN = Object.freeze(Object.values(HOLIDAYS_BY_YEAR).flat().sort());

/** 放假日查表集合（isPeak 每次调用都用它，避免重复构建） */
export const HOLIDAY_SET = new Set(HOLIDAYS_CN);

/** 各年份数据置信度：confirmed=已发生/可核对；unverified=按公开日历整理但未核验 */
export const HOLIDAY_TABLE_STATUS = Object.freeze({ 2025: 'confirmed', 2026: 'unverified' });

/**
 * ★超范围策略（**待用户拍板，本轮不擅自决定**）。
 *
 * 查表年份落在 HOLIDAY_YEARS 之外时（例如 2027 年及以后尚未补表），有两种可选语义：
 *   - 'peak'（**当前实现**）：把该年工作日白天**保守地当作高峰** ⇒ 不开新任务，代价是可能白等；
 *   - 'idle'：当作空闲 ⇒ 直接开跑，代价是可能正好撞上节假日高峰、白付一倍价钱。
 * 无论取哪种，`checkCoverage().covered === false` 与 `outOfRangeNotice()` 都会**显式**暴露，
 * 由调用方记日志/告警 —— 不允许静默按某一种语义跑下去。
 *
 * @type {'peak'|'idle'}
 */
export const OUT_OF_RANGE_POLICY = 'peak';

/**
 * 校验并规整日期键。
 * @param {string} dateKey 'YYYY-MM-DD'
 * @returns {string} 原样返回（已校验）
 */
function assertDateKey(dateKey) {
  if (typeof dateKey !== 'string' || !DATE_KEY_RE.test(dateKey)) {
    throw new TypeError(`holidays-cn: 日期键必须是 'YYYY-MM-DD'，收到 ${JSON.stringify(dateKey)}`);
  }
  return dateKey;
}

/**
 * 是否中国法定节假日（放假日）。
 * @param {string} dateKey 'YYYY-MM-DD'（北京时间日历日）
 * @returns {boolean}
 */
export function isHoliday(dateKey) {
  return HOLIDAY_SET.has(assertDateKey(dateKey));
}

/**
 * 年份覆盖自检：该日期所属年份是否已收录。
 *
 * ★调用方必须显式处理 `covered === false` 的情形（不要写成 `if (await x)` 那种默认真值判断）：
 * 未覆盖 ⇒ 该年放假日**未知**，此时应记 TODO 日志并按 `OUT_OF_RANGE_POLICY` 行事。
 *
 * @param {string} dateKey 'YYYY-MM-DD'
 * @returns {{covered:boolean, key:string, year:number, isHoliday:boolean,
 *            status:'confirmed'|'unverified'|'missing', policy:'peak'|'idle'}}
 */
export function checkCoverage(dateKey) {
  const key = assertDateKey(dateKey);
  const year = Number(key.slice(0, 4));
  const covered = HOLIDAY_YEARS.includes(year);
  return {
    covered,
    key,
    year,
    isHoliday: HOLIDAY_SET.has(key),
    status: covered ? HOLIDAY_TABLE_STATUS[year] || 'unverified' : 'missing',
    policy: OUT_OF_RANGE_POLICY,
  };
}

/**
 * 超范围告警文案（供 infrastructure 层原样打进日志 —— 域层不打日志，只给文案）。
 * @param {string} dateKey 'YYYY-MM-DD'
 * @returns {string} 覆盖范围内返回空串
 */
export function outOfRangeNotice(dateKey) {
  const c = checkCoverage(dateKey);
  if (c.covered) return '';
  return `★TODO(待用户拍板)：中国法定节假日表仅覆盖 ${HOLIDAY_YEARS[0]}-${HOLIDAY_YEARS[HOLIDAY_YEARS.length - 1]} 年，`
    + `${c.year} 年（${c.key}）超出范围 ⇒ 该年放假日未知，暂按 OUT_OF_RANGE_POLICY='${c.policy}' 保守处理`
    + `（工作日白天不开新任务，可能白等）。请补充 ${c.year} 年放假日表后同步 HOLIDAY_YEARS。`;
}
