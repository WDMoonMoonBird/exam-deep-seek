/**
 * op2-open-usage.test.js — OP-2 / C1：开放题自动评价的模型 usage **真实链路落库 + 管理员同类型显示**。
 *
 * 链路：open 夹具（真实 DB + 真实磁盘，AI 出网 fake）→ __AUTO_OPEN__ job runOnce（真实评分/汇总/persist）
 *   → grading_run_usage 行（run_ref='job:<id>'）→ 管理员 GET list/detail 同类型 usage 字段。
 * 覆盖：
 *   ① happy path（2 份提交 × 各 1 次模型调用）：model/model_calls/4 token/cache_hit_rate/cost/currency/
 *      price_version/price_tier/no_model_session 正确；费用与独立 computeCost 复算一致；cache_write=0+note；
 *   ② admin list（cost/currency/hit_rate/model_calls/no_model_session）与 detail（usage 块 + calls_basis + cost_split）同类型；
 *   ③ 未知型号 ⇒ cost_total=null + reason=model_not_priced（tokens 仍如实）；
 *   ④ 0 次模型调用 ⇒ **不写行**（res.usage=null/usagePersisted=null）；
 *   ⑤ persist 失败 ⇒ fail-soft：job 仍 done、无行、runOnce 不抛；
 *   ⑥ 失败调用的真实 token 照计：3 次 200 响应全部计入 model_calls，job=needs_rerun 但行已落库。
 * 约束：只改 server/test/**；测试库 exam_system_test；不改 src。
 */
import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import prisma from '../../src/utils/prisma.js';
import { getTestData, loginAsAdmin, authReq } from './helpers.js';
import { runOnce } from '../../src/infrastructure/dsh/worker/run-once.js';
import { AUTO_OPEN_CHECKER } from '../../src/infrastructure/dsh/worker/autoOpen.js';
import { JOB_STATUS } from '../../src/infrastructure/dsh/worker/claim.js';
import { loadLlmPrices, loadRunUsage } from '../../src/infrastructure/dsh/usage/dshRunUsageStore.js';
import { computeCost } from '../../src/infrastructure/dsh/usage/dshSessionUsage.js';
import { SUBMISSIONS_ROOT, submissionDir } from '../../src/utils/projectPaths.js';
import { OPEN_PROJECT_ROLE } from '../../src/infrastructure/ai/deepseek/index.js';

const STUDENT_CODE = 'function add(a, b) {\n  return a + b;\n}\n';
const MOCK_GRADE = {
  totalScore: 88,
  breakdown: [
    { item: '功能完整性', score: 53, maxScore: 60, comment: '增删改查齐备' },
    { item: '代码规范', score: 20, maxScore: 20, comment: '结构清晰' },
  ],
  highlights: ['代码结构清晰'],
  issues: ['缺少异常处理'],
  overallComment: '整体完成度较好，建议补充异常处理与边界校验。',
};
const PRESET_RUBRIC_ITEMS = [{ item: '功能完整性', maxScore: 60 }, { item: '代码规范', maxScore: 40 }];
/** 单次调用的真实 token（provider 口径：cache hit+miss = prompt） */
const CALL_USAGE = {
  prompt_tokens: 1000, completion_tokens: 100,
  prompt_cache_hit_tokens: 400, prompt_cache_miss_tokens: 600,
  completion_tokens_details: { reasoning_tokens: 30 },
};

const jsonResponse = (body, status = 200) => ({
  status, ok: status >= 200 && status < 300, json: async () => body,
});
const aiResponse = ({ content = JSON.stringify(MOCK_GRADE), usage = CALL_USAGE, model = 'deepseek-v4-flash' } = {}) =>
  jsonResponse({ model, usage, choices: [{ message: { content }, finish_reason: 'stop' }] });

const projectAnswer = (version = 1) => JSON.stringify({
  kind: 'project', currentVersion: version,
  history: [{ version, files: [{ name: 'main.js', size: Buffer.byteLength(STUDENT_CODE) }], at: new Date().toISOString() }],
  grading: { state: 'none', version: 0, attempts: 0, error: null, prevStatus: null, ruleVersionHash: null },
});

