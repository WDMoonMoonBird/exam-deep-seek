/**
 * Batch1 · T1 契约测试：教师端「待审核汇总」新接口 + 作业列表扩展字段/筛选
 *
 * 覆盖验收标准：
 *  1. GET /api/teacher/pending-summary 字段齐全、类型正确（number / ISO string）；
 *  2. pending-summary.pendingReview 与 review-summary 各行 reviewPending 之和严格相等（含练习形态用例；R3-D4 起不再特判）；
 *  3. 越权：教师 A 的 token 查不到教师 B 班级的任何数据（汇总 + 列表 + classId 筛选三条路径）；
 *  4. 不传 schoolId 时仍严格限于该教师可见范围（不得退化成全库计数）；
 *  5. 作业列表新增 expectedCount / pendingReviewCount / latestSubmittedAt，
 *     且 submissionCount 改为聚合查询后数值口径不变（去重学生数、排除 draft）；
 *  6. 服务端筛选参数 classId / status / keyword 生效。
 *
 * 数据自建自清（afterAll 按前缀回收），不依赖跨校数据，也不改动其他套件的 seed。
 */
import bcrypt from 'bcryptjs';
import { loginAsTeacher, authReq, request, getTestData } from './helpers.js';
import prisma from '../../src/utils/prisma.js';
import { ABNORMAL_FEEDBACK } from '../../src/constants.js';

const PREFIX = '批次1_';
const CLASS_PREFIX = 'test_b1_class';
const STU_PREFIX = 'test_b1_stu_';
const TEACHER_B = 'test_b1_teacher_b';

// 固定时间点（避免与 status 筛选的 now 判定互相干扰）
const T = {
  t0: '2026-03-01T09:00:00.000Z',
  t1: '2026-03-01T10:00:00.000Z',
  t2: '2026-03-01T11:00:00.000Z',
  t3: '2026-03-02T10:00:00.000Z',
  t4: '2026-03-05T10:00:00.000Z',
  t5: '2026-03-06T10:00:00.000Z',
  t6: '2026-03-07T10:00:00.000Z',
  tb: '2026-03-08T10:00:00.000Z',
};

const days = (n) => new Date(Date.now() + n * 24 * 3600 * 1000);

/** 删除本套件创建的全部夹具（按前缀识别），beforeAll 与 afterAll 复用，保证可重复运行 */
async function purgeFixtures() {
  const students = await prisma.user.findMany({ where: { username: { startsWith: STU_PREFIX } }, select: { id: true } });
  const studentIds = students.map(s => s.id);
  const teachers = await prisma.user.findMany({ where: { username: TEACHER_B }, select: { id: true } });
  const teacherIds = teachers.map(t => t.id);
  const classes = await prisma.class.findMany({ where: { name: { startsWith: CLASS_PREFIX } }, select: { id: true } });
  const classIds = classes.map(c => c.id);
  const assignments = await prisma.assignment.findMany({ where: { title: { startsWith: PREFIX } }, select: { id: true } });
  const asgIds = assignments.map(a => a.id);
  const questions = await prisma.question.findMany({ where: { title: { startsWith: PREFIX } }, select: { id: true } });
  const qIds = questions.map(q => q.id);

  await prisma.submission.deleteMany({
    where: { OR: [{ assignmentId: { in: asgIds } }, { studentId: { in: studentIds } }] },
  });
  await prisma.assignmentClass.deleteMany({
    where: { OR: [{ assignmentId: { in: asgIds } }, { classId: { in: classIds } }] },
  });
  await prisma.assignmentQuestion.deleteMany({ where: { OR: [{ assignmentId: { in: asgIds } }, { questionId: { in: qIds } }] } });
  await prisma.assignment.deleteMany({ where: { id: { in: asgIds } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: qIds } } });
  await prisma.question.deleteMany({ where: { id: { in: qIds } } });
  await prisma.studentClass.deleteMany({
    where: { OR: [{ studentId: { in: studentIds } }, { classId: { in: classIds } }] },
  });
  await prisma.teacherClass.deleteMany({
    where: { OR: [{ teacherId: { in: teacherIds } }, { classId: { in: classIds } }] },
  });
  await prisma.teamClass.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.teacherSchool.deleteMany({ where: { teacherId: { in: teacherIds } } });
  await prisma.user.deleteMany({ where: { OR: [{ id: { in: studentIds } }, { id: { in: teacherIds } }] } });
}

