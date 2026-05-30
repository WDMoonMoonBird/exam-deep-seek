import { request, loginAsTeacher, loginAsStudent, getTestData } from './helpers.js';

describe('认证 API', () => {
  // A1: 教师登录
  it('A1: 教师登录 → 200, role=teacher', async () => {
    const res = await request()
      .post('/api/auth/login')
      .send({ username: 'test_teacher', password: 'test_teacher' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.role).toBe('teacher');
    expect(res.body.data.token).toBeTruthy();
  });

  // A2: 学生登录
  it('A2: 学生登录 → 200, role=student', async () => {
    const res = await request()
      .post('/api/auth/login')
      .send({ username: 'test_stu_01', password: 'test_stu_01' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.role).toBe('student');
    expect(res.body.data.token).toBeTruthy();
  });

  // A3: 错误密码
  it('A3: 错误密码 → 400', async () => {
    const res = await request()
      .post('/api/auth/login')
      .send({ username: 'test_teacher', password: 'wrong_password' });
    expect(res.body.code).toBe(1001);
  });

  // A4: 无 token 访问题库 → 401
  it('A4: 无token访问教师API → 401', async () => {
    const res = await request().get('/api/teacher/questions');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  // A5: 学生访问教师路由 → 403
  it('A5: 学生token访问题库 → 403', async () => {
    const token = await loginAsStudent('test_stu_01');
    const res = await request()
      .get('/api/teacher/questions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
  });

  // A6: 教师访问学生路由 → 403
  it('A6: 教师token访问学生提交API → 403', async () => {
    const token = await loginAsTeacher();
    const { assignmentId } = getTestData();
    const res = await request()
      .post(`/api/student/assignments/${assignmentId}/submit`)
      .send({ questionId: 1, answer: 'test' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
