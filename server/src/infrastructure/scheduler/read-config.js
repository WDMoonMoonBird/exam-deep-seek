/**
 * read-config.js —— DSH 批改调度器参数读取（`system_configs` 优先 → ENV 兜底 → 内置默认）。
 *
 * 为什么独立成文件：调度参数与编程题评分参数**不是一回事**（方案 §6.2.1）——
 * `ai_concurrency`（默认 16/64，单位=API 调用数）属既有编程题链路，**不得混用**；
 * DSH 批改的并发单位是「同时存在的会话/进程数」，故单列 `dsh_grading_*` 键，默认 **1**（2C4G 服务器）。
 *
 * 读取语义沿用既有 `getConfig`（infrastructure/ai/deepseek/config.js:32-35）：DB 优先、ENV 兜底、
 * 1 分钟缓存、DB 失败不抛。本文件只做两件事：**逐键兜底** 与 **强类型解析**。
 *
 * ★两个已知坑（方案 §5 R4/R5，务必遵守）：
 *   1. `system_configs.value` 是 Text（schema.prisma:335）⇒ **布尔不能用真值判断**：
 *      `'false'` 是 truthy，`if (await getConfig(k))` 永远为真。必须走 `coerceSchedulerBool`。
 *   2. 管理端 `adminController` 的设置项是**硬编码白名单**（只有 deepseek_api_key / deepseek_model /
 *      deepseek_base_url / ai_concurrency 四项），
 *      `dsh_grading_*` **写不进也读不出** ⇒ 当前唯一可运行路径是 **ENV 兜底**（生产改 `.env` 重启）。
 *
 * 分层：infrastructure ⇒ 可依赖 domain / 本层 / npm / node 内置。
 */

import { getConfig as getSystemConfig } from '../ai/deepseek/config.js';

/** 调度参数内置默认值（唯一真相；解析失败一律回落这里） */
export const SCHEDULER_DEFAULTS = Object.freeze({
  concurrency: 1,          // ★方案 §6.2：2C4G 下最多 1 个 DSH 会话（可调大，不建议 ≥3）
  leadMinutes: 60,         // §4.1.1 ③：窗口结束前 T 分钟停止启动新任务
  timeoutMinutes: 30,      // §4.2 / §6.4：超时判失败并释放闸
  retries: 1,              // §4.2：仅「生成期失败」重试 1 次
  pollSeconds: 60,         // 兜底轮询间隔（正常路径是睡到下一个窗口）
  immediateEnabled: false, // §4.1.1「立即批改」开关：★生产默认 false（fail-closed）
});

/** system_configs 键名（DB 侧） */
export const SCHEDULER_CONFIG_KEYS = Object.freeze({
  concurrency: 'dsh_grading_concurrency',
  leadMinutes: 'dsh_grading_lead_minutes',
  timeoutMinutes: 'dsh_grading_timeout_min',
  retries: 'dsh_grading_retries',
  pollSeconds: 'dsh_grading_poll_seconds',
  immediateEnabled: 'feature_immediate_grade',
});

/** ENV 键名（管理端白名单未含新键 ⇒ 生产实际生效路径） */
export const SCHEDULER_ENV_KEYS = Object.freeze({
  concurrency: 'DSH_GRADING_CONCURRENCY',
  leadMinutes: 'DSH_GRADING_LEAD_MINUTES',
  timeoutMinutes: 'DSH_GRADING_TIMEOUT_MIN',
  retries: 'DSH_GRADING_RETRIES',
  pollSeconds: 'DSH_GRADING_POLL_SECONDS',
  immediateEnabled: 'FEATURE_IMMEDIATE_GRADE',
});

/**
 * 数值解析（纯函数，导出供单测）。
 * 用 `Number` 而非 `parseInt`：`parseInt('30分钟')` 会静默吃成 30，脏值必须判非法。
 *
 * @param {*} raw 原始配置值（可能是 undefined / '' / 'abc'）
 * @param {{min?:number, integer?:boolean}} [opts] min：下界（含）；integer：是否要求整数
 * @returns {number|null} 合法返回值，否则 null（调用方决定回退值并记日志）
 */
export function coerceSchedulerNumber(raw, { min = 0, integer = false } = {}) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min) return null;
  if (integer && !Number.isInteger(n)) return null;
  return n;
}

