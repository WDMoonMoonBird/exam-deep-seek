/**
 * tc-b0 · uploadMaterial 契约测试（step 9 · B0，打靶 plan §5.3 Z7）
 *
 * 目标：钉住 POST /api/teacher/upload-material（源 :1288-1322，multer 配置块 + handler）。
 * 断言口径 = 状态码 + 响应体形状（含 code 与中文文案逐字）+ **磁盘落盘终态**：
 *   ① 非 zip → 400 '仅支持 zip 文件'（multer fileFilter 的 new Error 文案，:1310）
 *   ② 不带文件 → 400 '未选择文件'（:1318）
 *   ③ 合法 zip → 200，url 形状正则 + name 逐字 + 文件真的落在 UPLOADS_ROOT/materials 且内容逐字节相等
 *
 * ★本套件是 B0 唯一会往磁盘写东西的用例：产物写在仓库既有 server/uploads/materials 下，
 *   用例内 finally 自清（并断言删除后不存在）；afterAll 再兜一次。
 * 夹具自建自清（tcd_ 前缀，独立学校院校代码 29631），不依赖 setup seed。
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { UPLOADS_ROOT } from '../../src/utils/projectPaths.js';
import { request } from './helpers.js';

const PREFIX = 'tcd_';
const CODE_A = '29631';
const MATERIALS_DIR = path.join(UPLOADS_ROOT, 'materials');
const ZIP_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(PREFIX + 'zip-payload')]);

let sA, tA, tokenA;
const written = new Set();

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

/** 只清理由本套件用例登记的上传产物（路径必须严格位于 materials 目录内） */
function cleanupWritten() {
  for (const p of written) {
    const resolved = path.resolve(p);
    if (!resolved.startsWith(MATERIALS_DIR + path.sep)) {
      throw new Error('拒绝删除 materials 之外的路径: ' + resolved);
    }
    fs.rmSync(resolved, { force: true });
  }
  written.clear();
}

async function seed() {
  await purge();
  sA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  tA = await prisma.user.create({
    data: { username: PREFIX + 'teacher_a', password: bcrypt.hashSync(PREFIX + 'teacher_a', 10), realName: 'tcd教师A', role: 'teacher' },
  });
  await prisma.teacherSchool.create({ data: { teacherId: tA.id, schoolId: sA.id } });
  const res = await request().post('/api/auth/login').send({ username: PREFIX + 'teacher_a', password: PREFIX + 'teacher_a' });
  if (res.body.code !== 0) throw new Error('登录失败: ' + JSON.stringify(res.body));
  tokenA = res.body.data.token;
}

const upload = () => request().post('/api/teacher/upload-material').set('Authorization', 'Bearer ' + tokenA);

beforeAll(async () => { await seed(); }, 60000);
afterAll(async () => { cleanupWritten(); await purge(); }, 60000);

describe('T-D · POST /api/teacher/upload-material（Z7 契约，含磁盘落盘断言 + 自清）', () => {
  it('T-D1 非 zip（.txt）→ 400 仅支持 zip 文件，且不落盘', async () => {
    const before = fs.existsSync(MATERIALS_DIR) ? fs.readdirSync(MATERIALS_DIR).length : 0;
    const res = await upload().attach('file', Buffer.from(PREFIX + 'not-a-zip'), PREFIX + 'note.txt');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '仅支持 zip 文件', data: null });
    expect(fs.readdirSync(MATERIALS_DIR).length).toBe(before);
  });

  it('T-D2 不带文件 → 400 未选择文件', async () => {
    const res = await upload().field('other', 'x');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '未选择文件', data: null });
  });

  it('T-D3 合法 zip → 200 上传成功，url 形状 + name 逐字 + 磁盘存在且内容逐字节相等（finally 自清）', async () => {
    let abs = null;
    try {
      const res = await upload().attach('file', ZIP_BYTES, PREFIX + 'package.zip');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['code', 'message', 'data']);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('上传成功');
      expect(Object.keys(res.body.data)).toEqual(['url', 'name']);
      expect(res.body.data.name).toBe(PREFIX + 'package.zip');
      expect(res.body.data.url).toMatch(/^\/uploads\/materials\/\d+_[a-z0-9]+\.zip$/);

      abs = path.join(MATERIALS_DIR, path.basename(res.body.data.url));
      written.add(abs);
      expect(fs.existsSync(abs)).toBe(true);
      expect(fs.readFileSync(abs)).toEqual(ZIP_BYTES);
    } finally {
      if (abs) {
        fs.rmSync(abs, { force: true });
        written.delete(abs);
        expect(fs.existsSync(abs)).toBe(false);
      }
    }
  });
});
