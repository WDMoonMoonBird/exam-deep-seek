/**
 * W52（R2-B23）：worker 归档 + 落库摘要 + run-root 策略 + 审计脚本正反例 + 迁移可回滚。
 * 仅测试库；不跑真实装置（自建 run-root 夹具）；探针自清理。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { archiveRun, buildEvidenceSummary, persistJobRun, resolveRunsRoot, tailText } from '../../src/services/dshRunArchiver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const AUDIT = path.join(SERVER, 'scripts', 'r2b23-audit-runs.mjs');
const tag = 'w52-run-' + Date.now();
let assignmentId = null;
let questionId = null;
let jobId = null;
let runsRoot = null;

function mkRunRoot(jobId, { teardown = null, sessions = false } = {}) {
  const root = fs.mkdtempSync(path.join('/tmp', 'r2b4-job-' + jobId + '-'));
  fs.mkdirSync(path.join(root, 'out', 'results'), { recursive: true });
  fs.mkdirSync(path.join(root, 'out', 'diagnostics'), { recursive: true });
  fs.writeFileSync(path.join(root, 'run.log'), 'line1\nline2\n');
  fs.writeFileSync(path.join(root, 'out', 'device.stdout.log'), 'device ok\n');
  fs.writeFileSync(path.join(root, 'out', 'device.stderr.log'), 'warn x\n');
  fs.writeFileSync(path.join(root, 'out', 'comparability.json'), JSON.stringify({ group: 'g1' }));
  // ★R2-B24b（t93 裁定 A）：夹具改为**云上真机形状** —— 逐份结果在 out/grading-result/<slug>.json（+ 索引 grading-results.json），
  //   而 out/measure/ 里是 coverage/matrix **干扰产物**（云上 job 5 实测）⇒ 干扰文件只能进 skipped_artifacts，不得被当 submission。
  fs.mkdirSync(path.join(root, 'out', 'measure'), { recursive: true });
  fs.writeFileSync(path.join(root, 'out', 'measure', 'coverage-s01.json'), JSON.stringify({ checker_id: 'c1', coverage: { files: 3 } }));
  fs.writeFileSync(path.join(root, 'out', 'measure', 'matrix-s01.json'), JSON.stringify({ matrix: [[1, 2]] }));
  fs.mkdirSync(path.join(root, 'out', 'grading-result'), { recursive: true });
  fs.writeFileSync(path.join(root, 'out', 'grading-result', 's01.json'), JSON.stringify({ totals: { score: 77 }, items: [1, 2, 3] }));
  fs.writeFileSync(path.join(root, 'out', 'grading-result', 's02.json'), JSON.stringify({ totals: { score: 64 }, items: [1, 2] }));
  fs.writeFileSync(path.join(root, 'out', 'grading-results.json'), JSON.stringify({ results: [{ slug: 's01', totals: { score: 77 } }, { slug: 's02', totals: { score: 64 } }] }));
  fs.writeFileSync(path.join(root, 'out', 'diagnostics', 'measurable.json'), JSON.stringify({ submissions: [{ slug: 's01' }, { slug: 's02' }, { slug: 's03', measurable: false, reason: 'no-artifacts' }] }));
  if (teardown) fs.writeFileSync(path.join(root, 'out', 'run-teardown.json'), JSON.stringify(teardown));
  if (sessions) {
    fs.mkdirSync(path.join(root, 'home', 'sessions', 'sid'), { recursive: true });
    fs.writeFileSync(path.join(root, 'home', 'sessions', 'sid', 'session.v4.jsonl.zstd'), 'x');
  }
  return root;
}

describe('W52 运行归档 + 落库 + 审计', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    const j = await prisma.gradingJob.create({ data: { assignmentId, checkerId: tag, status: 'done' } });
    jobId = j.id;
    runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w52-runs-'));
    await prisma.$executeRawUnsafe('DELETE FROM grading_job_runs WHERE job_id = ?', jobId);
  }, 90000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM grading_job_runs WHERE job_id = ?', jobId);
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    fs.rmSync(runsRoot, { recursive: true, force: true });
  }, 60000);

  it('★W52-1 成功 ⇒ 归档齐备 + run-root 被清理（pruned=yes）+ RUN_ARCHIVED 行', async () => {
    const root = mkRunRoot(jobId, { teardown: { sessions_purged: true, home_exists_after: 'no', keep_scene: false, purge_policy: 'purge_home=1 keep_days=3 exit=0' } });
    const logs = [];
    const res = await archiveRun({ runRoot: root, jobId, success: true, runsRoot, log: { log: (m) => logs.push(m) } });
    expect(res.dir).toBe(path.join(runsRoot, String(jobId)));
    for (const f of ['run-teardown.json', 'device.stdout.log', 'device.stderr.log', 'run.log', 'comparability.json', 'evidence-summary.json']) {
      expect(fs.existsSync(path.join(res.dir, f))).toBe(true);
    }
    const summary = JSON.parse(fs.readFileSync(path.join(res.dir, 'evidence-summary.json'), 'utf8'));
    expect(summary.n).toBe(3);
    expect(summary.unmeasurable).toBe(1);
    expect(summary.submissions.find((s) => s.slug === 's01').score).toBe(77);
    expect(summary.submissions.find((s) => s.slug === 's03').reason).toBe('no-artifacts');
    // ★R2-B24b（t93）：真机形状断言 —— 无 parseError 占位；干扰产物只计入 skipped_artifacts
    expect(summary.submissions.filter((s) => s.parseError).length).toBe(0);
    // ★R2-B24b（t93）：真机不变式 —— out/measure 里的 coverage/matrix **干扰产物绝不能被当 submission**（这是云上缺陷的直接反面）
    expect(summary.submissions.some((s) => /coverage|matrix/.test(String(s.slug)))).toBe(false);
    expect(summary.submissions.map((s) => s.slug).sort()).toEqual(['s01', 's02', 's03']);
    // skipped_artifacts 字段存在（当前实现只在「主源无条目」时才扫描旧布局，故此处只断言字段为数字；
    // 「扫描 out/measure 并计数」的实现增强属 server/src/services（本轮 out of scope）⇒ 见记录 findings）
    expect(Number.isFinite(Number(summary.skipped_artifacts))).toBe(true);
    expect(res.pruned).toBe(true);
    expect(fs.existsSync(root)).toBe(false);
    expect(logs.join('\n')).toMatch(/RUN_ARCHIVED dir=.* pruned_run_root=yes/);
  }, 90000);

  it('★W52-2 失败 ⇒ 归档副本 + run-root 保留（pruned=no）', async () => {
    const root = mkRunRoot(jobId, { teardown: { sessions_purged: false, home_exists_after: 'yes', keep_scene: true, purge_policy: 'purge_home=1 keep_days=3 exit=5', session_files_before: 3 } });
    const logs = [];
    const res = await archiveRun({ runRoot: root, jobId, success: false, runsRoot, log: { log: (m) => logs.push(m) } });
    expect(res.pruned).toBe(false);
    expect(fs.existsSync(root)).toBe(true);
    expect(logs.join('\n')).toMatch(/pruned_run_root=no/);
    fs.rmSync(root, { recursive: true, force: true });
  }, 90000);

  it('★W52-3 落库摘要：grading_job_runs 字段齐备（原始 SQL 读回对拍），幂等 upsert', async () => {
    const teardown = { sessions_purged: true, home_exists_after: 'no', session_files_before: 4, session_bytes: 9000, keep_scene: false, purge_policy: 'purge_home=1 keep_days=3 exit=0' };
    const p1 = await persistJobRun({ prisma, jobId, assignmentId, checkerId: tag, startedAt: new Date(Date.now() - 60000), finishedAt: new Date(), deviceExit: 0, measured: 2, unmeasurable: 1, skipped: 0, written: 2, teardown, runDir: path.join(runsRoot, String(jobId)), logStdout: 'ok', logStderr: 'warn' });
    expect(p1.persisted).toBe(true);
    const p2 = await persistJobRun({ prisma, jobId, assignmentId, checkerId: tag, deviceExit: 0, measured: 2, unmeasurable: 1, skipped: 1, written: 3, teardown, runDir: path.join(runsRoot, String(jobId)) });
    expect(p2.persisted).toBe(true);   // 幂等（ON DUPLICATE KEY UPDATE）
    const rows = await prisma.$queryRawUnsafe('SELECT job_id, assignment_id, checker_id, device_exit, measured, unmeasurable, skipped, written, teardown_json, run_dir, log_stdout, log_stderr, started_at, finished_at, created_at FROM grading_job_runs WHERE job_id = ?', jobId);
    expect(rows).toHaveLength(1);
    const r0 = rows[0];
    expect(Number(r0.assignment_id)).toBe(assignmentId);
    expect(Number(r0.device_exit)).toBe(0);
    expect(Number(r0.measured)).toBe(2);
    expect(Number(r0.unmeasurable)).toBe(1);
    expect(Number(r0.skipped)).toBe(1);        // 第二次 upsert 生效
    expect(Number(r0.written)).toBe(3);
    expect(String(r0.run_dir)).toContain(String(jobId));
    expect(r0.started_at).not.toBe(null);
    expect(r0.teardown_json).not.toBe(null);
  }, 90000);

  it('★W52-4 审计脚本：干净 ⇒ AUDIT_OK rc=0；植入假 finding ⇒ AUDIT_FINDINGS rc=1（凭据/会话/成功却未销毁）', async () => {
    const cleanRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w52-clean-'));
    fs.mkdirSync(path.join(cleanRoot, '1'), { recursive: true });   // 真实布局：<RUNS_ROOT>/<jobId>/
    fs.writeFileSync(path.join(cleanRoot, '1', 'run-teardown.json'), JSON.stringify({ sessions_purged: true, home_exists_after: 'no', keep_scene: false, purge_policy: 'purge_home=1 keep_days=3 exit=0' }));
    const ok = spawnSync(process.execPath, [AUDIT, '--runs-root', cleanRoot, '--tmp-glob', '/tmp/w52-nomatch-'], { encoding: 'utf8', timeout: 60000 });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('AUDIT_OK runs=1');
    const badRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w52-bad-'));
    fs.mkdirSync(path.join(badRoot, '5', 'sessions', 'sid'), { recursive: true });
    fs.writeFileSync(path.join(badRoot, '5', 'sessions', 'sid', 'session.v4.jsonl.zstd'), 'x');
    fs.writeFileSync(path.join(badRoot, '5', '.credentials.yaml'), 'DEEPSEEK_API_KEY: sk-leaked');
    fs.writeFileSync(path.join(badRoot, '5', 'run-teardown.json'), JSON.stringify({ sessions_purged: false, home_exists_after: 'yes', keep_scene: false, purge_policy: 'purge_home=1 keep_days=3 exit=0', session_files_after: 1 }));
    const bad = spawnSync(process.execPath, [AUDIT, '--runs-root', badRoot, '--tmp-glob', '/tmp/w52-nomatch-'], { encoding: 'utf8', timeout: 60000 });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('AUDIT_FINDINGS');
    expect(bad.stdout).toContain('kind=credential_residue');
    expect(bad.stdout).toContain('kind=session_residue');
    expect(bad.stdout).toContain('kind=sessions_not_purged');
    fs.rmSync(cleanRoot, { recursive: true, force: true });
    fs.rmSync(badRoot, { recursive: true, force: true });
  }, 120000);

  it('★W52-5 迁移可回滚：rollback.sql 可执行（DROP）且迁移 SQL 可重建（CREATE 回原状）', async () => {
    const dir = path.join(SERVER, 'prisma', 'migrations', '20261012060000_r2b23_grading_job_runs');
    const rollback = fs.readFileSync(path.join(dir, 'rollback.sql'), 'utf8');
    const migration = fs.readFileSync(path.join(dir, 'migration.sql'), 'utf8');
    expect(rollback).toContain('DROP TABLE IF EXISTS `grading_job_runs`');
    await prisma.$executeRawUnsafe(rollback.replace(/;\s*$/, ''));
    let exists = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='grading_job_runs'");
    expect(Number(exists[0].n)).toBe(0);
    await prisma.$executeRawUnsafe(migration.replace(/;\s*$/, ''));
    exists = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='grading_job_runs'");
    expect(Number(exists[0].n)).toBe(1);
    const cols = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='grading_job_runs'");
    expect(Number(cols[0].n)).toBe(17);
  }, 120000);

  it('W52-6 resolveRunsRoot 缺省与 env 覆盖', () => {
    expect(resolveRunsRoot({})).toBe('/srv/grader/runs');
    expect(resolveRunsRoot({ DSH_GRADER_RUNS_ROOT: '/data/runs' })).toBe('/data/runs');
    expect(buildEvidenceSummary('/tmp/nonexistent-w52')).toMatchObject({ n: 0 });
    expect(tailText('/tmp/nonexistent-w52-x')).toBe(null);
  });
});

describe('W52b 剪枝健壮化 + 口径一致（R2-B34）', () => {
  const ROOT_ENV = 'DSH_GRADER_RUNS_ROOT';
  let runsRootB = null;
  beforeAll(() => { runsRootB = fs.mkdtempSync(path.join(os.tmpdir(), 'w52b-runs-')); });
  afterAll(() => { if (runsRootB) fs.rmSync(runsRootB, { recursive: true, force: true }); });

  it('★★W52b-1 非 root：只读物料树（dr-xr-xr-x / -r--r--r--）也必须在成功运行后剪掉 run-root（F-T78-1）', async () => {
    const job = 90001;
    const root = fs.mkdtempSync(path.join('/tmp', 'r2b4-job-' + job + '-'));
    fs.mkdirSync(path.join(root, 'materials', 'std'), { recursive: true });
    fs.writeFileSync(path.join(root, 'materials', 'std', 'pkg.zip'), 'x');
    fs.mkdirSync(path.join(root, 'out'), { recursive: true });
    fs.writeFileSync(path.join(root, 'out', 'device.stdout.log'), 'ASSIGNMENT_RESULT=PARTIAL N=1 MEASURED=1 FAILED=0 UNMEASURABLE=0' + String.fromCharCode(10));
    fs.chmodSync(path.join(root, 'materials', 'std', 'pkg.zip'), 0o400);
    fs.chmodSync(path.join(root, 'materials', 'std'), 0o500);
    fs.chmodSync(path.join(root, 'materials'), 0o500);
    const logs = [];
    const res = await archiveRun({ runRoot: root, jobId: job, success: true, runsRoot: runsRootB, log: { log: (m) => logs.push(m) } });
    expect(res.pruned).toBe(true);
    expect(res.prune_reason || null).toBe(null);
    expect(fs.existsSync(root)).toBe(false);                      // ★成功 ⇒ run-root 不存在
    expect(logs.join(String.fromCharCode(10))).toMatch(/RUN_ARCHIVED dir=.* jobId=90001 pruned_run_root=yes/);
  }, 90000);

  it('★W52b-2 口径一致：out/measure 顶层每个条目计 1 ⇒ skipped_artifacts===2（F-T78-2）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w52b-count-'));
    fs.mkdirSync(path.join(root, 'out', 'measure'), { recursive: true });
    fs.mkdirSync(path.join(root, 'out', 'grading-result'), { recursive: true });
    fs.mkdirSync(path.join(root, 'out', 'diagnostics'), { recursive: true });
    fs.writeFileSync(path.join(root, 'out', 'measure', 'coverage-s01.json'), JSON.stringify({ checker_id: 'c', coverage: {} }));
    fs.writeFileSync(path.join(root, 'out', 'measure', 'matrix-s01.json'), JSON.stringify({ matrix: [] }));
    fs.writeFileSync(path.join(root, 'out', 'grading-result', 's01.json'), JSON.stringify({ totals: { score: 88 }, items: [1] }));
    fs.writeFileSync(path.join(root, 'out', 'diagnostics', 'measurable.json'), JSON.stringify({ submissions: [{ slug: 's01' }] }));
    const s = buildEvidenceSummary(root);
    expect(s.skipped_artifacts).toBe(2);                            // 口径：文件数、范围：out/measure 顶层
    expect(s.n).toBe(1);
    expect(s.submissions.filter((x) => x.parseError).length).toBe(0);
    expect(s.submissions.some((x) => /coverage|matrix/.test(String(x.slug)))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);

  it('★W52b-3 剪枝确实失败时必须显式给原因（保留 rm_failed 细节）', async () => {
    const job = 90002;
    const notJobShaped = fs.mkdtempSync(path.join(os.tmpdir(), 'w52b-shape-'));
    fs.mkdirSync(path.join(notJobShaped, 'out'), { recursive: true });
    const res = await archiveRun({ runRoot: notJobShaped, jobId: job, success: true, runsRoot: runsRootB, log: { log: () => {} } });
    expect(res.pruned).toBe(false);
    expect(String(res.prune_reason)).toMatch(/shape_guard\(jobId=90002\)/);
    fs.rmSync(notJobShaped, { recursive: true, force: true });
  }, 60000);
});
