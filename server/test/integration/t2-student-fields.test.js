/**
 * Batch1 · T2 学生端字段补齐与泄露修复契约测试
 *
 * 覆盖：
 *   - 冻结契约 1：GET /api/student/assignments 补 5 字段
 *     （submittedAt / answeredCount / finalScore / maxScore / attemptCount）+ keyword 按 title 生效
 *   - 安全红线：响应体不得出现 aiScore / aiFeedback 的【字段名】
 *     （字段级断言 + JSON 全文本扫描，而非「值为 null」断言）
 *   - 冻结契约 2b：GET /api/student/assignments/:id 改为显式白名单，
 *     published 整行（含 aiScore/aiFeedback）不再下发；R3-D4（US-B5）后未发布一律不下发分数/评语（无 practice 例外）
 *
 * 数据自建自清（t2f_ 前缀），不依赖 setup seed，也不污染其它套件。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 't2f_';
const SCHOOL_CODE = '29901';
const SECRET_AI = PREFIX + 'AI评语-绝不下发学生';
const SECRET_FB = PREFIX + '教师批语';

const T1D = new Date('2026-02-01T10:00:00Z');
const T2D = new Date('2026-02-01T11:00:00Z');
const T3D = new Date('2026-02-01T12:00:00Z');

let teacher, school, cls;
let stuPub, stuUnpub, stuPractice, stuEmpty;
let q1, q2, aExamPub, aExamUnpub, aPractice;
let sq1a, sq1b, sq2a;

/** 按前缀彻底清理本套件数据（幂等，可清掉上次崩溃残留） */
async function cleanup() {
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
  await prisma.teamClass.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.teamTeacher.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.team.deleteMany({ where: { OR: [{ createdBy: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

async function seed() {
  await cleanup();
  school = await prisma.school.create({ data: { name: PREFIX + 'school', officialCode: SCHOOL_CODE } });
  cls = await prisma.class.create({ data: { name: PREFIX + 'class', schoolId: school.id } });
  teacher = await prisma.user.create({
    data: { username: PREFIX + 'teacher', password: bcrypt.hashSync(PREFIX + 'teacher', 10), realName: 'T2 教师', role: 'teacher' },
  });
  await prisma.teacherSchool.create({ data: { teacherId: teacher.id, schoolId: school.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: cls.id } });

  const mkStudent = async (key, realName) => {
    const u = await prisma.user.create({
      data: { username: PREFIX + key, password: bcrypt.hashSync(PREFIX + key, 10), realName, role: 'student' },
    });
    await prisma.studentClass.create({ data: { studentId: u.id, classId: cls.id } });
    return u;
  };
  stuPub = await mkStudent('stu_pub', '已发布学生');
  stuUnpub = await mkStudent('stu_unpub', '未发布学生');
  stuPractice = await mkStudent('stu_prac', '练习学生');
  stuEmpty = await mkStudent('stu_empty', '未提交学生');

  // 题目：两道题满分合计 60 + 40 = 100
  q1 = await prisma.question.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '题一', maxScore: 60, difficulty: 'easy',
      subQuestions: {
        create: [
          { sortOrder: 1, title: '题一-小1', content: '<p>c1</p>', referenceAnswer: 'print(1)', language: 'python', score: 30 },
          { sortOrder: 2, title: '题一-小2', content: '<p>c2</p>', referenceAnswer: 'print(2)', language: 'python', score: 30 },
        ],
      },
    },
    include: { subQuestions: { orderBy: { sortOrder: 'asc' } } },
  });
  q2 = await prisma.question.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '题二', maxScore: 40, difficulty: 'easy',
      subQuestions: { create: [{ sortOrder: 1, title: '题二-小1', content: '<p>c3</p>', referenceAnswer: 'print(3)', language: 'python', score: 40 }] },
    },
    include: { subQuestions: true },
  });
  sq1a = q1.subQuestions[0].id;
  sq1b = q1.subQuestions[1].id;
  sq2a = q2.subQuestions[0].id;

  const mkAssignment = (title, mode) => prisma.assignment.create({
    data: {
      teacherId: teacher.id, title, mode,
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      allowResubmit: mode === 'practice',
      assignmentQuestions: { create: [{ questionId: q1.id, sortOrder: 1 }, { questionId: q2.id, sortOrder: 2 }] },
      assignmentClasses: { create: { classId: cls.id } },
    },
  });
  aExamPub = await mkAssignment(PREFIX + '作业-已发布', 'exam');
  aExamUnpub = await mkAssignment(PREFIX + '作业-未发布', 'exam');
  aPractice = await mkAssignment(PREFIX + '作业-练习', 'practice');

  await prisma.submission.createMany({
    data: [
      // 已发布学生：3 个非 draft 行（finalScore 25+27+40=92）+ 1 个 draft 行（不计入已答）
      { assignmentId: aExamPub.id, studentId: stuPub.id, questionId: q1.id, subQuestionId: sq1a, answer: 'a1', status: 'published', finalScore: 25, aiScore: 20, aiFeedback: SECRET_AI, teacherFeedback: SECRET_FB, attemptCount: 1, bestScore: 25, submittedAt: T1D },
      { assignmentId: aExamPub.id, studentId: stuPub.id, questionId: q1.id, subQuestionId: sq1b, answer: 'a2', status: 'published', finalScore: 27, aiScore: 27, aiFeedback: SECRET_AI, teacherFeedback: SECRET_FB, attemptCount: 1, bestScore: 27, submittedAt: T2D },
      { assignmentId: aExamPub.id, studentId: stuPub.id, questionId: q2.id, subQuestionId: sq2a, answer: 'a3', status: 'published', finalScore: 40, aiScore: 38, aiFeedback: SECRET_AI, teacherFeedback: SECRET_FB, attemptCount: 1, bestScore: 40, submittedAt: T3D },
      { assignmentId: aExamPub.id, studentId: stuPub.id, questionId: q1.id, subQuestionId: null, answer: 'draft', status: 'draft', attemptCount: 0 },
      // 未发布学生：exam 模式 ai_graded（AI 已打分但未发布）
      { assignmentId: aExamUnpub.id, studentId: stuUnpub.id, questionId: q1.id, subQuestionId: sq1a, answer: 'x1', status: 'ai_graded', aiScore: 55, aiFeedback: SECRET_AI, attemptCount: 2, bestScore: 55, submittedAt: T2D },
      // 练习学生：practice 模式 ai_graded（既有规则：分数可见）
      { assignmentId: aPractice.id, studentId: stuPractice.id, questionId: q1.id, subQuestionId: sq1a, answer: 'p1', status: 'ai_graded', aiScore: 33, aiFeedback: SECRET_AI, attemptCount: 1, bestScore: 33, submittedAt: T2D },
    ],
  });
}

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

