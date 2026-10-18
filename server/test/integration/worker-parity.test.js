/**
 * worker-parity.test.js — task-45 ②③：旧/新 worker parity 矩阵 + project_submissions 零写入（flag off）
 *
 * 背景（A REVIEW-worker-migration §1.2/§1.3）：
 *   - 非 project 评分路径（gradeOne/scanSubmissions）本轮**零改动**；parity 风险来自被调 AI 模块的安全化差异；
 *   - WORKER_ENABLE_PROJECT_SCAN（默认 false）只影响 legacy project 扫描；off 时 project_submissions 不得有写入；
 *   - 回滚开关 true 时 legacy project 扫描仍可执行（本文件验证其会写反馈/状态，证明回滚可用）。
 *
 * 实现：父进程起本地 HTTP stub（把 system_configs.deepseek_base_url 指向 127.0.0.1），
 *   按学生答案里的 CASE_* 标记返回不同模型输出；再 spawn src/worker.js 子进程跑真实主循环。
 *   parity 矩阵（expected_new / 与旧实现差异登记）见 reports/fix/round3/TEST-worker-migration.md。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import prisma from '../../src/utils/prisma.js';
import { getTestData } from './helpers.js';
import { ABNORMAL_FEEDBACK } from '../../src/constants.js';

const SERVER = process.cwd();                         // cd server 后 npx jest
const ENTRY = path.join(SERVER, 'src/worker.js');
const tag = 'w45-parity-' + Date.now();
const CONFIG_KEYS = ['deepseek_base_url', 'deepseek_api_key', 'deepseek_model'];

const CASE_SCORE = {
  CASE_CODE_OK: 8,
  CASE_THEORY_OK: 7,
  CASE_DECIMAL: 7.6,
  CASE_MAXSCORE_ZERO: 8,
  CASE_SCORE_MISSING: 8,
  CASE_INVALID_OVER: 999,
  CASE_INVALID_TYPE: 'abc',
};

let stub = null;
let stubPort = 0;
let child = null;
let projectId = null;
let projectSubmissionId = null;
const configBackup = [];
/** ★task-49（A2 复核）：记录每个 CASE_* 被模型 stub 命中的次数 —— 用于证明 D-2/D-3
 *   走的是「合法 JSON → schema 类型/区间拒绝 → 重试 3 次 → ABNORMAL」而非 JSON 解析失败 */
const stubHits = {};
/** ★隔离：全量跑时本文件会启动真实 worker 扫描；把**非本套件**的 submitted 提交暂置 draft，afterAll 恢复 */
const stashedSubmittedIds = [];
const fixtures = {};
const assignmentIds = [];
const questionIds = [];
const subQuestionIds = [];
const submissionIds = [];

function startStub() {
  return new Promise((resolve) => {
    stub = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        let marker = null;
        for (const key of Object.keys(CASE_SCORE)) {
          if (body.includes(key)) { marker = key; break; }
        }
        // ★task-49（A2）：D-2/D-3 必须返回**合法 JSON**，否则旧/新都只走「JSON 解析失败」，无判别力。
        //   OVER = 合法 JSON + 越界数值（schema 区间拒绝）；TYPE = 合法 JSON + 错误类型（schema 类型拒绝）。
        let content;
        if (marker === 'CASE_INVALID_OVER') {
          content = JSON.stringify({ score: 999, feedback: 'stub-over-range（合法 JSON，score=999 越界）' });
        } else if (marker === 'CASE_INVALID_TYPE') {
          content = JSON.stringify({ score: 'abc', feedback: 'stub-wrong-type（合法 JSON，score 为字符串）' });
        } else {
          content = JSON.stringify({ score: marker ? CASE_SCORE[marker] : 8, feedback: 'stub-' + (marker || 'DEFAULT') });
        }
        if (marker) stubHits[marker] = (stubHits[marker] || 0) + 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
      });
    });
    stub.listen(0, '127.0.0.1', () => { stubPort = stub.address().port; resolve(); });
  });
}

