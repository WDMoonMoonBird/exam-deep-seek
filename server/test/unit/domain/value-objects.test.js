import {
  SubmissionStatus, QuestionType, UserRole, validateScore, DEFAULT_GRADING_WEIGHTS,
} from '../../../src/domain/value-objects.js';

describe('SubmissionStatus（对齐 prisma Submission.status）', () => {
  it('5 种状态取值，常量不可变', () => {
    expect(SubmissionStatus).toEqual({
      DRAFT: 'draft',
      SUBMITTED: 'submitted',
      AI_GRADED: 'ai_graded',
      MANUAL_GRADED: 'manual_graded',
      REVIEWED: 'reviewed',
    });
    expect(Object.isFrozen(SubmissionStatus)).toBe(true);
  });
});

describe('QuestionType（对齐 prisma Question.type）', () => {
  it('7 种题型取值，常量不可变', () => {
    expect(QuestionType).toEqual({
      SINGLE: 'single',
      MULTIPLE: 'multiple',
      FILL: 'fill',
      SHORT_ANSWER: 'short_answer',
      PROGRAMMING: 'programming',
      MIXED: 'mixed',
      PROJECT: 'project',
    });
    expect(Object.isFrozen(QuestionType)).toBe(true);
  });
});

describe('UserRole（对齐 prisma UserRole 枚举）', () => {
  it('3 种角色取值，常量不可变', () => {
    expect(UserRole).toEqual({
      SUPER_ADMIN: 'super_admin',
      TEACHER: 'teacher',
      STUDENT: 'student',
    });
    expect(Object.isFrozen(UserRole)).toBe(true);
  });
});

describe('DEFAULT_GRADING_WEIGHTS（三引擎评分权重）', () => {
  it('0.3/0.3/0.4，合计 1，不可变', () => {
    expect(DEFAULT_GRADING_WEIGHTS).toEqual({ machine: 0.3, ast: 0.3, ai: 0.4 });
    expect(DEFAULT_GRADING_WEIGHTS.machine + DEFAULT_GRADING_WEIGHTS.ast + DEFAULT_GRADING_WEIGHTS.ai).toBeCloseTo(1, 10);
    expect(Object.isFrozen(DEFAULT_GRADING_WEIGHTS)).toBe(true);
  });
});

describe('validateScore（分值校验 0 <= score <= max）', () => {
  it('null / undefined → 抛『分值不能为空』', () => {
    expect(() => validateScore(null)).toThrow('分值不能为空');
    expect(() => validateScore(undefined)).toThrow('分值不能为空');
  });

  it('非数字字符串 → 抛『分值不能为空』', () => {
    expect(() => validateScore('abc')).toThrow('分值不能为空');
  });

  it('负数 → 抛『分值不能为负数』', () => {
    expect(() => validateScore(-1)).toThrow('分值不能为负数');
  });

  it('超过上限 → 抛『分值不能超过上限 10』', () => {
    expect(() => validateScore(11, 10)).toThrow('分值不能超过上限 10');
  });

  it('等于上限 → 合法返回', () => {
    expect(validateScore(10, 10)).toBe(10);
  });

  it('0 分 → 合法', () => {
    expect(validateScore(0)).toBe(0);
  });

  it('小数与数字字符串 → 返回 Number 归一化结果', () => {
    expect(validateScore(5.5)).toBe(5.5);
    expect(validateScore('8')).toBe(8);
  });

  it('无上限 → 任意非负合法', () => {
    expect(validateScore(999)).toBe(999);
  });

  it('负数且带上限 → 优先报负分错误', () => {
    expect(() => validateScore(-5, 10)).toThrow('分值不能为负数');
  });

  it('空字符串 → 被 Number(\'\') 归一为 0（观测行为，见 DSGN）', () => {
    expect(validateScore('')).toBe(0);
  });
});