/**
 * 布尔解析（纯函数，导出供单测）——**唯一合法的布尔读取姿势**。
 *
 * ★不要写 `if (await getConfig('feature_x'))`：DB 里存的是字符串，`'false'` 为真值。
 * 正确写法：`coerceSchedulerBool(await getConfig('feature_x', process.env.FEATURE_X)) ?? false`
 *
 * @param {*} raw 原始配置值
 * @returns {boolean|null} 'true'/'1'/'yes'/'on' → true；'false'/'0'/'no'/'off' → false；其余/null
 */
export function coerceSchedulerBool(raw) {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (v === '') return null;
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return null; // 非法值 ⇒ null ⇒ 调用方 fail-closed 回退
}

/**
 * 读取全部调度参数。
 *
 * 容错铁律（对齐仓库既有风格：基础设施层吞异常 + 记日志，绝不拖垮调用方）：
 *   - 单键读取抛错 ⇒ 记 warn + 退回 ENV/默认，**不影响其余键**；
 *   - 值非法（'abc' / 负数 / 小数并发）⇒ 记 warn + 退回默认，**不静默采用**；
 *   - 本函数**永不抛**。
 *
 * @param {object} [deps]
 * @param {(key:string, envFallback?:string)=>Promise<*|undefined>} [deps.getConfig] 配置读取器（默认走 DB→ENV；测试可注入桩，避免连库）
 * @param {object} [deps.logger] 日志器（默认 console）
 * @param {NodeJS.ProcessEnv|object} [deps.env] 环境变量源（默认 process.env；测试可注入）
 * @returns {Promise<{concurrency:number, leadMinutes:number, timeoutMinutes:number,
 *                    retries:number, pollSeconds:number, immediateEnabled:boolean}>}
 */
export async function readSchedulerConfig(deps = {}) {
  const env = deps.env || process.env;
  const logger = deps.logger || console;
  const get = typeof deps.getConfig === 'function' ? deps.getConfig : getSystemConfig;

  const raw = {};
  for (const field of Object.keys(SCHEDULER_CONFIG_KEYS)) {
    const key = SCHEDULER_CONFIG_KEYS[field];
    const envValue = env[SCHEDULER_ENV_KEYS[field]];
    try {
      const value = await get(key, envValue);
      // 读取器返回空 ⇒ 显式回落 ENV：既有 getConfig 自己会做（`cfg[key] || envFallback`），
      // 但注入的读取器（单测桩 / 后续换仓储）不一定做 ⇒ 兜底必须落在本层，否则 ENV 静默失效。
      raw[field] = value === undefined || value === null || value === '' ? envValue : value;
    } catch (err) {
      logger.warn?.({ err: err && err.message, key }, '调度配置读取失败，退回 ENV/内置默认');
      raw[field] = envValue;
    }
  }

  /** 非空但解析不出来 ⇒ 记一条 warn（证据留痕，便于线上定位写错的配置） */
  const warnInvalid = (field, reason) => {
    logger.warn?.(
      { key: SCHEDULER_CONFIG_KEYS[field], raw: String(raw[field]), reason, fallback: SCHEDULER_DEFAULTS[field] },
      '调度配置取值非法，已退回默认',
    );
  };
  const isEmpty = (field) => raw[field] === null || raw[field] === undefined || String(raw[field]).trim() === '';
  const num = (field, opts) => {
    const v = coerceSchedulerNumber(raw[field], opts);
    if (v !== null) return v;
    if (!isEmpty(field)) warnInvalid(field, '数值非法或越界');
    return SCHEDULER_DEFAULTS[field];
  };
  const bool = (field) => {
    const v = coerceSchedulerBool(raw[field]);
    if (v !== null) return v;
    if (!isEmpty(field)) warnInvalid(field, '不是合法布尔（true/1/yes/on 或 false/0/no/off）');
    return SCHEDULER_DEFAULTS[field];
  };

  return {
    concurrency: num('concurrency', { min: 1, integer: true }),   // 并发闸：★与 ai_concurrency 无关
    leadMinutes: num('leadMinutes', { min: 0 }),
    timeoutMinutes: num('timeoutMinutes', { min: 0.001 }),
    retries: num('retries', { min: 0, integer: true }),
    pollSeconds: num('pollSeconds', { min: 1 }),
    immediateEnabled: bool('immediateEnabled'),                   // ★默认 false（fail-closed）
  };
}
