/**
 * W12（R2-B2）端到端：W1 改题拦截（已截止引用 ⇒ 409 + ?force=1 放行留痕）
 * 与 W2 发布时快照（创建作业即写入 4 列；改题库不影响已发布作业的冻结标准）。
 * 仅写测试库（test/setup.js 的库名护栏 + 安全命令的 db_ok 断言双重保护）。
 */
import prisma from '../../src/utils/prisma.js';
import { authReq, getTestData, loginAsTeacher } from './helpers.js';

const tag = 'W12-' + Date.now();

async function createProjectQuestion(r, rubric, material = '材料A') {
  const res = await r.post('/api/teacher/questions', {
    title: tag + ' 冻结题',
    type: 'project',
    material,
    scoringRubric: rubric,
    maxScore: 100,
  });
  expect(res.body.code).toBe(0);
  return res.body.data.id;
}

async function createEndedAssignment(r, questionId) {
  const { classId } = getTestData();
  const res = await r.post('/api/teacher/assignments', {
    title: tag + ' 已截止作业',
    startTime: '2026-05-01T00:00:00Z',
    endTime: '2026-06-01T00:00:00Z', // 早于当前时间 ⇒ 已截止
    questionIds: [questionId],
    classIds: [classId],
    confirmWithoutStandardPackage: true, // 无标准包 ⇒ 走 Q9 软确认（本批不引入标准包）
  });
  expect(res.body.code).toBe(0);
  return res.body.data.id;
}

const rowOf = (assignmentId, questionId) =>
  prisma.assignmentQuestion.findUnique({ where: { assignmentId_questionId: { assignmentId, questionId } } });

describe('W12 改题拦截 + 发布时快照（R2-B2）', () => {
  let r;
  let questionId;
  let assignmentId;

  beforeAll(async () => {
    r = authReq(await loginAsTeacher());
  });

  it('W12-1 发布时把 rubric/material/哈希/来源写进快照列（snapshot_origin=publish）', async () => {
    questionId = await createProjectQuestion(r, '标准A');
    assignmentId = await createEndedAssignment(r, questionId);
    const row = await rowOf(assignmentId, questionId);
    expect(row).toBeTruthy();
    expect(row.rubricSnapshot).toBeTruthy();
    expect(row.rubricSnapshot.rubric).toBe('标准A');
    expect(row.rubricSnapshot.rubricSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(row.materialSnapshot).toBe('材料A');
    expect(row.standardHash).toMatch(/^sha256:/);
    expect(row.snapshotOrigin).toBe('publish');
  });

  it('W12-2 改被已截止作业引用的题 rubric ⇒ 409 可判定 code，且活值与快照都不变', async () => {
    const put = await r.put('/api/teacher/questions/' + questionId, { scoringRubric: '标准B' });
    expect(put.status).toBe(409);
    expect(put.body.code).toBe(1009);
    expect(put.body.data.code).toBe('RUBRIC_FROZEN_BY_ENDED_ASSIGNMENT');
    expect(put.body.data.endedAssignments.map((a) => a.id)).toContain(assignmentId);
    const q = await prisma.question.findUnique({ where: { id: questionId } });
    expect(q.scoringRubric).toBe('标准A'); // 拦截 ⇒ 活值未变
    const row = await rowOf(assignmentId, questionId);
    expect(row.rubricSnapshot.rubric).toBe('标准A');
  });

  it('W12-3 ?force=1 显式放行：更新成功但已发布作业的快照仍冻结', async () => {
    const put = await r.put('/api/teacher/questions/' + questionId + '?force=1', { scoringRubric: '标准C' });
    expect(put.body.code).toBe(0);
    const q = await prisma.question.findUnique({ where: { id: questionId } });
    expect(q.scoringRubric).toBe('标准C'); // 活值已改（教师显式确认）
    const row = await rowOf(assignmentId, questionId);
    expect(row.rubricSnapshot.rubric).toBe('标准A'); // ★ 已发布作业读快照 ⇒ 历史标准不变
  });

  it('W12-4 未被任何作业引用 ⇒ 直接放行（零影响）', async () => {
    const qid = await createProjectQuestion(r, '标准X');
    const put = await r.put('/api/teacher/questions/' + qid, { scoringRubric: '标准Y' });
    expect(put.body.code).toBe(0);
    const q = await prisma.question.findUnique({ where: { id: qid } });
    expect(q.scoringRubric).toBe('标准Y');
  });

  it('W12-5 进行中作业引用 ⇒ 放行且不误拦（endTime 在未来）', async () => {
    const qid = await createProjectQuestion(r, '标准M');
    const { classId } = getTestData();
    const aRes = await r.post('/api/teacher/assignments', {
      title: tag + ' 进行中作业',
      startTime: '2026-10-01T00:00:00Z',
      endTime: '2099-01-01T00:00:00Z',
      questionIds: [qid],
      classIds: [classId],
      confirmWithoutStandardPackage: true,
    });
    expect(aRes.body.code).toBe(0);
    const put = await r.put('/api/teacher/questions/' + qid, { scoringRubric: '标准M2' });
    expect(put.body.code).toBe(0);
    const row = await rowOf(aRes.body.data.id, qid);
    expect(row.rubricSnapshot.rubric).toBe('标准M'); // 快照仍是发布时的值
  });
});
