/**
 * W30（R2-B10②）：worker 复用已入库尺子（measure-only-reuse，零模型调用、尺子不变、分数逐位一致）。
 * 证据链：CHECKER_REUSE 标记 + 装置子进程记录的 argv + run-root 内尺子落位 + DB 分数/checker_id/canonical 逐位对拍。
 * 另覆盖「无 ready 尺子 ⇒ fail-closed needs_rerun」的既定行为。仅测试库；探针自清理。
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const WORKER = path.join(SERVER, 'scripts', 'r2b5-worker.mjs');
const R2B7 = path.join(SERVER, 'scripts', 'r2b7-build-checker.mjs');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const tag = 'w30-reuse-' + Date.now();
const SCORE = 58;
let withChecker = null;
let withoutChecker = null;
let questionId = null;
const jobIds = [];

async function makeAssignment(suffix) {
  const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
  const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag + '-' + suffix, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
  await prisma.assignmentQuestion.create({ data: { assignmentId: a.id, questionId, sortOrder: 1 } });
  for (let i = 0; i < 2; i++) {
    const u = await prisma.user.create({ data: { username: tag + '-' + suffix + '-stu' + i, password: 'x', role: 'student', realName: tag + '-' + suffix + '-real' + (i + 1) } });
    await prisma.submission.create({ data: { assignmentId: a.id, questionId, studentId: u.id, status: 'submitted' } });
  }
  return a.id;
}

function runWorker(args, env = {}) {
  const res = spawnSync(process.execPath, [WORKER, '--once', ...args], { encoding: 'utf8', timeout: 90000, env: { ...process.env, DSH_WORKER_DB_LIMIT: '1', ...env } });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

function stubDumpFor(jobId) {
  const dirs = fs.readdirSync('/tmp').filter((d) => d.startsWith('r2b4-job-' + jobId + '-'));
  expect(dirs.length).toBeGreaterThan(0);
  const runRoot = path.join('/tmp', dirs[dirs.length - 1]);
  const dumpPath = path.join(runRoot, 'out', 'stub-env.json');
  return { runRoot, dumpPath, dump: fs.existsSync(dumpPath) ? JSON.parse(fs.readFileSync(dumpPath, 'utf8')) : null };
}

describe('W30 复用模式', () => {
  beforeAll(async () => {
    await prisma.gradingChecker.deleteMany({ where: { checkerId: JSON.parse(fs.readFileSync(path.join(SERVER, 'scripts', 'fixtures', 'checker.sample.json'), 'utf8')).checker_id } });
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    withChecker = await makeAssignment('with');
    withoutChecker = await makeAssignment('without');
    // 先用 r2b7（stub 装置）造尺入库 ⇒ 得到权威的 checker_json 与该作业下的分数
    const built = spawnSync(process.execPath, [
      R2B7, '--assignment', String(withChecker), '--workdir', fs.mkdtempSync(path.join(os.tmpdir(), 'w30-build-')),
      '--device', process.execPath, '--device-arg', STUB,
      '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01,s02',
      '--stub-env', 'STUB_MANIFEST_IDS=' + tag + '-with-real1,' + tag + '-with-real2', '--stub-env', 'STUB_SCORE=' + SCORE,
      '--timeout-ms', '60000',
    ], { encoding: 'utf8', timeout: 90000 });
    expect(built.status).toBe(0);
  }, 120000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId: { in: [withChecker, withoutChecker].filter(Boolean) } } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId: { in: [withChecker, withoutChecker].filter(Boolean) } } });
    await prisma.submission.deleteMany({ where: { assignmentId: { in: [withChecker, withoutChecker].filter(Boolean) } } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: [withChecker, withoutChecker].filter(Boolean) } } });
    await prisma.assignment.deleteMany({ where: { id: { in: [withChecker, withoutChecker].filter(Boolean) } } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
    for (const jobId of jobIds) {
      for (const d of fs.readdirSync('/tmp').filter((x) => x.startsWith('r2b4-job-' + jobId + '-'))) fs.rmSync(path.join('/tmp', d), { recursive: true, force: true });
    }
  }, 60000);

  it('W30-1 ★有 ready 尺子 ⇒ measure-only-reuse：argv 含 --checker+复用模式、尺子落位正确、分数/checker_id/canonical 与已入库逐位一致', async () => {
    const checker = await prisma.gradingChecker.findFirst({ where: { assignmentId: withChecker, status: 'ready' }, orderBy: { id: 'desc' } });
    expect(checker).toBeTruthy();
    const before = await prisma.submission.findMany({ where: { assignmentId: withChecker }, select: { id: true, aiScore: true, checkerId: true, canonicalSha256: true }, orderBy: { id: 'asc' } });
    expect(before.every((s) => s.aiScore === SCORE && s.checkerId === checker.checkerId)).toBe(true);
    const storedCanon = before.map((s) => s.canonicalSha256);
    // 复位提交的写分列，再让 worker 复用同一把尺子重跑
    await prisma.submission.updateMany({ where: { assignmentId: withChecker }, data: { aiScore: null, checkerId: null, canonicalSha256: null } });
    const job = await prisma.gradingJob.create({ data: { assignmentId: withChecker, checkerId: checker.checkerId, status: 'pending' } });
    jobIds.push(job.id);

    const r = runWorker([
      '--reuse-checker', '--device', process.execPath, '--device-arg', STUB,
      '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01,s02',
      '--stub-env', 'STUB_MANIFEST_IDS=' + tag + '-with-real1,' + tag + '-with-real2', '--stub-env', 'STUB_SCORE=' + SCORE,
    ]);
    expect(r.status).toBe(0);
    expect(r.out).toContain('CHECKER_REUSE=applied checker_id=' + checker.checkerId);
    expect(r.out).toContain('mode=measure-only-reuse');

    const { runRoot, dump } = stubDumpFor(job.id);
    expect(dump).toBeTruthy();
    const argv = dump.argv.join(' ');
    expect(argv).toContain('--checker');
    expect(argv).toContain('--checker-mode measure-only-reuse');
    expect(argv).not.toContain('build-and-measure'); // 零模型调用口径：走复用分支，绝不重建尺子
    expect(dump.checker_seen).toBe(true);
    expect(dump.checker_frozen_seen).toBe(true);
    // 尺子落位：out/assignment/checker.frozen.json + out/checker/checker.json，内容与 DB checker_json 一致
    const frozen = JSON.parse(fs.readFileSync(path.join(runRoot, 'out', 'assignment', 'checker.frozen.json'), 'utf8'));
    const plain = JSON.parse(fs.readFileSync(path.join(runRoot, 'out', 'checker', 'checker.json'), 'utf8'));
    expect(frozen).toEqual(checker.checkerJson);
    expect(plain).toEqual(checker.checkerJson);
    // 装置**启动时**看到的 out/checker/checker.json 必须是「worker 落位的 DB 尺子」：
    // stub 在启动早期就记下了它的哈希 ⇒ 与 DB checker_json 的 worker 落位字节逐位一致（stub 随后会覆盖自己的 fixture，故不能按跑后文件比对）
    expect(dump.checker_sha256).toBe('sha256:' + crypto.createHash('sha256').update(JSON.stringify(checker.checkerJson, null, 2)).digest('hex'));

    const after = await prisma.submission.findMany({ where: { assignmentId: withChecker }, select: { aiScore: true, checkerId: true, canonicalSha256: true }, orderBy: { id: 'asc' } });
    expect(after.map((s) => s.aiScore)).toEqual(before.map(() => SCORE)); // 同一尺子 ⇒ 分数一致
    expect(after.map((s) => s.checkerId)).toEqual(before.map(() => checker.checkerId));
    expect(after.map((s) => s.canonicalSha256)).toEqual(storedCanon); // 逐位一致（canonical 快照）
    const afterJob = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, writtenCount: true } });
    expect(afterJob.status).toBe('done');
    expect(afterJob.writtenCount).toBe(2);
  }, 150000);

  it('W30-2 ★无 ready 尺子 ⇒ fail-closed：needs_rerun + no_ready_checker_for_assignment，且不跑装置（零成本）', async () => {
    const job = await prisma.gradingJob.create({ data: { assignmentId: withoutChecker, checkerId: 'probe-none-' + tag, status: 'pending' } });
    jobIds.push(job.id);
    const r = runWorker(['--reuse-checker', '--device', process.execPath, '--device-arg', STUB]);
    expect(r.status).toBe(0);
    expect(r.out).toContain('CHECKER_REUSE=none');
    expect(r.out).toContain('reason=no_ready_checker_for_assignment');
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, lastError: true, writtenCount: true } });
    expect(after.status).toBe('needs_rerun');
    expect(after.lastError).toBe('no_ready_checker_for_assignment');
    expect(after.writtenCount).toBe(0);
    const { dumpPath } = stubDumpFor(job.id);
    expect(fs.existsSync(dumpPath)).toBe(false); // 装置从未启动
  }, 120000);
});
