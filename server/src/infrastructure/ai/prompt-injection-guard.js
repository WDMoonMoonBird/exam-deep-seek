/**
 * prompt-injection-guard.js —— ★R3-LLM-INJ（P1，2026-10-18）：
 *   提示注入防护的 **infrastructure 侧适配层**（CSPRNG nonce + 数据围栏的唯一入口）。
 *
 * 分层原因（check-layers 基线 0）：
 *   · 格式真源在 domain（domain/services/deepseek/prompts.js 的 buildFencedDataBlock，纯函数）；
 *   · 但 domain 层**禁止 import node 内置/npm** ⇒ 随机 nonce（node:crypto）只能在这里生成并注入。
 *   ⇒ 所有提示词构建器（作业评分 / 项目主观分 / checker / 预览）统一经本模块生成围栏，禁止手写固定围栏。
 *
 * 背景（R21）：固定围栏 <<<CRITERIA_DATA … CRITERIA_DATA>>> 可被教师标准里自带的闭合串提前终结，
 *   把后续系统指令暴露为"可控文本" ⇒ 每次请求使用不可预测 nonce（CSPRNG，禁止时间戳/自增）。
 */
import crypto from 'node:crypto';
import {
  buildFencedDataBlock,
  buildCriteriaDataBlock as domainCriteriaBlock,
  injectionGuardClause,
} from '../../domain/services/deepseek/prompts.js';

const NONCE_BYTES = 8;   // hex 长度 16：足够防碰撞/防猜（围栏只需不可预测）

/** CSPRNG nonce（16 位 hex）；禁止时间戳/可预测值 */
export function createFenceNonce() {
  return crypto.randomBytes(NONCE_BYTES).toString('hex');
}

/**
 * 生成带随机 nonce 的数据围栏（label 如 CRITERIA_DATA / RUBRIC_DATA / STD_FILES_DATA）。
 * @param {string} label
 * @param {unknown} data
 * @param {{nonce?: string, maxLength?: number}} [opts]
 * @returns {string}
 */
export function fencedDataBlock(label, data, opts = {}) {
  return buildFencedDataBlock(label, data, opts.nonce || createFenceNonce(), { maxLength: opts.maxLength });
}

/** 教师评分标准数据块（委托 domain 格式；每次调用独立随机 nonce） */
export function criteriaDataBlock(criteria) {
  return domainCriteriaBlock(criteria, createFenceNonce());
}

export { injectionGuardClause };
