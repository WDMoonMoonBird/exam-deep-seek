/**
 * C3（t8）管理员批改记录 —— 真实 HTTP 集成测试（只读；exam_system_test 夹具，不连生产）。
 *
 * 覆盖（契约 ①~⑤）：
 *   C3-1 鉴权：admin 200 / teacher 403 / student 403 / 未登录 401（列表 + 详情）；
 *   C3-2 列表包含自动造尺 job：哨兵 build、尺子来源 build、reuse；assignment/teacher/class/checker/status/counts 齐备；
 *   C3-3 run_kind 筛选（build / ruler）生效；
 *   C3-4 ★存量记录可见（实验2 80 份同类代理）：无 run 行/无归档的旧 job 仍可见 + read-model 合成 ruler 记录；
 *   C3-5 详情：会话归属（老师/班级/作业）+ teardown_json 全量 + 逐份结果（归档摘要/DB 兜底）+ 日志脱敏；
 *   C3-6 哨兵/存量详情与 404/400 边界；
 *   C3-7 只读：admin 写方法一律 404；GET 前后分数与 job 行数不变；响应不含答题全文。
 *
 * 前置：DATABASE_URL=exam_system_test（test/setup.js 破坏性操作护栏）。
 * 夹具：本套件自建 teacher 用 seed 教师/班级，student/question/assignment/job/ruler/归档全部自建并在 afterAll 清理。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/utils/prisma.js';
import { RUNS_ROOT_ENV } from '../../src/infrastructure/dsh/runs/dshRunArchiver.js';
import { AUTO_BUILD_CHECKER } from '../../src/infrastructure/dsh/worker/autoBuild.js';
import { authReq, getTestData, loginAsAdmin, loginAsStudent, loginAsTeacher } from './helpers.js';

const TAG = 'c3adm-' + Date.now();
const CHK1 = 'c3a-' + String(Date.now()).slice(-8);
const CHK2 = 'c3b-' + String(Date.now()).slice(-8);
const K_BUILD = crypto.randomBytes(32).toString('hex'); // 64 hex：与 grading_rulers.content_key 同形
const K_LEGACY = crypto.randomBytes(32).toString('hex');
const SECRET_ANSWER = 'SECRET_ANSWER_TEXT_DO_NOT_LEAK_C3';
const SECRET_KEY = 'sk-live-c3secretabcdef';

let runsRoot = null;
let prevRunsRoot;
let teacher = null;
let klass = null;
let q1 = null;
let q2 = null;
let assignmentId = null;
let students = [];
let jobBuild = null;
let jobReuse = null;
let jobSentinel = null;
let jobLegacy = null;
let jobArchived = null;
let ruler1Id = null;
let ruler2Id = null;
let buildArchiveName = null;
let scoresBefore = [];

/** 临时归档根：worker 归档（<jobId>）+ 造尺归档（build-<assignmentId>-<ts>），口径与 w56 夹具同源 */
function mkWorkerArchive(jobId) {
  const dir = path.join(runsRoot, String(jobId));
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'run-teardown.json'), JSON.stringify({
    isolated_home: '/tmp/x/home', home_exists_before: 'yes', credentials_removed: 'yes',
    session_files_before: 4, session_bytes: 1024, sessions_purged: true,
    home_exists_after: 'yes', session_files_after: 0, home_policy: 'sessions+credentials',
    purge_policy: 'purge_home=1 keep_days=3 exit=0', keep_scene: false, source: 'worker', ts: '2026-10-17T00:00:00Z',
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'evidence-summary.json'), JSON.stringify({
    schema_version: 'evidence-summary/1', n: 2, measurable: 2, unmeasurable: 0,
    submissions: [{ slug: '归档学生甲', measurable: true, score: 88 }, { slug: '归档学生乙', measurable: true, score: 77 }],
  }));
  fs.writeFileSync(path.join(dir, 'device.stdout.log'), 'line-0 DEEPSEEK_API_KEY=' + SECRET_KEY + String.fromCharCode(10));
  fs.writeFileSync(path.join(dir, 'device.stderr.log'), 'err-tail' + String.fromCharCode(10));
}

