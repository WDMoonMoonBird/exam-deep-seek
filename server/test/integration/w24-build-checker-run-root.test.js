/**
 * W24（R2-B8）：r2b7 的 --run-root 复用路径 + 互斥 + 授权语义（机制级断言）。
 * 仅测试库；自建探针行并清理；run-root 由 stub 装置生成（零模型调用）。
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
const DEAD_PROD = 'mysql://u:p@127.0.0.1:1/exam_system';
const tag = 'w24-runroot-' + Date.now();
let assignmentId = null;
let questionId = null;
let runRoot = null;
let emptyRoot = null;

function run(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000 });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

describe('W24 --run-root 复用与互斥', () => {
  beforeAll(async () => {
    await prisma.gradingChecker.deleteMany({ where: { checkerId: JSON.parse(fs.readFileSync(path.join(SERVER, 'scripts', 'fixtures', 'checker.sample.json'), 'utf8')).checker_id } });
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    for (let i = 0; i < 2; i++) {
      const u = await prisma.user.create({ data: { username: tag + '-stu' + i, password: 'x', role: 'student', realName: tag + '-real' + (i + 1) } });
      await prisma.submission.create({ data: { assignmentId, questionId, studentId: u.id, status: 'submitted' } });
    }
    // 用 stub 直接生成一个 run-root（模拟「已存在的产物」；零模型调用）
    runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w24-runroot-'));
    const stub = spawnSync(process.execPath, [STUB], {
      encoding: 'utf8',
      env: { ...process.env, GRADER_RUN_ROOT: runRoot, STUB_MODE: 'ok', STUB_SLUG: '1', STUB_SUBMISSIONS: 's01,s02', STUB_MANIFEST_IDS: tag + '-real1,' + tag + '-real2', STUB_SCORE: '58' },
    });
    expect(stub.status).toBe(0);
    emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w24-empty-'));
  }, 60000);

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
    for (const d of [runRoot, emptyRoot]) if (d) fs.rmSync(d, { recursive: true, force: true });
  }, 30000);

  it('W24-1 ★--run-root 复用已有产物入库并打印完整 SUMMARY（MODEL_CALLS=0）', async () => {
    const r = run(['--assignment', String(assignmentId), '--run-root', runRoot]);
    expect(r.status).toBe(0);
    expect(r.out).toContain('RUN_ROOT=' + runRoot);
    expect(r.out).toContain('(复用已有产物，未启动装置)');
    expect(r.out).not.toContain('STAGE=device');
    expect(r.out).toContain('SUMMARY_BEGIN');
    expect(r.out).toContain('ASSIGNMENT=' + assignmentId);
    expect(r.out).toContain('CONSUMED=2');
    expect(r.out).toContain('WRITTEN=2');
    expect(r.out).toContain('NEEDS_RERUN=0');
    expect(r.out).toContain('MODEL_CALLS=0');
    const checkerId = (r.out.match(/CHECKER_ID=(sha256:[0-9a-f]+)/) || [])[1];
    expect(checkerId).toBeTruthy();
    const subs = await prisma.submission.findMany({ where: { assignmentId }, select: { aiScore: true, checkerId: true } });
    expect(subs).toHaveLength(2);
    for (const s of subs) { expect(s.aiScore).toBe(58); expect(s.checkerId).toBe(checkerId); }
  }, 90000);

  it('W24-2 ★缺失 checker.json ⇒ RUN_ROOT_INVALID + 非零退出（不静默成功）', async () => {
    const r = run(['--assignment', String(assignmentId), '--run-root', emptyRoot]);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('RESULT=RUN_ROOT_INVALID');
    expect(r.out).toContain('reason=checker_json_missing');
    expect(r.out).not.toContain('WRITTEN=2');
  }, 60000);

  it('W24-3 --run-root 与 --device-arg 互斥 ⇒ rc=4（用法错误）', () => {
    const r = run(['--assignment', String(assignmentId), '--run-root', runRoot, '--device-arg', 'x']);
    expect(r.status).toBe(4);
    expect(r.out).toContain('run_root_conflicts_with_device_arg');
  });

  it('W24-4 授权语义对 --run-root 同样生效：三态拒（rc=2 + REFUSED_BEFORE_CONNECT、无 STAGE=connect）+ 双开关越过守卫', () => {
    for (const extra of [[], ['--allow-db', 'exam_system'], ['--allow-prod']]) {
      const r = run(['--assignment', String(assignmentId), '--run-root', runRoot, '--db-url', DEAD_PROD, ...extra]);
      expect(r.status).toBe(2);
      expect(r.out).toContain('REFUSE_PROD_DB');
      expect(r.out).toContain('REFUSED_BEFORE_CONNECT=yes');
      expect(r.out).not.toContain('STAGE=connect');
    }
    const ok = run(['--assignment', String(assignmentId), '--run-root', runRoot, '--db-url', DEAD_PROD, '--allow-db', 'exam_system', '--allow-prod']);
    expect(ok.status).toBe(1);
    expect(ok.out).toContain('STAGE=connect');
    expect(ok.out).toContain('CONNECT_FAILED=yes');
    expect(ok.out).not.toContain('REFUSE_PROD_DB');
  }, 90000);
});
