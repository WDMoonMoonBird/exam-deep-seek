/**
 * W16（R2-B4b / F-R2C4-1）：装置真实产物（submission.id = slug）经平台消费 ⇒
 * 要么**真写分**、要么 needs_rerun；written 必须等于 DB 实际更新行数（绝不假成功）。
 * 另覆盖 F-R2C4-2：小数分 62.5 的原始分可追溯（aiFeedback.raw_score）。
 * 仅测试库；自建探针行并在 afterAll 清理。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { consumeChecker, consumeMeasureResults } from '../../src/infrastructure/dsh/checker/dshCheckerConsumer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const REPO = path.resolve(SERVER, '..');
const FIXTURE = path.join(SERVER, 'scripts', 'fixtures', 'checker.sample.json');

const tag = 'w16-slug-' + Date.now();
let assignmentId = null;
let questionId = null;
let teacherId = null;
let studentIds = [];
let realNames = [];

function makeRunRoot({ slugs, manifestIds, score }) {
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w16-runroot-'));
  const checkerDir = path.join(runRoot, 'out', 'checker');
  const measureDir = path.join(runRoot, 'out', 'measure');
  fs.mkdirSync(checkerDir, { recursive: true });
  fs.mkdirSync(measureDir, { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(checkerDir, 'checker.json'));
  const checker = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  slugs.forEach((slug, i) => {
    fs.writeFileSync(path.join(measureDir, slug + '.json'), JSON.stringify({
      schema_version: 'checker-result/1',
      checker_id: checker.checker_id,
      canonical_sha256: 'sha256:' + String(i + 1).repeat(64).slice(0, 64),
      submission: { id: slug, root_rel: '.', digest: 'sha256:' + 'a'.repeat(64), file_count: 5 },
      totals: { score, max_score: checker.scoring.max_score, aggregate: checker.scoring.aggregate },
      items: [{ id: 'p1', score, max_score: checker.scoring.max_score, comment: 'ok' }],
      reconciliation: { expected_items: 1, evaluated_items: 1, unsupported: [], errors: [] },
      stale: false, run_meta: { exit_code: 0 },
    }));
  });
  fs.mkdirSync(path.join(runRoot, 'out', 'assignment'), { recursive: true });
  fs.writeFileSync(path.join(runRoot, 'out', 'assignment', 'assignment-manifest.json'), JSON.stringify({
    schema_version: 'assignment-manifest/1',
    assignment_id: String(assignmentId),
    submissions: slugs.map((slug, i) => ({ slug, id: manifestIds[i] || '' })),
  }));
  return runRoot;
}

describe('W16 真实产物（slug）消费', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    teacherId = teacher.id;
    const q = await prisma.question.create({ data: { teacherId, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    for (let i = 0; i < 2; i++) {
      const u = await prisma.user.create({ data: { username: tag + '-stu' + i, password: 'x', role: 'student', realName: tag + '-real' + i } });
      studentIds.push(u.id);
      realNames.push(u.realName);
      await prisma.submission.create({ data: { assignmentId, questionId, studentId: u.id, status: 'submitted' } });
    }
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { id: { in: studentIds } } });
  });

  it('W16-1 装置 slug 产物 + manifest（源 id=学生姓名）⇒ 真写分，written 等于 DB 实际更新行数', async () => {
    const runRoot = makeRunRoot({ slugs: ['s01', 's02'], manifestIds: realNames, score: 59 });
    const stored = await consumeChecker({ prisma, runRoot, assignmentId, repoRoot: REPO });
    expect(stored.ok).toBe(true);
    const out = await consumeMeasureResults({ prisma, runRoot, assignmentId });
    expect(out.mapInfo.reason).toBe('manifest');
    expect(out.written).toBe(2);
    expect(out.skipped).toHaveLength(0);
    // ★written 与 DB 实际更新行数一致
    const rows = await prisma.submission.findMany({ where: { assignmentId }, select: { id: true, aiScore: true, checkerId: true, canonicalSha256: true, gradingStale: true } });
    expect(rows.filter((r) => r.aiScore !== null)).toHaveLength(out.written);
    for (const r of rows) {
      expect(r.aiScore).toBe(59);
      expect(r.checkerId).toBe(stored.checkerId);
      expect(r.canonicalSha256).toMatch(/^sha256:/);
      expect(r.gradingStale).toBe(false);
    }
    fs.rmSync(runRoot, { recursive: true, force: true });
  });

  it('W16-2 ★不可映射（manifest 源 id 无人匹配）⇒ needs_rerun + unmapped_submission_id:<slug>，零写入', async () => {
    const runRoot = makeRunRoot({ slugs: ['s01', 's02'], manifestIds: ['无此人A', '无此人B'], score: 59 });
    const out = await consumeMeasureResults({ prisma, runRoot, assignmentId });
    expect(out.written).toBe(0);
    expect(out.skipped).toHaveLength(2);
    for (const r of out.skipped) {
      expect(r.reason).toBe('unmapped_submission_id:' + r.submissionSlug);
      expect(r.status).toBe('needs_rerun');
    }
    // 假成功反证：没有任何提交被写入 0 分/分数
    const rows = await prisma.submission.findMany({ where: { assignmentId }, select: { aiScore: true } });
    expect(rows.every((r) => r.aiScore !== null)).toBe(true); // 仍是上一用例写入的 59，未被子虚写覆盖
    fs.rmSync(runRoot, { recursive: true, force: true });
  });

  it('W16-3 F-R2C4-2：小数分 62.5 可追溯（aiFeedback.raw_score + 取整口径）', async () => {
    const runRoot = makeRunRoot({ slugs: ['s01'], manifestIds: [realNames[0]], score: 62.5 });
    const out = await consumeMeasureResults({ prisma, runRoot, assignmentId });
    expect(out.written).toBe(1);
    const row = await prisma.submission.findFirst({ where: { assignmentId, studentId: studentIds[0] }, select: { aiScore: true, aiFeedback: true } });
    expect(row.aiScore).toBe(62); // INT 列 ⇒ 截断
    expect(row.aiFeedback).toContain('62.5'); // ★原始分可追溯
    const fb = JSON.parse(row.aiFeedback);
    expect(fb.raw_score).toBe(62.5);
    expect(fb.score_int).toBe(62);
    expect(String(fb.score_rounding)).toContain('trunc');
    fs.rmSync(runRoot, { recursive: true, force: true });
  });
});
