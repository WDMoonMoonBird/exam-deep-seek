/**
 * tc-b0 · getProjectFiles 契约测试（step 9 · B0，打靶 plan §5.3 Z3）
 *
 * 目标：钉住 GET /api/teacher/questions/:id/project-files（源 :124-157）四条分支：
 *   :130 404 题目不存在（不存在 / 他人题 / 非 project 题 / 软删题）
 *   :131 attachmentUrl 为空 → 200 {tree:[]}（**只有 tree 键**）
 *   :134 目录不存在     → 200 {tree:[]}
 *   :152 有真实标准包目录 → 200 {tree, contents}（含 buildTree/flattenTree 与 fs.readFileSync 真读）
 *
 * 断言口径 = 状态码 + 响应体形状（含 code 与中文文案逐字）+ 磁盘夹具逐字回读。
 * 夹具自建自清（tcc_ 前缀，独立学校院校代码 29621/29622）：标准包目录建在仓库既有
 * server/uploads/project-questions/{id}/standard 下，afterAll 逐目录 rmSync（删除前断言路径在根之内）。
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { STANDARDS_ROOT } from '../../src/utils/projectPaths.js';
import { request } from './helpers.js';

const PREFIX = 'tcc_';
const CODE_A = '29621';
const CODE_B = '29622';
const SPEC_CONTENT = PREFIX + '标准包说明（逐字断言）\n第二行';
const APP_CONTENT = 'console.log("' + PREFIX + 'app");\n';

let sA, sB, tA, tB;
let qNoAttachment, qOther, qCodeType, qWithDir, qMissingDir, tokenA;
const createdDirs = [];

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  const questions = await prisma.question.findMany({
    where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] },
    select: { id: true },
  });
  const questionIds = questions.map(q => q.id);

  await prisma.submission.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.assignmentQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

/** 只删本套件自建的题目目录（删前断言路径严格位于 STANDARDS_ROOT 内） */
function removeDirs() {
  for (const dir of createdDirs) {
    const resolved = path.resolve(dir);
    if (resolved !== STANDARDS_ROOT && !resolved.startsWith(STANDARDS_ROOT + path.sep)) {
      throw new Error('拒绝删除 STANDARDS_ROOT 之外的目录: ' + resolved);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  createdDirs.length = 0;
}

const mkTeacher = (name, realName) => prisma.user.create({
  data: { username: PREFIX + name, password: bcrypt.hashSync(PREFIX + name, 10), realName, role: 'teacher' },
});
const mkQuestion = (teacherId, title, type, extra = {}) => prisma.question.create({
  data: { teacherId, title, type, difficulty: 'easy', maxScore: 100, ...extra },
});

async function seed() {
  await purge();
  sA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  sB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: CODE_B } });
  tA = await mkTeacher('teacher_a', 'tcc教师A');
  tB = await mkTeacher('teacher_b', 'tcc教师B');
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: tA.id, schoolId: sA.id },
    { teacherId: tB.id, schoolId: sB.id },
  ] });

  qNoAttachment = await mkQuestion(tA.id, PREFIX + 'q_no_attachment', 'project');
  qOther = await mkQuestion(tB.id, PREFIX + 'q_other', 'project');
  qCodeType = await mkQuestion(tA.id, PREFIX + 'q_code_type', 'code');
  qWithDir = await mkQuestion(tA.id, PREFIX + 'q_with_dir', 'project');
  qMissingDir = await mkQuestion(tA.id, PREFIX + 'q_missing_dir', 'project');

  // 真实标准包目录：uploads/project-questions/{id}/standard（与 createQuestion 的 attachmentUrl 口径一致）
  await prisma.question.update({ where: { id: qWithDir.id }, data: { attachmentUrl: `project-questions/${qWithDir.id}/standard` } });
  const dir = path.join(STANDARDS_ROOT, String(qWithDir.id), 'standard');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'spec.md'), SPEC_CONTENT, 'utf-8');
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), APP_CONTENT, 'utf-8');
  createdDirs.push(path.join(STANDARDS_ROOT, String(qWithDir.id)));

  // attachmentUrl 有值但目录不存在
  await prisma.question.update({ where: { id: qMissingDir.id }, data: { attachmentUrl: `project-questions/${qMissingDir.id}/standard` } });

  tokenA = await login('teacher_a');
}

async function login(name) {
  const res = await request().post('/api/auth/login').send({ username: PREFIX + name, password: PREFIX + name });
  if (res.body.code !== 0) throw new Error('登录失败 ' + name + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const getFiles = (id) => request().get('/api/teacher/questions/' + id + '/project-files')
  .set('Authorization', 'Bearer ' + tokenA);

beforeAll(async () => { await seed(); }, 60000);
afterAll(async () => { removeDirs(); await purge(); }, 60000);

describe('T-C · GET /api/teacher/questions/:id/project-files（Z3 契约）', () => {
  it('T-C1 不存在 / 他人题 / 非 project 题 → 均为 404 题目不存在', async () => {
    for (const id of [999999999, qOther.id, qCodeType.id]) {
      const res = await getFiles(id);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: '题目不存在', data: null });
    }
    // 他人题目不得泄漏存在性：与非 project 题、不存在题同码同文案
  });

  it('T-C2 project 题且 attachmentUrl 为空 → 200 只有 tree 键的 {tree:[]}（:131 早退形状）', async () => {
    const res = await getFiles(qNoAttachment.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0, message: 'ok', data: { tree: [] } });
    expect(Object.keys(res.body)).toEqual(['code', 'message', 'data']);
    // 该分支只透出 tree（没有 contents）—— 早退形状是契约的一部分
    expect(Object.keys(res.body.data)).toEqual(['tree']);
  });

  it('T-C3 project 题 + 真实标准包目录 → 200 {tree,contents}，磁盘内容逐字回读', async () => {
    const res = await getFiles(qWithDir.id);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data)).toEqual(['tree', 'contents']);

    // 树：目录在前、文件在后，各自按名称排序 ⇒ [src/, spec.md]
    expect(res.body.data.tree).toEqual([
      {
        name: 'src', type: 'directory', path: 'src',
        children: [{
          name: 'app.js', type: 'file', path: 'src/app.js',
          language: 'javascript', size: Buffer.byteLength(APP_CONTENT),
        }],
      },
      {
        name: 'spec.md', type: 'file', path: 'spec.md',
        language: 'markdown', size: Buffer.byteLength(SPEC_CONTENT),
      },
    ]);
    expect(res.body.data.contents).toEqual({ 'src/app.js': APP_CONTENT, 'spec.md': SPEC_CONTENT });
  });

  it('T-C4 有 attachmentUrl 但目录不存在 → 200 {tree:[]}（:134 分支，与 C2 同形但成因不同）', async () => {
    const res = await getFiles(qMissingDir.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0, message: 'ok', data: { tree: [] } });
    expect(Object.keys(res.body.data)).toEqual(['tree']);
  });
});
