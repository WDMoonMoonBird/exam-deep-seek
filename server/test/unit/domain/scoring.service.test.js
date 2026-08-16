import { resolveSubQuestionScores, weightedTotal, isAbnormal, ABNORMAL_FEEDBACK } from '../../../src/domain/services/scoring.service.js';

describe('ScoringService.resolveSubQuestionScores（现行语义：强制每题填分）', () => {
  it('未填分 → 抛 InvalidScoreError 带小题序号', () => {
    expect(() => resolveSubQuestionScores([{ score: null }])).toThrow('第1小题未设置分值');
  });
  it('第 2 小题未填分 → 错误信息带正确序号', () => {
    expect(() => resolveSubQuestionScores([{ score: 10 }, { score: null }, { score: 10 }])).toThrow('第2小题未设置分值');
  });
  it('分值为 0 → 抛『必须大于 0』', () => {
    expect(() => resolveSubQuestionScores([{ score: 0 }, { score: 10 }])).toThrow('第1小题分值必须大于 0');
  });
  it('分值为负 → 抛『必须大于 0』', () => {
    expect(() => resolveSubQuestionScores([{ score: 10 }, { score: -5 }])).toThrow('第2小题分值必须大于 0');
  });
  it('全填且 >0 → 原样返回并保留字段', () => {
    const r = resolveSubQuestionScores([{ score: 30, title: 'a' }, { score: 30, title: 'b' }, { score: 40, title: 'c' }]);
    expect(r.resolved).toHaveLength(3);
    expect(r.resolved[0]).toEqual({ score: 30, title: 'a' });
    expect(r.totalScore).toBe(100);
  });
  it('混合分值 → totalScore 为各小题之和（不校验与满分一致）', () => {
    const r = resolveSubQuestionScores([{ score: 20 }, { score: 20 }]);
    expect(r.resolved.map(sq => sq.score)).toEqual([20, 20]);
    expect(r.totalScore).toBe(40);
  });
  it('小数分值 → 精确累加', () => {
    const r = resolveSubQuestionScores([{ score: 20.5 }, { score: 30 }, { score: 49.5 }]);
    expect(r.totalScore).toBe(100);
  });
  it('空数组 → resolved 空、totalScore 0', () => {
    const r = resolveSubQuestionScores([]);
    expect(r.resolved).toEqual([]);
    expect(r.totalScore).toBe(0);
  });
  it('错误类型为 InvalidScoreError（code=INVALID_SCORE）', () => {
    try {
      resolveSubQuestionScores([{ score: null }]);
      throw new Error('应抛出而未抛出');
    } catch (e) {
      expect(e.name).toBe('InvalidScoreError');
      expect(e.code).toBe('INVALID_SCORE');
    }
  });
});

describe('ScoringService.weightedTotal（等价迁移 projectGrader.calculateTotal）', () => {
  it('默认权重 0.3/0.3/0.4 → 加权总分保留 1 位小数', () => {
    expect(weightedTotal(100, 100, 100)).toBe(100);
    expect(weightedTotal(100, 0, 0)).toBe(30);
    expect(weightedTotal(50, 50, 50)).toBe(50);
    expect(weightedTotal(33, 33, 33)).toBe(33);
  });
  it('自定义权重生效', () => {
    expect(weightedTotal(100, 0, 0, { machine: 1, ast: 0, ai: 0 })).toBe(100);
    expect(weightedTotal(10, 20, 30, { machine: 0.5, ast: 0.3, ai: 0.2 })).toBe(17);
  });
  it('缺失分值按 0 计', () => {
    expect(weightedTotal(null, undefined, 100)).toBe(40);
  });
});

describe('ScoringService.isAbnormal（AI 兜底异常判定）', () => {
  it('兜底反馈 → true', () => {
    expect(isAbnormal({ score: 0, feedback: ABNORMAL_FEEDBACK })).toBe(true);
  });
  it('正常结果 → false', () => {
    expect(isAbnormal({ score: 85, feedback: '很好' })).toBe(false);
  });
  it('空结果 → true（防御）', () => {
    expect(isAbnormal(null)).toBe(true);
    expect(isAbnormal(undefined)).toBe(true);
  });
});

describe('ScoringService.weightedTotal 边界（分值不变量观测）', () => {
  it('全 0 → 0', () => {
    expect(weightedTotal(0, 0, 0)).toBe(0);
  });

  it('NaN 按 0 计（falsy 兜底语义）', () => {
    expect(weightedTotal(NaN, NaN, NaN)).toBe(0);
  });

  it('自定义权重缺省字段回退默认 0.3/0.4', () => {
    expect(weightedTotal(100, 0, 0, { machine: 0.5 })).toBe(50);
  });

  it('负分透传不校验（观测行为，见 DSGN：加权总分缺分值不变量）', () => {
    expect(weightedTotal(-10, 0, 0)).toBe(-3);
  });
});

describe('ScoringService.resolveSubQuestionScores 边界', () => {
  it('score: undefined 与 null 等价 → 报未设置分值', () => {
    expect(() => resolveSubQuestionScores([{ score: undefined }])).toThrow('第1小题未设置分值');
  });
});