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

  // B4（缺陷回归 P4）: 软删除题目不可被选入新作业 → 400
  it('B4: 创建作业含已删除题目 → 400', async () => {
    const { classId } = getTestData();
    // 创建题目
    const qRes = await r.post('/api/teacher/questions', {
      title: '待删除作业题',
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: [{ title: '题1', content: '<p>c</p>', referenceAnswer: 'a', score: 100, language: 'python' }],
    });
    expect(qRes.body.code).toBe(0);
    const qid = qRes.body.data.id;
    // 删除（软删除）
    const delRes = await r.delete(`/api/teacher/questions/${qid}`);
    expect(delRes.body.code).toBe(0);
    // 用已删题创建作业 → 拒绝
    const res = await r.post('/api/teacher/assignments', {
      title: '含已删题作业',
      startTime: '2026-05-01T00:00:00Z',
      endTime: '2026-06-01T00:00:00Z',
      questionIds: [qid],
      classIds: [classId],
    });
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toContain('已删除');
  });

  // B5（缺陷回归 P4）: 作业详情不露出软删除题目
  it('B5: 作业详情过滤软删除题目', async () => {
    const { classId } = getTestData();
    const mk = (title) => r.post('/api/teacher/questions', {
      title,
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: [{ title: '题1', content: '<p>c</p>', referenceAnswer: 'a', score: 100, language: 'python' }],
    });
    const q1 = await mk('详情过滤题A');
    const q2 = await mk('详情过滤题B');
    expect(q1.body.code).toBe(0);
    expect(q2.body.code).toBe(0);

    const asg = await r.post('/api/teacher/assignments', {
      title: '详情过滤作业',
      startTime: '2026-05-01T00:00:00Z',
      endTime: '2026-06-01T00:00:00Z',
      questionIds: [q1.body.data.id, q2.body.data.id],
      classIds: [classId],
    });
    expect(asg.body.code).toBe(0);
    const asgId = asg.body.data.id;

    // 删除 A 题后，详情应只剩 B 题
    await r.delete(`/api/teacher/questions/${q1.body.data.id}`);
    const getRes = await r.get(`/api/teacher/assignments/${asgId}`);
    const questions = getRes.body.data.assignmentQuestions.map(aq => aq.questionId);
    expect(questions).not.toContain(q1.body.data.id);
    expect(questions).toContain(q2.body.data.id);
  });
});
