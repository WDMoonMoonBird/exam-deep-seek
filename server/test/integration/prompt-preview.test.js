/**
 * prompt-preview.test.js — AI 提示词查看接口（教师可见，与实评共用构建函数）。
 * 覆盖：编程题模板预览 / 实训题模板预览 / 编程题实际提示词（含学生答案）/ 实训题实际提示词。
 * R6（开放性题目）：提示词预览按有无标准工程包选角色与构建函数——有包 → PROJECT_ROLE +
 * buildProjectGradePrompt（含标准答案源码段）；无包 → OPEN_PROJECT_ROLE +
 * buildOpenProjectGradePrompt（开放性题目，不得出现「标准答案源码」段）。
 */
import fs from 'fs';
import path from 'path';
import { request, loginAsTeacher, getTestData } from './helpers.js';
import prisma from '../../src/utils/prisma.js';
import { standardDir, STANDARDS_ROOT } from '../../src/utils/projectPaths.js';

describe('AI 提示词查看（教师）', () => {
  let teacherToken;
  let td;
  let codeQuestion;
  let projectQuestion;
  let stdProjectQuestion;
  let assignment;
  /** 本套件创建的标准包目录（question 目录），afterAll 清理 */
  const stdQuestionDirs = [];

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
    // 有标准工程包的实训题（目录 + attachmentUrl 与建题上传流程落库后的形态一致）
    stdProjectQuestion = await prisma.question.create({
      data: { teacherId: td.teacherId, title: base + '_proj_std', maxScore: 100, difficulty: 'medium', type: 'project', material: '实现用户管理系统', scoringRubric: '功能50% 规范25% 健壮25%' },
    });
    const stdDir = standardDir(stdProjectQuestion.id);
    fs.mkdirSync(stdDir, { recursive: true });
    fs.writeFileSync(path.join(stdDir, 'main.py'), 'def main():\n    print("standard")\n');
    stdQuestionDirs.push(path.dirname(stdDir));
    stdProjectQuestion = await prisma.question.update({
      where: { id: stdProjectQuestion.id },
      data: { attachmentUrl: `project-questions/${stdProjectQuestion.id}/standard` },
    });
    assignment = await prisma.assignment.create({
      data: { teacherId: td.teacherId, title: base + '_a', startTime: new Date(Date.now() - 86400000), endTime: new Date(Date.now() + 86400000) },
    });
  });

  afterAll(async () => {
    const qids = [codeQuestion.id, projectQuestion.id, stdProjectQuestion.id];
    await prisma.submission.deleteMany({ where: { questionId: { in: qids } } });
    await prisma.subQuestion.deleteMany({ where: { questionId: codeQuestion.id } });
    await prisma.question.deleteMany({ where: { id: { in: qids } } });
    await prisma.assignment.delete({ where: { id: assignment.id } });
    // 只清理本套件创建的标准包目录：先确认目标确实位于 uploads/project-questions 之内
    for (const dir of stdQuestionDirs) {
      if (dir.startsWith(STANDARDS_ROOT + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
    }
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

  it('实训题模板预览（开放性题目，无标准包）：mode=open + 无「标准答案源码」段', async () => {
    const r = await request().get('/api/teacher/questions/' + projectQuestion.id + '/project-prompt-preview').set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);
    expect(r.body.data.type).toBe('project');
    expect(r.body.data.mode).toBe('open');
    expect(r.body.data.system).toContain('计算机专业教授');
    expect(r.body.data.system).toContain('没有标准答案或参考答案可供对比');
    expect(r.body.data.user).toContain('用户管理系统');
    expect(r.body.data.user).toContain('学生提交的工程文件将在此拼接');
    // 开放性题目不得出现标准答案段（预览必须等于实评）
    expect(r.body.data.user).not.toContain('标准答案');
  });

  it('实训题模板预览（有标准工程包）：mode=standard + 含「标准答案源码」段', async () => {
    const r = await request().get('/api/teacher/questions/' + stdProjectQuestion.id + '/project-prompt-preview').set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);
    expect(r.body.data.type).toBe('project');
    expect(r.body.data.mode).toBe('standard');
    expect(r.body.data.system).toContain('请对比标准答案和学生提交的项目代码');
    expect(r.body.data.system).not.toContain('没有标准答案');
    expect(r.body.data.user).toContain('=== 标准答案源码');
    expect(r.body.data.user).toContain('def main():');
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

  it('实训题实际提示词（开放性题目）：无版本时返回占位，mode=open 且无标准答案段', async () => {
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
    expect(r.body.data.mode).toBe('open');
    expect(r.body.data.system).toContain('计算机专业教授');
    expect(r.body.data.user).toContain('用户管理系统');
    expect(r.body.data.user).toContain('【学生尚未提交有效版本】');
    expect(r.body.data.user).not.toContain('标准答案');
    await prisma.submission.delete({ where: { id: sub.id } });
  });

  it('实训题实际提示词（有标准工程包）：mode=standard + 含「标准答案源码」段', async () => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[1], questionId: stdProjectQuestion.id,
        status: 'submitted', aiScore: null,
        answer: JSON.stringify({ kind: 'project', currentVersion: 0, history: [], grading: { state: 'pending', version: 0, startedAt: null, finishedAt: null, error: null } }),
        submittedAt: new Date(),
      },
    });
    const r = await request().get('/api/teacher/submissions/' + sub.id + '/project/prompt').set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);
    expect(r.body.data.mode).toBe('standard');
    expect(r.body.data.system).toContain('请对比标准答案和学生提交的项目代码');
    expect(r.body.data.user).toContain('=== 标准答案源码');
    expect(r.body.data.user).toContain('def main():');
    expect(r.body.data.user).toContain('【学生尚未提交有效版本】');
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