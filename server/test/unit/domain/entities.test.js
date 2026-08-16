import {
  Submission, User, Question, Assignment, ReviewResult,
  Project, ProjectSubmission, Team, School, Class,
} from '../../../src/domain/entities.js';
import { SubmissionStatus, QuestionType } from '../../../src/domain/value-objects.js';
import {
  SubmissionClosedError, DuplicateSubmissionError, IllegalStateError,
} from '../../../src/domain/errors.js';

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe('Submission 聚合：状态机与提交不变量', () => {
  it('构造默认：status=draft、submittedAt=null、字段透传', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x' });
    expect(s.status).toBe(SubmissionStatus.DRAFT);
    expect(s.submittedAt).toBeNull();
    expect(s.answer).toBe('x');
    expect(s.id).toBe(1);
  });

  it('submit：草稿 → submitted，记录 submittedAt=now', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x' });
    const now = new Date();
    s.submit({ endTime: future(), now });
    expect(s.status).toBe(SubmissionStatus.SUBMITTED);
    expect(s.submittedAt).toBe(now);
  });

  it('submit：已截止（now > endTime）→ SubmissionClosedError，状态不变', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x' });
    expect(() => s.submit({ endTime: past(), now: new Date() })).toThrow(SubmissionClosedError);
    expect(s.status).toBe(SubmissionStatus.DRAFT);
  });

  it('submit：now === endTime 边界 → 允许提交（截止为开区间）', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x' });
    const end = new Date();
    s.submit({ endTime: end, now: new Date(end.getTime()) });
    expect(s.status).toBe(SubmissionStatus.SUBMITTED);
  });

  it('submit：endTime 为空 → 不限制截止', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x' });
    s.submit({ endTime: null, now: new Date('2099-01-01') });
    expect(s.status).toBe(SubmissionStatus.SUBMITTED);
  });

  it('submit：alreadySubmitted=true → DuplicateSubmissionError', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x' });
    expect(() => s.submit({ endTime: future(), alreadySubmitted: true })).toThrow(DuplicateSubmissionError);
  });

  it('submit：非草稿状态重复提交 → DuplicateSubmissionError', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x', status: SubmissionStatus.SUBMITTED });
    expect(() => s.submit({ endTime: future() })).toThrow(DuplicateSubmissionError);
  });

  it('submit：错误分类稳定（code=SUBMISSION_CLOSED、message 透传）', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x' });
    try {
      s.submit({ endTime: past(), now: new Date() });
      throw new Error('应抛出而未抛出');
    } catch (e) {
      expect(e.code).toBe('SUBMISSION_CLOSED');
      expect(e.message).toBe('提交已截止');
    }
  });

  it('markGraded：草稿 → IllegalStateError', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x' });
    expect(() => s.markGraded()).toThrow(IllegalStateError);
  });

  it('markGraded：submitted → ai_graded（单向流转）', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x', status: SubmissionStatus.SUBMITTED });
    s.markGraded();
    expect(s.status).toBe(SubmissionStatus.AI_GRADED);
  });

  it('markGraded：ai_graded 再次评分 → IllegalStateError', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x', status: SubmissionStatus.AI_GRADED });
    expect(() => s.markGraded()).toThrow(IllegalStateError);
  });

  it('markGraded：reviewed 再次评分 → IllegalStateError', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x', status: SubmissionStatus.REVIEWED });
    expect(() => s.markGraded()).toThrow(IllegalStateError);
  });

  it('markGraded：manual_graded 现状 → 不抛错、流转为 ai_graded（观测行为，见 DSGN）', () => {
    const s = new Submission({ id: 1, assignmentId: 2, studentId: 3, questionId: 4, answer: 'x', status: SubmissionStatus.MANUAL_GRADED });
    s.markGraded();
    expect(s.status).toBe(SubmissionStatus.AI_GRADED);
  });
});

describe('User 角色判定', () => {
  it('teacher → isTeacher true', () => {
    const u = new User({ id: 1, username: 't', realName: 'T', role: 'teacher' });
    expect(u.isTeacher()).toBe(true);
    expect(u.isStudent()).toBe(false);
    expect(u.isAdmin()).toBe(false);
  });

  it('student → isStudent true', () => {
    const u = new User({ id: 1, username: 's', realName: 'S', role: 'student' });
    expect(u.isStudent()).toBe(true);
    expect(u.isTeacher()).toBe(false);
  });

  it('super_admin → isAdmin true', () => {
    const u = new User({ id: 1, username: 'a', realName: 'A', role: 'super_admin' });
    expect(u.isAdmin()).toBe(true);
  });

  it('未知角色 → 三项判定全 false', () => {
    const u = new User({ id: 1, username: 'x', realName: 'X', role: 'guest' });
    expect(u.isTeacher()).toBe(false);
    expect(u.isStudent()).toBe(false);
    expect(u.isAdmin()).toBe(false);
  });

  it('构造默认：lastSchoolId=null', () => {
    const u = new User({ id: 1, username: 't', realName: 'T', role: 'teacher' });
    expect(u.lastSchoolId).toBeNull();
  });
});

