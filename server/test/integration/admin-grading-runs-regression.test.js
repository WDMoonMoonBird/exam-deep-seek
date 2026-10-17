/**
 * C6（t17）B3 拆分回归：管理员批改记录「列表/详情」HTTP 响应深比较。
 *
 * 目的：B3 对 read-model.js（781 行）做纯搬运拆分，对外行为必须不变。本套件在**拆分前**
 * 抓取归一化响应基线（server/test/fixtures/admin-grading-runs-baseline.json），拆分后重跑同一夹具，
 * 深比较 6 个 HTTP 响应体（列表/筛选/4 类详情）⇒ 任何字段漂移都会红。
 *
 * 归一化口径（只抹掉「每次运行必然不同」的值，不抹语义字段）：
 *   · 自增 id（assignment/job/ruler/question/teacher/class/student）⇒ 大整数或 digit 串统一占位；
 *   · 时间戳（ISO）⇒ <ts>；elapsed_ms ⇒ <elapsed>；临时归档根 ⇒ <runsRoot>；
 *   · id 前缀串（job-N / ruler-A-R / archive-build-A-ts）⇒ 占位；
 *   · source.legacy_jobs / ruler_records（全库计数，受其它套件残留影响）⇒ <count>；
 *   · 列表 items 归一化后按序列化排序 ⇒ 与 DB 同秒排序抖动无关。
 *
 * 抓取模式：`C6_CAPTURE_BASELINE=1` 时写基线文件（仅拆分前用一次）；正常跑只比较、不写文件。
 * 数据库：仅 exam_system_test；夹具固定 TAG=c6reg 并在前后自清理；不连生产。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/utils/prisma.js';
import { RUNS_ROOT_ENV } from '../../src/infrastructure/dsh/runs/dshRunArchiver.js';
import { AUTO_BUILD_CHECKER } from '../../src/infrastructure/dsh/worker/autoBuild.js';
import { authReq, getTestData, loginAsAdmin } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.resolve(__dirname, '../fixtures/admin-grading-runs-baseline.json');
const READ_MODEL = path.resolve(__dirname, '../../src/infrastructure/dsh/runs/read-model.js');
const CAPTURE = String(process.env.C6_CAPTURE_BASELINE || '') === '1';

const TAG = 'c6reg';
const CHK1 = 'c6chk-a';
const CHK2 = 'c6chk-b';
const K_BUILD = 'a'.repeat(64);
const K_LEGACY = 'b'.repeat(64);
const SECRET_ANSWER = 'C6_SECRET_ANSWER_DO_NOT_LEAK';
const SECRET_KEY = 'sk-live-c6secret';
const BUILD_ARCHIVE_TS = '20261017T000000Z';

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

function sha256File(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; }
}
function lineCount(file) {
  try {
    const t = fs.readFileSync(file, 'utf8');
    const parts = t.split(String.fromCharCode(10));
    return t.endsWith(String.fromCharCode(10)) ? parts.length - 1 : parts.length;
  } catch { return null; }
}

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

function mkBuildArchive(aid) {
  const name = 'build-' + aid + '-' + BUILD_ARCHIVE_TS;
  const dir = path.join(runsRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run-teardown.json'), JSON.stringify({
    sessions_purged: true, session_files_before: 6, session_files_after: 0,
    credentials_removed: 'yes', home_policy: 'sessions+credentials', keep_scene: false,
    source: 'build', ts: '2026-10-17T00:00:00Z',
  }));
  return name;
}

/** 清理固定 TAG 的残留（保证重复跑幂等；只删本套件命名空间） */
async function cleanupFixed() {
  const as = await prisma.assignment.findMany({ where: { title: TAG + '-作业' }, select: { id: true } });
  const aids = as.map((a) => a.id);
  for (const aid of aids) {
    await prisma.$executeRawUnsafe('DELETE FROM assignment_question_rulers WHERE assignment_id = ?', aid);
    await prisma.$executeRawUnsafe('DELETE FROM grading_job_runs WHERE assignment_id = ?', aid);
    await prisma.gradingJob.deleteMany({ where: { assignmentId: aid } });
    await prisma.submission.deleteMany({ where: { assignmentId: aid } });
    await prisma.assignmentClass.deleteMany({ where: { assignmentId: aid } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: aid } });
    await prisma.assignment.deleteMany({ where: { id: aid } });
  }
  await prisma.$executeRawUnsafe('DELETE FROM grading_rulers WHERE content_key IN (?,?)', K_BUILD, K_LEGACY).catch(() => {});
  const qs = await prisma.question.findMany({ where: { title: { startsWith: TAG + '-' } }, select: { id: true } });
  if (qs.length) await prisma.question.deleteMany({ where: { id: { in: qs.map((q) => q.id) } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: TAG + '-s' } } });
}

