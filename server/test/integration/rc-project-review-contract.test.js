/**
 * rc-project-review-contract.test.js — reviewController 拆分（step 8）B0 契约护航：
 * 实训题教师端两条路由的 **200 成功路径** 与越权守卫的**逐字**文案。
 *
 * 背景（docs/split/reviewController-plan.md §5.2）：
 *   本文件的两条路由此前只有 t4:303-317 的 **403 反例**，200 路径 **零覆盖**：
 *     - Z3 = getProjectReview(:782-841) 的整条 200 路径（parseProjectAnswer → submissionDir →
 *            readProjectTree → readStandardTree → aiFeedback JSON 解析 + catch 降级 → 响应装配）
 *     - Z2 = readStandardTree(:765-780) 的两个 fs.existsSync 分支 + 兜底空树
 *     - Z4 = reviewProjectSubmission(:843-888) 的整条 200 路径（分值钳制 + R3 评语不回退 AI）
 *   拆分前先把它们钉住；否则拆完没有任何回归保护。
 *
 * 断言口径：状态码 + 响应体形状（键集合逐名对拍 + 中文文案逐字）+ 关键 DB 终态。
 * 夹具自建自清（rcb0p_ 前缀，独立学校院校代码 29411/29412），不依赖 setup seed。
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';
import { STANDARDS_ROOT, SUBMISSIONS_ROOT, standardDir, submissionDir, ROOT } from '../../src/utils/projectPaths.js';

const PREFIX = 'rcb0p_';
const CODE_A = '29411';
const CODE_B = '29412';

/** 学生提交的源文件（单文件保证 contents 断言确定） */
const STUDENT_FILE = 'src/app.js';
const STUDENT_CODE = 'function greet(name) {\n  return "hi " + name;\n}\n';
/** 标准包文件 */
const STANDARD_FILE = 'standard/spec.md';
const STANDARD_TEXT = '# 标准工程包\n评分点：greet 函数\n';
/** 历史 uploads/ 目录下的标准包文件 */
const LEGACY_FILE = 'legacy-spec.md';
const LEGACY_TEXT = '# 历史标准包（attachmentUrl 兼容路径）\n';

let schoolA, schoolB, classA, classB;
let teacher, teacherOther, teacherHidden;
let stuA, stuA2, stuB;
let qProj, qCode, qLegacy, qNoStd;
let asgProj, asgLegacy, asgNoStd, asgCode, asgOther, asgHidden;
let tokenA, tokenOther;
let pendingDir, legacyDir;

