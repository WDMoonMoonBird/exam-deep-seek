/**
 * W36（R2-B13②）：worker 必须把装置 stdout/stderr 落盘到 run-root，并把尾部写进 last_error（失败可诊断）。
 * 用注入假 runner 产生「装置失败 + 含 sk- 伪凭据」的输出；零模型调用、不跑真实装置。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { DEVICE_LOG_FILES, errorTail, persistDeviceLogs, redactSecrets, runOnce } from '../../src/services/dshGradingJobWorker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..', '..');
const tag = 'w36-logs-' + Date.now();
let assignmentId = null;
let questionId = null;

describe('W36 装置日志落盘', () => {
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
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
  }, 30000);

  it('W36-1 纯函数：redactSecrets 脱敏 sk- 串；errorTail 取 stderr 末 2 行非空行并回退 stdout', () => {
    expect(redactSecrets('key=sk-abcdef123456 end')).toContain('[redacted:sk-***]');
    expect(redactSecrets('key=sk-abcdef123456 end')).not.toContain('sk-abcdef123456');
    expect(errorTail({ stderr: 'a\n\nB1\nB2\n', stdout: 'S' })).toBe('B1 | B2');
    expect(errorTail({ stderr: '', stdout: 'only-stdout' })).toBe('only-stdout');
    expect(errorTail({})).toBe('');
  });

  it('W36-2 落盘函数：写出 out/device.stdout.log 与 out/device.stderr.log，并做尾部截断', () => {
    const root = fs.mkdtempSync('/tmp/w36-logs-');
    const paths = persistDeviceLogs({ runRoot: root, stdout: 'OUT1\nOUT2\n', stderr: 'ERR sk-zzzzzzzz9999\n' });
    expect(paths.stdout).toBe(path.join(root, DEVICE_LOG_FILES.stdout));
    expect(fs.readFileSync(paths.stdout, 'utf8')).toContain('OUT1');
    expect(fs.readFileSync(paths.stderr, 'utf8')).not.toContain('sk-zzzzzzzz9999');
    const big = 'x'.repeat(5000) + 'TAILMARK';
    const p2 = persistDeviceLogs({ runRoot: root, stdout: big, capBytes: 100 });
    const written = fs.readFileSync(p2.stdout, 'utf8');
    expect(written).toContain('TAILMARK');
    expect(written).toContain('[truncated head]');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('W36-3 ★装置失败 ⇒ 日志落盘到 run-root 且 last_error 含可诊断尾部（且 sk- 命中 0）', async () => {
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'w36-' + tag, status: 'pending' } });
    const res = await runOnce({
      prisma, jobId: job.id, deviceCommand: 'bash', deviceArgs: ['scripts/dsh-grader/run.sh'],
      repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 5000,
      deps: {
        runDshGrader: async () => ({
          exitCode: 1, timedOut: false,
          stdout: 'stage 1/6 ok\nstage 2/6 ok\n',
          stderr: 'lib_assignment.sh: line 270: /tmp/x/out/diagnostics/measurable.json: No such file or directory\n泄露样例 sk-leak00000000\n',
        }),
      },
    });
    expect(res.status).toBe('needs_rerun');
    const outLog = path.join(res.runRoot, DEVICE_LOG_FILES.stdout);
    const errLog = path.join(res.runRoot, DEVICE_LOG_FILES.stderr);
    expect(fs.existsSync(outLog)).toBe(true);
    expect(fs.existsSync(errLog)).toBe(true);
    expect(fs.readFileSync(outLog, 'utf8')).toContain('stage 1/6 ok');
    const errText = fs.readFileSync(errLog, 'utf8');
    expect(errText).toContain('No such file or directory');
    expect(errText).toContain('[redacted:sk-***]');
    expect(errText).not.toContain('sk-leak00000000');
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, lastError: true } });
    expect(after.status).toBe('needs_rerun');
    // 无产物时走 artifacts_missing 分支（exit=1 记在原因里）；关键：必须带可诊断尾巴
    expect(after.lastError).toMatch(/^(device_exit_1|artifacts_missing:exit=1) :: /);
    expect(after.lastError).toContain('No such file or directory');  // 尾部可诊断信息
    expect(after.lastError).not.toContain('sk-leak00000000');
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
  }, 90000);
});
