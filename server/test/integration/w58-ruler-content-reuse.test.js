/**
 * W58（R2-B35）：尺子内容化的**服务层**行为（真实测试库 + 真实标准包目录）。
 *
 * 覆盖 T1 验收：
 *  ① 首次：抢占 building ⇒ 造尺一次 ⇒ ready + 首次绑定；
 *  ② 同内容第二次触发（**跨班/跨教师**）⇒ ★命中复用、零模型调用（buildFn 探针 + RULER_REUSE_HIT 日志）；
 *  ③ 不同内容 ⇒ 新尺（新 content_key + 新 ruler 行，互不覆盖）；
 *  ④ 并发同内容 ⇒ 只造一把（等待者不写库），等待超时 ⇒ fail-closed；
 *  ⑤ ★改内容后：老作业分数与绑定**逐字段不变**（老快照冻结 ⇒ 老 key 不变；新布置 ⇒ 新尺）；
 *  ⑥ 造尺失败 ⇒ status=failed + 原因留痕；复用方 fail-closed（不产出分数）；
 *  ⑦ 已有绑定与当前内容不一致 ⇒ fail-closed + RULER_BIND_CONFLICT 留痕（绝不静默换尺）。
 * 仅测试库；探针自清理（ruler/binding 无外键，按 content_key/assignment 精确删除）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import prisma from '../../src/utils/prisma.js';
import { sha256Hex, standardDirDigest, UPLOADS_ROOT_ENV, rubricContentSha256 } from '../../src/infrastructure/dsh/ruler/dshRulerContentKey.js';
import {
  bindResolvedRuler, completeClaimedRuler, failClaimedRuler, loadBoundRuler, resolveAssignmentContent,
  resolveRulerForAssignment,
} from '../../src/infrastructure/dsh/ruler/dshRulerAssignment.js';
import { findRulerByContentKey } from '../../src/infrastructure/dsh/ruler/dshRulerStore.js';

const TAG = 'w58-ruler-' + Date.now();
const uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w58-ruler-uploads-'));
const prevUploadsEnv = process.env[UPLOADS_ROOT_ENV];
const cleanup = { assignmentIds: [], questionIds: [], userIds: [], contentKeys: new Set() };

function mkLog() {
  const lines = [];
  const rec = (...a) => { lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
  return { lines, log: rec, warn: rec, info: rec, error: rec, has: (needle) => lines.some((l) => l.includes(needle)) };
}

/** 造一道 project 题 + 标准包目录（内容指纹的第三个组成：zip 字节 sha） */
async function mkQuestion({ material = '题材', title = TAG + '-q' } = {}) {
  const teacher = await prisma.user.create({ data: { username: TAG + '-t' + Date.now() + Math.floor(Math.random() * 1e6), password: 'x', role: 'teacher', realName: TAG } });
  cleanup.userIds.push(teacher.id);
  const q = await prisma.question.create({ data: { teacherId: teacher.id, title, type: 'project', difficulty: 'medium', material, scoringRubric: 'placeholder', maxScore: 100 } });
  cleanup.questionIds.push(q.id);
  const dir = path.join(uploadsRoot, 'project-questions', String(q.id), 'standard');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', '..', 'pkg.txt'), 'package');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha');
  return { teacher, q, dir };
}

