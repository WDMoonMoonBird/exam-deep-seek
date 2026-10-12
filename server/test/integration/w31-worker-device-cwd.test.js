/**
 * W31（R2-B11）：worker 调装置的 cwd 必须是**仓库根**（相对装置路径才解析得对），且参数里的相对路径被绝对化。
 * 用注入的假 runner 捕获真实传给 runDshGrader 的参数；假 runner 不执行任何装置（零模型调用）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { absolutizeDeviceArgs, runOnce } from '../../src/services/dshGradingJobWorker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const REPO = path.resolve(SERVER, '..');
const tag = 'w31-cwd-' + Date.now();
let assignmentId = null;
let questionId = null;
let jobId = null;

describe('W31 cwd 与相对路径', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'w31-' + tag, status: 'pending' } });
    jobId = job.id;
  }, 60000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
  }, 30000);

  it('W31-1 纯函数：相对且存在 ⇒ 绝对化；绝对/非路径 token 保持原样', () => {
    expect(absolutizeDeviceArgs(['scripts/dsh-grader/run.sh', '--submissions', '63', 'build-and-measure', '--allow-identical'], REPO))
      .toEqual([path.join(REPO, 'scripts/dsh-grader/run.sh'), '--submissions', '63', 'build-and-measure', '--allow-identical']);
    expect(absolutizeDeviceArgs(['/abs/x.sh'], REPO)).toEqual(['/abs/x.sh']);
    expect(absolutizeDeviceArgs(['--workdir', '/tmp/w'], REPO)).toEqual(['--workdir', '/tmp/w']);
    expect(absolutizeDeviceArgs(['--source-dir', '实验'], REPO)).toEqual(['--source-dir', path.join(REPO, '实验')]);
    expect(absolutizeDeviceArgs(['--checker', '/tmp/frozen.json'], REPO)).toEqual(['--checker', '/tmp/frozen.json']);
    expect(absolutizeDeviceArgs(['--notexist', 'nope'], REPO)).toEqual(['--notexist', 'nope']);
  });

  it('W31-2 ★runOnce 传给 runDshGrader 的 cwd = 仓库根（绝对、存在），相对装置路径已被绝对化', async () => {
    let captured = null;
    const fakeRunner = async (opts) => { captured = opts; return { exitCode: 0, timedOut: false, stdout: '', stderr: '' }; };
    const res = await runOnce({
      prisma, jobId, deviceCommand: 'bash',
      deviceArgs: ['scripts/dsh-grader/run.sh', '--checker-mode', 'build-and-measure', '--submissions', '1'],
      repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 5000,
      deps: { runDshGrader: fakeRunner },
    });
    expect(res.consumed).toBe(true);
    expect(captured).toBeTruthy();
    expect(captured.cwd).toBe(REPO);
    expect(path.isAbsolute(captured.cwd)).toBe(true);
    expect(captured.args[0]).toBe(path.join(REPO, 'scripts/dsh-grader/run.sh'));
    expect(path.isAbsolute(captured.args[0])).toBe(true);
    // 非路径 token 不被改动（否则会破坏装置参数语义）
    // R2-B12① 行为变更（已在 R2-B12 记录披露）：worker 现在**注入** --workdir <本次 run-root>
    expect(captured.args.slice(1, 5)).toEqual(['--checker-mode', 'build-and-measure', '--submissions', '1']);
    const wi = captured.args.indexOf('--workdir');
    expect(wi).toBeGreaterThan(-1);
    expect(path.isAbsolute(captured.args[wi + 1])).toBe(true);
  }, 60000);

  it('W31-3 复用模式同样受覆盖：--checker 是绝对路径且 cwd 仍是仓库根', async () => {
    const checker = await prisma.gradingChecker.create({ data: { checkerId: 'sha256:' + 'a'.repeat(64), assignmentId, questionId, versionHash: 'v', rubricHash: 'r', standardHash: 's', status: 'ready', checkerJson: { checker_id: 'sha256:' + 'a'.repeat(64), sections: [] } } });
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId: checker.checkerId, status: 'pending' } });
    let captured = null;
    const res = await runOnce({
      prisma, jobId: job.id, deviceCommand: 'bash', deviceArgs: ['scripts/dsh-grader/run.sh'],
      repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 5000, reuseChecker: true,
      deps: { runDshGrader: async (opts) => { captured = opts; return { exitCode: 0, timedOut: false, stdout: '', stderr: '' }; } },
    });
    expect(res.reuse && res.reuse.applied).toBe(true);
    expect(captured.cwd).toBe(REPO);
    const ci = captured.args.indexOf('--checker');
    expect(ci).toBeGreaterThan(-1);
    expect(path.isAbsolute(captured.args[ci + 1])).toBe(true);
    expect(captured.args).toContain('measure-only-reuse');
    await prisma.gradingChecker.deleteMany({ where: { checkerId: checker.checkerId } });
    await prisma.gradingJob.deleteMany({ where: { id: job.id } });
  }, 60000);
});