describe('T1 · 教师端待审核汇总 + 作业列表扩展', () => {
  let r;              // 教师 A（seed 的 test_teacher）
  let rB;             // 教师 B（本套件自建，同一学校、不可见班级）
  const ids = {};

  beforeAll(async () => {
    await purgeFixtures();

    const token = await loginAsTeacher();
    r = authReq(token);

    const seed = getTestData();
    const schoolId = seed.schoolId;

    // 教师 B：同一所学校，但班级对 A 不可见
    const teacherB = await prisma.user.create({
      data: {
        username: TEACHER_B,
        password: bcrypt.hashSync(TEACHER_B, 10),
        realName: '批次1教师乙',
        role: 'teacher',
      },
    });
    await prisma.teacherSchool.create({ data: { teacherId: teacherB.id, schoolId } });
    const loginB = await request().post('/api/auth/login').send({ username: TEACHER_B, password: TEACHER_B });
    rB = authReq(loginB.body.data.token);
    ids.teacherBId = teacherB.id;

    // 班级：A 两个（用于跨班同生去重），B 一个
    const clsA = await prisma.class.create({ data: { name: `${CLASS_PREFIX}A`, schoolId } });
    const clsA2 = await prisma.class.create({ data: { name: `${CLASS_PREFIX}A2`, schoolId } });
    const clsB = await prisma.class.create({ data: { name: `${CLASS_PREFIX}B`, schoolId } });
    await prisma.teacherClass.create({ data: { teacherId: seed.teacherId, classId: clsA.id } });
    await prisma.teacherClass.create({ data: { teacherId: seed.teacherId, classId: clsA2.id } });
    await prisma.teacherClass.create({ data: { teacherId: teacherB.id, classId: clsB.id } });
    Object.assign(ids, { classA: clsA.id, classA2: clsA2.id, classB: clsB.id, schoolId });

    // 学生：sA1 同时在 A 两个班（跨班同生），sB1 在 B 的班
    const mkStudent = (suffix, realName) => prisma.user.create({
      data: {
        username: `${STU_PREFIX}${suffix}@10001`,
        password: bcrypt.hashSync(`${STU_PREFIX}${suffix}`, 10),
        realName,
        role: 'student',
      },
    });
    const sA1 = await mkStudent('a1', '批次1甲');
    const sA2 = await mkStudent('a2', '批次1乙');
    const sA3 = await mkStudent('a3', '批次1丙');
    const sA4 = await mkStudent('a4', '批次1丁');
    const sA5 = await mkStudent('a5', '批次1戊');
    const sB1 = await mkStudent('b1', '批次1己');
    const link = (studentId, classId) => prisma.studentClass.create({ data: { studentId, classId } });
    await link(sA1.id, clsA.id);
    await link(sA1.id, clsA2.id);
    await link(sA2.id, clsA.id);
    await link(sA3.id, clsA.id);
    await link(sA4.id, clsA.id);
    await link(sA5.id, clsA2.id);
    await link(sB1.id, clsB.id);
    Object.assign(ids, { sA1: sA1.id, sA2: sA2.id, sA3: sA3.id, sA4: sA4.id, sA5: sA5.id, sB1: sB1.id });

    // 题目（每题一行，允许同一学生在同一作业下有多行，用于验证 rollup 的 some() 优先序）
    const mkQuestion = (teacherId, title) => prisma.question.create({
      data: { teacherId, title, maxScore: 100, difficulty: 'easy' },
    });
    const q1 = await mkQuestion(seed.teacherId, `${PREFIX}题1`);
    const q2 = await mkQuestion(seed.teacherId, `${PREFIX}题2`);
    const qB = await mkQuestion(teacherB.id, `${PREFIX}B题`);

    const mkAssignment = (teacherId, title, classIds, opts = {}) => prisma.assignment.create({
      data: {
        teacherId,
        title,
        startTime: opts.startTime || days(-1),
        endTime: opts.endTime || days(1),
        mode: opts.mode || 'exam',
        locked: !!opts.locked,
        assignmentQuestions: { create: { questionId: opts.questionId, sortOrder: 1 } },
        assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      },
    });
    const mkSubmission = (assignmentId, studentId, questionId, status, submittedAt, aiFeedback) => prisma.submission.create({
      data: { assignmentId, studentId, questionId, answer: '', status, submittedAt: submittedAt || null, aiFeedback: aiFeedback || null },
    });

    // asgExam（exam，classA）：1 待审核 + 1 评分中 + 1 异常 + 1 草稿
    const asgExam = await mkAssignment(seed.teacherId, `${PREFIX}考试作业`, [clsA.id], { questionId: q1.id });
    await mkSubmission(asgExam.id, sA1.id, q1.id, 'ai_graded', T.t1, '正常反馈');            // reviewPending
    await mkSubmission(asgExam.id, sA2.id, q1.id, 'ai_graded', T.t0, '正常反馈');            // 同生另一行 submitted → 优先算 aiPending
    await mkSubmission(asgExam.id, sA2.id, q2.id, 'submitted', T.t3);                        // aiPending + 该作业最新提交时间
    await mkSubmission(asgExam.id, sA3.id, q1.id, 'draft', null);                            // draft 不计
    await mkSubmission(asgExam.id, sA4.id, q1.id, 'ai_graded', T.t2, ABNORMAL_FEEDBACK);     // abnormal

    // asgPractice（mode 字段保留但不再驱动行为，classA）：1 待审核 + 1 评分中
    const asgPractice = await mkAssignment(seed.teacherId, `${PREFIX}练习作业`, [clsA.id], { mode: 'practice', questionId: q1.id });
    await mkSubmission(asgPractice.id, sA1.id, q1.id, 'ai_graded', T.t4, '正常反馈');
    await mkSubmission(asgPractice.id, sA2.id, q1.id, 'submitted', T.t5);

    // asgShared（exam，classA + classA2）：同一学生在两班各计一行
    const asgShared = await mkAssignment(seed.teacherId, `${PREFIX}共享作业`, [clsA.id, clsA2.id], { questionId: q1.id });
    await mkSubmission(asgShared.id, sA1.id, q1.id, 'ai_graded', T.t6, '正常反馈');

    // 时间/锁定维度（无提交）
    const asgEnded = await mkAssignment(seed.teacherId, `${PREFIX}已结束作业`, [clsA.id], { questionId: q1.id, startTime: days(-10), endTime: days(-1) });
    const asgUpcoming = await mkAssignment(seed.teacherId, `${PREFIX}未开始作业`, [clsA.id], { questionId: q1.id, startTime: days(1), endTime: days(2) });
    const asgLocked = await mkAssignment(seed.teacherId, `${PREFIX}锁定作业`, [clsA.id], { questionId: q1.id, locked: true });

    // 教师 B 的作业/提交（A 的任何接口都不得看见）
    const asgB = await mkAssignment(teacherB.id, `${PREFIX}B老师作业`, [clsB.id], { questionId: qB.id });
    await mkSubmission(asgB.id, sB1.id, qB.id, 'ai_graded', T.tb, '正常反馈');

    Object.assign(ids, {
      asgExam: asgExam.id, asgPractice: asgPractice.id, asgShared: asgShared.id,
      asgEnded: asgEnded.id, asgUpcoming: asgUpcoming.id, asgLocked: asgLocked.id, asgB: asgB.id,
    });
  });

  afterAll(async () => {
    await purgeFixtures();
  });

  // ===================== 契约 1：pending-summary =====================

  it('P1: pending-summary 字段齐全、类型正确', async () => {
    const res = await r.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('ok');
    const d = res.body.data;
    expect(Object.keys(d).sort()).toEqual(['abnormal', 'aiPending', 'pendingReview', 'updatedAt']);
    for (const k of ['pendingReview', 'aiPending', 'abnormal']) {
      expect(typeof d[k]).toBe('number');
      expect(Number.isInteger(d[k])).toBe(true);
      expect(d[k]).toBeGreaterThanOrEqual(0);
    }
    expect(typeof d.updatedAt).toBe('string');
    expect(new Date(d.updatedAt).toString()).not.toBe('Invalid Date');
    expect(new Date(d.updatedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('P2: classId 只统计该班级，数值严格等于逐行 rollup', async () => {
    const res = await r.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}&classId=${ids.classA}`);
    expect(res.body.code).toBe(0);
    // classA 行：asgExam(aiPending1/reviewPending1/abnormal1) + asgPractice(aiPending1/reviewPending1)
    //          + asgShared(reviewPending1) + 三个无提交作业
    // R3-D4（US-B5）：不再有「练习行恒 0」特判 —— 未发布对学生不可见，练习形态的 ai_graded 也要教师审核
    expect(res.body.data).toMatchObject({ pendingReview: 3, aiPending: 2, abnormal: 1 });

    const resA2 = await r.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}&classId=${ids.classA2}`);
    expect(resA2.body.data).toMatchObject({ pendingReview: 1, aiPending: 0, abnormal: 0 });
  });

  it('P3: pendingReview 与 review-summary 各行 reviewPending 之和严格相等（含 practice）', async () => {
    const summary = await r.get(`/api/teacher/review-summary?schoolId=${ids.schoolId}`);
    expect(summary.body.code).toBe(0);
    const rows = summary.body.data;
    const sumAll = rows.reduce((s, row) => s + row.reviewPending, 0);
    const ps = await r.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}`);
    expect(ps.body.data.pendingReview).toBe(sumAll);

    // 单班作用域同样严格相等
    const sumA = rows.filter(row => row.classId === ids.classA).reduce((s, row) => s + row.reviewPending, 0);
    const psA = await r.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}&classId=${ids.classA}`);
    expect(psA.body.data.pendingReview).toBe(sumA);

    // R3-D4（US-B5）：练习等价形态不再特判 —— 该行的 ai_graded 同样计入待审核
    const practiceRow = rows.find(row => row.assignmentId === ids.asgPractice && row.classId === ids.classA);
    expect(practiceRow).toBeDefined();
    expect(practiceRow.mode).toBe('practice');   // 字段保留（不再驱动行为）
    expect(practiceRow.reviewPending).toBe(1);
    expect(practiceRow.aiPending).toBe(1);
    expect(psA.body.data.pendingReview).toBe(sumA);
    expect(sumA).toBe(3);
  });

  it('P4: 越权——教师 A 查不到教师 B 班级的汇总数据', async () => {
    // B 自己看得到（作为对照：该班确实有 1 条待审核）
    const bOwn = await rB.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}&classId=${ids.classB}`);
    expect(bOwn.body.data).toMatchObject({ pendingReview: 1, aiPending: 0, abnormal: 0 });

    // A 显式请求 B 的 classId → 全 0（可见集合外收窄为空集，不回退全库）
    const aOnB = await r.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}&classId=${ids.classB}`);
    expect(aOnB.status).toBe(200);
    expect(aOnB.body.data).toMatchObject({ pendingReview: 0, aiPending: 0, abnormal: 0 });

    // A 不带 classId 的全量口径必须等于 review-summary 行之和，且 review-summary 中不含 B 的班级
    const rows = (await r.get(`/api/teacher/review-summary?schoolId=${ids.schoolId}`)).body.data;
    expect(rows.some(row => row.classId === ids.classB)).toBe(false);
    const ps = await r.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}`);
    expect(ps.body.data.pendingReview).toBe(rows.reduce((s, row) => s + row.reviewPending, 0));

    // A 的作业列表不出现 B 的作业；显式按 B 的班级筛选 → 空列表
    const listAll = await r.get('/api/teacher/assignments?pageSize=100');
    expect(listAll.body.data.list.some(a => a.id === ids.asgB)).toBe(false);
    const listFiltered = await r.get(`/api/teacher/assignments?pageSize=100&classId=${ids.classB}`);
    expect(listFiltered.body.code).toBe(0);
    expect(listFiltered.body.data.total).toBe(0);
    expect(listFiltered.body.data.list).toHaveLength(0);
  });

  it('P5: 不传 schoolId 仍严格限于该教师可见范围（不退化为全库计数）', async () => {
    const withSchool = await r.get(`/api/teacher/pending-summary?schoolId=${ids.schoolId}`);
    const noSchool = await r.get('/api/teacher/pending-summary');
    expect(noSchool.status).toBe(200);
    expect(noSchool.body.code).toBe(0);
    // 可见班级全在同一学校 → 两个口径数值一致；若退化成全库计数会多出 B 班级的 1 条
    expect(noSchool.body.data.pendingReview).toBe(withSchool.body.data.pendingReview);
    expect(noSchool.body.data.aiPending).toBe(withSchool.body.data.aiPending);
    expect(noSchool.body.data.abnormal).toBe(withSchool.body.data.abnormal);

    const rows = (await r.get(`/api/teacher/review-summary?schoolId=${ids.schoolId}`)).body.data;
    const bRow = rows.find(row => row.classId === ids.classB);
    expect(bRow).toBeUndefined();
    expect(noSchool.body.data.pendingReview).toBe(rows.reduce((s, row) => s + row.reviewPending, 0));
  });

  // ===================== 契约 2：作业列表扩展 =====================

  it('A1: 作业列表三个新字段齐全、类型正确', async () => {
    const res = await r.get(`/api/teacher/assignments?pageSize=100&classId=${ids.classA}`);
    expect(res.body.code).toBe(0);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.list.length).toBeGreaterThan(0);
    for (const item of res.body.data.list) {
      expect(typeof item.expectedCount).toBe('number');
      expect(typeof item.pendingReviewCount).toBe('number');
      expect(Number.isInteger(item.expectedCount)).toBe(true);
      expect(Number.isInteger(item.pendingReviewCount)).toBe(true);
      expect(item.expectedCount).toBeGreaterThanOrEqual(0);
      expect(item.pendingReviewCount).toBeGreaterThanOrEqual(0);
      expect(item.latestSubmittedAt === null || typeof item.latestSubmittedAt === 'string').toBe(true);
      if (item.latestSubmittedAt !== null) {
        expect(new Date(item.latestSubmittedAt).toISOString()).toBe(item.latestSubmittedAt);
      }
    }
  });

  it('A2: expectedCount / submissionCount / pendingReviewCount / latestSubmittedAt 精确值', async () => {
    const res = await r.get(`/api/teacher/assignments?pageSize=100&classId=${ids.classA}`);
    const byId = new Map(res.body.data.list.map(a => [a.id, a]));

    // exam：4 名在班学生；3 人非 draft（sA1/sA2/sA4）；1 待审核；最新提交 = sA2 的第二行
    const exam = byId.get(ids.asgExam);
    expect(exam.submissionCount).toBe(3);
    expect(exam.expectedCount).toBe(4);
    expect(exam.pendingReviewCount).toBe(1);
    expect(exam.latestSubmittedAt).toBe(T.t3);

    // practice：不再特判（R3-D4 / US-B5）—— 该生的 ai_graded 计入待审核
    const practice = byId.get(ids.asgPractice);
    expect(practice.submissionCount).toBe(2);
    expect(practice.expectedCount).toBe(4);
    expect(practice.pendingReviewCount).toBe(1);
    expect(practice.latestSubmittedAt).toBe(T.t5);

    // 无提交：分母照常，其余为 0 / null
    const ended = byId.get(ids.asgEnded);
    expect(ended.submissionCount).toBe(0);
    expect(ended.expectedCount).toBe(4);
    expect(ended.pendingReviewCount).toBe(0);
    expect(ended.latestSubmittedAt).toBeNull();
  });

  it('A3: 跨班同生——expectedCount 去重，pendingReviewCount 按 (作业×班级) 行各计一次', async () => {
    const res = await r.get(`/api/teacher/assignments?pageSize=100&classId=${ids.classA2}`);
    const shared = res.body.data.list.find(a => a.id === ids.asgShared);
    expect(shared).toBeDefined();
    // 分母：classA(4 人) ∪ classA2(2 人，含共享的 sA1) = 5
    expect(shared.expectedCount).toBe(5);
    // 分子：sA1 在该作业下 1 行非 draft 提交
    expect(shared.submissionCount).toBe(1);
    // 待审核：classA 行 + classA2 行各 1（与 review-summary 行口径一致）
    expect(shared.pendingReviewCount).toBe(2);

    const rows = (await r.get(`/api/teacher/review-summary?schoolId=${ids.schoolId}`)).body.data
      .filter(row => row.assignmentId === ids.asgShared);
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, row) => s + row.reviewPending, 0)).toBe(shared.pendingReviewCount);
  });

  it('A4: submissionCount 聚合改造后口径不变（seed 作业：3 人 2 提交，1 草稿不计）', async () => {
    const seed = getTestData();
    const res = await r.get('/api/teacher/assignments?pageSize=100');
    const item = res.body.data.list.find(a => a.id === seed.assignmentId);
    expect(item).toBeDefined();
    expect(item.submissionCount).toBe(2);   // test_stu_01(ai_graded) + test_stu_02(submitted)，test_stu_03 为 draft
    expect(item.expectedCount).toBe(3);
    expect(item.pendingReviewCount).toBe(1);
    expect(typeof item.latestSubmittedAt).toBe('string');
    expect(item.latestSubmittedAt).not.toBeNull();
  });

  // ===================== 契约 2：筛选参数 =====================

  it('F1: classId 筛选只在可见班级内收窄', async () => {
    const res = await r.get(`/api/teacher/assignments?pageSize=100&classId=${ids.classA2}`);
    expect(res.body.code).toBe(0);
    const myIds = res.body.data.list.map(a => a.id);
    expect(myIds).toContain(ids.asgShared);
    expect(myIds).not.toContain(ids.asgExam);   // 只关联 classA

    // 非法 classId → 空集（fail-closed），不是忽略条件
    const bad = await r.get('/api/teacher/assignments?pageSize=100&classId=abc');
    expect(bad.body.data.total).toBe(0);
    expect(bad.body.data.list).toHaveLength(0);
  });

  it('F2: keyword 按标题模糊匹配', async () => {
    const res = await r.get(`/api/teacher/assignments?pageSize=100&keyword=${encodeURIComponent('批次1_考试')}`);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list).toHaveLength(1);
    expect(res.body.data.list[0].id).toBe(ids.asgExam);
    // 模糊（部分匹配）
    const fuzzy = await r.get(`/api/teacher/assignments?pageSize=100&keyword=${encodeURIComponent('批次1_')}`);
    expect(fuzzy.body.data.total).toBe(6); // 本套件教师 A 的 6 个作业（B 的不可见）
  });

  it('F3: status 时间维度筛选（ongoing / ended / upcoming / locked）', async () => {
    const ongoing = await r.get('/api/teacher/assignments?pageSize=100&status=ongoing');
    const ongoingIds = ongoing.body.data.list.map(a => a.id);
    expect(ongoingIds).toEqual(expect.arrayContaining([ids.asgExam, ids.asgPractice, ids.asgShared, ids.asgLocked]));
    expect(ongoingIds).not.toContain(ids.asgEnded);
    expect(ongoingIds).not.toContain(ids.asgUpcoming);
    expect(ongoingIds).not.toContain(ids.asgB);

    const ended = await r.get('/api/teacher/assignments?pageSize=100&status=ended');
    const endedIds = ended.body.data.list.map(a => a.id);
    expect(endedIds).toContain(ids.asgEnded);
    expect(endedIds).not.toContain(ids.asgExam);

    const upcoming = await r.get('/api/teacher/assignments?pageSize=100&status=upcoming');
    const upcomingIds = upcoming.body.data.list.map(a => a.id);
    expect(upcomingIds).toContain(ids.asgUpcoming);
    expect(upcomingIds).not.toContain(ids.asgExam);

    const locked = await r.get('/api/teacher/assignments?pageSize=100&status=locked');
    const lockedIds = locked.body.data.list.map(a => a.id);
    expect(lockedIds).toContain(ids.asgLocked);
    expect(lockedIds).not.toContain(ids.asgExam);

    // 未识别取值：按契约「不筛选」处理（与不加筛选的总数一致）
    const base = await r.get('/api/teacher/assignments?pageSize=100');
    const unknown = await r.get('/api/teacher/assignments?pageSize=100&status=not_a_status');
    expect(unknown.body.data.total).toBe(base.body.data.total);
  });

  it('F4: 分页参数仍生效（total 与 page/pageSize 回显）', async () => {
    const res = await r.get('/api/teacher/assignments?page=1&pageSize=2');
    expect(res.body.code).toBe(0);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(2);
    expect(res.body.data.list.length).toBeLessThanOrEqual(2);
    expect(res.body.data.total).toBeGreaterThanOrEqual(6);
  });
});
