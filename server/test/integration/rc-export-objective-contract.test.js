/**
 * rc-export-objective-contract.test.js — reviewController 拆分（step 8）B0 契约护航：
 * GET /api/teacher/export-review 的**客观题判分路径**（= 嵌套函数 scoreItem 的 4 个分支）。
 *
 * 背景（docs/split/reviewController-plan.md §5.2-Z1）：
 *   scoreItem(:680-703) 24 行、4 个分支（choice / multi_choice / judge / fill）**全部零执行**。
 *   它只在 exportReviewData 的「客观题小问」路径（:721-736，条件 h.itemKey != null）被调用；
 *   而 itemKey 非 null 仅当 subQuestion.type === 'objective' 且 objectiveItems 非空（:654-666）。
 *   全仓既有测试夹具从未给 subQuestion 写入真实的 objectiveItems/答案 JSON
 *   ⇒ 既有 export-review 断言走的都是「主观题整题分」分支（:710-720）。
 *   本套件是唯一让 scoreItem 真跑起来的手段。
 *
 * 断言口径：状态码 + 响应体形状（无 message 的既有契约 + headerCells/cellScores 逐值）+ 关键 DB 终态。
 * 夹具自建自清（rcb0e_ 前缀，独立学校院校代码 29421），不依赖 setup seed。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'rcb0e_';
const CODE = '29421';

/** 每个客观小问的满分（4 小问 × 25 = 100 = question.maxScore） */
const ITEM_SCORE = 25;
/** 客观题小问定义（key 为数字，与 scoreItem 的 x.key === item.itemKey 比较口径一致） */
const ITEMS = [
  { key: 0, type: 'choice', stem: '<p>第1问：选哪个？</p>', score: ITEM_SCORE, answer: 'B', options: ['A', 'B', 'C', 'D'] },
  { key: 1, type: 'multi_choice', stem: '第2问：多选（无序）', score: ITEM_SCORE, answer: ['A', 'B'], options: ['A', 'B', 'C', 'D'] },
  { key: 2, type: 'judge', stem: '第3问：判断', score: ITEM_SCORE, answer: true },
  { key: 3, type: 'fill', stem: '第4问：填空（逗号分空 + 大小写不敏感）', score: ITEM_SCORE, answer: 'Foo, BAR' },
];

/** 学生作答 → Submission.answer 的 JSON 形状（与 scoreItem 的解析形状一致） */
const ans = (pairs) => JSON.stringify(pairs.map(([key, answer]) => ({ key, answer })));

/** 参考答案标签（HTML 剥离 + slice(0,60)） */
const LABELS = [
  '第1问：选哪个？',
  '第2问：多选（无序）',
  '第3问：判断',
  '第4问：填空（逗号分空 + 大小写不敏感）',
];

let school, classA, teacher, teacherHidden;
let stuOk, stuBad, stuPartial, stuBlank, stuNone;
let question, assignment, questionProj, assignmentProj;
let tokenOk, tokenHidden;
const subs = {};

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

