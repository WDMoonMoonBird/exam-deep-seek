/**
 * W62（R2-B43 / t18）：AI 自然语言总评脚本 + 幂等落库 + 展示接线。
 *
 * ★测试**禁止真实调用模型**：全部走本地假模型 HTTP 服务（127.0.0.1 随机端口，脚本用 --base-url 指过去）。
 * 覆盖：①prompt 组装（rubric 截断 / 未通过项 ≤12）②读-改-写保留既有键 + 分数/状态零变化 ③截断放大重试与 truncated 标注
 * ④失败重试 ≤2 后跳过记 summary_error ⑤幂等（已有 summary ⇒ 跳过；--force 才覆盖）⑥--max-cost 停止 ⑦解析器/视图接线。
 * 仅测试库；自建行与临时目录，afterAll 清理。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const SCRIPT = path.join(SERVER, 'scripts', 'gen-ai-summary.mjs');
const TAG = 'w62-sum-' + Date.now();
const cleanup = { assignmentIds: [], questionIds: [], userIds: [], submissionIds: [] };
const fake = { servers: [] };

/** 本地假模型（OpenAI 兼容 /v1/chat/completions）；script 可为数组（按调用序）或函数 */
async function startFakeModel(script) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body || '{}'); } catch { parsed = {}; }
      calls.push(parsed);
      const r = (typeof script === 'function' ? script(parsed, calls.length) : script[Math.min(calls.length - 1, script.length - 1)]) || {};
      if (r.status && r.status !== 200) {
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'fake_failure' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: r.content === undefined ? '本次提交总体完成度较高，主要失分集中在 spring-mvc.xml 命名空间声明不完整。建议先补齐该文件的三处 namespaces，再逐项复核未通过项。' : r.content }, finish_reason: r.finish_reason || 'stop' }],
        usage: r.usage || { prompt_tokens: 900, completion_tokens: 130, prompt_cache_hit_tokens: 820, prompt_cache_miss_tokens: 80, completion_tokens_details: { reasoning_tokens: 90 } },
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const handle = { url: 'http://127.0.0.1:' + server.address().port, calls, close: () => new Promise((r) => server.close(r)) };
  fake.servers.push(handle);
  return handle;
}

const BREAKDOWN = [
  { item: 'P01', title: 'web.xml 命名空间', status: 'hit', score: 1, maxScore: 1, comment: 'P01 | 证据: src/main/webapp/WEB-INF/web.xml' },
  { item: 'P06', title: 'spring-mvc.xml 命名空间', status: 'miss', score: 0, maxScore: 1, comment: 'P06(count): 未命中 | 证据: src/main/webapp/WEB-INF/spring-mvc.xml' },
  { item: 'P24', title: 'PageController 返回值', status: 'miss', score: 0, maxScore: 1, comment: 'P24: 缺注解 | 证据: src/main/java/PageController.java' },
];

/**
 * ★必须用**异步** spawn：假模型服务跑在本测试进程内，spawnSync 会阻塞事件循环 ⇒ 服务无法响应 ⇒ 子进程死等（死锁）。
 */
function runScript(args, { cwd = SERVER, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd, env: { ...process.env } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, stdout, stderr }); });
  });
}

