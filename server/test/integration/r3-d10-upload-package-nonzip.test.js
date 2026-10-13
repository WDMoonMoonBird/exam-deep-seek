/**
 * r3-d10-upload-package-nonzip.test.js —— R3-D10（t19）修复验证：
 *   legacy 教师侧标准工程包上传（POST /api/teacher/projects/upload-package）遇「非 zip / 损坏 zip」
 *   ⇒ **400 +「压缩包内容非法」**（不再 500），且不泄漏 adm-zip 内部文案。
 *
 * 与 t16/D8 的学生侧（student/project-submit）同口径；本用例只走上传接口，不建任何业务数据。
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { request, loginAsTeacher } from './helpers.js';

const PROJECTS_DIR = path.resolve(process.cwd(), 'uploads/projects');
let token;
let dirsBefore = new Set();

const upload = (buffer, filename) => request()
  .post('/api/teacher/projects/upload-package')
  .set('Authorization', 'Bearer ' + token)
  .attach('file', buffer, filename);

const listTempDirs = () => new Set(
  fs.existsSync(PROJECTS_DIR)
    ? fs.readdirSync(PROJECTS_DIR).filter((d) => d.startsWith('temp_'))
    : [],
);

beforeAll(async () => {
  token = await loginAsTeacher();
  dirsBefore = listTempDirs();
}, 30000);

afterAll(() => {
  // 本文件产生的临时目录（既有实现失败时不留回滚，属 pre-existing 行为；测试侧自行清理）
  for (const d of listTempDirs()) {
    if (dirsBefore.has(d)) continue;
    fs.rmSync(path.join(PROJECTS_DIR, d), { recursive: true, force: true });
  }
});

describe('R3-D10 标准工程包上传：损坏/非 zip ⇒ 400 +「压缩包内容非法」', () => {
  it('纯文本伪装 .zip → 400 +「压缩包内容非法」（不再 500，无 adm-zip 内部文案）', async () => {
    const res = await upload(Buffer.from('this is definitely not a zip archive'), 'fake-standard.zip');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '压缩包内容非法', data: null });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/END header|Invalid|unsupported|adm-zip|解压失败/i);
  });

  it('截断的 zip（前 32 字节合法头）→ 400 +「压缩包内容非法」', async () => {
    const zip = new AdmZip();
    zip.addFile('src/Main.java', Buffer.from('class Main {}'));
    const truncated = zip.toBuffer().subarray(0, 32);
    const res = await upload(truncated, 'truncated-standard.zip');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('压缩包内容非法');
  });

  it('非 .zip 扩展名 → 仍由 multer 过滤拦下（400「仅支持 zip 文件」，既有语义不变）', async () => {
    const res = await upload(Buffer.from('hello'), 'standard.txt');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '仅支持 zip 文件', data: null });
  });

  it('合法 zip 仍正常上传（happy path 未被错误映射吞掉）', async () => {
    const zip = new AdmZip();
    zip.addFile('src/Main.java', Buffer.from('class Main {}'));
    const res = await upload(zip.toBuffer(), 'good-standard.zip');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.fileCount).toBe(1);
    expect(res.body.data.tree.length).toBeGreaterThan(0);
  });
});
