/**
 * r3-d4-switches-equivalence.test.js —— R3-D4（t5 / US-B5）等价性验证：
 * 「旧练习形态」（不限次重交 + 提交后可见答案 + 不计分）**可由三个开关复现**，且后端不再依赖 mode。
 *
 * 断言口径（全部走学生端真实接口）：
 *   ① 不限次重交：allowResubmit=true + maxAttempts=null ⇒ 连续两次提交都成功、attemptCount 递增；
 *   ② 提交后可见答案：answerVisibility='immediate' ⇒ 评分完成（ai_graded）即可见参考答案；
 *      对照 after_publish ⇒ 同样状态下参考答案为 null（安全边界不变）；
 *   ③ 不计分：未发布时 finalScore / bestScore 一律 null（哪怕 aiScore/bestScore 列有值）；
 *      发布后按作业口径取「计入分」（best ⇒ bestScore）；
 *   ④ 重新答题端点改由开关驱动：允许重交 + 不限次 ⇒ 200 重置；限次作业 ⇒ 400 明确拒绝。
 *
 * 数据自建自清（r3d4_ 前缀），不依赖 setup seed 之外的既有数据。
 */
import prisma from '../../src/utils/prisma.js';
import { request, loginAsStudent, getTestData } from './helpers.js';

const PREFIX = 'r3d4_';
const DAY = 86400000;
const now = () => Date.now();

let td;
let q;
const assignmentIds = [];

function sReq(token) {
  return {
    get: (u) => request().get(u).set('Authorization', 'Bearer ' + token),
    post: (u, b) => request().post(u).send(b).set('Authorization', 'Bearer ' + token),
  };
}

/** 建作业：显式传入三开关（等价于教师侧配置） */
async function mkAssignment({ title, questionId, allowResubmit, maxAttempts, scorePolicy, answerVisibility }) {
  const a = await prisma.assignment.create({
    data: {
      teacherId: td.teacherId,
      title: PREFIX + title,
      startTime: new Date(now() - DAY),
      endTime: new Date(now() + DAY),
      allowResubmit, maxAttempts, scorePolicy, answerVisibility,
      assignmentQuestions: { create: [{ questionId, sortOrder: 1 }] },
      assignmentClasses: { create: { classId: td.classId } },
    },
  });
  assignmentIds.push(a.id);
  return a;
}

beforeAll(async () => {
  td = getTestData();
  q = await prisma.question.create({
    data: {
      teacherId: td.teacherId, title: PREFIX + '题', maxScore: 100, difficulty: 'easy', type: 'code',
      subQuestions: {
        create: [{ sortOrder: 1, title: '小题', content: '<p>c</p>', referenceAnswer: 'print(1)', language: 'python', score: 100 }],
      },
    },
    include: { subQuestions: true },
  });
});

afterAll(async () => {
  await prisma.submission.deleteMany({ where: { questionId: q.id } });
  await prisma.assignmentQuestion.deleteMany({ where: { questionId: q.id } });
  await prisma.assignmentClass.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: q.id } });
  await prisma.question.deleteMany({ where: { id: q.id } });
});

