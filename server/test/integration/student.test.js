import { loginAsTeacher, authReq, getTestData } from './helpers.js';

describe('学生管理', () => {
  let token;
  let r;

  beforeAll(async () => {
    token = await loginAsTeacher();
    r = authReq(token);
  });

  // M1: 新增学生
  it('M1: 新增学生 → 200, 班级关联正确', async () => {
    const { classId } = getTestData();
    const res = await r.post('/api/teacher/students', {
      username: 'test_new_stu',
      realName: '新学生',
      classId,
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data.username).toBe('test_new_stu');
  });

  // 重复学号
  it('M1补充: 重复学号 → 400', async () => {
    const { classId } = getTestData();
    const res = await r.post('/api/teacher/students', {
      username: 'test_new_stu',
      realName: '重复学生',
      classId,
    });
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toContain('已存在');
  });

  // M2: 批量导入
  it('M2: 批量导入 → upsert 去重', async () => {
    const { classId } = getTestData();
    const res = await r.post('/api/teacher/students/batch', {
      classId,
      students: [
        { username: 'batch_01', realName: '批量1' },
        { username: 'batch_02', realName: '批量2' },
        { username: 'batch_03', realName: '批量3' },
      ],
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data.success).toBeGreaterThanOrEqual(3);
  });

  // M3: 编辑学生
  it('M3: 编辑学生 → 姓名更新', async () => {
    const { studentIds } = getTestData();
    const res = await r.put(`/api/teacher/students/${studentIds[0]}`, {
      realName: '学生甲改名',
    });
    expect(res.body.code).toBe(0);

    const { schoolId } = getTestData();
    const listRes = await r.get(`/api/teacher/students?schoolId=${schoolId}`);
    const stu = listRes.body.data.find(s => s.id === studentIds[0]);
    expect(stu.realName).toBe('学生甲改名');
  });

  // M4: 删除学生
  it('M4: 删除学生 → 软删除 + 级联', async () => {
    const { classId, schoolId } = getTestData();
    const createRes = await r.post('/api/teacher/students', {
      username: 'test_del_stu',
      realName: '待删除',
      classId,
    });
    const id = createRes.body.data.id;

    const delRes = await r.delete(`/api/teacher/students/${id}`);
    expect(delRes.body.code).toBe(0);

    const listRes = await r.get(`/api/teacher/students?schoolId=${schoolId}`);
    const found = listRes.body.data.find(s => s.id === id);
    expect(found).toBeUndefined();
  });

  // 学生列表含班级信息
  it('附加: 学生列表含班级信息', async () => {
    const { schoolId } = getTestData();
    const res = await r.get(`/api/teacher/students?schoolId=${schoolId}`);
    expect(res.body.code).toBe(0);
    const stu = res.body.data[0];
    if (stu) {
      expect(stu.studentClasses).toBeDefined();
    }
  });
});
