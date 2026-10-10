/**
 * ownership-guards · 写/读路径资源归属校验收敛（round 5 定点修复）
 *
 * 覆盖两项安全收口：
 *   §1 S-2【高】教师端 5 个写 handler 的跨教师/跨校横向越权收口
 *        updateClass / deleteClass / updateStudent / deleteStudent / resetStudentPassword
 *        契约：403 + code 1003 + '无权操作'（与同文件 lockAssignment:738 同码同文案）
 *        判据：越权请求**零写入** —— 请求前后对同一批行做快照 toEqual 对拍
 *   §2 S-6【低】学生作业详情的班级归属校验（交接清单 A4）
 *        契约：403 + code 1003 + '无权访问该作业'（与同文件 assertStudentInAssignment 同码同文案）
 *        判据：跨班 403 且响应体不含题干/评分标准；本班 200 且响应形状不变
 *
 * 夹具自建自清（to_ 前缀，独立学校 29941/29942），不依赖 setup seed，不修改任何既有测试文件。
 * 对照夹具形态：t4-teacher-idor / t6-teacher-classid-idor（跨教师 + 同校不可见 + 跨校三种关系）。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'to_';
const CODE_A = '29941';
const CODE_B = '29942';
const S6_MATERIAL = PREFIX + 'S6题干绝密';
const S6_REF = PREFIX + 'S6参考答案绝密';
const S6_RUBRIC = PREFIX + 'S6评分标准绝密';

let sA, sB, clsA, clsHidden, clsB, clsLegit, clsTeam, team;
let tA, tB, tC;
let stuA, stuC, stuB, stuLegit, stuS6;
let qS6, asgA, asgB;
let tokenA, tokenB, tokenC, tokenStuC, tokenStuS6;

// ---------------------------------------------------------------- 夹具

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
  const teams = await prisma.team.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const teamIds = teams.map(t => t.id);

  await prisma.submission.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] },
  });
  await prisma.assignmentClass.deleteMany({ where: { OR: [{ assignmentId: { in: assignmentIds } }, { classId: { in: classIds } }] } });
  await prisma.assignmentQuestion.deleteMany({ where: { OR: [{ assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] } });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  await prisma.teamClass.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { classId: { in: classIds } }] } });
  await prisma.teamTeacher.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { teacherId: { in: userIds } }] } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.teacherClass.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.studentClass.deleteMany({ where: { OR: [{ studentId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

const mkUser = (username, realName, role) => prisma.user.create({
  data: { username: PREFIX + username, password: bcrypt.hashSync(PREFIX + username, 10), realName, role },
});

async function seed() {
  await purge();

  sA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  sB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: CODE_B } });

  clsA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: sA.id } });          // tA 直连
  clsHidden = await prisma.class.create({ data: { name: PREFIX + 'class_hidden', schoolId: sA.id } }); // 同校他师
  clsB = await prisma.class.create({ data: { name: PREFIX + 'class_b', schoolId: sB.id } });           // 跨校他师
  clsLegit = await prisma.class.create({ data: { name: PREFIX + 'class_legit', schoolId: sA.id } });   // tA 直连（合法删除用）
  clsTeam = await prisma.class.create({ data: { name: PREFIX + 'class_team', schoolId: sA.id } });     // 团队班级

  tA = await mkUser('teacher_a', 'to教师A', 'teacher');
  tB = await mkUser('teacher_b', 'to教师B', 'teacher');
  tC = await mkUser('teacher_c', 'to教师C', 'teacher');
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: tA.id, schoolId: sA.id },
    { teacherId: tB.id, schoolId: sB.id },
    { teacherId: tC.id, schoolId: sA.id },
  ] });
  await prisma.teacherClass.createMany({ data: [
    { teacherId: tA.id, classId: clsA.id },
    { teacherId: tA.id, classId: clsLegit.id },
    { teacherId: tB.id, classId: clsB.id },
    { teacherId: tC.id, classId: clsHidden.id },
  ] });
  // 团队班级：tA 建团队，tC 入团 ⇒ clsTeam 对 tC 也可见（证明「直连 ∪ 团队」语义未被过度收窄）
  team = await prisma.team.create({ data: { name: PREFIX + 'team', schoolId: sA.id, createdBy: tA.id } });
  await prisma.teamTeacher.createMany({ data: [{ teamId: team.id, teacherId: tA.id }, { teamId: team.id, teacherId: tC.id }] });
  await prisma.teamClass.create({ data: { teamId: team.id, classId: clsTeam.id } });

  stuA = await mkUser('stu_a@' + CODE_A, 'to生A', 'student');
  stuC = await mkUser('stu_c@' + CODE_A, 'to生C绝密', 'student');
  stuB = await mkUser('stu_b@' + CODE_B, 'to生B', 'student');
  stuLegit = await mkUser('stu_legit@' + CODE_A, 'to生Legit', 'student');
  stuS6 = await mkUser('stu_s6@' + CODE_A, 'to生S6', 'student');
  await prisma.studentClass.createMany({ data: [
    { studentId: stuA.id, classId: clsA.id },
    { studentId: stuC.id, classId: clsHidden.id },
    { studentId: stuB.id, classId: clsB.id },
    { studentId: stuLegit.id, classId: clsA.id },
    { studentId: stuS6.id, classId: clsA.id },
  ] });

  qS6 = await prisma.question.create({
    data: {
      teacherId: tA.id, title: PREFIX + 'S6题', maxScore: 100, difficulty: 'easy', type: 'code',
      material: S6_MATERIAL, scoringRubric: S6_RUBRIC,
      subQuestions: { create: [{ sortOrder: 1, title: PREFIX + 'S6小题', content: '<p>c</p>', referenceAnswer: S6_REF, language: 'python', score: 100 }] },
    },
    include: { subQuestions: true },
  });
  const mkAsg = (teacherId, title, classIds, questionIds) => prisma.assignment.create({
    data: {
      teacherId, title, mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
  });
  asgA = await mkAsg(tA.id, PREFIX + '作业A', [clsA.id], [qS6.id]);
  asgB = await mkAsg(tB.id, PREFIX + '作业B', [clsB.id], [qS6.id]);

  // stuA 在 asgA 有提交：deleteStudent 越权失败后该提交必须仍在
  await prisma.submission.create({
    data: {
      assignmentId: asgA.id, studentId: stuA.id, questionId: qS6.id, subQuestionId: qS6.subQuestions[0].id,
      answer: PREFIX + 'ANSWER_A', status: 'submitted', attemptCount: 1, submittedAt: new Date('2026-02-01T10:00:00Z'),
    },
  });
}

// ---------------------------------------------------------------- 工具

const api = (token) => ({
  get: (url) => request().get(url).set('Authorization', 'Bearer ' + token),
  put: (url, body) => request().put(url).send(body ?? {}).set('Authorization', 'Bearer ' + token),
  post: (url, body) => request().post(url).send(body ?? {}).set('Authorization', 'Bearer ' + token),
  del: (url) => request().delete(url).set('Authorization', 'Bearer ' + token),
});

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username: PREFIX + username, password: PREFIX + username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

/** S-2 契约：403 + code 1003 + '无权操作' + data:null（与 lockAssignment:738 同码同文案） */
function expectDeniedOperation(res, forbidden = []) {
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ code: 1003, message: '无权操作', data: null });
  const text = JSON.stringify(res.body);
  for (const s of forbidden) expect(text).not.toContain(s);
}

