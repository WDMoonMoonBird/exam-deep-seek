/**
 * W32（R2-B11）：★用**相对装置路径**跑一遍真实消费链路，证明不再因 cwd 解析失败（旧行为：bash exit 127）。
 * 装置用 stub（零模型调用、测试库），但**路径按相对写法给**（scripts/stub-device.mjs）；
 * 另附负向对照：在 server/ 下跑相对路径必然失败（复现旧故障类）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const REPO = path.resolve(SERVER, '..');
const WORKER = path.join(SERVER, 'scripts', 'r2b5-worker.mjs');
const tag = 'w32-relpath-' + Date.now();
let assignmentId = null;
let questionId = null;
let jobId = null;

describe('W32 相对装置路径消费', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    const u = await prisma.user.create({ data: { username: tag + '-stu', password: 'x', role: 'student', realName: tag + '-real1' } });
    await prisma.submission.create({ data: { assignmentId, questionId, studentId: u.id, status: 'submitted' } });
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'w32-' + tag, status: 'pending' } });
    jobId = job.id;
  }, 60000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
    for (const d of fs.readdirSync('/tmp').filter((x) => x.startsWith('r2b4-job-' + jobId + '-'))) fs.rmSync(path.join('/tmp', d), { recursive: true, force: true });
  }, 60000);

  it('W32-0 负向对照：在 server/ 下用相对路径跑装置 ⇒ 失败（复现旧故障类）', () => {
    // 队长首跑的真实现场：装置脚本相对 **仓库根** 写成 scripts/dsh-grader/run.sh，而子进程 cwd 是 server/
    // ⇒ bash 找不到文件 ⇒ exit 127（这里只复现「解析失败」这一类，不执行真装置：该相对路径在 server/ 下不存在）
    const bad = spawnSync('bash', ['scripts/dsh-grader/run.sh'], { encoding: 'utf8', cwd: SERVER, timeout: 20000 });
    expect(bad.status).toBe(127);
    expect((bad.stderr || '') + (bad.stdout || '')).toMatch(/No such file or directory|not found/i);
  });

  it('W32-1 ★相对装置路径（scripts/stub-device.mjs）⇒ 消费成功、job=done、装置产物落在 run-root', async () => {
    const res = spawnSync(process.execPath, [
      WORKER, '--once', '--device', 'node', '--device-arg', 'scripts/stub-device.mjs',
      '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01',
      '--stub-env', 'STUB_MANIFEST_IDS=' + tag + '-real1', '--timeout-ms', '60000',
    ], { encoding: 'utf8', timeout: 90000, env: { ...process.env, DSH_WORKER_DB_LIMIT: '1' } });
    const out = (res.stdout || '') + (res.stderr || '');
    expect(res.status).toBe(0);
    const after = await prisma.gradingJob.findUnique({ where: { id: jobId }, select: { status: true, writtenCount: true, lastError: true } });
    expect(String(after.lastError || '')).not.toMatch(/exit_127|MODULE_NOT_FOUND|Cannot find module/); // 成功时 lastError 为 null，先归一化再断言
    expect(after.status).toBe('done');
    expect(after.writtenCount).toBe(1);
    const dir = fs.readdirSync('/tmp').filter((x) => x.startsWith('r2b4-job-' + jobId + '-')).sort().pop();
    expect(fs.existsSync(path.join('/tmp', dir, 'out', 'stub-env.json'))).toBe(true);
    expect(out).toContain('WORKER_EXIT=0');
  }, 120000);
});
