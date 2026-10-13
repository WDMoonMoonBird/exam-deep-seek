/**
 * W28（R2-B9②）：worker 消费 job 拉起装置时，平台模型/端点经子进程 env 透传（证据取自装置子进程自己落盘的 out/stub-env.json）。
 * 覆盖：配置时注入（值来自 env 兜底路径）+ 未配置时不注入（默认行为不变）。仅测试库；自建探针 job 并清理。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { describeLlmConfig, llmEnv } from '../../src/infrastructure/dsh/config/dshPlatformLlmConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const WORKER = path.join(SERVER, 'scripts', 'r2b5-worker.mjs');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const tag = 'w28-llm-' + Date.now();
let assignmentId = null;
let questionId = null;
const jobIds = [];

/** 合并 env 并**剔除 undefined**（spawn 会把 undefined 当字符串/保留 ⇒ 必须真删，才能证明「未配置不注入」） */
function mergedEnv(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v === undefined) delete out[k]; else out[k] = v;
  }
  return out;
}

function runWorker(env, stubSlugArg) {
  const base = { ...process.env, DSH_WORKER_DB_LIMIT: '1' };
  const res = spawnSync(process.execPath, [
    WORKER, '--once', '--device', process.execPath, '--device-arg', STUB,
    '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01',
    '--stub-env', 'STUB_MANIFEST_IDS=' + tag + '-' + stubSlugArg, '--timeout-ms', '60000',
  ], { encoding: 'utf8', timeout: 90000, env: mergedEnv(base, env) });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

function stubEnvDump(jobId) {
  const dirs = fs.readdirSync('/tmp').filter((d) => d.startsWith('r2b4-job-' + jobId + '-'));
  expect(dirs.length).toBeGreaterThan(0);
  const p = path.join('/tmp', dirs[dirs.length - 1], 'out', 'stub-env.json');
  return { path: p, dump: JSON.parse(fs.readFileSync(p, 'utf8')), runRoot: path.dirname(path.dirname(p)) };
}

describe('W28 worker 模型/端点透传', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    const u = await prisma.user.create({ data: { username: tag + '-stu', password: 'x', role: 'student', realName: tag + '-real1' } });
    await prisma.submission.create({ data: { assignmentId, questionId, studentId: u.id, status: 'submitted' } });
  }, 60000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
    for (const id of jobIds) {
      for (const d of fs.readdirSync('/tmp').filter((x) => x.startsWith('r2b4-job-' + id + '-'))) fs.rmSync(path.join('/tmp', d), { recursive: true, force: true });
    }
  }, 60000);

  it('W28-1 ★配置了 DEEPSEEK_MODEL/BASE_URL ⇒ 摘要打印 + 装置子进程实际收到（stub 落盘为证）', async () => {
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'probe-model-' + tag, status: 'pending' } });
    jobIds.push(job.id);
    const r = runWorker({ DEEPSEEK_MODEL: 'probe-model-9', DEEPSEEK_BASE_URL: 'https://probe.invalid' }, 'real1');
    expect(r.status).toBe(0);
    expect(r.out).toContain('PLATFORM_MODEL=probe-model-9');
    expect(r.out).toContain('PLATFORM_BASE_URL=https://probe.invalid');
    const { dump } = stubEnvDump(job.id);
    expect(dump.DEEPSEEK_MODEL).toBe('probe-model-9');
    expect(dump.DEEPSEEK_BASE_URL).toBe('https://probe.invalid');
    expect(dump.DSH_HOME).toContain('/home');
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, writtenCount: true } });
    expect(after.status).toBe('done');
    expect(after.writtenCount).toBe(1);
  }, 120000);

  it('W28-2 ★未配置 ⇒ 不注入：纯函数口径 llmEnv({})==={} + 运行期一致性（摘要值 == 装置子进程收到的值）', async () => {
    // 口径 1（确定性）：未配置时 llmEnv 返回空对象 ⇒ extraEnv 不含这两个键（默认行为不变）
    expect(llmEnv({})).toEqual({});
    expect(llmEnv({ model: 'm1' })).toEqual({ DEEPSEEK_MODEL: 'm1' });
    expect(llmEnv({ baseUrl: 'https://b' })).toEqual({ DEEPSEEK_BASE_URL: 'https://b' });
    expect(describeLlmConfig({})).toEqual({ platformModel: '(unset:device-default)', platformBaseUrl: '(unset:device-default)' });
    // 口径 2（运行期）：把 process.env 里这两个键**真删**后跑一次，摘要与子进程 env 必须一致
    const job = await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'probe-unset-' + tag, status: 'pending' } });
    jobIds.push(job.id);
    const r = runWorker({ DEEPSEEK_MODEL: undefined, DEEPSEEK_BASE_URL: undefined }, 'real1');
    expect(r.status).toBe(0);
    const shownModel = (r.out.match(/PLATFORM_MODEL=(\S+)/) || [])[1];
    const shownBase = (r.out.match(/PLATFORM_BASE_URL=(\S+)/) || [])[1];
    expect(shownModel).toBeTruthy();
    expect(shownBase).toBeTruthy();
    const { dump } = stubEnvDump(job.id);
    // 注：.env 里的 DEEPSEEK_* 会被 Prisma Client 的 dotenv 载入 process.env ⇒ 这里断言「一致性」而非固定 unset
    if (shownModel === '(unset:device-default)') expect(dump.DEEPSEEK_MODEL).toBe(null);
    else expect(dump.DEEPSEEK_MODEL).toBe(shownModel);
    if (shownBase === '(unset:device-default)') expect(dump.DEEPSEEK_BASE_URL).toBe(null);
    else expect(dump.DEEPSEEK_BASE_URL).toBe(shownBase);
  }, 120000);
});
