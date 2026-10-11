/**
 * tc-b0 · parseExamStream 契约测试（step 9 · B0，打靶 plan §5.3 Z5 —— jest 与 e2e 双零覆盖）
 *
 * 目标：钉住 POST /api/teacher/parse-exam-stream（源 :395-422）的 SSE 契约。
 * 断言口径 = 状态码 + **SSE 四 header 逐字** + 原始响应体按 \n\n 切分后逐片解析：
 *   :397 空内容 → 400 '请提供试卷内容'（writeHead 之前，普通 json）
 *   :403-408 writeHead 200 + Content-Type/Cache-Control/Connection/X-Accel-Buffering
 *   :410 send = 'data: ' + JSON.stringify + '\n\n'；:413 start → 进度片 → :415 done
 * ★硬禁网：请求前替换 globalThis.fetch 为替身（返回 SSE 流），用例末尾断言替身**被调用 ≥1 次**并登记 URL。
 *
 * 夹具自建自清（tce_ 前缀，独立学校院校代码 29641），不依赖 setup seed。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'tce_';
const CODE_A = '29641';
const PAPER = PREFIX + '试卷正文（替身不会真的看到它）';
const STUB_QUESTIONS = [{ type: 'choice', stem: PREFIX + '题干', options: ['A', 'B'], answer: 'A' }];

let sA, tA, tokenA;
let realFetch;
let fetchCalls = [];

/** 单次读出全部 SSE 分片后结束的 ReadableStream 替身 */
function makeSseBody(chunks) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (i >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: encoder.encode(chunks[i++]) };
        },
      };
    },
  };
}

/** 模型回答（含 "questions" 的 JSON 串，供 exam-parsing.js 的正则匹配） */
const MODEL_CONTENT = '前言\n' + JSON.stringify({ questions: STUB_QUESTIONS }) + '\n后记';
const SSE_CHUNKS = [
  'data: ' + JSON.stringify({ choices: [{ delta: { content: MODEL_CONTENT.slice(0, 20) } }] }) + '\n\n',
  'data: ' + JSON.stringify({ choices: [{ delta: { content: MODEL_CONTENT.slice(20) } }] }) + '\n\n',
  'data: [DONE]\n\n',
];

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

beforeAll(async () => {
  await purge();
  sA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  tA = await prisma.user.create({
    data: { username: PREFIX + 'teacher_a', password: bcrypt.hashSync(PREFIX + 'teacher_a', 10), realName: 'tce教师A', role: 'teacher' },
  });
  await prisma.teacherSchool.create({ data: { teacherId: tA.id, schoolId: sA.id } });
  const res = await request().post('/api/auth/login').send({ username: PREFIX + 'teacher_a', password: PREFIX + 'teacher_a' });
  if (res.body.code !== 0) throw new Error('登录失败: ' + JSON.stringify(res.body));
  tokenA = res.body.data.token;
}, 60000);

afterAll(async () => {
  if (realFetch) globalThis.fetch = realFetch;
  await purge();
}, 60000);

const stream = (body) => request().post('/api/teacher/parse-exam-stream')
  .send(body).set('Authorization', 'Bearer ' + tokenA);

/** 取原始响应文本（supertest 对 text/event-stream 的分流口径两种都兜住） */
function rawText(res) {
  if (typeof res.text === 'string' && res.text.length > 0) return res.text;
  if (Buffer.isBuffer(res.body) && res.body.length > 0) return res.body.toString('utf8');
  return '';
}

describe('T-E · POST /api/teacher/parse-exam-stream（Z5 SSE 契约）', () => {
  it('T-E1 空内容 → 400 请提供试卷内容（writeHead 之前，仍是 json）', async () => {
    for (const body of [{}, { content: '' }, { content: '   \n  ' }]) {
      const res = await stream(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 1001, message: '请提供试卷内容', data: null });
    }
  });

  it('T-E2 合法内容 → SSE 四 header + start/progress/done 分片顺序 + 替身被调用', async () => {
    realFetch = globalThis.fetch;
    fetchCalls = [];
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url: String(url), body: String(opts?.body ?? '') });
      return { ok: true, status: 200, body: makeSseBody(SSE_CHUNKS), text: async () => '', json: async () => ({}) };
    };
    try {
      const res = await stream({ content: PAPER });
      expect(res.status).toBe(200);
      // ① 四个 header 逐字
      expect(res.headers['content-type']).toBe('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['connection']).toBe('keep-alive');
      expect(res.headers['x-accel-buffering']).toBe('no');

      // ② 原始响应体：'data: ' 前缀 + 双换行分片
      const text = rawText(res);
      const parts = text.split('\n\n').filter(p => p.length > 0);
      expect(parts.length).toBeGreaterThanOrEqual(4);
      for (const p of parts) expect(p.startsWith('data: ')).toBe(true);
      const parsed = parts.map(p => JSON.parse(p.slice('data: '.length)));

      expect(parsed[0]).toEqual({ phase: 'start', totalChars: PAPER.length });
      expect(parsed[parsed.length - 1]).toEqual({ phase: 'done', questions: STUB_QUESTIONS, count: 1 });
      // 中间进度片来自 parseExamPaperStream 的 onProgress（connecting → streaming → token → parsing）
      const phases = parsed.map(p => p.phase);
      expect(phases).toContain('connecting');
      expect(phases).toContain('streaming');
      expect(phases).toContain('parsing');
      expect(phases.filter(p => p === 'token').length).toBeGreaterThanOrEqual(1);
      expect(phases.indexOf('start')).toBe(0);
      expect(phases.indexOf('done')).toBe(phases.length - 1);
      // token 片带累积长度，且最终等于模型回答长度
      const tokenParts = parsed.filter(p => p.phase === 'token');
      expect(tokenParts[tokenParts.length - 1].contentLength).toBe(MODEL_CONTENT.length);

      // ③ 替身确实被调用（真出网 = 判负）
      expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
      expect(fetchCalls[0].url).toContain('/v1/chat/completions');
      expect(JSON.parse(fetchCalls[0].body).stream).toBe(true);
      expect(JSON.parse(fetchCalls[0].body).messages[1].content).toContain(PAPER);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
