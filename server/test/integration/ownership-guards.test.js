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
 *   §1c round 6【高】资源作用域系统收口（audit-round-06 §3.1-§3.3 / §5.1 #1-#3 #6）
 *        updateTeam 归属（修复前实测 200：非成员改他人团队名单 → 踢出创建者 → 挂他人班级）
 *        updateClass.body.teamIds / createClass.teamIds+schoolId（C 复现链第一环）
 *        updateStudent.body.classId / addStudent / batchAddStudents.body.classId（目标侧）
 *        createTeam.schoolId / checker 三写端点 / project body.classIds
 *        契约：教师端 403 + code 1003 + '无权操作'；checker 走既有 404 分支
 *        判据：越权请求**零写入**（团队/班级/学生/题目 checker 状态逐字段快照对拍）
 *        ⇒ studentController 0 行改动，submit/saveDraft/retry 的归属守卫下沉到
 *          submission.use-cases._loadOwnedAssignment（S3/S5/S6/S7）
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

let sA, sB, clsA, clsHidden, clsB, clsLegit, clsTeam, team, teamB;
let tA, tB, tC;
let stuA, stuC, stuB, stuLegit, stuS6;
let qS6, qChecker, asgA, asgB;
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
  // round 6：tB 的团队（tA 既非成员也非创建者）—— updateTeam / body.teamIds 越权面的受害者资源
  teamB = await prisma.team.create({ data: { name: PREFIX + 'team_b', schoolId: sB.id, createdBy: tB.id } });
  await prisma.teamTeacher.create({ data: { teamId: teamB.id, teacherId: tB.id } });

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
  // round 6：tA 的实训题（带 checker 状态，用于 checker 三写端点的归属对拍；不得触发 LLM 生成）
  qChecker = await prisma.question.create({
    data: {
      teacherId: tA.id, title: PREFIX + 'checker题', type: 'project', maxScore: 100, difficulty: 'easy',
      checkerScript: PREFIX + 'CHECKER_V1', checkerStatus: 'ready',
      checkerMeta: { rounds: 1, items: [], subjective: [], versions: [{ id: 1, label: 'v1' }], activeVersionId: 1 },
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

/** 团队行 + 成员表 + 班级表的快照（用于 updateTeam / body.teamIds 的「零写入」对拍） */
async function snapTeam(teamId) {
  const t = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true, schoolId: true, createdBy: true } });
  const [teachers, classes] = await Promise.all([
    prisma.teamTeacher.findMany({ where: { teamId }, select: { teacherId: true }, orderBy: { teacherId: 'asc' } }),
    prisma.teamClass.findMany({ where: { teamId }, select: { classId: true }, orderBy: { classId: 'asc' } }),
  ]);
  return { team: t, teachers: teachers.map(x => x.teacherId), classes: classes.map(x => x.classId) };
}