/** 建作业 + 发布冻结快照（standard_hash 形状与真实写入点一致：'sha256:<dirDigest>'） */
async function mkAssignment({ teacherId, questionId, rubric, material = '题材', suffix = '' }) {
  const a = await prisma.assignment.create({ data: { teacherId, title: TAG + suffix, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
  cleanup.assignmentIds.push(a.id);
  await prisma.assignmentQuestion.create({
    data: {
      assignmentId: a.id, questionId, sortOrder: 1,
      rubricSnapshot: { rubric, rubricItems: null, rubricSha256: rubricContentSha256(rubric), capturedAt: new Date().toISOString() },
      materialSnapshot: material,
      standardHash: 'sha256:' + 'a'.repeat(64), // 真实形状（sha256:<hex>），非 bare hex
      snapshotOrigin: 'publish',
    },
  });
  return a.id;
}

/** 造「装置口径一致」的 checker 原始字节（rubric_hash/standard_hash 与当前内容同源 ⇒ 可被复用/采纳校验通过） */
function mkCheckerRaw({ rubric, standardDigest, ignore = ['node_modules/**'], checkerId = 'sha256:' + crypto.randomBytes(32).toString('hex') }) {
  const doc = {
    schema_version: 'checker/1',
    checker_id: checkerId,
    assignment_ref: { assignment_id: 'w58', question_id: 'w58', rubric_hash: rubricContentSha256(rubric), standard_hash: standardDigest },
    generated: { session_id: 'w58', model: 'none', created_at: new Date().toISOString(), generator: 'w58' },
    scoring: { max_score: 100, aggregate: 'sum_clamped', rounding: 'half_up_1', zero_credit_rule: 'missing_required_path' },
    input_contract: { project_root_glob: '**/package.json', required_paths: ['a.txt'], ignore, encoding: 'utf-8' },
    predicates: [],
  };
  return Buffer.from(JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

async function deleteRulersFor(keys) {
  for (const k of keys) {
    if (!k) continue;
    await prisma.$executeRawUnsafe('DELETE FROM grading_rulers WHERE content_key = ?', k);
  }
}

describe('W58 尺子内容化（解析/复用/并发/绑定不可变）', () => {
  let t1; let q1; let stdDir1;
  const A = {};

  beforeAll(async () => {
    process.env[UPLOADS_ROOT_ENV] = uploadsRoot;
    t1 = await mkQuestion();
    q1 = t1.q; stdDir1 = t1.dir;
    const teacher2 = await prisma.user.create({ data: { username: TAG + '-t2', password: 'x', role: 'teacher', realName: TAG + '2' } });
    cleanup.userIds.push(teacher2.id);
    A.a1 = await mkAssignment({ teacherId: t1.teacher.id, questionId: q1.id, rubric: '评分标准 C1', suffix: '-1' });
    A.a2 = await mkAssignment({ teacherId: teacher2.id, questionId: q1.id, rubric: '评分标准 C1', suffix: '-2' }); // 跨教师同内容
    A.a3 = await mkAssignment({ teacherId: t1.teacher.id, questionId: q1.id, rubric: '评分标准 C2(改过)', suffix: '-3' });
    // 预清理：同内容的历史尺子（上一轮失败遗留会让「首次 claim」变成 reuse ⇒ 假绿/假红）
    for (const aid of [A.a1, A.a2, A.a3]) {
      const c = await resolveAssignmentContent({ prisma, assignmentId: aid, uploadsRoot });
      if (c.ok) { cleanup.contentKeys.add(c.contentKey); await deleteRulersFor([c.contentKey]); }
      await prisma.$executeRawUnsafe('DELETE FROM assignment_question_rulers WHERE assignment_id = ?', aid);
    }
  }, 60000);

  afterAll(async () => {
    for (const aid of cleanup.assignmentIds) {
      await prisma.$executeRawUnsafe('DELETE FROM assignment_question_rulers WHERE assignment_id = ?', aid);
    }
    await deleteRulersFor([...cleanup.contentKeys]);
    await prisma.submission.deleteMany({ where: { assignmentId: { in: cleanup.assignmentIds } } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: cleanup.assignmentIds } } });
    await prisma.assignment.deleteMany({ where: { id: { in: cleanup.assignmentIds } } });
    await prisma.question.deleteMany({ where: { id: { in: cleanup.questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
    if (prevUploadsEnv === undefined) delete process.env[UPLOADS_ROOT_ENV]; else process.env[UPLOADS_ROOT_ENV] = prevUploadsEnv;
    fs.rmSync(uploadsRoot, { recursive: true, force: true });
  }, 60000);

  it('W58-1 ★首次：抢占 building ⇒ 造尺一次 ⇒ ready + 首次绑定（content_key 落库、checker_raw 原始字节入库）', async () => {
    const c = await resolveAssignmentContent({ prisma, assignmentId: A.a1, uploadsRoot });
    expect(c.ok).toBe(true);
    cleanup.contentKeys.add(c.contentKey);
    const spy = mkLog();
    const r = await resolveRulerForAssignment({ prisma, assignmentId: A.a1, questionId: c.questionId, mode: 'build', log: spy });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('claimed_here');
    expect(r.needsBuild).toBe(true);
    expect(spy.has('RULER_BUILDING_CLAIMED')).toBe(true);
    const raw = mkCheckerRaw({ rubric: c.content.rubric, standardDigest: standardDirDigest(stdDir1, ['node_modules/**']) });
    const checkerId = JSON.parse(raw.toString('utf8')).checker_id;
    const done = await completeClaimedRuler({ prisma, contentKey: c.contentKey, checkerId, frozenSha256: 'sha256:' + sha256Hex(raw), checkerRaw: raw, sourceRunId: 991 });
    expect(done.ok).toBe(true);
    const ruler = await findRulerByContentKey(prisma, c.contentKey);
    expect(ruler.status).toBe('ready');
    expect(ruler.checkerId).toBe(checkerId);
    expect(ruler.frozenSha256).toBe('sha256:' + sha256Hex(raw));
    expect(ruler.checkerRaw.toString('utf8')).toBe(raw.toString('utf8')); // ★原始字节逐位一致
    expect(ruler.checkerRawSha256).toBe('sha256:' + sha256Hex(raw));
    expect(ruler.sourceRunId).toBe(991);
    const b = await bindResolvedRuler({ prisma, assignmentId: A.a1, questionId: c.questionId, ruler, contentKey: c.contentKey, log: spy });
    expect(b.ok).toBe(true);
    expect(b.created).toBe(true);
    expect(spy.has('RULER_BOUND')).toBe(true);
    const bound = await loadBoundRuler({ prisma, assignmentId: A.a1, questionId: c.questionId, contentKey: c.contentKey });
    expect(bound.ruler.id).toBe(ruler.id);
    expect(bound.consistent).toBe(true);
  }, 60000);

  it('W58-2 ★同内容第二次触发（跨教师/跨作业）⇒ 命中复用、零模型调用（buildFn 探针 + RULER_REUSE_HIT）', async () => {
    const c = await resolveAssignmentContent({ prisma, assignmentId: A.a2, uploadsRoot });
    expect(c.ok).toBe(true);
    const spy = mkLog();
    let buildCalls = 0;
    const r = await resolveRulerForAssignment({
      prisma, assignmentId: A.a2, questionId: c.questionId, mode: 'build', log: spy,
      buildFn: async () => { buildCalls += 1; throw new Error('绝不该造尺'); }, claimOnly: false,
    });
    expect(buildCalls).toBe(0); // ★零造尺（探针：命中即不调用任何造尺函数）
    expect(r.ok).toBe(true);
    expect(r.status).toBe('reuse');
    expect(r.zeroLlm).toBe(true);
    expect(r.ruler.status).toBe('ready');
    expect(spy.has('RULER_REUSE_HIT')).toBe(true); // ★日志断言
    expect(spy.has('checker_id=')).toBe(true);
    const rows = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM grading_rulers WHERE content_key = ?', c.contentKey);
    expect(Number(rows[0].n)).toBe(1); // 全库同内容只有一把尺
    // 复用同样落绑定（跨教师/跨班各自绑定同一把尺）
    const bound = await loadBoundRuler({ prisma, assignmentId: A.a2, questionId: c.questionId, contentKey: c.contentKey });
    expect(bound.ruler.id).toBe(r.ruler.id);
  }, 60000);

  it('W58-3 不同内容（改了评分标准的新布置）⇒ 新尺：新 content_key、新 ruler 行，互不覆盖', async () => {
    const c1 = await resolveAssignmentContent({ prisma, assignmentId: A.a1, uploadsRoot });
    const c3 = await resolveAssignmentContent({ prisma, assignmentId: A.a3, uploadsRoot });
    cleanup.contentKeys.add(c3.contentKey);
    expect(c3.contentKey).not.toBe(c1.contentKey);
    const spy = mkLog();
    const r = await resolveRulerForAssignment({ prisma, assignmentId: A.a3, questionId: c3.questionId, mode: 'build', log: spy });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('claimed_here');
    const raw = mkCheckerRaw({ rubric: c3.content.rubric, standardDigest: standardDirDigest(stdDir1, ['node_modules/**']) });
    await completeClaimedRuler({ prisma, contentKey: c3.contentKey, checkerId: JSON.parse(raw.toString('utf8')).checker_id, checkerRaw: raw });
    const ruler3 = await findRulerByContentKey(prisma, c3.contentKey);
    const ruler1 = await findRulerByContentKey(prisma, c1.contentKey);
    expect(ruler3.id).not.toBe(ruler1.id);
    expect(ruler1.status).toBe('ready'); // 老尺子未被覆盖
    expect(ruler1.checkerId).not.toBe(ruler3.checkerId);
  }, 60000);

  it('W58-4 ★并发同内容 ⇒ 只造一把（等待者不写库 + 超时 fail-closed）', async () => {
    const a4 = await mkAssignment({ teacherId: t1.teacher.id, questionId: q1.id, rubric: '并发内容 ' + TAG, suffix: '-4' });
    const a5 = await mkAssignment({ teacherId: t1.teacher.id, questionId: q1.id, rubric: '并发内容 ' + TAG, suffix: '-5' });
    const c4 = await resolveAssignmentContent({ prisma, assignmentId: a4, uploadsRoot });
    const c5 = await resolveAssignmentContent({ prisma, assignmentId: a5, uploadsRoot });
    expect(c4.contentKey).toBe(c5.contentKey);
    cleanup.contentKeys.add(c4.contentKey);
    await deleteRulersFor([c4.contentKey]);
    const spy = mkLog();
    const [x, y] = await Promise.all([
      resolveRulerForAssignment({ prisma, assignmentId: a4, questionId: c4.questionId, mode: 'build', log: spy, pollIntervalMs: 40, waitTimeoutMs: 400 }),
      resolveRulerForAssignment({ prisma, assignmentId: a5, questionId: c5.questionId, mode: 'build', log: spy, pollIntervalMs: 40, waitTimeoutMs: 400 }),
    ]);
    const claimed = [x, y].filter((r) => r.status === 'claimed_here');
    const waited = [x, y].filter((r) => !r.ok);
    expect(claimed).toHaveLength(1);                    // ★只造一把
    expect(waited).toHaveLength(1);                     // 另一个在等
    expect(waited[0].failClosed).toBe(true);            // 超时 ⇒ fail-closed（绝不自己造尺）
    expect(waited[0].status).toBe('wait_timeout');
    expect(spy.has('RULER_WAIT')).toBe(true);
    expect(spy.has('RULER_WAIT_TIMEOUT')).toBe(true);
    const rows = await prisma.$queryRawUnsafe('SELECT id, status FROM grading_rulers WHERE content_key = ?', c4.contentKey);
    expect(rows).toHaveLength(1);                       // ★等待者不写库（表里只有 1 行）
    expect(rows[0].status).toBe('building');
    // 等待者未绑定任何尺子
    const bindRows = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM assignment_question_rulers WHERE assignment_id IN (?,?)', a4, a5);
    expect(Number(bindRows[0].n)).toBe(0);
    // 拥有者造完 ⇒ 第三个调用者命中复用
    const raw = mkCheckerRaw({ rubric: c4.content.rubric, standardDigest: standardDirDigest(stdDir1, ['node_modules/**']) });
    await completeClaimedRuler({ prisma, contentKey: c4.contentKey, checkerId: JSON.parse(raw.toString('utf8')).checker_id, checkerRaw: raw });
    const spy2 = mkLog();
    const z = await resolveRulerForAssignment({ prisma, assignmentId: a5, questionId: c5.questionId, mode: 'build', log: spy2 });
    expect(z.ok).toBe(true);
    expect(z.status).toBe('reuse');
    expect(spy2.has('RULER_REUSE_HIT')).toBe(true);
  }, 90000);

  it('W58-5 ★改内容后：老作业分数与绑定逐字段不变（新布置才造新尺）', async () => {
    // ① 老作业 a1 已出分（分数与其当时所用尺子绑定）
    const c1 = await resolveAssignmentContent({ prisma, assignmentId: A.a1, uploadsRoot });
    const rulerBefore = await findRulerByContentKey(prisma, c1.contentKey);
    const stud = await prisma.user.create({ data: { username: TAG + '-stu1', password: 'x', role: 'student', realName: TAG + ' 甲' } });
    cleanup.userIds.push(stud.id);
    const sub = await prisma.submission.create({
      data: {
        assignmentId: A.a1, questionId: q1.id, studentId: stud.id, status: 'ai_graded', aiScore: 88,
        checkerId: rulerBefore.checkerId, canonicalSha256: 'sha256:' + 'c'.repeat(64), aiFeedback: JSON.stringify({ source: 'dsh-checker', score_int: 88 }),
      },
    });
    const subCols = ['id', 'assignmentId', 'questionId', 'studentId', 'aiScore', 'checkerId', 'canonicalSha256', 'aiFeedback', 'status'];
    const before = await prisma.submission.findUnique({ where: { id: sub.id } });
    const bindBefore = await loadBoundRuler({ prisma, assignmentId: A.a1, questionId: c1.questionId, contentKey: c1.contentKey });
    expect(bindBefore.ruler.id).toBe(rulerBefore.id);

    // ② 改评分标准与题目内容（**活值**改动；老作业的快照是发布冻结的，不随之变化）
    await prisma.question.update({ where: { id: q1.id }, data: { scoringRubric: '评分标准 C1 改版', material: '题材改版' } });
    // ③ 新布置（新作业 a3 已是「改过 rubric 的新快照」；再建一个改过材料的新布置 a6）
    const a6 = await mkAssignment({ teacherId: t1.teacher.id, questionId: q1.id, rubric: '评分标准 C1', material: '题材改版', suffix: '-6' });
    const c6 = await resolveAssignmentContent({ prisma, assignmentId: a6, uploadsRoot });
    cleanup.contentKeys.add(c6.contentKey);
    expect(c6.contentKey).not.toBe(c1.contentKey); // 改了题目描述 ⇒ 新布置新 key

    // ④ 老作业再次解析：内容指纹与绑定**不变**（仍解析到老尺子，复用、零 LLM）
    const c1again = await resolveAssignmentContent({ prisma, assignmentId: A.a1, uploadsRoot });
    expect(c1again.contentKey).toBe(c1.contentKey);
    const spy = mkLog();
    const rr = await resolveRulerForAssignment({ prisma, assignmentId: A.a1, questionId: c1again.questionId, mode: 'reuse', log: spy });
    expect(rr.ok).toBe(true);
    expect(rr.ruler.id).toBe(rulerBefore.id);
    expect(spy.has('RULER_REUSE_HIT')).toBe(true);

    // ⑤ 逐字段断言：老 submissions 行、老绑定、老尺子行都没变
    const after = await prisma.submission.findUnique({ where: { id: sub.id } });
    for (const col of subCols) expect(after[col]).toEqual(before[col]);
    const bindAfter = await loadBoundRuler({ prisma, assignmentId: A.a1, questionId: c1.questionId, contentKey: c1.contentKey });
    expect(bindAfter.binding.rulerId).toBe(bindBefore.binding.rulerId);
    expect(String(bindAfter.binding.boundAt)).toBe(String(bindBefore.binding.boundAt));
    const rulerAfter = await findRulerByContentKey(prisma, c1.contentKey);
    expect(rulerAfter.id).toBe(rulerBefore.id);
    expect(rulerAfter.status).toBe('ready');
    expect(rulerAfter.checkerId).toBe(rulerBefore.checkerId);
    expect(rulerAfter.frozenSha256).toBe(rulerBefore.frozenSha256);
    expect(rulerAfter.checkerRawSha256).toBe(rulerBefore.checkerRawSha256);
    // ⑥ 新布置要造新尺（不是复用老尺）
    const spy6 = mkLog();
    const r6 = await resolveRulerForAssignment({ prisma, assignmentId: a6, questionId: c6.questionId, mode: 'build', log: spy6 });
    expect(r6.status).toBe('claimed_here');
    const raw6 = mkCheckerRaw({ rubric: c6.content.rubric, standardDigest: standardDirDigest(stdDir1, ['node_modules/**']) });
    await completeClaimedRuler({ prisma, contentKey: c6.contentKey, checkerId: JSON.parse(raw6.toString('utf8')).checker_id, checkerRaw: raw6 });
    const ruler6 = await findRulerByContentKey(prisma, c6.contentKey);
    expect(ruler6.id).not.toBe(rulerBefore.id);
  }, 90000);

  it('W58-6 ★造尺失败 ⇒ status=failed + 原因留痕；复用方 fail-closed（不产出分数）', async () => {
    const a7 = await mkAssignment({ teacherId: t1.teacher.id, questionId: q1.id, rubric: '失败路径 ' + TAG, suffix: '-7' });
    const c7 = await resolveAssignmentContent({ prisma, assignmentId: a7, uploadsRoot });
    cleanup.contentKeys.add(c7.contentKey);
    await deleteRulersFor([c7.contentKey]);
    const spy = mkLog();
    let calls = 0;
    const r = await resolveRulerForAssignment({
      prisma, assignmentId: a7, questionId: c7.questionId, mode: 'build', log: spy,
      buildFn: async () => { calls += 1; throw new Error('装置造尺失败(夹具)'); }, claimOnly: false,
    });
    expect(calls).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.status).toBe('failed');
    expect(r.reason).toContain('装置造尺失败');
    expect(spy.has('RULER_BUILD_FAILED')).toBe(true);
    const failed = await findRulerByContentKey(prisma, c7.contentKey);
    expect(failed.status).toBe('failed');
    expect(String(failed.lastError)).toContain('装置造尺失败');
    // 复用方（等待者/消费方）⇒ fail-closed，且不再造尺
    const spy2 = mkLog();
    const r2 = await resolveRulerForAssignment({ prisma, assignmentId: a7, questionId: c7.questionId, mode: 'reuse', log: spy2 });
    expect(r2.ok).toBe(false);
    expect(r2.failClosed).toBe(true);
    expect(r2.reason).toContain('ruler_failed');
    expect(spy2.has('RULER_WAIT_FAILED')).toBe(true);
    // 绑定不产生
    const binds = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM assignment_question_rulers WHERE assignment_id = ?', a7);
    expect(Number(binds[0].n)).toBe(0);
  }, 60000);

  it('W58-7 ★已有绑定与当前内容不一致 ⇒ fail-closed + RULER_BIND_CONFLICT 留痕（不静默换尺）', async () => {
    const a8 = await mkAssignment({ teacherId: t1.teacher.id, questionId: q1.id, rubric: '绑定冲突 ' + TAG, suffix: '-8' });
    const a9 = await mkAssignment({ teacherId: t1.teacher.id, questionId: q1.id, rubric: '绑定冲突-另一内容 ' + TAG, suffix: '-9' });
    const c8 = await resolveAssignmentContent({ prisma, assignmentId: a8, uploadsRoot });
    const c9 = await resolveAssignmentContent({ prisma, assignmentId: a9, uploadsRoot });
    cleanup.contentKeys.add(c8.contentKey); cleanup.contentKeys.add(c9.contentKey);
    await deleteRulersFor([c8.contentKey, c9.contentKey]);
    // 两把尺（内容不同）
    const r8 = await resolveRulerForAssignment({ prisma, assignmentId: a8, questionId: c8.questionId, mode: 'build', log: mkLog() });
    const raw8 = mkCheckerRaw({ rubric: c8.content.rubric, standardDigest: standardDirDigest(stdDir1, ['node_modules/**']) });
    await completeClaimedRuler({ prisma, contentKey: c8.contentKey, checkerId: JSON.parse(raw8.toString('utf8')).checker_id, checkerRaw: raw8 });
    const ruler8 = await findRulerByContentKey(prisma, c8.contentKey);
    const r9 = await resolveRulerForAssignment({ prisma, assignmentId: a9, questionId: c9.questionId, mode: 'build', log: mkLog() });
    const raw9 = mkCheckerRaw({ rubric: c9.content.rubric, standardDigest: standardDirDigest(stdDir1, ['node_modules/**']) });
    await completeClaimedRuler({ prisma, contentKey: c9.contentKey, checkerId: JSON.parse(raw9.toString('utf8')).checker_id, checkerRaw: raw9 });
    const ruler9 = await findRulerByContentKey(prisma, c9.contentKey);
    expect(r8.status).toBe('claimed_here');
    expect(r9.status).toBe('claimed_here');
    // 先建立合法绑定（a8 ⇒ ruler8），再人为改成「内容不同」的 ruler9 ⇒ 模拟历史绑定与当前内容不一致
    const okBind = await bindResolvedRuler({ prisma, assignmentId: a8, questionId: c8.questionId, ruler: ruler8, contentKey: c8.contentKey, log: mkLog() });
    expect(okBind.ok).toBe(true);
    const upd = await prisma.$executeRawUnsafe('UPDATE assignment_question_rulers SET ruler_id = ? WHERE assignment_id = ?', ruler9.id, a8);
    expect(Number(upd)).toBe(1);
    const spy = mkLog();
    const bad = await resolveRulerForAssignment({ prisma, assignmentId: a8, questionId: c8.questionId, mode: 'reuse', log: spy });
    expect(bad.ok).toBe(false);
    expect(bad.failClosed).toBe(true);
    expect(bad.reason).toBe('bind_conflict');
    expect(spy.has('RULER_BIND_CONFLICT')).toBe(true);
    // 绑定未被静默改写；也未新建尺子
    const bindRow = await prisma.$queryRawUnsafe('SELECT ruler_id FROM assignment_question_rulers WHERE assignment_id = ?', a8);
    expect(Number(bindRow[0].ruler_id)).toBe(ruler9.id);
    const n = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM grading_rulers WHERE content_key = ?', c8.contentKey);
    expect(Number(n[0].n)).toBe(1);
  }, 90000);
});
