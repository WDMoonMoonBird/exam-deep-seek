/**
 * w57-U（R2-B37 / t4）：「批改记录」只读 API 的**用量/元信息/工具调用**扩展 + 前端源码契约。
 *
 * 覆盖：①鉴权与只读（未登录 401/403；非 GET 无路由）；②列表增列 cost_total/cost_currency/cache_hit_rate/no_model_session；
 * ③详情三块 usage/meta/tools 字段齐备（meta 含老师/班级全量/作业名+ID/标准工程包短 sha+文件名+可折叠 manifest/题目描述/评分标准快照）；
 * ④零 LLM ⇒ no_model_session=true（页面文案「本次无模型会话（零 token）」在 §源码契约 断言）；
 * ⑤空数据/表缺失 ⇒ 200 且 usage=null + reason（不 500、不显示假 0）；⑥前端 BASE_URL 铁律（无裸根路径）。
 * 仅测试库；归档根用临时目录（DSH_GRADER_RUNS_ROOT）；探针自清理。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { authReq, getTestData, request } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const CLIENT_PAGE = path.join(REPO, 'client/src/views/admin/GradingRuns.vue');
const RUNS_ROOT_ENV = 'DSH_GRADER_RUNS_ROOT';
const TAG = 'w57u-' + Date.now();
const prevRunsRoot = process.env[RUNS_ROOT_ENV];
const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w57u-runs-'));
const cleanup = { assignmentIds: [], questionIds: [], userIds: [], classIds: [], jobIds: [], runRefs: [] };
let token = null;

const NL = String.fromCharCode(10);

function writeArchive(dirName, teardown, { evidence = null, usage = null } = {}) {
  const d = path.join(runsRoot, dirName);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'run-teardown.json'), JSON.stringify(teardown, null, 2));
  if (evidence) fs.writeFileSync(path.join(d, 'evidence-summary.json'), JSON.stringify(evidence, null, 2));
  if (usage) fs.writeFileSync(path.join(d, 'session-usage.json'), JSON.stringify(usage, null, 2));
  return d;
}

async function mkQuestion(attachmentUrl) {
  const t = await prisma.user.create({ data: { username: TAG + '-t' + Math.random().toString(36).slice(2, 8), password: 'x', role: 'teacher', realName: 'W57U 老师' } });
  cleanup.userIds.push(t.id);
  const q = await prisma.question.create({
    data: {
      teacherId: t.id, title: TAG + ' 题目', type: 'project', difficulty: 'medium',
      material: '题目材料全文（快照）', scoringRubric: '评分标准全文（快照）', maxScore: 100, attachmentUrl,
    },
  });
  cleanup.questionIds.push(q.id);
  return { teacher: t, question: q };
}

async function mkAssignment({ teacherId, questionId, rubric, material, classes = [] }) {
  const a = await prisma.assignment.create({ data: { teacherId, title: TAG + ' 作业', startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
  cleanup.assignmentIds.push(a.id);
  await prisma.assignmentQuestion.create({
    data: {
      assignmentId: a.id, questionId, sortOrder: 1,
      rubricSnapshot: { rubric, rubricItems: null, rubricSha256: 'sha256:' + 'a'.repeat(64), capturedAt: '2026-10-13T00:00:00.000Z' },
      materialSnapshot: material, standardHash: 'sha256:' + 'b'.repeat(64), snapshotOrigin: 'publish',
    },
  });
  for (const cid of classes) await prisma.assignmentClass.create({ data: { assignmentId: a.id, classId: cid } });
  return a.id;
}

async function mkClasses(n) {
  const ids = [];
  const schoolId = getTestData().schoolId;
  for (let i = 0; i < n; i += 1) {
    const c = await prisma.class.create({ data: { schoolId, name: TAG + '-班级' + (i + 1) } });
    cleanup.classIds.push(c.id);
    ids.push(c.id);
  }
  return ids;
}

const FULL_TEARDOWN = {
  isolated_home: '/tmp/x/home', credentials_removed: 'yes', session_files_before: 3, session_bytes: 100,
  sessions_purged: true, session_files_after: 0, home_policy: 'sessions+credentials',
  purge_policy: 'purge_home=1 keep_days=3 exit=0', keep_scene: false, source: 'worker', failed: 0, ts: '2026-10-13T00:00:00.000Z',
  usage: { model_calls: 46, uncached_input_tokens: 63015, output_tokens: 36521, cache_read_tokens: 3494528, cache_write_tokens: 0, cache_hit_rate: 0.982287, cost_total: 0.27899, cost_currency: 'CNY', price_version: '2026-10-13', price_tier: 'idle', no_model_session: false, tools: 3, tools_source: 'session_jsonl' },
};

describe('W57-U 批改记录：用量/元信息/工具调用（R2-B37）', () => {
  let a1 = null; let t1 = null; let q1 = null; let jobId = null; let jobIdZero = null; let jobIdEmpty = null;

  beforeAll(async () => {
    process.env[RUNS_ROOT_ENV] = runsRoot;
    token = (await request().post('/api/auth/login').send({ username: 'admin', password: '***REDACTED***' })).body.data.token;
    const { teacher, question } = await mkQuestion('标准工程包-原始.zip');
    t1 = teacher; q1 = question;
    const classes = await mkClasses(2);
    a1 = await mkAssignment({ teacherId: teacher.id, questionId: question.id, rubric: '评分标准全文（快照）', material: '题目材料全文（快照）', classes });
    // ① 有用量（worker 路径）
    jobId = 900000 + (Date.now() % 90000);
    cleanup.jobIds.push(jobId);
    // 注：grading_job_runs 在当前 schema 里**没有 failed 列**（差量建表缺列）⇒ 不带该列插入（控制器有兼容回退）
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_job_runs (job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, created_at, updated_at) '
      + 'VALUES (?, ?, ?, NOW(3), NOW(3), 0, 2, 0, 0, 2, NOW(3), NOW(3))', jobId, a1, 'sha256:' + 'c'.repeat(64),
    );
    const ref = 'job:' + jobId;
    cleanup.runRefs.push(ref);
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_run_usage (run_ref, job_id, model, model_calls, uncached_input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, '
      + 'cache_hit_rate, cost_total, cost_currency, price_version, price_tier, no_model_session, tools_json, sessions_json, usage_json, created_at, updated_at) '
      + 'VALUES (?, ?, ?, 46, 63015, 36521, 3494528, 0, 0.982287, 0.278990, ?, ?, ?, 0, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), NOW(3), NOW(3))',
      ref, jobId, 'deepseek-v4-flash', 'CNY', '2026-10-13:db', 'idle',
      JSON.stringify([{ name: 'run_code', count: 136, ms: 860177, errors: 0 }, { name: 'bash', count: 74, ms: 17227, errors: 5 }, { name: 'read', count: 38, ms: 83, errors: 2 }]),
      JSON.stringify([{ session_id: 'session-1' }]), JSON.stringify({ schema: 'session-usage/1', calls: null }),
    );
    writeArchive(String(jobId), FULL_TEARDOWN, { evidence: { schema: 'evidence-summary/2', n: 2, measurable: 2, unmeasurable: 0, skipped_artifacts: 0, submissions: [{ slug: 's01', score: 62, measurable: true }] } });
    // ② 零 LLM（复用/量尺）
    jobIdZero = jobId + 1;
    cleanup.jobIds.push(jobIdZero);
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_job_runs (job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, created_at, updated_at) '
      + 'VALUES (?, ?, ?, NOW(3), NOW(3), 0, 2, 0, 0, 2, NOW(3), NOW(3))', jobIdZero, a1, 'sha256:' + 'c'.repeat(64),
    );
    const refZero = 'job:' + jobIdZero;
    cleanup.runRefs.push(refZero);
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_run_usage (run_ref, job_id, model, model_calls, uncached_input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, '
      + 'cache_hit_rate, cost_total, cost_currency, price_version, price_tier, no_model_session, tools_json, sessions_json, usage_json, created_at, updated_at) '
      + 'VALUES (?, ?, NULL, 0, 0, 0, 0, 0, NULL, 0, ?, ?, ?, 1, NULL, CAST(? AS JSON), CAST(? AS JSON), NOW(3), NOW(3))',
      refZero, jobIdZero, 'CNY', '2026-10-13:db', 'idle', JSON.stringify([]), JSON.stringify({ schema: 'session-usage/1', no_model_session: true }),
    );
    writeArchive(String(jobIdZero), { ...FULL_TEARDOWN, usage: { model_calls: 0, uncached_input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cost_total: 0, cost_currency: 'CNY', no_model_session: true, tools: null, tools_source: 'unavailable' } });
    // ③ 归档存在、有 job_runs 行，但**无用例行**（旧运行）⇒ 空数据语义
    jobIdEmpty = jobId + 2;
    cleanup.jobIds.push(jobIdEmpty);
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_job_runs (job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, created_at, updated_at) '
      + 'VALUES (?, ?, ?, NOW(3), NOW(3), 0, 0, 0, 0, 0, NOW(3), NOW(3))', jobIdEmpty, a1, 'sha256:' + 'c'.repeat(64),
    );
    writeArchive(String(jobIdEmpty), { ...FULL_TEARDOWN, usage: null });
  }, 120000);

  afterAll(async () => {
    for (const ref of cleanup.runRefs) await prisma.$executeRawUnsafe('DELETE FROM grading_run_usage WHERE run_ref = ?', ref).catch(() => {});
    for (const jid of cleanup.jobIds) await prisma.$executeRawUnsafe('DELETE FROM grading_job_runs WHERE job_id = ?', jid).catch(() => {});
    for (const aid of cleanup.assignmentIds) {
      await prisma.assignmentClass.deleteMany({ where: { assignmentId: aid } }).catch(() => {});
      await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: aid } }).catch(() => {});
      await prisma.assignment.deleteMany({ where: { id: aid } }).catch(() => {});
      fs.rmSync(path.join(runsRoot, String(aid)), { recursive: true, force: true });
    }
    for (const jid of cleanup.jobIds) fs.rmSync(path.join(runsRoot, String(jid)), { recursive: true, force: true });
    await prisma.question.deleteMany({ where: { id: { in: cleanup.questionIds } } });
    await prisma.class.deleteMany({ where: { id: { in: cleanup.classIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
    if (prevRunsRoot === undefined) delete process.env[RUNS_ROOT_ENV]; else process.env[RUNS_ROOT_ENV] = prevRunsRoot;
    fs.rmSync(runsRoot, { recursive: true, force: true });
  }, 120000);

  it('W57-U1 鉴权与只读：未登录 401/403；管理员 GET 200；非 GET 无路由（404）', async () => {
    const anonList = await request().get('/api/admin/grading-runs');
    expect([401, 403]).toContain(anonList.status);
    const anonDetail = await request().get('/api/admin/grading-runs/job-' + jobId);
    expect([401, 403]).toContain(anonDetail.status);
    const admin = authReq(token);
    expect((await admin.get('/api/admin/grading-runs')).status).toBe(200);
    expect((await admin.get('/api/admin/grading-runs/job-' + jobId)).status).toBe(200);
    const put = await admin.put('/api/admin/grading-runs/job-' + jobId, { anything: 1 });
    expect([404, 405]).toContain(put.status); // 只读：无写路由
  }, 120000);

  it('W57-U2 ★列表增列：cost_total/cost_currency/cache_hit_rate/no_model_session（含 worker 与 build 两条路径的用量键）', async () => {
    const admin = authReq(token);
    const res = await admin.get('/api/admin/grading-runs?pageSize=100');
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const row = items.find((x) => String(x.archive) === String(jobId));
    expect(row).toBeTruthy();
    expect(row.cost_total).toBeCloseTo(0.27899, 6);
    expect(row.cost_currency).toBe('CNY');
    expect(row.cache_hit_rate).toBeCloseTo(0.982287, 6);
    expect(row.no_model_session).toBe(false);
    expect(row.model_calls).toBe(46);
    const zero = items.find((x) => String(x.archive) === String(jobIdZero));
    expect(zero.no_model_session).toBe(true);
    expect(zero.cost_total).toBe(0);
    expect(zero.cache_hit_rate).toBeNull();       // 无输入 ⇒ null（不写假 0/假 1）
    expect(res.body.data.source.usage_table).toBe('grading_run_usage');
    // 造尺（build）归档：run_ref=build:<aid>:<dir> 也能取到用量
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const buildDir = 'build-' + a1 + '-' + stamp;
    writeArchive(buildDir, { ...FULL_TEARDOWN, source: 'build' });
    const buildRef = 'build:' + a1 + ':' + buildDir;
    cleanup.runRefs.push(buildRef);
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_run_usage (run_ref, job_id, model_calls, uncached_input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_total, cost_currency, price_version, no_model_session, created_at, updated_at) '
      + 'VALUES (?, NULL, 7, 100, 200, 300, 0, 1.5, ?, ?, 0, NOW(3), NOW(3))', buildRef, 'CNY', '2026-10-13:db',
    );
    const res2 = await admin.get('/api/admin/grading-runs?type=build&pageSize=100');
    const buildRow = res2.body.data.items.find((x) => x.archive === buildDir);
    expect(buildRow).toBeTruthy();
    expect(buildRow.cost_total).toBeCloseTo(1.5, 6);
    expect(String(buildRef)).toBe('build:' + a1 + ':' + buildDir); // 键口径与 R2-B36 落库一致
    fs.rmSync(path.join(runsRoot, buildDir), { recursive: true, force: true });
  }, 120000);

  it('W57-U3 ★详情三块齐备：usage（token 四项+命中率+费用+调用次数+价目版本）/ meta（老师/班级全量/作业/标准工程包短 sha+文件名+manifest/描述/评分标准）/ tools', async () => {
    const admin = authReq(token);
    const res = await admin.get('/api/admin/grading-runs/job-' + jobId);
    expect(res.status).toBe(200);
    const d = res.body.data;
    // usage
    expect(d.usage_info.available).toBe(true);
    expect(d.usage.source).toBe('grading_run_usage');
    for (const k of ['uncached_input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'cache_hit_rate', 'cost_total', 'cost_currency', 'model_calls', 'price_version', 'no_model_session', 'price_tier', 'model']) {
      expect(d.usage).toHaveProperty(k);
    }
    expect(d.usage.uncached_input_tokens).toBe(63015);
    expect(d.usage.cache_read_tokens).toBe(3494528);
    expect(d.usage.cost_total).toBeCloseTo(0.27899, 6);
    expect(d.usage.model_calls).toBe(46);
    expect(d.usage.price_version).toBe('2026-10-13:db');
    expect(d.usage.no_model_session).toBe(false);
    // meta
    expect(d.meta.assignment.id).toBe(a1);
    expect(d.meta.assignment.title).toBe(TAG + ' 作业');
    expect(d.meta.teacher).toBeTruthy();
    expect(d.meta.teacher.name).toContain('W57U');
    expect(d.meta.classes.length).toBe(2);                       // ★班级全量
    expect(d.meta.classes.map((c) => c.name).sort()).toEqual([TAG + '-班级1', TAG + '-班级2']);
    expect(d.meta.standard_package.sha256).toBe('sha256:' + 'b'.repeat(64));
    expect(d.meta.standard_package.short_sha256).toHaveLength(12); // ★短 sha（前 12 位）
    expect(d.meta.standard_package.short_sha256).toBe('b'.repeat(12));
    expect(d.meta.standard_package.file_name).toBe('标准工程包-原始.zip'); // ★文件名（题目附件名）
    expect(d.meta.standard_package.download).toBe(false);        // 不提供下载
    expect(typeof d.meta.standard_package.manifest).toBe('object'); // ★可折叠 manifest 摘要
    expect(d.meta.standard_package.manifest.standard_hash).toBe('sha256:' + 'b'.repeat(64));
    expect(d.meta.description.text).toBe('题目材料全文（快照）');   // 题目描述（快照）
    expect(d.meta.description.from_snapshot).toBe(true);
    expect(d.meta.rubric.text).toBe('评分标准全文（快照）');        // 评分标准（快照）
    expect(d.meta.rubric.from_snapshot).toBe(true);
    expect(d.meta.questions.length).toBe(1);
    // tools
    expect(d.tools_info.available).toBe(true);
    expect(Array.isArray(d.tools)).toBe(true);
    expect(d.tools.find((t) => t.name === 'bash')).toEqual({ name: 'bash', count: 74, ms: 17227, errors: 5 });
    expect(d.read_only).toBe(true);
  }, 120000);

  it('W57-U4 ★零 LLM：usage 全 0 + no_model_session=true（列表与详情一致）；页面文案「本次无模型会话（零 token）」存在', async () => {
    const admin = authReq(token);
    const res = await admin.get('/api/admin/grading-runs/job-' + jobIdZero);
    const d = res.body.data;
    expect(d.usage.no_model_session).toBe(true);
    expect([d.usage.uncached_input_tokens, d.usage.output_tokens, d.usage.cache_read_tokens, d.usage.cache_write_tokens]).toEqual([0, 0, 0, 0]);
    expect(d.usage.cost_total).toBe(0);
    expect(d.usage.cache_hit_rate).toBeNull();
    expect(d.tools).toBeNull();
    expect(d.tools_info.available).toBe(false);
    expect(d.tools_info.reason).toBe('tools_unavailable');
    expect(d.run.no_model_session).toBe(true);
    // 页面文案（源码契约：零 LLM 语义必须可见）
    const page = fs.readFileSync(CLIENT_PAGE, 'utf8');
    expect(page).toContain('本次无模型会话（零 token）');
  }, 120000);

  it('W57-U5 ★空数据语义：无用例行（旧运行）⇒ 200 + usage=null + reason；列表同列为 null（不显示假 0）', async () => {
    const admin = authReq(token);
    const res = await admin.get('/api/admin/grading-runs/job-' + jobIdEmpty);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.usage).toBeNull();
    expect(d.usage_info.available).toBe(false);
    expect(d.usage_info.reason).toBe('no_usage_record');
    expect(d.tools).toBeNull();
    expect(d.tools_info.reason).toBe('no_usage_record');
    expect(d.meta.assignment.id).toBe(a1); // 元信息仍可用（不因缺用量而消失）
    const list = await admin.get('/api/admin/grading-runs?pageSize=100');
    const row = list.body.data.items.find((x) => String(x.archive) === String(jobIdEmpty));
    expect(row.cost_total).toBeNull();
    expect(row.cache_hit_rate).toBeNull();
    expect(row.no_model_session).toBeNull();
  }, 120000);

  it('W57-U6 ★usage 表缺失 ⇒ 200（不 500）+ reason=usage_table_missing（finally 必恢复）', async () => {
    const admin = authReq(token);
    const mig = fs.readFileSync(path.join(REPO, 'server/prisma/migrations/20261013120000_r2b36_grading_run_usage/migration.sql'), 'utf8');
    const restore = async () => {
      const exists = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'grading_run_usage'");
      if (Number(exists[0].n) === 0) {
        for (const stmt of mig.split(';').map((s) => s.split(NL).filter((l) => !l.trim().startsWith('--')).join(NL)).map((s) => s.trim()).filter(Boolean)) {
          await prisma.$executeRawUnsafe(stmt);
        }
      }
    };
    try {
      await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS grading_run_usage');
      const list = await admin.get('/api/admin/grading-runs?pageSize=10');
      expect(list.status).toBe(200);
      expect(list.body.data.source.usage_table).toBeNull();
      const detail = await admin.get('/api/admin/grading-runs/job-' + jobId);
      expect(detail.status).toBe(200);
      // 表缺失 ⇒ 如实标注 table_missing，并**回落到 run-teardown.json 摘要**（不 500、不显示假 0）
      expect(detail.body.data.usage_info.table_missing).toBe(true);
      expect(String(detail.body.data.usage_info.note)).toContain('usage_table_missing');
      expect(detail.body.data.usage.source).toBe('teardown_json');
      expect(detail.body.data.usage.cost_total).toBeCloseTo(0.27899, 6);
      expect(detail.body.data.usage.price_version).toBe('2026-10-13');
      // 无用例行 + 无 teardown 摘要的运行 ⇒ usage=null + reason（U5 已单独覆盖）
      const empty = await admin.get('/api/admin/grading-runs/job-' + jobIdZero);
      expect(empty.body.data.usage_info.table_missing).toBe(true);
    } finally {
      await restore();
    }
    const after = await admin.get('/api/admin/grading-runs/job-' + jobId);
    expect(after.body.data.usage.cost_total).toBeCloseTo(0.27899, 6); // 恢复后照常
  }, 120000);

  it('W57-U7 前端源码契约：三块面板齐备 / 中文化标签（原键进 tooltip）/ BASE_URL 铁律 / 零 LLM 文案 / 走既有 axios 实例', () => {
    const page = fs.readFileSync(CLIENT_PAGE, 'utf8');
    expect(page).toContain('用量');
    expect(page).toContain('元信息');
    expect(page).toContain('工具调用');
    expect(page).toContain('本次无模型会话（零 token）');
    // ★队长追加：列表与详情中文化（中文标签为主；英文原键保留在 tooltip/小字里）
    for (const zh of ['批改运行', '造尺运行', '装置退出码', '已量尺', '不可量', '无法评分', '未写分', '已写分',
      '销毁范围', '会话是否销毁', '会话文件数（前 → 后）', '会话字节数', '凭据是否删除', '隔离目录是否保留',
      '销毁策略', '证据来源', '证据时间', '运行标识', '输入（未命中缓存）', '输入（命中缓存）', '输出', '缓存命中率', '费用']) {
      expect(page).toContain(zh);
    }
    expect(page).toContain('不适用（无模型调用）');            // cache_hit_rate 的 na 中文语义
    expect(page).toContain('¥');                              // 费用 ¥ 显示
    expect((page.match(/原键/g) || []).length).toBeGreaterThanOrEqual(12); // 英文原键保留在 tooltip/小字
    expect(page).toContain('成功即销毁会话');                   // purge_policy 人话化
    expect(page).toContain('失败保留现场');
    expect(page).toContain("from '../../api/request.js'");
    expect(page).toContain('/admin/grading-runs');
    // ★BASE_URL 铁律：本页不引入任何绝对根路径资源（img/src="/…"、href="/…"、url(/…)）
    expect(/src="\/(?!\/)/.test(page)).toBe(false);
    expect(/href="\/(?!\/)/.test(page)).toBe(false);
    expect(/url\(\s*['"]?\/(?!\/)/.test(page)).toBe(false);
    // 若页面使用 import.meta.env.BASE_URL，则必须来自 BASE_URL（而非裸根）
    if (page.includes('BASE_URL')) expect(page).toContain('import.meta.env.BASE_URL');
  });
});
