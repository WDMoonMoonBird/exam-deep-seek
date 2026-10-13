/**
 * W48（R2-B21）：worker 按 job 解析该作业物料（捕获式断言）+ 缺失 fail-closed + 向后兼容 + 多作业不串味。
 * 仅测试库；不跑真实装置（inject deps.runDshGrader）；探针自清理。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { runOnce } from '../../src/infrastructure/dsh/worker/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const tag = 'w48-mat-' + Date.now();
let assignmentA = null;
let assignmentB = null;
let questionId = null;
const captured = [];
const logs = [];
const realLog = console.log;

function makeRunner() {
  return async (opts) => { captured.push({ args: opts.args, cwd: opts.cwd, runRoot: opts.runRoot }); return { exitCode: 0, stdout: '', stderr: '', timedOut: false }; };
}
async function mkAssignment(suffix) {
  const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
  const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag + '-' + suffix, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
  await prisma.assignmentQuestion.create({ data: { assignmentId: a.id, questionId, sortOrder: 1 } });
  const job = await prisma.gradingJob.create({ data: { assignmentId: a.id, checkerId: tag + '-' + suffix, status: 'pending' } });
  return { assignmentId: a.id, jobId: job.id };
}
function mkMaterialsDir(root, assignmentId, { manifest = null, zips = [] } = {}) {
  const dir = path.join(root, String(assignmentId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '标准工程包.zip'), 'STD');
  fs.writeFileSync(path.join(dir, '评分标准.md'), 'rubric');
  fs.writeFileSync(path.join(dir, '题目描述.md'), 'desc');
  for (const z of zips) fs.writeFileSync(path.join(dir, z + '.zip'), 'zip:' + z);
  if (manifest) fs.writeFileSync(path.join(dir, 'export-manifest.json'), JSON.stringify(manifest));
  return dir;
}

describe('W48 按 job 解析物料', () => {
  let root = null;
  beforeAll(async () => {
    realLog.call(console, '');
    console.log = (...a) => { logs.push(a.join(' ')); };
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'w48-matroot-'));
  }, 60000);

  afterAll(async () => {
    console.log = realLog;
    // 清理：以「绑定到本用例题目」的作业为准（覆盖本文件所有 mkAssignment 产生的作业，含历史失败尝试）
    const links = await prisma.assignmentQuestion.findMany({ where: { questionId }, select: { assignmentId: true } });
    const ids = [...new Set(links.map((l) => l.assignmentId))];
    if (ids.length) {
      await prisma.gradingJob.deleteMany({ where: { assignmentId: { in: ids } } });
      await prisma.gradingChecker.deleteMany({ where: { assignmentId: { in: ids } } });
      await prisma.assignmentQuestion.deleteMany({ where: { questionId } });
      await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.question.deleteMany({ where: { id: questionId } });
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);

  it('★W48-1 设 ROOT 且目录存在 ⇒ args 含 --source-dir <ROOT>/<aid>（绝对）且 --submissions=manifest 的 n_submissions', async () => {
    const a = await mkAssignment('A');
    assignmentA = a.assignmentId;
    mkMaterialsDir(root, assignmentA, { manifest: { n_submissions: 2 }, zips: ['甲', '乙'] });
    captured.length = 0; logs.length = 0;
    const res = await runOnce({
      prisma, jobId: a.jobId, materialsRoot: root, dbLimit: 5,
      deviceCommand: process.execPath, deviceArgs: ['scripts/x.mjs', '--submissions', '63', '--allow-identical'],
      repoRoot: SERVER + '/..', timeoutMs: 30000, deps: { runDshGrader: makeRunner() },
    });
    expect(res.consumed).toBe(true);
    expect(captured).toHaveLength(1);
    const args = captured[0].args;
    const srcIdx = args.indexOf('--source-dir');
    expect(srcIdx).toBeGreaterThanOrEqual(0);
    expect(args[srcIdx + 1]).toBe(path.join(root, String(assignmentA)));
    expect(path.isAbsolute(args[srcIdx + 1])).toBe(true);
    const subArgs = args.filter((x, i) => args[i - 1] === '--submissions');
    expect(subArgs).toEqual(['2']);                       // 覆盖启动时写死的 63，且只有一处
    expect(args).not.toContain('63');
    expect(logs.some((l) => l.includes('MATERIALS_RESOLVED assignment=' + assignmentA) && l.includes('source=manifest'))).toBe(true);
  }, 90000);

  it('★W48-2 目录缺失 ⇒ fail-closed：不启动装置、job needs_rerun、last_error 与标记齐备（不回落实验/）', async () => {
    const b = await mkAssignment('B');
    assignmentB = b.assignmentId;
    captured.length = 0; logs.length = 0;
    const res = await runOnce({
      prisma, jobId: b.jobId, materialsRoot: root, dbLimit: 5,
      deviceCommand: process.execPath, deviceArgs: ['scripts/x.mjs'],
      repoRoot: SERVER + '/..', timeoutMs: 30000, deps: { runDshGrader: makeRunner() },
    });
    expect(res.consumed).toBe(true);
    expect(res.status).toBe('needs_rerun');
    expect(res.reason).toBe('materials_missing_for_assignment:' + assignmentB);
    expect(captured).toHaveLength(0);                     // ★装置从未启动（不回落默认源目录）
    const row = await prisma.gradingJob.findUnique({ where: { id: b.jobId }, select: { status: true, lastError: true, writtenCount: true } });
    expect(row.status).toBe('needs_rerun');
    expect(row.lastError).toBe('materials_missing_for_assignment:' + assignmentB);
    expect(row.writtenCount).toBe(0);
    expect(logs.some((l) => l === 'MATERIALS_MISSING assignment=' + assignmentB + ' path=' + path.join(root, String(assignmentB)))).toBe(true);
  }, 90000);

  it('★W48-3 未设 ROOT ⇒ args 与启动参数逐一相同（向后兼容回归）', async () => {
    const a = await mkAssignment('C');
    const args0 = ['scripts/x.mjs', '--submissions', '63', '--allow-identical'];
    captured.length = 0; logs.length = 0;
    await runOnce({
      prisma, jobId: a.jobId, dbLimit: 5,
      deviceCommand: process.execPath, deviceArgs: [...args0],
      repoRoot: SERVER + '/..', timeoutMs: 30000, deps: { runDshGrader: makeRunner() },
    });
    expect(captured).toHaveLength(1);
    const got = captured[0].args;
    // 向后兼容：不得注入 --source-dir；启动时的 --submissions 与其余 token 逐一保持（--workdir 由 R2-B12 既有逻辑注入）
    expect(got).not.toContain('--source-dir');
    expect(got.filter((v, i) => got[i - 1] === '--submissions')).toEqual(['63']);
    const base = got.slice(0, args0.length);
    expect(base).toEqual([...args0]);
    expect(got.slice(args0.length)).toEqual(['--workdir', captured[0].runRoot]);
    expect(logs.some((l) => l.startsWith('MATERIALS_RESOLVED'))).toBe(false);
  }, 90000);

  it('★W48-4 manifest 缺失（3 个 zip）⇒ 回退 zipcount：--submissions=2 且打印 source=zipcount', async () => {
    const a = await mkAssignment('D');
    mkMaterialsDir(root, a.assignmentId, { zips: ['甲', '乙', '丙'] });
    captured.length = 0; logs.length = 0;
    await runOnce({
      prisma, jobId: a.jobId, materialsRoot: root, dbLimit: 5,
      deviceCommand: process.execPath, deviceArgs: ['scripts/x.mjs', '--submissions', '63'],
      repoRoot: SERVER + '/..', timeoutMs: 30000, deps: { runDshGrader: makeRunner() },
    });
    const args = captured[0].args;
    // 目录内共 4 个 zip（1 标准 + 3 提交）⇒ zipcount 回退 = 4 − 1 = 3
    expect(args.filter((x, i) => args[i - 1] === '--submissions')).toEqual(['3']);
    expect(logs.some((l) => l.includes('MATERIALS_RESOLVED assignment=' + a.assignmentId) && l.includes('source=zipcount') && l.includes('submissions=3'))).toBe(true);
  }, 90000);

  it('★W48-5 连续两个不同 assignment ⇒ 各自解析互不串味（目录与份数都按各自作业）', async () => {
    const x = await mkAssignment('X');
    const y = await mkAssignment('Y');
    mkMaterialsDir(root, x.assignmentId, { manifest: { n_submissions: 7 } });
    mkMaterialsDir(root, y.assignmentId, { manifest: { n_submissions: 3 } });
    const runs = [];
    for (const j of [{ jobId: x.jobId, aid: x.assignmentId, n: '7' }, { jobId: y.jobId, aid: y.assignmentId, n: '3' }]) {
      captured.length = 0;
      await runOnce({
        prisma, jobId: j.jobId, materialsRoot: root, dbLimit: 5,
        deviceCommand: process.execPath, deviceArgs: ['scripts/x.mjs', '--submissions', '63'],
        repoRoot: SERVER + '/..', timeoutMs: 30000, deps: { runDshGrader: makeRunner() },
      });
      const args = captured[0].args;
      runs.push({
        src: args[args.indexOf('--source-dir') + 1],
        sub: args.filter((v, i) => args[i - 1] === '--submissions'),
      });
      expect(runs[runs.length - 1].src).toBe(path.join(root, String(j.aid)));
      expect(runs[runs.length - 1].sub).toEqual([j.n]);
    }
    expect(runs[0].src).not.toBe(runs[1].src);
    expect(runs[0].sub).not.toEqual(runs[1].sub);
  }, 120000);
});