describe('R3-D4 旧练习形态的开关等价性（US-B5 AC3）', () => {
  it('① 不限次重交：allowResubmit + maxAttempts=null ⇒ 连续两次提交成功，attemptCount 递增', async () => {
    const a = await mkAssignment({ title: '不限次', questionId: q.id, allowResubmit: true, maxAttempts: null, scorePolicy: 'best', answerVisibility: 'immediate' });
    const token = await loginAsStudent('test_stu_01');
    const post = (answer) => sReq(token).post('/api/student/assignments/' + a.id + '/submit', { questionId: q.id, answer });

    expect((await post('v1')).body.code).toBe(0);
    expect((await post('v2')).body.code).toBe(0);
    const row = await prisma.submission.findFirst({ where: { assignmentId: a.id, studentId: td.studentIds[0], questionId: q.id } });
    expect(row.attemptCount).toBe(2);
    expect(row.status).toBe('submitted');
  });

  it('② 提交后可见答案：immediate ⇒ ai_graded 即下发参考答案；after_publish ⇒ 不下发（对照）', async () => {
    const immediate = await mkAssignment({ title: '立即可见', questionId: q.id, allowResubmit: true, maxAttempts: null, scorePolicy: 'last', answerVisibility: 'immediate' });
    const after = await mkAssignment({ title: '发布后可见', questionId: q.id, allowResubmit: true, maxAttempts: null, scorePolicy: 'last', answerVisibility: 'after_publish' });
    for (const a of [immediate, after]) {
      await prisma.submission.create({
        data: { assignmentId: a.id, studentId: td.studentIds[1], questionId: q.id, subQuestionId: q.subQuestions[0].id, answer: 'x', status: 'ai_graded', aiScore: 60, bestScore: 60, attemptCount: 1, submittedAt: new Date() },
      });
    }
    const token = await loginAsStudent('test_stu_02');
    const subOf = async (a) => (await sReq(token).get('/api/student/assignments/' + a.id)).body.data.assignment.assignmentQuestions[0].question.subQuestions[0];

    expect((await subOf(immediate)).referenceAnswer).toBe('print(1)');
    expect((await subOf(after)).referenceAnswer).toBeNull();
  });

  it('③ 不计分：未发布时 finalScore/bestScore 均 null；发布后才按口径下发（best ⇒ bestScore）', async () => {
    const a = await mkAssignment({ title: '口径best', questionId: q.id, allowResubmit: true, maxAttempts: null, scorePolicy: 'best', answerVisibility: 'immediate' });
    const sub = await prisma.submission.create({
      data: { assignmentId: a.id, studentId: td.studentIds[0], questionId: q.id, subQuestionId: q.subQuestions[0].id, answer: 'x', status: 'ai_graded', aiScore: 78, bestScore: 85, attemptCount: 3, submittedAt: new Date() },
    });
    const token = await loginAsStudent('test_stu_01');
    const detail = async () => (await sReq(token).get('/api/student/assignments/' + a.id)).body.data.submissions.find((s) => s.questionId === q.id);

    const before = await detail();
    expect(before.finalScore).toBeNull();       // 未发布：不计分（原 practice 分支已移除）
    expect(before.bestScore).toBeNull();        // 未发布：最高分只给教师看（安全边界）

    await prisma.submission.update({ where: { id: sub.id }, data: { status: 'published' } });
    const afterPublish = await detail();
    expect(afterPublish.finalScore).toBe(85);   // 口径=取最高 ⇒ 机器分用 bestScore
    expect(afterPublish.bestScore).toBe(85);
  });

  it('④ 重新答题端点改由开关驱动：允许重交 + 不限次 ⇒ 200；限次 ⇒ 400 明确拒绝', async () => {
    const ok = await mkAssignment({ title: '可重置', questionId: q.id, allowResubmit: true, maxAttempts: null, scorePolicy: 'last', answerVisibility: 'immediate' });
    const limited = await mkAssignment({ title: '限次', questionId: q.id, allowResubmit: true, maxAttempts: 1, scorePolicy: 'last', answerVisibility: 'after_publish' });
    await prisma.submission.create({ data: { assignmentId: ok.id, studentId: td.studentIds[2], questionId: q.id, subQuestionId: q.subQuestions[0].id, answer: 'x', status: 'ai_graded', aiScore: 50, attemptCount: 1, submittedAt: new Date() } });
    await prisma.submission.create({ data: { assignmentId: limited.id, studentId: td.studentIds[2], questionId: q.id, subQuestionId: q.subQuestions[0].id, answer: 'x', status: 'ai_graded', aiScore: 50, attemptCount: 1, submittedAt: new Date() } });
    const token = await loginAsStudent('test_stu_03');

    const r1 = await sReq(token).post('/api/student/assignments/' + ok.id + '/retry', {});
    expect(r1.body.code).toBe(0);
    expect(r1.body.message).toBe('已重置');
    const reset = await prisma.submission.findFirst({ where: { assignmentId: ok.id, studentId: td.studentIds[2], questionId: q.id } });
    expect(reset.status).toBe('draft');

    const r2 = await sReq(token).post('/api/student/assignments/' + limited.id + '/retry', {});
    expect(r2.body.code).not.toBe(0);
    expect(r2.body.message).toContain('该作业不支持重新答题');
  });
});