/** 按前缀幂等清理本套件夹具（含上次崩溃残留） */
async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  const classes = await prisma.class.findMany({
    where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }] },
    select: { id: true },
  });
  const classIds = classes.map(c => c.id);
  const questions = await prisma.question.findMany({
    where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] },
    select: { id: true },
  });
  const questionIds = questions.map(q => q.id);
  const assignments = await prisma.assignment.findMany({
    where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] },
    select: { id: true },
  });
  const assignmentIds = assignments.map(a => a.id);

  await prisma.submission.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] },
  });
  await prisma.assignmentClass.deleteMany({ where: { OR: [{ assignmentId: { in: assignmentIds } }, { classId: { in: classIds } }] } });
  await prisma.assignmentQuestion.deleteMany({ where: { OR: [{ assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] } });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  await prisma.teacherClass.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.studentClass.deleteMany({ where: { OR: [{ studentId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

const mkUser = (username, realName, role) => prisma.user.create({
  data: { username, password: bcrypt.hashSync(username, 10), realName, role },
});

/** 直接落盘学生提交目录（不经过学生上传端点，保证 version/内容可控） */
function writeFiles(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf-8');
  }
}

/** 实训题提交信封（与学生端口径一致：answer 为 JSON 字符串） */
const envelope = (currentVersion) => JSON.stringify({
  kind: 'project',
  currentVersion,
  history: [],
  grading: { state: 'done', version: currentVersion, attempts: 1, error: null, prevStatus: null, ruleVersionHash: null },
});

async function seed() {
  await purge();

  schoolA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  schoolB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: CODE_B } });
  classA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: schoolA.id } });
  classB = await prisma.class.create({ data: { name: PREFIX + 'class_b', schoolId: schoolB.id } });

  teacher = await mkUser(PREFIX + 'teacher', 'B0实训教师', 'teacher');
  teacherOther = await mkUser(PREFIX + 'teacher_other', 'B0他师', 'teacher');
  teacherHidden = await mkUser(PREFIX + 'teacher_hidden', 'B0同校不可见师', 'teacher');
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: teacher.id, schoolId: schoolA.id },
    { teacherId: teacherOther.id, schoolId: schoolA.id },
    { teacherId: teacherHidden.id, schoolId: schoolA.id },
  ] });
  // teacher 仅可见 classA；classB 对 teacher 不可见。
  // teacherOther 刻意也可见 classA —— 这样 T-A5「作业他师 403」命中的是 :802 的作业归属判定（角色守卫），
  // 而不是被更靠后的可见班级判定兜住（两者文案不同：'无权操作' vs '无权访问该提交'）。
  await prisma.teacherClass.createMany({ data: [
    { teacherId: teacher.id, classId: classA.id },
    { teacherId: teacherOther.id, classId: classA.id },
  ] });

  stuA = await mkUser(PREFIX + 'stu_a', 'B0生A', 'student');
  stuA2 = await mkUser(PREFIX + 'stu_a2', 'B0生A2', 'student');
  stuB = await mkUser(PREFIX + 'stu_b', 'B0生B', 'student');
  await prisma.studentClass.createMany({ data: [
    { studentId: stuA.id, classId: classA.id },
    { studentId: stuA2.id, classId: classA.id },
    { studentId: stuB.id, classId: classB.id },
  ] });

  const mkQ = (teacherId, title, type, opts = {}) => prisma.question.create({
    data: {
      teacherId, title, maxScore: opts.maxScore ?? 100, difficulty: 'easy', type,
      material: PREFIX + '材料', scoringRubric: PREFIX + '评分标准',
      attachmentUrl: opts.attachmentUrl ?? null,
    },
  });
  qProj = await mkQ(teacher.id, PREFIX + '题A-有标准包', 'project');
  qNoStd = await mkQ(teacher.id, PREFIX + '题A-无标准包', 'project');
  qLegacy = await mkQ(teacher.id, PREFIX + '题A-历史包', 'project', { attachmentUrl: 'legacy/' + PREFIX + 'pkg' });
  qCode = await mkQ(teacher.id, PREFIX + '题A-编程题', 'code');

  const mkAsg = (teacherId, title, classIds, questionIds) => prisma.assignment.create({
    data: {
      teacherId, title, mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
  });
  asgProj = await mkAsg(teacher.id, PREFIX + '作业A-有标准包', [classA.id], [qProj.id]);
  asgNoStd = await mkAsg(teacher.id, PREFIX + '作业A-无标准包', [classA.id], [qNoStd.id]);
  asgLegacy = await mkAsg(teacher.id, PREFIX + '作业A-历史包', [classA.id], [qLegacy.id]);
  asgCode = await mkAsg(teacher.id, PREFIX + '作业A-编程题', [classA.id], [qCode.id]);
  asgOther = await mkAsg(teacherOther.id, PREFIX + '作业B-他师', [classA.id], [qProj.id]);
  // 作业归 teacher，但学生 sb 在 teacher 不可见的 classB（打 :805 / :867 的「无权访问该提交」）
  asgHidden = await mkAsg(teacher.id, PREFIX + '作业A-不可见生', [classB.id], [qProj.id]);

  const mkSub = (assignmentId, studentId, questionId, data) => prisma.submission.create({
    data: {
      assignmentId, studentId, questionId, subQuestionId: null,
      answer: data.answer ?? null, status: data.status ?? 'ai_graded',
      aiScore: data.aiScore ?? null, aiFeedback: data.aiFeedback ?? null,
      finalScore: data.finalScore ?? null, teacherFeedback: data.teacherFeedback ?? null,
      attemptCount: data.attemptCount ?? 1,
      submittedAt: data.submittedAt ?? new Date('2026-02-01T10:00:00Z'),
    },
  });

  // ===== T-A 200 三态 =====
  // ① 有标准包（新目录）+ 合法 JSON aiFeedback + version=2（学生文件落盘）
  const subStd = await mkSub(asgProj.id, stuA.id, qProj.id, {
    status: 'ai_graded', aiScore: 88, answer: envelope(2),
    aiFeedback: JSON.stringify({ totalScore: 88, overallComment: '结构清晰', breakdown: [] }),
  });
  writeFiles(submissionDir(qProj.id, stuA.id, 2), { [STUDENT_FILE]: STUDENT_CODE });
  writeFiles(standardDir(qProj.id), { [STANDARD_FILE]: STANDARD_TEXT });

  // ② 无标准包 + 非法 JSON aiFeedback（打 :817-821 的 catch 降级）
  const subNoStd = await mkSub(asgNoStd.id, stuA.id, qNoStd.id, {
    status: 'submitted', answer: envelope(1), aiFeedback: '这不是 JSON 的原始评语串',
  });

  // ③ 历史 attachmentUrl 目录（标准包不在 project-questions 下，而在 uploads/<attachmentUrl>）
  const subLegacy = await mkSub(asgLegacy.id, stuA.id, qLegacy.id, {
    status: 'ai_graded', aiScore: 70, answer: envelope(1), aiFeedback: null,
  });
  legacyDir = path.join(ROOT, 'uploads', 'legacy', PREFIX + 'pkg');
  writeFiles(legacyDir, { [LEGACY_FILE]: LEGACY_TEXT });

  // ④ version=0（falsy）→ studentFiles 空树（用 classA 内的 stuA2，避免被可见班级守卫 403 短路）
  const subV0 = await mkSub(asgProj.id, stuA2.id, qProj.id, {
    status: 'submitted', answer: envelope(0), aiFeedback: '',
  });

  // ===== 守卫反例夹具 =====
  const subCode = await mkSub(asgCode.id, stuA.id, qCode.id, { status: 'submitted', answer: 'print(1)' });
  const subOther = await mkSub(asgOther.id, stuA.id, qProj.id, { status: 'submitted', answer: envelope(1) });
  const subHidden = await mkSub(asgHidden.id, stuB.id, qProj.id, { status: 'submitted', answer: envelope(1) });

  // ===== T-B 200 夹具（各自独立行，互不干扰）=====
  const mkProjSub = (assignmentId, studentId, questionId, data) => mkSub(assignmentId, studentId, questionId, {
    status: 'submitted', answer: envelope(1), ...data,
  });
  const subB1 = await mkProjSub(asgProj.id, stuA.id, qProj.id, { aiScore: 61, aiFeedback: 'AI原始评语_绝密', finalScore: null, teacherFeedback: null });
  const subB2 = await mkProjSub(asgProj.id, stuA.id, qProj.id, { aiFeedback: 'AI2_绝密' });
  const subB3 = await mkProjSub(asgProj.id, stuA.id, qProj.id, { aiFeedback: 'AI3_绝密', finalScore: 42 });
  const subB4 = await mkProjSub(asgProj.id, stuA.id, qProj.id, { aiFeedback: 'AI4_绝密', finalScore: 33, teacherFeedback: '既有评语' });
  const subB5 = await mkProjSub(asgProj.id, stuA.id, qProj.id, { aiFeedback: 'AI5_绝密' });
  global.__rcb0p = {
    subStd: subStd.id, subNoStd: subNoStd.id, subLegacy: subLegacy.id, subV0: subV0.id,
    subCode: subCode.id, subOther: subOther.id, subHidden: subHidden.id,
    subB1: subB1.id, subB2: subB2.id, subB3: subB3.id, subB4: subB4.id, subB5: subB5.id,
    qProj: qProj.id, asgLegacy: asgLegacy.id, asgOther: asgOther.id, stuA: stuA.id,
  };
  pendingDir = path.join(SUBMISSIONS_ROOT, String(qProj.id));
}