function mkBuildArchive(assignmentIdValue) {
  const name = 'build-' + assignmentIdValue + '-20261017T000000Z';
  const dir = path.join(runsRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run-teardown.json'), JSON.stringify({
    sessions_purged: true, session_files_before: 6, session_files_after: 0,
    credentials_removed: 'yes', home_policy: 'sessions+credentials', keep_scene: false,
    source: 'build', ts: '2026-10-17T00:00:00Z',
  }));
  return name;
}

beforeAll(async () => {
  prevRunsRoot = process.env[RUNS_ROOT_ENV];
  runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-admin-runs-'));
  process.env[RUNS_ROOT_ENV] = runsRoot;

  const td = getTestData();
  teacher = await prisma.user.findUnique({ where: { id: td.teacherId }, select: { id: true, realName: true, username: true } });
  klass = await prisma.class.findUnique({ where: { id: td.classId }, select: { id: true, name: true } });
  if (!teacher || !klass) throw new Error('seed_missing: teacher/class（test/setup.js 未就绪）');

  q1 = await prisma.question.create({ data: { teacherId: teacher.id, title: TAG + '-q1', type: 'project', difficulty: 'medium', material: '材料1', scoringRubric: '标准1', maxScore: 100 } });
  q2 = await prisma.question.create({ data: { teacherId: teacher.id, title: TAG + '-q2', type: 'project', difficulty: 'medium', material: '材料2', scoringRubric: '标准2', maxScore: 100 } });
  const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: TAG + '-作业', startTime: new Date(Date.now() - 86400e3), endTime: new Date(Date.now() - 3600e3) } });
  assignmentId = a.id;
  await prisma.assignmentQuestion.create({ data: { assignmentId, questionId: q1.id, sortOrder: 1, rubricSnapshot: { rubric: '标准1' }, materialSnapshot: '材料1', standardHash: 'sha256:' + 'c'.repeat(64), snapshotOrigin: 'publish' } });
  await prisma.assignmentQuestion.create({ data: { assignmentId, questionId: q2.id, sortOrder: 2, rubricSnapshot: { rubric: '标准2' }, materialSnapshot: '材料2', standardHash: 'sha256:' + 'd'.repeat(64), snapshotOrigin: 'publish' } });
  await prisma.assignmentClass.create({ data: { assignmentId, classId: klass.id } });

  students = [];
  for (let i = 1; i <= 4; i += 1) {
    const s = await prisma.user.create({ data: { username: TAG + '-s' + i, password: 'x', role: 'student', realName: TAG + '-学生' + i } });
    students.push(s.id);
  }
  const mkSub = (studentId, checkerId, score) => prisma.submission.create({
    data: { assignmentId, questionId: q1.id, studentId, status: 'ai_graded', aiScore: score, checkerId, answer: SECRET_ANSWER },
  });
  await mkSub(students[0], CHK1, 88);
  await mkSub(students[1], CHK1, 77);
  await mkSub(students[2], CHK2, 66);
  await mkSub(students[3], CHK2, 55);

  // ── 自动造尺 job 三类（D1/D2 契约）：哨兵 build / 尺子来源 build / 内容复用 reuse
  jobBuild = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK1, status: 'done', writtenCount: 2, skippedCount: 0, contentKey: K_BUILD } });
  jobReuse = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK1, status: 'done', writtenCount: 1, skippedCount: 0, contentKey: K_BUILD } });
  jobSentinel = await prisma.gradingJob.create({ data: { assignmentId, checkerId: AUTO_BUILD_CHECKER, status: 'pending', writtenCount: 0, skippedCount: 0 } });
  // ── 存量「实验2 80 份」同类代理：只有 grading_jobs 行，无 run 行、无归档
  jobLegacy = await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'legacy-' + TAG.slice(-6), status: 'failed', writtenCount: 2, skippedCount: 2 } });
  // ── 带归档的 worker job：详情断言 teardown/逐份（归档摘要）+ 日志脱敏
  jobArchived = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK1, status: 'done', writtenCount: 1, skippedCount: 0 } });

  await prisma.$executeRawUnsafe(
    'INSERT INTO grading_rulers (content_key, status, checker_id, source_run_id, created_at, updated_at) VALUES (?,?,?,?,NOW(3),NOW(3))',
    K_BUILD, 'ready', CHK1, jobBuild.id,
  );
  ruler1Id = (await prisma.$queryRawUnsafe('SELECT id FROM grading_rulers WHERE content_key = ? LIMIT 1', K_BUILD))[0].id;
  // 存量尺子：source_run_id 指向不存在的 job；CHK2 在本作业有 2 份写分 ⇒ 合成 ruler 记录
  await prisma.$executeRawUnsafe(
    'INSERT INTO grading_rulers (content_key, status, checker_id, source_run_id, created_at, updated_at) VALUES (?,?,?,?,NOW(3),NOW(3))',
    K_LEGACY, 'ready', CHK2, 999999999,
  );
  ruler2Id = (await prisma.$queryRawUnsafe('SELECT id FROM grading_rulers WHERE content_key = ? LIMIT 1', K_LEGACY))[0].id;
  await prisma.$executeRawUnsafe(
    'INSERT INTO assignment_question_rulers (assignment_id, question_id, ruler_id, bound_at) VALUES (?,?,?,NOW(3))',
    assignmentId, q1.id, ruler1Id,
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO assignment_question_rulers (assignment_id, question_id, ruler_id, bound_at) VALUES (?,?,?,NOW(3))',
    assignmentId, q2.id, ruler2Id,
  );

  mkWorkerArchive(jobArchived.id);
  buildArchiveName = mkBuildArchive(assignmentId);

  scoresBefore = await prisma.submission.findMany({ where: { assignmentId }, select: { id: true, aiScore: true, checkerId: true }, orderBy: { id: 'asc' } });
}, 60000);

