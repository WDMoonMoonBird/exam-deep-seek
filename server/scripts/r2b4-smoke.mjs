#!/usr/bin/env node
/**
 * r2b4-smoke.mjs —— R2-B4 稳定复算入口（从 server/ 运行，零模型调用）：
 *   建 job → 消费（stub 装置）→ 入库 / needs_rerun 全链路，并打印可判定摘要。
 *
 * 只写**测试库**（库名硬断言 exam_system_test），跑完清理自建行；不执行学生代码、不起服务、不占端口。
 * 退出码：0=全部断言通过；1=断言失败；2=库名断言失败；3=环境缺失。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { runOnce, createGate } from '../src/infrastructure/dsh/worker/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..');
const REPO = path.resolve(SERVER, '..');

function testDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(path.join(SERVER, '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  return m ? m[1].trim().replace('/exam_system', '/exam_system_test') : '';
}

const url = testDbUrl();
if (!url) { console.log('R2B4_SMOKE=FAIL reason=no_db_url'); process.exit(3); }
const dbName = new URL(url).pathname.replace(/^\//, '');
if (dbName !== 'exam_system_test') { console.log('REFUSE ' + dbName); process.exit(2); }
console.log('db_ok=/' + dbName);

const prisma = new PrismaClient({ datasources: { db: { url } } });
const tag = 'r2b4-smoke-' + Date.now();
const results = [];
let exitCode = 0;
const probe = { submissionIds: [], questionId: null, assignmentId: null, checkerIds: [], jobIds: [], studentId: null };

try {
  // 0) 自建探针数据（测试库）
  const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
  if (!teacher) { console.log('R2B4_SMOKE=FAIL reason=no_teacher'); process.exit(3); }
  const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'stub 材料', scoringRubric: 'stub 标准', maxScore: 100 } });
  probe.questionId = q.id;
  const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2026-06-01') } });
  probe.assignmentId = a.id;
  for (const i of [1, 2]) {
    const s = await prisma.submission.create({ data: { assignmentId: a.id, questionId: q.id, studentId: teacher.id, status: 'submitted' } });
    probe.submissionIds.push(s.id);
  }
  // slug 场景需要「源 id ↔ 平台提交」的真实映射载体：建一个学生（realName 即 manifest 里的源 id）
  const stu = await prisma.user.create({ data: { username: tag + '-stu', password: 'x', role: 'student', realName: tag + '-real' } });
  probe.studentId = stu.id;
  const s3 = await prisma.submission.create({ data: { assignmentId: a.id, questionId: q.id, studentId: stu.id, status: 'submitted' } });
  probe.submissionIds.push(s3.id);
  console.log('probe assignment=' + a.id + ' question=' + q.id + ' submissions=' + probe.submissionIds.join(','));

  const device = path.join(SERVER, 'scripts', 'stub-device.mjs');
  const baseArgs = [device];

  // 1) 正常路径：建 job → 消费 → 写分
  const job1 = await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: 'sha256:' + 'a'.repeat(64), status: 'pending' } });
  probe.jobIds.push(job1.id);
  const gate = createGate(1);
  const r1 = await runOnce({
    prisma, jobId: job1.id, gate,
    deviceCommand: process.execPath, deviceArgs: baseArgs,
    stubEnv: { STUB_MODE: 'ok', STUB_SUBMISSIONS: String(probe.submissionIds[0]), STUB_SCORE: '62' },
    repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 60000,
  });
  const job1After = await prisma.gradingJob.findUnique({ where: { id: job1.id } });
  const sub1 = await prisma.submission.findUnique({ where: { id: probe.submissionIds[0] } });
  results.push(['consume_ok_path', r1.status === 'done' && job1After.status === 'done' && sub1.aiScore === 62 && !!sub1.checkerId]);
  console.log('JOB1 status=' + r1.status + ' written=' + r1.written + ' skipped=' + r1.skipped + ' aiScore=' + sub1.aiScore + ' checker_id=' + (sub1.checkerId || 'null'));

  // 2) 装置 exit 6 ⇒ needs_rerun 且不写分
  const job2 = await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: 'sha256:' + 'b'.repeat(64), status: 'pending' } });
  probe.jobIds.push(job2.id);
  const r2 = await runOnce({
    prisma, jobId: job2.id, gate,
    deviceCommand: process.execPath, deviceArgs: baseArgs,
    stubEnv: { STUB_MODE: 'exit6', STUB_SUBMISSIONS: String(probe.submissionIds[1]) },
    repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 60000,
  });
  const job2After = await prisma.gradingJob.findUnique({ where: { id: job2.id } });
  const sub2 = await prisma.submission.findUnique({ where: { id: probe.submissionIds[1] } });
  results.push(['exit6_no_score', r2.status === 'needs_rerun' && job2After.status === 'needs_rerun' && sub2.aiScore === null && sub2.checkerId === null]);
  console.log('JOB2 status=' + r2.status + ' reason=' + job2After.lastError + ' aiScore=' + sub2.aiScore + '（不写分）');

  // 3) 产物缺失 ⇒ needs_rerun
  const job3 = await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: 'sha256:' + 'c'.repeat(64), status: 'pending' } });
  probe.jobIds.push(job3.id);
  const r3 = await runOnce({
    prisma, jobId: job3.id, gate,
    deviceCommand: process.execPath, deviceArgs: baseArgs,
    stubEnv: { STUB_MODE: 'no-artifacts' },
    repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 60000,
  });
  results.push(['artifacts_missing_needs_rerun', r3.status === 'needs_rerun' && r3.reason === 'artifacts_missing']);
  console.log('JOB3 status=' + r3.status + ' reason=' + r3.reason);

  // 4) 闸满：不领取（job 保持 pending）
  const job4 = await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: 'sha256:' + 'e'.repeat(64), status: 'pending' } });
  probe.jobIds.push(job4.id);
  const gateHeld = createGate(1);
  gateHeld.tryAcquire(); // 占住唯一名额
  const r4 = await runOnce({ prisma, jobId: job4.id, gate: gateHeld, deviceCommand: process.execPath, deviceArgs: baseArgs, repoRoot: REPO, timeoutMs: 30000 });
  const job4After = await prisma.gradingJob.findUnique({ where: { id: job4.id } });
  gateHeld.release();
  results.push(['gate_full_keeps_pending', r4.consumed === false && r4.reason === 'gate_full' && job4After.status === 'pending' && job4After.attempts === 0]);
  console.log('JOB4 consumed=' + r4.consumed + ' reason=' + r4.reason + ' status=' + job4After.status + ' attempts=' + job4After.attempts);

  // 5) 超时 ⇒ kill + 释放闸 + attempts 递增 + 回 pending 可重试
  const job5 = await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: 'sha256:' + 'f'.repeat(64), status: 'pending' } });
  probe.jobIds.push(job5.id);
  const gate2 = createGate(1);
  const r5 = await runOnce({
    prisma, jobId: job5.id, gate: gate2,
    deviceCommand: process.execPath, deviceArgs: baseArgs,
    stubEnv: { STUB_MODE: 'slow', STUB_SLEEP: '3000' },
    timeoutMs: 1500, repoRoot: REPO, runRootBase: '/tmp',
  });
  const job5After = await prisma.gradingJob.findUnique({ where: { id: job5.id } });
  results.push(['timeout_retryable', r5.timedOut === true && job5After.status === 'pending' && job5After.attempts === 1 && gate2.active === 0]);
  console.log('JOB5 timedOut=' + r5.timedOut + ' status=' + job5After.status + ' attempts=' + job5After.attempts + ' gate_active=' + gate2.active);

  // 6) 双消费：第二次领取同一 job ⇒ 拒绝
  const r6 = await runOnce({ prisma, jobId: job1.id, gate, deviceCommand: process.execPath, deviceArgs: baseArgs, stubEnv: { STUB_MODE: 'ok' }, repoRoot: REPO, timeoutMs: 30000 });
  results.push(['no_double_consume', r6.consumed === false && r6.reason === 'no_pending_job']);
  console.log('DOUBLE_CONSUME consumed=' + r6.consumed + ' reason=' + r6.reason);

  // 7) ★F-R2C4-1：装置真实命名（slug s01）+ manifest 源 id=学生姓名 ⇒ 经 worker 真写分
  const job6 = await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: 'sha256:' + '9'.repeat(64), status: 'pending' } });
  probe.jobIds.push(job6.id);
  const r7 = await runOnce({
    prisma, jobId: job6.id, gate,
    deviceCommand: process.execPath, deviceArgs: baseArgs,
    stubEnv: {
      STUB_MODE: 'ok', STUB_SLUG: '1', STUB_SUBMISSIONS: 's01',
      STUB_MANIFEST_IDS: tag + '-real', STUB_ASSIGNMENT_ID: String(a.id), STUB_SCORE: '59',
    },
    repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 60000,
  });
  const sub3 = await prisma.submission.findUnique({ where: { id: probe.submissionIds[2] } });
  results.push(['slug_mapped_real_write', r7.status === 'done' && r7.written === 1 && sub3.aiScore === 59 && !!sub3.checkerId]);
  console.log('JOB6(slug) status=' + r7.status + ' written=' + r7.written + ' aiScore=' + sub3.aiScore + ' checker_id=' + (sub3.checkerId || 'null'));

  // 8) ★F-R2C4-1 反向：slug 无法映射（manifest 源 id 无人匹配）⇒ needs_rerun，绝不报 done/零写入
  const job7 = await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: 'sha256:' + '8'.repeat(64), status: 'pending' } });
  probe.jobIds.push(job7.id);
  const r8 = await runOnce({
    prisma, jobId: job7.id, gate,
    deviceCommand: process.execPath, deviceArgs: baseArgs,
    stubEnv: {
      STUB_MODE: 'ok', STUB_SLUG: '1', STUB_SUBMISSIONS: 's02',
      STUB_MANIFEST_IDS: '无此人-' + Date.now(), STUB_ASSIGNMENT_ID: String(a.id), STUB_SCORE: '59',
    },
    repoRoot: REPO, runRootBase: '/tmp', timeoutMs: 60000,
  });
  const job7After = await prisma.gradingJob.findUnique({ where: { id: job7.id } });
  results.push(['slug_unmapped_needs_rerun', r8.status === 'needs_rerun' && r8.written === 0 && job7After.status === 'needs_rerun' && (job7After.lastError || '').includes('unmapped_submission_id')]);
  console.log('JOB7(slug-unmapped) status=' + r8.status + ' written=' + r8.written + ' reason=' + job7After.lastError);

  const failed = results.filter(([, ok]) => !ok);
  for (const [name, ok] of results) console.log('CHECK ' + name + '=' + (ok ? 'PASS' : 'FAIL'));
  console.log('R2B4_SMOKE=' + (failed.length ? 'FAIL' : 'PASS') + ' checks=' + results.length + ' failed=' + failed.length);
  exitCode = failed.length ? 1 : 0;
} catch (err) {
  console.log('R2B4_SMOKE=FAIL reason=' + (err && err.message));
  exitCode = 1;
} finally {
  // 清理自建行（只动本脚本创建的 id）
  for (const id of probe.jobIds) await prisma.gradingJob.deleteMany({ where: { id } }).catch(() => {});
  if (probe.assignmentId) await prisma.submission.deleteMany({ where: { assignmentId: probe.assignmentId } }).catch(() => {});
  await prisma.assignment.deleteMany({ where: { id: probe.assignmentId || -1 } }).catch(() => {});
  await prisma.question.deleteMany({ where: { id: probe.questionId || -1 } }).catch(() => {});
  await prisma.gradingChecker.deleteMany({ where: { assignmentId: probe.assignmentId || -1 } }).catch(() => {});
  if (probe.studentId) await prisma.user.deleteMany({ where: { id: probe.studentId } }).catch(() => {});
  await prisma.$disconnect();
}
process.exit(exitCode);