const ID = () => global.__rcb0p;

/** 展平 readProjectTree 的树形节点，只取文件节点（{path,language,size}），便于逐值断言 */
function collectFiles(nodes, out = []) {
  for (const n of nodes || []) {
    if (n.type === 'file') out.push({ path: n.path, language: n.language, size: n.size });
    else collectFiles(n.children, out);
  }
  return out;
}

const get = (token, url) => request().get(url).set('Authorization', 'Bearer ' + token);
const put = (token, url, body) => request().put(url).set('Authorization', 'Bearer ' + token).send(body);

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const DB = (id) => prisma.submission.findUnique({ where: { id } });

describe('reviewController B0 契约 · 实训题教师端 200 路径（Z2/Z3/Z4）', () => {
  beforeAll(async () => {
    await seed();
    tokenA = await login(PREFIX + 'teacher');
    tokenOther = await login(PREFIX + 'teacher_other');
  }, 60000);

  afterAll(async () => {
    await purge();
    // 只清理本套件创建过的目录：先确认目标位于对应 uploads 根之内
    for (const [root, dir] of [
      [SUBMISSIONS_ROOT, pendingDir],
      [STANDARDS_ROOT, path.join(STANDARDS_ROOT, String(ID()?.qProj ?? 0))],
    ]) {
      if (dir && dir.startsWith(root + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
    }
    if (legacyDir && legacyDir.startsWith(path.join(ROOT, 'uploads') + path.sep)) {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
    delete global.__rcb0p;
  }, 60000);

  // ================= T-A：GET /api/teacher/submissions/:id/project =================

  it('T-A1: 有标准包（新目录）→ 200，键集合逐名对拍 + 标准包/学生文件/version/aiResult 逐项断言', async () => {
    const id = ID().subStd;
    const res = await get(tokenA, '/api/teacher/submissions/' + id + '/project');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('ok');
    // 键集合逐名对拍（多一个少一个都算契约漂移）
    expect(Object.keys(res.body).sort()).toEqual(['code', 'data', 'message']);
    expect(Object.keys(res.body.data).sort()).toEqual([
      'aiResult', 'assignment', 'question', 'standardFiles', 'student', 'studentFiles', 'submission', 'version',
    ]);

    // ③ 有标准包 → tree 非空 + contents 含夹具文件且逐字相等
    expect(res.body.data.standardFiles.tree.length).toBeGreaterThan(0);
    expect(res.body.data.standardFiles.contents[STANDARD_FILE]).toBe(STANDARD_TEXT);
    // ④ 学生文件逐字相等
    expect(res.body.data.studentFiles.tree.length).toBeGreaterThan(0);
    expect(res.body.data.studentFiles.contents[STUDENT_FILE]).toBe(STUDENT_CODE);
    // 树形节点：单文件 src/app.js 落在目录节点 src 下（path 为相对根路径）
    expect(collectFiles(res.body.data.studentFiles.tree)).toEqual([{ path: STUDENT_FILE, language: 'javascript', size: Buffer.byteLength(STUDENT_CODE) }]);
    expect(collectFiles(res.body.data.standardFiles.tree)).toEqual([{ path: STANDARD_FILE, language: 'markdown', size: Buffer.byteLength(STANDARD_TEXT) }]);
    // ⑤ version === 信封 currentVersion
    expect(res.body.data.version).toBe(2);
    // ⑥ aiFeedback 为合法 JSON → 解析为对象
    expect(res.body.data.aiResult).toEqual({ totalScore: 88, overallComment: '结构清晰', breakdown: [] });
    expect(res.body.data.submission.version).toBe(2);
    expect(res.body.data.submission.aiScore).toBe(88);
    expect(res.body.data.submission.status).toBe('ai_graded');
    expect(res.body.data.question.id).toBe(ID().qProj);
    expect(res.body.data.question.type).toBe('project');
    expect(res.body.data.student.id).toBe(ID().stuA);
    expect(res.body.data.assignment.teacherId).toBeDefined();
  });

  it('T-A2: 无标准包 → 200，standardFiles 为空树 + aiFeedback 非法 JSON 降级为 {overallComment}', async () => {
    const res = await get(tokenA, '/api/teacher/submissions/' + ID().subNoStd + '/project');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    // 无标准包 → readStandardTree 兜底 {tree:[],contents:{}}
    expect(res.body.data.standardFiles).toEqual({ tree: [], contents: {} });
    // 非法 JSON aiFeedback → catch 降级（原串进 overallComment）
    expect(res.body.data.aiResult).toEqual({ overallComment: '这不是 JSON 的原始评语串' });
    expect(res.body.data.version).toBe(1);
  });

  it('T-A3: 历史 attachmentUrl 目录 → 200，标准包 tree 非空（readStandardTree 的第二分支）', async () => {
    const res = await get(tokenA, '/api/teacher/submissions/' + ID().subLegacy + '/project');
    expect(res.status).toBe(200);
    expect(res.body.data.standardFiles.tree.length).toBeGreaterThan(0);
    expect(res.body.data.standardFiles.contents[LEGACY_FILE]).toBe(LEGACY_TEXT);
    // 学生 version=1 但目录未落盘 → 空树（readProjectTree 的「目录不存在」兜底）
    expect(res.body.data.studentFiles).toEqual({ tree: [], contents: {} });
    // aiFeedback 为空 → aiResult 为 null（不进 JSON.parse 分支）
    expect(res.body.data.aiResult).toBeNull();
  });

  it('T-A4: version=0 → 200 且 studentFiles 为空树（version falsy 分支）', async () => {
    const res = await get(tokenA, '/api/teacher/submissions/' + ID().subV0 + '/project');
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(0);
    expect(res.body.data.studentFiles).toEqual({ tree: [], contents: {} });
    expect(res.body.data.aiResult).toBeNull();
  });

  // ================= 守卫：逐字文案 + 无内容泄漏 =================

  it('T-A5: 守卫三态逐字 —— 不存在 404/1004「提交不存在」、非实训题 400/1001「非实训题提交」、作业他师 403/1003「无权操作」', async () => {
    const nf = await get(tokenA, '/api/teacher/submissions/999999999/project');
    expect(nf.status).toBe(404);
    expect(nf.body).toEqual({ code: 1004, message: '提交不存在', data: null });

    const notProj = await get(tokenA, '/api/teacher/submissions/' + ID().subCode + '/project');
    expect(notProj.status).toBe(400);
    expect(notProj.body).toEqual({ code: 1001, message: '非实训题提交', data: null });

    const otherOwner = await get(tokenOther, '/api/teacher/submissions/' + ID().subStd + '/project');
    expect(otherOwner.status).toBe(403);
    expect(otherOwner.body).toEqual({ code: 1003, message: '无权操作', data: null });
  });

  it('T-A6: 作业归本教师但学生不在可见班级 → 403/1003「无权访问该提交」且响应体零泄漏', async () => {
    const res = await get(tokenA, '/api/teacher/submissions/' + ID().subHidden + '/project');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 1003, message: '无权访问该提交', data: null });
    const text = JSON.stringify(res.body);
    for (const k of ['studentFiles', 'standardFiles', 'aiResult', 'material', 'scoringRubric']) {
      expect(text).not.toContain(k);
    }
  });

  // ================= T-B：PUT /api/teacher/submissions/:id/project/review =================

  it('T-B1: 200 正常 —— finalScore=60 + teacherFeedback 显式传入 → 响应三键 + DB 终态', async () => {
    const id = ID().subB1;
    const res = await put(tokenA, '/api/teacher/submissions/' + id + '/project/review', { finalScore: 60, teacherFeedback: 'T' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('审核成功');
    expect(Object.keys(res.body).sort()).toEqual(['code', 'data', 'message']);
    expect(Object.keys(res.body.data).sort()).toEqual(['finalScore', 'id', 'status', 'teacherFeedback']);
    expect(res.body.data).toEqual({ id, status: 'reviewed', finalScore: 60, teacherFeedback: 'T' });

    const db = await DB(id);
    expect(db.status).toBe('reviewed');
    expect(db.finalScore).toBe(60);
    expect(db.teacherFeedback).toBe('T');
    expect(db.reviewedAt).not.toBeNull();
  });

  it('T-B2: 分值钳制 —— -5 → 0；10**9 → question.maxScore（100）', async () => {
    const lo = await put(tokenA, '/api/teacher/submissions/' + ID().subB2 + '/project/review', { finalScore: -5, teacherFeedback: 'lo' });
    expect(lo.status).toBe(200);
    expect(lo.body.data.finalScore).toBe(0);
    expect((await DB(ID().subB2)).finalScore).toBe(0);

    const hi = await put(tokenA, '/api/teacher/submissions/' + ID().subB3 + '/project/review', { finalScore: 10 ** 9, teacherFeedback: 'hi' });
    expect(hi.status).toBe(200);
    expect(hi.body.data.finalScore).toBe(100);
    expect((await DB(ID().subB3)).finalScore).toBe(100);
  });

  it('T-B3: 不传 finalScore → 保持原值（undefined 分支不下发 finalScore）', async () => {
    const id = ID().subB4;   // 既有 finalScore=33
    const res = await put(tokenA, '/api/teacher/submissions/' + id + '/project/review', { teacherFeedback: '不动分' });
    expect(res.status).toBe(200);
    expect(res.body.data.finalScore).toBe(33);
    expect((await DB(id)).finalScore).toBe(33);
    expect((await DB(id)).teacherFeedback).toBe('不动分');
  });

  it('T-B4: R3 —— teacherFeedback 不传且库中为 null → \'\'，且绝不回退 AI 评语', async () => {
    const id = ID().subB5;   // teacherFeedback=null，aiFeedback='AI5_绝密'
    const res = await put(tokenA, '/api/teacher/submissions/' + id + '/project/review', { finalScore: 55 });
    expect(res.status).toBe(200);
    expect(res.body.data.teacherFeedback).toBe('');
    expect(res.body.data.teacherFeedback).not.toContain('AI5');
    const db = await DB(id);
    expect(db.teacherFeedback).toBe('');
    expect(db.aiFeedback).toBe('AI5_绝密');   // AI 评语本身不被改写
  });

  it('T-B5: teacherFeedback 显式空串 → \'\'（String(x||\'\') 分支）', async () => {
    const id = ID().subB4;   // 上一例写入 '不动分'
    const res = await put(tokenA, '/api/teacher/submissions/' + id + '/project/review', { teacherFeedback: '' });
    expect(res.status).toBe(200);
    expect(res.body.data.teacherFeedback).toBe('');
    expect((await DB(id)).teacherFeedback).toBe('');
  });

  it('T-B6: 守卫逐字 + 零写入 —— 他师 403「无权操作」、不可见生 403「无权访问该提交」、非实训题 400、不存在 404', async () => {
    const id = ID().subB5;
    const before = await DB(id);

    const otherOwner = await put(tokenOther, '/api/teacher/submissions/' + id + '/project/review', { finalScore: 1, teacherFeedback: 'HACK' });
    expect(otherOwner.status).toBe(403);
    expect(otherOwner.body).toEqual({ code: 1003, message: '无权操作', data: null });

    const hidden = await put(tokenA, '/api/teacher/submissions/' + ID().subHidden + '/project/review', { finalScore: 1, teacherFeedback: 'HACK' });
    expect(hidden.status).toBe(403);
    expect(hidden.body).toEqual({ code: 1003, message: '无权访问该提交', data: null });

    const notProj = await put(tokenA, '/api/teacher/submissions/' + ID().subCode + '/project/review', { finalScore: 1 });
    expect(notProj.status).toBe(400);
    expect(notProj.body).toEqual({ code: 1001, message: '非实训题提交', data: null });

    const nf = await put(tokenA, '/api/teacher/submissions/999999999/project/review', { finalScore: 1 });
    expect(nf.status).toBe(404);
    expect(nf.body).toEqual({ code: 1004, message: '提交不存在', data: null });

    const after = await DB(id);
    expect(after.status).toBe(before.status);
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.teacherFeedback).toBe(before.teacherFeedback);
  });
});