afterAll(async () => {
  try {
    if (assignmentId) await prisma.$executeRawUnsafe('DELETE FROM assignment_question_rulers WHERE assignment_id = ?', assignmentId);
    await prisma.$executeRawUnsafe('DELETE FROM grading_rulers WHERE content_key IN (?,?)', K_BUILD, K_LEGACY);
    const jobIds = [jobBuild, jobReuse, jobSentinel, jobLegacy, jobArchived].filter(Boolean).map((j) => j.id);
    if (jobIds.length) {
      await prisma.$executeRawUnsafe('DELETE FROM grading_job_runs WHERE job_id IN (' + jobIds.map(() => '?').join(',') + ')', ...jobIds);
      await prisma.gradingJob.deleteMany({ where: { id: { in: jobIds } } });
    }
    if (assignmentId) {
      await prisma.submission.deleteMany({ where: { assignmentId } });
      await prisma.assignmentClass.deleteMany({ where: { assignmentId } });
      await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
      await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    }
    const qIds = [q1, q2].filter(Boolean).map((q) => q.id);
    if (qIds.length) await prisma.question.deleteMany({ where: { id: { in: qIds } } });
    if (students.length) await prisma.user.deleteMany({ where: { id: { in: students } } });
  } finally {
    if (prevRunsRoot === undefined) delete process.env[RUNS_ROOT_ENV]; else process.env[RUNS_ROOT_ENV] = prevRunsRoot;
    if (runsRoot) fs.rmSync(runsRoot, { recursive: true, force: true });
  }
}, 60000);

