/**
 * W56（R2-B24）：管理员「批改记录」只读接口的控制器语义 —— 列表/详情/日志、worker+build 两类归档、
 * 空数据与缺日志不 500、sk- 脱敏、目录名白名单（穿越防护）、只读结构守卫。全部用临时归档夹具（不触库）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getGradingRun, getGradingRunLog, listGradingRuns, maskSecrets, safeArchiveDir } from '../../src/controllers/adminGradingRunsController.js';

const RUNS_ROOT_ENV = 'DSH_GRADER_RUNS_ROOT';
const OLD_ROOT = process.env[RUNS_ROOT_ENV];
let ROOT = null;

function fakeRes() {
  const res = { statusCode: 200, body: null, text: null, typeValue: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (t) => { res.text = t; return res; };
  res.type = (t) => { res.typeValue = t; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  return res;
}

function mkWorkerArchive(jobId, { sessionsPurged = true, log = 'ok', lines = 3 } = {}) {
  const dir = path.join(ROOT, String(jobId));
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'run-teardown.json'), JSON.stringify({
    isolated_home: '/tmp/x/home', home_exists_before: 'yes', credentials_removed: 'yes',
    session_files_before: sessionsPurged ? 3 : 3, session_bytes: 124622, sessions_purged: sessionsPurged,
    home_exists_after: 'yes', session_files_after: sessionsPurged ? 0 : 3, home_policy: 'sessions+credentials',
    purge_policy: 'purge_home=1 keep_days=3 exit=0', keep_scene: !sessionsPurged, source: 'worker', ts: '2026-10-13T00:00:00Z',
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'evidence-summary.json'), JSON.stringify({ schema_version: 'evidence-summary/1', n: 2, measurable: 1, unmeasurable: 1, submissions: [
    { slug: 'z1', measurable: true, score: 88 }, { slug: 'z2', measurable: false, reason: 'java_project' }] }));
  const body = [];
  for (let i = 0; i < lines; i += 1) body.push('line-' + i + ' DEEPSEEK_API_KEY=sk-live-abcdef1234567890');
  fs.writeFileSync(path.join(dir, 'device.stdout.log'), body.join(String.fromCharCode(10)) + String.fromCharCode(10) + log);
  fs.writeFileSync(path.join(dir, 'device.stderr.log'), 'err-tail' + String.fromCharCode(10));
  return dir;
}

function mkBuildArchive(assignmentId = 9) {
  const name = 'build-' + assignmentId + '-20261013T001500Z';
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run-teardown.json'), JSON.stringify({ sessions_purged: true, session_files_before: 6, session_files_after: 0, credentials_removed: 'yes', home_policy: 'sessions+credentials', home_exists_after: 'yes', keep_scene: false, source: 'build', ts: '2026-10-13T00:15:00Z' }));
  return { name, dir };
}

beforeAll(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'w56-runs-root-'));
  process.env[RUNS_ROOT_ENV] = ROOT;
  mkWorkerArchive(4, { sessionsPurged: true });
  mkWorkerArchive(5, { sessionsPurged: false });
  mkBuildArchive(9);
});
afterAll(() => {
  if (OLD_ROOT === undefined) delete process.env[RUNS_ROOT_ENV]; else process.env[RUNS_ROOT_ENV] = OLD_ROOT;
  if (ROOT) fs.rmSync(ROOT, { recursive: true, force: true });
});

describe('W56 管理员批改记录（只读接口语义）', () => {
  it('★W56-1 列表：覆盖 worker（表行缺失也能由归档合成）与 build 两类；分页与筛选生效', async () => {
    const res = fakeRes();
    await listGradingRuns({ query: { page: '1', pageSize: '10' } }, res);
    expect(res.statusCode).toBe(200);
    const d = res.body.data;
    expect(d.items.length).toBe(3);
    const types = d.items.map((x) => x.type).sort();
    expect(types).toEqual(['build', 'worker', 'worker']);
    const build = d.items.find((x) => x.type === 'build');
    expect(build.source).toBe('build');
    expect(build.sessions_purged).toBe(true);
    const notPurged = d.items.find((x) => x.type === 'worker' && x.archive === '5');
    expect(notPurged.sessions_purged).toBe(false);
    expect(d.source.archives_root).toBe(ROOT);
    const res2 = fakeRes();
    await listGradingRuns({ query: { sessions_purged: 'no' } }, res2);
    expect(res2.body.data.items.map((x) => x.archive)).toEqual(['5']);
    const res3 = fakeRes();
    await listGradingRuns({ query: { type: 'build' } }, res3);
    expect(res3.body.data.items.length).toBe(1);
  });

  it('★W56-2 详情：teardown_json 全量 + 逐份摘要 + 日志尾部（≤200 行）；缺日志不 500', async () => {
    const res = fakeRes();
    await getGradingRun({ params: { id: 'job-4' }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.teardown_json.sessions_purged).toBe(true);
    expect(res.body.data.teardown_json.purge_policy).toContain('purge_home=1');
    expect(res.body.data.submissions.map((s) => s.slug)).toEqual(['z1', 'z2']);
    expect(res.body.data.submission_counts.unmeasurable).toBe(1);
    expect(res.body.data.logs.stdout.present).toBe(true);
    expect(res.body.data.read_only).toBe(true);
    const res2 = fakeRes();
    await getGradingRun({ params: { id: 'archive-build-9-20261013T001500Z' }, query: {} }, res2);
    expect(res2.body.data.run.type).toBe('build');
    expect(res2.body.data.logs.stdout.present).toBe(false);
    expect(res2.body.data.logs.stdout.missing_reason).toBe('missing');
    expect(res2.statusCode).toBe(200);
  });

  it('★★W56-3 脱敏：日志与证据里的 sk- 一律输出为 sk-****（不泄漏原文）', async () => {
    const res = fakeRes();
    await getGradingRunLog({ params: { id: 'job-4' }, query: { kind: 'stdout' } }, res);
    expect(res.text).toContain('sk-****');
    expect(res.text).not.toContain('sk-live-abcdef1234567890');
    expect(maskSecrets('x sk-abc123 y')).toBe('x sk-**** y');
  });

  it('★★W56-4 目录名白名单/穿越防护：非法 id 与非法目录名一律 400 且 safeArchiveDir 返回 null', async () => {
    for (const bad of ['job-../etc', 'job-..', 'archive-../../etc', 'archive-x/y', 'job-4/../../..']) {
      const res = fakeRes();
      await getGradingRun({ params: { id: bad }, query: {} }, res);
      expect(res.statusCode).toBe(400);
    }
    const res2 = fakeRes();
    await getGradingRunLog({ params: { id: 'job-4' }, query: { kind: 'etc-passwd' } }, res2);
    expect(res2.statusCode).toBe(400);
    expect(safeArchiveDir('../x')).toBe(null);
    expect(safeArchiveDir('/etc/passwd')).toBe(null);
    expect(safeArchiveDir('a/b')).toBe(null);
    expect(safeArchiveDir('ok-1_2.name')).toBe(path.join(path.resolve(ROOT), 'ok-1_2.name'));
  });

  it('W56-5 空数据：归档根不存在/为空 ⇒ 列表 200 + items=[]（不 500）', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'w56-empty-'));
    const old = process.env[RUNS_ROOT_ENV];
    process.env[RUNS_ROOT_ENV] = empty;
    const res = fakeRes();
    await listGradingRuns({ query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
    process.env[RUNS_ROOT_ENV] = old;
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it('★W56-6 只读结构守卫：控制器无任何写路径；路由只有 GET', () => {
    const ctrl = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/adminGradingRunsController.js'), 'utf8');
    // 只禁「数据库写/文件写」，不禁 Map/Set 的 .delete（避免误伤 byJob.delete）
    for (const bad of ['$executeRawUnsafe', '$executeRaw(', 'prisma.assignment.create', '.upsert(', 'fs.writeFileSync', 'fs.rmSync', 'fs.mkdirSync', 'fs.appendFileSync']) {
      expect(ctrl.includes(bad)).toBe(false);
    }
    expect(ctrl.includes('$queryRawUnsafe')).toBe(true);
    const routes = fs.readFileSync(path.resolve(process.cwd(), 'src/interface/http/routes/admin.js'), 'utf8');
    expect((routes.match(/router\.get\(/g) || []).length).toBe(3);
    expect(/router\.(post|put|patch|delete)\(/.test(routes)).toBe(false);
  });
});

describe('W56b 不存在的运行 ⇒ 404（R2-B34 / O-1）', () => {
  it('★W56b-1 归档与数据库行都不存在的 id ⇒ 404（不再是 200 占位）', async () => {
    const res = fakeRes();
    await getGradingRun({ params: { id: 'job-999999' }, query: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe(1002);
    const res2 = fakeRes();
    await getGradingRun({ params: { id: 'archive-build-9-20990101T000000Z' }, query: {} }, res2);
    expect(res2.statusCode).toBe(404);
  });

  it('★W56b-2 存在的归档 ⇒ 仍 200（反向对照，避免 404 过宽）', async () => {
    const res = fakeRes();
    await getGradingRun({ params: { id: 'job-4' }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.run.archive).toBe('4');
  });
});
