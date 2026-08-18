/**
 * project-view.test.js — utils/projectView.js 白名单视图单元测试（离线）。
 * 安全关键：学生视图必须显式字段拷贝，绝不泄漏 aiScore/aiFeedback/grading/物理路径。
 */
import {
  parseProjectAnswer, serializeProjectAnswer,
  canStudentSeeScore, toStudentView, toTeacherView,
} from '../../../src/utils/projectView.js';

describe('parseProjectAnswer — answer JSON 解析', () => {
  it('null/undefined → 空信封', () => {
    const e = parseProjectAnswer(null);
    expect(e).toEqual({ kind: 'project', currentVersion: 0, history: [], grading: { state: 'none', version: 0, attempts: 0, error: null, prevStatus: null, ruleVersionHash: null } });
    expect(parseProjectAnswer(undefined)).toEqual(e);
    expect(parseProjectAnswer('')).toEqual(e);
  });

  it('合法 JSON 字符串 → 解析出信封字段', () => {
    const e = parseProjectAnswer(JSON.stringify({ kind: 'project', currentVersion: 3, history: ['v1'], grading: { state: 'grading', version: 2, attempts: 1, error: null } }));
    expect(e.currentVersion).toBe(3);
    expect(e.history).toEqual(['v1']);
    expect(e.grading.state).toBe('grading');
    expect(e.grading.version).toBe(2);
  });

  it('非法 JSON / 非对象 → 空信封（不抛错）', () => {
    expect(parseProjectAnswer('not json{{{')).toEqual(expect.objectContaining({ currentVersion: 0 }));
    expect(parseProjectAnswer('42')).toEqual(expect.objectContaining({ currentVersion: 0 }));
  });

  it('grading 字段缺省 → 默认 none/0', () => {
    const e = parseProjectAnswer(JSON.stringify({ currentVersion: 1, history: [] }));
    expect(e.grading).toEqual({ state: 'none', version: 0, attempts: 0, error: null, prevStatus: null, ruleVersionHash: null });
  });

  it('字符串数字字段 → Number 归一', () => {
    const e = parseProjectAnswer(JSON.stringify({ currentVersion: '5', grading: { version: '2', attempts: '3' } }));
    expect(e.currentVersion).toBe(5);
    expect(e.grading.version).toBe(2);
    expect(e.grading.attempts).toBe(3);
  });
});

describe('serializeProjectAnswer — 序列化', () => {
  it('信封 → JSON 字符串', () => {
    expect(serializeProjectAnswer({ kind: 'project', currentVersion: 1 })).toBe('{"kind":"project","currentVersion":1}');
  });
});

describe('canStudentSeeScore — 可见性', () => {
  it('仅 reviewed / published 可见', () => {
    expect(canStudentSeeScore('reviewed')).toBe(true);
    expect(canStudentSeeScore('published')).toBe(true);
    expect(canStudentSeeScore('ai_graded')).toBe(false);
    expect(canStudentSeeScore('submitted')).toBe(false);
    expect(canStudentSeeScore('draft')).toBe(false);
  });
});

describe('toStudentView — 学生视图白名单', () => {
  const submission = {
    id: 's1', questionId: 'q1', assignmentId: 'a1',
    status: 'ai_graded', submittedAt: new Date('2026-01-01'),
    finalScore: 88, teacherFeedback: '很好', aiScore: 99, aiFeedback: 'AI 内部',
    answer: JSON.stringify({ currentVersion: 2, grading: { state: 'grading', version: 1, attempts: 0, error: null } }),
  };

  it('ai_graded 对学生映射为 submitted（不暴露 AI 已打分）', () => {
    const v = toStudentView(submission, null);
    expect(v.status).toBe('submitted');
  });

  it('未审核（ai_graded）→ score/feedback 为 null，绝不回退 AI 分', () => {
    const v = toStudentView(submission, null);
    expect(v.score).toBeNull();
    expect(v.feedback).toBeNull();
    expect(v).not.toHaveProperty('aiScore');
    expect(v).not.toHaveProperty('aiFeedback');
    expect(v).not.toHaveProperty('grading');
    expect(v.gradingState).toBeNull(); // ai_graded 映射 submitted 后不展示进度
  });

  it('已审核（reviewed）→ 展示教师最终分与评语', () => {
    const v = toStudentView({ ...submission, status: 'reviewed' }, null);
    expect(v.score).toBe(88);
    expect(v.feedback).toBe('很好');
  });

  it('审核通过但未给分 → score 显示 null（—），不回退 AI 原始分', () => {
    const v = toStudentView({ ...submission, status: 'reviewed', finalScore: null, teacherFeedback: null }, null);
    expect(v.score).toBeNull();
    expect(v.feedback).toBeNull();
  });

  it('submitted 态 → gradingState 暴露后台进度', () => {
    const v = toStudentView({ ...submission, status: 'submitted' }, null);
    expect(v.gradingState).toBe('grading');
  });

  it('grading 缺省 → gradingState=pending', () => {
    const v = toStudentView({ ...submission, status: 'submitted', answer: '{}' }, null);
    expect(v.gradingState).toBe('pending');
  });
});

describe('toTeacherView — 教师视图字段齐全', () => {
  it('含 AI 原始分/评语/最终分/评分任务态', () => {
    const sub = {
      id: 's1', questionId: 'q1', assignmentId: 'a1', studentId: 'st1',
      status: 'ai_graded', submittedAt: null, attemptCount: 2,
      aiScore: 99, aiFeedback: 'AI', finalScore: null, teacherFeedback: null,
      answer: JSON.stringify({ currentVersion: 1, grading: { state: 'failed', version: 1, attempts: 3, error: 'timeout' } }),
    };
    const v = toTeacherView(sub);
    expect(v.aiScore).toBe(99);
    expect(v.aiFeedback).toBe('AI');
    expect(v.attemptCount).toBe(2);
    expect(v.version).toBe(1);
    expect(v.grading).toEqual({ state: 'failed', version: 1, attempts: 3, error: 'timeout', prevStatus: null, ruleVersionHash: null });
  });
});