function startWorker(envExtra) {
  const env = { ...process.env, INTERNAL_SECRET: 'p'.repeat(32), PORT: '0' };
  delete env.WORKER_ENABLE_PROJECT_SCAN;
  Object.assign(env, envExtra);
  const proc = spawn(process.execPath, [ENTRY], { cwd: SERVER, env });
  const state = { out: '' };
  proc.stdout.on('data', (d) => { state.out += String(d); });
  proc.stderr.on('data', (d) => { state.out += String(d); });
  return {
    proc,
    getOut: () => state.out,
    stop: () => new Promise((resolve) => {
      if (proc.exitCode != null) return resolve();
      proc.once('close', resolve);
      proc.kill('SIGTERM');
    }),
  };
}

async function waitUntil(fn, timeoutMs, label, interval = 300) {
  const start = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('等待超时：' + label);
    await new Promise((r) => setTimeout(r, interval));
  }
}

async function seedCase(name, subQuestionType, { score, answer, objectiveItems, referenceAnswer } = {}) {
  const td = getTestData();
  const assignment = await prisma.assignment.create({
    data: { teacherId: td.teacherId, title: tag + '-asg-' + name, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') },
  });
  assignmentIds.push(assignment.id);
  const question = await prisma.question.create({
    data: { teacherId: td.teacherId, title: tag + '-q-' + name, type: 'code', difficulty: 'easy', maxScore: 100 },
  });
  questionIds.push(question.id);
  const sqData = {
    questionId: question.id, sortOrder: 1, title: name, type: subQuestionType,
    content: tag + ' content ' + name, referenceAnswer: referenceAnswer != null ? referenceAnswer : 'ref', language: 'javascript',
  };
  if (score !== undefined) sqData.score = score;
  if (objectiveItems) sqData.objectiveItems = objectiveItems;
  const sq = await prisma.subQuestion.create({ data: sqData });
  subQuestionIds.push(sq.id);
  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id, studentId: td.studentIds[0], questionId: question.id, subQuestionId: sq.id,
      answer, status: 'submitted', submittedAt: new Date(),
    },
  });
  submissionIds.push(submission.id);
  fixtures[name] = submission.id;
  return submission.id;
}

