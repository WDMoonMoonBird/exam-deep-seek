/**
 * rc-batch-guard-contract.test.js — reviewController 拆分（step 8）B0 契约护航：
 * batch-review / batch-publish 的**练习模式 400 分支**（Z5/Z6）与 publishScores 的**空入参 400**（Z12）。
 *
 * 背景（docs/split/reviewController-plan.md §5.2）：
 *   - Z5  batchReview(:331) 的 '练习模式无需审核' 400 —— 全仓 batch-review 请求体的 assignmentId
 *         全部指向 mode:'exam' 的作业；practice 作业夹具从未 POST 到 batch 端点。
 *   - Z6  batchPublish(:387) 的 '练习模式无需发布' 400 —— 同上。
 *   - Z12 publishScores(:425) 的 !submissionIds?.length → 400 '请选择提交' —— 全部既有请求都带了非空数组。
 *   三个分支都是「廉价 400」，但都是**拆分后最先被搬走的守卫**，必须逐字钉住 + 零写入断言。
 *
 * 断言口径：状态码 + code + 中文文案**逐字** + 关键 DB 终态（零写入）。
 * 夹具自建自清（rcb0b_ 前缀，独立学校院校代码 29431），不依赖 setup seed。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'rcb0b_';
const CODE = '29431';

let school, classA, classB, teacher, teacherOther;
let stuA, stuB;
let qCode, qProj;
let asgReviewPractice, asgPublishPractice, asgReviewExam, asgPublishExam, asgOther;
let asgPubReviewed, asgPubDone, asgInvisible;
const subs = {};

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  const classes = await prisma.class.findMany({
    where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }] },
    select: { id: true },
  });
  const classIds = classes.map(c => c.id);
  const questions = await prisma.question.findMany({
    where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] },
    select: { id: true },
  });
  const questionIds = questions.map(q => q.id);
  const assignments = await prisma.assignment.findMany({
    where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] },
    select: { id: true },
  });
  const assignmentIds = assignments.map(a => a.id);

  await prisma.submission.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] },
  });
  await prisma.assignmentClass.deleteMany({ where: { OR: [{ assignmentId: { in: assignmentIds } }, { classId: { in: classIds } }] } });
  await prisma.assignmentQuestion.deleteMany({ where: { OR: [{ assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] } });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  await prisma.teacherClass.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.studentClass.deleteMany({ where: { OR: [{ studentId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

const mkUser = (username, realName, role) => prisma.user.create({
  data: { username, password: bcrypt.hashSync(username, 10), realName, role },
});

async function seed() {
  await purge();

  school = await prisma.school.create({ data: { name: PREFIX + 'school', officialCode: CODE } });
  classA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: school.id } });
  classB = await prisma.class.create({ data: { name: PREFIX + 'class_b', schoolId: school.id } });

  teacher = await mkUser(PREFIX + 'teacher', 'B0批量教师', 'teacher');
  teacherOther = await mkUser(PREFIX + 'teacher_other', 'B0批量他师', 'teacher');
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: teacher.id, schoolId: school.id },
    { teacherId: teacherOther.id, schoolId: school.id },
  ] });
  // teacher 仅可见 classA；teacherOther 可见 classB（用于「同校不可见班级」反例）
  await prisma.teacherClass.createMany({ data: [
    { teacherId: teacher.id, classId: classA.id },
    { teacherId: teacherOther.id, classId: classB.id },
  ] });

  stuA = await mkUser(PREFIX + 'stu_a', 'B0批量生A', 'student');
  stuB = await mkUser(PREFIX + 'stu_b', 'B0批量生B', 'student');
  await prisma.studentClass.createMany({ data: [
    { studentId: stuA.id, classId: classA.id },
    { studentId: stuB.id, classId: classB.id },   // classB 对 teacher 不可见
  ] });

  qCode = await prisma.question.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '编程题', maxScore: 100, difficulty: 'easy', type: 'code',
      subQuestions: { create: [{ sortOrder: 1, title: PREFIX + '小1', type: 'code', score: 100, content: '<p>1</p>', referenceAnswer: 'x', language: 'python' }] },
    },
    include: { subQuestions: true },
  });
  qProj = await prisma.question.create({
    data: { teacherId: teacher.id, title: PREFIX + '实训题', maxScore: 100, difficulty: 'easy', type: 'project' },
  });

  const mkAsg = (teacherId, title, mode, classIds, questionIds) => prisma.assignment.create({
    data: {
      teacherId, title, mode,
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
    include: { assignmentQuestions: true },
  });
  asgReviewPractice = await mkAsg(teacher.id, PREFIX + '练习-待审核', 'practice', [classA.id], [qCode.id]);
  asgPublishPractice = await mkAsg(teacher.id, PREFIX + '练习-待发布', 'practice', [classA.id], [qCode.id]);
  asgReviewExam = await mkAsg(teacher.id, PREFIX + '考试-待审核', 'exam', [classA.id], [qCode.id]);
  asgPublishExam = await mkAsg(teacher.id, PREFIX + '考试-待发布', 'exam', [classA.id], [qCode.id]);
  asgOther = await mkAsg(teacherOther.id, PREFIX + '他师考试', 'exam', [classB.id], [qCode.id]);
  // 单条写端点需要「每个 (作业,班级,学生,小题) 至多一条提交」（schema 唯一约束）⇒ 逐槽位独立作业
  asgPubReviewed = await mkAsg(teacher.id, PREFIX + '考试-发布-rev', 'exam', [classA.id], [qCode.id]);
  asgPubDone = await mkAsg(teacher.id, PREFIX + '考试-发布-done', 'exam', [classA.id], [qCode.id]);
  asgInvisible = await mkAsg(teacherOther.id, PREFIX + '他师-不可见', 'exam', [classB.id], [qProj.id]);

  const sqA = qCode.subQuestions[0].id;
  const mkSub = (asg, question, subQuestionId, data) => prisma.submission.create({
    data: {
      assignmentId: asg.id, studentId: stuA.id, questionId: question.id, subQuestionId: subQuestionId ?? null,
      answer: data.answer ?? 'a', status: data.status, aiScore: data.aiScore ?? null, aiFeedback: data.aiFeedback ?? null,
      finalScore: data.finalScore ?? null, teacherFeedback: data.teacherFeedback ?? null,
      submittedAt: new Date('2026-02-01T10:00:00Z'),
    },
  });
  // 练习作业：各有一条「可被批量审核 / 可被批量发布」的提交（正例改用考试作业，这两条只做零写入反例）
  subs.reviewPractice = (await mkSub(asgReviewPractice, qCode, sqA, { status: 'ai_graded', aiScore: 40, aiFeedback: 'P_AI' })).id;
  subs.publishPractice = (await mkSub(asgPublishPractice, qCode, sqA, { status: 'reviewed', finalScore: 50, teacherFeedback: 'P_TF' })).id;
  // 考试作业：批量审核 / 批量发布各自的正例（studentSubs 只含本作业的提交 ⇒ 恰好 1 名学生）
  subs.reviewExam = (await mkSub(asgReviewExam, qCode, sqA, { status: 'ai_graded', aiScore: 60, aiFeedback: 'E_AI' })).id;
  subs.publishExam = (await mkSub(asgPublishExam, qCode, sqA, { status: 'reviewed', finalScore: 70, teacherFeedback: 'E_TF' })).id;
  // 发布端点专用：reviewed / published 两态（均在本教师可见的 classA 内）
  subs.publishReviewed = (await mkSub(asgPubReviewed, qCode, sqA, { status: 'reviewed', finalScore: 10 })).id;
  subs.publishDone = (await mkSub(asgPubDone, qCode, sqA, { status: 'published', finalScore: 20 })).id;
  // 不可见提交：学生 stuB 只属于 classB（对 teacher 不可见）⇒ publishScores 必须整批拒绝
  subs.invisible = (await prisma.submission.create({
    data: {
      assignmentId: asgInvisible.id, studentId: stuB.id, questionId: qProj.id, subQuestionId: null,
      answer: null, status: 'reviewed', finalScore: 30, submittedAt: new Date('2026-02-01T10:00:00Z'),
    },
  })).id;

  global.__rcb0b = {
    schoolId: school.id, classAId: classA.id, classBId: classB.id,
    teacherId: teacher.id, teacherOtherId: teacherOther.id,
    asgReviewPracticeId: asgReviewPractice.id, asgPublishPracticeId: asgPublishPractice.id,
    asgReviewExamId: asgReviewExam.id, asgPublishExamId: asgPublishExam.id, asgOtherId: asgOther.id,
    qProjId: qProj.id, subs,
  };
}

const ID = () => global.__rcb0b;
const post = (token, url, body) => request().post(url).set('Authorization', 'Bearer ' + token).send(body);
const put = (token, url, body) => request().put(url).set('Authorization', 'Bearer ' + token).send(body);
const DB = (id) => prisma.submission.findUnique({ where: { id } });

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

describe('reviewController B0 契约 · 批量端点练习模式 400 与发布空入参 400（Z5/Z6/Z12）', () => {
  let token, tokenOther;

  beforeAll(async () => {
    await seed();
    token = await login(PREFIX + 'teacher');
    tokenOther = await login(PREFIX + 'teacher_other');
  }, 60000);

  afterAll(async () => { await purge(); delete global.__rcb0b; }, 60000);

  it('T-D1: batch-review 练习模式 → 400/1001「练习模式无需审核」逐字，且 submission 零写入、零 $transaction', async () => {
    const id = ID();
    const before = await DB(id.subs.reviewPractice);
    expect(before.status).toBe('ai_graded');
    expect(before.finalScore).toBeNull();
    expect(before.teacherFeedback).toBeNull();

    const res = await post(token, '/api/teacher/submissions/batch-review', {
      schoolId: id.schoolId, classId: id.classAId, assignmentId: id.asgReviewPracticeId,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '练习模式无需审核', data: null });

    const after = await DB(id.subs.reviewPractice);
    expect(after.status).toBe(before.status);
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.teacherFeedback).toBe(before.teacherFeedback);
    expect(after.reviewedAt).toBeNull();
  });

  it('T-D2: batch-publish 练习模式 → 400/1001「练习模式无需发布」逐字，且 submission 零写入', async () => {
    const id = ID();
    const before = await DB(id.subs.publishPractice);
    expect(before.status).toBe('reviewed');

    const res = await post(token, '/api/teacher/submissions/batch-publish', {
      schoolId: id.schoolId, classId: id.classAId, assignmentId: id.asgPublishPracticeId,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '练习模式无需发布', data: null });

    const after = await DB(id.subs.publishPractice);
    expect(after.status).toBe('reviewed');
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.teacherFeedback).toBe(before.teacherFeedback);
  });

  it('T-D3: 对照正例 —— 同教师同班级的 exam 作业仍正常批量审核/发布（证明上面的 400 是 practice 专属而非短路）', async () => {
    const id = ID();
    const br = await post(token, '/api/teacher/submissions/batch-review', {
      schoolId: id.schoolId, classId: id.classAId, assignmentId: id.asgReviewExamId,
    });
    expect(br.status).toBe(200);
    expect(br.body.code).toBe(0);
    expect(br.body.message).toBe('已审核 1 名学生');
    expect(br.body.data).toEqual({ count: 1 });
    const reviewed = await DB(id.subs.reviewExam);
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.finalScore).toBe(60);          // = aiScore（既有语义）
    expect(reviewed.teacherFeedback).toBe('E_AI'); // 编程题 → 透传 AI 评语

    const bp = await post(token, '/api/teacher/submissions/batch-publish', {
      schoolId: id.schoolId, classId: id.classAId, assignmentId: id.asgPublishExamId,
    });
    expect(bp.status).toBe(200);
    expect(bp.body.code).toBe(0);
    expect(bp.body.message).toBe('已发布 1 名学生');
    expect(bp.body.data).toEqual({ count: 1 });
    expect((await DB(id.subs.publishExam)).status).toBe('published');
  });

  it('T-D4: publishScores 空入参（{} / [] / null）→ 400/1001「请选择提交」逐字，且零写入', async () => {
    const id = ID();
    const target = id.subs.publishReviewed;
    const before = await DB(target);
    expect(before.status).toBe('reviewed');

    for (const body of [{}, { submissionIds: [] }, { submissionIds: null }]) {
      const res = await put(token, '/api/teacher/submissions/publish', body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 1001, message: '请选择提交', data: null });
    }

    const after = await DB(target);
    expect(after.status).toBe('reviewed');
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.teacherFeedback).toBe(before.teacherFeedback);
  });

  it('T-D5: publishScores 不可见 id → 403/1003「部分提交不在可见范围内，已整批拒绝」+ rejectedIds，零写入', async () => {
    const id = ID();
    const target = id.subs.publishReviewed;
    const before = await DB(target);
    expect(before.status).toBe('reviewed');

    const res = await put(token, '/api/teacher/submissions/publish', { submissionIds: [target, id.subs.invisible] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    expect(res.body.message).toBe('部分提交不在可见范围内，已整批拒绝');
    expect(Object.keys(res.body).sort()).toEqual(['code', 'data', 'message']);
    expect(res.body.data.rejectedIds).toEqual([id.subs.invisible]);

    // 整批拒绝的原子性：可见的那条也不得生效
    expect((await DB(target)).status).toBe('reviewed');
    expect((await DB(id.subs.invisible)).status).toBe('reviewed');
  });

  it('T-D7: batch-review / batch-publish 班级不在可见集合 → 403/1003「无权操作该班级」逐字（classId 为他人班级 / 不存在）', async () => {
    const id = ID();
    // ① classId = 他人可见班级（同校但不在本教师可见集合）
    for (const url of ['/api/teacher/submissions/batch-review', '/api/teacher/submissions/batch-publish']) {
      const cross = await post(token, url, { schoolId: id.schoolId, classId: id.classBId, assignmentId: id.asgReviewExamId });
      expect(cross.status).toBe(403);
      expect(cross.body).toEqual({ code: 1003, message: '无权操作该班级', data: null });
    }
    // ② classId 为不存在的正整数（同样收敛到 403，不 fail-open）
    const ghost = await post(token, '/api/teacher/submissions/batch-review', { schoolId: id.schoolId, classId: 999999999, assignmentId: id.asgReviewExamId });
    expect(ghost.status).toBe(403);
    expect(ghost.body).toEqual({ code: 1003, message: '无权操作该班级', data: null });
  });

  it('T-D6: publishScores 全可见 → 200「发布成功」且只把 reviewed 改成 published（已 published 的不动）', async () => {
    const id = ID();
    const res = await put(token, '/api/teacher/submissions/publish', { submissionIds: [id.subs.publishReviewed, id.subs.publishDone] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0, message: '发布成功', data: null });
    expect((await DB(id.subs.publishReviewed)).status).toBe('published');
    expect((await DB(id.subs.publishDone)).status).toBe('published');
    expect((await DB(id.subs.publishDone)).finalScore).toBe(20);   // 分数不被本次发布改写
  });
});
