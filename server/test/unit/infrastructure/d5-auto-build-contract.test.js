/**
 * C15（t40）D5 语义锁定：
 *   ① project-submit 不再触发评分（静态契约 + 手动重评兜底仍在）；
 *   ② 截止扫描建 __AUTO_BUILD__ pending job；
 *   ③ build / reuse 分类（同题同内容 ⇒ reuse，零 LLM 的判据在 worker，读模型需给出 ruler 证据）；
 *   ④ 管理员读模型 D5 新字段：content_key / ruler_id / ruler_status / historical_archive_only；
 *   ⑤ status 过滤在合并后执行（grading_job_runs 无 status 列，不能塞进 SQL）。
 *
 * 全部 fake prisma + 临时归档目录，不查库、不起服务。
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDueAssignments } from '../../../src/infrastructure/dsh/worker/dueAssignmentScanner.js';
import { AUTO_BUILD_CHECKER, isAutoBuildChecker, formatSessionScope } from '../../../src/infrastructure/dsh/worker/autoBuild.js';
import { classifyJobKind } from '../../../src/infrastructure/dsh/runs/read-model/legacy-jobs.js';
import { createDshRunsReadModel } from '../../../src/infrastructure/dsh/runs/read-model.js';
import { RUNS_ROOT_ENV } from '../../../src/infrastructure/dsh/runs/dshRunArchiver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../src');
const silent = { info() {}, warn() {}, log() {} };
const K = 'c15contentkey'.padEnd(64, 'a');

function fakePrisma({ runRows = [], jobRows = [], rulerRows = [], legacyRulerRows = [], usageRows = [], sqlLog = [] } = {}) {
  return {
    $queryRawUnsafe: async (sql, ...params) => {
      sqlLog.push({ sql: String(sql), params });
      const s = String(sql);
      if (/FROM grading_job_runs/.test(s)) return runRows;
      if (/FROM grading_jobs/.test(s)) return jobRows;
      if (/FROM grading_rulers r JOIN assignment_question_rulers/.test(s)) return legacyRulerRows;
      if (/FROM grading_rulers/.test(s)) return rulerRows;
      if (/FROM grading_run_usage/.test(s)) return usageRows;
      return [];
    },
    gradingJob: { findFirst: async () => null, create: async () => ({ id: 1 }) },
  };
}

describe('C15-D5 截止造尺/复用契约', () => {
  it('C15-1 project-submit 不再 import/调用 enqueueProjectGrade；手动重评仍导出兜底', () => {
    const submit = fs.readFileSync(path.join(SRC, 'interface/http/controllers/student/project-submit.js'), 'utf8');
    expect(submit).not.toContain("from '../../../../services/projectGrading.js'");
    expect(submit).not.toMatch(/enqueueProjectGrade\s*\(/);
    expect(submit).toContain('不再');
    const grading = fs.readFileSync(path.join(SRC, 'services/projectGrading.js'), 'utf8');
    expect(grading).toMatch(/export function enqueueProjectGrade\s*\(/);
  });

  it('C15-2 截止扫描：建 __AUTO_BUILD__ pending job（哨兵 checker）', async () => {
    const prisma = fakePrisma();
    prisma.$queryRawUnsafe = async () => [{ assignmentId: 24, teacherId: 2, title: 'E2E', endTime: new Date('2026-10-17T07:10:56Z') }];
    prisma.gradingJob = {
      findFirst: async () => null,
      create: async ({ data }) => { prisma._created = data; return { id: 29 }; },
    };
    const out = await scanDueAssignments({ prisma, enabled: true, log: silent });
    expect(out).toMatchObject({ ok: true, due: 1, enqueued: 1 });
    expect(prisma._created).toMatchObject({ assignmentId: 24, checkerId: AUTO_BUILD_CHECKER, status: 'pending' });
    expect(isAutoBuildChecker(prisma._created.checkerId)).toBe(true);
  });

  it('C15-3 build/reuse 分类：本 job 造尺=build；同内容由别的 job 造出=reuse；无内容键=worker', () => {
    const rulerByContent = new Map([[K, { content_key: K, source_run_id: 29, status: 'ready' }]]);
    expect(classifyJobKind({ jobId: 29, checkerId: AUTO_BUILD_CHECKER, contentKey: K, rulerByContent })).toBe('build');
    expect(classifyJobKind({ jobId: 30, checkerId: 'aligned-checker', contentKey: K, rulerByContent })).toBe('reuse');
    expect(classifyJobKind({ jobId: 31, checkerId: 'x', contentKey: null, rulerByContent })).toBe('worker');
    expect(formatSessionScope({ assignmentId: 24, teacherId: 2, classIds: [18], title: 'E2E' })).toContain('E2E');
  });

  let tmpRoot; let prev;
  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c15-runs-'));
    prev = process.env[RUNS_ROOT_ENV];
    process.env[RUNS_ROOT_ENV] = tmpRoot;
    for (const jobId of [101, 102]) {
      const dir = path.join(tmpRoot, String(jobId));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'run-teardown.json'), JSON.stringify({ source: 'worker', sessions_purged: true, session_files_before: 2, session_files_after: 0 }));
    }
  });
  afterAll(() => {
    if (prev === undefined) delete process.env[RUNS_ROOT_ENV]; else process.env[RUNS_ROOT_ENV] = prev;
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('C15-4 详情：job_runs 无 status ⇒ 合并 grading_jobs.status/content_key，并给出 ruler_id/ruler_status/run_kind=build', async () => {
    const prisma = fakePrisma({
      runRows: [{ job_id: 101, assignment_id: 24, checker_id: AUTO_BUILD_CHECKER, started_at: '2026-10-17T07:12:00Z', finished_at: '2026-10-17T07:12:05Z', device_exit: 0, measured: 2, unmeasurable: 0, skipped: 0, written: 2, failed: 0, created_at: '2026-10-17T07:12:00Z', updated_at: '2026-10-17T07:12:05Z' }],
      jobRows: [{ id: 101, assignment_id: 24, checker_id: AUTO_BUILD_CHECKER, status: 'done', written_count: 2, skipped_count: 0, content_key: K, created_at: '2026-10-17T07:12:00Z', updated_at: '2026-10-17T07:12:05Z' }],
      rulerRows: [{ id: 7, content_key: K, source_run_id: 101, status: 'ready', checker_id: 'chk' }],
    });
    const rm = createDshRunsReadModel({ prisma, logger: silent });
    const out = await rm.getRunDetail({ id: 'job-101' });
    expect(out.status).toBe('ok');
    expect(out.data.run).toMatchObject({ job_id: 101, status: 'done', content_key: K, ruler_id: 7, ruler_status: 'ready', run_kind: 'build', historical_archive_only: false });
  });

  it('C15-5 详情：只有归档、DB 行已清理 ⇒ historical_archive_only=true（不伪装成新批改）', async () => {
    const prisma = fakePrisma();
    const rm = createDshRunsReadModel({ prisma, logger: silent });
    const out = await rm.getRunDetail({ id: 'job-102' });
    expect(out.status).toBe('ok');
    expect(out.data.run.historical_archive_only).toBe(true);
    expect(String(out.data.run.notice)).toContain('historical_archive_only');
  });

  it('C15-7 C6 冻结基线已含 D5 管理端字段（content_key/ruler_id/ruler_status/费用列）', () => {
    const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/admin-grading-runs-baseline.json'), 'utf8'));
    const items = baseline.responses.list.data.items;
    expect(items.some((x) => 'content_key' in x && 'ruler_id' in x && 'ruler_status' in x && 'historical_archive_only' in x)).toBe(true);
    expect(items.every((x) => 'cost_total' in x && 'model_calls' in x)).toBe(true);
    const buildDetail = baseline.responses.detail_build_archive.data.run;
    expect(buildDetail).toHaveProperty('content_key');
    expect(buildDetail).toHaveProperty('ruler_id');
    expect(buildDetail).toHaveProperty('ruler_status');
  });

  it('C15-6 列表：status 不进 grading_job_runs SQL，合并后按 grading_jobs.status 过滤；行带 ruler 字段', async () => {
    const sqlLog = [];
    const prisma = fakePrisma({
      runRows: [{ job_id: 101, assignment_id: 24, checker_id: 'chk', started_at: '2026-10-17T07:12:00Z', finished_at: '2026-10-17T07:12:05Z', device_exit: 0, measured: 2, unmeasurable: 0, skipped: 0, written: 2, failed: 0, created_at: '2026-10-17T07:12:00Z', updated_at: '2026-10-17T07:12:05Z' }],
      jobRows: [{ id: 101, assignment_id: 24, checker_id: 'chk', status: 'done', written_count: 2, skipped_count: 0, content_key: K, created_at: '2026-10-17T07:12:00Z', updated_at: '2026-10-17T07:12:05Z' }],
      rulerRows: [{ id: 7, content_key: K, source_run_id: 101, status: 'ready', checker_id: 'chk' }],
      sqlLog,
    });
    const rm = createDshRunsReadModel({ prisma, logger: silent });
    const ok = await rm.listRuns({ status: 'done', page: 1, pageSize: 20 });
    expect(ok.code === 0 || ok.items).toBeTruthy();
    const items = ok.items || ok.data.items;
    const row = items.find((x) => Number(x.job_id) === 101);
    expect(row).toBeTruthy();
    expect(row).toMatchObject({ status: 'done', content_key: K, ruler_id: 7, ruler_status: 'ready' });
    const runSql = sqlLog.filter((x) => /FROM grading_job_runs/.test(x.sql)).map((x) => x.sql);
    expect(runSql.every((s) => !/status\s*=/.test(s))).toBe(true);

    const filtered = await rm.listRuns({ status: 'pending', page: 1, pageSize: 20 });
    expect((filtered.items || filtered.data.items).filter((x) => Number(x.job_id) === 101)).toHaveLength(0);
  });
});