describe('C3 管理员批改记录（鉴权/列表/详情/存量/只读）', () => {
  it('C3-1 ★鉴权：admin 200；teacher/student 403；未登录 401（列表与详情同权）', async () => {
    const admin = authReq(await loginAsAdmin());
    const okList = await admin.get('/api/admin/grading-runs?page=1&pageSize=10');
    expect(okList.status).toBe(200);
    expect(okList.body.code).toBe(0);
    expect(Array.isArray(okList.body.data.items)).toBe(true);
    const okDetail = await admin.get('/api/admin/grading-runs/job-' + jobSentinel.id);
    expect(okDetail.status).toBe(200);
    expect(okDetail.body.code).toBe(0);

    const teacherReq = authReq(await loginAsTeacher());
    const tList = await teacherReq.get('/api/admin/grading-runs');
    expect(tList.status).toBe(403);
    expect(tList.body.code).toBe(1003);
    const tDetail = await teacherReq.get('/api/admin/grading-runs/job-' + jobSentinel.id);
    expect(tDetail.status).toBe(403);

    const studentReq = authReq(await loginAsStudent());
    const sList = await studentReq.get('/api/admin/grading-runs');
    expect(sList.status).toBe(403);
    const sDetail = await studentReq.get('/api/admin/grading-runs/ruler-' + assignmentId + '-' + ruler2Id);
    expect(sDetail.status).toBe(403);

    const anon = await request(app).get('/api/admin/grading-runs');
    expect([401, 403]).toContain(anon.status);
    expect(anon.status).not.toBe(404);
  }, 60000);

  it('C3-2 ★列表：自动造尺 job（哨兵 build / 尺子来源 build / reuse）字段齐备', async () => {
    const admin = authReq(await loginAsAdmin());
    const res = await admin.get('/api/admin/grading-runs?page=1&pageSize=100&assignmentId=' + assignmentId);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const byId = new Map(items.map((x) => [x.id, x]));

    // ① 哨兵自动造尺 job：run_kind=build + 兜底文案（checker_id=null，raw 留审计）
    const sentinel = byId.get('job-' + jobSentinel.id);
    expect(sentinel).toBeTruthy();
    expect(sentinel.run_kind).toBe('build');
    expect(sentinel.checker_id).toBe(null);
    expect(sentinel.checker_id_raw).toBe(AUTO_BUILD_CHECKER);
    expect(sentinel.checker_label).toBe('自动造尺（未对齐）');
    expect(sentinel.status).toBe('pending');
    expect(Number(sentinel.written)).toBe(0);

    // ② 本 job 造出的尺子 ⇒ build；③ 同内容由别的运行造出 ⇒ reuse
    const build = byId.get('job-' + jobBuild.id);
    expect(build).toBeTruthy();
    expect(build.run_kind).toBe('build');
    expect(build.checker_id).toBe(CHK1);
    expect(build.status).toBe('done');
    expect(Number(build.written)).toBe(2);
    expect(Number(build.skipped)).toBe(0);
    const reuse = byId.get('job-' + jobReuse.id);
    expect(reuse).toBeTruthy();
    expect(reuse.run_kind).toBe('reuse');

    // ④ assignment/teacher/class/checker/status/counts 元信息
    for (const item of [sentinel, build, reuse]) {
      expect(item.assignment_id).toBe(assignmentId);
      expect(item.assignment_title).toBe(TAG + '-作业');
      expect(item.teacher_id).toBe(teacher.id);
      expect(item.teacher_name).toBe(teacher.realName || teacher.username);
      expect(Array.isArray(item.classes)).toBe(true);
      expect(item.classes.some((c) => c.id === klass.id)).toBe(true);
      expect(item.class_count).toBeGreaterThanOrEqual(1);
      expect(item.checker_id_raw).toBeTruthy();
      expect(item.created_at).toBeTruthy();
    }
    // 用量不可得 ⇒ 如实 null（不显示假 0）
    expect(sentinel.cost_total).toBe(null);
    expect(res.body.data.source.jobs_table).toBe('grading_jobs');
    expect(res.body.data.source.rulers_table).toBe('grading_rulers');
  }, 60000);

  it('C3-3 run_kind 筛选：build 仅 build 项；ruler 命中存量尺子记录', async () => {
    const admin = authReq(await loginAsAdmin());
    const buildOnly = await admin.get('/api/admin/grading-runs?pageSize=100&assignmentId=' + assignmentId + '&run_kind=build');
    expect(buildOnly.status).toBe(200);
    const buildItems = buildOnly.body.data.items;
    expect(buildItems.length).toBeGreaterThanOrEqual(2);
    expect(buildItems.every((x) => x.run_kind === 'build')).toBe(true);
    const buildIds = buildItems.map((x) => x.id);
    expect(buildIds).toEqual(expect.arrayContaining(['job-' + jobSentinel.id, 'job-' + jobBuild.id]));

    const rulerOnly = await admin.get('/api/admin/grading-runs?pageSize=100&assignmentId=' + assignmentId + '&run_kind=ruler');
    expect(rulerOnly.status).toBe(200);
    expect(rulerOnly.body.data.items.every((x) => x.run_kind === 'ruler')).toBe(true);
    expect(rulerOnly.body.data.items.map((x) => x.id)).toContain('ruler-' + assignmentId + '-' + ruler2Id);
  }, 60000);

  it('C3-4 ★存量记录可见（实验2 80 份同类代理，测试库夹具）：旧 job 无 run/归档仍可见 + 合成 ruler 记录', async () => {
    const admin = authReq(await loginAsAdmin());
    const res = await admin.get('/api/admin/grading-runs?page=1&pageSize=100&assignmentId=' + assignmentId);
    const items = res.body.data.items;
    const legacy = items.find((x) => x.id === 'job-' + jobLegacy.id);
    expect(legacy).toBeTruthy();
    expect(legacy.type).toBe('worker');
    expect(legacy.archive).toBe(null);
    expect(legacy.archive_present).toBe(false);
    expect(legacy.run_kind).toBe('worker');
    expect(legacy.status).toBe('failed');
    expect(Number(legacy.written)).toBe(2);
    expect(Number(legacy.skipped)).toBe(2);
    expect(legacy.assignment_title).toBe(TAG + '-作业');
    expect(legacy.teacher_name).toBe(teacher.realName || teacher.username);

    const ruler = items.find((x) => x.id === 'ruler-' + assignmentId + '-' + ruler2Id);
    expect(ruler).toBeTruthy();
    expect(ruler.type).toBe('ruler');
    expect(ruler.run_kind).toBe('ruler');
    expect(ruler.checker_id).toBe(CHK2);
    expect(Number(ruler.written)).toBe(2);
    expect(ruler.assignment_title).toBe(TAG + '-作业');

    expect(Number(res.body.data.source.legacy_jobs)).toBeGreaterThanOrEqual(1);
    expect(Number(res.body.data.source.ruler_records)).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('C3-5 ★详情：会话归属 + teardown_json 全量 + 逐份结果（归档摘要）+ 日志脱敏', async () => {
    const admin = authReq(await loginAsAdmin());
    const res = await admin.get('/api/admin/grading-runs/job-' + jobArchived.id);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.read_only).toBe(true);
    // 会话归属（老师/班级/作业）
    expect(d.run.teacher_id).toBe(teacher.id);
    expect(d.run.teacher_name).toBe(teacher.realName || teacher.username);
    expect(d.run.classes.some((c) => c.id === klass.id)).toBe(true);
    expect(d.run.class_count).toBeGreaterThanOrEqual(1);
    expect(d.run.assignment_title).toBe(TAG + '-作业');
    expect(d.meta).toBeTruthy();
    // teardown 全量
    expect(d.teardown_json).toBeTruthy();
    expect(d.teardown_json.sessions_purged).toBe(true);
    expect(String(d.teardown_json.purge_policy)).toContain('purge_home=1');
    expect(d.run.archive_present).toBe(true);
    // 逐份结果（归档 evidence-summary 优先）
    expect(d.submissions_source).toBe('archive_evidence_summary');
    expect(d.submissions.map((s) => s.slug)).toEqual(['归档学生甲', '归档学生乙']);
    expect(d.submission_counts.n).toBe(2);
    // 日志存在且已脱敏（不泄露 sk- 原文）
    expect(d.logs.stdout.present).toBe(true);
    expect(String(d.logs.stdout.tail)).toContain('sk-****');
    expect(String(d.logs.stdout.tail)).not.toContain(SECRET_KEY);
  }, 60000);

  it('C3-6 哨兵/存量详情与边界：哨兵 build 详情、ruler 详情（DB 兜底逐份）、404/400', async () => {
    const admin = authReq(await loginAsAdmin());
    const sentinel = await admin.get('/api/admin/grading-runs/job-' + jobSentinel.id);
    expect(sentinel.status).toBe(200);
    expect(sentinel.body.data.run.run_kind).toBe('build');
    expect(sentinel.body.data.run.checker_label).toBe('自动造尺（未对齐）');
    expect(sentinel.body.data.run.archive_present).toBe(false);
    expect(String(sentinel.body.data.run.notice)).toContain('archive_missing');

    const ruler = await admin.get('/api/admin/grading-runs/ruler-' + assignmentId + '-' + ruler2Id);
    expect(ruler.status).toBe(200);
    const rd = ruler.body.data;
    expect(rd.read_only).toBe(true);
    expect(rd.run.type).toBe('ruler');
    expect(rd.run.run_kind).toBe('ruler');
    expect(rd.submissions_source).toBe('db_by_checker');
    expect(rd.submissions).toHaveLength(2);
    expect(rd.submissions.map((s) => s.score).sort((a, b) => a - b)).toEqual([55, 66]);
    expect(JSON.stringify(rd)).not.toContain(SECRET_ANSWER);

    const buildArchive = await admin.get('/api/admin/grading-runs/archive-' + buildArchiveName);
    expect(buildArchive.status).toBe(200);
    expect(buildArchive.body.data.run.type).toBe('build');
    expect(buildArchive.body.data.teardown_json.sessions_purged).toBe(true);

    const notFound = await admin.get('/api/admin/grading-runs/job-999999');
    expect(notFound.status).toBe(404);
    expect(notFound.body.code).toBe(1002);
    const badId = await admin.get('/api/admin/grading-runs/not-an-id');
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe(1001);
  }, 60000);

  it('C3-7 ★只读：admin 写方法一律 404；GET 前后分数/job 行数不变；响应不含答题全文', async () => {
    const admin = authReq(await loginAsAdmin());
    for (const method of ['post', 'put', 'delete']) {
      const r1 = await admin[method]('/api/admin/grading-runs');
      expect(r1.status).toBe(404);
      expect(r1.body.code).toBe(1404);
      const r2 = await admin[method]('/api/admin/grading-runs/job-' + jobSentinel.id);
      expect(r2.status).toBe(404);
    }
    // GET 前后：分数不变、job 行数不变
    const scoresAfter = await prisma.submission.findMany({ where: { assignmentId }, select: { id: true, aiScore: true, checkerId: true }, orderBy: { id: 'asc' } });
    expect(scoresAfter).toEqual(scoresBefore);
    expect(await prisma.gradingJob.count({ where: { assignmentId } })).toBe(5);
    // 响应不含答题全文
    const list = await admin.get('/api/admin/grading-runs?pageSize=100&assignmentId=' + assignmentId);
    const detail = await admin.get('/api/admin/grading-runs/job-' + jobArchived.id);
    const blob = JSON.stringify(list.body) + JSON.stringify(detail.body);
    expect(blob).not.toContain(SECRET_ANSWER);
    expect(blob).not.toContain('"answer"');
  }, 60000);
});
