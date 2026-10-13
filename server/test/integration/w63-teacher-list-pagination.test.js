/**
 * W63（R2-B47 / t26）：教师端列表**服务端分页** + 作用域不变 + 字段最小化（白名单/负例）。
 *
 * 口径（见 docs/dsh/R2-B47-修复记录.md §2）：
 *   · 传 page/pageSize ⇒ 返回 { list, total, page, pageSize }；page 默认 1、pageSize 默认 20、**上限 100**；
 *   · **完全不传** ⇒ 返回全量数组（历史形状，向后兼容）。
 * 仅测试库；自建数据 afterAll 清理。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request, loginAsTeacher, authReq } from './helpers.js';

const TAG = 'w63-pg-' + Date.now();
const cleanup = { schoolIds: [], classIds: [], userIds: [] };
const ALLOWED_STUDENT_KEYS = ['id', 'username', 'realName', 'createdAt', 'studentClasses'];

describe('W63 教师端列表分页 / 作用域 / 字段最小化（R2-B47）', () => {
  let token = null;
  let schoolId = null;
  let seedClassId = null;
  let seedStudentCount = 0;
  let foreignStudentUsername = null;
  let foreignSchoolId = null;

  beforeAll(async () => {
    token = await loginAsTeacher();
    // ★教师端接口的 schoolId 取自**查询串**（guards.getSchoolId）——前端由 axios 拦截器统一注入，测试需显式带上
    const schools = await request().get('/api/teacher/my-schools').set('Authorization', 'Bearer ' + token);
    schoolId = schools.body.data[0].id;
    const r = await request().get('/api/teacher/classes?schoolId=' + schoolId).set('Authorization', 'Bearer ' + token);
    const classes = r.body.data;
    seedClassId = Array.isArray(classes) ? classes[0]?.id : classes?.list?.[0]?.id;
    // 教师可见学生总数（含 seed 学生）——作为 total 基线
    const full = await request().get('/api/teacher/students?schoolId=' + schoolId).set('Authorization', 'Bearer ' + token);
    seedStudentCount = (full.body.data || []).length;

    // 外部作用域：另一学校 + 另一教师 + 另一班级 + 另一学生（教师 1 绝不可见）
    const school = await prisma.school.create({ data: { name: TAG + '-外校' } });
    cleanup.schoolIds.push(school.id);
    foreignSchoolId = school.id;
    const foreignTeacher = await prisma.user.create({ data: { username: TAG + '-ft', password: bcrypt.hashSync('x', 10), role: 'teacher', realName: TAG + ' 外校师' } });
    cleanup.userIds.push(foreignTeacher.id);
    await prisma.teacherSchool.create({ data: { teacherId: foreignTeacher.id, schoolId: school.id } });
    const klass = await prisma.class.create({ data: { name: TAG + '-外班', schoolId: school.id } });
    cleanup.classIds.push(klass.id);
    foreignStudentUsername = TAG + '-fs';
    const foreignStudent = await prisma.user.create({ data: { username: foreignStudentUsername, password: bcrypt.hashSync('x', 10), role: 'student', realName: TAG + ' 外校生' } });
    cleanup.userIds.push(foreignStudent.id);
    await prisma.studentClass.create({ data: { studentId: foreignStudent.id, classId: klass.id } });
    // 外校教师直连该班（否则其可见班级为空 ⇒ 语义上本就看不到任何学生，无法构成"反向"对照）
    await prisma.teacherClass.create({ data: { teacherId: foreignTeacher.id, classId: klass.id } });
  }, 120000);

  afterAll(async () => {
    await prisma.studentClass.deleteMany({ where: { classId: { in: cleanup.classIds } } });
    await prisma.teacherSchool.deleteMany({ where: { teacherId: { in: cleanup.userIds } } });
    await prisma.studentClass.deleteMany({ where: { studentId: { in: cleanup.userIds } } });
    await prisma.teacherClass.deleteMany({ where: { teacherId: { in: cleanup.userIds } } });
    await prisma.class.deleteMany({ where: { id: { in: cleanup.classIds } } });
    await prisma.school.deleteMany({ where: { id: { in: cleanup.schoolIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  }, 120000);

  const getStudents = (qs) => authReq(token).get('/api/teacher/students?schoolId=' + schoolId + (qs ? '&' + qs : ''));

  it('★W63-1 分页边界：首页/末页/越界页 + total 一致 + 跨页无重复无遗漏', async () => {
    const p1 = await getStudents('page=1&pageSize=2');
    expect(p1.status).toBe(200);
    expect(p1.body.code).toBe(0);
    expect(Array.isArray(p1.body.data.list)).toBe(true);
    expect(p1.body.data.page).toBe(1);
    expect(p1.body.data.pageSize).toBe(2);
    expect(p1.body.data.total).toBe(seedStudentCount);
    expect(p1.body.data.list.length).toBe(Math.min(2, seedStudentCount));

    // 逐页取全（pageSize=1）：无重复、无遗漏、每页 total 一致
    const ids = [];
    for (let page = 1; page <= seedStudentCount + 1; page += 1) {
      const r = await getStudents('page=' + page + '&pageSize=1');
      expect(r.body.data.total).toBe(seedStudentCount);
      for (const row of r.body.data.list) ids.push(row.id);
    }
    expect(new Set(ids).size).toBe(seedStudentCount);                 // ★无重复
    expect(ids.length).toBe(seedStudentCount);                        // ★无遗漏（含越界页空列表）

    // 越界页：空列表但 total 不变（不是 0、不报错）
    const over = await getStudents('page=9999&pageSize=20');
    expect(over.status).toBe(200);
    expect(over.body.data.list).toEqual([]);
    expect(over.body.data.total).toBe(seedStudentCount);
  }, 120000);

  it('★W63-2 参数口径与向后兼容：不传参数 ⇒ 全量数组；pageSize 上限 100；page 非法回落 1', async () => {
    const legacy = await getStudents('');
    expect(Array.isArray(legacy.body.data)).toBe(true);               // ★历史形状：数组
    expect(legacy.body.data.length).toBe(seedStudentCount);

    const onlyPage = await getStudents('page=1');
    expect(Array.isArray(onlyPage.body.data)).toBe(false);
    expect(onlyPage.body.data.pageSize).toBe(20);                     // 默认 20
    expect(onlyPage.body.data.page).toBe(1);

    const capped = await getStudents('page=1&pageSize=9999');
    expect(capped.body.data.pageSize).toBe(100);                      // ★上限 100（防一次拉全库）

    const badPage = await getStudents('page=0&pageSize=abc');
    expect(badPage.body.data.page).toBe(1);                           // 非法 ⇒ 回落
    expect(badPage.body.data.pageSize).toBe(20);

    // 班级筛选仍生效（scope 收窄，不分页时数组形状不变）
    const byClass = await getStudents('classId=' + seedClassId);
    expect(Array.isArray(byClass.body.data)).toBe(true);
  }, 120000);

  it('★W63-3 作用域不变：教师只看自己可见班级的学生（外校/外班不可见）', async () => {
    const all = await getStudents('');
    const usernames = all.body.data.map((s) => s.username);
    expect(usernames).not.toContain(foreignStudentUsername);          // ★外校学生不可见
    const paged = await getStudents('page=1&pageSize=100');
    expect(paged.body.data.list.map((s) => s.username)).not.toContain(foreignStudentUsername);
    // 反向：外校教师看不到本教师的 seed 学生（其可见集合里只有自己班那一个）
    const foreignLogin = await request().post('/api/auth/login').send({ username: TAG + '-ft', password: 'x' });
    const foreignToken = foreignLogin.body.data.token;
    const foreign = await authReq(foreignToken).get('/api/teacher/students?schoolId=' + foreignSchoolId);
    expect(foreign.body.data.map((s) => s.username)).toEqual([foreignStudentUsername]);   // ★外校教师只看到自己班的学生
    expect(foreign.body.data.map((s) => s.username)).not.toContain(all.body.data[0].username);
  }, 120000);

  it('★W63-4 字段最小化：响应键集合 ⊆ 白名单，且不含 password/hash/手机号/证件号（负例）', async () => {
    const r = await getStudents('page=1&pageSize=50');
    const list = r.body.data.list;
    expect(list.length).toBeGreaterThan(0);
    for (const row of list) {
      for (const k of Object.keys(row)) expect(ALLOWED_STUDENT_KEYS).toContain(k);      // ★键集合白名单
      expect(Object.prototype.hasOwnProperty.call(row, 'password')).toBe(false);
      // 班级/学校嵌套也只允许必要字段
      const sc = (row.studentClasses || [])[0];
      if (sc) {
        for (const k of Object.keys(sc)) expect(['classId', 'class']).toContain(k);
        if (sc.class) for (const k of Object.keys(sc.class)) expect(['id', 'name', 'school']).toContain(k);
        if (sc.class && sc.class.school) for (const k of Object.keys(sc.class.school)) expect(['id', 'name']).toContain(k);
      }
    }
    const body = JSON.stringify(r.body);
    for (const bad of ['password', 'hash', 'idCard', 'id_card', 'phone', 'mobile', 'idNumber']) {
      expect(body.toLowerCase()).not.toContain(bad.toLowerCase());                      // ★负例断言
    }
  }, 120000);

  it('★W63-5 其它教师列表接口同样分页（classes / teachers）：分页形状 + 不传参数向后兼容', async () => {
    const clsPaged = await authReq(token).get('/api/teacher/classes?page=1&pageSize=1&schoolId=' + schoolId);
    expect(Array.isArray(clsPaged.body.data)).toBe(false);
    expect(clsPaged.body.data.pageSize).toBe(1);
    expect(clsPaged.body.data.list.length).toBeLessThanOrEqual(1);
    expect(clsPaged.body.data.total).toBeGreaterThanOrEqual(clsPaged.body.data.list.length);
    const clsLegacy = await authReq(token).get('/api/teacher/classes?schoolId=' + schoolId);
    expect(Array.isArray(clsLegacy.body.data)).toBe(true);            // 旧形状（下拉/选择器调用方不受影响）

    const tPaged = await authReq(token).get('/api/teacher/teachers?page=1&pageSize=5');
    expect(Array.isArray(tPaged.body.data)).toBe(false);
    expect(tPaged.body.data.pageSize).toBe(5);
    const tLegacy = await authReq(token).get('/api/teacher/teachers');
    expect(Array.isArray(tLegacy.body.data)).toBe(true);
  }, 120000);
});
