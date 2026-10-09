import fs from 'fs';
import path from 'path';
import { loginAsTeacher, authReq, getTestData } from './helpers.js';
import prisma from '../../src/utils/prisma.js';
import { standardDir, STANDARDS_ROOT } from '../../src/utils/projectPaths.js';

describe('作业管理', () => {
  let token;
  let r;
  /** 本套件创建的标准包目录（question 目录），afterAll 清理 */
  const stdQuestionDirs = [];

  beforeAll(async () => {
    token = await loginAsTeacher();
    r = authReq(token);
  });

  afterAll(() => {
    // 只清理本套件创建的标准包目录：先确认目标确实位于 uploads/project-questions 之内
    for (const dir of stdQuestionDirs) {
      if (dir.startsWith(STANDARDS_ROOT + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
    }
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

  // ===================== Q9 软警告（2026-10 甲方确认：硬拒绝 → 软警告 + 教师确认） =====================
  // 契约：无标准工程包的实训题 → 400 + code=1007 + data:{requiresConfirmation:true, warnings:[{questionId,title,message}]}，
  //       且不创建作业；带 confirmWithoutStandardPackage=true 重提 → 创建成功；
  //       有标准工程包 → 行为与改动前完全一致（无警告、直接创建）。

  /** 建一个开放性实训题（不上传标准工程包，即 Wave 1 的建题免上传链路） */
  const mkProjectQuestion = async (title) => {
    const res = await r.post('/api/teacher/questions', {
      title,
      type: 'project',
      maxScore: 100,
      difficulty: 'medium',
      material: '实现一个待办事项管理程序，支持增删改查',
      scoringRubric: '功能完整性 60 分：增删改查全部可用；代码规范 20 分；健壮性 20 分',
    });
    expect(res.body.code).toBe(0);
    return res.body.data.id;
  };

  it('Q9-1: 无标准工程包 + 未确认 → 400/1007 软警告，且不创建作业', async () => {
    const { classId } = getTestData();
    const qid = await mkProjectQuestion('开放性题目_未确认');
    const title = '开放性作业_未确认';

    const res = await r.post('/api/teacher/assignments', {
      title,
      startTime: '2026-05-01T00:00:00Z',
      endTime: '2026-06-01T00:00:00Z',
      questionIds: [qid],
      classIds: [classId],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1007);
    expect(res.body.data.requiresConfirmation).toBe(true);
    expect(Array.isArray(res.body.data.warnings)).toBe(true);
    expect(res.body.data.warnings).toHaveLength(1);
    expect(res.body.data.warnings[0].questionId).toBe(qid);
    expect(res.body.data.warnings[0].title).toBe('开放性题目_未确认');
    expect(res.body.data.warnings[0].message).toContain('未上传标准工程包');
    expect(res.body.message).toContain('确认按开放性题目布置');

    // 未确认 → 作业确实没有被创建
    const cnt = await prisma.assignment.count({ where: { teacherId: getTestData().teacherId, title } });
    expect(cnt).toBe(0);
  });

  it('Q9-2: 无标准工程包 + 显式确认 → 创建成功（按开放性题目布置）', async () => {
    const { classId } = getTestData();
    const qid = await mkProjectQuestion('开放性题目_已确认');

    const res = await r.post('/api/teacher/assignments', {
      title: '开放性作业_已确认',
      startTime: '2026-05-01T00:00:00Z',
      endTime: '2026-06-01T00:00:00Z',
      questionIds: [qid],
      classIds: [classId],
      confirmWithoutStandardPackage: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe('开放性作业_已确认');
    expect(typeof res.body.data.id).toBe('number');

    const getRes = await r.get(`/api/teacher/assignments/${res.body.data.id}`);
    expect(getRes.body.data.assignmentQuestions.map(aq => aq.questionId)).toContain(qid);
  });

  it('Q9-3: 有标准工程包 → 无警告直接创建（回归，与改动前一致）', async () => {
    const { classId } = getTestData();
    const qid = await mkProjectQuestion('标准包题目_回归');
    // 构造标准工程包目录（与建题上传流程落库后的形态一致：目录 + attachmentUrl 同时存在）
    const dir = standardDir(qid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'main.py'), 'def main():\n    print("ok")\n');
    stdQuestionDirs.push(path.dirname(dir));
    const upd = await r.put(`/api/teacher/questions/${qid}`, { attachmentUrl: `project-questions/${qid}/standard` });
    expect(upd.body.code).toBe(0);

    const res = await r.post('/api/teacher/assignments', {
      title: '标准包作业_回归',
      startTime: '2026-05-01T00:00:00Z',
      endTime: '2026-06-01T00:00:00Z',
      questionIds: [qid],
      classIds: [classId],
    });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe('标准包作业_回归');
    expect(res.body.data.warnings).toBeUndefined();
  });
});
