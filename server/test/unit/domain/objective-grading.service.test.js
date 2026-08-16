import { gradeObjectiveItems, gradeFlatObjective, normalizeAiScore } from '../../../src/domain/services/objective-grading.service.js';

describe('gradeObjectiveItems（等价迁移 gradingWorker 客观题分支）', () => {
  it('单选：对得全分，错不得分', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'choice', answer: 'A' }, { key: 1, type: 'choice', answer: 'B' }],
      answers: [{ key: 0, answer: 'A' }, { key: 1, answer: 'C' }],
      sqScore: 100,
    });
    expect(r.score).toBe(50);
    expect(r.correctCount).toBe(1);
    expect(r.itemCount).toBe(2);
    expect(r.feedback).toContain('1/2 正确');
    expect(r.feedback).toContain('✓');
    expect(r.feedback).toContain('✗');
  });

  it('多选：全对满分；漏选/错选按 partial 策略部分得分', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'multi_choice', answer: ['A', 'B', 'C'] }],
      answers: [{ key: 0, answer: 'A,B' }],
      sqScore: 30,
      objectiveSettings: { multiChoiceScoring: 'partial' },
    });
    // correctOpts=2, answerSet.size=3 → partial=20，无错选 → 20 分
    expect(r.score).toBe(20);
    expect(r.feedback).toContain('△');
  });

  it('多选：未作答不得分', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'multi_choice', answer: 'A,B' }],
      answers: [],
      sqScore: 30,
    });
    expect(r.score).toBe(0);
    expect(r.feedback).toContain('未作答');
  });

  it('判断：true/false 字符串精确比较', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'judge', answer: 'true' }, { key: 1, type: 'judge', answer: 'false' }],
      answers: [{ key: 0, answer: 'true' }, { key: 1, answer: 'true' }],
      sqScore: 20,
    });
    expect(r.score).toBe(10);
    expect(r.feedback).toContain('正确答案: 对');
  });

  it('填空：多空按空得分，忽略大小写', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'fill', answer: 'String[],length' }],
      answers: [{ key: 0, answer: 'string[],length' }],
      sqScore: 20,
    });
    expect(r.score).toBe(20);
    expect(r.feedback).toContain('2/2空正确');
  });

  it('未填分项：按 sqScore/itemCount 均摊', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'choice', answer: 'A' }, { key: 1, type: 'choice', answer: 'A' }],
      answers: [{ key: 0, answer: 'A' }],
      sqScore: 100,
    });
    expect(r.score).toBe(50);
  });
});

describe('gradeFlatObjective（扁平客观题）', () => {
  it('choice 对 → 满分；错 → 0 分', () => {
    expect(gradeFlatObjective({ type: 'choice', studentAnswer: 'A', referenceAnswer: 'A', score: 10 }).score).toBe(10);
    expect(gradeFlatObjective({ type: 'choice', studentAnswer: 'B', referenceAnswer: 'A', score: 10 })).toEqual({ score: 0, feedback: '错误，正确答案：A', correct: false });
  });
  it('multi_choice 无序集合比较', () => {
    expect(gradeFlatObjective({ type: 'multi_choice', studentAnswer: 'B,A', referenceAnswer: 'A,B', score: 10 }).correct).toBe(true);
    expect(gradeFlatObjective({ type: 'multi_choice', studentAnswer: 'A', referenceAnswer: 'A,B', score: 10 }).correct).toBe(false);
  });
  it('fill 单空忽略大小写；多空不自动判对', () => {
    expect(gradeFlatObjective({ type: 'fill', studentAnswer: 'str', referenceAnswer: 'Str', score: 5 }).correct).toBe(true);
    const multi = gradeFlatObjective({ type: 'fill', studentAnswer: 'a,b', referenceAnswer: 'a,b', score: 5 });
    expect(multi.correct).toBe(false);
    expect(multi.feedback).toContain('多空题');
  });
  it('judge 精确比较', () => {
    expect(gradeFlatObjective({ type: 'judge', studentAnswer: 'true', referenceAnswer: 'true', score: 5 }).correct).toBe(true);
  });
});

describe('normalizeAiScore（AI 分数归一化）', () => {
  it('score > max*2 且 max<100 → 按比例折算', () => {
    expect(normalizeAiScore(120, 50)).toBe(60);
    expect(normalizeAiScore(250, 40)).toBe(100);
  });
  it('不满足条件 → 原样返回', () => {
    expect(normalizeAiScore(80, 50)).toBe(80);
    expect(normalizeAiScore(150, 100)).toBe(150);
    expect(normalizeAiScore(30, 50)).toBe(30);
  });
});