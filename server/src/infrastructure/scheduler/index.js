/**
 * index.js —— 调度器对外唯一入口（barrel，只做重导出，无任何逻辑、无副作用）。
 *
 * ★import 本文件**不会**启动任何定时器：只有显式调用 `startScheduler()` / `scheduler.start()` 才会
 *   （方案 §5 R7：jest 跑 app.js 是模块加载即 listen，定时器没有护栏 ⇒ 本轮不接运行链路）。
 *
 * 对外面分三组：
 *   1. 进程级单例：`startScheduler` / `stopScheduler` / `enqueueProjectGradingJob` / `getSchedulerStatus`
 *   2. 实例工厂与配置：`createGradingScheduler` / `readSchedulerConfig`（+ 键名常量与解析纯函数）
 *   3. 纯计算内核重导出：峰谷判定、北京时区、节假日表 —— 供测试与教师端「预计开始时间」直接复用
 */

export {
  createGradingScheduler,
  startScheduler,
  stopScheduler,
  enqueueProjectGradingJob,
  getSchedulerStatus,
} from './grading-scheduler.js';

export {
  readSchedulerConfig,
  SCHEDULER_DEFAULTS,
  SCHEDULER_CONFIG_KEYS,
  SCHEDULER_ENV_KEYS,
  coerceSchedulerNumber,
  coerceSchedulerBool,
} from './read-config.js';

export {
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_LEAD_MINUTES,
  isPeak,
  nextIdleStart,
  currentIdleWindow,
  computeStartPlan,
} from '../../domain/services/scheduler/peak-hours.js';

export {
  BEIJING_TZ,
  DAY_MS,
  beijingParts,
  beijingDateKey,
  beijingTimeToDate,
  beijingOffsetMinutes,
  weekdayOf,
  formatBeijingDateTime,
} from '../../domain/services/scheduler/beijing-time.js';

export {
  HOLIDAYS_CN,
  HOLIDAY_YEARS,
  HOLIDAY_SET,
  HOLIDAY_TABLE_STATUS,
  OUT_OF_RANGE_POLICY,
  isHoliday,
  checkCoverage,
  outOfRangeNotice,
} from '../../domain/services/scheduler/holidays-cn.js';
