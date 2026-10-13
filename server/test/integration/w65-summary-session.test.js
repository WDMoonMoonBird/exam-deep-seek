/**
 * W65（R2-B48 / t29）：会话内总评 —— 产物契约 / 缓存命中零调用 / 降级矩阵 / 重评保 summary / 键失效 / 前端零改动 / 提示词不漂移。
 *
 * ★测试禁止真实调用模型：一律注入假 callModel（可计数），并断言"命中缓存 ⇒ 零调用"。
 * 仅测试库；自建 run-root 与行，afterAll 清理。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import {
  SUMMARIES_REL, SUMMARIES_SCHEMA, SUMMARY_PROMPT_VERSION, buildSummariesDoc, parseSummariesDoc, loadSummaries,
  contentKeyOf, resultDigestOf, summaryKeyOf, extractSummaryFacts, buildSummaryPrompt, runSummarySession,
} from '../../src/services/dshSummarySession.js';
import { buildWriteback, listMeasureResults, consumeMeasureResults } from '../../src/services/dshCheckerConsumer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..');
const TAG = 'w65-sum-' + Date.now();
const cleanup = { roots: [], submissionIds: [], userIds: [], assignmentIds: [], questionIds: [], cacheKeys: [] };

const ITEMS = [
  { id: 'P01', title: 'web.xml 命名空间', status: 'hit', score: 1, max_score: 1, reason: 'P01 | 证据: src/a.xml' },
  { id: 'P06', title: 'spring-mvc.xml 命名空间', status: 'miss', score: 0, max_score: 1, reason: 'P06 | 证据: src/b.xml' },
];
const RUBRIC = 'R'.repeat(200);

/** 造一个 run-root：measure（分数）+ grading-result（依据） */
function makeRunRoot(slug) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w65-run-'));
  cleanup.roots.push(root);
  fs.mkdirSync(path.join(root, 'out', 'measure'), { recursive: true });
  fs.mkdirSync(path.join(root, 'out', 'grading-result'), { recursive: true });
  fs.writeFileSync(path.join(root, 'out', 'measure', slug + '.json'), JSON.stringify({ submission: { id: slug }, totals: { score: 80, max_score: 100 }, checker_id: 'sha256:' + 'd'.repeat(64) }));
  fs.writeFileSync(path.join(root, 'out', 'grading-result', slug + '.json'), JSON.stringify({ submission: { id: slug }, totals: { score: 80, max_score: 100 }, items: ITEMS }));
  return root;
}
const fakeModel = (counter) => async ({ system, user }) => {
  counter.n += 1;
  return { ok: true, text: '本次完成度较高（' + String(user).slice(-12) + '）…建议先补齐命名空间。', model: 'fake-model', tokens: { prompt: 900, completion: 130, reasoning: 90, cache_hit: 800, cache_miss: 100 } };
};

