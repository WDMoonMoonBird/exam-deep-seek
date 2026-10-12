/**
 * W23（R2-B7）：用 stub 装置跑通「造尺入库 + 消费 + 写分」最小闭环（零模型调用）。
 * 仅测试库；自建探针行并清理；同时覆盖「已存在 ready 尺子 ⇒ 默认拒绝、--force-checker 才重建」。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const SCRIPT = path.join(SERVER, 'scripts', 'r2b7-build-checker.mjs');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const tag = 'w23-build-' + Date.now();
let assignmentId = null;
let questionId = null;
let studentId = null;
let workdir = null;

function runScript(extra) {
  const res = spawnSync(process.execPath, [
    SCRIPT, '--assignment', String(assignmentId), '--workdir', workdir,
    '--device', process.execPath, '--device-arg', STUB,
    '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1',
    '--stub-env', 'STUB_SUBMISSIONS=s01,s02',
    '--stub-env', 'STUB_MANIFEST_IDS=' + tag + '-real1,' + tag + '-real2',
    '--stub-env', 'STUB_SCORE=61', '--timeout-ms', '60000',
    ...extra,
  ], { encoding: 'utf8', timeout: 90000, env: { ...process.env } });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

describe('W23 造尺入口 stub 闭环', () => {
  beforeAll(async () => {
    // 隔离：stub 用的 checker fixture 带固定 checker_id（全局唯一）——清掉它可能残留的旧行，
    // 否则 consumeChecker 的 upsert 会保留旧行的 assignmentId（跨测试/跨冒烟共享 fixture 的副作用）。
    const fixture = JSON.parse(fs.readFileSync(path.join(SERVER, "scripts", "fixtures", "checker.sample.json"), "utf8"));
    await prisma.gradingChecker.deleteMany({ where: { checkerId: fixture.checker_id } });
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    for (let i = 0; i < 2; i++) {
      const u = await prisma.user.create({ data: { username: tag + '-stu' + i, password: 'x', role: 'student', realName: tag + '-real' + (i + 1) } });
      studentId = u.id;
      await prisma.submission.create({ data: { assignmentId, questionId, studentId: u.id, status: 'submitted' } });
    }
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'w23-work-'));
  }, 30000);

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
    if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
  }, 30000);

  it('W23-1 ★stub 闭环：造尺入库 + 消费 + 真写分（零模型调用），现场路径保留并打印', async () => {
    const r = runScript([]);
    expect(r.status).toBe(0);
    expect(r.out).toContain('RUN_ROOT=');
    expect(r.out).toContain('DSH_HOME=');
    expect(r.out).toContain('KEPT_RUN_ROOT=');
    expect(r.out).toContain('MODEL_CALLS=0');
    expect(r.out).toContain('CONSUMED=2');
    expect(r.out).toContain('WRITTEN=2');
    expect(r.out).toContain('NEEDS_RERUN=0');
    const checkerId = (r.out.match(/CHECKER_ID=(sha256:[0-9a-f]+)/) || [])[1];
    expect(checkerId).toBeTruthy();
    const row = await prisma.gradingChecker.findUnique({ where: { checkerId } });
    expect(row).toBeTruthy();
    expect(row.assignmentId).toBe(assignmentId);
    expect(row.status).toBe('ready');
    const subs = await prisma.submission.findMany({ where: { assignmentId }, select: { aiScore: true, checkerId: true, canonicalSha256: true } });
    expect(subs).toHaveLength(2);
    for (const s of subs) {
      expect(s.aiScore).toBe(61);
      expect(s.checkerId).toBe(checkerId);
      expect(s.canonicalSha256).toMatch(/^sha256:/);
    }
    // 现场保留：run-root 与 home 仍在（未清理）
    expect(fs.existsSync(workdir)).toBe(true);
    expect(fs.existsSync(path.join(workdir, 'home'))).toBe(true);
  }, 120000);

  it('W23-2 已存在 ready 尺子 ⇒ 默认拒绝（rc=3，不重新造尺）；--force-checker 才重建', async () => {
    const again = runScript([]);
    expect(again.status).toBe(3);
    expect(again.out).toContain('CHECKER_ALREADY_READY');
    expect(again.out).toContain('hint=--force-checker');
    const forced = runScript(['--force-checker']);
    expect(forced.status).toBe(0);
    expect(forced.out).toContain('CHECKER_ID=sha256:');
  }, 120000);

  it('W23-3 不写分语义沿用批 3：exit6 产物 ⇒ needs_rerun、不写分（CONSUMED=1 / WRITTEN=0）', async () => {
    await prisma.submission.updateMany({ where: { assignmentId }, data: { aiScore: null, checkerId: null, canonicalSha256: null } });
    // 用**全新** workdir：上一用例的 run-root 里已留有 s01/s02 两份产物，复用会让 CONSUMED=2（消费器按产物逐份处理）
    const freshWork = fs.mkdtempSync(path.join(os.tmpdir(), 'w23-exit6-'));
    const r = spawnSync(process.execPath, [
      SCRIPT, '--assignment', String(assignmentId), '--workdir', freshWork, '--force-checker',
      '--device', process.execPath, '--device-arg', STUB,
      '--stub-env', 'STUB_MODE=exit6', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01',
      '--stub-env', 'STUB_MANIFEST_IDS=' + tag + '-real1', '--timeout-ms', '60000',
    ], { encoding: 'utf8', timeout: 90000 });
    const out = (r.stdout || '') + (r.stderr || '');
    expect(out).toContain('CONSUMED=1');
    expect(out).toContain('WRITTEN=0');
    expect(out).toContain('NEEDS_RERUN=1');
    const subs = await prisma.submission.findMany({ where: { assignmentId }, select: { aiScore: true } });
    expect(subs.every((s) => s.aiScore === null)).toBe(true);
  }, 120000);
});
