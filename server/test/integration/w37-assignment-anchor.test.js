/**
 * W37（R2-B14①②）：作业锚点的持久化与回填（含 FROZEN_SHA256 恢复断言）。仅测试库；自建探针并清理。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import prisma from '../../src/utils/prisma.js';
import { ASSIGNMENT_MANIFEST_REL, loadAnchor, materializeAnchor, persistAnchor, readAnchorFromRunRoot } from '../../src/infrastructure/dsh/runs/dshGradingAnchor.js';

const tag = 'w37-anchor-' + Date.now();
let assignmentId = null;
let questionId = null;
const CHECKER = 'sha256:' + 'd'.repeat(64);

function makeRunRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w37-'));
  fs.mkdirSync(path.join(root, 'out', 'assignment'), { recursive: true });
  fs.mkdirSync(path.join(root, 'materials'), { recursive: true });
  fs.writeFileSync(path.join(root, 'out', 'assignment', 'checker.frozen.json'), JSON.stringify({ checker_id: CHECKER, sections: [] }, null, 2));
  fs.writeFileSync(path.join(root, 'materials', 'materials-manifest.json'), JSON.stringify({ schema_version: 'materials-manifest/1', submissions: [{ id: tag + '-real1', slug: 's01' }, { id: tag + '-real2', slug: 's02' }] }));
  const frozenSha = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'out', 'assignment', 'checker.frozen.json'))).digest('hex');
  const anchor = {
    schema_version: 'assignment-manifest/1', assignment_id: assignmentId, checker_id: CHECKER,
    frozen_sha256: frozenSha,
    materials_manifest_digest: 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'materials', 'materials-manifest.json'))).digest('hex'),
    n_submissions: 2,
    submissions: [{ slug: 's01', id: tag + '-real1' }, { slug: 's02', id: tag + '-real2' }],
    mode: 'measure-only-reuse',
  };
  fs.writeFileSync(path.join(root, ASSIGNMENT_MANIFEST_REL), JSON.stringify(anchor, null, 2));
  return { root, anchor, frozenSha };
}

describe('W37 作业锚点', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    await prisma.$executeRawUnsafe('DELETE FROM grading_assignment_anchors WHERE assignment_id = ?', assignmentId);
  }, 60000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM grading_assignment_anchors WHERE assignment_id = ?', assignmentId);
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
  }, 30000);

  it('W37-1 ★入库时持久化锚点（frozen_sha256 / materials_manifest_digest / n_submissions / submissions）', async () => {
    const { root, anchor, frozenSha } = makeRunRoot();
    const saved = await persistAnchor({ prisma, assignmentId, checkerId: CHECKER, runRoot: root });
    expect(saved.persisted).toBe(true);
    expect(saved.frozenSha256).toBe(frozenSha);
    expect(saved.nSubmissions).toBe(2);
    const row = await loadAnchor({ prisma, assignmentId, checkerId: CHECKER });
    expect(row).toBeTruthy();
    expect(row.frozenSha256).toBe(frozenSha);
    expect(row.materialsManifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(row.nSubmissions).toBe(2);
    expect(row.submissionsJson).toEqual(anchor.submissions);
    expect(row.anchorJson).toEqual(anchor);
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);

  it('W37-2 ★复用回填：空 run-root ⇒ 锚点写回 out/assignment/assignment-manifest.json，frozen_sha256 与装置口径一致', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'w37-empty-'));
    const m = await materializeAnchor({ prisma, assignmentId, checkerId: CHECKER, runRoot: empty });
    expect(m.materialized).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(empty, ASSIGNMENT_MANIFEST_REL), 'utf8'));
    expect(written.frozen_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(written.frozen_sha256).not.toBe('na');
    expect(written.checker_id).toBe(CHECKER);
    expect(written.submissions).toHaveLength(2);
    const row = await loadAnchor({ prisma, assignmentId, checkerId: CHECKER });
    expect(written).toEqual(row.anchorJson);
    fs.rmSync(empty, { recursive: true, force: true });
  }, 60000);

  it('W37-3 无锚点（历史数据）⇒ materialized=false reason=no_persisted_anchor（明确记录，不静默装成功）', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w37-none-'));
    const m = await materializeAnchor({ prisma, assignmentId, checkerId: 'sha256:' + 'e'.repeat(64), runRoot: root });
    expect(m.materialized).toBe(false);
    expect(m.reason).toBe('no_persisted_anchor');
    expect(fs.existsSync(path.join(root, ASSIGNMENT_MANIFEST_REL))).toBe(false);
    expect(readAnchorFromRunRoot(root).anchor).toBe(null);
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);
});