describe('W62 AI 自然语言总评（R2-B43）', () => {
  let env = null;

  beforeAll(async () => {
    const teacher = await prisma.user.create({ data: { username: TAG + '-t', password: 'x', role: 'teacher', realName: TAG } });
    cleanup.userIds.push(teacher.id);
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: TAG, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'R'.repeat(2000), maxScore: 100 } });
    cleanup.questionIds.push(q.id);
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: TAG, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    cleanup.assignmentIds.push(a.id);
    await prisma.assignmentQuestion.create({
      data: {
        assignmentId: a.id, questionId: q.id, sortOrder: 1, materialSnapshot: '材料',
        rubricSnapshot: { rubric: 'R'.repeat(2000), rubricItems: null, rubricSha256: 'sha256:' + 'a'.repeat(64), capturedAt: new Date().toISOString() },
        standardHash: 'sha256:' + 'b'.repeat(64), snapshotOrigin: 'publish',
      },
    });
    const rows = [];
    for (let i = 0; i < 3; i += 1) {
      const u = await prisma.user.create({ data: { username: TAG + '-s' + i, password: 'x', role: 'student', realName: TAG + ' 学生' + (i + 1) } });
      cleanup.userIds.push(u.id);
      const s = await prisma.submission.create({
        data: {
          assignmentId: a.id, studentId: u.id, questionId: q.id, status: 'submitted', aiScore: 93, finalScore: null,
          aiFeedback: JSON.stringify({ source: 'dsh-checker', raw_score: 93, score_int: 93, max_score: 100, checker_id: 'sha256:' + 'c'.repeat(64), breakdown: BREAKDOWN }),
        },
      });
      cleanup.submissionIds.push(s.id);
      rows.push({ id: s.id, studentId: u.id });
    }
    env = { assignmentId: a.id, questionId: q.id, rows };
  }, 120000);

  afterAll(async () => {
    for (const s of fake.servers) { try { await s.close(); } catch { /* ignore */ } }
    await prisma.submission.deleteMany({ where: { id: { in: cleanup.submissionIds } } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: cleanup.assignmentIds } } });
    await prisma.assignment.deleteMany({ where: { id: { in: cleanup.assignmentIds } } });
    await prisma.question.deleteMany({ where: { id: { in: cleanup.questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  }, 120000);

  it('★W62-1 prompt 组装：rubric 截断 ≤1200、未通过项 ≤12 条、三条要求齐备', async () => {
    const mod = await import('../../scripts/gen-ai-summary.mjs');
    const many = Array.from({ length: 20 }, (_, i) => ({ item: 'F' + String(i).padStart(2, '0'), title: '分项' + i, score: 0, maxScore: 1, status: 'miss', comment: '判据 | 证据: src/F' + i + '.java' }));
    const facts = mod.extractBreakdownFacts(many, { score: 80, maxScore: 100 });
    const p = mod.buildSummaryPrompt({ rubric: 'R'.repeat(2000), facts });
    expect(p.rubric.truncated).toBe(true);
    expect(p.rubric.text.length).toBeLessThanOrEqual(1200 + 32);
    expect(p.listed_failed).toBe(12);
    expect(p.truncated_failed).toBe(true);
    expect(p.system).toContain('总体结论');
    expect(p.system).toContain('不得编造');
    expect(p.system).toContain('改进建议');
    expect(p.system).toContain('禁止逐条复述');
    expect(p.user).toContain('【本次结果】');
    expect(p.user).toContain('未通过 20 项');
    expect((p.user.match(/- F\d\d/g) || []).length).toBe(12);            // 只列 12 条
    expect(p.user).not.toContain('F19');                                 // 第 13 条起不出现（不编造）
  }, 60000);

  it('★W62-2 --apply：读-改-写保留既有键 + summary 结构齐备 + 分数/状态零变化', async () => {
    const model = await startFakeModel([{}]);
    const r = await runScript(['--submission', String(env.rows[0].id), '--base-url', model.url, '--api-key', 'fake', '--model', 'fake-model', '--apply', '--json']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('SCORE_UNCHANGED=yes');
    expect(r.stdout).toContain('changed=1');
    const sub = await prisma.submission.findUnique({ where: { id: env.rows[0].id }, select: { aiScore: true, finalScore: true, status: true, aiFeedback: true } });
    expect(sub.aiScore).toBe(93);                      // ★分数零变化
    expect(sub.finalScore).toBe(null);
    expect(sub.status).toBe('submitted');
    const doc = JSON.parse(sub.aiFeedback);
    expect(doc.source).toBe('dsh-checker');             // ★既有键保留
    expect(doc.raw_score).toBe(93);
    expect(doc.checker_id).toBe('sha256:' + 'c'.repeat(64));
    expect(Array.isArray(doc.breakdown)).toBe(true);
    expect(doc.breakdown).toHaveLength(3);
    expect(doc.summary.text.length).toBeGreaterThan(5); // ★新增 summary
    expect(doc.summary.prompt_version).toBe('ai-summary/1');
    expect(doc.summary.model).toBe('fake-model');
    expect(doc.summary.facts).toMatchObject({ passed: 1, total: 3, failed_items: ['P06', 'P24'] });
    expect(doc.summary.tokens).toMatchObject({ prompt: 900, completion: 130, reasoning: 90 });
    expect(Number.isFinite(Date.parse(doc.summary.generated_at))).toBe(true);
    expect(doc.summary.truncated).toBe(undefined);
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].model).toBe('fake-model');
    expect(model.calls[0].max_tokens).toBe(2000);        // ★默认预算 2000
  }, 120000);

  it('★W62-3 截断：finish_reason=length ⇒ 放大预算重试 1 次；仍截断 ⇒ truncated:true', async () => {
    const model = await startFakeModel([
      { content: '前半段总评（被长度限制截断', finish_reason: 'length' },
      { content: '重试后的完整总评：本次完成度较高，主要失分集中在 spring-mvc.xml 命名空间不完整，建议先补齐三个命名空间。', finish_reason: 'stop' },
    ]);
    const r = await runScript(['--submission', String(env.rows[1].id), '--base-url', model.url, '--api-key', 'fake', '--model', 'fake-model', '--apply', '--json', '--max-tokens', '600']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('SUMMARY_LENGTH_RETRY');
    expect(model.calls).toHaveLength(2);
    expect(model.calls[0].max_tokens).toBe(600);
    expect(model.calls[1].max_tokens).toBeGreaterThan(600);          // ★放大预算
    const doc1 = JSON.parse((await prisma.submission.findUnique({ where: { id: env.rows[1].id }, select: { aiFeedback: true } })).aiFeedback);
    expect(doc1.summary.truncated).toBe(undefined);                  // 重试成功 ⇒ 不标截断
    expect(doc1.summary.text).toContain('重试后的完整总评');

    // 仍截断 ⇒ truncated:true（两次都 length）
    const model2 = await startFakeModel([{ content: '截断文本A', finish_reason: 'length' }, { content: '截断文本B', finish_reason: 'length' }]);
    const r2 = await runScript(['--submission', String(env.rows[2].id), '--base-url', model2.url, '--api-key', 'fake', '--model', 'fake-model', '--apply', '--json', '--max-tokens', '600']);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('truncated=yes');
    const doc2 = JSON.parse((await prisma.submission.findUnique({ where: { id: env.rows[2].id }, select: { aiFeedback: true } })).aiFeedback);
    expect(doc2.summary.truncated).toBe(true);                       // ★标注截断
    expect(doc2.summary.text).toBe('截断文本B');
  }, 180000);

  it('★W62-4 失败：HTTP 500 重试 ≤2 次后跳过并记 summary_error（DB 不被改动）', async () => {
    const model = await startFakeModel([{ status: 500 }, { status: 500 }, { status: 500 }]);
    const before = await prisma.submission.findUnique({ where: { id: env.rows[1].id }, select: { aiFeedback: true, aiScore: true } });
    // 用 --submission + --force 让这行必须重新生成（已有 summary ⇒ 否则会 skipped_existing）
    const r = await runScript(['--submission', String(env.rows[1].id), '--base-url', model.url, '--api-key', 'fake', '--model', 'fake-model', '--apply', '--force', '--json']);
    expect(r.status).toBe(0);                                          // 跳过不视为整体失败
    expect(r.stdout).toContain('status=summary_error');
    expect(r.stdout).toContain('failed=1');
    expect(model.calls).toHaveLength(3);                              // 1 次 + 重试 2 次
    const after = await prisma.submission.findUnique({ where: { id: env.rows[1].id }, select: { aiFeedback: true, aiScore: true } });
    expect(after.aiFeedback).toBe(before.aiFeedback);                  // ★失败 ⇒ 原样保留
    expect(after.aiScore).toBe(before.aiScore);
  }, 180000);

  it('★W62-5 幂等：已有 summary ⇒ dry-run/apply 都不改；--force 才覆盖', async () => {
    const before = await prisma.submission.findUnique({ where: { id: env.rows[0].id }, select: { aiFeedback: true } });
    const model = await startFakeModel([{}]);
    const dry = await runScript(['--submission', String(env.rows[0].id), '--base-url', model.url, '--api-key', 'fake', '--json']);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('status=skipped_existing');
    expect(model.calls).toHaveLength(0);                               // 已有 summary ⇒ 不调模型
    const apply = await runScript(['--submission', String(env.rows[0].id), '--base-url', model.url, '--api-key', 'fake', '--apply']);
    expect(apply.status).toBe(0);
    expect(apply.stdout).toContain('skipped_existing=1');
    const after = await prisma.submission.findUnique({ where: { id: env.rows[0].id }, select: { aiFeedback: true } });
    expect(after.aiFeedback).toBe(before.aiFeedback);                  // 字节不变
    // --force ⇒ 重新生成
    const model2 = await startFakeModel([{ content: '强制重生成的另一版总评文本。建议先修复 P24 的注解缺失。' }]);
    const forced = await runScript(['--submission', String(env.rows[0].id), '--base-url', model2.url, '--api-key', 'fake', '--apply', '--force']);
    expect(forced.status).toBe(0);
    const forcedDoc = JSON.parse((await prisma.submission.findUnique({ where: { id: env.rows[0].id }, select: { aiFeedback: true } })).aiFeedback);
    expect(forcedDoc.summary.text).toContain('强制重生成');
    expect(model2.calls).toHaveLength(1);
  }, 180000);

  it('★W62-6 成本护栏：累计费用超 --max-cost ⇒ 立即停止且退出码非 0', async () => {
    const model = await startFakeModel([{}]);
    // 先把第 2 行的 summary 去掉，保证至少有一行会被生成
    const row = await prisma.submission.findUnique({ where: { id: env.rows[2].id }, select: { aiFeedback: true } });
    const doc = JSON.parse(row.aiFeedback); delete doc.summary;
    await prisma.submission.update({ where: { id: env.rows[2].id }, data: { aiFeedback: JSON.stringify(doc) } });
    const r = await runScript(['--assignment', String(env.assignmentId), '--base-url', model.url, '--api-key', 'fake', '--max-cost', '0.0000001', '--apply', '--json']);
    expect(r.status).toBe(2);                                          // ★超预算 ⇒ 退出码 2
    expect(r.stdout).toContain('COST_GUARD_STOP');
    expect(r.stdout).toMatch(/cost=\d+\.\d{6}/);                        // 逐份打印 usage/费用
    expect(r.stdout).toContain('SCORE_UNCHANGED=yes');
  }, 180000);

  it('★W62-7 展示接线：解析器 summary 分支 + 一行依据 + 视图「总评/折叠」源码契约；旧形状安全降级', async () => {
    const mod = await import('../../../client/src/composables/review/parseCheckerFeedback.js');
    const parse = mod.parseCheckerFeedbackText || mod.parseCheckerFeedback;
    const withSum = parse(JSON.stringify({
      source: 'dsh-checker', score_int: 93, max_score: 100,
      breakdown: [{ item: 'P01', status: 'hit', score: 1, maxScore: 1 }, { item: 'P06', status: 'miss', score: 0, maxScore: 1 }],
      summary: { text: '本次完成度很高……建议补齐命名空间。', facts: { passed: 1, total: 2, score: 93, failed_items: ['P06'] }, truncated: true, tokens: { prompt: 900, completion: 130, reasoning: 90 } },
    }));
    expect(withSum.kind).toBe('checker');
    expect(withSum.summary.text).toContain('完成度很高');
    expect(withSum.summary.truncated).toBe(true);
    expect(withSum.basisText).toContain('本次 93 / 100 分');
    expect(withSum.basisText).toContain('2 项检查通过 1 项');
    expect(withSum.basisText).toContain('失分：P06');
    const noSum = parse(JSON.stringify({ source: 'dsh-checker', breakdown: [{ item: 'P01', status: 'miss', score: 0, maxScore: 1 }] }));
    expect(noSum.summary).toBe(null);                                  // ★无 summary ⇒ 回落旧分项面板
    expect(noSum.basisText).toContain('失分：P01');
    expect(parse('普通的自然语言评语').kind).toBe('text');               // 旧形状不破坏
    const view = fs.readFileSync(path.resolve(SERVER, '..', 'client', 'src', 'views', 'teacher', 'ReviewDetail.vue'), 'utf8');
    expect(view).toContain('AI 总评');
    expect(view).toContain('ai-sum-text');
    expect(view).toContain('basisText');
    expect(view).toContain('a-collapse');
    expect(view).toContain('defaultActiveKey');
    expect(view).toContain("fbOf(sq.id).summary ? [] : ['items']");     // ★有总评默认折叠、无总评保持展开
  }, 60000);
});