async function seed() {
  await purge();

  school = await prisma.school.create({ data: { name: PREFIX + 'school', officialCode: CODE } });
  classA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: school.id } });

  teacher = await mkUser(PREFIX + 'teacher', 'B0导出教师', 'teacher');
  teacherHidden = await mkUser(PREFIX + 'teacher_hidden', 'B0导出他师', 'teacher');
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: teacher.id, schoolId: school.id },
    { teacherId: teacherHidden.id, schoolId: school.id },
  ] });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: classA.id } });

  stuOk = await mkUser(PREFIX + 'stu_ok', 'B0全对', 'student');
  stuBad = await mkUser(PREFIX + 'stu_bad', 'B0全错', 'student');
  stuPartial = await mkUser(PREFIX + 'stu_partial', 'B0多选少选', 'student');
  stuBlank = await mkUser(PREFIX + 'stu_blank', 'B0空答', 'student');
  stuNone = await mkUser(PREFIX + 'stu_none', 'B0未交', 'student');
  // username 前缀用于排序断言：ok < partial < bad < blank < none（按 username 字典序）
  await prisma.studentClass.createMany({ data: [stuOk, stuBad, stuPartial, stuBlank, stuNone].map(s => ({ studentId: s.id, classId: classA.id })) });

  question = await prisma.question.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '客观题', maxScore: 100, difficulty: 'easy', type: 'code',
      material: PREFIX + '材料', scoringRubric: PREFIX + '标准',
      subQuestions: {
        create: [{
          sortOrder: 1, title: PREFIX + '客观小题', type: 'objective', score: 100,
          content: '<p>客观题</p>', referenceAnswer: '', language: 'plaintext',
          objectiveItems: ITEMS,
        }],
      },
    },
    include: { subQuestions: true },
  });
  const sq = question.subQuestions[0];

  // 混入一道「主观题小题」，确保头表同时含 itemKey=null 与 itemKey!=null 两类（契约形状完整性）
  const qSubjective = await prisma.question.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '主观题', maxScore: 100, difficulty: 'easy', type: 'code',
      subQuestions: { create: [{ sortOrder: 10, title: PREFIX + '主观小题', type: 'code', score: 40, content: '<p>主观</p>', referenceAnswer: 'x', language: 'python' }] },
    },
    include: { subQuestions: true },
  });

  questionProj = await prisma.question.create({
    data: { teacherId: teacher.id, title: PREFIX + '实训题', maxScore: 100, difficulty: 'easy', type: 'project' },
  });

  const mkAsg = (title, questionIds) => prisma.assignment.create({
    data: {
      teacherId: teacher.id, title, mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: { classId: classA.id } },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
  });
  assignment = await mkAsg(PREFIX + '作业', [question.id, qSubjective.id]);
  assignmentProj = await mkAsg(PREFIX + '作业-proj', [questionProj.id]);

  const mkSub = (studentId, subQuestionId, answer, status) => prisma.submission.create({
    data: {
      assignmentId: assignment.id, studentId, questionId: question.id, subQuestionId,
      answer, status, submittedAt: new Date('2026-02-01T10:00:00Z'),
      aiScore: status === 'ai_graded' ? 90 : null, finalScore: null,
    },
  });

  // 全对：choice 全等 / multi 无序集合相等（'B,A' vs ['A','B']）/ judge 全等 / fill 逗号分空 + 逐空小写
  subs.ok = (await mkSub(stuOk.id, sq.id, ans([[0, 'B'], [1, 'B,A'], [2, 'true'], [3, 'foo,bar']]), 'ai_graded')).id;
  // 全错：无一项命中 → 0
  subs.bad = (await mkSub(stuBad.id, sq.id, ans([[0, 'A'], [1, 'A,C'], [2, 'false'], [3, 'zzz,zzz']]), 'submitted')).id;
  // 多选少选 → 该问 0，其余三问满分
  subs.partial = (await mkSub(stuPartial.id, sq.id, ans([[0, 'B'], [1, 'A'], [2, 'true'], [3, 'Foo,BAR']]), 'submitted')).id;
  // 已交但客观小问全空 → 四问均 0，submitted=true ⇒ 累计为 0 而不是 null
  subs.blank = (await mkSub(stuBlank.id, sq.id, ans([[0, ''], [1, ''], [2, ''], [3, '']]), 'submitted')).id;
  // 未提交：无 submission 行 ⇒ score=null、totalScore=null

  global.__rcb0e = { questionId: question.id, assignmentId: assignment.id, sqId: sq.id, subs };
}

const ID = () => global.__rcb0e;
const get = (token, url) => request().get(url).set('Authorization', 'Bearer ' + token);

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

