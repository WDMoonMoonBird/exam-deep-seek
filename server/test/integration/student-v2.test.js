import bcrypt from 'bcryptjs';
import { loginAsTeacher, loginAsStudent, loginAsAdmin, authReq, getTestData, request } from './helpers.js';

/**
 * ★W2-C16：T15 多校场景的**工件登记**与**无条件自清**。
 * 为什么必须自清：学生登录按 username startsWith(学号@) 取候选（authController:83-108）⇒ 残留的
 * 2024001@<第二校 code> 会让**同文件后续/下一轮**的单校登录命中多校分支返回 1002（t52 实测污染 T3补充/T12）。
 * 用**改名**而非删除：该账号可能被 student_class/submission 以 student_id 外键引用，删除会触发 P2003。
 */
const multiSchoolArtifacts = { schoolId: null, classId: null, studentIds: [] };

async function cleanupMultiSchool(prisma) {
  const a = multiSchoolArtifacts;
  for (const sid of a.studentIds) {
    if (!sid) continue;
    try {
      await prisma.user.update({
        where: { id: sid },
        data: { username: 'zz_leftover_ms_' + Date.now() + '_' + sid + '@99999' },
      });
    } catch { /* 已不存在/已改名 ⇒ 视为已清 */ }
  }
  if (a.classId) { try { await prisma.class.delete({ where: { id: a.classId } }); } catch { /* 有引用则保留 */ } }
  if (a.schoolId) { try { await prisma.school.delete({ where: { id: a.schoolId } }); } catch { /* 有引用则保留 */ } }
  a.studentIds = []; a.classId = null; a.schoolId = null;
}

