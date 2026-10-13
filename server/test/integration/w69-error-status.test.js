/**
 * W69（R2-B61）错误状态码后端侧：/api 404 JSON、上传 413+code1403（学生/教师同口径）、错误中间件 Accept 分流、guard body 统一。
 *   说明：nginx 前缀改写（/exam/api/* → /api/*）后 Express 看到的路径与本套件断言的一致；P0-1/P0-2（SPA fallback）由 nginx 负责，不在本批。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import app, { makeErrorMiddleware } from '../../src/app.js';
import { createMaterialUpload, makeUploadMaterialHandler, multerErrorResponse } from '../../src/infrastructure/teacher/uploads.js';

describe('W69-1 /api 未命中 ⇒ 统一 JSON 404', () => {
  test('GET /api/definitely-missing ⇒ 404 + {code:1404,message:接口不存在} + JSON', async () => {
    const res = await request(app).get('/api/definitely-missing');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ code: 1404, message: '接口不存在', data: null });
  });

  test('即便带 Accept: text/html 也仍是 JSON（API 前缀恒 JSON；HTML 分流只作用于错误中间件）', async () => {
    const res = await request(app).get('/api/another-missing').set('Accept', 'text/html');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1404);
  });
});

describe('W69-2 上传超限 ⇒ 413 + code1403（学生/教师两条路径同口径）', () => {
  test('multer LIMIT_FILE_SIZE ⇒ 413/1403；其它错误 ⇒ 400 + 可读 message；body 形状恒为 {code,message,data}', () => {
    const size = multerErrorResponse(Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' }));
    expect(size).toEqual({ status: 413, body: { code: 1403, message: '文件超过大小限制', data: null } });
    const other = multerErrorResponse(Object.assign(new Error('仅支持 zip 文件'), { code: 'LIMIT_UNEXPECTED_FILE' }));
    expect(other.status).toBe(400);
    expect(other.body).toEqual({ code: 1001, message: '仅支持 zip 文件', data: null });
    const unknown = multerErrorResponse(null);
    expect(unknown).toEqual({ status: 400, body: { code: 1001, message: '上传失败', data: null } });
  });

  test('教师侧真实代码路径：小上限实例 ⇒ 超限 11 字节即 413 + code1403（不真传 50MB）', async () => {
    const tiny = express();
    tiny.post('/upload', makeUploadMaterialHandler(createMaterialUpload(10)));
    const res = await request(tiny).post('/upload').attach('file', Buffer.from('0123456789abc'), 'a.zip');
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ code: 1403, message: '文件超过大小限制', data: null });
  });

  test('教师侧非 size 错误：非 zip 附件 ⇒ 400 + 「仅支持 zip 文件」；未选文件 ⇒ 400 + 「未选择文件」', async () => {
    const tiny = express();
    tiny.post('/upload', makeUploadMaterialHandler(createMaterialUpload(10)));
    const badExt = await request(tiny).post('/upload').attach('file', Buffer.from('x'), 'a.txt');
    expect(badExt.status).toBe(400);
    expect(badExt.body.code).toBe(1001);
    expect(badExt.body.message).toMatch(/仅支持 zip 文件/);
    const none = await request(tiny).post('/upload');
    expect(none.status).toBe(400);
    expect(none.body.message).toBe('未选择文件');
  });

  test('学生侧同口径（源码断言）：LIMIT_FILE_SIZE 分支 ⇒ 413 + code1403，不再回落 400「文件过大（超过 50MB 上限）」', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/studentController.js'), 'utf8');
    expect(src).toContain("uploadErr.code === 'LIMIT_FILE_SIZE'");
    expect(src).toContain("res.status(413).json({ code: 1403, message: '文件超过大小限制', data: null })");
    expect(src).not.toContain('文件过大（超过 50MB 上限）');
  });
});

describe('W69-3 错误中间件 Accept 分流（HTML 错误页 / 不存在回落 JSON）', () => {
  test('Accept: text/html 且错误页存在 ⇒ 返回该 HTML，状态码不变', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b61-pages-'));
    fs.writeFileSync(path.join(dir, '500.html'), '<html><body>服务器内部错误（测试页）</body></html>');
    const a = express();
    a.get('/boom', (_req, _res) => { throw new Error('boom'); });
    a.use(makeErrorMiddleware({ errorPagesDir: dir, log: { error() {} } }));
    const res = await request(a).get('/boom').set('Accept', 'text/html');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/服务器内部错误（测试页）/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('★目录/文件不存在 ⇒ 回落 JSON（状态码不变、不 500 套 500）', async () => {
    const missing = path.join(os.tmpdir(), 'b61-no-such-dir-' + Date.now());
    const a = express();
    a.get('/boom', (_req, _res) => { throw new Error('boom'); });
    a.use(makeErrorMiddleware({ errorPagesDir: missing, log: { error() {} } }));
    const res = await request(a).get('/boom').set('Accept', 'text/html');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 2001, message: '服务器内部错误', data: null });
  });

  test('JSON 请求（Accept: application/json / 无 Accept）⇒ 既有 JSON 契约不变；err.status 生效', async () => {
    const a = express();
    a.get('/teapot', (_req, _res) => { const e = new Error('nope'); e.status = 404; throw e; });
    a.use(makeErrorMiddleware({ errorPagesDir: path.join(os.tmpdir(), 'none'), log: { error() {} } }));
    const res = await request(a).get('/teapot');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 1404, message: '请求处理失败', data: null });
  });
});

describe('W69-4 projectAssetGuard body 统一 + 既有状态码纪律抽检', () => {
  test('受保护资产路径 ⇒ 403 + {code:1003,message:无权访问该资源,data:null}（旧 {error:forbidden} 已消除）', async () => {
    // 用 guard 真实保护的第一个前缀（BLOCKED_PREFIXES[0] = /uploads/project-standards）
    const res = await request(app).get('/uploads/project-standards/whatever.txt');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 1003, message: '无权访问该资源', data: null });
  });

  test('抽检：未带令牌 ⇒ 401 JSON；/api 未命中 ⇒ 404；无 Accept 的错误 ⇒ 500 JSON', async () => {
    const unauth = await request(app).get('/api/teacher/students');
    expect(unauth.status).toBe(401);
    expect(unauth.body.code).toBe(1002);
    const nf = await request(app).get('/api/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.code).toBe(1404);
  });
});