/**
 * W59（R2-B35）：内容化尺子的**端到端**证据 —— 老锚点复用（不重复造尺）、worker 复用（零 LLM）、
 * r2b7 造尺/复用两条路径、HTTP 触发闸（跨班/跨教师不再 409）、导出物料与指纹同源。
 * 仅测试库；探针自清理。
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { sha256Hex, standardDirDigest, UPLOADS_ROOT_ENV, rubricContentSha256 } from '../../src/services/dshRulerContentKey.js';
import { completeClaimedRuler, resolveAssignmentContent, resolveRulerForAssignment } from '../../src/services/dshRulerAssignment.js';
import { findRulerByContentKey } from '../../src/services/dshRulerStore.js';
import { exportMaterials } from '../../scripts/r2b20-export-materials.mjs';
import { authReq, getTestData, loginAsTeacher } from './helpers.js';

/** ★jest 的 process.env 是副本 ⇒ 子进程必须显式注入（否则 spawnSync 用真实 env，读不到 uploads 根） */
const childEnv = (extra = {}) => ({ ...process.env, [UPLOADS_ROOT_ENV]: uploadsRoot, ...extra });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const R2B7 = path.join(SERVER, 'scripts', 'r2b7-build-checker.mjs');
const WORKER = path.join(SERVER, 'scripts', 'r2b5-worker.mjs');
const STUB = path.join(SERVER, 'scripts', 'stub-device.mjs');
const FIXTURE = path.join(SERVER, 'scripts', 'fixtures', 'checker.sample.json');
const FIXTURE_RAW = fs.readFileSync(FIXTURE);
const FIXTURE_ID = JSON.parse(FIXTURE_RAW.toString('utf8')).checker_id;

const TAG = 'w59-ruler-' + Date.now();
const uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w59-ruler-uploads-'));
const prevUploadsEnv = process.env[UPLOADS_ROOT_ENV];
const cleanup = { assignmentIds: [], questionIds: [], userIds: [], jobIds: [], contentKeys: new Set() };

