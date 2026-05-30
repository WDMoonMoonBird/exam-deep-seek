import { loginAsStudent, authReq, getTestData } from './helpers.js';

describe('学生答题', () => {
  let token;
  let r;

  beforeAll(async () => {
    token = await loginAsStudent('test_stu_03');
    r = authReq(token);
  });

  // T1: 查看作业详情
  it('T1: 查看作业详情 → 返回材料+小题+已有提交', async () => {
    const { assignmentId } = getTestData();
    const res = await r.get(`/api/student/assignments/${assignmentId}`);
    expect(res.body.code).toBe(0);
    expect(res.body.data.assignment).toBeTruthy();
    expect(res.body.data.assignment.assignmentQuestions).toBeDefined();
    expect(res.body.data.submissions).toBeDefined();
  });

  // T2: 提交答案
  it('T2: 提交答案 → 200', async () => {
    const { assignmentId, questionId } = getTestData();
    const res = await r.post(`/api/student/assignments/${assignmentId}/submit`, {
      questionId,
      answer: 'print("hello world")',
    });
    expect(res.body.code).toBe(0);
  });

  // T4: 重复提交同一题目 → 400
  it('T4: 重复提交同一题 → 400', async () => {
    const { assignmentId, questionId } = getTestData();
    const res = await r.post(`/api/student/assignments/${assignmentId}/submit`, {
      questionId,
      answer: 'print("another")',
    });
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toContain('重复');
  });

  // T6: 查看成绩
  it('T6: 查看成绩 → 返回数组', async () => {
    const res = await r.get('/api/student/scores');
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // T7: 作业列表
  it('T7: 作业列表返回提交状态', async () => {
    const { assignmentId } = getTestData();
    const res = await r.get('/api/student/assignments');
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data.list)).toBe(true);
    const match = res.body.data.list.find(a => a.id === assignmentId);
    if (match) {
      expect(match.submissions).toBeDefined();
    }
  });
});
