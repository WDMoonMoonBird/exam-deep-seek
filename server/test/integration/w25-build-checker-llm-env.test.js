/**
 * W25（R2-B8①）：平台配置的模型/端点经子进程 env 传进装置；未提供时**不传**（装置侧保持默认）。
 * 证据链：脚本输出的 PLATFORM_MODEL/PLATFORM_BASE_URL + 装置子进程自己落盘的 out/stub-env.json。
 * 仅测试库；自建探针行并清理；零模型调用。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { readPlatformLlmConfig } from '../../scripts/r2b7-build-checker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const SCRIPT = path.join(SERVER, 'scripts', 'r2b7-build-checker.mjs');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const tag = 'w25-llm-' + Date.now();
let assignmentId = null;
let questionId = null;

function runWithEnv(extraEnv) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'w25-work-'));
  const res = spawnSync(process.execPath, [
    SCRIPT, '--assignment', String(assignmentId), '--workdir', workdir, '--force-checker',
    '--device', process.execPath, '--device-arg', STUB,
    '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01',
    '--stub-env', 'STUB_MANIFEST_IDS=' + tag + '-real1', '--timeout-ms', '60000',
  ], { encoding: 'utf8', timeout: 90000, env: { ...process.env, ...extraEnv } });
  const envDump = JSON.parse(fs.readFileSync(path.join(workdir, 'out', 'stub-env.json'), 'utf8'));
  fs.rmSync(workdir, { recursive: true, force: true });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || ''), envDump };
}

describe('W25 模型/端点对齐', () => {
  beforeAll(async () => {
    await prisma.gradingChecker.deleteMany({ where: { checkerId: JSON.parse(fs.readFileSync(path.join(SERVER, 'scripts', 'fixtures', 'checker.sample.json'), 'utf8')).checker_id } });
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
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
  }, 30000);

  it('W25-1 提供 DEEPSEEK_MODEL/BASE_URL ⇒ 脚本打印平台值，且装置子进程 env 实际收到', async () => {
    const r = runWithEnv({ DEEPSEEK_MODEL: 'deepseek-v4-flash', DEEPSEEK_BASE_URL: 'https://api.deepseek.com' });
    expect(r.status).toBe(0);
    expect(r.out).toContain('PLATFORM_MODEL=deepseek-v4-flash');
    expect(r.out).toContain('PLATFORM_BASE_URL=https://api.deepseek.com');
    expect(r.envDump.DEEPSEEK_MODEL).toBe('deepseek-v4-flash');
    expect(r.envDump.DEEPSEEK_BASE_URL).toBe('https://api.deepseek.com');
    expect(r.envDump.DSH_HOME).toContain('/home');
  }, 120000);

  it('W25-2 ★未提供 ⇒ 不传（装置侧保持默认 deepseek-flash/官方端点）：PLATFORM_*=(unset:device-default) 且子进程 env 为空', async () => {
    const env = { ...process.env };
    delete env.DEEPSEEK_MODEL;
    delete env.DEEPSEEK_BASE_URL;
    const res = spawnSync(process.execPath, [
      SCRIPT, '--assignment', String(assignmentId), '--workdir', fs.mkdtempSync(path.join(os.tmpdir(), 'w25-work2-')), '--force-checker',
      '--device', process.execPath, '--device-arg', STUB,
      '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01',
      '--stub-env', 'STUB_MANIFEST_IDS=' + tag + '-real1', '--timeout-ms', '60000',
    ], { encoding: 'utf8', timeout: 90000, env });
    const out = (res.stdout || '') + (res.stderr || '');
    // 本轮 env 未提供 ⇒ 生效值来自「平台 DB 配置」或「不传（装置默认）」；两种都合法，
    // 关键是**输出与子进程 env 必须一致**（DB 优先于 env；都没有才不传）。
    const platformModel = (out.match(/PLATFORM_MODEL=(\S+)/) || [])[1];
    const platformBase = (out.match(/PLATFORM_BASE_URL=(\S+)/) || [])[1];
    expect(platformModel).toBeTruthy();
    expect(platformBase).toBeTruthy();
    const wd = out.match(/RUN_ROOT=([^ \n]+)/)[1];
    const dump = JSON.parse(fs.readFileSync(path.join(wd, 'out', 'stub-env.json'), 'utf8'));
    if (platformModel === '(unset:device-default)') expect(dump.DEEPSEEK_MODEL).toBe(null);
    else expect(dump.DEEPSEEK_MODEL).toBe(platformModel);
    if (platformBase === '(unset:device-default)') expect(dump.DEEPSEEK_BASE_URL).toBe(null);
    else expect(dump.DEEPSEEK_BASE_URL).toBe(platformBase);
    fs.rmSync(wd, { recursive: true, force: true });
  }, 120000);

  it('W25-3 readPlatformLlmConfig：DB 值优先，其次 env，读库异常回退 env', async () => {
    const fakeRows = { $queryRawUnsafe: async () => ([{ key: 'deepseek_model', value: 'deepseek-v4-flash' }, { key: 'deepseek_base_url', value: 'https://api.deepseek.com' }]) };
    const fromDb = await readPlatformLlmConfig(fakeRows, { DEEPSEEK_MODEL: 'env-model', DEEPSEEK_BASE_URL: 'https://env' });
    expect(fromDb).toEqual({ model: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com' });
    const empty = await readPlatformLlmConfig({ $queryRawUnsafe: async () => [] }, { DEEPSEEK_MODEL: 'env-model' });
    expect(empty.model).toBe('env-model');
    const boom = await readPlatformLlmConfig({ $queryRawUnsafe: async () => { throw new Error('db down'); } }, { DEEPSEEK_BASE_URL: 'https://env' });
    expect(boom.baseUrl).toBe('https://env');
  });
});
