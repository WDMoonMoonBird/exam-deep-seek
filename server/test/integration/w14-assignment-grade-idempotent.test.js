/**
 * W14（R2-B3 / W7）：作业级触发端点 + 幂等（重复触发 ⇒ 一个 job）。
 * 仅测试库：checker 行由测试直接插入（模拟装置入库），触发走 HTTP。
 */
import prisma from '../../src/utils/prisma.js';
import { authReq, getTestData, loginAsTeacher } from './helpers.js';

const CHECKER_ID = 'sha256:' + 'e'.repeat(64);

describe('W14 作业级批改触发（幂等）', () => {
  let r;
  let assignmentId;

  beforeAll(async () => {
    r = authReq(await loginAsTeacher());
    assignmentId = getTestData().assignmentId;
  });

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId, checkerId: CHECKER_ID } });
    await prisma.gradingChecker.deleteMany({ where: { checkerId: CHECKER_ID } });
  });

  it('W14-1 无 checker ⇒ 409 可判定（不产生 job）', async () => {
    const res = await r.post('/api/teacher/assignments/' + assignmentId + '/grade');
    expect(res.status).toBe(409);
    expect(res.body.data.code).toBe('CHECKER_NOT_READY');
    const jobs = await prisma.gradingJob.count({ where: { assignmentId } });
    expect(jobs).toBe(0);
  });

  it('W14-2 入库 checker 后触发 ⇒ 建 job；再触发 ⇒ 同一个 job（幂等）', async () => {
    await prisma.gradingChecker.upsert({
      where: { checkerId: CHECKER_ID },
      update: { status: 'ready' },
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
  });

  it('W14-3 触发的 job 带 checker_id（审计可追溯）', async () => {
    const job = await prisma.gradingJob.findFirst({ where: { assignmentId, checkerId: CHECKER_ID }, orderBy: { id: 'desc' } });
    expect(job.checkerId).toBe(CHECKER_ID);
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
  });
});
