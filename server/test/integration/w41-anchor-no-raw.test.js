/**
 * W41（R2-B16④⑤）：历史锚点无 raw ⇒ **不回填**（reason=raw_bytes_unavailable、不写任何文件）⇒ 装置自行重建不会 exit 3；
 * 消费侧走 materials-manifest 兜底并正确写分。仅测试库；探针自清理；零模型调用。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { ASSIGNMENT_MANIFEST_REL, CHECKER_FROZEN_REL, CHECKER_JSON_REL, loadAnchor, materializeAnchor } from '../../src/services/dshGradingAnchor.js';
import { consumeMeasureResults, deriveSlugMapFromRunRoot } from '../../src/services/dshCheckerConsumer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const tag = 'w41-noraw-' + Date.now();
let assignmentId = null;
let questionId = null;
const CHECKER = 'sha256:' + 'a'.repeat(64);

describe('W41 历史锚点无 raw', () => {
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
    // 模拟 t60 时期的历史锚点：只有 JSON，没有 raw（checker_raw = NULL）
    await prisma.$executeRawUnsafe('DELETE FROM grading_assignment_anchors WHERE assignment_id = ?', assignmentId);
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_assignment_anchors (assignment_id, checker_id, frozen_sha256, materials_manifest_digest, n_submissions, submissions_json, anchor_json, checker_raw, created_at, updated_at) '
      + 'VALUES (?, ?, ?, NULL, 0, CAST(? AS JSON), CAST(? AS JSON), NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))',
      assignmentId, CHECKER, 'sha256:' + '0'.repeat(64), JSON.stringify([]),
      JSON.stringify({ schema_version: 'assignment-manifest/1', assignment_id: assignmentId, checker_id: CHECKER, frozen_sha256: 'sha256:' + '0'.repeat(64), n_submissions: 0, submissions: [] }),
    );
  }, 60000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM grading_assignment_anchors WHERE assignment_id = ?', assignmentId);
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.gradingChecker.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
  }, 60000);

  it('W41-1 ★历史锚点（无 raw）⇒ materialized=false reason=raw_bytes_unavailable，且不写任何文件', async () => {
    const row = await loadAnchor({ prisma, assignmentId, checkerId: CHECKER });
    expect(row).toBeTruthy();
    expect(row.checkerRawBytes).toBe(0);   // 历史行：raw 缺失
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'w41-empty-'));
    const m = await materializeAnchor({ prisma, assignmentId, checkerId: CHECKER, runRoot: empty });
    expect(m.materialized).toBe(false);
    expect(m.reason).toBe('raw_bytes_unavailable');
    // 不写 manifest / 不写 checker ⇒ 装置按既有行为自行重建（不会 tampered ⇒ 不会 exit 3）
    expect(fs.existsSync(path.join(empty, ASSIGNMENT_MANIFEST_REL))).toBe(false);
    expect(fs.existsSync(path.join(empty, CHECKER_JSON_REL))).toBe(false);
    expect(fs.existsSync(path.join(empty, CHECKER_FROZEN_REL))).toBe(false);
    fs.rmSync(empty, { recursive: true, force: true });
  }, 60000);

  it('W41-2 ★无 raw 场景消费成功：map_reason=materials_manifest + 分数正确写入', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w41-run-'));
    fs.mkdirSync(path.join(root, 'materials'), { recursive: true });
    fs.writeFileSync(path.join(root, 'materials', 'materials-manifest.json'), JSON.stringify({
      schema_version: 'materials-manifest/1',
      submissions: [{ id: tag + '-real1', slug: 's01' }, { id: tag + '-real2', slug: 's02' }],
    }));
    const stub = spawnSync(process.execPath, [STUB], {
      encoding: 'utf8',
      env: { ...process.env, GRADER_RUN_ROOT: root, STUB_MODE: 'ok', STUB_SLUG: '1', STUB_SUBMISSIONS: 's01,s02', STUB_SCORE: '71' },
    });
    expect(stub.status).toBe(0);
    const am = path.join(root, ASSIGNMENT_MANIFEST_REL);
    if (fs.existsSync(am)) fs.rmSync(am); // 模拟「未回填」的 run-root
    const info = await deriveSlugMapFromRunRoot({ prisma, runRoot: root, assignmentId });
    expect(info.reason).toBe('materials_manifest');
    const consumed = await consumeMeasureResults({ prisma, runRoot: root, assignmentId, mapInfo: info });
    expect(consumed.written).toBe(2);
    const subs = await prisma.submission.findMany({ where: { assignmentId }, select: { aiScore: true } });
    expect(subs.map((s) => s.aiScore).sort()).toEqual([71, 71]);
    fs.rmSync(root, { recursive: true, force: true });
  }, 90000);
});