describe('W65 会话内总评（R2-B48）', () => {
  let env = null;

  beforeAll(async () => {
    const teacher = await prisma.user.create({ data: { username: TAG + '-t', password: 'x', role: 'teacher', realName: TAG } });
    cleanup.userIds.push(teacher.id);
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: TAG, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: RUBRIC, maxScore: 100 } });
    cleanup.questionIds.push(q.id);
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: TAG, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    cleanup.assignmentIds.push(a.id);
    await prisma.assignmentQuestion.create({
      data: { assignmentId: a.id, questionId: q.id, sortOrder: 1, rubricSnapshot: { rubric: RUBRIC, rubricSha256: 'sha256:' + 'e'.repeat(64) }, standardHash: 'sha256:' + 'f'.repeat(64), snapshotOrigin: 'publish' },
    });
    const u = await prisma.user.create({ data: { username: TAG + '-s', password: 'x', role: 'student', realName: TAG + ' 学生' } });
    cleanup.userIds.push(u.id);
    const s = await prisma.submission.create({ data: { assignmentId: a.id, studentId: u.id, questionId: q.id, status: 'submitted', aiScore: 80, aiFeedback: JSON.stringify({ source: 'dsh-checker', raw_score: 80, score_int: 80, max_score: 100, checker_id: 'sha256:' + 'd'.repeat(64), breakdown: ITEMS.map((i) => ({ item: i.id, title: i.title, status: i.status, score: i.score, maxScore: i.max_score, comment: i.reason, kind: 'checker' })) }) } });
    cleanup.submissionIds.push(s.id);
    env = { assignmentId: a.id, questionId: q.id, submissionId: s.id, slug: TAG + '-slug' };
  }, 120000);

  afterAll(async () => {
    if (cleanup.cacheKeys.length) await prisma.$executeRawUnsafe('DELETE FROM grading_summaries WHERE summary_key IN (' + cleanup.cacheKeys.map(() => '?').join(',') + ')', ...cleanup.cacheKeys);
    await prisma.submission.deleteMany({ where: { id: { in: cleanup.submissionIds } } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: cleanup.assignmentIds } } });
    await prisma.assignment.deleteMany({ where: { id: { in: cleanup.assignmentIds } } });
    await prisma.question.deleteMany({ where: { id: { in: cleanup.questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
    for (const r of cleanup.roots) fs.rmSync(r, { recursive: true, force: true });
  }, 120000);

  it('★W65-1 产物契约：schema=summaries/1、按 slug 键控、坏 JSON 拒绝、**不写进 check.py 结果文档**', async () => {
    const root = makeRunRoot(env.slug);
    const before = fs.readFileSync(path.join(root, 'out', 'measure', env.slug + '.json'), 'utf8');
    const doc = buildSummariesDoc({ assignmentId: env.assignmentId, mode: 'cached', entries: { [env.slug]: { text: '总评正文', facts: { passed: 1, total: 2, score: 80, failed_count: 1, failed_items: ['P06'] }, model: 'm', prompt_version: SUMMARY_PROMPT_VERSION, tokens: { prompt: 1 }, generated_at: 'x', source: 'session', session_id: env.slug, cache_hit: false } } });
    fs.writeFileSync(path.join(root, SUMMARIES_REL), JSON.stringify(doc));
    const rt = parseSummariesDoc(fs.readFileSync(path.join(root, SUMMARIES_REL), 'utf8'));
    expect(rt.ok).toBe(true);
    expect(rt.doc.schema).toBe(SUMMARIES_SCHEMA);
    expect(Object.keys(rt.doc.summaries)).toEqual([env.slug]);
    expect(loadSummaries(root).bySlug.get(env.slug).cache_hit).toBe(false);
    // 形状同构：解析器只依赖 summary.text/facts/truncated ⇒ 前端零改动（W65-6 另有 diff 断言）
    const withTrunc = buildSummariesDoc({ entries: { s1: { text: 't', truncated: true, facts: { failed_count: 13 } }, s2: { facts: {} } } });
    const p2 = parseSummariesDoc(JSON.stringify(withTrunc));
    expect(p2.ok).toBe(true);
    expect(p2.doc.summaries.s1.truncated).toBe(true);
    expect(p2.doc.summaries.s2).toBe(undefined);                       // 缺 text ⇒ 丢弃（降级）
    expect(parseSummariesDoc('{坏 JSON').ok).toBe(false);
    expect(parseSummariesDoc(JSON.stringify({ schema: 'other/9', summaries: {} })).ok).toBe(false);
    // ★不污染 check.py 结果文档
    expect(fs.readFileSync(path.join(root, 'out', 'measure', env.slug + '.json'), 'utf8')).toBe(before);
    expect(listMeasureResults(root)[0].result.summary.text).toBe('总评正文');
  }, 60000);

  it('★W65-2 缓存命中 ⇒ **零模型调用**（第二次同键直接复用；hits 计数 +1）', async () => {
    const root = makeRunRoot(env.slug);
    const counter = { n: 0 };
    const r1 = await runSummarySession({ prisma, runRoot: root, assignmentId: env.assignmentId, rubric: RUBRIC, standardHash: 'sha256:' + 'f'.repeat(64), callModel: fakeModel(counter), mode: 'cached' });
    expect(r1.ok).toBe(true);
    expect(counter.n).toBe(1);
    expect(r1.generated).toBe(1);
    expect(r1.cache_hits).toBe(0);
    expect(r1.written).toBe(1);
    const key = summaryKeyOf(contentKeyOf({ standardHash: 'sha256:' + 'f'.repeat(64), questionId: null }), resultDigestOf(ITEMS));
    cleanup.cacheKeys.push(key);
    // 第二次（同内容同结果）⇒ 命中缓存：零调用、cache_hit=true
    const root2 = makeRunRoot(env.slug);
    const r2 = await runSummarySession({ prisma, runRoot: root2, assignmentId: env.assignmentId, rubric: RUBRIC, standardHash: 'sha256:' + 'f'.repeat(64), callModel: fakeModel(counter), mode: 'cached' });
    expect(counter.n).toBe(1);                                          // ★零新增调用
    expect(r2.cache_hits).toBe(1);
    expect(r2.generated).toBe(0);
    const hit = loadSummaries(root2).bySlug.get(env.slug);
    expect(hit.cache_hit).toBe(true);
    expect(hit.text).toContain('本次完成度较高');
    const rows = await prisma.$queryRawUnsafe('SELECT hits FROM grading_summaries WHERE summary_key = ?', key);
    expect(Number(rows[0].hits)).toBeGreaterThanOrEqual(1);             // 命中计数
    // mode=always ⇒ 无视缓存，重新生成
    const root3 = makeRunRoot(env.slug);
    const r3 = await runSummarySession({ prisma, runRoot: root3, assignmentId: env.assignmentId, rubric: RUBRIC, standardHash: 'sha256:' + 'f'.repeat(64), callModel: fakeModel(counter), mode: 'always' });
    expect(counter.n).toBe(2);
    expect(r3.generated).toBe(1);
    // mode=off ⇒ 不生成、不写文件
    const root4 = makeRunRoot(env.slug);
    const r4 = await runSummarySession({ prisma, runRoot: root4, assignmentId: env.assignmentId, rubric: RUBRIC, callModel: fakeModel(counter), mode: 'off' });
    expect(counter.n).toBe(2);
    expect(r4.reason).toBe('mode_off');
    expect(fs.existsSync(path.join(root4, SUMMARIES_REL))).toBe(false);
  }, 120000);

  it('★W65-3 降级矩阵：模型失败 / 超预算 / 坏 JSON ⇒ 不写 summary 键且分数不变', async () => {
    // ① 模型失败 ⇒ failed≥1、不写产物、consume 后 ai_feedback 无 summary 键
    const rootA = makeRunRoot(env.slug);
    const failModel = async () => ({ ok: false, error: 'http_500' });
    const rA = await runSummarySession({ prisma, runRoot: rootA, assignmentId: env.assignmentId, rubric: RUBRIC, callModel: failModel, mode: 'always' });
    expect(rA.failed).toBe(1);
    expect(rA.written).toBe(0);
    expect(fs.existsSync(path.join(rootA, SUMMARIES_REL))).toBe(false);
    const cA = await consumeMeasureResults({ prisma, runRoot: rootA, assignmentId: env.assignmentId, submissionIdBySlug: { [env.slug]: env.submissionId } });
    expect(cA.written).toBe(1);
    let row = await prisma.submission.findUnique({ where: { id: env.submissionId }, select: { aiScore: true, aiFeedback: true } });
    expect(row.aiScore).toBe(80);                                       // ★分数不变
    expect(JSON.parse(row.aiFeedback).summary).toBe(undefined);          // ★不写 summary 键 ⇒ 教师页回落

    // ② 坏 JSON 产物 ⇒ loadSummaries 失败 ⇒ 订单照写但无 summary
    const rootB = makeRunRoot(env.slug);
    fs.writeFileSync(path.join(rootB, SUMMARIES_REL), '{不是 JSON');
    expect(loadSummaries(rootB).ok).toBe(false);
    const cB = await consumeMeasureResults({ prisma, runRoot: rootB, assignmentId: env.assignmentId, submissionIdBySlug: { [env.slug]: env.submissionId } });
    expect(cB.written).toBe(1);
    row = await prisma.submission.findUnique({ where: { id: env.submissionId }, select: { aiFeedback: true } });
    expect(JSON.parse(row.aiFeedback).summary).toBe(undefined);

    // ③ 超预算 ⇒ stopped + reason=budget_exceeded、不生成（不影响分数）
    const rootC = makeRunRoot(env.slug);
    const counter = { n: 0 };
    const rC = await runSummarySession({ prisma, runRoot: rootC, assignmentId: env.assignmentId, rubric: RUBRIC, callModel: fakeModel(counter), mode: 'always', maxCost: 0.0000000001 });
    expect(rC.stopped).toBe(true);
    expect(rC.reason).toBe('budget_exceeded');
    expect(rC.generated).toBe(0);
    expect(fs.existsSync(path.join(rootC, SUMMARIES_REL))).toBe(false);
  }, 120000);

  it('★W65-4 重评不抹 summary（最高优先兼容点）：既有 summary 在无新总评时原样保留', async () => {
    // 先写入一次带 summary 的回写
    const root = makeRunRoot(env.slug);
    const counter = { n: 0 };
    await runSummarySession({ prisma, runRoot: root, assignmentId: env.assignmentId, rubric: RUBRIC, callModel: fakeModel(counter), mode: 'always' });
    await consumeMeasureResults({ prisma, runRoot: root, assignmentId: env.assignmentId, submissionIdBySlug: { [env.slug]: env.submissionId } });
    let row = await prisma.submission.findUnique({ where: { id: env.submissionId }, select: { aiFeedback: true } });
    const withSummary = JSON.parse(row.aiFeedback);
    expect(withSummary.summary.text).toContain('本次完成度较高');

    // 重评：同一批 measure 结果但**没有** summaries.json ⇒ 既有 summary 必须保留（旧实现会整体替换 ⇒ 抹掉）
    const root2 = makeRunRoot(env.slug);
    const c2 = await consumeMeasureResults({ prisma, runRoot: root2, assignmentId: env.assignmentId, submissionIdBySlug: { [env.slug]: env.submissionId } });
    expect(c2.written).toBe(1);
    row = await prisma.submission.findUnique({ where: { id: env.submissionId }, select: { aiScore: true, aiFeedback: true } });
    const after = JSON.parse(row.aiFeedback);
    expect(after.summary).toBeTruthy();                                  // ★未被抹掉
    expect(after.summary.text).toBe(withSummary.summary.text);
    expect(row.aiScore).toBe(80);                                        // ★分数不变
    expect(after.score_int).toBe(80);
    // 纯函数级：显式传 previousFeedback ⇒ 保留；不传 ⇒ 无 summary（对照）
    const keep = JSON.parse(buildWriteback({ result: { items: ITEMS, totals: { score: 80, max_score: 100 } }, score: 80, previousFeedback: JSON.stringify(withSummary) }).aiFeedback);
    expect(keep.summary.text).toBe(withSummary.summary.text);
    const drop = JSON.parse(buildWriteback({ result: { items: ITEMS, totals: { score: 80, max_score: 100 } }, score: 80 }).aiFeedback);
    expect(drop.summary).toBe(undefined);
    // 新总评优先于既有（有 summaries ⇒ 用新的）
    const root3 = makeRunRoot(env.slug);
    fs.writeFileSync(path.join(root3, SUMMARIES_REL), JSON.stringify(buildSummariesDoc({ entries: { [env.slug]: { text: '新一版总评', facts: { passed: 0, total: 2 }, source: 'session' } } })));
    await consumeMeasureResults({ prisma, runRoot: root3, assignmentId: env.assignmentId, submissionIdBySlug: { [env.slug]: env.submissionId } });
    row = await prisma.submission.findUnique({ where: { id: env.submissionId }, select: { aiFeedback: true } });
    expect(JSON.parse(row.aiFeedback).summary.text).toBe('新一版总评');
  }, 120000);

  it('★W65-5 summary_key 自然失效：rubric 变 ⇒ 必 miss（键随 content_key 变）', async () => {
    const k1 = summaryKeyOf(contentKeyOf({ standardHash: 'sha256:' + 'f'.repeat(64) }), resultDigestOf(ITEMS));
    const k2 = summaryKeyOf(contentKeyOf({ standardHash: 'sha256:' + '1'.repeat(64) }), resultDigestOf(ITEMS));
    const k3 = summaryKeyOf(contentKeyOf({ rubricSha256: 'sha256:' + 'e'.repeat(64) }), resultDigestOf(ITEMS));
    expect(k1).not.toBe(k2);                                             // rubric/快照变 ⇒ 键变
    expect(k1).not.toBe(k3);
    expect(summaryKeyOf(contentKeyOf({ standardHash: 'sha256:' + 'f'.repeat(64) }), resultDigestOf(ITEMS))).toBe(k1);   // 同内容同结果 ⇒ 稳定
    expect(resultDigestOf(ITEMS)).not.toBe(resultDigestOf([{ ...ITEMS[0], status: 'miss', score: 0 }]));               // 结果变 ⇒ 摘要变
    // 端到端：换 rubric 快照 ⇒ 缓存不命中 ⇒ 重新调用模型
    const counter = { n: 0 };
    const root = makeRunRoot(env.slug);
    const r = await runSummarySession({ prisma, runRoot: root, assignmentId: env.assignmentId, rubric: RUBRIC + '（改了评分标准）', standardHash: 'sha256:' + '2'.repeat(64), callModel: fakeModel(counter), mode: 'cached' });
    expect(r.generated).toBe(1);
    expect(r.cache_hits).toBe(0);
    cleanup.cacheKeys.push(summaryKeyOf(contentKeyOf({ standardHash: 'sha256:' + '2'.repeat(64) }), resultDigestOf(ITEMS)));
  }, 120000);

  it('★W65-6 前端零改动：解析器与两个教师页 diff 为空；新形状可被同一解析器解析', async () => {
    const paths = [
      'client/src/composables/review/parseCheckerFeedback.js',
      'client/src/views/teacher/ReviewDetail.vue',
      'client/src/views/teacher/ProjectReviewNew.vue',
    ];
    const r = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], { cwd: REPO, encoding: 'utf8' });
    expect(r.status).toBe(0);                                            // ★零改动（无 diff）
    const mod = await import('../../../client/src/composables/review/parseCheckerFeedback.js');
    const parse = mod.parseCheckerFeedbackText || mod.parseCheckerFeedback;
    const parsed = parse(JSON.stringify({
      source: 'dsh-checker', score_int: 80, max_score: 100,
      breakdown: ITEMS.map((i) => ({ item: i.id, title: i.title, status: i.status, score: i.score, maxScore: i.max_score, comment: i.reason })),
      summary: { text: '本次完成度较高……建议先补齐命名空间。', facts: { passed: 1, total: 2, score: 80, failed_count: 1, failed_items: ['P06'] }, tokens: { prompt: 900, completion: 130, reasoning: 90 }, cache_hit: true, source: 'session' },
    }));
    expect(parsed.kind).toBe('checker');
    expect(parsed.summary.text).toContain('完成度较高');
    expect(parsed.basisText).toContain('失分：P06');
  }, 60000);

  it('★W65-7 提示词不漂移：会话侧与脚本侧同口径（system/user 逐字一致）', async () => {
    const scriptMod = await import('../../scripts/gen-ai-summary.mjs');
    const facts = extractSummaryFacts(ITEMS, { score: 80, maxScore: 100 });
    const a = buildSummaryPrompt({ rubric: RUBRIC, facts });
    // 脚本侧原生吃 breakdown 形态（item 字段）；两边对**同一份归一化输入**必须产出逐字一致的提示词
    const breakdown = ITEMS.map((i) => ({ item: i.id, title: i.title, status: i.status, score: i.score, maxScore: i.max_score, comment: i.reason }));
    const b = scriptMod.buildSummaryPrompt({ rubric: RUBRIC, facts: scriptMod.extractBreakdownFacts(breakdown, { score: 80, maxScore: 100 }) });
    expect(a.system).toBe(b.system);
    expect(a.user).toBe(b.user);
    expect(a.listed_failed).toBe(b.listed_failed);
    expect(SUMMARY_PROMPT_VERSION).toBe(scriptMod.PROMPT_VERSION);        // prompt_version 同版本 ⇒ 缓存与落库口径一致
  }, 60000);
});