function mkLog() {
  const lines = [];
  const rec = (...a) => { lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
  return { lines, log: rec, warn: rec, info: rec, error: rec, has: (n) => lines.some((l) => l.includes(n)) };
}

async function mkQuestion(tagSuffix) {
  const teacher = await prisma.user.create({ data: { username: TAG + '-qt' + tagSuffix, password: 'x', role: 'teacher', realName: TAG } });
  cleanup.userIds.push(teacher.id);
  const q = await prisma.question.create({ data: { teacherId: teacher.id, title: TAG + tagSuffix, type: 'project', difficulty: 'medium', material: '材料' + tagSuffix, scoringRubric: '标准' + tagSuffix, maxScore: 100 } });
  cleanup.questionIds.push(q.id);
  const dir = path.join(uploadsRoot, 'project-questions', String(q.id), 'standard');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha' + tagSuffix);
  return { teacher, q, dir };
}

async function mkAssignment({ teacherId, questionId, rubric, material = '材料', suffix = '' }) {
  const a = await prisma.assignment.create({ data: { teacherId, title: TAG + suffix, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
  cleanup.assignmentIds.push(a.id);
  await prisma.assignmentQuestion.create({
    data: {
      assignmentId: a.id, questionId, sortOrder: 1,
      rubricSnapshot: { rubric, rubricItems: null, rubricSha256: rubricContentSha256(rubric), capturedAt: new Date().toISOString() },
      materialSnapshot: material,
      standardHash: 'sha256:' + 'b'.repeat(64),
      snapshotOrigin: 'publish',
    },
  });
  return a.id;
}

/** 老表锚点插入（走原始 SQL：Prisma Client 未生成 gradingAssignmentAnchor 模型） */
async function insertOldAnchor({ assignmentId, checkerId, checkerRaw, frozenSha256 }) {
  await prisma.$executeRawUnsafe(
    'INSERT INTO grading_assignment_anchors (assignment_id, checker_id, frozen_sha256, materials_manifest_digest, n_submissions, submissions_json, anchor_json, checker_raw, created_at, updated_at) '
    + 'VALUES (?, ?, ?, NULL, 0, CAST(? AS JSON), CAST(? AS JSON), ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)) '
    + 'ON DUPLICATE KEY UPDATE checker_raw = VALUES(checker_raw), frozen_sha256 = VALUES(frozen_sha256)',
    assignmentId, checkerId, frozenSha256, JSON.stringify([]), JSON.stringify({ schema_version: 'assignment-manifest/1' }), checkerRaw,
  );
}

async function deleteRulers(keys) {
  for (const k of keys) if (k) await prisma.$executeRawUnsafe('DELETE FROM grading_rulers WHERE content_key = ?', k);
}

describe('W59 尺子内容化端到端（老锚点/worker/r2b7/HTTP/导出）', () => {
  beforeAll(async () => {
    process.env[UPLOADS_ROOT_ENV] = uploadsRoot;
    await prisma.gradingChecker.deleteMany({ where: { checkerId: FIXTURE_ID } });
  }, 60000);

  afterAll(async () => {
    for (const aid of cleanup.assignmentIds) {
      await prisma.$executeRawUnsafe('DELETE FROM assignment_question_rulers WHERE assignment_id = ?', aid);
      await prisma.$executeRawUnsafe('DELETE FROM grading_assignment_anchors WHERE assignment_id = ?', aid);
      await prisma.gradingChecker.deleteMany({ where: { assignmentId: aid } });
      await prisma.gradingJob.deleteMany({ where: { assignmentId: aid } });
      await prisma.submission.deleteMany({ where: { assignmentId: aid } });
      await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: aid } });
      await prisma.assignment.deleteMany({ where: { id: aid } });
    }
    for (const jid of cleanup.jobIds) await prisma.$executeRawUnsafe('DELETE FROM grading_job_runs WHERE job_id = ?', jid);
    await deleteRulers([...cleanup.contentKeys]);
    await prisma.question.deleteMany({ where: { id: { in: cleanup.questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
    if (prevUploadsEnv === undefined) delete process.env[UPLOADS_ROOT_ENV]; else process.env[UPLOADS_ROOT_ENV] = prevUploadsEnv;
    fs.rmSync(uploadsRoot, { recursive: true, force: true });
    for (const d of fs.readdirSync('/tmp').filter((x) => x.startsWith('w59-r2b7-'))) fs.rmSync('/tmp/' + d, { recursive: true, force: true });
  }, 90000);

  it('W59-1 ★老锚点复用：同内容老锚点（老表有可用 checker+anchor）⇒ 直接采纳补建新记录，不重复造尺', async () => {
    const { teacher, q, dir } = await mkQuestion('-anchor');
    const aOld = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-anchor', material: '材料-anchor', suffix: '-anchor-old' });
    const aNew = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-anchor', material: '材料-anchor', suffix: '-anchor-new' });
    const c = await resolveAssignmentContent({ prisma, assignmentId: aNew, uploadsRoot });
    cleanup.contentKeys.add(c.contentKey);
    await deleteRulers([c.contentKey]);
    // 老表：ready checker + 锚点（原始字节）；assignment_ref 与当前内容同源（装置口径 standard_hash + rubric_hash）
    const oldCheckerId = 'sha256:' + crypto.randomBytes(32).toString('hex');
    const doc = JSON.parse(FIXTURE_RAW.toString('utf8'));
    doc.checker_id = oldCheckerId;
    doc.assignment_ref = { ...doc.assignment_ref, rubric_hash: rubricContentSha256(c.content.rubric), standard_hash: standardDirDigest(dir, (doc.input_contract || {}).ignore || []) };
    const oldRaw = Buffer.from(JSON.stringify(doc, null, 2), 'utf8');
    await prisma.gradingChecker.create({ data: { checkerId: oldCheckerId, assignmentId: aOld, questionId: q.id, versionHash: oldCheckerId, rubricHash: doc.assignment_ref.rubric_hash, standardHash: doc.assignment_ref.standard_hash, status: 'ready', checkerJson: doc } });
    await insertOldAnchor({ assignmentId: aOld, checkerId: oldCheckerId, checkerRaw: oldRaw, frozenSha256: 'sha256:' + sha256Hex(oldRaw) });
    const spy = mkLog();
    let buildCalls = 0;
    const r = await resolveRulerForAssignment({
      prisma, assignmentId: aNew, questionId: c.questionId, mode: 'build', log: spy,
      buildFn: async () => { buildCalls += 1; throw new Error('不该造尺：老锚点可采纳'); }, claimOnly: false,
    });
    expect(spy.lines.filter((l) => l.includes('RULER_ADOPT_SKIP')).join(' | ')).toBe(''); // 诊断：任何 skip 都会在这里现形
    expect(buildCalls).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.status).toBe('adopted');
    expect(r.zeroLlm).toBe(true);
    expect(spy.has('RULER_ADOPTED_OLD_ANCHOR')).toBe(true);
    const ruler = await findRulerByContentKey(prisma, c.contentKey);
    expect(ruler.status).toBe('ready');
    expect(ruler.checkerId).toBe(oldCheckerId);
    expect(ruler.checkerRaw.toString('utf8')).toBe(oldRaw.toString('utf8')); // 老锚点原始字节逐位补建
    // 反向断言（★O4/R2-B38：**可归因** —— 候选快照 bare hex64 vs 目标内容 sha256:<…>，两侧形状/取值确实不同；
    //   断言只认「本候选行」的 skip 留痕，并附**正向对照**（同夹具同一行、只把形状改回正常 ⇒ 被采纳））
    const { teacher: t2, q: q2, dir: dir2 } = await mkQuestion('-anchor2');
    const cA = await resolveAssignmentContent({ prisma, assignmentId: aNew, uploadsRoot });
    const aBadCand = await mkAssignment({ teacherId: t2.id, questionId: q2.id, rubric: '标准-anchor', material: '材料-anchor', suffix: '-anchor-badcand' });
    const aBadTgt = await mkAssignment({ teacherId: t2.id, questionId: q2.id, rubric: '标准-anchor', material: '材料-anchor', suffix: '-anchor-badtgt' });
    const cBad = await resolveAssignmentContent({ prisma, assignmentId: aBadTgt, uploadsRoot });
    cleanup.contentKeys.add(cBad.contentKey);
    await deleteRulers([cBad.contentKey]);
    // 候选作业快照 = bare hex64（形状不符）；目标作业快照 = mkAssignment 默认 sha256:<…>（正常形状）
    await prisma.$executeRawUnsafe('UPDATE assignment_questions SET standard_hash = ? WHERE assignment_id = ?', 'f'.repeat(64), aBadCand);
    // 该内容的锚点：assignment_ref 用**目标标准包目录**的装置口径摘要（⇒ 判据 2 成立），使判据 1 成为唯一差异
    const badCheckerId = 'sha256:' + crypto.randomBytes(32).toString('hex');
    const docBad = { ...doc, checker_id: badCheckerId, assignment_ref: { ...doc.assignment_ref, rubric_hash: rubricContentSha256(cBad.content.rubric), standard_hash: standardDirDigest(dir2, (doc.input_contract || {}).ignore || []) } };
    const rawBad = Buffer.from(JSON.stringify(docBad, null, 2), 'utf8');
    await prisma.gradingChecker.create({ data: { checkerId: badCheckerId, assignmentId: aBadCand, questionId: q2.id, versionHash: badCheckerId, rubricHash: docBad.assignment_ref.rubric_hash, standardHash: docBad.assignment_ref.standard_hash, status: 'ready', checkerJson: docBad } });
    await insertOldAnchor({ assignmentId: aBadCand, checkerId: badCheckerId, checkerRaw: rawBad, frozenSha256: 'sha256:' + sha256Hex(rawBad) });
    const runBad = async (spy) => {
      await deleteRulers([cBad.contentKey]);
      return resolveRulerForAssignment({ prisma, assignmentId: aBadTgt, questionId: cBad.questionId, mode: 'build', log: spy });
    };
    const spyBad = mkLog();
    const rBad = await runBad(spyBad);
    expect(rBad.status).not.toBe('adopted');
    // ★可归因：只取**本候选行**（按 checker_id）的留痕 —— 同库其它锚点行的同名 reason 不算数
    const badSkips = spyBad.lines.filter((l) => l.includes('RULER_ADOPT_SKIP') && l.includes(badCheckerId));
    expect(badSkips.length).toBe(1);
    expect(badSkips[0]).toContain('snapshot_standard_hash_mismatch');
    // ★正向对照（同夹具、同一行，只把候选快照改回正常形状）⇒ 该行被采纳（证明判据「能失败也能通过」）
    await prisma.$executeRawUnsafe('UPDATE assignment_questions SET standard_hash = ? WHERE assignment_id = ?', 'sha256:' + 'b'.repeat(64), aBadCand);
    const spyCtl = mkLog();
    const rCtl = await runBad(spyCtl);
    expect(rCtl.status).toBe('adopted');
    expect(rCtl.zeroLlm).toBe(true);
    const ctlSkips = spyCtl.lines.filter((l) => l.includes('RULER_ADOPT_SKIP') && l.includes(badCheckerId));
    expect(ctlSkips.join(' ')).not.toContain('snapshot_standard_hash_mismatch');
    const adoptedRuler = await findRulerByContentKey(prisma, cBad.contentKey);
    expect(adoptedRuler.checkerId).toBe(badCheckerId);   // 被采纳的确实是该行
    expect(dir2).toBeTruthy();
    expect(cA.contentKey).toBe(c.contentKey);
  }, 120000);

  it('W59-2 ★r2b7 复用路径：同内容已有 ready 尺子 ⇒ measure-only-reuse（零 LLM、MODEL_CALLS=0、原始字节落位）', async () => {
    const { teacher, q, dir } = await mkQuestion('-r2b7reuse');
    const a = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-r2b7reuse', material: '材料-r2b7reuse', suffix: '-r2b7reuse' });
    const c = await resolveAssignmentContent({ prisma, assignmentId: a, uploadsRoot });
    cleanup.contentKeys.add(c.contentKey);
    await deleteRulers([c.contentKey]);
    // 预置一把 ready 尺子（内容=本作业内容；原始字节=stub 夹具 ⇒ 装置启动时落位字节可对拍）
    const r0 = await resolveRulerForAssignment({ prisma, assignmentId: a, questionId: c.questionId, mode: 'build', log: mkLog() });
    expect(r0.status).toBe('claimed_here');
    await completeClaimedRuler({ prisma, contentKey: c.contentKey, checkerId: FIXTURE_ID, frozenSha256: 'sha256:' + sha256Hex(FIXTURE_RAW), checkerRaw: FIXTURE_RAW });
    await prisma.$executeRawUnsafe('DELETE FROM assignment_question_rulers WHERE assignment_id = ?', a); // 让 r2b7 自己绑定
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'w59-r2b7-'));
    const res = spawnSync(process.execPath, [
      R2B7, '--assignment', String(a), '--workdir', workdir,
      '--device', process.execPath, '--device-arg', STUB,
      '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01',
      '--stub-env', 'STUB_MANIFEST_IDS=' + TAG + '-r2b7reuse-real', '--stub-env', 'STUB_SCORE=77', '--timeout-ms', '60000',
    ], { encoding: 'utf8', timeout: 120000, env: childEnv() });
    const out = (res.stdout || '') + (res.stderr || '');
    expect(res.status).toBe(0);
    expect(out).toContain('RULER_ACTION=reuse');
    expect(out).toContain('RULER_REUSE_HIT');
    expect(out).toContain('measure-only-reuse');
    expect(out).not.toContain('build-and-measure');
    expect(out).toContain('MODEL_CALLS=0'); // ★零模型调用（SUMMARY 口径）
    expect(out).toContain('reuse_byte_exact=yes');
    expect(out).toContain('CHECKER_ID=' + FIXTURE_ID);
    const dump = JSON.parse(fs.readFileSync(path.join(workdir, 'out', 'stub-env.json'), 'utf8'));
    expect(dump.argv.join(' ')).toContain('--checker-mode measure-only-reuse');
    expect(dump.argv.join(' ')).not.toContain('build-and-measure');
    // 装置启动时看到的 checker.json == 尺子原始字节（逐位）
    expect(dump.checker_sha256).toBe('sha256:' + sha256Hex(FIXTURE_RAW));
    // 尺子行未被重建/覆盖；绑定已建立
    const ruler = await findRulerByContentKey(prisma, c.contentKey);
    expect(ruler.checkerId).toBe(FIXTURE_ID);
    const bind = await prisma.$queryRawUnsafe('SELECT ruler_id FROM assignment_question_rulers WHERE assignment_id = ?', a);
    expect(Number(bind[0].ruler_id)).toBe(ruler.id);
    expect(dir).toBeTruthy();
  }, 180000);

  it('W59-3 ★r2b7 造尺路径：内容首次出现 ⇒ claim ⇒ 造尺一次 ⇒ ready + 绑定 + 锚点（MODEL_CALLS 由装置自报）', async () => {
    const { teacher, q } = await mkQuestion('-r2b7build');
    const a = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-r2b7build', material: '材料-r2b7build', suffix: '-r2b7build' });
    const c = await resolveAssignmentContent({ prisma, assignmentId: a, uploadsRoot });
    cleanup.contentKeys.add(c.contentKey);
    await deleteRulers([c.contentKey]);
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'w59-r2b7-'));
    const res = spawnSync(process.execPath, [
      R2B7, '--assignment', String(a), '--workdir', workdir,
      '--device', process.execPath, '--device-arg', STUB,
      '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01',
      '--stub-env', 'STUB_MANIFEST_IDS=' + TAG + '-r2b7build-real', '--stub-env', 'STUB_SCORE=66', '--timeout-ms', '60000',
    ], { encoding: 'utf8', timeout: 120000, env: childEnv() });
    const out = (res.stdout || '') + (res.stderr || '');
    expect(res.status).toBe(0);
    expect(out).toContain('RULER_CONTENT_KEY=' + c.contentKey);
    expect(out).toContain('RULER_ACTION=claim_build');
    expect(out).toContain('RULER_BUILT');
    expect(out).toContain('RULER_BOUND=yes');
    const ruler = await findRulerByContentKey(prisma, c.contentKey);
    expect(ruler.status).toBe('ready');
    expect(ruler.checkerId).toBe(FIXTURE_ID);
    expect(ruler.checkerRawBytes).toBe(FIXTURE_RAW.length);
    expect(ruler.frozenSha256).toBeTruthy();
    const bind = await prisma.$queryRawUnsafe('SELECT ruler_id FROM assignment_question_rulers WHERE assignment_id = ?', a);
    expect(Number(bind[0].ruler_id)).toBe(ruler.id);
    // ★既有行为保持：r2b7 造尺路径**不新增锚点行**（R2-B10/B16 测试按此钉住）；锚点行由「复用命中」补建
    const anchors = await prisma.$queryRawUnsafe('SELECT checker_id FROM grading_assignment_anchors WHERE assignment_id = ?', a);
    expect(anchors).toHaveLength(0);
  }, 180000);

  it('W59-4 ★worker 复用：同内容（另一作业=跨班）无本作业 checker ⇒ 命中内容尺子复用（零 LLM，argv 断言）并真写分', async () => {
    const { teacher, q } = await mkQuestion('-worker');
    const aBuild = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-worker', material: '材料-worker', suffix: '-worker-a' });
    const aReuse = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-worker', material: '材料-worker', suffix: '-worker-b' });
    const c = await resolveAssignmentContent({ prisma, assignmentId: aBuild, uploadsRoot });
    cleanup.contentKeys.add(c.contentKey);
    await deleteRulers([c.contentKey]);
    // 预置 ready 尺子（原始字节=夹具），且只绑定 aBuild（aReuse 走内容解析）
    const r0 = await resolveRulerForAssignment({ prisma, assignmentId: aBuild, questionId: c.questionId, mode: 'build', log: mkLog() });
    expect(r0.status).toBe('claimed_here');
    await completeClaimedRuler({ prisma, contentKey: c.contentKey, checkerId: FIXTURE_ID, checkerRaw: FIXTURE_RAW });
    await prisma.$executeRawUnsafe('DELETE FROM assignment_question_rulers WHERE assignment_id IN (?,?)', aBuild, aReuse);
    // aReuse 的提交（slug 映射靠 realName）
    for (let i = 0; i < 2; i++) {
      const u = await prisma.user.create({ data: { username: TAG + '-wstu' + i, password: 'x', role: 'student', realName: TAG + '-worker-real' + (i + 1) } });
      cleanup.userIds.push(u.id);
      await prisma.submission.create({ data: { assignmentId: aReuse, questionId: q.id, studentId: u.id, status: 'submitted' } });
    }
    const job = await prisma.gradingJob.create({ data: { assignmentId: aReuse, checkerId: 'probe-' + TAG, status: 'pending' } });
    cleanup.jobIds.push(job.id);
    const res = spawnSync(process.execPath, [WORKER, '--once', '--reuse-checker', '--device', process.execPath, '--device-arg', STUB,
      '--stub-env', 'STUB_MODE=ok', '--stub-env', 'STUB_SLUG=1', '--stub-env', 'STUB_SUBMISSIONS=s01,s02',
      '--stub-env', 'STUB_MANIFEST_IDS=' + TAG + '-worker-real1,' + TAG + '-worker-real2', '--stub-env', 'STUB_SCORE=64',
    ], { encoding: 'utf8', timeout: 120000, env: childEnv({ DSH_WORKER_DB_LIMIT: '1' }) });
    const out = (res.stdout || '') + (res.stderr || '');
    expect(res.status).toBe(0);
    expect(out).toContain('RULER_RESOLVE=reuse');
    expect(out).toContain('RULER_REUSE_HIT');
    expect(out).toContain('CHECKER_REUSE=applied');
    expect(out).toContain('via=ruler_content_key');
    expect(out).toContain('byte_exact=yes');
    // ★复用命中必须为该作业补锚点行（用本作业自己的名单；否则装置 side frozen 预检/消费侧映射缺锚）
    expect(out).toContain('ANCHOR_ROW_BACKFILLED=yes');
    const anchorRows = await prisma.$queryRawUnsafe('SELECT checker_id, n_submissions, LENGTH(checker_raw) AS n FROM grading_assignment_anchors WHERE assignment_id = ?', aReuse);
    expect(anchorRows).toHaveLength(1);
    expect(anchorRows[0].checker_id).toBe(FIXTURE_ID);
    expect(Number(anchorRows[0].n_submissions)).toBe(2); // 本作业自己的名单（不是别班的）
    const dirs = fs.readdirSync('/tmp').filter((d) => d.startsWith('r2b4-job-' + job.id + '-'));
    expect(dirs.length).toBeGreaterThan(0);
    const runRoot = path.join('/tmp', dirs[dirs.length - 1]);
    const dump = JSON.parse(fs.readFileSync(path.join(runRoot, 'out', 'stub-env.json'), 'utf8'));
    expect(dump.argv.join(' ')).toContain('--checker-mode measure-only-reuse');
    expect(dump.argv.join(' ')).not.toContain('build-and-measure');
    expect(dump.checker_frozen_seen).toBe(true);
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, writtenCount: true, checkerId: true } });
    expect(after.status).toBe('done');
    expect(after.writtenCount).toBe(2);
    expect(after.checkerId).toBe(FIXTURE_ID); // ★不变量：job.checker_id == ruler.checker_id
    const jobRow = await prisma.$queryRawUnsafe('SELECT content_key FROM grading_jobs WHERE id = ?', job.id);
    expect(jobRow[0].content_key).toBe(c.contentKey); // content_key 已回填（审计）
    const subs = await prisma.submission.findMany({ where: { assignmentId: aReuse }, select: { aiScore: true, checkerId: true } });
    expect(subs.map((s) => s.aiScore)).toEqual([64, 64]);
    expect(subs.every((s) => s.checkerId === FIXTURE_ID)).toBe(true);
  }, 240000);

  it('W59-5 ★worker 失败路径 fail-closed：内容尺子 failed ⇒ needs_rerun 且装置从未启动', async () => {
    const { teacher, q } = await mkQuestion('-workerfail');
    const a = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-workerfail', material: '材料-workerfail', suffix: '-workerfail' });
    const c = await resolveAssignmentContent({ prisma, assignmentId: a, uploadsRoot });
    cleanup.contentKeys.add(c.contentKey);
    await deleteRulers([c.contentKey]);
    const r0 = await resolveRulerForAssignment({ prisma, assignmentId: a, questionId: c.questionId, mode: 'build', log: mkLog() });
    expect(r0.status).toBe('claimed_here');
    const { failClaimedRuler } = await import('../../src/services/dshRulerAssignment.js');
    await failClaimedRuler({ prisma, contentKey: c.contentKey, reason: '夹具：装置造尺失败' });
    const job = await prisma.gradingJob.create({ data: { assignmentId: a, checkerId: 'probe-fail-' + TAG, status: 'pending' } });
    cleanup.jobIds.push(job.id);
    const res = spawnSync(process.execPath, [WORKER, '--once', '--reuse-checker', '--device', process.execPath, '--device-arg', STUB], { encoding: 'utf8', timeout: 120000, env: childEnv({ DSH_WORKER_DB_LIMIT: '1' }) });
    const out = (res.stdout || '') + (res.stderr || '');
    expect(res.status).toBe(0);
    expect(out).toContain('RULER_RESOLVE=fail_closed');
    expect(out).toContain('reason=ruler_failed');
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, writtenCount: true, lastError: true } });
    expect(after.status).toBe('needs_rerun');
    expect(after.writtenCount).toBe(0);
    expect(String(after.lastError)).toContain('ruler_failed');
    // ★O2（R2-B38）：worker 侧前缀必须**幂等** ⇒ last_error 单前缀（不再出现 ruler_ruler_failed:），原因尾巴保留
    expect(String(after.lastError).startsWith('ruler_failed:')).toBe(true);
    expect(String(after.lastError)).not.toContain('ruler_ruler_');
    expect(out).not.toContain('ruler_ruler_');
    expect(String(after.lastError)).toContain('夹具：装置造尺失败');
    const dirs = fs.readdirSync('/tmp').filter((d) => d.startsWith('r2b4-job-' + job.id + '-'));
    expect(dirs.some((d) => fs.existsSync(path.join('/tmp', d, 'out', 'stub-env.json')))).toBe(false); // 装置从未启动
  }, 180000);

  it('W59-6 ★HTTP 触发闸：内容命中 ⇒ 跨班/跨教师也能触发（不再 409），无尺/失败尺 ⇒ 409 可判定', async () => {
    const r = authReq(await loginAsTeacher());
    const teacherId = getTestData().teacherId;
    const { q, dir } = await mkQuestion('-http');
    const a1 = await mkAssignment({ teacherId, questionId: q.id, rubric: '标准-http', material: '材料-http', suffix: '-http1' });
    const a2 = await mkAssignment({ teacherId, questionId: q.id, rubric: '标准-http', material: '材料-http', suffix: '-http2' });
    const a3 = await mkAssignment({ teacherId, questionId: q.id, rubric: '标准-http-missing', material: '材料-http', suffix: '-http3' });
    const c1 = await resolveAssignmentContent({ prisma, assignmentId: a1, uploadsRoot });
    const c3 = await resolveAssignmentContent({ prisma, assignmentId: a3, uploadsRoot });
    cleanup.contentKeys.add(c1.contentKey); cleanup.contentKeys.add(c3.contentKey);
    await deleteRulers([c1.contentKey, c3.contentKey]);
    // 无尺 ⇒ 409 + RULER_NOT_READY
    const missing = await r.post('/api/teacher/assignments/' + a1 + '/grade');
    expect(missing.status).toBe(409);
    expect(missing.body.data.code).toBe('RULER_NOT_READY');
    // 造好尺子 ⇒ 两个同内容作业都能触发（第二个此前必然 409：本作业没有 ready checker）
    const built = await resolveRulerForAssignment({ prisma, assignmentId: a1, questionId: c1.questionId, mode: 'build', log: mkLog() });
    expect(built.status).toBe('claimed_here');
    const doc = JSON.parse(FIXTURE_RAW.toString('utf8'));
    doc.checker_id = 'sha256:' + crypto.randomBytes(32).toString('hex');
    doc.assignment_ref = { ...doc.assignment_ref, rubric_hash: c1.content.rubricSha256, standard_hash: standardDirDigest(dir, ['node_modules/**']) };
    const raw = Buffer.from(JSON.stringify(doc, null, 2), 'utf8');
    await completeClaimedRuler({ prisma, contentKey: c1.contentKey, checkerId: doc.checker_id, checkerRaw: raw });
    const first = await r.post('/api/teacher/assignments/' + a1 + '/grade');
    expect(first.status).toBe(200);
    expect(first.body.data.checkerId).toBe(doc.checker_id);
    expect(first.body.data.contentKey).toBe(c1.contentKey);
    cleanup.jobIds.push(first.body.data.jobId);
    const second = await r.post('/api/teacher/assignments/' + a2 + '/grade');
    expect(second.status).toBe(200);                                  // ★跨班/跨作业不再 409
    expect(second.body.data.checkerId).toBe(doc.checker_id);
    expect(second.body.data.contentKey).toBe(c1.contentKey);
    cleanup.jobIds.push(second.body.data.jobId);
    const jobRow = await prisma.$queryRawUnsafe('SELECT checker_id, content_key FROM grading_jobs WHERE id = ?', second.body.data.jobId);
    expect(jobRow[0].checker_id).toBe(doc.checker_id);
    expect(jobRow[0].content_key).toBe(c1.contentKey);                // ★content_key 落 grading_jobs
    // 造尺失败的尺子 ⇒ 409 RULER_FAILED（fail-closed）
    const r3 = await resolveRulerForAssignment({ prisma, assignmentId: a3, questionId: c3.questionId, mode: 'build', log: mkLog() });
    expect(r3.status).toBe('claimed_here');
    const { failClaimedRuler } = await import('../../src/services/dshRulerAssignment.js');
    await failClaimedRuler({ prisma, contentKey: c3.contentKey, reason: 'HTTP 夹具失败' });
    const failed = await r.post('/api/teacher/assignments/' + a3 + '/grade');
    expect(failed.status).toBe(409);
    expect(failed.body.data.code).toBe('RULER_FAILED');
    expect(failed.body.data.reason).toContain('ruler_failed');
  }, 180000);

  it('W59-7 ★导出物料与内容指纹同源：快照存在时 rubric/题目描述字节与 content_key 的两个哈希逐位一致', async () => {
    const { teacher, q } = await mkQuestion('-export');
    const a = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-export', material: '材料-export', suffix: '-export' });
    // 改活值（题库变了），快照不变 ⇒ 指纹不变、且导出必须取快照（否则同 key 两物料）
    await prisma.question.update({ where: { id: q.id }, data: { scoringRubric: '标准-export-活值改过', material: '材料-export-活值改过' } });
    const c = await resolveAssignmentContent({ prisma, assignmentId: a, uploadsRoot });
    cleanup.contentKeys.add(c.contentKey);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w59-export-'));
    const exp = await exportMaterials({ prisma, assignmentId: a, outDir, uploadsRoot });
    expect(exp.ok).toBe(true);
    const m = exp.manifest;
    expect(m.snapshot.from_snapshot).toBe(true);
    expect('sha256:' + m.rubric.sha256).toBe(c.content.rubricSha256);
    expect('sha256:' + m.assignment_doc.sha256).toBe(c.content.descriptionSha256);
    expect(m.standard.sha256).toBe(c.content.standardSha256);
    fs.rmSync(outDir, { recursive: true, force: true });
  }, 120000);

  it('★W59-8 O1/O2（R2-B38）：无锚点原始字节时**重序列化登记**必须与 frozen_sha256 对账；失败原因前缀归一', async () => {
    const { registerRulerFromLocalChecker } = await import('../../src/services/dshRulerAssignment.js');
    const { composeFailedReason } = await import('../../src/services/dshRulerStore.js');
    // ── O2：前缀归一（w58 场景逐字不变；嵌套前缀被剥掉，不再产生 ruler_failed:ruler_failed:…）
    expect(composeFailedReason('装置造尺失败(夹具)')).toBe('ruler_failed:装置造尺失败(夹具)');
    expect(composeFailedReason('ruler_failed:嵌套')).toBe('ruler_failed:嵌套');
    expect(composeFailedReason('ruler_builder_failed:x')).toBe('ruler_failed:builder_failed:x');
    expect(composeFailedReason(null)).toBe('ruler_failed:unknown');
    // ── O1：无锚点（既无 checker_raw 也无 frozen_sha256）⇒ 允许重序列化，但**必须留痕**来源
    const { teacher, q, dir } = await mkQuestion('-o1-ok');
    const aOk = await mkAssignment({ teacherId: teacher.id, questionId: q.id, rubric: '标准-o1', material: '材料-o1', suffix: '-o1-ok' });
    const cOk = await resolveAssignmentContent({ prisma, assignmentId: aOk, uploadsRoot });
    cleanup.contentKeys.add(cOk.contentKey);
    const docOk = { ...JSON.parse(FIXTURE_RAW.toString('utf8')), checker_id: 'sha256:' + crypto.randomBytes(32).toString('hex') };
    docOk.assignment_ref = { ...docOk.assignment_ref, rubric_hash: rubricContentSha256(cOk.content.rubric), standard_hash: standardDirDigest(dir, (docOk.input_contract || {}).ignore || []) };
    await prisma.gradingChecker.create({ data: { checkerId: docOk.checker_id, assignmentId: aOk, questionId: q.id, versionHash: docOk.checker_id, rubricHash: docOk.assignment_ref.rubric_hash, standardHash: docOk.assignment_ref.standard_hash, status: 'ready', checkerJson: docOk } });
    const spyOk = mkLog();
    const okRes = await registerRulerFromLocalChecker({ prisma, assignmentId: aOk, questionId: q.id, content: cOk.content, log: spyOk });
    expect(okRes).toBeTruthy();
    expect(okRes.source).toBe('checker_json_reserialized');       // ★重序列化路径必须可归因
    expect(okRes.frozenSha256).toBe(null);                        // 无锚点 ⇒ 不得伪造 frozen
    expect(spyOk.lines.join(' ')).toContain('source=checker_json_reserialized');
    expect(spyOk.lines.join(' ')).toContain('★重序列化登记路径');
    // ── O1 反例：锚点存在但**无 checker_raw**，且 frozen_sha256 与重序列化字节不一致 ⇒ 必须拒绝登记（fail-closed）
    const { teacher: t2, q: q2, dir: dir2 } = await mkQuestion('-o1-bad');
    const aBad = await mkAssignment({ teacherId: t2.id, questionId: q2.id, rubric: '标准-o1bad', material: '材料-o1bad', suffix: '-o1-bad' });
    const cBad = await resolveAssignmentContent({ prisma, assignmentId: aBad, uploadsRoot });
    cleanup.contentKeys.add(cBad.contentKey);
    const docBad = { ...JSON.parse(FIXTURE_RAW.toString('utf8')), checker_id: 'sha256:' + crypto.randomBytes(32).toString('hex') };
    docBad.assignment_ref = { ...docBad.assignment_ref, rubric_hash: rubricContentSha256(cBad.content.rubric), standard_hash: standardDirDigest(dir2, (docBad.input_contract || {}).ignore || []) };
    await prisma.gradingChecker.create({ data: { checkerId: docBad.checker_id, assignmentId: aBad, questionId: q2.id, versionHash: docBad.checker_id, rubricHash: docBad.assignment_ref.rubric_hash, standardHash: docBad.assignment_ref.standard_hash, status: 'ready', checkerJson: docBad } });
    // 锚点行：checker_raw = NULL，frozen_sha256 故意与「重序列化后」的字节不同（模拟原始字节丢失/被改写）
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_assignment_anchors (assignment_id, checker_id, frozen_sha256, materials_manifest_digest, n_submissions, submissions_json, anchor_json, checker_raw, created_at, updated_at) '
      + 'VALUES (?, ?, ?, NULL, 0, CAST(? AS JSON), CAST(? AS JSON), NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)) '
      + 'ON DUPLICATE KEY UPDATE checker_raw = NULL, frozen_sha256 = VALUES(frozen_sha256)',
      aBad, docBad.checker_id, 'sha256:' + '9'.repeat(64), JSON.stringify([]), JSON.stringify({ schema_version: 'assignment-manifest/v1' }),
    );
    const spyBad = mkLog();
    const badRes = await registerRulerFromLocalChecker({ prisma, assignmentId: aBad, questionId: q2.id, content: cBad.content, log: spyBad });
    expect(badRes).toBe(null);                                    // ★不得登记「装置必然拒收」的尺子
    const skips = spyBad.lines.filter((l) => l.includes('RULER_INGEST_SKIP') && l.includes(docBad.checker_id));
    expect(skips.length).toBe(1);
    expect(skips[0]).toContain('reason=reserialized_frozen_mismatch');
  }, 120000);
});
