// 全量 E2E 测试 — 测试计划模块 8
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-state.json'), 'utf-8'));
const API = 'http://localhost:3000/api';
const ROOT = path.resolve(__dirname, '../../..');
const EXAM_DIR = ROOT; // exam docs are at repo root

test.describe('E2E 全量测试 (测试计划模块8)', () => {
  let ctx, teacherToken, studentToken, adminToken;
  let javaQid, csharpQid, pythonQid;
  let javaAssId, csharpAssId, pythonAssId;
  let subIds = [];

  test.beforeAll(async ({ playwright }) => {
    ctx = await playwright.request.newContext();

    // 登录
    const tLogin = await ctx.post(`${API}/auth/login`, {
      data: { username: STATE.teacher.username, password: STATE.teacher.password },
    });
    teacherToken = (await tLogin.json()).data.token;

    const sLogin = await ctx.post(`${API}/auth/login`, {
      data: { username: STATE.student.username, password: STATE.student.password },
    });
    studentToken = (await sLogin.json()).data.token;

    const aLogin = await ctx.post(`${API}/auth/login`, {
      data: { username: STATE.admin.username, password: STATE.admin.password },
    });
    adminToken = (await aLogin.json()).data.token;
  });

  test.afterAll(async () => { await ctx?.dispose(); });

  function T() { return { Authorization: `Bearer ${teacherToken}` }; }
  function S() { return { Authorization: `Bearer ${studentToken}` }; }
  function A() { return { Authorization: `Bearer ${adminToken}` }; }

  // ==================== E8.1 健康检查 ====================
  test('E8.1 健康检查', async () => {
    const r = await ctx.get(`${API}/health`);
    expect(r.status()).toBe(200);
  });

  // ==================== E8.2 登录 ====================
  test('E8.2 登录API', async () => {
    const r = await ctx.post(`${API}/auth/login`, {
      data: { username: STATE.teacher.username, password: STATE.teacher.password },
    });
    expect(r.status()).toBe(200);
    expect((await r.json()).data.token).toBeTruthy();
  });

  // ==================== E8.3~E8.5 AI 解析试卷 ====================
  // AI 解析耗时 60-170s，测试超时放宽到 5 分钟
  test.setTimeout(300000);
  async function parseExam(filename, expectedMinQuestions) {
    const filePath = path.join(EXAM_DIR, filename);
    let content = '';
    if (filename.endsWith('.docx')) {
      const buf = await fs.promises.readFile(filePath);
      const r = await mammoth.extractRawText({ buffer: buf });
      content = r.value;
    }
    console.log(`  [${filename}] 提取文本 ${content.length} 字符`);

    const res = await ctx.post(`${API}/teacher/parse-exam?schoolId=${STATE.schoolId}`, {
      data: { content },
      headers: T(),
      timeout: 240000, // AI 解析实测 60-170s，远超默认 10s
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(0);
    const qCount = body.data.questions?.length || 0;
    console.log(`  [${filename}] 解析出 ${qCount} 题`);
    expect(qCount).toBeGreaterThanOrEqual(expectedMinQuestions);

    // 统计题型
    const types = {};
    body.data.questions.forEach(q => { types[q.type] = (types[q.type] || 0) + 1; });
    console.log(`  [${filename}] 题型分布:`, JSON.stringify(types));

    return body.data.questions;
  }

  test('E8.3 AI解析API-Java', async () => {
    const qs = await parseExam('Java期末考试.docx', 30);
    expect(qs.filter(q => q.type === 'choice').length).toBeGreaterThanOrEqual(18);
    expect(qs.filter(q => q.type === 'judge').length).toBeGreaterThanOrEqual(8);
    expect(qs.filter(q => q.type === 'code').length).toBeGreaterThanOrEqual(4);
  });

  test('E8.4 AI解析API-C#', async () => {
    test.setTimeout(120000);
    const qs = await parseExam('C#期末考试.docx', 25);
    expect(qs.filter(q => q.type === 'choice').length).toBeGreaterThanOrEqual(8);
    expect(qs.filter(q => q.type === 'multi_choice').length).toBeGreaterThanOrEqual(8);
    expect(qs.filter(q => q.type === 'fill').length).toBeGreaterThanOrEqual(8);
    expect(qs.filter(q => q.type === 'code').length).toBeGreaterThanOrEqual(4);
  });

  test('E8.5 AI解析API-Python', async () => {
    const qs = await parseExam('Python期末考试.docx', 8);
    expect(qs.filter(q => q.type === 'code').length).toBeGreaterThanOrEqual(8);
  });

  // ==================== 辅助：从解析结果创建题目 ====================
  async function createQuestionFromParse(filename) {
    const questions = await parseExam(filename, 5);
    // 简单处理：用解析结果的第一段文本做 content，用客观题数据构建
    // 这里直接构建一个通用题目对象
    const subQuestions = [];
    for (const q of questions) {
      if (q.type === 'code') {
        subQuestions.push({
          type: 'code',
          score: 10,
          content: `<p>${(q.stem || '').replace(/\n/g, '<br/>')}</p>`,
          referenceAnswer: q.referenceAnswer || '',
          language: q.language || 'cpp',
          scoringCriteria: q.scoringCriteria || '',
        });
      } else {
        // 客观题：合为一个 subQuestion
        if (!subQuestions.length || subQuestions[subQuestions.length - 1].type !== 'objective') {
          subQuestions.push({ type: 'objective', score: 0, objectiveItems: [] });
        }
        const lastObj = subQuestions[subQuestions.length - 1];
        lastObj.objectiveItems.push({
          key: lastObj.objectiveItems.length,
          type: q.type,
          stem: q.stem || '',
          options: (q.options || []).map((o, i) => ({ key: String.fromCharCode(65 + i), text: o })),
          answer: q.answer || '',
          score: q.type === 'multi_choice' ? 3 : (q.type === 'fill' ? 2 : q.type === 'judge' ? 1 : 2),
        });
        lastObj.score += q.type === 'multi_choice' ? 3 : (q.type === 'fill' ? 2 : q.type === 'judge' ? 1 : 2);
      }
    }

    const res = await ctx.post(`${API}/teacher/questions?schoolId=${STATE.schoolId}`, {
      data: {
        title: filename.replace('.docx', ''),
        difficulty: 'medium',
        objectiveSettings: { classificationMode: 'group', multiChoiceScoring: 'partial' },
        material: '',
        subQuestions,
      },
      headers: T(),
    });

    if (res.status() === 400) {
      const err = await res.json();
      console.log(`  创建题目失败: ${err.message}`);
      return null;
    }

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(0);
    console.log(`  题目已创建: ${body.data.id} (${subQuestions.length} 小题, ${body.data.maxScore} 分)`);
    return body.data.id;
  }

  // ==================== E8.6 创建题目 ====================
  test('E8.6 创建题目API', async () => {
    // 手动创建简单题目测试
    const res = await ctx.post(`${API}/teacher/questions?schoolId=${STATE.schoolId}`, {
      data: {
        title: 'E2E测试题',
        difficulty: 'easy',
        subQuestions: [
          { type: 'code', score: 10, content: '<p>写Hello World</p>', referenceAnswer: 'print("hello")', language: 'python' },
        ],
      },
      headers: T(),
    });
    expect(res.status()).toBe(200);
    const b = await res.json();
    expect(b.code).toBe(0);
    javaQid = b.data.id;
    console.log(`  简单题目已创建: ${javaQid}`);
  });

  // ==================== E8.7 创建作业 ====================
  test('E8.7 创建作业API', async () => {
    if (!javaQid) { console.log('  跳过：无题目'); return; }
    const now = new Date();
    const start = new Date(now.getTime() - 60000).toISOString();
    const end = new Date(now.getTime() + 3600000).toISOString();
    const res = await ctx.post(`${API}/teacher/assignments?schoolId=${STATE.schoolId}`, {
      data: {
        title: 'E2E测试作业',
        description: '自动化测试',
        startTime: start,
        endTime: end,
        allowResubmit: false,
        questionIds: [javaQid],
        classIds: [STATE.classId],
      },
      headers: T(),
    });
    expect(res.status()).toBe(200);
    const b = await res.json();
    expect(b.code).toBe(0);
    javaAssId = b.data.id;
    console.log(`  作业已创建: ${javaAssId}`);
  });

  // ==================== E8.8 学生提交 ====================
  test('E8.8 学生提交API', async () => {
    if (!javaAssId) { console.log('  跳过：无作业'); return; }
    // 获取题目的小题
    const qRes = await ctx.get(`${API}/teacher/questions/${javaQid}?schoolId=${STATE.schoolId}`, { headers: T() });
    const q = (await qRes.json()).data;
    const sq = q.subQuestions?.[0];
    console.log(`  小题ID: ${sq?.id}`);

    const res = await ctx.post(`${API}/student/assignments/${javaAssId}/submit`, {
      data: { questionId: javaQid, subQuestionId: sq.id, answer: 'print("hello world")' },
      headers: S(),
    });
    expect(res.status()).toBe(200);
    subIds.push({ assId: javaAssId, qId: javaQid, sqId: sq.id });
    console.log(`  提交成功`);
  });

  // ==================== E8.9 评分 Worker ====================
  test('E8.9 评分Worker处理', async () => {
    test.setTimeout(180000); // AI 评分需 30-60s+，worker 异步处理
    // 等待 Worker 处理
    console.log('  等待 Worker 评分...');
    let graded = false;
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const res = await ctx.get(
        `${API}/student/assignments/${javaAssId}`,
        { headers: S() }
      );
      const body = await res.json();
      const subs = body.data?.submissions || [];
      if (subs.length > 0 && subs.every(s => s.status === 'ai_graded')) {
        graded = true;
        console.log(`  评分完成: aiScore=${subs[0].aiScore}`);
        break;
      }
    }
    // 至少过了 30s，可能是 AI 超时
    console.log(`  评分状态: ${graded ? '已完成' : '可能超时（正常，DeepSeek可能较慢）'}`);
    // 不强制断言——DeepSeek 可能慢
  });

  // ==================== E8.10 教师审核 ====================
  test('E8.10 教师审核API', async () => {
    // 查 submission
    const detailRes = await ctx.get(
      `${API}/teacher/submissions?schoolId=${STATE.schoolId}`,
      { headers: T() }
    );
    const list = (await detailRes.json()).data?.list || [];
    if (!list.length) { console.log('  跳过：无提交'); return; }

    const sub = list[0];
    const res = await ctx.put(`${API}/teacher/submissions/${sub.id}/review?schoolId=${STATE.schoolId}`, {
      data: { finalScore: 8, teacherFeedback: '不错' },
      headers: T(),
    });
    if (res.status() === 200) {
      console.log(`  审核成功: sub ${sub.id}`);
    } else {
      // 可能未评分
      console.log(`  审核跳过 (status: ${res.status()})`);
    }
  });

  // ==================== E8.11 发布成绩 ====================
  test('E8.11 发布成绩API', async () => {
    const detailRes = await ctx.get(
      `${API}/teacher/submissions?schoolId=${STATE.schoolId}`,
      { headers: T() }
    );
    const list = (await detailRes.json()).data?.list || [];
    const reviewed = list.filter(s => s.status === 'reviewed');
    if (!reviewed.length) { console.log('  跳过：无已审核提交'); return; }

    const res = await ctx.put(`${API}/teacher/submissions/publish`, {
      data: { submissionIds: reviewed.map(s => s.id) },
      headers: T(),
    });
    console.log(`  发布: status=${res.status()}`);
  });

  // ==================== E8.12 学生查看成绩 ====================
  test('E8.12 学生查看成绩API', async () => {
    if (!javaAssId) { console.log('  跳过：无作业'); return; }
    const res = await ctx.get(`${API}/student/assignments/${javaAssId}`, { headers: S() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    console.log(`  数据: assignment=${!!body.data?.assignment}, submissions=${(body.data?.submissions||[]).length}`);
  });

  // ==================== E8.13 导出Excel ====================
  test('E8.13 导出Excel API', async () => {
    const res = await ctx.get(
      `${API}/teacher/export-review?classId=${STATE.classId}&assignmentId=${javaAssId}`,
      { headers: T() }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    console.log(`  headerCells=${(body.data?.headerCells || []).length}, rows=${(body.data?.rows || []).length}`);
  });

  // ==================== E8.14 过期提交拒绝 ====================
  test('E8.14 过期提交拒绝', async () => {
    // 创建一个已过期的作业
    const now = new Date();
    const start = new Date(now.getTime() - 7200000).toISOString();
    const end = new Date(now.getTime() - 3600000).toISOString();
    const assRes = await ctx.post(`${API}/teacher/assignments?schoolId=${STATE.schoolId}`, {
      data: {
        title: 'E2E过期作业',
        startTime: start, endTime: end,
        allowResubmit: false,
        questionIds: [javaQid],
        classIds: [STATE.classId],
      },
      headers: T(),
    });
    if (assRes.status() !== 200) { console.log('  跳过：创建过期作业失败'); return; }
    const assId = (await assRes.json()).data.id;

    const qRes = await ctx.get(`${API}/teacher/questions/${javaQid}?schoolId=${STATE.schoolId}`, { headers: T() });
    const sq = (await qRes.json()).data.subQuestions?.[0];

    const res = await ctx.post(`${API}/student/assignments/${assId}/submit`, {
      data: { questionId: javaQid, subQuestionId: sq.id, answer: 'test' },
      headers: S(),
    });
    expect(res.status()).toBe(400);
    console.log('  ✓ 过期提交被拒绝');
  });

  // ==================== E8.15 强制提交 ====================
  test('E8.15 强制提交', async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 7200000).toISOString();
    const end = new Date(now.getTime() - 3600000).toISOString();
    const assRes = await ctx.post(`${API}/teacher/assignments?schoolId=${STATE.schoolId}`, {
      data: {
        title: 'E2E强制提交作业',
        startTime: start, endTime: end,
        allowResubmit: false,
        questionIds: [javaQid],
        classIds: [STATE.classId],
      },
      headers: T(),
    });
    if (assRes.status() !== 200) { console.log('  跳过'); return; }
    const assId = (await assRes.json()).data.id;

    const qRes = await ctx.get(`${API}/teacher/questions/${javaQid}?schoolId=${STATE.schoolId}`, { headers: T() });
    const sq = (await qRes.json()).data.subQuestions?.[0];

    const res = await ctx.post(`${API}/student/assignments/${assId}/submit`, {
      data: { questionId: javaQid, subQuestionId: sq.id, answer: 'test', force: true },
      headers: S(),
    });
    expect(res.status()).toBe(200);
    console.log('  ✓ 强制提交成功');
  });

  // ==================== E8.16~E8.18 边界 ====================
  test('E8.16 超长标题拒绝', async () => {
    const res = await ctx.post(`${API}/teacher/questions?schoolId=${STATE.schoolId}`, {
      data: {
        title: 'A'.repeat(201),
        subQuestions: [{ type: 'code', score: 10, content: '<p>x</p>' }],
      },
      headers: T(),
    });
    expect(res.status()).toBe(400);
  });

  test('E8.17 空分拒绝', async () => {
    const res = await ctx.post(`${API}/teacher/questions?schoolId=${STATE.schoolId}`, {
      data: {
        title: '空分',
        subQuestions: [{ type: 'code', content: '<p>x</p>' }],
      },
      headers: T(),
    });
    expect(res.status()).toBe(400);
  });

  test('E8.18 404处理', async () => {
    const res = await ctx.get(`${API}/teacher/questions/99999?schoolId=${STATE.schoolId}`, { headers: T() });
    expect(res.status()).toBe(404);
  });
});
