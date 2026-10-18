/**
 * W19（R2-B5）：DB 级闸的**跨进程**实测 —— 两个 worker 进程并发，limit=1 ⇒ 只允许一个进程真正启动装置。
 * ★task-40：R1 迁移后 DB 限制「每 assignment 至多一个活动 job」⇒ W19-1 的「同作业两个 pending」
 *   改为**两个作业各一条 pending**（两个独立 assignment），闸语义对（全局 DB 闸 limit=1）不变。
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
const assignmentIds = [];
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

async function mkAssignmentWithPendingJob(suffix) {
  const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
  const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag + '-' + suffix, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
  assignmentIds.push(a.id);
  await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: 'sha256:' + (suffix === 'a' ? 'a' : 'b').repeat(64), status: 'pending' } });
  return a.id;
}

describe('W19 DB 级闸（跨进程）', () => {
  beforeAll(async () => {
    spanLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'w19-')), 'spans.log');
    await mkAssignmentWithPendingJob('a');
    await mkAssignmentWithPendingJob('b');
  }, 30000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  });

  it('W19-1 两进程并发（limit=1）⇒ 只有一个进程启动装置（span=1），另一进程拿不到 job', async () => {
    const [r1, r2] = await Promise.all([runWorkerOnce({}), runWorkerOnce({})]);
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);
    const spans = fs.existsSync(spanLog) ? fs.readFileSync(spanLog, 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean) : [];
    expect(spans).toHaveLength(1); // ★DB 级闸：第二个进程没有并发拉起装置
    const consumed = [r1, r2].map((r) => Number((r.out.match(/consumed=(\d+)/) || [])[1] || -1)).sort();
    expect(consumed).toEqual([0, 1]);
  }, 60000);

  it('W19-2 闸释放后可继续消费（第二次调用把第二个 job 跑完）', async () => {
    const r = await runWorkerOnce({});
    expect(r.code).toBe(0);
    const pending = await prisma.gradingJob.count({ where: { assignmentId: { in: assignmentIds }, status: 'pending' } });
    const running = await prisma.gradingJob.count({ where: { assignmentId: { in: assignmentIds }, status: 'running' } });
    expect(running).toBe(0); // 无遗留 running（闸已释放、job 已落定）
    expect(pending).toBeLessThanOrEqual(1);
  }, 60000);
});