describe('reviewController B0 契约 · export-review 客观题判分（Z1 scoreItem 四分支）', () => {
  beforeAll(async () => {
    await seed();
    tokenOk = await login(PREFIX + 'teacher');
    tokenHidden = await login(PREFIX + 'teacher_hidden');
  }, 60000);

  afterAll(async () => { await purge(); delete global.__rcb0e; }, 60000);

  it('T-C1: 客观题四型逐值判分 —— choice/judge 全等、multi_choice 无序集合相等、fill 逗号分空+逐空小写', async () => {
    const id = ID();
    const res = await get(tokenOk, '/api/teacher/export-review?classId=' + (await prisma.class.findFirst({ where: { name: PREFIX + 'class_a' } })).id + '&assignmentId=' + id.assignmentId);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    // ★ 既有契约：本路由响应体**没有 message**（plan §1.4-4），不得「顺手补齐」
    expect(Object.keys(res.body).sort()).toEqual(['code', 'data']);
    expect('message' in res.body).toBe(false);
    expect(Object.keys(res.body.data).sort()).toEqual(['headerCells', 'rows']);

    // headerCells：客观 4 列 + 主观 1 列。
    // label 口径 = (item.stem || `第N问`) 去 HTML 标签后 slice(0,60)；主观列 = (content||title) 同法。
    // ★ 响应体只透出 {label,maxScore} 两键（sqId/itemKey/type/answer/options 不出网）。
    expect(res.body.data.headerCells).toEqual([
      { label: LABELS[0], maxScore: 25 },
      { label: LABELS[1], maxScore: 25 },
      { label: LABELS[2], maxScore: 25 },
      { label: LABELS[3], maxScore: 25 },
      { label: '主观', maxScore: 40 },
    ]);
    // 参考答案（answer/options/type）绝不随表头出网：前端只拿 label+maxScore
    const hcText = JSON.stringify(res.body.data.headerCells);
    for (const k of ['itemKey', 'sqId', 'options', 'answer']) expect(hcText).not.toContain(k);

    const rows = res.body.data.rows;
    // 排序口径：studentClass.orderBy student.username asc（PREFIX 后首字符字典序 b < k < n < o < p）
    expect(rows.map(r => r.studentName)).toEqual(['B0全错', 'B0空答', 'B0未交', 'B0全对', 'B0多选少选']);

    const byName = Object.fromEntries(rows.map(r => [r.studentName, r]));
    // 公共字段
    expect(rows.every(r => r.className === PREFIX + 'class_a')).toBe(true);
    expect(rows.every(r => r.schoolName === PREFIX + 'school')).toBe(true);
    expect(rows.every(r => r.cellScores.length === 5)).toBe(true);
    expect(byName['B0全对'].studentNo).toBe(PREFIX + 'stu_ok');
    // 主观列未交 → score=null、submitted=false
    expect(byName['B0全对'].cellScores[4]).toEqual({ label: '主观', maxScore: 40, score: null, submitted: false });

    // ① 全对：choice 全等 / multi 无序 / judge 全等 / fill 大小写+逗号
    for (const i of [0, 1, 2, 3]) {
      expect(byName['B0全对'].cellScores[i].score).toBe(25);
      expect(byName['B0全对'].cellScores[i].submitted).toBe(true);
      expect(byName['B0全对'].cellScores[i].maxScore).toBe(25);
      expect(byName['B0全对'].cellScores[i].label).toBe(LABELS[i]);
      expect(Object.keys(byName['B0全对'].cellScores[i]).sort()).toEqual(['label', 'maxScore', 'score', 'submitted']);
    }
    expect(byName['B0全对'].totalScore).toBe(100);

    // ② 多选少选 → 0；其余三问满分（'Foo,BAR' 与 'Foo, BAR' 逐空小写比较相等）
    expect(byName['B0多选少选'].cellScores.map(c => c.score)).toEqual([25, 0, 25, 25, null]);
    expect(byName['B0多选少选'].totalScore).toBe(75);

    // ③ 全错 → 四问全 0（已交 ⇒ 0 而不是 null）
    expect(byName['B0全错'].cellScores.map(c => c.score)).toEqual([0, 0, 0, 0, null]);
    expect(byName['B0全错'].totalScore).toBe(0);

    // ④ 空答 → 四问全 0（'' → scoreItem 的 !sAns 早退 0）；已交 ⇒ 0
    expect(byName['B0空答'].cellScores.map(c => c.score)).toEqual([0, 0, 0, 0, null]);
    expect(byName['B0空答'].totalScore).toBe(0);

    // ⑤ 未提交 → 客观列 score=null（不调 scoreItem），所有列未交 ⇒ totalScore=null
    expect(byName['B0未交'].cellScores.map(c => c.score)).toEqual([null, null, null, null, null]);
    expect(byName['B0未交'].cellScores.map(c => c.submitted)).toEqual([false, false, false, false, false]);
    expect(byName['B0未交'].totalScore).toBeNull();
    expect(byName['B0未交'].submitted).toBe(false);

    // 已交标记与累计口径
    expect(byName['B0全对'].submitted).toBe(true);
    expect(byName['B0全错'].submitted).toBe(true);
  });

  it('T-C2: 判分等价类反例 —— multi_choice 多选也 0 分；choice/judge 大小写与空格不宽松匹配', async () => {
    const id = ID();
    const cls = await prisma.class.findFirst({ where: { name: PREFIX + 'class_a' } });
    const sqId = id.sqId;
    // 在独立学生上追加一组「近似但不相等」的作答（不动 T-C1 的行）
    const stuEdge = await mkUser(PREFIX + 'stu_edge', 'B0边界', 'student');
    await prisma.studentClass.create({ data: { studentId: stuEdge.id, classId: cls.id } });
    const s = await prisma.submission.create({
      data: {
        assignmentId: id.assignmentId, studentId: stuEdge.id, questionId: id.questionId, subQuestionId: sqId,
        // ① multi_choice 多选（A,B,C ⊃ A,B）→ 0；② choice 小写 'b' ≠ 'B' → 0；
        // ③ judge 'TRUE' ≠ 'true' → 0；④ fill 少一空 → 0
        answer: ans([[0, 'b'], [1, 'A,B,C'], [2, 'TRUE'], [3, 'foo']]), status: 'submitted',
        submittedAt: new Date('2026-02-01T10:00:00Z'),
      },
    });
    try {
      const res = await get(tokenOk, '/api/teacher/export-review?classId=' + cls.id + '&assignmentId=' + id.assignmentId);
      expect(res.status).toBe(200);
      const row = res.body.data.rows.find(r => r.studentName === 'B0边界');
      expect(row).toBeDefined();
      // 5 列 = 客观 4 列 + 主观 1 列（该生未交主观小题 → null）
      expect(row.cellScores.map(c => c.score)).toEqual([0, 0, 0, 0, null]);
      expect(row.totalScore).toBe(0);
    } finally {
      await prisma.submission.deleteMany({ where: { id: s.id } });
      await prisma.studentClass.deleteMany({ where: { studentId: stuEdge.id } });
      await prisma.user.delete({ where: { id: stuEdge.id } });
    }
  });

  it('T-C3: 守卫逐字 —— 缺参 400/1001「参数错误」、不可见班级 403/1003「无权访问该班级」、非法 assignmentId 400/1001', async () => {
    const cls = await prisma.class.findFirst({ where: { name: PREFIX + 'class_a' } });

    const missClass = await get(tokenOk, '/api/teacher/export-review?assignmentId=' + ID().assignmentId);
    expect(missClass.status).toBe(400);
    expect(missClass.body).toEqual({ code: 1001, message: '参数错误', data: null });

    const missAsg = await get(tokenOk, '/api/teacher/export-review?classId=' + cls.id);
    expect(missAsg.status).toBe(400);
    expect(missAsg.body).toEqual({ code: 1001, message: '参数错误', data: null });

    // 不可见班级（他人班级）→ 403 且响应体不含任何姓名/答案/分数
    const hidden = await get(tokenHidden, '/api/teacher/export-review?classId=' + cls.id + '&assignmentId=' + ID().assignmentId);
    expect(hidden.status).toBe(403);
    expect(hidden.body).toEqual({ code: 1003, message: '无权访问该班级', data: null });
    expect(JSON.stringify(hidden.body)).not.toContain('B0全对');

    const badAsg = await get(tokenOk, '/api/teacher/export-review?classId=' + cls.id + '&assignmentId=abc');
    expect(badAsg.status).toBe(400);
    expect(badAsg.body).toEqual({ code: 1001, message: '参数错误', data: null });
  });
});
