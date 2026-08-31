// 值对象与领域常量（不可变、无副作用）

// 提交状态（对齐 prisma Submission.status 取值）
export const SubmissionStatus = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  AI_GRADED: 'ai_graded',
  MANUAL_GRADED: 'manual_graded',
  REVIEWED: 'reviewed',
});

// 题目类型（对齐 prisma Question.type 取值）
export const QuestionType = Object.freeze({
  SINGLE: 'single',
  MULTIPLE: 'multiple',
  FILL: 'fill',
  SHORT_ANSWER: 'short_answer',
  PROGRAMMING: 'programming',
  MIXED: 'mixed',
  PROJECT: 'project',
});

// 用户角色（对齐 prisma UserRole 枚举）
export const UserRole = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
});

// 分值值对象：校验分值合法（0 <= score <= max）
export function validateScore(score, max) {
  if (score == null || Number.isNaN(Number(score))) throw new Error('分值不能为空');
  const n = Number(score);
  if (n < 0) throw new Error('分值不能为负数');
  if (max != null && n > max) throw new Error('分值不能超过上限 ' + max);
  return n;
}

// 评分标准值对象：三引擎权重（默认 0.3/0.3/0.4）
export const DEFAULT_GRADING_WEIGHTS = Object.freeze({ machine: 0.3, ast: 0.3, ai: 0.4 });
