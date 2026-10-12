/**
 * W38（R2-B14③④）：缺锚点 ⇒ 消费侧回退 materials-manifest 映射成功（map_reason=materials_manifest，分数正确写入）；
 * 两者皆缺 ⇒ 仍 manifest_missing fail-closed。仅测试库；探针自清理；零模型调用。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { consumeMeasureResults, deriveSlugMapFromRunRoot } from '../../src/services/dshCheckerConsumer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const tag = 'w38-fallback-' + Date.now();
let assignmentId = null;
let questionId = null;

function makeRunRoot({ withMaterials }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w38-'));
  fs.mkdirSync(path.join(root, 'materials'), { recursive: true });
  if (withMaterials) {
    fs.writeFileSync(path.join(root, 'materials', 'materials-manifest.json'), JSON.stringify({
      schema_version: 'materials-manifest/1',
      submissions: [{ id: tag + '-real1', slug: 's01' }, { id: tag + '-real2', slug: 's02' }],
    }));
  }
  // 用 stub 装置产出量尺产物（s01/s02），并把它自己的 checker fixture 落到 out/checker/checker.json
  const stub = spawnSync(process.execPath, [STUB], {
    encoding: 'utf8',
    env: { ...process.env, GRADER_RUN_ROOT: root, STUB_MODE: 'ok', STUB_SLUG: '1', STUB_SUBMISSIONS: 's01,s02', STUB_SCORE: '64' },
  });
  expect(stub.status).toBe(0);
  // 刻意移除 assignment-manifest（模拟复用 run-root 缺锚点）
  const am = path.join(root, 'out', 'assignment', 'assignment-manifest.json');
  if (fs.existsSync(am)) fs.rmSync(am);
  return root;
}

describe('W38 缺锚点兜底映射', () => {
  beforeAll(async () => {
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
  }, 60000);

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
  }, 60000);

  it('W38-1 ★缺锚点但有 materials-manifest ⇒ 映射成功且 map_reason=materials_manifest，分数正确写入', async () => {
    const root = makeRunRoot({ withMaterials: true });
    const info = await deriveSlugMapFromRunRoot({ prisma, runRoot: root, assignmentId });
    expect(info.reason).toBe('materials_manifest');
    expect(Object.keys(info.map)).toHaveLength(2);
    const consumed = await consumeMeasureResults({ prisma, runRoot: root, assignmentId, mapInfo: info });
    expect(consumed.rows.length).toBe(2);
    expect(consumed.written).toBe(2);
    expect(consumed.skipped.length).toBe(0);
    const subs = await prisma.submission.findMany({ where: { assignmentId }, select: { aiScore: true, checkerId: true } });
    expect(subs.map((s) => s.aiScore)).toEqual([64, 64]);
    expect(subs.every((s) => !!s.checkerId)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  }, 90000);

  it('W38-2 ★两者皆缺 ⇒ manifest_missing（fail-closed：零写入、逐份 needs_rerun）', async () => {
    await prisma.submission.updateMany({ where: { assignmentId }, data: { aiScore: null, checkerId: null, canonicalSha256: null } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    const root = makeRunRoot({ withMaterials: false });
    const info = await deriveSlugMapFromRunRoot({ prisma, runRoot: root, assignmentId });
    expect(info.reason).toBe('manifest_missing');
    expect(Object.keys(info.map)).toHaveLength(0);
    const consumed = await consumeMeasureResults({ prisma, runRoot: root, assignmentId, mapInfo: info });
    expect(consumed.written).toBe(0);
    expect(consumed.skipped.length).toBe(2);
    expect(consumed.skipped.every((r) => r.status === 'needs_rerun')).toBe(true);
    const subs = await prisma.submission.findMany({ where: { assignmentId }, select: { aiScore: true } });
    expect(subs.every((s) => s.aiScore === null)).toBe(true); // 绝不落 0 分
    fs.rmSync(root, { recursive: true, force: true });
  }, 90000);
});
