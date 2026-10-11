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
