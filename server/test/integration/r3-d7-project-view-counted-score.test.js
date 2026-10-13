/**
 * r3-d7-project-view-counted-score.test.js —— R3-D7（t14 / F1）跨路径口径一致性验证。
 *
 * 背景：实训题学生视图 project-view.js#toStudentView 原先在【published + 口径 best + 教师未给分】时
 *   返回 score=null，而同一学生在作业详情/列表看到计入分 ⇒ 跨路径口径不一致（违反 US-B6 AC2）。
 *
 * 本文件对同一份提交同时对比四条路径（全部走真实 HTTP 接口）：
 *   ① 提交页（实训题视图）：GET /student/assignments/:aid/project/:qid → data.submission.score
 *   ② 作业详情：GET /student/assignments/:aid → data.submissions[].finalScore
 *   ③ 作业列表：GET /student/assignments → row.finalScore
 *   ④ 成绩页：GET /student/scores → totalScore
 * 断言口径（US-B4/B6）：published ⇒ 计入分（finalScore 优先；未给分时 best⇒bestScore / last⇒最新 aiScore）；
 *   未发布（reviewed / ai_graded）⇒ 四路径一律 null（安全边界不放宽：绝不泄漏 AI 原始分）。
 *
 * 数据自建自清（r3d7_ 前缀）。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'r3d7_';
const DAY = 86400000;
const now = () => Date.now();

let school, cls, teacher, stu;
let qProj;
const assignmentIds = [];
let tokStu;

const auth = (token) => ({ get: (u) => request().get(u).set('Authorization', 'Bearer ' + token) });
const envelope = () => JSON.stringify({ kind: 'project', currentVersion: 0, history: [], grading: { state: 'done', version: 0, startedAt: null, finishedAt: null, error: null } });

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

async function mkAssignment(title, { scorePolicy, answerVisibility = 'after_publish' }) {
  const a = await prisma.assignment.create({
    data: {
      teacherId: teacher.id, title: PREFIX + title,
      startTime: new Date(now() - DAY), endTime: new Date(now() + DAY),
      allowResubmit: true, maxAttempts: null, scorePolicy, answerVisibility,
      assignmentQuestions: { create: [{ questionId: qProj.id, sortOrder: 1 }] },
      assignmentClasses: { create: [{ classId: cls.id }] },
    },
  });
  assignmentIds.push(a.id);
  return a;
}

const mkSub = (assignmentId, data) => prisma.submission.create({
  data: {
    assignmentId, studentId: stu.id, questionId: qProj.id, answer: envelope(),
    attemptCount: 3, submittedAt: new Date(), ...data,
  },
});

/** 四条路径的分数（同一次请求内取全，便于逐条比对） */
async function scoresEverywhere(assignmentId) {
  const view = await auth(tokStu).get('/api/student/assignments/' + assignmentId + '/project/' + qProj.id);
  const detail = await auth(tokStu).get('/api/student/assignments/' + assignmentId);
  const list = await auth(tokStu).get('/api/student/assignments?pageSize=100');
  const scores = await auth(tokStu).get('/api/student/scores');
  expect(view.body.code).toBe(0);
  expect(detail.body.code).toBe(0);
  expect(list.body.code).toBe(0);
  expect(scores.body.code).toBe(0);
  const detailRow = detail.body.data.submissions.find((s) => s.questionId === qProj.id) || null;
  const listRow = list.body.data.list.find((a) => a.id === assignmentId) || null;
  const scoreRow = scores.body.data.find((s) => s.assignmentId === assignmentId) || null;
  return {
    view: { score: view.body.data.submission?.score ?? null, feedback: view.body.data.submission?.feedback ?? null },
    detail: { score: detailRow ? detailRow.finalScore : null, feedback: detailRow ? detailRow.teacherFeedback : null },
    list: { score: listRow ? listRow.finalScore : null },
    scores: { score: scoreRow ? scoreRow.totalScore : null },
  };
}

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const schools = await prisma.school.findMany({ where: { officialCode: '29701' }, select: { id: true } });
  const sids = schools.map((s) => s.id);
  const classes = await prisma.class.findMany({ where: { schoolId: { in: sids } }, select: { id: true } });
  const cids = classes.map((c) => c.id);
  const questions = await prisma.question.findMany({ where: { teacherId: { in: uids } }, select: { id: true } });
  const qids = questions.map((q) => q.id);
  const assignments = await prisma.assignment.findMany({ where: { teacherId: { in: uids } }, select: { id: true } });
  const aids = assignments.map((a) => a.id);
  await prisma.submission.deleteMany({ where: { OR: [{ questionId: { in: qids } }, { assignmentId: { in: aids } }] } });
  await prisma.assignmentQuestion.deleteMany({ where: { OR: [{ questionId: { in: qids } }, { assignmentId: { in: aids } }] } });
  await prisma.assignmentClass.deleteMany({ where: { OR: [{ assignmentId: { in: aids } }, { classId: { in: cids } }] } });
  await prisma.assignment.deleteMany({ where: { id: { in: aids } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: qids } } });
  await prisma.question.deleteMany({ where: { id: { in: qids } } });
  await prisma.studentClass.deleteMany({ where: { classId: { in: cids } } });
  await prisma.teacherClass.deleteMany({ where: { classId: { in: cids } } });
  await prisma.teacherSchool.deleteMany({ where: { schoolId: { in: sids } } });
  await prisma.class.deleteMany({ where: { id: { in: cids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
  await prisma.school.deleteMany({ where: { id: { in: sids } } });
}

beforeAll(async () => {
  await purge();
  school = await prisma.school.create({ data: { name: PREFIX + 'school', officialCode: '29701' } });
  cls = await prisma.class.create({ data: { name: PREFIX + 'class', schoolId: school.id } });
  teacher = await prisma.user.create({ data: { username: PREFIX + 'teacher', password: bcrypt.hashSync(PREFIX + 'teacher', 10), realName: 'D7教师', role: 'teacher' } });
  stu = await prisma.user.create({ data: { username: PREFIX + 'stu', password: bcrypt.hashSync(PREFIX + 'stu', 10), realName: 'D7学生', role: 'student' } });
  await prisma.teacherSchool.create({ data: { teacherId: teacher.id, schoolId: school.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: cls.id } });
  await prisma.studentClass.create({ data: { studentId: stu.id, classId: cls.id } });
  qProj = await prisma.question.create({ data: { teacherId: teacher.id, title: PREFIX + '实训题', maxScore: 100, difficulty: 'medium', type: 'project' } });
  tokStu = await login(stu.username);
}, 60000);

afterAll(async () => { await purge(); }, 60000);

describe('R3-D7 F1：实训题学生视图与其它路径的计入分口径一致（published）', () => {
  it('published + 口径 best + 教师未给分 ⇒ 四条路径都发计入分 91（原提交页为 null）', async () => {
    const a = await mkAssignment('best', { scorePolicy: 'best' });
    await mkSub(a.id, { status: 'published', aiScore: 78, bestScore: 91, finalScore: null, teacherFeedback: null });
    const s = await scoresEverywhere(a.id);
    expect(s.view.score).toBe(91);      // ① 提交页（本次修复点）
    expect(s.detail.score).toBe(91);    // ② 作业详情
    expect(s.list.score).toBe(91);      // ③ 作业列表
    expect(s.scores.score).toBe(91);    // ④ 成绩页
    expect(s.view.feedback).toBeNull(); // 教师未给评语
  });

  it('published + 口径 last + 教师未给分 ⇒ 四条路径都取最新一次 78（口径生效，非恒取最高）', async () => {
    const a = await mkAssignment('last', { scorePolicy: 'last' });
    await mkSub(a.id, { status: 'published', aiScore: 78, bestScore: 91, finalScore: null });
    const s = await scoresEverywhere(a.id);
    expect([s.view.score, s.detail.score, s.list.score, s.scores.score]).toEqual([78, 78, 78, 78]);
  });

  it('published + 教师已给分 ⇒ 四条路径都用教师分（不被机器分覆盖）', async () => {
    const a = await mkAssignment('teacher-wins', { scorePolicy: 'best' });
    await mkSub(a.id, { status: 'published', aiScore: 60, bestScore: 91, finalScore: 95, teacherFeedback: '教师定案' });
    const s = await scoresEverywhere(a.id);
    expect([s.view.score, s.detail.score, s.list.score, s.scores.score]).toEqual([95, 95, 95, 95]);
    expect(s.view.feedback).toBe('教师定案');
  });
});

describe('R3-D7 F1：未发布一律不下发（安全边界不放宽）', () => {
  it('reviewed（教师已给分但未发布）⇒ 四条路径一律 null', async () => {
    const a = await mkAssignment('reviewed', { scorePolicy: 'best' });
    await mkSub(a.id, { status: 'reviewed', aiScore: 78, bestScore: 91, finalScore: 90, teacherFeedback: '待发布' });
    const s = await scoresEverywhere(a.id);
    expect([s.view.score, s.detail.score, s.list.score, s.scores.score]).toEqual([null, null, null, null]);
    expect(s.view.feedback).toBeNull();
  });

  it('ai_graded（机器已评分、教师未定案）⇒ 四条路径一律 null，且不泄漏 AI 原文', async () => {
    const a = await mkAssignment('ai-graded', { scorePolicy: 'best' });
    await mkSub(a.id, { status: 'ai_graded', aiScore: 78, bestScore: 91, aiFeedback: PREFIX + 'AI原文绝密', finalScore: null });
    const view = await auth(tokStu).get('/api/student/assignments/' + a.id + '/project/' + qProj.id);
    const text = JSON.stringify(view.body);
    expect(view.body.data.submission.score).toBeNull();
    expect(view.body.data.submission.status).toBe('submitted');   // ai_graded 对学生映射为 submitted
    expect(text).not.toContain('aiScore');
    expect(text).not.toContain('aiFeedback');
    expect(text).not.toContain(PREFIX + 'AI原文绝密');
    const s = await scoresEverywhere(a.id);
    expect([s.view.score, s.detail.score, s.list.score, s.scores.score]).toEqual([null, null, null, null]);
  });
});
