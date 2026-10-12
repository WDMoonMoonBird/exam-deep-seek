/**
 * W33（R2-B12①）：worker 必须把**本次 run-root** 作为 --workdir 传给装置（否则装置自己 mktemp ⇒ 产物错位、frozen 尺子不在装置 workdir ⇒ 闸 exit 5）。
 * 用注入的假 runner 捕获真实参数；假 runner 不执行装置（零模型调用）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { runOnce, withWorkdirArg } from '../../src/services/dshGradingJobWorker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const REPO = path.resolve(SERVER, '..');
const tag = 'w33-workdir-' + Date.now();
let assignmentId = null;
let questionId = null;

describe('W33 装置 workdir', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
  }, 60000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
  }, 30000);

  it('W33-1 纯函数：剥掉既有 --workdir 后再追加本次 workdir（重复调用不叠加）', () => {
    expect(withWorkdirArg(['a', '--workdir', '/old'], '/new')).toEqual(['a', '--workdir', '/new']);
    expect(withWorkdirArg([], '/new')).toEqual(['--workdir', '/new']);
  });

  it('W33-1b ★r2b7 的 --workdir 相对值也被绝对化（与 --run-root 一致，避免装置目录错位）', () => {
    const res = spawnSync(process.execPath, [
      path.join(SERVER, 'scripts', 'r2b7-build-checker.mjs'), '--assignment', '1', '--dry-run', '--workdir', 'relwd-probe-w33',
    ], { encoding: 'utf8', timeout: 30000 });
    const out = (res.stdout || '') + (res.stderr || '');
    const m = out.match(/^RUN_ROOT=(.+?) \(/m) || out.match(/^RUN_ROOT=(.+)$/m); // 路径可能含空格 ⇒ 不能按 \S+ 取
    expect(m).toBeTruthy();
    expect(path.isAbsolute(m[1])).toBe(true);
    expect(m[1]).toBe(path.resolve('relwd-probe-w33'));
    expect(res.status).toBe(0);
  });

  it('W33-2 ★args 含 --workdir=<本次 run-root>，且该 workdir 内 frozen 尺子就位（复用模式）', async () => {
    const checkerId = 'sha256:' + 'b'.repeat(64);
    await prisma.gradingChecker.create({ data: { checkerId, assignmentId, questionId, versionHash: 'v', rubricHash: 'r', standardHash: 's', status: 'ready', checkerJson: { checker_id: checkerId, sections: [] } } });
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId, status: 'pending' } });
    let captured = null;
    const res = await runOnce({
      prisma, jobId: job.id, deviceCommand: 'bash', deviceArgs: ['scripts/dsh-grader/run.sh', '--checker-mode', 'build-and-measure'],
      repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 5000, reuseChecker: true,
      deps: { runDshGrader: async (opts) => { captured = opts; return { exitCode: 0, timedOut: false, stdout: '', stderr: '' }; } },
    });
    expect(res.reuse && res.reuse.applied).toBe(true);
    const wi = captured.args.indexOf('--workdir');
    expect(wi).toBeGreaterThan(-1);
    const workdir = captured.args[wi + 1];
    expect(path.isAbsolute(workdir)).toBe(true);
    expect(workdir).toBe(res.runRoot); // ★等于本次 run-root（不是 mktemp、也不是别的 job 的目录）
    // frozen 尺子必须在**装置的 workdir** 内就位
    expect(fs.existsSync(path.join(workdir, 'out', 'assignment', 'checker.frozen.json'))).toBe(true);
    const ci = captured.args.indexOf('--checker');
    expect(captured.args[ci + 1]).toBe(path.join(workdir, 'out', 'assignment', 'checker.frozen.json'));
    // 非复用路径同样注入 workdir（不再出现「装置自己 mktemp」）
    const job2 = await prisma.gradingJob.create({ data: { assignmentId, checkerId, status: 'pending' } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } }); // 去掉 ready 尺子 ⇒ 走非复用分支
    let captured2 = null;
    const res2 = await runOnce({
      prisma, jobId: job2.id, deviceCommand: 'bash', deviceArgs: ['scripts/dsh-grader/run.sh', '--submissions', '1'],
      repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 5000,
      deps: { runDshGrader: async (opts) => { captured2 = opts; return { exitCode: 0, timedOut: false, stdout: '', stderr: '' }; } },
    });
    const wi2 = captured2.args.indexOf('--workdir');
    expect(captured2.args[wi2 + 1]).toBe(res2.runRoot);
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
  }, 90000);
});
