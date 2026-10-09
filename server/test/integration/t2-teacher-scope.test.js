/**
 * Batch1 · T2 教师可见范围收敛 + review-summary 题目数契约测试
 *
 * 覆盖冻结契约 2a / 2c / 2d：
 *   (a) GET /api/teacher/submissions 越权修复：不传 schoolId/classId 也必须收敛到「教师可见班级」，
 *       绝不返回全库提交；classId 传入不可见班级时收敛为空集而不是放行
 *   (c) getVisibleClassIds(teacherId, schoolId) 的 schoolId 生效（直连 + 团队两条来源都过滤），
 *       schoolId 为空时保持改造前行为（回归）
 *   (d) GET /api/teacher/review-summary 每行含 _count.assignmentQuestions
 *
 * 数据自建自清（t2s_ 前缀），含跨校教师、无班级教师、团队共享班级三种角色。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';
import { getVisibleClassIds } from '../../src/controllers/teamController.js';

const PREFIX = 't2s_';

let schoolA, schoolB, classA, classB;
let teacherA, teacherB, teacherT, teacherZ;
let stuA, stuB;
let qA1, qA2, qB;
let asgA, asgB;
let subA, subB;

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
  const teams = await prisma.team.findMany({
    where: { OR: [{ name: { startsWith: PREFIX } }, { createdBy: { in: userIds } }, { schoolId: { in: schoolIds } }] },
    select: { id: true },
  });
  const teamIds = teams.map(t => t.id);
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
  await prisma.teamClass.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { classId: { in: classIds } }] } });
  await prisma.teamTeacher.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { teacherId: { in: userIds } }] } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

const mkTeacher = async (key, realName) => prisma.user.create({
  data: { username: PREFIX + key, password: bcrypt.hashSync(PREFIX + key, 10), realName, role: 'teacher' },
});

async function seed() {
  await cleanup();

  schoolA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: '29911' } });
  schoolB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: '29912' } });
  classA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: schoolA.id } });
  classB = await prisma.class.create({ data: { name: PREFIX + 'class_b', schoolId: schoolB.id } });

  // A：跨校教师（直连 A、B 两校班级）—— 用于验证 schoolId 生效
  teacherA = await mkTeacher('teacher_a', '跨校教师A');
  await prisma.teacherSchool.createMany({ data: [{ teacherId: teacherA.id, schoolId: schoolA.id }, { teacherId: teacherA.id, schoolId: schoolB.id }] });
  await prisma.teacherClass.createMany({ data: [{ teacherId: teacherA.id, classId: classA.id }, { teacherId: teacherA.id, classId: classB.id }] });

  // B：只带 B 校班级 —— 用于验证「不传 schoolId 也拿不到别人的班级」
  teacherB = await mkTeacher('teacher_b', 'B校教师');
  await prisma.teacherSchool.create({ data: { teacherId: teacherB.id, schoolId: schoolB.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacherB.id, classId: classB.id } });

  // T：无直连班级，仅通过团队共享 B 校班级 —— 用于验证团队来源也被 schoolId 过滤
  teacherT = await mkTeacher('teacher_t', '团队教师T');
  const team = await prisma.team.create({ data: { name: PREFIX + 'team_b', schoolId: schoolB.id, createdBy: teacherT.id } });
  await prisma.teamTeacher.createMany({ data: [{ teamId: team.id, teacherId: teacherT.id }, { teamId: team.id, teacherId: teacherB.id }] });
  await prisma.teamClass.create({ data: { teamId: team.id, classId: classB.id } });

  // Z：无班级、无团队 —— 越权用例的「空范围」教师
  teacherZ = await mkTeacher('teacher_z', '无班级教师Z');
  await prisma.teacherSchool.create({ data: { teacherId: teacherZ.id, schoolId: schoolA.id } });

  // 学生
  stuA = await prisma.user.create({ data: { username: PREFIX + 'stu_a', password: bcrypt.hashSync(PREFIX + 'stu_a', 10), realName: 'A校学生', role: 'student' } });
  stuB = await prisma.user.create({ data: { username: PREFIX + 'stu_b', password: bcrypt.hashSync(PREFIX + 'stu_b', 10), realName: 'B校学生', role: 'student' } });
  await prisma.studentClass.createMany({ data: [{ studentId: stuA.id, classId: classA.id }, { studentId: stuB.id, classId: classB.id }] });

  // 题目：A 作业两道题（用于断言题目数=2），B 作业一道题（=1）
  qA1 = await prisma.question.create({
    data: {
      teacherId: teacherA.id, title: PREFIX + '题A1', maxScore: 60, difficulty: 'easy',
      subQuestions: { create: [{ sortOrder: 1, title: 'A1-小1', content: '<p>a</p>', referenceAnswer: 'print(1)', language: 'python', score: 60 }] },
    },
  });
  qA2 = await prisma.question.create({
    data: {
      teacherId: teacherA.id, title: PREFIX + '题A2', maxScore: 40, difficulty: 'easy',
      subQuestions: { create: [{ sortOrder: 1, title: 'A2-小1', content: '<p>b</p>', referenceAnswer: 'print(2)', language: 'python', score: 40 }] },
    },
  });
  qB = await prisma.question.create({
    data: {
      teacherId: teacherB.id, title: PREFIX + '题B1', maxScore: 40, difficulty: 'easy',
      subQuestions: { create: [{ sortOrder: 1, title: 'B1-小1', content: '<p>c</p>', referenceAnswer: 'print(3)', language: 'python', score: 40 }] },
    },
  });

  asgA = await prisma.assignment.create({
    data: {
      teacherId: teacherA.id, title: PREFIX + '作业A', mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentQuestions: { create: [{ questionId: qA1.id, sortOrder: 1 }, { questionId: qA2.id, sortOrder: 2 }] },
      assignmentClasses: { create: { classId: classA.id } },
    },
  });
  asgB = await prisma.assignment.create({
    data: {
      teacherId: teacherB.id, title: PREFIX + '作业B', mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentQuestions: { create: [{ questionId: qB.id, sortOrder: 1 }] },
      assignmentClasses: { create: { classId: classB.id } },
    },
  });

  subA = await prisma.submission.create({
    data: { assignmentId: asgA.id, studentId: stuA.id, questionId: qA1.id, answer: 'ans-a', status: 'ai_graded', aiScore: 50, aiFeedback: PREFIX + 'AI评语A', attemptCount: 1, bestScore: 50, submittedAt: new Date('2026-02-02T10:00:00Z') },
  });
  subB = await prisma.submission.create({
    data: { assignmentId: asgB.id, studentId: stuB.id, questionId: qB.id, answer: 'ans-b', status: 'ai_graded', aiScore: 70, aiFeedback: PREFIX + 'AI评语B', attemptCount: 1, bestScore: 70, submittedAt: new Date('2026-02-02T11:00:00Z') },
  });
}

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

function getWith(token, url) {
  return request().get(url).set('Authorization', 'Bearer ' + token);
}

describe('Batch1 · T2 教师提交列表范围收敛（越权修复）', () => {
  let tokenA, tokenB, tokenT, tokenZ;

  beforeAll(async () => {
    await seed();
    tokenA = await login(PREFIX + 'teacher_a');
    tokenB = await login(PREFIX + 'teacher_b');
    tokenT = await login(PREFIX + 'teacher_t');
    tokenZ = await login(PREFIX + 'teacher_z');
  });
  afterAll(async () => { await cleanup(); });

  it('(a) 无可见班级的教师不传 schoolId/classId → 空列表（旧实现会返回全库提交）', async () => {
    const res = await getWith(tokenZ, '/api/teacher/submissions');
    expect(res.body.code).toBe(0);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.list).toEqual([]);
  });

  it('(a) 教师 B 不传 schoolId → 只返回自己可见班级的提交，看不到 A 校学生', async () => {
    const res = await getWith(tokenB, '/api/teacher/submissions');
    expect(res.body.code).toBe(0);
    const ids = res.body.data.list.map(s => s.id);
    expect(ids).toContain(subB.id);
    expect(ids).not.toContain(subA.id); // 越权红线：A 校学生的提交不可见

    const visible = await getVisibleClassIds(teacherB.id, null);
    const students = await prisma.studentClass.findMany({ where: { classId: { in: visible } }, select: { studentId: true } });
    const allowed = new Set(students.map(s => s.studentId));
    for (const row of res.body.data.list) {
      expect(allowed.has(row.student.id)).toBe(true);
    }
    expect(res.body.data.total).toBe(ids.length);
  });

  it('(a) 团队共享班级同样纳入可见范围（不传 schoolId，保持既有语义）', async () => {
    const res = await getWith(tokenT, '/api/teacher/submissions');
    expect(res.body.code).toBe(0);
    expect(res.body.data.list.map(s => s.id)).toContain(subB.id);
  });

  it('(a) classId 传入不可见班级 → 收敛为空集，而不是放行', async () => {
    const r1 = await getWith(tokenB, '/api/teacher/submissions?classId=' + classA.id);
    expect(r1.body.code).toBe(0);
    expect(r1.body.data.total).toBe(0);

    const r2 = await getWith(tokenZ, '/api/teacher/submissions?classId=' + classB.id);
    expect(r2.body.code).toBe(0);
    expect(r2.body.data.total).toBe(0);

    const r3 = await getWith(tokenZ, '/api/teacher/submissions?questionId=' + qB.id);
    expect(r3.body.code).toBe(0);
    expect(r3.body.data.total).toBe(0);
  });

  it('(a) classId 传入可见班级 → 正常返回（不放宽也不误杀）', async () => {
    const res = await getWith(tokenB, '/api/teacher/submissions?classId=' + classB.id);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list.map(s => s.id)).toEqual([subB.id]);
  });

  it('(a) 跨校教师：schoolId 收敛到该校，不传时仍返回全部可见班级（既有语义回归）', async () => {
    const onlyA = await getWith(tokenA, '/api/teacher/submissions?schoolId=' + schoolA.id);
    expect(onlyA.body.code).toBe(0);
    expect(onlyA.body.data.list.map(s => s.id)).toEqual([subA.id]);
    for (const row of onlyA.body.data.list) {
      expect(row.student.id).toBe(stuA.id);
    }

    const onlyB = await getWith(tokenA, '/api/teacher/submissions?schoolId=' + schoolB.id);
    expect(onlyB.body.code).toBe(0);
    expect(onlyB.body.data.list.map(s => s.id)).toEqual([subB.id]);

    const all = await getWith(tokenA, '/api/teacher/submissions');
    const ids = all.body.data.list.map(s => s.id);
    expect(ids).toContain(subA.id);
    expect(ids).toContain(subB.id);
  });
});

describe('Batch1 · T2 getVisibleClassIds 的 schoolId 生效（契约 2c）', () => {
  beforeAll(async () => { await seed(); });
  afterAll(async () => { await cleanup(); });

  it('(c) 直连班级按 schoolId 过滤；schoolId 为空时保持改造前行为', async () => {
    expect(await getVisibleClassIds(teacherA.id, schoolA.id)).toEqual([classA.id]);
    expect(await getVisibleClassIds(teacherA.id, schoolB.id)).toEqual([classB.id]);
    expect(new Set(await getVisibleClassIds(teacherA.id, null))).toEqual(new Set([classA.id, classB.id]));
    expect(new Set(await getVisibleClassIds(teacherA.id, undefined))).toEqual(new Set([classA.id, classB.id]));
    // 兼容字符串入参（controller 里 schoolId 来自 query，可能未转数字）
    expect(await getVisibleClassIds(teacherA.id, String(schoolA.id))).toEqual([classA.id]);
  });

  it('(c) 团队共享班级同样按 schoolId 过滤；team 来源在 schoolId 为空时仍可见', async () => {
    expect(await getVisibleClassIds(teacherT.id, schoolB.id)).toEqual([classB.id]);
    expect(await getVisibleClassIds(teacherT.id, schoolA.id)).toEqual([]); // 团队班级属 B 校，A 校查询不得带出
    expect(await getVisibleClassIds(teacherT.id, null)).toEqual([classB.id]);
  });

  it('(c) 无可见班级 → 空数组', async () => {
    expect(await getVisibleClassIds(teacherZ.id, schoolA.id)).toEqual([]);
    expect(await getVisibleClassIds(teacherZ.id, null)).toEqual([]);
  });
});

describe('Batch1 · T2 review-summary 每行含题目数（契约 2d）', () => {
  let tokenA;

  beforeAll(async () => {
    await seed();
    tokenA = await login(PREFIX + 'teacher_a');
  });
  afterAll(async () => { await cleanup(); });

  it('(d) A 校行 _count.assignmentQuestions=2（两道题），B 校行 =1', async () => {
    const resA = await getWith(tokenA, '/api/teacher/review-summary?schoolId=' + schoolA.id);
    expect(resA.body.code).toBe(0);
    const rowA = resA.body.data.find(r => r.assignmentId === asgA.id && r.classId === classA.id);
    expect(rowA).toBeDefined();
    expect(rowA._count).toBeDefined();
    expect(rowA._count.assignmentQuestions).toBe(2);
    expect(typeof rowA._count.assignmentQuestions).toBe('number');
    // 回归：原有汇总字段仍在
    expect(rowA.submittedCount).toBe(1);
    expect(rowA.totalStudents).toBe(1);
    expect(rowA.reviewPending).toBe(1);

    const resB = await getWith(tokenA, '/api/teacher/review-summary?schoolId=' + schoolB.id);
    expect(resB.body.code).toBe(0);
    const rowB = resB.body.data.find(r => r.assignmentId === asgB.id && r.classId === classB.id);
    expect(rowB).toBeDefined();
    expect(rowB._count.assignmentQuestions).toBe(1);
  });
});