async function getAs(username, url) {
  const token = await login(username);
  return request().get(url).set('Authorization', 'Bearer ' + token);
}

describe('Batch1 · T2 学生作业列表字段契约与安全红线', () => {
  beforeAll(async () => { await seed(); });
  afterAll(async () => { await cleanup(); });

  it('契约1: 列表新增 5 字段 — published 学生（finalScore=92 / maxScore=100 / answeredCount=3 / attemptCount=3 / submittedAt=最近非 draft）', async () => {
    const res = await getAs(PREFIX + 'stu_pub', '/api/student/assignments');
    expect(res.body.code).toBe(0);
    const row = res.body.data.list.find(a => a.id === aExamPub.id);
    expect(row).toBeDefined();
    expect(row.finalScore).toBe(92);
    expect(row.maxScore).toBe(100);
    expect(row.answeredCount).toBe(3);
    expect(row.attemptCount).toBe(3);
    expect(row.submittedAt).toBe(T3D.toISOString());
    expect(typeof row.submittedAt).toBe('string');
    expect(typeof row.answeredCount).toBe('number');
    expect(typeof row.maxScore).toBe('number');
    expect(typeof row.attemptCount).toBe('number');
    // 回归：原有字段仍在
    expect(row._count.assignmentQuestions).toBe(2);
    expect(Array.isArray(row.submissions)).toBe(true);
  });

  it('契约1+红线: exam 未发布 → finalScore 必须为 null（字段存在且为 null）', async () => {
    const res = await getAs(PREFIX + 'stu_unpub', '/api/student/assignments');
    expect(res.body.code).toBe(0);
    const row = res.body.data.list.find(a => a.id === aExamUnpub.id);
    expect(row).toBeDefined();
    expect(row).toHaveProperty('finalScore', null);
    expect(row.answeredCount).toBe(1);
    expect(row.attemptCount).toBe(2);
    expect(row.submittedAt).toBe(T2D.toISOString());
    expect(row.maxScore).toBe(100);
  });

  it('契约1: 无提交 → attemptCount=0 / answeredCount=0 / submittedAt=null / finalScore=null', async () => {
    const res = await getAs(PREFIX + 'stu_empty', '/api/student/assignments');
    expect(res.body.code).toBe(0);
    const row = res.body.data.list.find(a => a.id === aExamPub.id);
    expect(row).toBeDefined();
    expect(row.attemptCount).toBe(0);
    expect(row.answeredCount).toBe(0);
    expect(row.submittedAt).toBeNull();
    expect(row.finalScore).toBeNull();
    expect(row.maxScore).toBe(100);
    expect(row.submissions).toEqual([]);
  });

  // R3-D4（US-B5）：原「practice 模式 ai_graded 即可见分数」分支已随练习模式壳移除 ——
  // 未发布一律不下发分数（练习等价形态 = 不限次 + 提交后可见答案 + **不计分**，见 US-B5 AC3）。
  it('契约1: ai_graded 但未发布 → finalScore 仍为 null（US-B5：练习等价形态不计分）', async () => {
    const res = await getAs(PREFIX + 'stu_prac', '/api/student/assignments');
    expect(res.body.code).toBe(0);
    const row = res.body.data.list.find(a => a.id === aPractice.id);
    expect(row).toBeDefined();
    expect(row.finalScore).toBeNull();
  });

  it('安全红线: 列表响应体不得出现 aiScore / aiFeedback 字段名（字段级 + JSON 文本扫描）', async () => {
    for (const stu of ['stu_pub', 'stu_unpub', 'stu_prac']) {
      const res = await getAs(PREFIX + stu, '/api/student/assignments');
      expect(res.body.code).toBe(0);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('aiScore');
      expect(text).not.toContain('aiFeedback');
      expect(text).not.toContain(SECRET_AI); // AI 评语文本也不得随列表下发
      for (const a of res.body.data.list) {
        expect(a).not.toHaveProperty('aiScore');
        expect(a).not.toHaveProperty('aiFeedback');
        for (const s of (a.submissions || [])) {
          expect(s).not.toHaveProperty('aiScore');
          expect(s).not.toHaveProperty('aiFeedback');
        }
      }
    }
  });

  it('顺带修复: keyword 按 title 生效（命中 / 未命中）', async () => {
    const hit = await getAs(PREFIX + 'stu_pub', '/api/student/assignments?keyword=' + encodeURIComponent(PREFIX + '作业-未发布'));
    expect(hit.body.code).toBe(0);
    expect(hit.body.data.list.map(a => a.id)).toEqual([aExamUnpub.id]);
    expect(hit.body.data.total).toBe(1);

    const miss = await getAs(PREFIX + 'stu_pub', '/api/student/assignments?keyword=' + encodeURIComponent(PREFIX + '不存在的作业'));
    expect(miss.body.code).toBe(0);
    expect(miss.body.data.list).toHaveLength(0);
    expect(miss.body.data.total).toBe(0);
  });
});

