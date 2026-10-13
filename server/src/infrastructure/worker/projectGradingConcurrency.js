/**
 * projectGradingConcurrency.js — 实训题评分并发信号量（D6）
 *
 * B1 行为不变拆分：自 services/projectGrading.js 原样搬出（:49-88），只搬不改；
 * 调用方仍从 services/projectGrading.js 取 refreshConcurrency（该模块再导出，契约不变）。
 */
import logger from '../../utils/logger.js';
import { getConcurrency } from '../ai/deepseek/index.js';

// ===================== 并发信号量（D6：并发数读管理端 ai_concurrency，默认 16，热更新） =====================
let activeCount = 0;
let maxConcurrent = 3; // 首次评分前由 refreshConcurrency 从配置刷新（默认 16）
const waiters = [];

/**
 * 刷新并发上限（2026-08-17 并发修复）：读管理端 ai_concurrency 配置（getConfig 自带 1 分钟缓存）。
 * 入队/评分前调用，配置变更 1 分钟内生效；失败保持当前值。
 */
export async function refreshConcurrency() {
  try {
    const v = await getConcurrency();
    if (v !== maxConcurrent) {
      logger.info({ old: maxConcurrent, new: v }, '实训题评分并发配置已更新');
      maxConcurrent = v;
    }
  } catch (err) {
    logger.warn({ err: err.message }, '读取并发配置失败，保持当前值');
  }
}

export function acquire() {
  return new Promise((resolve) => {
    if (activeCount < maxConcurrent) {
      activeCount += 1;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });
}

export function release() {
  activeCount = Math.max(0, activeCount - 1);
  if (waiters.length && activeCount < maxConcurrent) {
    activeCount += 1;
    const next = waiters.shift();
    next();
  }
}
