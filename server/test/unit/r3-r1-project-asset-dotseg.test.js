/**
 * R3-R1（P0）回归断言：projectAssetGuard 点段（. / ..）绕过
 *
 * 依据：reports/fix/round3/TICKETS/R3-R1.md §3 验收断言
 * 背景（HEAD c4e17f5）：normalize() 只做 decode/折斜杠/去尾斜杠/小写，不消解点段；
 *   前缀匹配不命中即 next() 放行，随后 express.static 自己会消解点段并命中封禁目录。
 *
 * 本文件两种取证形态（互补，均不依赖 DB 语义）：
 *   ① middleware 级 fake req —— 直接锁定 normalize/前缀判定行为（修复前必红）；
 *   ② 真实 express 栈 + Node 原生 http.request —— 证明端到端暴露；不用 supertest，
 *      因为 superagent 发送前会归一化 "./"（会把漏洞洗成 403 假象）。
 *
 * 注：仓库 jest 默认 setupFiles 会 seed 测试库；若 DB 不可用，可用 TEST-PLAN §6.2 的
 *     无 setup 配置只跑本文件（本文件不 import prisma）。
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import projectAssetGuard from '../../src/middleware/projectAssetGuard.js';

/** 与 security-path-guards.test.js 同形态的 guard 探针 */
function runGuard(urlPath) {
  let calledNext = false;
  let status = null;
  let body = null;
  const req = { path: urlPath };
  const res = {
    status: (s) => { status = s; return res; },
    json: (b) => { body = b; return res; },
  };
  projectAssetGuard(req, res, () => { calledNext = true; });
  return { calledNext, status, body };
}

describe('R3-R1 点段绕过 · middleware 级（fake req）', () => {
  const dotSegmentBlocked = [
    '/uploads/./project-questions/a.json',
    '/uploads/%2e/project-questions/a.json',
    '/uploads/x/../project-questions/a.json',
    '/uploads/x/%2e%2e/project-questions/a.json',
    '/uploads/./project-standards/a.zip',
    '/uploads/./projects/1/secret.txt',
    '/uploads/project-submissions/./1/x.pdf',
  ];

  it.each(dotSegmentBlocked)('点段变体 %s → 403(code 1003) 且不 next', (p) => {
    const r = runGuard(p);
    expect(r.calledNext).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body && r.body.code).toBe(1003);
  });

  const legacyBlocked = [
    '/uploads/project-standards',
    '/uploads/project-questions',
    '/uploads/project-submissions',
    '/uploads/projects',
    '/uploads/%70roject-standards',
    '/uploads/project-standards/',
    '/uploads//project-questions',
    '/uploads/project%2Dstandards',
    '/uploads/project-standards%2F',
    '/uploads/projects%2F1/submissions',
    '/uploads/PROJECT-QUESTIONS/a',
  ];

  it.each(legacyBlocked)('既有封禁口径不回归 %s → 403', (p) => {
    const r = runGuard(p);
    expect(r.calledNext).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body && r.body.code).toBe(1003);
  });

  it('合法非封禁前缀仍放行（不得过度收紧）', () => {
    const allowed = [
      '/uploads/avatars/a.png',
      '/uploads/project-questions-public/x',
      '/uploads/materials/a.zip',
      '/uploads/projects-public/x',
      '/api/health',
      '/',
    ];
    for (const p of allowed) expect(runGuard(p).calledNext).toBe(true);
  });
});

describe('R3-R1 点段绕过 · 真实 express 栈 + 原生 http 请求（端到端取证）', () => {
  let server;
  let root;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-r1-'));
    fs.mkdirSync(path.join(root, 'project-questions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'project-questions', 'a.json'), '{"secret":true}');
    fs.mkdirSync(path.join(root, 'avatars'), { recursive: true });
    fs.writeFileSync(path.join(root, 'avatars', 'a.png'), 'PNG');
    const app = express();
    app.use(projectAssetGuard);
    app.use('/uploads', express.static(root));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });

  function rawGet(rawPath) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: server.address().port, path: rawPath, method: 'GET' },
        (res) => {
          let b = '';
          res.on('data', (d) => { b += d; });
          res.on('end', () => resolve({ status: res.statusCode, body: b }));
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  const exposedRawPaths = [
    '/uploads/./project-questions/a.json',
    '/uploads/x/../project-questions/a.json',
    '/uploads/%2e/project-questions/a.json',
    '/uploads/x/%2e%2e/project-questions/a.json',
  ];

  it.each(exposedRawPaths)('原始路径 %s 不得返回 200 文件内容（修复前实测 200）', async (p) => {
    const res = await rawGet(p);
    expect(res.body).not.toContain('"secret":true');
    expect(res.status).toBe(403);
  });

  it('正例：非封禁静态路径照常可读（不误伤）', async () => {
    const res = await rawGet('/uploads/avatars/a.png');
    expect(res.status).toBe(200);
    expect(res.body).toBe('PNG');
  });
});