describe('Batch1 · T2 学生作业详情白名单（整行泄露修复）', () => {
  beforeAll(async () => { await seed(); });
  afterAll(async () => { await cleanup(); });

  it('契约2b: 详情 published → finalScore / teacherFeedback 下发，aiScore / aiFeedback 字段名不存在', async () => {
    const res = await getAs(PREFIX + 'stu_pub', '/api/student/assignments/' + aExamPub.id);
    expect(res.body.code).toBe(0);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('aiScore');
    expect(text).not.toContain('aiFeedback');
    expect(text).not.toContain(SECRET_AI);

    const subs = res.body.data.submissions;
    expect(subs).toHaveLength(4);
    for (const s of subs) {
      expect(s).not.toHaveProperty('aiScore');
      expect(s).not.toHaveProperty('aiFeedback');
    }
    const published = subs.filter(s => s.status === 'published');
    expect(published.map(s => s.finalScore).sort((x, y) => x - y)).toEqual([25, 27, 40]);
    expect(published[0].teacherFeedback).toBe(SECRET_FB);
    // draft 行仍可回填答案（前端恢复草稿依赖 answer）
    const draft = subs.find(s => s.status === 'draft');
    expect(draft).toBeDefined();
    expect(draft.answer).toBe('draft');
  });

  it('契约2b: 详情 exam 未发布（ai_graded）→ finalScore 为 null，AI 分/评语文本不下发', async () => {
    const res = await getAs(PREFIX + 'stu_unpub', '/api/student/assignments/' + aExamUnpub.id);
    expect(res.body.code).toBe(0);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('aiScore');
    expect(text).not.toContain('aiFeedback');
    expect(text).not.toContain(SECRET_AI);
    const sub = res.body.data.submissions[0];
    expect(sub).not.toHaveProperty('aiScore');
    expect(sub).not.toHaveProperty('aiFeedback');
    expect(sub.status).toBe('ai_graded');
    expect(sub).toHaveProperty('finalScore', null);
    expect(sub).toHaveProperty('teacherFeedback', null);
    expect(sub.bestScore).toBeNull();
  });

  it('契约2b: 详情 ai_graded 未发布 → 分数/评语/最高分一律置空，且仍无 aiScore / aiFeedback 字段名', async () => {
    const res = await getAs(PREFIX + 'stu_prac', '/api/student/assignments/' + aPractice.id);
    expect(res.body.code).toBe(0);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('aiScore');
    expect(text).not.toContain('aiFeedback');
    const sub = res.body.data.submissions[0];
    // R3-D4（US-B5）：不再有 practice 例外；未发布不下发任何分数/评语/AI 原文
    expect(sub.finalScore).toBeNull();
    expect(sub.teacherFeedback).toBeNull();
    expect(sub.bestScore).toBeNull();
    expect(text).not.toContain(SECRET_AI);
  });
});
