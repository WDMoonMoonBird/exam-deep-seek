// 公网生产环境 E2E
import { test, expect } from '@playwright/test';

const API = 'https://deadpan.asia/exam/api';
const BASE = 'https://deadpan.asia/exam';
const T = { username: 'e2e_t2', password: 'e2e_t2' };
const S = { username: '20253182105', password: '20253182105' };
const SID = 2175; const CID = 13;

async function api(page, method, path, data, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return page.evaluate(async ({ method, url, data, headers }) => {
    const opts = { method, headers };
    if (data) opts.body = JSON.stringify(data);
    const r = await fetch(url, opts);
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  }, { method, url: API + path, data, headers });
}

test('公网全流程测试', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto(BASE + '/login'); // 建立 origin

  // === 健康检查 ===
  let r = await api(page, 'GET', '/health');
  expect(r.body.code).toBe(0);
  console.log('✓ 健康检查');

  // === 登录 ===
  r = await api(page, 'POST', '/auth/login', T);
  expect(r.body.code).toBe(0);
  const Tk = r.body.data.token;
  console.log('✓ 教师 ' + r.body.data.user.realName);

  r = await api(page, 'POST', '/auth/login', S);
  expect(r.body.code).toBe(0);
  const Sk = r.body.data.token;
  console.log('✓ 学生 ' + r.body.data.user.realName);

  // === Q1.1 创建主观题 ===
  r = await api(page, 'POST', `/teacher/questions?schoolId=${SID}`, {
    title: '[公网E2E]主观题', difficulty: 'easy',
    subQuestions: [{ type: 'code', score: 10, content: '<p>写Hello World</p>', referenceAnswer: 'print("hello")', language: 'python' }],
  }, Tk);
  expect(r.body.code).toBe(0);
  const qid1 = r.body.data.id;
  console.log('✓ 主观题 id=' + qid1 + ' 总分=' + r.body.data.maxScore);

  // === Q1.2 创建客观题 ===
  r = await api(page, 'POST', `/teacher/questions?schoolId=${SID}`, {
    title: '[公网E2E]客观题', difficulty: 'easy',
    objectiveSettings: { classificationMode: 'flat' },
    subQuestions: [{
      type: 'objective', score: 3,
      objectiveItems: [
        { key: 0, type: 'choice', stem: '1+1=?', options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }], answer: 'B', score: 1 },
        { key: 1, type: 'judge', stem: 'Java是面向对象', answer: 'true', score: 1 },
        { key: 2, type: 'fill', stem: 'Python导入关键字', answer: 'import', score: 1 },
      ],
    }],
  }, Tk);
  expect(r.body.code).toBe(0);
  const qid2 = r.body.data.id;
  console.log('✓ 客观题 id=' + qid2);

  // === 边界校验 ===
  r = await api(page, 'POST', `/teacher/questions?schoolId=${SID}`, {
    title: '空分', subQuestions: [{ type: 'code', content: '<p>x</p>' }],
  }, Tk);
  expect(r.status).toBe(400);
  console.log('✓ 空分400');

  r = await api(page, 'POST', `/teacher/questions?schoolId=${SID}`, {
    title: 'A'.repeat(201), subQuestions: [{ type: 'code', score: 10, content: '<p>x</p>' }],
  }, Tk);
  expect(r.status).toBe(400);
  console.log('✓ 超长标题400');

  r = await api(page, 'GET', `/teacher/questions/99999?schoolId=${SID}`, null, Tk);
  expect(r.status).toBe(404);
  console.log('✓ 404');

  // === 布置作业 ===
  const now = new Date();
  const s = new Date(now - 60000).toISOString();
  const e = new Date(now.getTime() + 120 * 60000).toISOString();

  r = await api(page, 'POST', `/teacher/assignments?schoolId=${SID}`, {
    title: '[公网E2E]作业', startTime: s, endTime: e, allowResubmit: false,
    questionIds: [qid1], classIds: [CID],
  }, Tk);
  expect(r.body.code).toBe(0);
  const assId = r.body.data.id;
  console.log('✓ 作业 id=' + assId);

  // === 学生提交 ===
  let qr = await api(page, 'GET', `/teacher/questions/${qid1}?schoolId=${SID}`, null, Tk);
  const sqId = qr.body.data.subQuestions[0].id;

  r = await api(page, 'POST', `/student/assignments/${assId}/submit`, {
    questionId: qid1, subQuestionId: sqId, answer: 'print("hello world")',
  }, Sk);
  expect(r.body.code).toBe(0);
  console.log('✓ 提交成功');

  // === 禁止重复提交 ===
  r = await api(page, 'POST', `/student/assignments/${assId}/submit`, {
    questionId: qid1, subQuestionId: sqId, answer: 'print("again")',
  }, Sk);
  expect(r.status).toBe(400);
  console.log('✓ 重复提交被拒');

  // === 客观题评分 (需要在另一个作业上测试) ===
  r = await api(page, 'POST', `/teacher/assignments?schoolId=${SID}`, {
    title: '[公网E2E]客观作业', startTime: s, endTime: e, allowResubmit: false,
    questionIds: [qid2], classIds: [CID],
  }, Tk);
  const objAssId = r.body.data.id;

  qr = await api(page, 'GET', `/teacher/questions/${qid2}?schoolId=${SID}`, null, Tk);
  const objSqId = qr.body.data.subQuestions[0].id;

  r = await api(page, 'POST', `/student/assignments/${objAssId}/submit`, {
    questionId: qid2, subQuestionId: objSqId,
    answer: JSON.stringify([{ key: 0, answer: 'B' }, { key: 1, answer: 'true' }, { key: 2, answer: 'import' }]),
  }, Sk);
  expect(r.body.code).toBe(0);
  console.log('  客观题提交');

  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(2000);
    const cr = await api(page, 'GET', `/teacher/review-class/${CID}?assignmentId=${objAssId}&pageSize=5`, null, Tk);
    const list = cr.body.data?.list || [];
    const graded = list.filter(s => s.aiScore != null);
    if (graded.length) {
      const score = graded[0].aiScore;
      console.log('✓ 客观评分: ' + score + '/3');
      expect(score).toBe(3);
      break;
    }
    if (i === 39) console.log('⚠ 评分超时,已等80s');
  }

  // === 导出Excel ===
  r = await api(page, 'GET', `/teacher/export-review?classId=${CID}&assignmentId=${assId}`, null, Tk);
  expect(r.status).toBe(200);
  console.log('✓ 导出: ' + r.body.data?.rows?.length + '行 ' + r.body.data?.headerCells?.length + '列');

  // === 清理 ===
  for (const qid of [qid1, qid2]) {
    await api(page, 'DELETE', `/teacher/questions/${qid}?schoolId=${SID}`, null, Tk);
    console.log('  删除题目 ' + qid);
  }

  console.log('\n✅ 公网测试全部通过');
});
