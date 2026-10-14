/**
 * ★H1（P0）回归断言：tempId 路径穿越（可移动/删除 uploads 外目录）
 *
 * 断言的是「**被拒绝**」，不是「无异常」：
 *   POST/PUT /api/teacher/projects 传 tempId：
 *     · '../../etc'             ⇒ 400 + code 1001 + message 含「非法临时目录标识」
 *     · '../../<真实存在的目录>' ⇒ 400，且该目录**原位仍在**（未被 rename/rm）
 *     · 被拒时零写入（不产生 project 行 / 不改动既有行）
 *
 * 修复前（git HEAD）实现：tempId 直接 path.join(PROJECTS_UPLOAD_DIR, String(tempId)) 后
 *   renameSync/rmSync，未做白名单与包含校验 ⇒ 200 且 uploads 外目录被移走（见 W1-C-verify.md）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { authReq, getTestData, loginAsTeacher } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '../..');
const PROJECTS_DIR = path.join(SERVER_ROOT, 'uploads', 'projects');
const TAG = 'secp0h1_' + Date.now() + '_';
const SENTINEL_NAME = TAG + 'sentinel';
const SENTINEL_DIR = path.join(SERVER_ROOT, SENTINEL_NAME);   // uploads 之外（server/ 下）
const TRAVERSAL_ID = '../../' + SENTINEL_NAME;

let token; let classId;

const body = (title, tempId) => ({
  title,
  description: 'sec-p0 H1 探针',
  startTime: new Date(Date.now() - 86400000).toISOString(),
  endTime: new Date(Date.now() + 86400000 * 30).toISOString(),
  machineWeight: 0.4,
  astWeight: 0.3,
  aiWeight: 0.3,
  classIds: [classId],
  ...(tempId === undefined ? {} : { tempId }),
});

async function purgeProjects() {
  const rows = await prisma.project.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } });
  for (const p of rows) {
    await prisma.projectFile.deleteMany({ where: { projectId: p.id } }).catch(() => {});
    await prisma.projectClass.deleteMany({ where: { projectId: p.id } }).catch(() => {});
    await prisma.projectSubmission.deleteMany({ where: { projectId: p.id } }).catch(() => {});
    await prisma.project.delete({ where: { id: p.id } }).catch(() => {});
    fs.rmSync(path.join(PROJECTS_DIR, String(p.id)), { recursive: true, force: true });
  }
}

beforeAll(async () => {
  token = await loginAsTeacher();
  classId = getTestData().classId;
  fs.mkdirSync(SENTINEL_DIR, { recursive: true });
  fs.writeFileSync(path.join(SENTINEL_DIR, 'keep.txt'), 'sentinel');
});

afterAll(async () => {
  await purgeProjects();
  fs.rmSync(SENTINEL_DIR, { recursive: true, force: true });
});

describe('★H1（P0）：tempId 路径穿越必须被拒绝', () => {
  it('H1-1 tempId="../../etc" ⇒ 400（不是 200），且零写入', async () => {
    const res = await authReq(token).post('/api/teacher/projects', body(TAG + 'etc', '../../etc'));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
    expect(String(res.body.message)).toContain('非法临时目录标识');
    expect(await prisma.project.count({ where: { title: TAG + 'etc' } })).toBe(0);
    expect(fs.existsSync('/etc')).toBe(true);
  });

  it('H1-2 tempId 指向 uploads 外真实目录 ⇒ 400 且该目录原位存在（未被移动/删除）', async () => {
    expect(fs.existsSync(path.join(SENTINEL_DIR, 'keep.txt'))).toBe(true);
    const res = await authReq(token).post('/api/teacher/projects', body(TAG + 'sent', TRAVERSAL_ID));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
    // 核心判据：目录**和内容**都还在原位（HEAD 下会被 renameSync 搬进 uploads/projects/<id>）
    expect(fs.existsSync(SENTINEL_DIR)).toBe(true);
    expect(fs.existsSync(path.join(SENTINEL_DIR, 'keep.txt'))).toBe(true);
    expect(await prisma.project.count({ where: { title: TAG + 'sent' } })).toBe(0);
  });

  it('H1-3 PUT 更新同样拒绝穿越 tempId（400），且项目字段零改动', async () => {
    const created = await authReq(token).post('/api/teacher/projects', body(TAG + 'legit'));
    expect(created.body.code).toBe(0);
    const id = created.body.data.id;
    const before = await prisma.project.findUnique({ where: { id }, select: { title: true, description: true } });

    const res = await authReq(token).put('/api/teacher/projects/' + id, body(TAG + 'hijacked', '../../etc'));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);

    const after = await prisma.project.findUnique({ where: { id }, select: { title: true, description: true } });
    expect(after).toEqual(before);
  });
});
