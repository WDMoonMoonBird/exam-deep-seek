/**
 * W47（R2-B20）：物料导出端到端 —— 布局符合装置契约、确定性、只读、护栏、无 secrets、CLI 实测。
 * 夹具自带 uploads 根（--uploads-root 重定位）⇒ 不改动 server/uploads/**，不写生产。
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { DEVICE_NAMES, EXPORT_MANIFEST_NAME, exportMaterials } from '../../scripts/r2b20-export-materials.mjs';
import { readZipEntries } from '../../src/infrastructure/execution/deterministic-zip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const CLI = path.join(SERVER, 'scripts/r2b20-export-materials.mjs');
const tag = 'w47-export-' + Date.now();
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function tree(dir) {
  const out = [];
  const walk = (d) => { for (const it of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const abs = path.join(d, it.name); if (it.isDirectory()) walk(abs); else out.push(path.relative(dir, abs) + ':' + fs.statSync(abs).size); } };
  walk(dir);
  return out;
}

describe('W47 物料导出端到端', () => {
  let fixtureRoot = null;
  let out1 = null;
  let out2 = null;
  let assignmentId = null;
  let questionId = null;
  let studentA = null;
  let studentB = null;

  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag + '-题目', type: 'project', difficulty: 'medium', material: '实现一个宠物管理程序。', scoringRubric: '正确性 60 分；结构 40 分。', maxScore: 100, attachmentUrl: 'project-questions/' + 0 + '/standard' } });
    questionId = q.id;
    await prisma.question.update({ where: { id: questionId }, data: { attachmentUrl: 'project-questions/' + questionId + '/standard' } });
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag + '-作业', startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    // 两位同名同学（触发 -username 后缀）
    studentA = await prisma.user.create({ data: { username: tag + '001', password: 'x', role: 'student', realName: '同名同学' } });
    studentB = await prisma.user.create({ data: { username: tag + '002', password: 'x', role: 'student', realName: '同名同学' } });
    await prisma.submission.create({ data: { assignmentId, questionId, studentId: studentA.id, status: 'submitted' } });
    await prisma.submission.create({ data: { assignmentId, questionId, studentId: studentB.id, status: 'submitted' } });

    // 夹具 uploads 根（不改 server/uploads）
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w47-up-'));
    const std = path.join(fixtureRoot, 'project-questions', String(questionId), 'standard');
    fs.mkdirSync(path.join(std, 'pet', 'src'), { recursive: true });
    fs.writeFileSync(path.join(std, 'README.md'), '# 标准工程包\n');
    fs.writeFileSync(path.join(std, 'pet', 'src', 'Main.java'), 'class Main {}\n');
    for (const s of [studentA, studentB]) {
      const dir = path.join(fixtureRoot, 'project-submissions', String(questionId), String(s.id), 'v1');
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'Main.java'), 'class Main { /* ' + s.username + ' */ }\n');
    }
    out1 = fs.mkdtempSync(path.join(os.tmpdir(), 'w47-out1-'));
    out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'w47-out2-'));
  }, 90000);

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
    for (const d of [fixtureRoot, out1, out2]) if (d) fs.rmSync(d, { recursive: true, force: true });
  }, 60000);

  it('★W47-1 布局符合装置契约（三必备名 + N 个 <real_name>.zip + 审计清单）', async () => {
    const res = await exportMaterials({ prisma, assignmentId, outDir: out1, uploadsRoot: fixtureRoot });
    expect(res.ok).toBe(true);
    expect(res.n).toBe(2);
    expect(res.questionId).toBe(questionId);
    const files = fs.readdirSync(out1).sort();
    for (const n of Object.values(DEVICE_NAMES)) expect(files).toContain(n);
    expect(files).toContain(EXPORT_MANIFEST_NAME);
    expect(files).toContain('同名同学.zip');
    expect(files).toContain('同名同学-' + studentB.username + '.zip');
    expect(files.filter((f) => f.endsWith('.zip'))).toHaveLength(3);   // 标准包 + 2 份提交
    // 装置读取路径等价：标准包与学生 zip 都能被解析，且学生 zip 保留工程内布局
    const stdEntries = readZipEntries(fs.readFileSync(path.join(out1, DEVICE_NAMES.standard))).map((e) => e.name);
    expect(stdEntries).toContain('README.md');
    expect(stdEntries).toContain('pet/src/Main.java');
    const stu = readZipEntries(fs.readFileSync(path.join(out1, '同名同学.zip'))).map((e) => e.name);
    expect(stu).toEqual(['src/Main.java']);
    // 审计清单字段
    const man = JSON.parse(fs.readFileSync(path.join(out1, EXPORT_MANIFEST_NAME), 'utf8'));
    expect(man.question_id).toBe(questionId);
    expect(man.assignment_id).toBe(assignmentId);
    expect(man.n_submissions).toBe(2);
    expect(man.submissions.map((s) => s.zip).sort()).toEqual(['同名同学.zip', '同名同学-' + studentB.username + '.zip'].sort());
    for (const s of man.submissions) {
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(s.source).toContain(String(questionId));
      expect(s.sourceVersion).toBe('v1');
    }
    expect(man.standard.entries).toContain('README.md');
    expect(man.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, 120000);

  it('★W47-2 确定性：同输入两次导出 ⇒ 各 zip 与各 md 的 sha256 逐一相同（清单除时间戳外逐字段相同）', async () => {
    const res = await exportMaterials({ prisma, assignmentId, outDir: out2, uploadsRoot: fixtureRoot });
    expect(res.ok).toBe(true);
    const names = fs.readdirSync(out1).filter((f) => f !== EXPORT_MANIFEST_NAME).sort();
    for (const n of names) expect(sha(path.join(out2, n))).toBe(sha(path.join(out1, n)));
    const m1 = JSON.parse(fs.readFileSync(path.join(out1, EXPORT_MANIFEST_NAME), 'utf8'));
    const m2 = JSON.parse(fs.readFileSync(path.join(out2, EXPORT_MANIFEST_NAME), 'utf8'));
    delete m1.generated_at; delete m2.generated_at;
    expect(JSON.stringify(m2)).toBe(JSON.stringify(m1));
  }, 120000);

  it('★W47-3 只读：导出前后 uploads 夹具树逐项不变；无新目录落在 server/uploads', async () => {
    const before = tree(fixtureRoot);
    const out3 = fs.mkdtempSync(path.join(os.tmpdir(), 'w47-out3-'));
    const res = await exportMaterials({ prisma, assignmentId, outDir: out3, uploadsRoot: fixtureRoot });
    expect(res.ok).toBe(true);
    expect(tree(fixtureRoot)).toEqual(before);
    expect(fs.existsSync(path.join(SERVER, 'uploads', 'project-submissions', String(questionId)))).toBe(false);
    expect(fs.existsSync(path.join(SERVER, 'uploads', 'project-questions', String(questionId)))).toBe(false);
    fs.rmSync(out3, { recursive: true, force: true });
  }, 120000);

  it('★W47-4 无 secrets：导出物与清单不含明文凭据', async () => {
    for (const f of fs.readdirSync(out1)) {
      if (!f.endsWith('.json') && !f.endsWith('.md')) continue;
      const text = fs.readFileSync(path.join(out1, f), 'utf8');
      expect(text).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
      expect(text).not.toMatch(/password\s*[:=]/i);
      expect(text).not.toMatch(/mysql:\/\//);
    }
  }, 60000);

  it('★W47-5 CLI 护栏：生产 URL 缺双开关 ⇒ rc=2 且连接前拒绝（无 EXPORT_TARGET）', () => {
    const r = spawnSync(process.execPath, [CLI, '--assignment', String(assignmentId), '--out', '/tmp/w47-should-not-write', '--db-url', 'mysql://u:p@127.0.0.1:3306/exam_system'], { encoding: 'utf8', timeout: 60000 });
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('EXPORT_FAIL reason=allow_db_required:exam_system');
    expect(r.stdout).not.toContain('EXPORT_TARGET');
    expect(fs.existsSync('/tmp/w47-should-not-write')).toBe(false);
  }, 90000);

  it('★W47-6 CLI 实测（测试库 + 夹具 uploads 根）⇒ EXPORT_OK n=2', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'w47-cli-'));
    const r = spawnSync(process.execPath, [CLI, '--assignment', String(assignmentId), '--out', out, '--uploads-root', fixtureRoot], { encoding: 'utf8', timeout: 120000, env: { ...process.env } });
    const joined = (r.stdout || '') + (r.stderr || '');
    expect(joined).toContain('EXPORT_TARGET db=exam_system_test');
    expect(joined).toMatch(/EXPORT_OK n=2 question=\d+ standard_sha256=[0-9a-f]{64} rubric_len=\d+/);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(out, DEVICE_NAMES.assignment))).toBe(true);
    fs.rmSync(out, { recursive: true, force: true });
  }, 150000);
});