beforeAll(async () => {
  prevRunsRoot = process.env[RUNS_ROOT_ENV];
  runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-reg-runs-'));
  process.env[RUNS_ROOT_ENV] = runsRoot;
  await cleanupFixed();

  const td = getTestData();
  teacher = await prisma.user.findUnique({ where: { id: td.teacherId }, select: { id: true, realName: true, username: true } });
  klass = await prisma.class.findUnique({ where: { id: td.classId }, select: { id: true, name: true } });
  if (!teacher || !klass) throw new Error('seed_missing: teacher/class');

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

  jobBuild = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK1, status: 'done', writtenCount: 2, skippedCount: 0, contentKey: K_BUILD } });
  jobReuse = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK1, status: 'done', writtenCount: 1, skippedCount: 0, contentKey: K_BUILD } });
  jobSentinel = await prisma.gradingJob.create({ data: { assignmentId, checkerId: AUTO_BUILD_CHECKER, status: 'pending', writtenCount: 0, skippedCount: 0 } });
  jobLegacy = await prisma.gradingJob.create({ data: { assignmentId, checkerId: 'legacy-' + TAG, status: 'failed', writtenCount: 2, skippedCount: 2 } });
  jobArchived = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK1, status: 'done', writtenCount: 1, skippedCount: 0 } });

  await prisma.$executeRawUnsafe(
    'INSERT INTO grading_rulers (content_key, status, checker_id, source_run_id, created_at, updated_at) VALUES (?,?,?,?,NOW(3),NOW(3))',
    K_BUILD, 'ready', CHK1, jobBuild.id,
  );
  ruler1Id = (await prisma.$queryRawUnsafe('SELECT id FROM grading_rulers WHERE content_key = ? LIMIT 1', K_BUILD))[0].id;
  await prisma.$executeRawUnsafe(
    'INSERT INTO grading_rulers (content_key, status, checker_id, source_run_id, created_at, updated_at) VALUES (?,?,?,?,NOW(3),NOW(3))',
    K_LEGACY, 'ready', CHK2, 999999999,
  );
  ruler2Id = (await prisma.$queryRawUnsafe('SELECT id FROM grading_rulers WHERE content_key = ? LIMIT 1', K_LEGACY))[0].id;
  await prisma.$executeRawUnsafe('INSERT INTO assignment_question_rulers (assignment_id, question_id, ruler_id, bound_at) VALUES (?,?,?,NOW(3))', assignmentId, q1.id, ruler1Id);
  await prisma.$executeRawUnsafe('INSERT INTO assignment_question_rulers (assignment_id, question_id, ruler_id, bound_at) VALUES (?,?,?,NOW(3))', assignmentId, q2.id, ruler2Id);

  mkWorkerArchive(jobArchived.id);
  buildArchiveName = mkBuildArchive(assignmentId);

  scoresBefore = await prisma.submission.findMany({ where: { assignmentId }, select: { id: true, aiScore: true, checkerId: true }, orderBy: { id: 'asc' } });
}, 60000);

afterAll(async () => {
  try {
    await cleanupFixed();
  } finally {
    if (prevRunsRoot === undefined) delete process.env[RUNS_ROOT_ENV]; else process.env[RUNS_ROOT_ENV] = prevRunsRoot;
    if (runsRoot) fs.rmSync(runsRoot, { recursive: true, force: true });
  }
}, 60000);

