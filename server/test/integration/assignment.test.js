import { loginAsTeacher, authReq, getTestData } from './helpers.js';

describe('作业管理', () => {
  let token;
  let r;

  beforeAll(async () => {
    token = await loginAsTeacher();
    r = authReq(token);
  });

  // B1: 创建作业
  it('B1: 创建作业 → 200', async () => {
    const { classId, questionId } = getTestData();
    const res = await r.post('/api/teacher/assignments', {
      title: '测试作业B1',
      startTime: '2026-05-01T00:00:00Z',
      endTime: '2026-06-01T00:00:00Z',
      questionIds: [questionId],
      classIds: [classId],
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe('测试作业B1');
  });

  // B2: 选题 + 选班 → AssignmentQuestion + AssignmentClass 正确
  it('B2: 选题+选班 → 关联正确', async () => {
    const { classId, questionId } = getTestData();
    const res = await r.post('/api/teacher/assignments', {
      title: '关联测试作业',
      startTime: '2026-05-01T00:00:00Z',
      endTime: '2026-06-01T00:00:00Z',
      questionIds: [questionId],
      classIds: [classId],
    });
    expect(res.body.code).toBe(0);
    const id = res.body.data.id;

    const getRes = await r.get(`/api/teacher/assignments/${id}`);
    expect(getRes.body.data.assignmentQuestions).toHaveLength(1);
    expect(getRes.body.data.assignmentQuestions[0].questionId).toBe(questionId);
    expect(getRes.body.data.assignmentClasses).toHaveLength(1);
    expect(getRes.body.data.assignmentClasses[0].classId).toBe(classId);
  });

  // B3: 作业列表分页
  it('B3: 作业列表分页 → page/total 正确', async () => {
    const res = await r.get('/api/teacher/assignments?page=1&pageSize=5');
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('list');
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data.page).toBe(1);
  });
});
