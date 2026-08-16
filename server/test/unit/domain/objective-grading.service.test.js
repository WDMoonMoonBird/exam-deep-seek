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

describe('gradeObjectiveItems 补充分支', () => {
  it('多选 all-or-nothing 策略：未全对 → 0 分 + ✗ 反馈', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'multi_choice', answer: 'A,B' }],
      answers: [{ key: 0, answer: 'A' }],
      sqScore: 30,
      objectiveSettings: { multiChoiceScoring: 'all-or-nothing' },
    });
    expect(r.score).toBe(0);
    expect(r.feedback).toContain('✗（答案: A，正确: A,B）');
  });

  it('多选 partial：含错选 → 部分得分扣错选（对1错1漏2 → 10-1=9）', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'multi_choice', answer: ['A', 'B', 'C'] }],
      answers: [{ key: 0, answer: 'A,D' }],
      sqScore: 30,
      objectiveSettings: { multiChoiceScoring: 'partial' },
    });
    expect(r.score).toBe(9);
    expect(r.feedback).toContain('△ 部分正确（对1错1漏2，得9/30分）');
  });

  it('多选：字符串参考答案全对（顺序无关）', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'multi_choice', answer: 'A,B' }],
      answers: [{ key: 0, answer: 'B,A' }],
      sqScore: 20,
    });
    expect(r.score).toBe(20);
    expect(r.feedback).toContain('✓（全对）');
  });

  it('单选：学生答案带空白 → trim 后判对', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'choice', answer: 'A' }],
      answers: [{ key: 0, answer: ' A ' }],
      sqScore: 10,
    });
    expect(r.score).toBe(10);
    expect(r.correctCount).toBe(1);
  });

  it('判断：答错 → ✗；参考答案 true 显示『对』、false 显示『错』', () => {
    const r1 = gradeObjectiveItems({
      items: [{ key: 0, type: 'judge', answer: 'true' }],
      answers: [{ key: 0, answer: 'false' }],
      sqScore: 10,
    });
    expect(r1.score).toBe(0);
    expect(r1.feedback).toContain('✗（你的答案: false，正确答案: 对）');
    const r2 = gradeObjectiveItems({
      items: [{ key: 0, type: 'judge', answer: 'false' }],
      answers: [{ key: 0, answer: 'true' }],
      sqScore: 10,
    });
    expect(r2.feedback).toContain('正确答案: 错');
  });

  it('填空：部分对 → 按空得分，correctCount 不计数', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'fill', answer: 'a,b,c' }],
      answers: [{ key: 0, answer: 'a,b,x' }],
      sqScore: 30,
    });
    expect(r.score).toBe(20);
    expect(r.correctCount).toBe(0);
    expect(r.feedback).toContain('2/3空正确（得分 20/30）');
  });

  it('填空：学生多答 → 按 max 空数均摊（观测行为，见 DSGN）', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'fill', answer: 'a,b' }],
      answers: [{ key: 0, answer: 'a,b,c,d' }],
      sqScore: 30,
    });
    expect(r.score).toBe(15);
    expect(r.feedback).toContain('2/4空正确（得分 15/30）');
  });

  it('显式 item.score → 覆盖均摊默认值', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'choice', answer: 'A', score: 12 }],
      answers: [{ key: 0, answer: 'A' }],
      sqScore: 100,
    });
    expect(r.score).toBe(12);
  });

  it('多选未传 objectiveSettings → 默认 partial 策略', () => {
    const r = gradeObjectiveItems({
      items: [{ key: 0, type: 'multi_choice', answer: 'A,B,C' }],
      answers: [{ key: 0, answer: 'A,B' }],
      sqScore: 30,
    });
    // correctOpts=2, answerSet.size=3 → partial=20，无错选 → 20 分
    expect(r.score).toBe(20);
    expect(r.feedback).toContain('△');
  });
});

describe('gradeFlatObjective 补充分支', () => {
  it('fill 单空答错 → 0 分 + 参考答案反馈', () => {
    expect(gradeFlatObjective({ type: 'fill', studentAnswer: 'B', referenceAnswer: 'A', score: 5 }))
      .toEqual({ score: 0, feedback: '错误，参考答案：A', correct: false });
  });

  it('judge 答错 → 0 分 + 正确答案反馈', () => {
    expect(gradeFlatObjective({ type: 'judge', studentAnswer: 'false', referenceAnswer: 'true', score: 5 }))
      .toEqual({ score: 0, feedback: '错误，正确答案：true', correct: false });
  });

  it('满分 0 且答对 → score 0（(score||0) 语义）', () => {
    expect(gradeFlatObjective({ type: 'choice', studentAnswer: 'A', referenceAnswer: 'A', score: 0 }))
      .toEqual({ score: 0, feedback: '正确', correct: true });
  });

  it('multi_choice：学生答案含重复选项 → 集合去重后判对', () => {
    expect(gradeFlatObjective({ type: 'multi_choice', studentAnswer: 'A,A,B', referenceAnswer: 'A,B', score: 10 }).correct).toBe(true);
  });

  it('multi_choice：未作答 → 错误', () => {
    expect(gradeFlatObjective({ type: 'multi_choice', studentAnswer: '', referenceAnswer: 'A,B', score: 10 }))
      .toEqual({ score: 0, feedback: '错误，正确答案：A,B', correct: false });
  });
});

describe('normalizeAiScore 补充边界', () => {
  it('score === max*2 边界 → 不归一化', () => {
    expect(normalizeAiScore(100, 50)).toBe(100);
  });

  it('max=0 → 折算为 0（观测行为）', () => {
    expect(normalizeAiScore(5, 0)).toBe(0);
  });

  it('负分 → 原样返回（无下界校验）', () => {
    expect(normalizeAiScore(-10, 50)).toBe(-10);
  });
});