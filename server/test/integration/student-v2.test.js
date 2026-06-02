import { loginAsTeacher, loginAsStudent, authReq, getTestData, request } from './helpers.js';

describe('学生管理 V2 — 学号@院校代码格式', () => {
  let token, r, schoolId, classId, schoolCode, assignmentId;

  beforeAll(async () => {
    token = await loginAsTeacher();
    r = authReq(token);
    const td = getTestData();
    schoolId = td.schoolId;
    schoolCode = td.schoolCode;
    classId = td.classId;
    assignmentId = td.assignmentId;
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
    // 用纯学号登录（不带@code），应命中单校查询
    const res = await request()
      .post('/api/auth/login')
      .send({ username: '2024001', password: '2024001' });
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
    // 补全后密码重置为学号
    const res = await request()
      .post('/api/auth/login')
      .send({ username: completedSid, password: completedSid });
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

    // 验证：姓名已更新
    const listRes = await r.get(`/api/teacher/students?schoolId=${schoolId}&classId=${classId}`);
    const stu = listRes.body.data.find(s => s.id === noNameStudentId);
    expect(stu.realName).toBe('赵八');
  });

  it('T17: 补全姓名后学生可正常登录', async () => {
    // 补全后密码应重置为学号
    const res = await request()
      .post('/api/auth/login')
      .send({ username: '2024006', password: '2024006' });
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.realName).toBe('赵八');
  });

  // ================= 重置密码 =================

  it('T12: 重置正常学生密码 → 成功', async () => {
    const res = await r.put(`/api/teacher/students/${importedStudentIds[0]}/reset-password`);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toMatch(/已重置|学号/);

    // 验证可用学号登录
    const loginRes = await request()
      .post('/api/auth/login')
      .send({ username: '2024001', password: '2024001' });
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

    // 该学生登录
    const studentToken = await loginAsStudent('2024009');
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
    const adminLogin = await request()
      .post('/api/auth/login')
      .send({ username: 'admin', password: '***REDACTED***' });

    if (!adminLogin.body.data?.token) {
      console.log('  ⚠ 无 admin 账号，跳过 T15');
      return;
    }
    const adminToken = adminLogin.body.data.token;
    const adminReq = {
      get: (url) => request().get(url).set('Authorization', `Bearer ${adminToken}`),
      post: (url, body) => request().post(url).send(body).set('Authorization', `Bearer ${adminToken}`),
    };

    // 创建第二所学校（含院校代码）
    const schoolRes = await adminReq.post('/api/admin/schools', { name: '多校测试大学' });
    console.log('  创建学校响应:', schoolRes.body.code, schoolRes.body.message);

    // 更新第二所学校的 officialCode
    let multiSchoolId;
    if (schoolRes.body.code === 0) {
      multiSchoolId = schoolRes.body.data.id;
    } else {
      // 查找已存在的学校
      const schoolsRes = await adminReq.get('/api/admin/schools');
      const existing = schoolsRes.body.data.find(s => s.name === '多校测试大学');
      if (existing) multiSchoolId = existing.id;
    }

    if (!multiSchoolId) {
      console.log('  ⚠ 无法获取第二所学校，跳过 T15 后续');
      return;
    }

    // 用 prisma 直接更新 officialCode
    const { default: prisma } = await import('../../src/utils/prisma.js');
    await prisma.school.update({
      where: { id: multiSchoolId },
      data: { officialCode: '99999' },
    });

    // 在第二所学校创建班级
    const classRes = await adminReq.post('/api/admin/classes', {
      name: 'test_class_multi', schoolId: multiSchoolId,
    });
    const multiClassId = classRes.body.data?.id;
    if (!multiClassId) {
      console.log('  ⚠ 无法创建多校班级，code=' + classRes.body.code);
      return;
    }

    // 在第二所学校创建一个相同学号的学生
    const studentRes = await adminReq.post('/api/admin/students', {
      username: '2024001',
      realName: '另一学校的学生',
      classIds: [multiClassId],
    });
    console.log('  创建多校学生响应:', studentRes.body.code, studentRes.body.message);

    if (studentRes.body.code !== 0) {
      console.log('  ⚠ 无法创建多校学生，跳过登录测试');
      return;
    }

    // 现在 '2024001' 在两个学校都存在
    const loginRes = await request()
      .post('/api/auth/login')
      .send({ username: '2024001', password: '2024001' });
    console.log('  多校登录响应 code:', loginRes.body.code, 'schools:', loginRes.body.data?.schools?.length);
    expect(loginRes.body.code).toBe(1002);
    expect(loginRes.body.data.schools.length).toBeGreaterThanOrEqual(2);

    // 选择学校登录
    const selectRes = await request()
      .post('/api/auth/login')
      .send({ username: '2024001', password: '2024001', schoolCode: '10001' });
    expect(selectRes.body.code).toBe(0);
    expect(selectRes.body.data.token).toBeTruthy();
  });
});