/** 只抹「每次运行必然不同」的值；语义字段原样保留 */
function normalize(value, key = '', ctx = {}) {
  if (Array.isArray(value)) return value.map((v) => normalize(v, key, ctx));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = normalize(value[k], k, ctx);
    if (Object.prototype.hasOwnProperty.call(out, 'legacy_jobs') && Object.prototype.hasOwnProperty.call(out, 'ruler_records')) {
      out.legacy_jobs = '<count>'; // 全库计数（其它套件残留会影响）不参与深比较
      out.ruler_records = '<count>';
    }
    return out;
  }
  if (typeof value === 'string') {
    let s = value;
    if (ctx.runsRoot) s = s.split(ctx.runsRoot).join('<runsRoot>');
    s = s.replace(/archive-build-\d+-\d{8}T\d{6}Z/g, 'archive-build-<a>-<ts>');
    s = s.replace(/build-\d+-\d{8}T\d{6}Z/g, 'build-<a>-<ts>');
    s = s.replace(/build:\d+:/g, 'build:<a>:');
    s = s.replace(/ruler-\d+-\d+/g, 'ruler-<a>-<r>');
    s = s.replace(/job-\d+/g, 'job-<id>');
    s = s.replace(/job:\d+/g, 'job:<id>');
    s = s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<ts>');
    if (/^\d+$/.test(s)) return s.length >= 3 ? '<n>' : Number(s);
    return s;
  }
  if (typeof value === 'number') {
    if (key === 'elapsed_ms') return '<elapsed>';
    if (Number.isInteger(value) && Math.abs(value) >= 1000) return '<n>';
    return value;
  }
  return value;
}

function normalizeBody(body, ctx) {
  const out = JSON.parse(JSON.stringify(body));
  return normalize(out, '', ctx);
}

function normalizeListBody(body, ctx) {
  const out = normalizeBody(body, ctx);
  if (out && out.data && Array.isArray(out.data.items)) {
    out.data.items = out.data.items.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

describe('C6 B3 拆分回归：管理员批改记录列表/详情深比较', () => {
  it('C6-B3-1 拆分前后 6 个 HTTP 响应体深比较一致（列表 + 筛选 + 4 类详情）', async () => {
    const admin = authReq(await loginAsAdmin());
    const listUrl = (extra = '') => '/api/admin/grading-runs?page=1&pageSize=100&assignmentId=' + assignmentId + extra;

    const responses = {
      list: normalizeListBody((await admin.get(listUrl())).body, { runsRoot }),
      list_build: normalizeListBody((await admin.get(listUrl('&run_kind=build'))).body, { runsRoot }),
      detail_archived: normalizeBody((await admin.get('/api/admin/grading-runs/job-' + jobArchived.id)).body, { runsRoot }),
      detail_sentinel: normalizeBody((await admin.get('/api/admin/grading-runs/job-' + jobSentinel.id)).body, { runsRoot }),
      detail_ruler: normalizeBody((await admin.get('/api/admin/grading-runs/ruler-' + assignmentId + '-' + ruler2Id)).body, { runsRoot }),
      detail_build_archive: normalizeBody((await admin.get('/api/admin/grading-runs/archive-' + buildArchiveName)).body, { runsRoot }),
    };

    // 合理性守卫：基线不能是空壳（防止「两边都空」假绿）
    expect(responses.list.code).toBe(0);
    expect(responses.list.data.items.length).toBeGreaterThanOrEqual(7);
    expect(responses.list_build.data.items.every((x) => x.run_kind === 'build')).toBe(true);
    expect(responses.detail_archived.data.read_only).toBe(true);
    expect(responses.detail_archived.data.submissions_source).toBe('archive_evidence_summary');
    expect(responses.detail_ruler.data.submissions_source).toBe('db_by_checker');
    expect(JSON.stringify(responses)).not.toContain(SECRET_ANSWER);
    expect(JSON.stringify(responses)).not.toContain(SECRET_KEY);

    if (CAPTURE) {
      const meta = {
        schema: 'c6-regression/1',
        note: 'B3 拆分前抓取（read-model.js 781 行）；比较对象=归一化后的 HTTP 响应体',
        captured: { read_model_sha256: sha256File(READ_MODEL), read_model_lines: lineCount(READ_MODEL), captured_at: new Date().toISOString() },
      };
      fs.writeFileSync(BASELINE, JSON.stringify({ ...meta, responses }, null, 2) + String.fromCharCode(10));
      // 抓取模式亦做一次自比较（基线可用性）
      expect(responses.list.data.items.length).toBeGreaterThanOrEqual(7);
      return;
    }

    expect(fs.existsSync(BASELINE)).toBe(true);
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    expect(baseline.schema).toBe('c6-regression/1');
    expect(baseline.responses).toBeTruthy();
    expect(responses).toEqual(baseline.responses);
  }, 120000);

  it('C6-B3-2 只读复核：深比较前后 submissions 分数与 job 行数不变', async () => {
    const after = await prisma.submission.findMany({ where: { assignmentId }, select: { id: true, aiScore: true, checkerId: true }, orderBy: { id: 'asc' } });
    expect(after).toEqual(scoresBefore);
    expect(await prisma.gradingJob.count({ where: { assignmentId } })).toBe(5);
  }, 60000);
});