describe('Question 构造默认（分值不变量由 ScoringService 校验）', () => {
  it('默认 type=programming、maxScore=0、difficulty=medium、subQuestions=[]', () => {
    const q = new Question({ id: 1, title: '题' });
    expect(q.type).toBe(QuestionType.PROGRAMMING);
    expect(q.maxScore).toBe(0);
    expect(q.difficulty).toBe('medium');
    expect(q.subQuestions).toEqual([]);
    expect(q.teacherId).toBeUndefined();
  });
});

describe('Assignment.isOpen 提交窗口判定', () => {
  it('构造默认：startTime/endTime=null、mode=normal、classIds/questionIds=[]', () => {
    const a = new Assignment({ id: 1, teacherId: 1, title: '作业' });
    expect(a.startTime).toBeNull();
    expect(a.endTime).toBeNull();
    expect(a.mode).toBe('normal');
    expect(a.classIds).toEqual([]);
    expect(a.questionIds).toEqual([]);
  });

  it('无时间限制 → 恒开', () => {
    const a = new Assignment({ id: 1, teacherId: 1, title: '作业' });
    expect(a.isOpen(new Date('2000-01-01'))).toBe(true);
    expect(a.isOpen(new Date('2099-01-01'))).toBe(true);
  });

  it('startTime 未到 → 关闭；恰在 startTime → 开启（闭区间语义）', () => {
    const start = new Date('2026-08-16T00:00:00Z');
    const a = new Assignment({ id: 1, teacherId: 1, title: '作业', startTime: start });
    expect(a.isOpen(new Date('2026-08-15T00:00:00Z'))).toBe(false);
    expect(a.isOpen(new Date(start.getTime()))).toBe(true);
    expect(a.isOpen(new Date('2026-08-17T00:00:00Z'))).toBe(true);
  });

  it('endTime 已过 → 关闭；恰在 endTime → 开启（闭区间语义）', () => {
    const end = new Date('2026-08-16T00:00:00Z');
    const a = new Assignment({ id: 1, teacherId: 1, title: '作业', endTime: end });
    expect(a.isOpen(new Date('2026-08-17T00:00:00Z'))).toBe(false);
    expect(a.isOpen(new Date(end.getTime()))).toBe(true);
    expect(a.isOpen(new Date('2026-08-15T00:00:00Z'))).toBe(true);
  });

  it('startTime 未到 + endTime 为空 → 关闭（start 优先）', () => {
    const a = new Assignment({ id: 1, teacherId: 1, title: '作业', startTime: new Date('2099-01-01') });
    expect(a.isOpen(new Date('2026-08-16'))).toBe(false);
  });

  it('区间内 → 开启', () => {
    const a = new Assignment({
      id: 1, teacherId: 1, title: '作业',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
    });
    expect(a.isOpen(new Date('2026-08-16'))).toBe(true);
  });
});

describe('ReviewResult / Project / ProjectSubmission / Team / School / Class 构造', () => {
  it('ReviewResult 默认：id=null、source=ai、reviewedAt=null', () => {
    const r = new ReviewResult({ submissionId: 1, score: 90, feedback: '好' });
    expect(r.id).toBeNull();
    expect(r.source).toBe('ai');
    expect(r.reviewedAt).toBeNull();
    expect(r.score).toBe(90);
  });

  it('Project 默认：description=""、standardDir=null', () => {
    const p = new Project({ id: 1, teacherId: 1, title: '实训' });
    expect(p.description).toBe('');
    expect(p.standardDir).toBeNull();
  });

  it('ProjectSubmission 默认：versionDir=null、status=submitted', () => {
    const ps = new ProjectSubmission({ id: 1, projectId: 1, studentId: 1 });
    expect(ps.versionDir).toBeNull();
    expect(ps.status).toBe('submitted');
  });

  it('Team 默认：memberTeacherIds/classIds 为空数组', () => {
    const t = new Team({ id: 1, schoolId: 1, name: '队', creatorId: 1 });
    expect(t.memberTeacherIds).toEqual([]);
    expect(t.classIds).toEqual([]);
  });

  it('School 默认：officialCode=null', () => {
    const s = new School({ id: 1, name: '校' });
    expect(s.officialCode).toBeNull();
  });

  it('Class 字段透传', () => {
    const c = new Class({ id: 1, name: '班', schoolId: 2 });
    expect(c).toEqual({ id: 1, name: '班', schoolId: 2 });
  });
});
