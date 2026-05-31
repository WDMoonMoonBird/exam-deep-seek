/**
 * 校验小题分值：每题 score 必须存在且 > 0
 * @param {Array} subQuestions - 小题列表 [{ score }]
 * @returns {{ resolved: Array, totalScore: number }}
 * @throws {Error} 分值无效时抛出
 */
export function resolveSubQuestionScores(subQuestions) {
  const resolved = subQuestions.map((sq, i) => {
    if (sq.score == null) throw new Error(`第${i + 1}小题未设置分值`);
    if (sq.score <= 0) throw new Error(`第${i + 1}小题分值必须大于 0`);
    return { ...sq, score: sq.score };
  });
  const totalScore = resolved.reduce((sum, sq) => sum + sq.score, 0);
  return { resolved, totalScore };
}
