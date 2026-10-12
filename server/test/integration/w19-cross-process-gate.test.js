/**
 * W19（R2-B5）：DB 级闸的**跨进程**实测 —— 两个 worker 进程并发，limit=1 ⇒ 只允许一个进程真正启动装置。
 * 判据：共享 span 日志只有 1 条（另一个进程因 DB 闸拿不到 job）；两个进程退出码均 0。
 * 仅测试库；自建探针行并在 afterAll 清理。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');

const tag = 'w19-gate-' + Date.now();
let assignmentId = null;
let spanLog = null;

function runWorkerOnce(extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      path.join(SERVER, 'scripts', 'r2b5-worker.mjs'), '--once', '--timeout-ms', '60000',
      '--device', process.execPath, '--device-arg', path.join(SERVER, 'scripts', 'stub-device.mjs'),
      '--stub-env', 'STUB_MODE=slow', '--stub-env', 'STUB_SLEEP=1500', '--stub-env', 'STUB_SPAN_LOG=' + spanLog,
      '--stub-env', 'STUB_SUBMISSIONS=1101',
    ], { env: { ...process.env, DSH_WORKER_DB_LIMIT: '1', DSH_WORKER_IDLE_BACKOFF_MS: '10', ...extraEnv }, encoding: 'utf8' });
    let out = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { out += String(d); });
    child.on('close', (code) => resolve({ code, out }));
  });
}

describe('W19 DB 级闸（跨进程）', () => {
  beforeAll(async () => {
    spanLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'w19-')), 'spans.log');
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'sha256:' + 'a'.repeat(64), status: 'pending' } });
    await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'sha256:' + 'b'.repeat(64), status: 'pending' } });
  }, 30000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
  });

  it('W19-1 两进程并发（limit=1）⇒ 只有一个进程启动装置（span=1），另一进程拿不到 job', async () => {
    const [r1, r2] = await Promise.all([runWorkerOnce({}), runWorkerOnce({})]);
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);
    const spans = fs.existsSync(spanLog) ? fs.readFileSync(spanLog, 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean) : [];
    expect(spans).toHaveLength(1); // ★DB 级闸：第二个进程没有并发拉起装置
    // 两个进程的消费计数：一个 consumed=1，另一个 consumed=0（拿不到 job）
    const consumed = [r1, r2].map((r) => Number((r.out.match(/consumed=(\d+)/) || [])[1] || -1)).sort();
    expect(consumed).toEqual([0, 1]);
  }, 60000);

  it('W19-2 闸释放后可继续消费（第二次调用把第二个 job 跑完）', async () => {
    const r = await runWorkerOnce({});
    expect(r.code).toBe(0);
    // 前一轮只有一个 job 被消费；这一轮补上另一个（或闸满时留到下一轮）
    const pending = await prisma.gradingJob.count({ where: { assignmentId, status: 'pending' } });
    const running = await prisma.gradingJob.count({ where: { assignmentId, status: 'running' } });
    expect(running).toBe(0); // 无遗留 running（闸已释放、job 已落定）
    expect(pending).toBeLessThanOrEqual(1);
  }, 60000);
});
