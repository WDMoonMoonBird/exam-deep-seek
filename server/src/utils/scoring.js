/**
 * 解析并校验小题分值
 * 都不填 → 均分；有填 → 校验总和等于 maxScore
 * @param {Array} subQuestions - 小题列表 [{ score }]
 * @param {number} maxScore - 大题总分
 * @returns {Array} 处理后的小题列表
 * @throws {Error} 分值总和不等时抛出
 */
export function resolveSubQuestionScores(subQuestions, maxScore) {
  const n = subQuestions.length;
  const hasAny = subQuestions.some(sq => sq.score != null);
  const resolved = subQuestions.map(sq => ({
    ...sq,
    score: hasAny ? (sq.score || 0) : Math.floor(maxScore / n),
  }));
  if (hasAny) {
    const sum = resolved.reduce((s, sq) => s + sq.score, 0);
    if (sum !== maxScore) {
      throw new Error(`小题分值总和(${sum})不等于总分(${maxScore})`);
    }
  } else {
    resolved[n - 1].score += maxScore - resolved.reduce((s, sq) => s + sq.score, 0);
  }
  return resolved;
}
