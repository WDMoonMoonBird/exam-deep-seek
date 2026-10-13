/**
 * r3-d8-nonzip-upload.test.js —— R3-D8（t16 / O-C4-1）修复验证：
 *   非 zip / 损坏压缩包提交 ⇒ **400 +「压缩包内容非法」**（不再 500，不泄漏 adm-zip 内部文案），
 *   且保持既有语义：整包拒收、回滚版本目录（磁盘无残留）、不消耗提交次数（无 submission 行）。
 *
 * 数据自建自清（r3d8_ 前缀）。
 */
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import AdmZip from 'adm-zip';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';
import { submissionDir } from '../../src/utils/projectPaths.js';

const PREFIX = 'r3d8_';
const DAY = 86400000;
const now = () => Date.now();

let school, cls, teacher, stu, q, asg, tokStu;

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const post = (buffer, filename) => request()
  .post('/api/student/assignments/' + asg.id + '/project/' + q.id + '/submit')
  .set('Authorization', 'Bearer ' + tokStu)
  .attach('file', buffer, filename);

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const schools = await prisma.school.findMany({ where: { officialCode: '29601' }, select: { id: true } });
  const sids = schools.map((s) => s.id);
  const classes = await prisma.class.findMany({ where: { schoolId: { in: sids } }, select: { id: true } });
  const cids = classes.map((c) => c.id);
  const questions = await prisma.question.findMany({ where: { teacherId: { in: uids } }, select: { id: true } });
  const qids = questions.map((x) => x.id);
  const assignments = await prisma.assignment.findMany({ where: { teacherId: { in: uids } }, select: { id: true } });
  const aids = assignments.map((a) => a.id);
  await prisma.submission.deleteMany({ where: { OR: [{ questionId: { in: qids } }, { assignmentId: { in: aids } }] } });
  await prisma.assignmentQuestion.deleteMany({ where: { OR: [{ questionId: { in: qids } }, { assignmentId: { in: aids } }] } });
  await prisma.assignmentClass.deleteMany({ where: { OR: [{ assignmentId: { in: aids } }, { classId: { in: cids } }] } });
  await prisma.assignment.deleteMany({ where: { id: { in: aids } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: qids } } });
  await prisma.question.deleteMany({ where: { id: { in: qids } } });
  await prisma.studentClass.deleteMany({ where: { classId: { in: cids } } });
  await prisma.teacherClass.deleteMany({ where: { classId: { in: cids } } });
  await prisma.teacherSchool.deleteMany({ where: { schoolId: { in: sids } } });
  await prisma.class.deleteMany({ where: { id: { in: cids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
  await prisma.school.deleteMany({ where: { id: { in: sids } } });
}

beforeAll(async () => {
  await purge();
  school = await prisma.school.create({ data: { name: PREFIX + 'school', officialCode: '29601' } });
  cls = await prisma.class.create({ data: { name: PREFIX + 'class', schoolId: school.id } });
  teacher = await prisma.user.create({ data: { username: PREFIX + 'teacher', password: bcrypt.hashSync(PREFIX + 'teacher', 10), realName: 'D8教师', role: 'teacher' } });
  stu = await prisma.user.create({ data: { username: PREFIX + 'stu', password: bcrypt.hashSync(PREFIX + 'stu', 10), realName: 'D8学生', role: 'student' } });
  await prisma.teacherSchool.create({ data: { teacherId: teacher.id, schoolId: school.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: cls.id } });
  await prisma.studentClass.create({ data: { studentId: stu.id, classId: cls.id } });
  q = await prisma.question.create({ data: { teacherId: teacher.id, title: PREFIX + '实训题', maxScore: 100, difficulty: 'medium', type: 'project' } });
  asg = await prisma.assignment.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '作业',
      startTime: new Date(now() - DAY), endTime: new Date(now() + DAY),
      allowResubmit: true, maxAttempts: null, scorePolicy: 'best', answerVisibility: 'after_publish',
      assignmentQuestions: { create: [{ questionId: q.id, sortOrder: 1 }] },
      assignmentClasses: { create: [{ classId: cls.id }] },
    },
  });
  tokStu = await login(stu.username);
}, 60000);

afterAll(async () => {
  // 磁盘残留兜底（正常路径下控制器已回滚，不应存在）
  for (let v = 1; v <= 3; v += 1) {
    try { fs.rmSync(submissionDir(q.id, stu.id, v), { recursive: true, force: true }); } catch { /* ignore */ }
  }
  await purge();
}, 60000);

describe('R3-D8 O-C4-1：非 zip / 损坏压缩包提交', () => {
  it('纯文本伪装 .zip → 400 +「压缩包内容非法」，无 500、无 adm-zip 内部文案、无磁盘残留、无 submission 行', async () => {
    const res = await post(Buffer.from('definitely not a zip archive'), 'fake.zip');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '压缩包内容非法', data: null });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/END header|Invalid|unsupported|adm-zip|ENOENT/i);

    // 无磁盘残留：本次将写入的版本目录（version=1）已被回滚删除
    expect(fs.existsSync(submissionDir(q.id, stu.id, 1))).toBe(false);
    // 不消耗次数：没有任何 submission 行（attemptCount 无从增加）
    const row = await prisma.submission.findFirst({ where: { assignmentId: asg.id, studentId: stu.id, questionId: q.id } });
    expect(row).toBeNull();
  });

  it('截断的 zip（前 32 字节合法头）→ 同样 400 +「压缩包内容非法」且无残留', async () => {
    const zip = new AdmZip();
    zip.addFile('src/Main.java', Buffer.from('class Main {}'));
    const truncated = zip.toBuffer().subarray(0, 32);
    const res = await post(truncated, 'truncated.zip');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('压缩包内容非法');
    expect(fs.existsSync(submissionDir(q.id, stu.id, 1))).toBe(false);
    const row = await prisma.submission.findFirst({ where: { assignmentId: asg.id, studentId: stu.id, questionId: q.id } });
    expect(row).toBeNull();
  });

  it('非 .zip 扩展名 → 仍由上传过滤器拦下（400「仅支持 zip 文件」，既有语义不变）', async () => {
    const res = await post(Buffer.from('hello'), 'notes.txt');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '仅支持 zip 文件', data: null });
    expect(fs.existsSync(submissionDir(q.id, stu.id, 1))).toBe(false);
  });
});