/** checker 状态快照（用于 checker 三写端点的「零写入」对拍） */
function snapChecker(questionId) {
  return prisma.question.findUnique({
    where: { id: questionId },
    select: { checkerStatus: true, checkerScript: true, checkerMeta: true },
  });
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

  // ================= §1c round 6：body 目标资源 / 团队写路径 / checker / project =================

  describe('round 6 · updateTeam 归属（A §3.3：修复前实测 200，跨租户越权链）', () => {
    it('R1: 非成员改他人团队（改名 + 踢出创建者 + 挂他人班级）→ 403 且名单逐字段不变', async () => {
      const before = await snapTeam(teamB.id);
      const res = await api(tokenA).put('/api/teacher/teams/' + teamB.id + '?schoolId=' + sA.id, {
        name: PREFIX + 'HACK_TEAM', teacherIds: [tA.id], classIds: [clsA.id],
      });
      expectDeniedOperation(res, [PREFIX + 'HACK_TEAM']);
      const after = await snapTeam(teamB.id);
      expect(after).toEqual(before);
      expect(after.teachers).toEqual([tB.id]);   // 创建者未被踢出、非成员未被加入
      expect(after.classes).toEqual([]);         // 他人班级未被挂入（修复前此处 = [clsA.id]）
    });

    it('R2: 团队成员（非创建者）改自己团队 → 200（只堵「非成员」，R6-P10 治理语义不越权收窄）', async () => {
      const res = await api(tokenC).put('/api/teacher/teams/' + team.id + '?schoolId=' + sA.id, { name: PREFIX + 'team_renamed' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '更新成功', data: null });
      const t = await prisma.team.findUnique({ where: { id: team.id }, select: { name: true } });
      expect(t.name).toBe(PREFIX + 'team_renamed');
    });

    it('R3: 创建者改自己团队 → 200（响应形状不变，并复原团队名）', async () => {
      const res = await api(tokenA).put('/api/teacher/teams/' + team.id + '?schoolId=' + sA.id, { name: PREFIX + 'team' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '更新成功', data: null });
    });

    it('R4: 不存在的团队 → 404 形状不变（归属校验不改既有分支）', async () => {
      const res = await api(tokenA).put('/api/teacher/teams/99999999?schoolId=' + sA.id, { name: 'x' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '团队不存在', data: null });
    });
  });

  describe('round 6 · updateClass.body.teamIds / createClass 归属（A §3.2 第一环：修复前实测 200）', () => {
    it('R5: 把本人班级挂进他人团队 → 403 且 teamClass 零写入（越权链失去输入）', async () => {
      const before = await snapTeam(teamB.id);
      const res = await api(tokenA).put('/api/teacher/classes/' + clsA.id + '?schoolId=' + sA.id, { teamIds: [teamB.id] });
      expectDeniedOperation(res);
      expect(await snapTeam(teamB.id)).toEqual(before);
      expect(await prisma.teamClass.count({ where: { teamId: teamB.id, classId: clsA.id } })).toBe(0);
    });

    it('R6: 成员把班级挂进自己团队 → 200（合法路径未被过度收紧）', async () => {
      const res = await api(tokenC).put('/api/teacher/classes/' + clsTeam.id + '?schoolId=' + sA.id, { teamIds: [team.id] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '更新成功', data: null });
    });

    it('R7: 在自己不属于的学校建班 → 403 且班级零写入（A §2.1 #24 schoolId）', async () => {
      const res = await api(tokenB).post('/api/teacher/classes?schoolId=' + sA.id, { name: PREFIX + 'hack_class_b' });
      expectDeniedOperation(res);
      expect(await prisma.class.count({ where: { name: PREFIX + 'hack_class_b' } })).toBe(0);
    });

    it('R8: 建班时把班级挂进他人团队 → 403 且班级/团队关联双零写入', async () => {
      const before = await snapTeam(teamB.id);
      const res = await api(tokenA).post('/api/teacher/classes?schoolId=' + sA.id, { name: PREFIX + 'hack_class_team', teamIds: [teamB.id] });
      expectDeniedOperation(res);
      expect(await prisma.class.count({ where: { name: PREFIX + 'hack_class_team' } })).toBe(0);
      expect(await snapTeam(teamB.id)).toEqual(before);
    });
  });

  describe('round 6 · createTeam.schoolId 归属（A §2.1 #48）', () => {
    it('R9: 在自己不属于的学校建团队 → 403 且团队零写入', async () => {
      const res = await api(tokenA).post('/api/teacher/teams?schoolId=' + sB.id, { name: PREFIX + 'hack_team_x' });
      expectDeniedOperation(res);
      expect(await prisma.team.count({ where: { name: PREFIX + 'hack_team_x' } })).toBe(0);
    });

    it('R10: 在自己所属学校建团队 → 200（合法路径与响应形状不变）', async () => {
      const res = await api(tokenB).post('/api/teacher/teams?schoolId=' + sB.id, { name: PREFIX + 'team_ok_b' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('创建成功');
      expect(res.body.data.schoolId).toBe(sB.id);
    });
  });

  describe('round 6 · updateStudent.body.classId / addStudent / batchAddStudents（A §3.1 · #52/#53）', () => {
    it('R11: 把本人学生移入他人班级 → 403 且零写入（源班级未被 deleteMany 清空）', async () => {
      const before = await snapStudent(stuA.id);
      const res = await api(tokenA).put('/api/teacher/students/' + stuA.id + '?schoolId=' + sA.id, {
        realName: PREFIX + 'HACK_MOVE', classId: clsB.id,
      });
      expectDeniedOperation(res, [PREFIX + 'HACK_MOVE']);
      const after = await snapStudent(stuA.id);
      expect(after).toEqual(before);
      expect(after.sc).toEqual([{ classId: clsA.id }]);   // 修复前：被移出 clsA 并落入 clsB（他人班级 ⇒ 账号接管面）
    });

    it('R12: 跨校教师在他人班级新建学生 → 403 且零写入', async () => {
      const res = await api(tokenB).post('/api/teacher/students?schoolId=' + sB.id, {
        username: PREFIX + 'hack_stu', realName: '越权学生', classId: clsA.id,
      });
      expectDeniedOperation(res);
      expect(await prisma.user.count({ where: { username: { startsWith: PREFIX + 'hack_stu' } } })).toBe(0);
      expect(await prisma.studentClass.count({ where: { classId: clsA.id, student: { username: { startsWith: PREFIX + 'hack_stu' } } } })).toBe(0);
    });

    it('R13: 跨校教师批量导入到他人班级 → 403 且零写入', async () => {
      const res = await api(tokenB).post('/api/teacher/students/batch?schoolId=' + sB.id, {
        classId: clsA.id, students: [{ username: PREFIX + 'hack_batch', realName: '越权批量' }],
      });
      expectDeniedOperation(res);
      expect(await prisma.user.count({ where: { username: { startsWith: PREFIX + 'hack_batch' } } })).toBe(0);
    });

    it('R14: 本人班级新增学生 → 200（合法路径与响应形状不变）', async () => {
      const res = await api(tokenA).post('/api/teacher/students?schoolId=' + sA.id, {
        username: PREFIX + 'ok_stu', realName: '合法学生', classId: clsA.id,
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('新增成功');
      expect(res.body.data.username).toBe(PREFIX + 'ok_stu@' + CODE_A);
    });
  });

  describe('round 6 · checker 三写端点归属（A §2.1 #28-30：修复前 confirm/rollback 实测 200 且真实写库）', () => {
    it('R15: 跨师 confirm 他人题目的评分器 → 404 且 checker 状态零写入', async () => {
      const before = await snapChecker(qChecker.id);
      const res = await api(tokenB).post('/api/teacher/questions/' + qChecker.id + '/checker/confirm?schoolId=' + sB.id, { action: 'confirm' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '题目不存在', data: null });
      expect(await snapChecker(qChecker.id)).toEqual(before);
      expect(before.checkerStatus).toBe('ready');   // 修复前：tB 可把他人题目的 checkerStatus 改为 ready
    });

    it('R16: 跨师 rollback 他人题目的评分器 → 404 且 checkerScript 逐字节不变', async () => {
      const before = await snapChecker(qChecker.id);
      const res = await api(tokenB).post('/api/teacher/questions/' + qChecker.id + '/checker/rollback?schoolId=' + sB.id, { ruleVersionId: 1 });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '题目不存在', data: null });
      const after = await snapChecker(qChecker.id);
      expect(after).toEqual(before);
      expect(after.checkerScript).toBe(before.checkerScript);
    });

    it('R17: 跨师 generate → 404 且不触发异步生成（修复前会 fire-and-forget 真实 LLM）', async () => {
      const before = await snapChecker(qChecker.id);
      const res = await api(tokenB).post('/api/teacher/questions/' + qChecker.id + '/checker/generate?schoolId=' + sB.id);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '题目不存在', data: null });
      expect(await snapChecker(qChecker.id)).toEqual(before);
    });

    it('R18: 本人题目不被误伤 —— confirm 落到既有业务分支 400「缺少 action」（非 404）', async () => {
      const res = await api(tokenA).post('/api/teacher/questions/' + qChecker.id + '/checker/confirm?schoolId=' + sA.id, {});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 1001, message: '缺少 action', data: null });
    });

    it('R19: 本人题目不被误伤 —— rollback 落到既有业务分支 400「缺少 ruleVersionId」', async () => {
      const res = await api(tokenA).post('/api/teacher/questions/' + qChecker.id + '/checker/rollback?schoolId=' + sA.id, {});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 1001, message: '缺少 ruleVersionId', data: null });
    });
  });

  describe('round 6 · project body.classIds 归属（A §2.1 #18/#19）', () => {
    it('R20: 用他人班级创建实训任务 → 403 且 project/projectClass 双零写入', async () => {
      const title = PREFIX + 'hack_project';
      const res = await api(tokenB).post('/api/teacher/projects?schoolId=' + sB.id, {
        title, startTime: '2026-05-01T00:00:00Z', endTime: '2026-06-01T00:00:00Z', classIds: [clsA.id],
      });
      expectDeniedOperation(res);
      expect(await prisma.project.count({ where: { title } })).toBe(0);
      expect(await prisma.projectClass.count({ where: { classId: clsA.id } })).toBe(0);
    });

    it('R21: 本人班级创建实训任务 → 200（守卫未过度收紧；用例内自清 project* 以免 purge 撞 FK）', async () => {
      const title = PREFIX + 'ok_project';
      const res = await api(tokenA).post('/api/teacher/projects?schoolId=' + sA.id, {
        title, startTime: '2026-05-01T00:00:00Z', endTime: '2026-06-01T00:00:00Z', classIds: [clsA.id],
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const pid = res.body.data.id;
      expect(await prisma.projectClass.count({ where: { projectId: pid, classId: clsA.id } })).toBe(1);
      await prisma.projectClass.deleteMany({ where: { projectId: pid } });
      await prisma.projectFile.deleteMany({ where: { projectId: pid } });
      await prisma.project.delete({ where: { id: pid } });
    });

    it('R22: 更新任务时改写为他人班级 → 403 且 projectClass 零写入', async () => {
      const p = await prisma.project.create({
        data: { teacherId: tB.id, title: PREFIX + 'proj_b', startTime: new Date('2026-05-01'), endTime: new Date('2026-06-01'), status: 'draft' },
      });
      await prisma.projectClass.create({ data: { projectId: p.id, classId: clsB.id } });
      try {
        const before = await prisma.projectClass.findMany({ where: { projectId: p.id }, select: { classId: true }, orderBy: { classId: 'asc' } });
        const res = await api(tokenB).put('/api/teacher/projects/' + p.id + '?schoolId=' + sB.id, { classIds: [clsA.id] });
        expectDeniedOperation(res);
        const after = await prisma.projectClass.findMany({ where: { projectId: p.id }, select: { classId: true }, orderBy: { classId: 'asc' } });
        expect(after).toEqual(before);
      } finally {
        await prisma.projectClass.deleteMany({ where: { projectId: p.id } });
        await prisma.projectFile.deleteMany({ where: { projectId: p.id } });
        await prisma.project.delete({ where: { id: p.id } });
      }
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

    // ★ round 6 断言翻转（Captain 授权）：原断言 `draft.body.code === 0` 把 saveDraft 的越权写入
    //   锁成了期望值 ⇒ 修复后必然表现为 1 例假回归。此处翻转为「403 + DB 零写入」，
    //   与 §1c 的 submit/saveDraft/retry 归属收口（submission.use-cases._loadOwnedAssignment）同批生效。
    it('S3: 对抗性 —— 未投放学生先落草稿 → 403 且 DB 零写入（归属校验不可被「有提交」绕过）', async () => {
      const before = await prisma.submission.count({ where: { assignmentId: asgA.id, studentId: stuC.id } });
      expect(before).toBe(0);
      const draft = await api(tokenStuC).put('/api/student/assignments/' + asgA.id + '/draft', { questionId: qS6.id, answer: PREFIX + 'DRAFT_BY_ATTACKER' });
      expect(draft.status).toBe(403);
      expect(draft.body).toEqual({ code: 1003, message: '无权访问该作业', data: null });
      // DB 零写入：草稿行不得落库 ⇒ 也不占用 (assignmentId, studentId, questionId) 唯一键（抢答面）
      expect(await prisma.submission.count({ where: { assignmentId: asgA.id, studentId: stuC.id } })).toBe(before);
      expect(await prisma.submission.count({ where: { assignmentId: asgA.id, studentId: stuC.id, questionId: qS6.id } })).toBe(0);
      // 归属校验不可被「有提交」绕过：详情仍 403（S-6 守卫，读侧零泄漏）
      const res = await api(tokenStuC).get('/api/student/assignments/' + asgA.id);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 1003, message: '无权访问该作业', data: null });
    });

    it('S5: 未投放学生提交答案 → 403 且零写入（submit 与 saveDraft 同批收口）', async () => {
      const before = await prisma.submission.count({ where: { assignmentId: asgA.id, studentId: stuC.id } });
      const res = await api(tokenStuC).post('/api/student/assignments/' + asgA.id + '/submit', { questionId: qS6.id, answer: PREFIX + 'SUBMIT_BY_ATTACKER' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 1003, message: '无权访问该作业', data: null });
      expect(await prisma.submission.count({ where: { assignmentId: asgA.id, studentId: stuC.id } })).toBe(before);
    });

    it('S6: 未投放学生 retry → 403（越权判定优先于「仅练习模式」业务分支，避免状态预言机）', async () => {
      const res = await api(tokenStuC).post('/api/student/assignments/' + asgA.id + '/retry');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 1003, message: '无权访问该作业', data: null });
    });

    it('S7: 提交到不存在的作业 → 404 形状不变（归属校验不改既有分支）', async () => {
      const res = await api(tokenStuS6).post('/api/student/assignments/99999999/submit', { questionId: qS6.id, answer: 'x' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '作业不存在', data: null });
    });

    it('S8: 本班学生保存草稿 → 200（合法路径与响应形状不变）', async () => {
      const res = await api(tokenStuS6).put('/api/student/assignments/' + asgA.id + '/draft', { questionId: qS6.id, answer: PREFIX + 'LEGIT_DRAFT' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '草稿已保存', data: null });
    });

    it('S4: 学生取不存在的作业 → 404 形状不变（归属校验不改变既有分支）', async () => {
      const res = await api(tokenStuS6).get('/api/student/assignments/99999999');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '作业不存在', data: null });
    });
  });
});