describe('学生管理 V2 — 学号@院校代码格式', () => {
  let token, r, schoolId, classId, schoolCode, assignmentId;
  // ★H6（W2-C12）：经 API 建号/重置后口令为**一次性临时口令** ⇒ 由响应捕获后使用（旧语义=学号/用户名）
  const initialPwds = {};        // 批量导入：{ '学号@院校代码': 临时口令 }
  let completedSidPwd = null;    // T8 补全学号后的临时口令（T16 用）
  let completedNamePwd = null;   // T11 补全姓名后的临时口令（T17 用）

  beforeAll(async () => {
    token = await loginAsTeacher();
    r = authReq(token);
    const td = getTestData();
    schoolId = td.schoolId;
    schoolCode = td.schoolCode;
    classId = td.classId;
    assignmentId = td.assignmentId;
  });

  // ★W2-C16：无条件自清（即使 T15 中途抛错/被中止，也不给后续运行留污染）
  afterAll(async () => {
    const { default: prisma } = await import('../../src/utils/prisma.js');
    await cleanupMultiSchool(prisma);
  });

  // ================= 班级人数 =================

  it('T1: 班级列表含 _count.studentClasses', async () => {
    const res = await r.get(`/api/teacher/classes?schoolId=${schoolId}`);
    expect(res.body.code).toBe(0);
    const cls = res.body.data[0];
    expect(cls).toBeDefined();
    expect(cls._count).toBeDefined();
    expect(typeof cls._count.studentClasses).toBe('number');
  });

  // ================= 完整导入 =================

  let importedStudentIds = [];

  it('T2: 批量导入完整数据 → 全部成功', async () => {
    const res = await r.post('/api/teacher/students/batch', {
      classId,
      students: [
        { username: '2024001', realName: '张三' },
        { username: '2024002', realName: '李四' },
        { username: '2024003', realName: '王五' },
      ],
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data.success).toBe(3);
    expect(res.body.data.errors).toHaveLength(0);
    // ★H6：批量导入**逐个回传**一次性临时口令（只回显一次）⇒ 记录供"导入后登录"用例使用
    // ★W3 回退（用户裁定，测试期）：批量导入不再回传 credentials（口令 = 学号）⇒ 由用户名推出
    expect(res.body.data.credentials).toBeUndefined();
    initialPwds['2024001@' + schoolCode] = '2024001';
  });

  it('T3: 导入后列表无待补全标记，username 格式正确', async () => {
    const res = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const students = res.body.data.filter(s => s.username.includes('202400'));
    expect(students.length).toBeGreaterThanOrEqual(3);

    for (const s of students) {
      // username 应为 学号@院校代码
      expect(s.username).toMatch(/^202400\d@\d+$/);
      // 姓名正常
      expect(s.realName).toBeTruthy();
      expect(s.realName).not.toBe('(待补全)');
      // 学号部分不含 tmp_
      const sid = s.username.split('@')[0];
      expect(sid.startsWith('tmp_')).toBe(false);
      importedStudentIds.push(s.id);
    }
  });

  it('T3补充: 完整导入的学生可正常登录', async () => {
    // ★H6：口令不再是学号，而是 T2 批量导入回传的一次性临时口令；用纯学号登录（不带@code）命中单校查询
    const res = await request()
      .post('/api/auth/login')
      .send({ username: '2024001', password: initialPwds['2024001@' + schoolCode] });
    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe('student');
  });

  // ================= 缺学号导入 =================

  let tmpStudentId;
  let tmpStudentUsername;

  it('T4: 批量导入缺学号行 → 成功但待补全', async () => {
    const res = await r.post('/api/teacher/students/batch', {
      classId,
      students: [
        { username: '', realName: '钱六' },
      ],
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data.success).toBe(1);
  });

  it('T4补充: 列表显示 tmp_ 学号 + 待补全', async () => {
    const res = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const stu = res.body.data.find(s => s.realName === '钱六');
    expect(stu).toBeDefined();
    tmpStudentId = stu.id;
    tmpStudentUsername = stu.username;
    const sid = stu.username.split('@')[0];
    expect(sid.startsWith('tmp_')).toBe(true);
    // @后面是学校代码
    expect(stu.username.split('@')[1]).toBe(schoolCode);
  });

  it('T5: 缺学号学生无法登录', async () => {
    // 用全用户名登录 → 密码为空串hash → 不可能匹配
    const res = await request()
      .post('/api/auth/login')
      .send({ username: tmpStudentUsername, password: '' });
    expect(res.body.code).toBe(1001); // 用户名或密码错误
    // 用任何密码也不能登录
    const res2 = await request()
      .post('/api/auth/login')
      .send({ username: tmpStudentUsername, password: 'test123' });
    expect(res2.body.code).toBe(1001);
  });

  // ================= 缺姓名导入 =================

  let noNameStudentId;
  let noNameStudentUsername;

  it('T6: 批量导入缺姓名行 → 成功但待补全', async () => {
    const res = await r.post('/api/teacher/students/batch', {
      classId,
      students: [
        { username: '2024006', realName: '' },
      ],
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data.success).toBe(1);
  });

  it('T6补充: 列表显示 (待补全) + 正确学号', async () => {
    const res = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const stu = res.body.data.find(s => s.username.startsWith('2024006'));
    expect(stu).toBeDefined();
    noNameStudentId = stu.id;
    noNameStudentUsername = stu.username;
    expect(stu.realName).toBe('(待补全)');
    expect(stu.username.split('@')[0]).toBe('2024006');
  });

  it('T7: 缺姓名学生无法登录', async () => {
    const res = await request()
      .post('/api/auth/login')
      .send({ username: noNameStudentUsername, password: 'any' });
    expect(res.body.code).toBe(1001);
    // 纯学号登录也会失败
    const res2 = await request()
      .post('/api/auth/login')
      .send({ username: '2024006', password: '2024006' });
    expect(res2.body.code).toBe(1001);
  });

  // ================= 补全学号 =================

  let completedSid = '2024008';

  it('T8: 编辑补全学号（tmp_ → 真实）→ 成功', async () => {
    const res = await r.put(`/api/teacher/students/${tmpStudentId}`, {
      newUsername: completedSid,
      realName: '钱六',
      classId,
    });
    expect(res.body.code).toBe(0);
    // ★H6：补全学号即重置口令 ⇒ 捕获一次性临时口令（T16 用）
    // ★W3 回退（用户裁定，测试期）：补全学号即重置口令 ⇒ 口令 = **新学号**
    expect(res.body.data?.initialPassword).toBeUndefined();
    completedSidPwd = completedSid;
    expect(typeof completedSidPwd).toBe('string');

    // 验证：列表中学号已更新
    const listRes = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const stu = listRes.body.data.find(s => s.id === tmpStudentId);
    expect(stu).toBeDefined();
    expect(stu.username.split('@')[0]).toBe(completedSid);
    expect(stu.realName).toBe('钱六');
  });

  it('T9: 补全后学号不可再改', async () => {
    // 再次尝试改学号 → 后端应忽略 newUsername（因为不再以 tmp_ 开头）
    const res = await r.put(`/api/teacher/students/${tmpStudentId}`, {
      newUsername: '2024099',
      realName: '钱六',
      classId,
    });
    // 不报错，但学号不会变
    expect(res.body.code).toBe(0);
    const listRes = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const stu = listRes.body.data.find(s => s.id === tmpStudentId);
    expect(stu.username.split('@')[0]).toBe(completedSid); // 还是原来的
  });

  it('T10: 补全学号查重 → 已存在则拒绝', async () => {
    // 先创建另一条缺学号记录
    const batchRes = await r.post('/api/teacher/students/batch', {
      classId,
      students: [{ username: '', realName: '孙七' }],
    });
    expect(batchRes.body.code).toBe(0);

    const listRes = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const newTmp = listRes.body.data.find(s => s.realName === '孙七');
    expect(newTmp).toBeDefined();

    // 尝试补全为已存在的学号
    const res = await r.put(`/api/teacher/students/${newTmp.id}`, {
      newUsername: completedSid, // 与 T8 补全的学号冲突
      realName: '孙七',
      classId,
    });
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toMatch(/已被使用|已存在/);
  });

  it('T16: 补全学号后学生可正常登录', async () => {
    // ★H6：补全学号后口令是**随机临时口令**（不再等于学号）⇒ 用 T8 捕获的口令登录
    const res = await request()
      .post('/api/auth/login')
      .send({ username: completedSid, password: completedSidPwd });
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.role).toBe('student');
  });

  // ================= 补全姓名 =================

  it('T11: 编辑补全姓名 → 密码重置并可登录', async () => {
    const res = await r.put(`/api/teacher/students/${noNameStudentId}`, {
      realName: '赵八',
      classId,
    });
    expect(res.body.code).toBe(0);
    // ★H6：补全姓名即重置口令 ⇒ 捕获一次性临时口令（T17 用）
    // ★W3 回退（用户裁定，测试期）：补全姓名即重置口令 ⇒ 口令 = **学号**
    expect(res.body.data?.initialPassword).toBeUndefined();
    completedNamePwd = '2024006';
    expect(typeof completedNamePwd).toBe('string');

    // 验证：姓名已更新
    const listRes = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const stu = listRes.body.data.find(s => s.id === noNameStudentId);
    expect(stu.realName).toBe('赵八');
  });

  it('T17: 补全姓名后学生可正常登录', async () => {
    // ★H6：补全姓名后口令是**随机临时口令**（不再等于学号）⇒ 用 T11 捕获的口令登录
    const res = await request()
      .post('/api/auth/login')
      .send({ username: '2024006', password: completedNamePwd });
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.realName).toBe('赵八');
  });

  // ================= 重置密码 =================

  it('T12: 重置正常学生密码 → 成功', async () => {
    const res = await r.put(`/api/teacher/students/${importedStudentIds[0]}/reset-password`);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toMatch(/已重置|临时口令/);
    // ★H6：重置回传一次性临时口令（不再是学号）
    // ★W3 回退（用户裁定，测试期）：重置后口令 = **学号**（data 为 null，学号在 message 文本里）
    expect(res.body.data).toBeNull();
    const temp = '2024001';

    // 验证可用**该临时口令**登录（旧语义=用学号登录）
    const loginRes = await request()
      .post('/api/auth/login')
      .send({ username: '2024001', password: temp });
    expect(loginRes.body.code).toBe(0);
  });

  it('T13: 重置待补全学生密码 → 拒绝', async () => {
    // 创建一个新的 tmp_ 学生来测试
    const batchRes = await r.post('/api/teacher/students/batch', {
      classId,
      students: [{ username: '', realName: '待补全测试' }],
    });
    expect(batchRes.body.code).toBe(0);

    const listRes = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const tmpStu = listRes.body.data.find(s => s.realName === '待补全测试');
    expect(tmpStu).toBeDefined();

    const res = await r.put(`/api/teacher/students/${tmpStu.id}/reset-password`);
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toMatch(/尚未补全|补全/);
  });

  // ================= 后加入学生可见作业 =================

  it('T14: 作业发布后新增学生 → 该学生可见已布置的作业', async () => {
    // 新增一名学生
    const createRes = await r.post('/api/teacher/students', {
      username: '2024009',
      realName: '新学生',
      classId,
    });
    expect(createRes.body.code).toBe(0);
    // ★W3 回退（用户裁定，测试期）：新建账号口令 = **学号**、不置强制改密标志、响应不回显口令
    expect(createRes.body.data?.initialPassword).toBeUndefined();
    const temp = '2024009';
    const login1 = await request().post('/api/auth/login').send({ username: '2024009', password: temp });
    expect(login1.body.code).toBe(0);
    // ★回退的反向锁：学生不再被要求首登改密（闸门亦按角色收窄，学生不在作用域内）
    expect(login1.body.data.user.mustChangePassword).toBe(false);
    // 学生可**自助改密**（该能力在回退后保留）⇒ 改密后重新登录，令牌可用
    const NEW_STU_PWD = 'Stu-2024009-New1';
    const ch = await authReq(login1.body.data.token).put('/api/auth/password', { oldPassword: temp, newPassword: NEW_STU_PWD });
    expect(ch.status).toBe(200);
    const login2 = await request().post('/api/auth/login').send({ username: '2024009', password: NEW_STU_PWD });
    const studentToken = login2.body.data.token;
    expect(studentToken).toBeTruthy();

    // 查作业列表
    const sReq = { get: (url) => request().get(url).set('Authorization', `Bearer ${studentToken}`) };
    const assignRes = await sReq.get('/api/student/assignments');
    expect(assignRes.body.code).toBe(0);
    expect(assignRes.body.data.list.length).toBeGreaterThan(0);
    // 应包含 setup 创建的测试作业
    const found = assignRes.body.data.list.find(a => a.id === assignmentId);
    expect(found).toBeDefined();
  });

  // ================= 多学校登录 =================

  let multiSchoolCode;

  it('T15: 相同学号多学校 → 登录返回学校选择', async () => {
    // 通过 setup 已有的学校 + 新增一个学校来构造多学校场景
    // W0-C 夹具：admin 凭据不再硬编码（C1 已移除启动期默认超管）
    const adminToken = await loginAsAdmin();
    const adminReq = {
      get: (url) => request().get(url).set('Authorization', `Bearer ${adminToken}`),
      post: (url, body) => request().post(url).send(body).set('Authorization', `Bearer ${adminToken}`),
    };

    // ★W2-C16（方案 A）：原实现调用 POST /api/admin/schools —— **该端点不存在**（实测 1404）⇒
    //   本用例长期**静默早退**（多校断言从未执行）。现改为 **prisma 直建第二所学校**（与既有 fixture 同型），
    //   并配合 finally/afterAll 的**工件无条件自清**（cleanupMultiSchool）。
    //   任一前置条件不成立 ⇒ **显式断言失败**（不再静默 return —— 那正是本任务要消灭的形态）。
    const { default: prisma } = await import('../../src/utils/prisma.js');
    const prior = await prisma.school.findFirst({ where: { name: '多校测试大学' } });
    const multiSchool = prior || await prisma.school.create({ data: { name: '多校测试大学', officialCode: '99999' } });
    multiSchoolArtifacts.schoolId = multiSchool.id;
    expect(multiSchool.id).toBeTruthy();

    // 在第二所学校创建班级（该端点存在 ✓）
    const classRes = await adminReq.post('/api/admin/classes', {
      name: 'test_class_multi', schoolId: multiSchool.id,
    });
    const multiClassId = classRes.body.data?.id;
    multiSchoolArtifacts.classId = multiClassId;
    expect({ label: '多校班级', id: multiClassId }).toEqual({ label: '多校班级', id: expect.any(Number) });

    // 在第二所学校创建一个**相同学号**的学生（建号口令=一次性临时口令，见下方归一化）
    const studentRes = await adminReq.post('/api/admin/students', {
      username: '2024001',
      realName: '另一学校的学生',
      classIds: [multiClassId],
    });
    expect({ code: studentRes.body.code, message: studentRes.body.message }).toMatchObject({ code: 0 });
    const multiStudentId = studentRes.body.data?.id;
    multiSchoolArtifacts.studentIds.push(multiStudentId);
    expect(typeof multiStudentId).toBe('number');

    // ★W2-C16：多校分支需要**两校同名账号**。完整跑时第一校账号由 T2 批量导入建出，
    //   但**单独跑本用例时它不存在**（实测 norm.count=1 ⇒ 多校条件不成立）⇒ 这里自行确保（幂等），
    //   使本用例**自足**：既能在文件内跑，也能被 -t 单独跑。清理阶段同样会改名它（防跨轮残留）。
    const ensureFirst = await r.post('/api/teacher/students', { username: '2024001', realName: '第一校学生', classId });
    let firstSchoolStudentId = ensureFirst.body.code === 0 ? ensureFirst.body.data?.id : null;
    if (!firstSchoolStudentId) {
      const list = await r.get('/api/teacher/students?schoolId=' + schoolId + '&classId=' + classId);
      firstSchoolStudentId = (list.body.data || []).find((s) => String(s.username).startsWith('2024001@'))?.id || null;
    }
    expect(typeof firstSchoolStudentId).toBe('number');
    multiSchoolArtifacts.studentIds.push(firstSchoolStudentId);

    // ★H6 适配：两校同名账号的**临时口令各不相同** ⇒ 多校选择分支（按口令匹配候选学校）无法用单一口令触发
    //   ⇒ 先把两校账号口令归一为同一已知值（测试夹具直改库，与 seed 账号同型；不改生产代码）。
    const MULTI_PWD = 'Multi-school-1';
    const norm = await prisma.user.updateMany({
      where: { username: { startsWith: '2024001@' } },
      data: { password: bcrypt.hashSync(MULTI_PWD, 10), mustChangePassword: false },
    });
    // ★证据①：多校条件**确实成立**（两校同名账号都在）
    expect(norm.count).toBeGreaterThanOrEqual(2);

    try {
      const loginRes = await request()
        .post('/api/auth/login')
        .send({ username: '2024001', password: MULTI_PWD });
      console.log('  多校登录响应 code:', loginRes.body.code, 'schools:', loginRes.body.data?.schools?.length);
      // ★证据②：命中多校分支并回学校名单（断言确实执行，而非早退）
      expect(loginRes.body.code).toBe(1002);
      expect(loginRes.body.data.schools.length).toBeGreaterThanOrEqual(2);

      // 选择学校登录
      const selectRes = await request()
        .post('/api/auth/login')
        .send({ username: '2024001', password: MULTI_PWD, schoolCode: '10001' });
      expect(selectRes.body.code).toBe(0);
      expect(selectRes.body.data.token).toBeTruthy();
    } finally {
      // ★工件无条件自清（无论断言是否失败）
      await cleanupMultiSchool(prisma);
    }
  });
});
