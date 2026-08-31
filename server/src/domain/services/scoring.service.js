// ScoringService —— 评分领域服务（纯函数，零依赖）。
// 迁移来源：server/src/utils/scoring.js（resolveSubQuestionScores 现行语义）、
//           server/src/services/projectGrader.js（calculateTotal 加权）、
//           server/src/services/deepseek.js（AI 兜底异常判定）。

import { InvalidScoreError } from '../errors.js';
import { DEFAULT_GRADING_WEIGHTS } from '../value-objects.js';

// AI 兜底异常反馈文案（对齐 server/src/constants.js ABNORMAL_FEEDBACK，迁移期双源并存，P8 统一）
export const ABNORMAL_FEEDBACK = '请联系老师';

// 校验并归一化小题分值：每题必须显式填分（score 非空且 > 0）
export function resolveSubQuestionScores(subQuestions) {
  const resolved = subQuestions.map((sq, i) => {
    if (sq.score == null) throw new InvalidScoreError('第' + (i + 1) + '小题未设置分值');
    if (sq.score <= 0) throw new InvalidScoreError('第' + (i + 1) + '小题分值必须大于 0');
    return { ...sq, score: sq.score };
  });
  const totalScore = resolved.reduce((sum, sq) => sum + sq.score, 0);
  return { resolved, totalScore };
}

// 三引擎加权总分（默认权重 0.3/0.3/0.4，保留 1 位小数）
export function weightedTotal(machineScore, astScore, aiScore, weights = DEFAULT_GRADING_WEIGHTS) {
  const total = (machineScore || 0) * (weights.machine || 0.3)
    + (astScore || 0) * (weights.ast || 0.3)
    + (aiScore || 0) * (weights.ai || 0.4);
  return Math.round(total * 10) / 10;
}

// AI 评分结果是否落入兜底异常
export function isAbnormal(result) {
  return !result || result.feedback === ABNORMAL_FEEDBACK;
}
