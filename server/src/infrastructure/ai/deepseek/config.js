/**
 * config.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 5-43）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import '../../../utils/logger.js';
import prisma from '../../../utils/prisma.js';

// ===================== 配置读取（优先 DB → 回退 ENV） =====================
let configCache = null;
let configCacheTime = 0;
const CACHE_TTL = 60_000; // 1分钟缓存

async function loadConfig() {
  if (configCache && Date.now() - configCacheTime < CACHE_TTL) return configCache;
  try {
    const rows = await prisma.systemConfig.findMany();
    configCache = {};
    for (const r of rows) configCache[r.key] = r.value;
    configCacheTime = Date.now();
  } catch {
    if (!configCache) configCache = {};
  }
  return configCache;
}

export function clearConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

export async function getConfig(key, envFallback) {
  const cfg = await loadConfig();
  return cfg[key] || envFallback;
}

/** 实训题上下文构建模式：off（全量）| filter（L0 过滤）| two-stage（L0 + L1 两阶段） */
export async function getProjectContextMode() {
  const v = await getConfig('project_context_mode', 'filter');
  // 非法值回退 filter（最省流量的安全档），不落入全量注入
  return (v === 'off' || v === 'filter' || v === 'two-stage') ? v : 'filter';
}

export async function getApiKey()    { return await getConfig('deepseek_api_key',  process.env.DEEPSEEK_API_KEY); }
export async function getBaseUrl()   { return await getConfig('deepseek_base_url', process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'); }
export async function getModel()     { return await getConfig('deepseek_model',    process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'); }
export async function getConcurrency() { const v = await getConfig('ai_concurrency', '16'); return +v || 16; }

/**
 * W4（R2-B1）：并发键的「单位」标签 —— 两条链路在日志里互相区分（防误用）。
 *  - ai_concurrency          单位 = **模型调用数**（编程题/既有链路，本轮行为未改）
 *  - dsh_grading_concurrency 单位 = **会话数**（DSH 作业级批改，默认 1）
 */
export const CONCURRENCY_KEY_LABELS = {
  ai_concurrency: 'ai_concurrency(model_calls)',
  dsh_grading_concurrency: 'dsh_grading_concurrency(sessions)',
};

export function concurrencyKeyLabel(key) { return CONCURRENCY_KEY_LABELS[key] || String(key); }

/** 既有链路（ai_concurrency）的键名 + 值；只读，不改变 getConcurrency 的行为（供新模块打印日志用）。 */
export async function getConcurrencyWithKey() {
  const v = await getConfig('ai_concurrency', '16');
  const value = +v || 16;
  return { key: 'ai_concurrency', label: concurrencyKeyLabel('ai_concurrency'), value, unit: 'model_calls' };
}

/**
 * W4（R2-B1）：DSH 作业级批改并发闸（单位 = 会话数）。
 * 优先级：DB dsh_grading_concurrency → env DSH_GRADING_CONCURRENCY → 默认 1（可后台配置，热更新走既有 60s 缓存）。
 * 与 ai_concurrency 完全独立：实训题链路（projectGrading.js）继续读 ai_concurrency，本函数不参与其中。
 */
export async function getDshGradingConcurrency() {
  const v = await getConfig('dsh_grading_concurrency', process.env.DSH_GRADING_CONCURRENCY || '1');
  const n = Math.floor(+v);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n > 64 ? 64 : n;
}

/** 同上，附带键名标签（供日志） */
export async function getDshGradingConcurrencyWithKey() {
  const value = await getDshGradingConcurrency();
  return { key: 'dsh_grading_concurrency', label: concurrencyKeyLabel('dsh_grading_concurrency'), value, unit: 'sessions' };
}
