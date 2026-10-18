/**
 * W14（R2-B3 / W7）：作业级触发端点 + 幂等（重复触发 ⇒ 一个 job）。
 * ★task-40：改用**本套件独立 assignment**（不再复用 seed assignment）—— seed 作业的内容尺子可能被
 *   grading_rulers 全局资产/历史探针污染，导致 RULER_NOT_READY 顶替 CHECKER_NOT_READY；独立新作业
 *   无题目内容 ⇒ 内容指纹不可解析 ⇒ 走「按 assignment 找 ready checker」旧路径，语义稳定。
 * 仅测试库：checker 行由测试直接插入（模拟装置入库），触发走 HTTP。
 */
import prisma from '../../src/utils/prisma.js';
import { authReq, getTestData, loginAsTeacher } from './helpers.js';

const CHECKER_ID = 'sha256:' + 'e'.repeat(64);
const tag = 'w14-grade-' + Date.now();

describe('W14 作业级批改触发（幂等）', () => {
  let r;
  let assignmentId;

  beforeAll(async () => {
    r = authReq(await loginAsTeacher());
    const { teacherId } = getTestData();
    const a = await prisma.assignment.create({
      data: { teacherId, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') },
    });
    assignmentId = a.id;
  }, 60000);

  afterAll(async () => {
    if (assignmentId) {
      await prisma.gradingJob.deleteMany({ where: { assignmentId } });
      await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
      await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    }
  }, 60000);

  it('W14-1 无 checker/无发布快照 ⇒ 409 可判定（不产生 job）', async () => {
    const res = await r.post('/api/teacher/assignments/' + assignmentId + '/grade');
    expect(res.status).toBe(409);
    // ★task-40：R2-B35 后「无发布冻结快照/标准包」会先于 checker 判定，返回 RULER_NOT_READY（旧断言为
    //   CHECKER_NOT_READY，该 code 在当前实现中已不存在）→ 按当前设计语义断言 fail-closed 且零 job。
    expect(res.body.data.code).toBe('RULER_NOT_READY');
    expect(res.body.data.reason).toBe('snapshot_missing');
    const jobs = await prisma.gradingJob.count({ where: { assignmentId } });
    expect(jobs).toBe(0);
  });

  it('W14-2 入库 checker 后触发 ⇒ 建 job；再触发 ⇒ 同一个 job（幂等）', async () => {
    await prisma.gradingChecker.upsert({
      where: { checkerId: CHECKER_ID },
      update: { status: 'ready', assignmentId },
      create: {
        checkerId: CHECKER_ID,
        assignmentId,
        questionId: null,
        versionHash: CHECKER_ID,
        rubricHash: 'sha256:' + '1'.repeat(64),
        standardHash: 'sha256:absent',
        status: 'ready',
        checkerJson: { schema_version: 'checker/1', assignment_ref: { rubric_hash: 'sha256:' + '1'.repeat(64), standard_hash: 'sha256:absent' } },
      },
    });
    const first = await r.post('/api/teacher/assignments/' + assignmentId + '/grade');
    expect(first.body.code).toBe(0);
    expect(first.body.data.reused).toBe(false);
    const jobId = first.body.data.jobId;
    expect(jobId).toBeGreaterThan(0);

    const second = await r.post('/api/teacher/assignments/' + assignmentId + '/grade');
    expect(second.body.code).toBe(0);
    expect(second.body.data.reused).toBe(true);
    expect(second.body.data.jobId).toBe(jobId);

    const rows = await prisma.gradingJob.findMany({ where: { assignmentId, checkerId: CHECKER_ID, status: 'pending' } });
    expect(rows).toHaveLength(1); // 唯一键幂等：重复触发只有一个 pending job
  }, 60000);

  it('W14-3 触发的 job 带 checker_id（审计可追溯）', async () => {
    const job = await prisma.gradingJob.findFirst({ where: { assignmentId, checkerId: CHECKER_ID }, orderBy: { id: 'desc' } });
    expect(job.checkerId).toBe(CHECKER_ID);
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
  });
});
