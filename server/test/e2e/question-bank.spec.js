// 题库管理 E2E 测试
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-state.json'), 'utf-8'));
const API = 'http://localhost:3000/api';
const SQ = `schoolId=${state.schoolId || 1}`;

test.describe('题库管理 API', () => {
  let ctx, token;

  test.beforeAll(async ({ playwright }) => {
    ctx = await playwright.request.newContext();
    const login = await ctx.post(`${API}/auth/login`, {
      data: { username: state.teacher.username, password: state.teacher.password },
    });
    const body = await login.json();
    token = body.data.token;
  });

  test.afterAll(async () => { await ctx?.dispose(); });

  function head() { return { Authorization: `Bearer ${token}` }; }

  let qid1, qid2;

  test('1 创建主观题', async () => {
    const res = await ctx.post(`${API}/teacher/questions?${SQ}`, { data: {
      title: 'E2E主', difficulty: 'medium', objectiveSettings: { classificationMode: 'group' },
      subQuestions: [{ type: 'code', score: 10, content: '<p>x</p>', referenceAnswer: 'ok', language: 'javascript' }],
    }, headers: head() });
    expect(res.status()).toBe(200);
    const b = await res.json(); expect(b.code).toBe(0);
    qid1 = b.data.id;
  });

  test('2 创建客观题', async () => {
    const res = await ctx.post(`${API}/teacher/questions?${SQ}`, { data: {
      title: 'E2E客', difficulty: 'easy', objectiveSettings: { classificationMode: 'group' },
      subQuestions: [{ type: 'objective', score: 2, objectiveItems: [
        { key:0, type:'choice', stem:'1+1=?', options:[{key:'A',text:'1'},{key:'B',text:'2'}], answer:'B', score:1 },
        { key:1, type:'judge', stem:'ok?', answer:'true', score:1 },
      ]}],
    }, headers: head() });
    expect(res.status()).toBe(200);
    const b = await res.json(); expect(b.code).toBe(0);
    qid2 = b.data.id;
  });

  test('3 列表', async () => {
    const res = await ctx.get(`${API}/teacher/questions?${SQ}&pageSize=100`, { headers: head() });
    expect((await res.json()).data.total).toBeGreaterThanOrEqual(2);
  });

  test('4 详情', async () => {
    const res = await ctx.get(`${API}/teacher/questions/${qid1}?${SQ}`, { headers: head() });
    expect((await res.json()).data.title).toContain('E2E');
  });

  test('5 编辑', async () => {
    const res = await ctx.put(`${API}/teacher/questions/${qid1}?${SQ}`, { data: {
      title: 'E2E主-改', difficulty: 'hard', objectiveSettings: { classificationMode: 'group' },
      subQuestions: [{ type: 'code', score: 15, content: '<p>edited</p>', referenceAnswer: 'ok', language: 'js' }],
    }, headers: head() });
    expect(res.status()).toBe(200);
  });

  test('6 无分→400', async () => {
    const res = await ctx.post(`${API}/teacher/questions?${SQ}`, { data: {
      title: 'noscore', subQuestions: [{ type: 'code', content: 'x' }],
    }, headers: head() });
    expect(res.status()).toBe(400);
  });

  test('7 零分→400', async () => {
    const res = await ctx.post(`${API}/teacher/questions?${SQ}`, { data: {
      title: 'zero', subQuestions: [{ type: 'code', score: 0, content: 'x' }],
    }, headers: head() });
    expect(res.status()).toBe(400);
  });

  test('8 超长标题→400', async () => {
    const res = await ctx.post(`${API}/teacher/questions?${SQ}`, { data: {
      title: 'A'.repeat(201), subQuestions: [{ type: 'code', score: 10, content: 'x' }],
    }, headers: head() });
    expect(res.status()).toBe(400);
  });

  test('9 未登录→401', async () => {
    const res = await ctx.get(`${API}/teacher/questions?${SQ}`);
    expect(res.status()).toBe(401);
  });

  test('10 AI解析', async () => {
    const res = await ctx.post(`${API}/teacher/parse-exam?${SQ}`, { data: {
      content: '1.Java int字节？\nA.2 B.4 C.8 D.1 答案：B\n2.写数组求和(10分)',
    }, headers: head() });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.questions.length).toBeGreaterThanOrEqual(2);
  });

  test('11 AI生成参考答案', async () => {
    const res = await ctx.post(`${API}/teacher/generate-reference?${SQ}`, { data: {
      stem: 'C++数组最大值方法', scoringCriteria: '正确性60%',
    }, headers: head() });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.answer.length).toBeGreaterThan(10);
  });

  test('12 AI空内容→400', async () => {
    const res = await ctx.post(`${API}/teacher/parse-exam?${SQ}`, { data: { content: '' }, headers: head() });
    expect(res.status()).toBe(400);
  });

  test('13 删除', async () => {
    for (const id of [qid1, qid2]) {
      await ctx.delete(`${API}/teacher/questions/${id}?${SQ}`, { headers: head() });
    }
    const list = await ctx.get(`${API}/teacher/questions?${SQ}&pageSize=200`, { headers: head() });
    const b = await list.json();
    expect(b.data.list.filter(q => q.id === qid1 || q.id === qid2).length).toBe(0);
  });

  test('14 Helmet头', async () => {
    const res = await ctx.get(`${API}/health`);
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('15 404', async () => {
    const res = await ctx.get(`${API}/teacher/questions/99999?${SQ}`, { headers: head() });
    expect(res.status()).toBe(404);
  });
});