/** 班级行 + 三条关联表的快照（用于「零写入」对拍） */
async function snapClass(classId) {
  const c = await prisma.class.findUnique({ where: { id: classId }, select: { name: true, schoolId: true } });
  const [tc, sc, ac, subs] = await Promise.all([
    prisma.teacherClass.findMany({ where: { classId }, select: { teacherId: true }, orderBy: { teacherId: 'asc' } }),
    prisma.studentClass.findMany({ where: { classId }, select: { studentId: true }, orderBy: { studentId: 'asc' } }),
    prisma.assignmentClass.findMany({ where: { classId }, select: { assignmentId: true }, orderBy: { assignmentId: 'asc' } }),
    prisma.submission.count({ where: { assignment: { assignmentClasses: { some: { classId } } } } }),
  ]);
  return { name: c?.name ?? null, schoolId: c?.schoolId ?? null, tc, sc, ac, subs };
}

/** 学生行 + 班级映射 + 提交数的快照（password 取哈希本身，用于证明「零写入」） */
async function snapStudent(studentId) {
  const u = await prisma.user.findUnique({ where: { id: studentId }, select: { username: true, realName: true, password: true, role: true } });
  const [sc, subs] = await Promise.all([
    prisma.studentClass.findMany({ where: { studentId }, select: { classId: true }, orderBy: { classId: 'asc' } }),
    prisma.submission.count({ where: { studentId } }),
  ]);
  return { user: u, sc, subs };
}

