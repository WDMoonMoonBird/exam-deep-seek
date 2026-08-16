import { resolveSubQuestionScores } from '../../src/utils/scoring.js';

describe('resolveSubQuestionScores', () => {
  // 现行语义（server/src/utils/scoring.js，2649393 重构后）：每题必须显式填分（score 非空且 >0），
  // 返回 { resolved, totalScore }；不再有均分与『总和=满分』校验。

  // S1: 3 小题全不填分 → 抛『第N小题未设置分值』
  it('S1: 3小题全不填分 → 抛"第1小题未设置分值"', () => {
    const input = [{ score: null }, { score: null }, { score: null }];
    expect(() => resolveSubQuestionScores(input)).toThrow('第1小题未设置分值');
  });

  // S2: 第 2 小题未填分 → 错误信息带正确小题序号
  it('S2: 第2小题未填分 → 抛"第2小题未设置分值"', () => {
    const input = [{ score: 10 }, { score: null }, { score: 10 }];
    expect(() => resolveSubQuestionScores(input)).toThrow('第2小题未设置分值');
  });

  // S3: 全填分且 >0 → 原样返回 { resolved, totalScore }，保留原有字段
  it('S3: 全填分且>0 → 原值返回并保留字段', () => {
    const input = [
      { score: 30, title: 'a' },
      { score: 30, title: 'b' },
      { score: 40, title: 'c' },
    ];
    const result = resolveSubQuestionScores(input);
    expect(result.resolved).toHaveLength(3);
    expect(result.resolved[0].score).toBe(30);
    expect(result.resolved[1].score).toBe(30);
    expect(result.resolved[2].score).toBe(40);
    expect(result.resolved[0].title).toBe('a'); // 保留原有字段
    expect(result.totalScore).toBe(100);
  });

  // S4: 分值为 0 → 抛『第N小题分值必须大于 0』
  it('S4: 分值为0 → 抛"第1小题分值必须大于 0"', () => {
    const input = [{ score: 0 }, { score: 10 }];
    expect(() => resolveSubQuestionScores(input)).toThrow('第1小题分值必须大于 0');
  });

  // S5: 分值为负 → 抛『第N小题分值必须大于 0』
  it('S5: 分值为负 → 抛"第2小题分值必须大于 0"', () => {
    const input = [{ score: 10 }, { score: -5 }];
    expect(() => resolveSubQuestionScores(input)).toThrow('第2小题分值必须大于 0');
  });

  // S6: 单小题填 100 分 → resolved 长度 1，totalScore=100
  it('S6: 单小题100分 → resolved=[{score:100}], totalScore=100', () => {
    const result = resolveSubQuestionScores([{ score: 100 }]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].score).toBe(100);
    expect(result.totalScore).toBe(100);
  });

  // S7: 混合分值 → totalScore = 各小题分值之和（不再校验与外部满分一致）
  it('S7: 混合分值30/30/40 → totalScore=100', () => {
    const input = [{ score: 30 }, { score: 30 }, { score: 40 }];
    const result = resolveSubQuestionScores(input);
    expect(result.resolved.map(sq => sq.score)).toEqual([30, 30, 40]);
    expect(result.totalScore).toBe(100);
  });

  // 附加：分值支持小数（SubQuestion.score 为 Float），总和按分值累加
  it('附加: 小数分值 → totalScore 精确累加', () => {
    const input = [{ score: 20.5 }, { score: 30 }, { score: 49.5 }];
    const result = resolveSubQuestionScores(input);
    expect(result.resolved.map(sq => sq.score)).toEqual([20.5, 30, 49.5]);
    expect(result.totalScore).toBe(100);
  });

  // 附加：空数组 → resolved 为空，totalScore=0
  it('附加: 空数组 → resolved=[], totalScore=0', () => {
    const result = resolveSubQuestionScores([]);
    expect(result.resolved).toEqual([]);
    expect(result.totalScore).toBe(0);
  });
});
