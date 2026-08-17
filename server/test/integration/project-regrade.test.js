/**
 * project-regrade.test.js — 实训题重新评分（与编程题对齐）。
 * 覆盖：reviewed 重评成功且最终分保留 / published 重评成功且状态保持 / 非实训题 400。
 * 说明：重评为异步队列，测试等待 Worker 落定后断言稳定态
 *（无学生文件 → Worker 标记 failed 并恢复 prevStatus，finalScore 保留）。
 */
import { request, loginAsTeacher, getTestData } from './helpers.js';
import prisma from '../../src/utils/prisma.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function envelope(extra = {}) {
  return JSON.stringify({
    kind: 'project',
    currentVersion: 1,
    history: [],
    grading: { state: 'done', version: 1, startedAt: null, finishedAt: null, error: null },
    ...extra,
  });
}

describe('实训题重新评分（与编程题对齐）', () => {
  let teacherToken;
  let td;
  let projectQuestion;
  let assignment;

  beforeAll(async () => {
    teacherToken = await loginAsTeacher();
    td = getTestData();
    const base = 'regrade_proj_' + Date.now();
    projectQuestion = await prisma.question.create({
      data: { teacherId: td.teacherId, title: base + '_q', maxScore: 100, difficulty: 'medium', type: 'project', material: '实训重评测试' },
    });
    assignment = await prisma.assignment.create({
      data: {
        teacherId: td.teacherId,
        title: base + '_a',
        startTime: new Date(Date.now() - 86400000),
        endTime: new Date(Date.now() + 86400000),
      },
    });
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { questionId: projectQuestion.id } });
    await prisma.question.delete({ where: { id: projectQuestion.id } });
    await prisma.assignment.delete({ where: { id: assignment.id } });
  });

  it('reviewed 状态可重评：最终分保留，状态不被降级', async () => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[0], questionId: projectQuestion.id,
        status: 'reviewed', aiScore: 88, finalScore: 90, answer: envelope(),
        submittedAt: new Date(), reviewedAt: new Date(),
      },
    });
    const r = await request().post(`/api/teacher/submissions/${sub.id}/project/regrade`).set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);

    // 等待 Worker 落定（无学生文件 → markFailed → 恢复 prevStatus）
    await sleep(3000);
    const after = await prisma.submission.findUnique({ where: { id: sub.id } });
    expect(after.status).toBe('reviewed');          // 不降级
    expect(after.finalScore).toBe(90);              // 最终分保留
    const env = JSON.parse(after.answer);
    expect(env.grading.state).toBe('failed');       // 无文件 → 标记失败（稳定态）
    expect(env.grading.prevStatus).toBe('reviewed');
  });

  it('published 状态也可重评：状态保持 published，最终分保留', async () => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[1], questionId: projectQuestion.id,
        status: 'published', aiScore: 75, finalScore: 80, answer: envelope(),
        submittedAt: new Date(), reviewedAt: new Date(),
      },
    });
    const r = await request().post(`/api/teacher/submissions/${sub.id}/project/regrade`).set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);

    await sleep(3000);
    const after = await prisma.submission.findUnique({ where: { id: sub.id } });
    expect(after.status).toBe('published');
    expect(after.finalScore).toBe(80);
  });

  it('编程题（非 project）提交重评 → 400', async () => {
    const codeQuestion = await prisma.question.create({
      data: { teacherId: td.teacherId, title: 'regrade_code_q', maxScore: 10, difficulty: 'easy', type: 'code', material: '' },
    });
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[0], questionId: codeQuestion.id,
        status: 'ai_graded', aiScore: 5, finalScore: 6, answer: 'code answer',
        submittedAt: new Date(),
      },
    });
    const r = await request().post(`/api/teacher/submissions/${sub.id}/project/regrade`).set('Authorization', 'Bearer ' + teacherToken);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe(1001);
    await prisma.submission.delete({ where: { id: sub.id } });
    await prisma.question.delete({ where: { id: codeQuestion.id } });
  });
});