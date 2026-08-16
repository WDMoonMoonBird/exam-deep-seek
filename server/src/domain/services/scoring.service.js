/**
 * ScoringService —— 评分领域服务（纯函数，零依赖）。
 * 迁移来源：server/src/utils/scoring.js（resolveSubQuestionScores 现行语义）、
 *           server/src/services/projectGrader.js（calculateTotal 加权）、
 *           server/src/services/deepseek.js（AI 兜底异常判定）。
 */

import { InvalidScoreError } from '../errors.js';
import { DEFAULT_GRADING_WEIGHTS } from '../value-objects.js';

/** AI 兜底异常反馈文案（对齐 server/src/constants.js ABNORMAL_FEEDBACK，迁移期双源并存，P8 统一） */
export const ABNORMAL_FEEDBACK = '请联系老师';

/**
 * 校验并归一化小题分值。现行语义（题库重构 2649393 后）：
 * 每题必须显式填分（score 非空且 > 0），不做均分、不校验总和与满分一致。
 * @param {Array<{score: number, [k: string]: any}>} subQuestions 小题列表
 * @returns {{resolved: Array, totalScore: number}} resolved 为原样保留字段并校验分值后的小题列表
 * @throws {InvalidScoreError} 分值未设置或非正数
 */
export function resolveSubQuestionScores(subQuestions) {
  const resolved = subQuestions.map((sq, i) => {
    if (sq.score == null) throw new InvalidScoreError('第' + (i + 1) + '小题未设置分值');
    if (sq.score <= 0) throw new InvalidScoreError('第' + (i + 1) + '小题分值必须大于 0');
    return { ...sq, score: sq.score };
  });
  const totalScore = resolved.reduce((sum, sq) => sum + sq.score, 0);
  return { resolved, totalScore };
}

/**
 * 三引擎加权总分（等价迁移自 projectGrader.calculateTotal）。
 * @param {number} machineScore 机器校验得分
 * @param {number} astScore AST 分析得分
 * @param {number} aiScore AI 评审得分
 * @param {{machine?: number, ast?: number, ai?: number}} [weights] 权重（默认 0.3/0.3/0.4）
 * @returns {number} 加权总分（保留 1 位小数）
 */
export function weightedTotal(machineScore, astScore, aiScore, weights = DEFAULT_GRADING_WEIGHTS) {
  const total = (machineScore || 0) * (weights.machine || 0.3)
    + (astScore || 0) * (weights.ast || 0.3)
    + (aiScore || 0) * (weights.ai || 0.4);
  return Math.round(total * 10) / 10;
}

/**
 * AI 评分结果是否落入兜底异常（对齐 deepseek.js 重试失败后的 { score: 0, feedback: ABNORMAL_FEEDBACK }）。
 * @param {{score?: number, feedback?: string}|null} result AI 评分结果
 * @returns {boolean} true 表示异常兜底结果
 */
export function isAbnormal(result) {
  return !result || result.feedback === ABNORMAL_FEEDBACK;
}