describe('task-45 ②③ · worker migration parity / project scan 开关', () => {
  beforeAll(async () => {
    await startStub();
    // 备份并注入 AI 配置（指向本地 stub；键名与 config.js 真源一致）
    for (const key of CONFIG_KEYS) {
      const row = await prisma.systemConfig.findUnique({ where: { key } });
      if (row) configBackup.push({ key: row.key, value: row.value });
    }
    const base = 'http://127.0.0.1:' + stubPort;
    await prisma.systemConfig.upsert({ where: { key: 'deepseek_base_url' }, update: { value: base }, create: { key: 'deepseek_base_url', value: base } });
    await prisma.systemConfig.upsert({ where: { key: 'deepseek_api_key' }, update: { value: 'test-key' }, create: { key: 'deepseek_api_key', value: 'test-key' } });
    await prisma.systemConfig.upsert({ where: { key: 'deepseek_model' }, update: { value: 'test-model' }, create: { key: 'deepseek_model', value: 'test-model' } });

    // parity 矩阵夹具
    await seedCase('code', 'code', { score: 10, answer: 'CASE_CODE_OK 我的排序代码' });
    await seedCase('theory', 'theory', { score: 10, answer: 'CASE_THEORY_OK 我的论述答案' });
    await seedCase('decimal', 'code', { score: 10, answer: 'CASE_DECIMAL 小数分用例' });
    await seedCase('invalidOver', 'code', { score: 10, answer: 'CASE_INVALID_OVER 越界分用例' });
    await seedCase('invalidType', 'code', { score: 10, answer: 'CASE_INVALID_TYPE 非法类型用例' });
    await seedCase('maxScoreZero', 'code', { score: 0, answer: 'CASE_MAXSCORE_ZERO 满分为0' });
    await seedCase('scoreMissing', 'code', { answer: 'CASE_SCORE_MISSING 缺省满分' });
    await seedCase('objective', 'objective', {
      score: 100,
      answer: JSON.stringify([{ key: 0, answer: 'A' }, { key: 1, answer: 'C' }]),
      objectiveItems: [{ key: 0, type: 'choice', answer: 'A' }, { key: 1, type: 'choice', answer: 'B' }],
      referenceAnswer: '',
    });
    await seedCase('flatJudge', 'judge', { score: 20, answer: 'true', referenceAnswer: 'true' });

    // ★隔离：暂存其它套件遗留的 submitted 提交（避免本 worker 误评分污染后续套件）
    const others = await prisma.submission.findMany({
      where: { status: 'submitted', question: { type: { not: 'project' } }, id: { notIn: submissionIds } },
      select: { id: true },
    });
    if (others.length) {
      stashedSubmittedIds.push(...others.map((o) => o.id));
      await prisma.submission.updateMany({ where: { id: { in: stashedSubmittedIds } }, data: { status: 'draft' } });
    }

    // legacy project 夹具（flag off 时零写入；flag on 时回滚可评分/至少写反馈）
    const td = getTestData();
    const project = await prisma.project.create({
      data: { teacherId: td.teacherId, title: tag + '-proj', description: 'w45', startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01'), status: 'published' },
    });
    projectId = project.id;
    const ps = await prisma.projectSubmission.create({
      data: { projectId, studentId: td.studentIds[0], status: 'submitted', submittedAt: new Date() },
    });
    projectSubmissionId = ps.id;
  }, 180000);

  afterAll(async () => {
    if (child) { try { await child.stop(); } catch { /* ignore */ } }
    try {
      // 先恢复 AI 配置（即使 beforeAll 中途失败也必须回滚，否则会指向已关闭的 stub）
      await prisma.systemConfig.deleteMany({ where: { key: { in: CONFIG_KEYS } } });
      if (configBackup.length) await prisma.systemConfig.createMany({ data: configBackup });
    } catch { /* ignore */ }
    try { if (projectSubmissionId) await prisma.projectSubmission.deleteMany({ where: { id: projectSubmissionId } }); } catch { /* ignore */ }
    try { if (projectId) await prisma.project.deleteMany({ where: { id: projectId } }); } catch { /* ignore */ }
    try {
      // 恢复其它套件遗留提交的原状态（只在未被本 worker 改动时安全；本 worker 只会动 submitted ⇒ 这些已是 draft）
      if (stashedSubmittedIds.length) {
        await prisma.submission.updateMany({ where: { id: { in: stashedSubmittedIds }, status: 'draft' }, data: { status: 'submitted' } });
      }
    } catch { /* ignore */ }
    try { await prisma.submission.deleteMany({ where: { id: { in: submissionIds } } }); } catch { /* ignore */ }
    try { await prisma.subQuestion.deleteMany({ where: { id: { in: subQuestionIds } } }); } catch { /* ignore */ }
    try { await prisma.question.deleteMany({ where: { id: { in: questionIds } } }); } catch { /* ignore */ }
    try { await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } }); } catch { /* ignore */ }
    try { if (stub) await new Promise((r) => stub.close(r)); } catch { /* ignore */ }
  }, 120000);

  it('②③ flag 缺省（off）：parity 矩阵符合新实现语义 + project_submissions 零写入', async () => {
    child = startWorker({});
    const ids = Object.values(fixtures);
    await waitUntil(async () => {
      const rows = await prisma.submission.findMany({ where: { id: { in: ids } }, select: { status: true } });
      return rows.length === ids.length && rows.every((r) => r.status !== 'submitted');
    }, 90000, 'parity 用例全部评分完成');
    await child.stop();

    const out = child.getOut();
    expect(out).toContain('"projectScan":"off"');

    // ③ 零写入：legacy project_submission 保持原状
    const ps = await prisma.projectSubmission.findUnique({ where: { id: projectSubmissionId } });
    expect(ps.status).toBe('submitted');
    expect(ps.machineScore).toBeNull();
    expect(ps.astScore).toBeNull();
    expect(ps.aiScore).toBeNull();
    expect(ps.totalScore).toBeNull();
    expect(ps.machineFeedback).toBeNull();
    expect(ps.astFeedback).toBeNull();
    expect(ps.aiFeedback).toBeNull();

    const rows = Object.fromEntries((await prisma.submission.findMany({
      where: { id: { in: ids } },
      select: { id: true, aiScore: true, aiFeedback: true, status: true, bestScore: true },
    })).map((r) => [r.id, r]));
    const row = (name) => rows[fixtures[name]];
    // 正常代码题 / 主观题 AI：与旧 worker 语义一致（普通分数直通）
    expect(row('code').status).toBe('ai_graded');
    expect(row('code').aiScore).toBe(8);
    expect(row('code').bestScore).toBe(8);
    expect(row('theory').aiScore).toBe(7);
    // 小数分：新实现 Math.round（7.6→8）；旧 parseInt=7 —— 登记差异（A §1.2）
    expect(row('decimal').aiScore).toBe(8);
    // 越界 999 / 字符串分：新 schema 拒绝 → 3 次重试 → ABNORMAL(0)；旧实现 clamp/parseInt 会写分 —— 登记差异（A §1.2）
    expect(row('invalidOver').status).toBe('ai_graded');
    // ★task-49（A2 复核修正）：stub 返回**合法 JSON**（999 / "abc"），判别力=vendor schema 的区间/类型拒绝：
    //   各命中 3 次（3 次重试）后走 ABNORMAL，而旧实现 parseInt/clamp 会写分 ⇒ 该用例现在真正有判别力。
    expect(stubHits.CASE_INVALID_OVER).toBe(3);
    expect(stubHits.CASE_INVALID_TYPE).toBe(3);
    expect(row('invalidOver').aiScore).toBe(0);
    expect(row('invalidOver').aiFeedback).toBe(ABNORMAL_FEEDBACK);
    expect(row('invalidType').aiScore).toBe(0);
    expect(row('invalidType').aiFeedback).toBe(ABNORMAL_FEEDBACK);
    // maxScore=0 / score 缺省边界：新 limit=100、worker normalize 用 score||10 ⇒ AI 8 分直通
    expect(row('maxScoreZero').aiScore).toBe(8);
    expect(row('scoreMissing').aiScore).toBe(8);
    // 客观题（objectiveItems）与扁平客观题（judge）：worker 分支逐字未改，确定性评分
    expect(row('objective').aiScore).toBe(50);       // 1/2 单选正确（100 分均摊各 50）
    expect(row('flatJudge').aiScore).toBe(20);       // judge 正确 ⇒ 满分
  }, 180000);

  it("② flag 'true'（回滚）：legacy project 扫描参与主循环且会写 project_submission（启动日志 on）", async () => {
    child = startWorker({ WORKER_ENABLE_PROJECT_SCAN: 'true' });
    await waitUntil(async () => {
      const ps = await prisma.projectSubmission.findUnique({ where: { id: projectSubmissionId } });
      return ps.status !== 'submitted' || ps.machineFeedback != null || ps.astFeedback != null || ps.aiFeedback != null || ps.totalScore != null;
    }, 60000, 'flag on 时 project scan 被调用并写入');
    const out = child.getOut();
    expect(out).toContain('"projectScan":"on"');
    const ps = await prisma.projectSubmission.findUnique({ where: { id: projectSubmissionId } });
    expect(ps.status !== 'submitted' || ps.machineFeedback != null || ps.astFeedback != null || ps.aiFeedback != null).toBe(true);
    await child.stop();
  }, 120000);
});
