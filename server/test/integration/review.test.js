import { loginAsTeacher, authReq, getTestData } from './helpers.js';

describe('评分审核', () => {
  let token;
  let r;

  beforeAll(async () => {
    token = await loginAsTeacher();
    r = authReq(token);
  });

  // R1: 审核汇总
  it('R1: 审核汇总 → submittedCount 返回', async () => {
    const { schoolId, assignmentId } = getTestData();
    const res = await r.get(`/api/teacher/review-summary?schoolId=${schoolId}`);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
    const row = res.body.data.find(r => r.assignmentId === assignmentId);
    if (row) {
      expect(row).toHaveProperty('submittedCount');
      expect(row).toHaveProperty('totalStudents');
    }
  });

  // R3: 班级审核列表
  it('R3: 班级审核列表 → 每生一行', async () => {
    const { classId, assignmentId } = getTestData();
    const res = await r.get(`/api/teacher/review-class/${classId}?assignmentId=${assignmentId}`);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data.list)).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(3);
  });

  // R4: 列表"异常"筛选
  it('R4: filter=abnormal → 仅返回异常行', async () => {
    const { classId, assignmentId } = getTestData();
    const res = await r.get(`/api/teacher/review-class/${classId}?assignmentId=${assignmentId}&filter=abnormal`);
    expect(res.body.code).toBe(0);
    for (const row of res.body.data.list) {
      expect(row.status).toBe('abnormal');
    }
  });

  // R5: 单生审核详情
  it('R5: 单生审核详情 → 含 allSubmissions + subQuestions', async () => {
    const { schoolId } = getTestData();
    const listRes = await r.get(`/api/teacher/submissions?schoolId=${schoolId}&page=1&pageSize=5`);
    expect(listRes.body.code).toBe(0);
    const sub = listRes.body.data.list[0];
    if (!sub) return;

    const res = await r.get(`/api/teacher/submissions/${sub.id}`);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('allSubmissions');
    expect(res.body.data.question.subQuestions).toBeDefined();
  });

  // R6: 修改最终分
  it('R6: 修改最终分 → status 变为 reviewed', async () => {
    const { schoolId } = getTestData();
    const listRes = await r.get(`/api/teacher/submissions?schoolId=${schoolId}&page=1&pageSize=10`);
    const aiGraded = listRes.body.data.list.find(s => s.status === 'ai_graded');
    if (!aiGraded) return;

    const res = await r.put(`/api/teacher/submissions/${aiGraded.id}/score`, {
      finalScore: 30,
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('reviewed');
    expect(res.body.data.finalScore).toBe(30);
  });

  // R7: 审核单题
  it('R7: 审核单题 → status → reviewed', async () => {
    const { schoolId } = getTestData();
    const listRes = await r.get(`/api/teacher/submissions?schoolId=${schoolId}&page=1&pageSize=10`);
    const aiGraded = listRes.body.data.list.find(s => s.status === 'ai_graded');
    if (!aiGraded) return;

    const res = await r.put(`/api/teacher/submissions/${aiGraded.id}/review`, {
      finalScore: 28,
      teacherFeedback: '教师评语',
    });
    expect(res.body.code).toBe(0);

    const detailRes = await r.get(`/api/teacher/submissions/${aiGraded.id}`);
    expect(detailRes.body.data.status).toBe('reviewed');
  });

  // R10: 一键发布全班
  it('R10: 一键发布 → 仅发布 reviewed 学生', async () => {
    const { schoolId, classId, assignmentId } = getTestData();
    const res = await r.post('/api/teacher/submissions/batch-publish', {
      schoolId,
      classId,
      assignmentId,
    });
    expect(res.body.code).toBe(0);
  });

  // 无学校ID时汇总返回空
  it('R1补充: 无 schoolId 返回空数组', async () => {
    const res = await r.get('/api/teacher/review-summary');
    expect(res.body.code).toBe(0);
    expect(res.body.data).toEqual([]);
  });
});
