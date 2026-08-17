/**
 * prompt-preview.test.js — AI 提示词查看接口（教师可见，与实评共用构建函数）。
 * 覆盖：编程题模板预览 / 实训题模板预览 / 编程题实际提示词（含学生答案）/ 实训题实际提示词。
 */
import { request, loginAsTeacher, getTestData } from './helpers.js';
import prisma from '../../src/utils/prisma.js';

describe('AI 提示词查看（教师）', () => {
  let teacherToken;
  let td;
  let codeQuestion;
  let projectQuestion;
  let assignment;

  beforeAll(async () => {
    teacherToken = await loginAsTeacher();
    td = getTestData();
    const base = 'prompt_' + Date.now();
    codeQuestion = await prisma.question.create({
      data: {
        teacherId: td.teacherId, title: base + '_code', maxScore: 100, difficulty: 'medium', type: 'code', material: '大题材料说明',
        subQuestions: { create: [{ sortOrder: 0, title: '编写排序函数', type: 'code', score: 100, content: '实现冒泡排序', referenceAnswer: 'def sort(arr): return sorted(arr)', language: 'python', scoringCriteria: '正确性60% 效率20% 可读性20%' }] },
      },
      include: { subQuestions: true },
    });
    projectQuestion = await prisma.question.create({
      data: { teacherId: td.teacherId, title: base + '_proj', maxScore: 100, difficulty: 'medium', type: 'project', material: '实现用户管理系统', scoringRubric: '功能50% 规范25% 健壮25%' },
    });
    assignment = await prisma.assignment.create({
      data: { teacherId: td.teacherId, title: base + '_a', startTime: new Date(Date.now() - 86400000), endTime: new Date(Date.now() + 86400000) },
    });
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { questionId: { in: [codeQuestion.id, projectQuestion.id] } } });
    await prisma.subQuestion.deleteMany({ where: { questionId: codeQuestion.id } });
    await prisma.question.deleteMany({ where: { id: { in: [codeQuestion.id, projectQuestion.id] } } });
    await prisma.assignment.delete({ where: { id: assignment.id } });
  });

  it('编程题模板预览：每小题返回 system + user（学生答案占位）', async () => {
    const r = await request().get('/api/teacher/questions/' + codeQuestion.id + '/prompt-preview').set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);
    expect(r.body.data.type).toBe('code');
    expect(r.body.data.subs.length).toBe(1);
    const sub = r.body.data.subs[0];
    expect(sub.system).toContain('高校教师');
    expect(sub.user).toContain('实现冒泡排序');
    expect(sub.user).toContain('参考答案');
    expect(sub.user).toContain('学生提交的答案将在此拼接');
  });

  it('实训题模板预览：system + user（学生代码占位，标准答案源码拼接）', async () => {
    const r = await request().get('/api/teacher/questions/' + projectQuestion.id + '/project-prompt-preview').set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);
    expect(r.body.data.type).toBe('project');
    expect(r.body.data.system).toContain('计算机专业教授');
    expect(r.body.data.user).toContain('用户管理系统');
    expect(r.body.data.user).toContain('学生提交的工程文件将在此拼接');
  });

  it('编程题实际提示词：含学生答案与评分标准', async () => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[0], questionId: codeQuestion.id, subQuestionId: codeQuestion.subQuestions[0].id,
        status: 'ai_graded', aiScore: 80, answer: 'print(1)'
        , submittedAt: new Date(),
      },
    });
    const r = await request().get('/api/teacher/submissions/' + sub.id + '/prompt').set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);
    expect(r.body.data.system).toContain('高校教师');
    expect(r.body.data.system).toContain('正确性60%');
    expect(r.body.data.user).toContain('print(1)');
    await prisma.submission.delete({ where: { id: sub.id } });
  });

  it('实训题实际提示词：无版本时返回占位，接口正常', async () => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[1], questionId: projectQuestion.id,
        status: 'submitted', aiScore: null,
        answer: JSON.stringify({ kind: 'project', currentVersion: 0, history: [], grading: { state: 'pending', version: 0, startedAt: null, finishedAt: null, error: null } }),
        submittedAt: new Date(),
      },
    });
    const r = await request().get('/api/teacher/submissions/' + sub.id + '/project/prompt').set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);
    expect(r.body.data.type).toBe('project');
    expect(r.body.data.system).toContain('计算机专业教授');
    expect(r.body.data.user).toContain('用户管理系统');
    await prisma.submission.delete({ where: { id: sub.id } });
  });

  it('非实训题提交请求项目提示词 → 400', async () => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[2], questionId: codeQuestion.id, subQuestionId: codeQuestion.subQuestions[0].id,
        status: 'ai_graded', aiScore: 80, answer: 'x=1'
        , submittedAt: new Date(),
      },
    });
    const r = await request().get('/api/teacher/submissions/' + sub.id + '/project/prompt').set('Authorization', 'Bearer ' + teacherToken);
    expect(r.status).toBe(400);
    await prisma.submission.delete({ where: { id: sub.id } });
  });
});