describe('OP-2 开放题自动评价 usage 采集/落库/管理员显示（C1）', () => {
  const originalFetch = global.fetch;
  const cleanup = { assignmentIds: [], questionIds: [], jobIds: [] };
  const consoleLines = [];
  let td;
  let adminToken;
  let fetchBodies = [];
  let spy = null;
  let happy = null;   // ① 落库行（供 ② 复用）

  /** 安装 AI 出网 mock；记录请求体（全部应为正式评分调用） */
  const installFetch = (handler = () => aiResponse()) => {
    fetchBodies = [];
    global.fetch = async (url, init = {}) => {
      const body = JSON.parse(init.body || '{}');
      fetchBodies.push(body);
      return handler(fetchBodies.length, body);
    };
  };
  const startConsoleSpy = () => {
    consoleLines.length = 0;
    spy = jest.spyOn(console, 'log').mockImplementation((...args) => { consoleLines.push(args.map(String).join(' ')); });
  };
  const stopConsoleSpy = () => { if (spy) spy.mockRestore(); spy = null; };

  const createOpenFixture = async ({ tag, submissions = 2 }) => {
    const q = await prisma.question.create({
      data: {
        teacherId: td.teacherId, title: 'OP2C1_' + tag + '_题', maxScore: 100, difficulty: 'medium', type: 'project',
        material: '实现一个待办事项管理程序，支持增删改查（OP-2 usage C1 夹具）',
        scoringRubric: '功能完整性 60 分；代码规范 40 分',
        attachmentUrl: null,
        rubricItems: PRESET_RUBRIC_ITEMS,     // 预置分项 ⇒ 不触发 rubric 提炼 AI 调用，调用数完全可控
      },
      select: { id: true },
    });
    cleanup.questionIds.push(q.id);
    const a = await prisma.assignment.create({
      data: {
        teacherId: td.teacherId, title: 'OP2C1_' + tag + '_作业',
        startTime: new Date(Date.now() - 2 * 3600_000), endTime: new Date(Date.now() - 3600_000),
        assignmentQuestions: { create: { questionId: q.id, sortOrder: 1, standardHash: null } },
        assignmentClasses: { create: { classId: td.classId } },
      },
      select: { id: true },
    });
    cleanup.assignmentIds.push(a.id);
    const subIds = [];
    for (let i = 0; i < submissions; i += 1) {
      const sid = td.studentIds[i];
      const s = await prisma.submission.create({
        data: { assignmentId: a.id, studentId: sid, questionId: q.id, status: 'submitted', submittedAt: new Date(), answer: projectAnswer(1) },
        select: { id: true },
      });
      subIds.push(s.id);
      const dir = submissionDir(q.id, sid, 1);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'main.js'), STUDENT_CODE);
    }
    const job = await prisma.gradingJob.create({
      data: { assignmentId: a.id, checkerId: AUTO_OPEN_CHECKER, status: 'pending' },
      select: { id: true },
    });
    cleanup.jobIds.push(job.id);
    return { qid: q.id, aid: a.id, jobId: job.id, subIds };
  };

  beforeAll(async () => {
    td = getTestData();
    if (!td || !td.teacherId) throw new Error('测试夹具未 seed（global.__testData 缺失）');
    adminToken = await loginAsAdmin();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    stopConsoleSpy();
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    stopConsoleSpy();
    const jobIds = cleanup.jobIds;
    if (jobIds.length) {
      await prisma.$executeRawUnsafe('DELETE FROM grading_run_usage WHERE job_id IN (' + jobIds.map(() => '?').join(',') + ')', ...jobIds).catch(() => {});
      await prisma.gradingJob.deleteMany({ where: { id: { in: jobIds } } }).catch(() => {});
    }
    for (const aid of cleanup.assignmentIds) {
      await prisma.gradingJob.deleteMany({ where: { assignmentId: aid } }).catch(() => {});
      await prisma.submission.deleteMany({ where: { assignmentId: aid } }).catch(() => {});
      await prisma.assignmentClass.deleteMany({ where: { assignmentId: aid } }).catch(() => {});
      await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: aid } }).catch(() => {});
      await prisma.assignment.deleteMany({ where: { id: aid } }).catch(() => {});
    }
    if (cleanup.questionIds.length) {
      await prisma.question.deleteMany({ where: { id: { in: cleanup.questionIds } } }).catch(() => {});
    }
    for (const qid of cleanup.questionIds) {
      const dir = path.join(SUBMISSIONS_ROOT, String(qid));
      if (dir.startsWith(SUBMISSIONS_ROOT + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('① happy path：2 份提交 → usage 行字段（model/model_calls/4 token/cache/费用/价目/tier/no_model_session）', async () => {
    installFetch();
    const fx = await createOpenFixture({ tag: 'happy', submissions: 2 });
    startConsoleSpy();
    const res = await runOnce({ prisma, jobId: fx.jobId });
    stopConsoleSpy();

    expect(res.consumed).toBe(true);
    expect(res.status).toBe(JOB_STATUS.done);
    expect(res.written).toBe(2);
    expect(res.usagePersisted).toBe(true);
    expect(fetchBodies).toHaveLength(2);                       // 2 份提交 × 1 次模型调用（无 rubric 提炼调用）
    for (const b of fetchBodies) {
      expect(b.messages[0].content).toBe(OPEN_PROJECT_ROLE);   // 仍是 open 评价角色
      expect(String(b.messages[1].content)).not.toContain('标准答案源码');
    }

    const row = await loadRunUsage({ prisma, runRef: 'job:' + fx.jobId });
    expect(row).toBeTruthy();
    expect(row.job_id).toBe(fx.jobId);
    // 模型 / 调用数 / 4 token
    expect(row.model).toBe('deepseek-v4-flash');
    expect(row.model_calls).toBe(2);
    expect(row.uncached_input_tokens).toBe(1200);
    expect(row.cache_read_tokens).toBe(800);
    expect(row.output_tokens).toBe(200);
    expect(row.cache_write_tokens).toBe(0);                    // API 不可得 ⇒ 0（列 NOT NULL）
    expect(row.cache_hit_rate).toBe(0.4);
    expect(row.no_model_session).toBe(false);
    // 费用/币种/价目版本/tier：与普通题同源（loadLlmPrices + computeCost）
    const prices = await loadLlmPrices({ prisma });
    expect(row.cost_currency).toBe(prices.table.currency);
    expect(row.cost_currency).toBe('CNY');
    expect(row.price_version).toBe(prices.table.price_version);
    expect(['peak', 'idle', 'mixed']).toContain(row.price_tier);
    const expectedCost = computeCost({
      calls: row.usage.calls.map((c) => ({ at: c.at, cache_hit_tokens: c.cache_hit_tokens, cache_miss_tokens: c.cache_miss_tokens, output_tokens: c.output_tokens })),
      model: row.model, table: prices.table,
    });
    expect(expectedCost.ok).toBe(true);
    expect(row.cost_total).not.toBeNull();
    expect(row.cost_total).toBeCloseTo(expectedCost.cost_total, 6);
    expect(row.price_tier).toBe(expectedCost.tier);
    // usage_json：口径 + calls 明细 + cache_write note
    const uj = row.usage;
    expect(uj.mode).toBe('open_project_evaluation');
    expect(uj.cost_basis).toBe('api_call_time');
    expect(uj.totals.cache_write_tokens).toBe(0);
    expect(uj.calls).toHaveLength(2);
    expect(uj.calls.map((c) => c.submissionId).sort((a, b) => a - b)).toEqual([...fx.subIds].sort((a, b) => a - b));
    expect(uj.calls[0]).toMatchObject({ prompt_tokens: 1000, cache_hit_tokens: 400, cache_miss_tokens: 600, output_tokens: 100, reasoning_tokens: 30 });
    expect(uj.calls_note).toContain('cache_write_tokens 平台 API 未提供');
    expect(uj.calls_note).toContain('cost_basis=api_call_time');
    // 运行日志证据
    expect(consoleLines.some((l) => l.includes('OPEN_PROJECT_USAGE=persisted'))).toBe(true);
    // job 终态
    const job = await prisma.gradingJob.findUnique({ where: { id: fx.jobId } });
    expect(job.status).toBe(JOB_STATUS.done);
    expect(job.contentKey).toBeNull();
    // submissions 真实回写
    const subs = await prisma.submission.findMany({ where: { assignmentId: fx.aid } });
    expect(subs.every((s) => s.status === 'ai_graded' && s.aiScore === 88)).toBe(true);
    happy = { jobId: fx.jobId, aid: fx.aid, usageRow: row };
  }, 60000);

  it('② admin list/detail：open job 返回与普通题同类型 usage（cost/hit_rate/model_calls/tokens/calls_basis）', async () => {
    // 复用 ① 的夹具与行（happy 用例已落库）
    expect(happy).toBeTruthy();
    const jobId = happy.jobId;
    const usageRow = happy.usageRow;
    const admin = authReq(adminToken);

    const listRes = await admin.get('/api/admin/grading-runs?pageSize=100');
    expect(listRes.status).toBe(200);
    const item = listRes.body.data.items.find((x) => Number(x.job_id) === jobId);
    expect(item).toBeTruthy();
    expect(item.cost_total).toBeCloseTo(usageRow.cost_total, 6);
    expect(item.cost_currency).toBe('CNY');
    expect(item.cache_hit_rate).toBe(0.4);
    expect(item.model_calls).toBe(2);
    expect(item.no_model_session).toBe(false);
    expect(item.run_kind).toBe('open');                        // OP-1 分类不回退

    const detailRes = await admin.get('/api/admin/grading-runs/job-' + jobId);
    expect(detailRes.status).toBe(200);
    const d = detailRes.body.data;
    expect(d.usage_info.available).toBe(true);
    expect(d.usage_info.source).toBe('grading_run_usage');
    const u = d.usage;
    expect(u.available).toBe(true);
    expect(u.source).toBe('grading_run_usage');
    expect(u.calls_basis).toBe('api_call_time');
    expect(u.model).toBe('deepseek-v4-flash');
    expect(u.model_calls).toBe(2);
    expect(u.uncached_input_tokens).toBe(1200);
    expect(u.cache_read_tokens).toBe(800);
    expect(u.output_tokens).toBe(200);
    expect(u.cache_write_tokens).toBe(0);
    expect(u.input_tokens).toBe(2000);
    expect(u.cache_hit_rate).toBe(0.4);
    expect(u.cost_total).toBeCloseTo(usageRow.cost_total, 6);
    expect(u.cost_currency).toBe('CNY');
    expect(u.price_version).toBe(usageRow.price_version);
    expect(u.price_tier).toBe(usageRow.price_tier);
    expect(u.no_model_session).toBe(false);
    // 判据/评语分账：open 无 summary session ⇒ judge=合计，summary=null（如实，不伪造）
    expect(u.cost_split.judge).toBeCloseTo(usageRow.cost_total, 6);
    expect(u.cost_split.summary).toBeNull();
    expect(u.summary_session.generated).toBe(false);
    expect(u.summary_session.state).toBe('not_generated');
    expect(d.tools_info.available).toBe(false);
    expect(d.read_only).toBe(true);
  }, 60000);

  it('③ 未知型号：cost_total=null + reason（不伪造 0），tokens 仍如实落库', async () => {
    installFetch(() => aiResponse({ model: 'unknown-model-zzz' }));
    const fx = await createOpenFixture({ tag: 'unknown-model', submissions: 1 });
    const res = await runOnce({ prisma, jobId: fx.jobId });
    expect(res.status).toBe(JOB_STATUS.done);
    expect(res.usagePersisted).toBe(true);
    const row = await loadRunUsage({ prisma, runRef: 'job:' + fx.jobId });
    expect(row).toBeTruthy();
    expect(row.model).toBe('unknown-model-zzz');
    expect(row.model_calls).toBe(1);
    expect(row.cost_total).toBeNull();                         // ★未知型号不伪造 0
    expect(row.price_tier).toBeNull();
    expect(row.cost_currency).toBe('CNY');                     // 币种来自价目表（可展示）
    expect(row.usage.cost.ok).toBe(false);
    expect(String(row.usage.cost.reason)).toContain('model_not_priced');
    expect(row.usage.calls_note).toContain('费用不可得');
    expect(row.uncached_input_tokens).toBe(600);               // token 仍如实
    expect(row.cache_read_tokens).toBe(400);
    expect(row.output_tokens).toBe(100);
    // 详情同样如实 null（不显示假 0）
    const detail = await authReq(adminToken).get('/api/admin/grading-runs/job-' + fx.jobId);
    expect(detail.status).toBe(200);
    expect(detail.body.data.usage.cost_total).toBeNull();
    expect(detail.body.data.usage.uncached_input_tokens).toBe(600);
  }, 60000);

  it('④ 0 次模型调用：不写 usage 行（绝不显示成「零 LLM 复用」假 0）', async () => {
    const fx = await createOpenFixture({ tag: 'zero-call', submissions: 1 });
    startConsoleSpy();
    const res = await runOnce({
      prisma, jobId: fx.jobId,
      deps: {
        evaluateOpenProject: async () => ({
          graded: 1, failed: 0, skipped: 0, failures: [], reason: null,
          questionId: fx.qid, usage: { model: null, calls: [] },
        }),
      },
    });
    stopConsoleSpy();
    expect(res.status).toBe(JOB_STATUS.done);
    expect(res.usage).toBeNull();
    expect(res.usagePersisted).toBeNull();
    expect(await loadRunUsage({ prisma, runRef: 'job:' + fx.jobId })).toBeNull();
    expect(consoleLines.some((l) => l.includes('OPEN_PROJECT_USAGE=skipped'))).toBe(true);
    const job = await prisma.gradingJob.findUnique({ where: { id: fx.jobId } });
    expect(job.status).toBe(JOB_STATUS.done);
  }, 60000);

  it('⑤ persist 失败 ⇒ fail-soft：job 仍 done、无行、runOnce 不抛（不改终态）', async () => {
    const fx = await createOpenFixture({ tag: 'persist-fail', submissions: 1 });
    const flakyPrisma = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === '$executeRawUnsafe') {
          return async (sql, ...args) => {
            if (String(sql).includes('grading_run_usage')) throw new Error('injected_usage_persist_failure');
            return target.$executeRawUnsafe(sql, ...args);
          };
        }
        if (prop === '$queryRawUnsafe') return async (sql, ...args) => target.$queryRawUnsafe(sql, ...args);
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    startConsoleSpy();
    const res = await runOnce({
      prisma: flakyPrisma, jobId: fx.jobId,
      deps: {
        evaluateOpenProject: async () => ({
          graded: 1, failed: 0, skipped: 0, failures: [], reason: null,
          questionId: fx.qid,
          usage: {
            model: 'deepseek-v4-flash',
            calls: [{ at: new Date().toISOString(), model: 'deepseek-v4-flash', prompt_tokens: 10, cache_hit_tokens: 0, cache_miss_tokens: 10, output_tokens: 5, submissionId: fx.subIds[0] }],
          },
        }),
      },
    });
    stopConsoleSpy();
    expect(res.consumed).toBe(true);
    expect(res.status).toBe(JOB_STATUS.done);                  // ★落库失败不改 job 终态
    expect(res.usagePersisted).toBe(false);
    expect(res.usage).toBeTruthy();                            // 内存中有 usage 摘要
    expect(await loadRunUsage({ prisma, runRef: 'job:' + fx.jobId })).toBeNull();
    expect(consoleLines.some((l) => l.includes('OPEN_PROJECT_USAGE=failed'))).toBe(true);
    const job = await prisma.gradingJob.findUnique({ where: { id: fx.jobId } });
    expect(job.status).toBe(JOB_STATUS.done);
  }, 60000);

  it('⑥ 失败调用的真实 token 照计：3 次 200 响应全入 model_calls；job=needs_rerun 但行已落库', async () => {
    installFetch(() => aiResponse({ content: 'bad-json-from-model' }));    // 每轮 200 但解析失败
    const fx = await createOpenFixture({ tag: 'failed-calls', submissions: 1 });
    const res = await runOnce({ prisma, jobId: fx.jobId });
    expect(fetchBodies).toHaveLength(3);                       // gradeProject 3 次重试
    expect(res.status).toBe(JOB_STATUS.needsRerun);            // 失败不伪造 done
    expect(res.usagePersisted).toBe(true);                     // ★失败调用已计费 ⇒ 仍落库
    const row = await loadRunUsage({ prisma, runRef: 'job:' + fx.jobId });
    expect(row).toBeTruthy();
    expect(row.model_calls).toBe(3);
    expect(row.uncached_input_tokens).toBe(1800);              // 3 × 600
    expect(row.cache_read_tokens).toBe(1200);                  // 3 × 400
    expect(row.output_tokens).toBe(300);                       // 3 × 100
    expect(row.usage.calls).toHaveLength(3);
    const job = await prisma.gradingJob.findUnique({ where: { id: fx.jobId } });
    expect(job.status).toBe(JOB_STATUS.needsRerun);
    expect(String(job.lastError || '')).toContain('open_grade_partial');
    const sub = await prisma.submission.findFirst({ where: { assignmentId: fx.aid } });
    expect(sub.status).toBe('submitted');                      // markFailed 还原 ⇒ 可重试
  }, 120000);
});