// ---------------------------------------------------------------- 测试

describe('ownership-guards · 归属校验收敛（S-2 写路径 + S-6 学生详情）', () => {
  beforeAll(async () => {
    await seed();
    tokenA = await login('teacher_a');
    tokenB = await login('teacher_b');
    tokenC = await login('teacher_c');
    tokenStuC = await login('stu_c@' + CODE_A);
    tokenStuS6 = await login('stu_s6@' + CODE_A);
  }, 60000);

  afterAll(async () => { await purge(); }, 60000);

  // ================= §1 S-2：教师端写操作归属 =================

  describe('S-2 updateClass', () => {
    it('T1: 跨校教师改他校班级 → 403 且零写入', async () => {
      const before = await snapClass(clsA.id);
      const res = await api(tokenB).put('/api/teacher/classes/' + clsA.id + '?schoolId=' + sB.id, { name: PREFIX + 'HACKED_B' });
      expectDeniedOperation(res, [PREFIX + 'HACKED_B']);
      expect(await snapClass(clsA.id)).toEqual(before);
    });

    it('T2: 同校非本人班级 → 403 且零写入', async () => {
      const before = await snapClass(clsA.id);
      const res = await api(tokenC).put('/api/teacher/classes/' + clsA.id + '?schoolId=' + sA.id, { name: PREFIX + 'HACKED_C' });
      expectDeniedOperation(res);
      expect(await snapClass(clsA.id)).toEqual(before);
    });

    it('T3: 跨校 + 伪传受害校 schoolId → 仍 403（查询参数不可绕过）', async () => {
      const before = await snapClass(clsA.id);
      const res = await api(tokenB).put('/api/teacher/classes/' + clsA.id + '?schoolId=' + sA.id, { name: PREFIX + 'HACKED_B2' });
      expectDeniedOperation(res);
      expect(await snapClass(clsA.id)).toEqual(before);
    });

    it('T4: 跨校教师删他校班级 → 403 且级联零写入', async () => {
      const before = await snapClass(clsA.id);
      const res = await api(tokenB).del('/api/teacher/classes/' + clsA.id + '?schoolId=' + sB.id);
      expectDeniedOperation(res);
      expect(await snapClass(clsA.id)).toEqual(before);
      expect(before.tc.length).toBe(1);   // 夹具保证：teacherClass 行确实存在，删成功会被对拍抓到
      expect(before.ac.length).toBe(1);   // 同上：assignmentClass 行存在
    });
  });

  describe('S-2 deleteClass', () => {
    it('T5: 同校非本人班级删除 → 403；班级行与 studentClass/teacherClass/assignmentClass 全部保留', async () => {
      const before = await snapClass(clsA.id);
      const res = await api(tokenC).del('/api/teacher/classes/' + clsA.id + '?schoolId=' + sA.id);
      expectDeniedOperation(res);
      const after = await snapClass(clsA.id);
      expect(after).toEqual(before);
      expect(after.name).toBe(PREFIX + 'class_a');
    });
  });

  describe('S-2 updateStudent', () => {
    it('T6: 跨校教师改他校学生（改名 + 抢学号 + 移班）→ 403 且零写入', async () => {
      const before = await snapStudent(stuA.id);
      const res = await api(tokenB).put('/api/teacher/students/' + stuA.id + '?schoolId=' + sB.id, {
        realName: PREFIX + 'HACKED_NAME', newUsername: PREFIX + 'hacked_id', classId: clsB.id,
      });
      expectDeniedOperation(res, [PREFIX + 'HACKED_NAME']);
      expect(await snapStudent(stuA.id)).toEqual(before);
      expect(before.sc).toEqual([{ classId: clsA.id }]);   // 未被移入 clsB
    });

    it('T7: 同校非本人学生 → 403 且零写入', async () => {
      const before = await snapStudent(stuA.id);
      const res = await api(tokenC).put('/api/teacher/students/' + stuA.id + '?schoolId=' + sA.id, { realName: PREFIX + 'HACKED_C' });
      expectDeniedOperation(res);
      expect(await snapStudent(stuA.id)).toEqual(before);
    });

    it('T8: 不存在学生 → 404 形状不变（归属校验不改既有分支）', async () => {
      const res = await api(tokenA).put('/api/teacher/students/99999999', { realName: 'x' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '学生不存在', data: null });
    });
  });

  describe('S-2 resetStudentPassword', () => {
    it('T9: 跨校教师重置他校学生口令 → 403，bcrypt 哈希逐字节不变且响应不回吐学号', async () => {
      const before = await snapStudent(stuA.id);
      const res = await api(tokenB).put('/api/teacher/students/' + stuA.id + '/reset-password?schoolId=' + sB.id);
      expectDeniedOperation(res, ['stu_a', '密码已重置']);
      const after = await snapStudent(stuA.id);
      expect(after).toEqual(before);
      expect(after.user.password).toBe(before.user.password);
    });

    it('T10: 同校非本人学生 → 403 且哈希不变', async () => {
      const before = await snapStudent(stuC.id);
      const res = await api(tokenA).put('/api/teacher/students/' + stuC.id + '/reset-password?schoolId=' + sA.id);
      expectDeniedOperation(res, ['密码已重置']);
      expect(await snapStudent(stuC.id)).toEqual(before);
    });
  });

  describe('S-2 deleteStudent', () => {
    it('T11: 跨校教师删他校学生 → 403；user / studentClass / submission 全部保留', async () => {
      const before = await snapStudent(stuA.id);
      const res = await api(tokenB).del('/api/teacher/students/' + stuA.id + '?schoolId=' + sB.id);
      expectDeniedOperation(res);
      const after = await snapStudent(stuA.id);
      expect(after).toEqual(before);
      expect(after.subs).toBeGreaterThan(0);   // 夹具保证有提交行：删成功会被对拍抓到
    });

    it('T12: 同校非本人学生删除 → 403 且零写入', async () => {
      const before = await snapStudent(stuA.id);
      const res = await api(tokenC).del('/api/teacher/students/' + stuA.id + '?schoolId=' + sA.id);
      expectDeniedOperation(res);
      expect(await snapStudent(stuA.id)).toEqual(before);
    });
  });

  // ================= §1b 合法路径回归（响应形状不得改变） =================

  describe('合法路径回归：本人资源仍然放行且响应形状不变', () => {
    it('T13: 本人班级 updateClass → 200 {code:0,message:"更新成功",data:null} 且确实改名', async () => {
      const res = await api(tokenA).put('/api/teacher/classes/' + clsA.id + '?schoolId=' + sA.id, { name: PREFIX + 'class_a_renamed' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '更新成功', data: null });
      const c = await prisma.class.findUnique({ where: { id: clsA.id }, select: { name: true } });
      expect(c.name).toBe(PREFIX + 'class_a_renamed');
    });

    it('T14: 团队班级 updateClass → 200（直连 ∪ 团队 语义未被过度收窄）', async () => {
      const res = await api(tokenC).put('/api/teacher/classes/' + clsTeam.id + '?schoolId=' + sA.id, { name: PREFIX + 'class_team_renamed' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '更新成功', data: null });
    });

    it('T15: 本人学生 updateStudent → 200 且改名/移班生效', async () => {
      const res = await api(tokenA).put('/api/teacher/students/' + stuLegit.id + '?schoolId=' + sA.id, { realName: 'to生Legit改名', classId: clsLegit.id });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '更新成功', data: null });
      const u = await prisma.user.findUnique({ where: { id: stuLegit.id }, select: { realName: true } });
      expect(u.realName).toBe('to生Legit改名');
      const sc = await prisma.studentClass.findMany({ where: { studentId: stuLegit.id }, select: { classId: true } });
      expect(sc.map(x => x.classId)).toEqual([clsLegit.id]);
    });

    it('T16: 本人学生 resetStudentPassword → 200 且文案/语义不变', async () => {
      const before = await prisma.user.findUnique({ where: { id: stuLegit.id }, select: { password: true } });
      const res = await api(tokenA).put('/api/teacher/students/' + stuLegit.id + '/reset-password?schoolId=' + sA.id);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toContain('密码已重置为学号');
      const after = await prisma.user.findUnique({ where: { id: stuLegit.id }, select: { password: true } });
      expect(after.password).not.toBe(before.password);
      // 重置口令 = 学号（username 去掉 @学校代码）——本夹具 username = 'to_stu_legit@29941'
      expect(bcrypt.compareSync('to_stu_legit', after.password)).toBe(true);
    });

    it('T17: 本人学生 deleteStudent → 200 且级联删除生效', async () => {
      const res = await api(tokenA).del('/api/teacher/students/' + stuLegit.id + '?schoolId=' + sA.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '删除成功', data: null });
      expect(await prisma.user.findUnique({ where: { id: stuLegit.id } })).toBeNull();
      expect(await prisma.studentClass.count({ where: { studentId: stuLegit.id } })).toBe(0);
    });

    it('T18: 本人班级 deleteClass → 200 且级联删除生效', async () => {
      const res = await api(tokenA).del('/api/teacher/classes/' + clsLegit.id + '?schoolId=' + sA.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '删除成功', data: null });
      expect(await prisma.class.findUnique({ where: { id: clsLegit.id } })).toBeNull();
      expect(await prisma.teacherClass.count({ where: { classId: clsLegit.id } })).toBe(0);
    });
  });

  // ================= §2 S-6：学生作业详情归属 =================

  describe('S-6 学生作业详情归属校验（交接清单 A4）', () => {
    it('S1: 跨班学生取他人作业详情 → 403 且不含题干/评分标准/参考答案', async () => {
      const res = await api(tokenStuC).get('/api/student/assignments/' + asgA.id);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 1003, message: '无权访问该作业', data: null });
      const text = JSON.stringify(res.body);
      for (const s of [S6_MATERIAL, S6_RUBRIC, S6_REF, PREFIX + '作业A']) expect(text).not.toContain(s);
    });

    it('S2: 本班学生取该作业详情 → 200 且响应形状不变（assignment + submissions 齐备）', async () => {
      const res = await api(tokenStuS6).get('/api/student/assignments/' + asgA.id);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.assignment.id).toBe(asgA.id);
      expect(Array.isArray(res.body.data.assignment.assignmentQuestions)).toBe(true);
      expect(Array.isArray(res.body.data.submissions)).toBe(true);
    });

    it('S3: 对抗性 —— 先自行落一条草稿再取详情，仍 403（归属校验不可被「有提交」绕过）', async () => {
      const draft = await api(tokenStuC).put('/api/student/assignments/' + asgA.id + '/draft', { questionId: qS6.id, answer: PREFIX + 'DRAFT_BY_ATTACKER' });
      expect(draft.body.code).toBe(0);   // saveDraft 自身不做班级校验（既有行为，登记为遗留）
      expect(await prisma.submission.count({ where: { assignmentId: asgA.id, studentId: stuC.id } })).toBeGreaterThan(0);
      const res = await api(tokenStuC).get('/api/student/assignments/' + asgA.id);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 1003, message: '无权访问该作业', data: null });
    });

    it('S4: 学生取不存在的作业 → 404 形状不变（归属校验不改变既有分支）', async () => {
      const res = await api(tokenStuS6).get('/api/student/assignments/99999999');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '作业不存在', data: null });
    });
  });
});
