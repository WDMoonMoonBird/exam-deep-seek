/**
 * W40（R2-B16②③）：锚点原始字节的持久化与回填 —— 字节级一致（sha256 == 锚点 frozen_sha256），不得再序列化。
 * 仅测试库；自建探针并清理；零模型调用。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import prisma from '../../src/utils/prisma.js';
import { ASSIGNMENT_MANIFEST_REL, CHECKER_FROZEN_REL, CHECKER_JSON_REL, loadAnchor, materializeAnchor, persistAnchor, readAnchorFromRunRoot } from '../../src/infrastructure/dsh/runs/dshGradingAnchor.js';

const tag = 'w40-raw-' + Date.now();
let assignmentId = null;
let questionId = null;
const CHECKER = 'sha256:' + 'f'.repeat(64);
// 刻意用**紧凑单行**格式（与 DB JSON 再序列化的 pretty 输出不同 ⇒ 可区分「原样写出」与「再序列化」）
const RAW_JSON = JSON.stringify({ checker_id: CHECKER, schema_version: 'dsh-checker/1', sections: [{ id: 'P01', max_score: 10 }] });
const RAW_BYTES = Buffer.from(RAW_JSON + '\n', 'utf8');

function makeRunRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w40-'));
  fs.mkdirSync(path.join(root, 'out', 'checker'), { recursive: true });
  fs.mkdirSync(path.join(root, 'out', 'assignment'), { recursive: true });
  fs.mkdirSync(path.join(root, 'materials'), { recursive: true });
  fs.writeFileSync(path.join(root, CHECKER_JSON_REL), RAW_BYTES);
  fs.writeFileSync(path.join(root, CHECKER_FROZEN_REL), RAW_BYTES);
  fs.writeFileSync(path.join(root, 'materials', 'materials-manifest.json'), JSON.stringify({ schema_version: 'materials-manifest/1', submissions: [{ id: tag + '-r1', slug: 's01' }] }));
  const sha = 'sha256:' + crypto.createHash('sha256').update(RAW_BYTES).digest('hex');
  fs.writeFileSync(path.join(root, ASSIGNMENT_MANIFEST_REL), JSON.stringify({
    schema_version: 'assignment-manifest/1', assignment_id: assignmentId, checker_id: CHECKER,
    frozen_sha256: sha, n_submissions: 1, submissions: [{ slug: 's01', id: tag + '-r1' }], mode: 'measure-only-reuse',
  }, null, 2));
  return { root, sha };
}

describe('W40 锚点字节级回填', () => {
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

  it('W40-1 ★入库持久化 raw（bytes/sha256 与源文件一致）', async () => {
    const { root, sha } = makeRunRoot();
    const saved = await persistAnchor({ prisma, assignmentId, checkerId: CHECKER, runRoot: root });
    expect(saved.persisted).toBe(true);
    expect(saved.rawBytes).toBe(RAW_BYTES.length);
    expect(saved.rawSha256).toBe(sha);
    expect(saved.frozenSha256).toBe(sha);
    const row = await loadAnchor({ prisma, assignmentId, checkerId: CHECKER });
    expect(row.checkerRawBytes).toBe(RAW_BYTES.length);
    expect(row.checkerRawSha256).toBe(sha);
    expect(row.checkerRaw.equals(RAW_BYTES)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);

  it('W40-2 ★★回填字节级一致：run-root 内 checker 文件 sha256 == 锚点 frozen_sha256，且不做再序列化', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'w40-empty-'));
    const m = await materializeAnchor({ prisma, assignmentId, checkerId: CHECKER, runRoot: empty });
    expect(m.materialized).toBe(true);
    expect(m.shaMatchesAnchor).toBe(true);
    const plain = fs.readFileSync(path.join(empty, CHECKER_JSON_REL));
    const frozen = fs.readFileSync(path.join(empty, CHECKER_FROZEN_REL));
    const shaPlain = 'sha256:' + crypto.createHash('sha256').update(plain).digest('hex');
    const row = await loadAnchor({ prisma, assignmentId, checkerId: CHECKER });
    expect(shaPlain).toBe(row.frozenSha256);       // ★字节级：装置 frozen_intact 的依据
    expect(row.frozenSha256).not.toBe('na');
    expect(plain.equals(RAW_BYTES)).toBe(true);    // 逐字节相同
    expect(frozen.equals(RAW_BYTES)).toBe(true);
    // 反例：DB JSON 再序列化会得到不同字节 ⇒ 断言我们**没有**那样做
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(RAW_JSON), null, 2), 'utf8');
    expect(plain.equals(reserialized)).toBe(false);
    // 语义不变：checker_id 不变
    expect(JSON.parse(plain.toString('utf8')).checker_id).toBe(CHECKER);
    // manifest 的 frozen_sha256 保持锚点原值
    const man = JSON.parse(fs.readFileSync(path.join(empty, ASSIGNMENT_MANIFEST_REL), 'utf8'));
    expect(man.frozen_sha256).toBe(row.frozenSha256);
    expect(readAnchorFromRunRoot(empty).checkerRawSha256).toBe(row.frozenSha256);
    fs.rmSync(empty, { recursive: true, force: true });
  }, 60000);
});
