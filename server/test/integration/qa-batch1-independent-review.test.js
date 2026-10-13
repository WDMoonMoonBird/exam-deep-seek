/**
 * Batch1 独立复核（t3 · qa-api-review）：契约完整性 / 越权 / 可见性白名单 / 口径一致性
 *
 * 本文件由复核者独立编写，不复用 t1/t2 的测试结论，全部期望值由本文件自行推导：
 *   1. 口径一致性：pending-summary 与 review-summary 各行 reviewPending 之和严格相等（含 practice 恒 0、
 *      同学生多小题「有 submitted 不重复计入 reviewPending」的 rollup 边界），并对照硬编码手算值；
 *   2. 越权反例：baseline 之后再注入「A 不可见的班级」毒数据（同校隐藏班 + 跨校班级），
 *      pending-summary 与 /teacher/submissions（均不传 schoolId/classId）必须与 baseline 完全一致；
 *   3. 学生端可见性：/student/assignments 与 /student/assignments/:id 响应体递归字段级断言，
 *      aiScore / aiFeedback 字段名与 AI 评语原文一律不得出现；未发布且非 practice 时 finalScore 必须为 null；
 *   4. 字段正确性交叉核对：expectedCount / submissionCount（在测试内复刻 git HEAD 旧实现算法）/ latestSubmittedAt；
 *   5. getVisibleClassIds 的 schoolId 生效（直连 + 团队两条来源）与「schoolId 为空 = 改造前行为」回归；
 *   6. review-summary 每行 _count.assignmentQuestions。
 *
 * 夹具完全自建（qa1_ 前缀，独立学校 29991/29992），beforeAll/afterAll 幂等回收，不依赖 setup seed 的班级/作业。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';
import { getVisibleClassIds } from '../../src/controllers/teamController.js';
import { ABNORMAL_FEEDBACK } from '../../src/constants.js';

const PREFIX = 'qa1_';
const CODE1 = '29991';
const CODE2 = '29992';
const AI_SECRET = PREFIX + 'AI评语-绝密勿下发';
const PRACTICE_AI_SECRET = PREFIX + '练习AI评语-按既有规则映射';
const TEACHER_FB = PREFIX + '教师批语';
const EDGE_AI_SECRET = PREFIX + '已发布但未定案分';

const D = {
  t1: new Date('2026-04-01T01:00:00Z'),
  t2: new Date('2026-04-01T02:00:00Z'),
  t3: new Date('2026-04-01T03:00:00Z'),
  t4: new Date('2026-04-02T01:00:00Z'),
  t5: new Date('2026-04-02T02:00:00Z'),
  t6: new Date('2026-04-03T01:00:00Z'),
  t7: new Date('2026-04-04T01:00:00Z'),
  t8: new Date('2026-04-05T01:00:00Z'),
  t9: new Date('2026-04-09T01:00:00Z'), // 仅用于 draft / 毒数据，绝不能进入 latestSubmittedAt
};
const iso = (d) => d.toISOString();

/** 按前缀幂等清理本套件全部夹具（含上次崩溃残留） */
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
  const teams = await prisma.team.findMany({
    where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }, { createdBy: { in: userIds } }] },
    select: { id: true },
  });
  const teamIds = teams.map(t => t.id);
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
  await prisma.teamClass.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { classId: { in: classIds } }] } });
  await prisma.teamTeacher.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { teacherId: { in: userIds } }] } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

const id = {};     // 夹具 id 表
let tokenA, tokenX, tokenZ, tokenStu;
const base = {};   // 毒数据注入前的 baseline

async function login(username, password) {
  const res = await request().post('/api/auth/login').send({ username, password });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}
const get = (token, url) => request().get(url).set('Authorization', 'Bearer ' + token);

const mkUser = (username, realName, role) => prisma.user.create({
  data: { username, password: bcrypt.hashSync(username, 10), realName, role },
});

async function seedVisible() {
  const s1 = await prisma.school.create({ data: { name: PREFIX + 'school1', officialCode: CODE1 } });
  const s2 = await prisma.school.create({ data: { name: PREFIX + 'school2', officialCode: CODE2 } });
  const clsPub = await prisma.class.create({ data: { name: PREFIX + 'class_pub', schoolId: s1.id } });
  const clsPub2 = await prisma.class.create({ data: { name: PREFIX + 'class_pub2', schoolId: s1.id } });
  const clsHidden = await prisma.class.create({ data: { name: PREFIX + 'class_hidden', schoolId: s1.id } });
  const clsOther = await prisma.class.create({ data: { name: PREFIX + 'class_other', schoolId: s2.id } });
  const clsTeam = await prisma.class.create({ data: { name: PREFIX + 'class_team', schoolId: s2.id } });

  const tA = await mkUser(PREFIX + 'teacher_a', '复核教师A', 'teacher');   // 仅 S1 两班
  const tP = await mkUser(PREFIX + 'teacher_p', '复核教师P', 'teacher');   // 隐藏班（同校不可见）
  const tX = await mkUser(PREFIX + 'teacher_x', '复核教师X', 'teacher');   // 跨校（S1 直连 + S2 直连 + S2 团队）
  const tZ = await mkUser(PREFIX + 'teacher_z', '复核教师Z', 'teacher');   // 无任何班级/团队
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: tA.id, schoolId: s1.id }, { teacherId: tP.id, schoolId: s1.id },
    { teacherId: tX.id, schoolId: s1.id }, { teacherId: tX.id, schoolId: s2.id },
    { teacherId: tZ.id, schoolId: s2.id },
  ] });
  await prisma.teacherClass.createMany({ data: [
    { teacherId: tA.id, classId: clsPub.id }, { teacherId: tA.id, classId: clsPub2.id },
    { teacherId: tP.id, classId: clsHidden.id },
    { teacherId: tX.id, classId: clsPub.id }, { teacherId: tX.id, classId: clsOther.id },
  ] });
  const team = await prisma.team.create({ data: { name: PREFIX + 'team', schoolId: s2.id, createdBy: tX.id } });
  await prisma.teamTeacher.create({ data: { teamId: team.id, teacherId: tX.id } });
  await prisma.teamClass.create({ data: { teamId: team.id, classId: clsTeam.id } });

  const stuA = await mkUser(PREFIX + 'stu_a@' + CODE1, '复核生A', 'student'); // 跨班同生
  const stuB = await mkUser(PREFIX + 'stu_b@' + CODE1, '复核生B', 'student');
  const stuC = await mkUser(PREFIX + 'stu_c@' + CODE1, '复核生C', 'student');
  const stuS = await mkUser(PREFIX + 'stu_s@' + CODE1, '复核生S', 'student');
  const stuE = await mkUser(PREFIX + 'stu_e@' + CODE1, '复核生E', 'student');
  const stuD = await mkUser(PREFIX + 'stu_d@' + CODE1, '复核生D', 'student');
  await prisma.studentClass.createMany({ data: [
    { studentId: stuA.id, classId: clsPub.id }, { studentId: stuA.id, classId: clsPub2.id },
    { studentId: stuB.id, classId: clsPub.id }, { studentId: stuC.id, classId: clsPub.id },
    { studentId: stuS.id, classId: clsPub.id }, { studentId: stuE.id, classId: clsPub.id },
    { studentId: stuD.id, classId: clsPub2.id },
  ] });

  const q1 = await prisma.question.create({
    data: {
      teacherId: tA.id, title: PREFIX + '题1', maxScore: 100, difficulty: 'easy',
      subQuestions: { create: [
        { sortOrder: 1, title: 'q1s1', content: '<p>1</p>', referenceAnswer: PREFIX + '参考答案1', language: 'python', score: 60 },
        { sortOrder: 2, title: 'q1s2', content: '<p>2</p>', referenceAnswer: PREFIX + '参考答案2', language: 'python', score: 40 },
      ] },
    },
    include: { subQuestions: { orderBy: { sortOrder: 'asc' } } },
  });
  const q2 = await prisma.question.create({
    data: {
      teacherId: tA.id, title: PREFIX + '题2', maxScore: 40, difficulty: 'easy',
      subQuestions: { create: [{ sortOrder: 1, title: 'q2s1', content: '<p>3</p>', referenceAnswer: PREFIX + '参考答案3', language: 'python', score: 40 }] },
    },
    include: { subQuestions: true },
  });
  const qH = await prisma.question.create({ data: { teacherId: tP.id, title: PREFIX + '隐藏题', maxScore: 50, difficulty: 'easy' } });
  const qO = await prisma.question.create({ data: { teacherId: tP.id, title: PREFIX + '跨校题', maxScore: 50, difficulty: 'easy' } });

  const mkAsg = (teacherId, title, classIds, questionIds, opts = {}) => prisma.assignment.create({
    data: {
      teacherId, title, mode: opts.mode || 'exam',
      startTime: opts.startTime || new Date('2026-01-01'), endTime: opts.endTime || new Date('2027-01-01'),
      assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
  });
  const mkSub = (assignmentId, studentId, questionId, subQuestionId, data) => prisma.submission.create({
    data: {
      assignmentId, studentId, questionId, subQuestionId: subQuestionId || null,
      answer: data.answer ?? '', status: data.status, aiScore: data.aiScore ?? null, aiFeedback: data.aiFeedback ?? null,
      finalScore: data.finalScore ?? null, teacherFeedback: data.teacherFeedback ?? null,
      attemptCount: data.attemptCount ?? 0, bestScore: data.bestScore ?? null, submittedAt: data.submittedAt ?? null,
    },
  });

  // asgExam：1 待审核（stuB 纯 ai_graded）+ 1 crossing（stuA：ai_graded 且有 submitted 行 → 只算 aiPending）
  //          + 1 异常（stuE）+ 1 draft（stuC，带 submittedAt 毒值）+ 1 published（stuS，rollup 不计）
  const asgExam = await mkAsg(tA.id, PREFIX + '作业-exam', [clsPub.id], [q1.id, q2.id]);
  await mkSub(asgExam.id, stuA.id, q1.id, q1.subQuestions[0].id, { status: 'ai_graded', aiFeedback: '正常', submittedAt: D.t1 });
  await mkSub(asgExam.id, stuA.id, q2.id, q2.subQuestions[0].id, { status: 'submitted', submittedAt: D.t2 });
  await mkSub(asgExam.id, stuB.id, q1.id, q1.subQuestions[0].id, { status: 'ai_graded', aiFeedback: '正常', submittedAt: D.t1 });
  await mkSub(asgExam.id, stuE.id, q1.id, q1.subQuestions[0].id, { status: 'ai_graded', aiFeedback: ABNORMAL_FEEDBACK, submittedAt: D.t1 });
  await mkSub(asgExam.id, stuC.id, q1.id, q1.subQuestions[0].id, { status: 'draft', submittedAt: D.t9 });
  await mkSub(asgExam.id, stuS.id, q1.id, q1.subQuestions[0].id, { status: 'published', finalScore: 88, aiScore: 80, submittedAt: D.t3 });

  // asgPractice：practice 行 reviewPending 恒 0
  const asgPractice = await mkAsg(tA.id, PREFIX + '作业-practice', [clsPub.id], [q1.id], { mode: 'practice' });
  await mkSub(asgPractice.id, stuA.id, q1.id, q1.subQuestions[0].id, { status: 'ai_graded', aiFeedback: '正常', submittedAt: D.t4 });
  await mkSub(asgPractice.id, stuB.id, q1.id, q1.subQuestions[0].id, { status: 'submitted', submittedAt: D.t5 });

  // asgShared：跨两班，同一学生按 (作业×班级) 行各计一次
  const asgShared = await mkAsg(tA.id, PREFIX + '作业-shared', [clsPub.id, clsPub2.id], [q1.id]);
  await mkSub(asgShared.id, stuA.id, q1.id, q1.subQuestions[0].id, { status: 'ai_graded', aiFeedback: '正常', submittedAt: D.t6 });

  const asgNoSub = await mkAsg(tA.id, PREFIX + '作业-无提交', [clsPub.id], [q2.id]);
  const asgDraftOnly = await mkAsg(tA.id, PREFIX + '作业-仅草稿', [clsPub.id], [q2.id]);
  await mkSub(asgDraftOnly.id, stuB.id, q2.id, q2.subQuestions[0].id, { status: 'draft', submittedAt: D.t9 });

  // ===== 学生端（学生 S）=====
  const asgStuUnpub = await mkAsg(tA.id, PREFIX + '学生-未发布exam', [clsPub.id], [q1.id, q2.id]);
  await mkSub(asgStuUnpub.id, stuS.id, q1.id, q1.subQuestions[0].id, {
    status: 'ai_graded', aiScore: 55, aiFeedback: AI_SECRET, attemptCount: 2, bestScore: 55, submittedAt: D.t1,
  });
  await mkSub(asgStuUnpub.id, stuS.id, q2.id, q2.subQuestions[0].id, { status: 'draft' });

  const asgStuPub = await mkAsg(tA.id, PREFIX + '学生-已发布exam', [clsPub.id], [q1.id, q2.id]);
  await mkSub(asgStuPub.id, stuS.id, q1.id, q1.subQuestions[0].id, {
    status: 'published', finalScore: 30, aiScore: 25, aiFeedback: AI_SECRET, teacherFeedback: TEACHER_FB, attemptCount: 1, bestScore: 30, submittedAt: D.t2,
  });
  await mkSub(asgStuPub.id, stuS.id, q2.id, q2.subQuestions[0].id, {
    status: 'published', finalScore: 40, aiScore: 38, aiFeedback: AI_SECRET, teacherFeedback: TEACHER_FB, attemptCount: 1, bestScore: 40, submittedAt: D.t3,
  });

  const asgStuPractice = await mkAsg(tA.id, PREFIX + '学生-练习practice', [clsPub.id], [q1.id], { mode: 'practice' });
  await mkSub(asgStuPractice.id, stuS.id, q1.id, q1.subQuestions[0].id, {
    status: 'ai_graded', aiScore: 33, aiFeedback: PRACTICE_AI_SECRET, attemptCount: 1, bestScore: 33, submittedAt: D.t4,
  });

  // 边界探针：已发布但教师未定案分（finalScore=null，aiScore 有值）——契约字面「返回其 finalScore」
  const asgStuEdge = await mkAsg(tA.id, PREFIX + '学生-已发布未定案分', [clsPub.id], [q1.id, q2.id]);
  await mkSub(asgStuEdge.id, stuS.id, q1.id, q1.subQuestions[0].id, {
    status: 'published', finalScore: null, aiScore: 55, aiFeedback: EDGE_AI_SECRET, attemptCount: 1, bestScore: 55, submittedAt: D.t5,
  });

  Object.assign(id, {
    s1: s1.id, s2: s2.id, clsPub: clsPub.id, clsPub2: clsPub2.id, clsHidden: clsHidden.id,
    clsOther: clsOther.id, clsTeam: clsTeam.id,
    tA: tA.id, tP: tP.id, tX: tX.id, tZ: tZ.id, team: team.id,
    stuA: stuA.id, stuB: stuB.id, stuC: stuC.id, stuS: stuS.id, stuE: stuE.id, stuD: stuD.id,
    q1: q1.id, q2: q2.id, qH: qH.id, qO: qO.id,
    sq1a: q1.subQuestions[0].id, sq1b: q1.subQuestions[1].id, sq2a: q2.subQuestions[0].id,
    asgExam: asgExam.id, asgPractice: asgPractice.id, asgShared: asgShared.id,
    asgNoSub: asgNoSub.id, asgDraftOnly: asgDraftOnly.id,
    asgStuUnpub: asgStuUnpub.id, asgStuPub: asgStuPub.id, asgStuPractice: asgStuPractice.id, asgStuEdge: asgStuEdge.id,
  });
}

/** 毒数据：A 完全不可见的班级（同校隐藏班 + 跨校班级）——若越权防线失效，A 的汇总/列表必然变大 */
async function seedPoison() {
  const stuH = await mkUser(PREFIX + 'stu_h@' + CODE1, '隐藏生H', 'student');
  const stuH2 = await mkUser(PREFIX + 'stu_h2@' + CODE1, '隐藏生H2', 'student');
  const stuH3 = await mkUser(PREFIX + 'stu_h3@' + CODE1, '隐藏生H3', 'student');
  const stuO = await mkUser(PREFIX + 'stu_o@' + CODE2, '跨校生O', 'student');
  await prisma.studentClass.createMany({ data: [
    { studentId: stuH.id, classId: id.clsHidden }, { studentId: stuH2.id, classId: id.clsHidden },
    { studentId: stuH3.id, classId: id.clsHidden }, { studentId: stuO.id, classId: id.clsOther },
  ] });

  const asgPoisonHidden = await prisma.assignment.create({
    data: {
      teacherId: id.tP, title: PREFIX + '毒-隐藏班作业', mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: { classId: id.clsHidden } },
      assignmentQuestions: { create: { questionId: id.qH, sortOrder: 1 } },
    },
  });
  const asgPoisonOther = await prisma.assignment.create({
    data: {
      teacherId: id.tP, title: PREFIX + '毒-跨校作业', mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: { classId: id.clsOther } },
      assignmentQuestions: { create: { questionId: id.qO, sortOrder: 1 } },
    },
  });
  const asgMixedVis = await prisma.assignment.create({
    data: {
      teacherId: id.tA, title: PREFIX + '作业-可见班+隐藏班', mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: [{ classId: id.clsPub }, { classId: id.clsHidden }] },
      assignmentQuestions: { create: { questionId: id.q1, sortOrder: 1 } },
    },
  });

  const mk = (assignmentId, studentId, questionId, status, extra = {}) => prisma.submission.create({
    data: {
      assignmentId, studentId, questionId, status,
      aiScore: extra.aiScore ?? null, aiFeedback: extra.aiFeedback ?? null,
      finalScore: extra.finalScore ?? null, attemptCount: 0, submittedAt: extra.submittedAt ?? D.t7,
    },
  });
  const p1 = await mk(asgPoisonHidden.id, stuH.id, id.qH, 'ai_graded', { aiFeedback: '正常' });        // 若泄露 → pendingReview +1
  const p2 = await mk(asgPoisonHidden.id, stuH2.id, id.qH, 'submitted');                                // 若泄露 → aiPending +1
  const p3 = await mk(asgPoisonHidden.id, stuH3.id, id.qH, 'ai_graded', { aiFeedback: ABNORMAL_FEEDBACK }); // 若泄露 → abnormal +1
  const p4 = await mk(asgPoisonOther.id, stuO.id, id.qO, 'ai_graded', { aiFeedback: '正常' });          // 若泄露 → pendingReview +1
  const p5 = await mk(asgMixedVis.id, stuH.id, id.q1, 'ai_graded', { aiFeedback: '正常' });             // 可见班+隐藏班混合
  Object.assign(id, { stuH: stuH.id, stuH2: stuH2.id, stuH3: stuH3.id, stuO: stuO.id, asgPoisonHidden: asgPoisonHidden.id, asgPoisonOther: asgPoisonOther.id, asgMixedVis: asgMixedVis.id });
  Object.assign(base, { poisonSubmissionIds: [p1.id, p2.id, p3.id, p4.id, p5.id] });
}

/** 递归收集响应体全部字段名（字段级断言，而非值断言） */
function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) { for (const v of value) collectKeys(v, out); return out; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); collectKeys(v, out); }
  }
  return out;
}

/** git HEAD 旧实现（teacherController.getAssignments 改前）的 submissionCount 算法复刻 */
async function oldSubmissionCounts(assignmentIds) {
  const subs = await prisma.submission.findMany({
    where: { assignmentId: { in: assignmentIds }, status: { not: 'draft' } },
    select: { assignmentId: true, studentId: true },
  });
  const seen = new Set();
  const countMap = {};
  for (const s of subs) {
    const key = s.assignmentId + '_' + s.studentId;
    if (!seen.has(key)) { seen.add(key); countMap[s.assignmentId] = (countMap[s.assignmentId] || 0) + 1; }
  }
  return countMap;
}

/** 独立复算 expectedCount = 该作业全部关联班级的学生去重数 */
async function expectedCountByAssignment(assignmentIds) {
  const acs = await prisma.assignmentClass.findMany({ where: { assignmentId: { in: assignmentIds } }, select: { assignmentId: true, classId: true } });
  const classIds = [...new Set(acs.map(a => a.classId))];
  const scs = await prisma.studentClass.findMany({ where: { classId: { in: classIds } }, select: { classId: true, studentId: true } });
  const roster = new Map();
  for (const sc of scs) {
    if (!roster.has(sc.classId)) roster.set(sc.classId, []);
    roster.get(sc.classId).push(sc.studentId);
  }
  const out = {};
  for (const aId of assignmentIds) {
    const set = new Set();
    for (const ac of acs.filter(a => a.assignmentId === aId)) for (const s of (roster.get(ac.classId) || [])) set.add(s);
    out[aId] = set.size;
  }
  return out;
}

/** 独立复算：最新非 draft 提交时间（对照实现里的 SQL MAX） */
async function latestNonDraftByAssignment(assignmentIds) {
  const subs = await prisma.submission.findMany({
    where: { assignmentId: { in: assignmentIds }, status: { not: 'draft' } },
    select: { assignmentId: true, submittedAt: true },
  });
  const out = {};
  for (const s of subs) {
    if (!s.submittedAt) continue;
    const cur = out[s.assignmentId];
    if (!cur || new Date(s.submittedAt) > new Date(cur)) out[s.assignmentId] = s.submittedAt;
  }
  return out;
}

describe('Batch1 独立复核 · qa-api-review', () => {
  beforeAll(async () => {
    await purge();
    await seedVisible();
    tokenA = await login(PREFIX + 'teacher_a', PREFIX + 'teacher_a');
    tokenX = await login(PREFIX + 'teacher_x', PREFIX + 'teacher_x');
    tokenZ = await login(PREFIX + 'teacher_z', PREFIX + 'teacher_z');
    tokenStu = await login(PREFIX + 'stu_s@' + CODE1, PREFIX + 'stu_s@' + CODE1);

    // ===== 毒注入前的 baseline（越权反例的对照基准）=====
    const psNo = await get(tokenA, '/api/teacher/pending-summary');
    base.psNoSchool = { pendingReview: psNo.body.data.pendingReview, aiPending: psNo.body.data.aiPending, abnormal: psNo.body.data.abnormal };
    const psS1 = await get(tokenA, '/api/teacher/pending-summary?schoolId=' + id.s1);
    base.psSchool1 = { pendingReview: psS1.body.data.pendingReview, aiPending: psS1.body.data.aiPending, abnormal: psS1.body.data.abnormal };
    const subAll = await get(tokenA, '/api/teacher/submissions?pageSize=500');
    base.subsTotal = subAll.body.data.total;
    base.subsIds = subAll.body.data.list.map(s => s.id).sort();

    await seedPoison();
  }, 60000);

  afterAll(async () => { await purge(); }, 60000);

  // ================= 1. 口径一致性 =================

  it('R1: pending-summary 字段/类型/口径 = 硬编码手算值（R3-D4：练习形态不再特判）', async () => {
    const res = await get(tokenA, '/api/teacher/pending-summary');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('ok');
    expect(Object.keys(res.body.data).sort()).toEqual(['abnormal', 'aiPending', 'pendingReview', 'updatedAt']);
    // 可见范围只有 clsPub / clsPub2，逐 (作业 × 班级) 行手算：
    //   asgExam/clsPub        → aiPending 1（stuA：有 submitted 行）+ reviewPending 1（stuB，stuA 不重复计入）+ abnormal 1（stuE）
    //   asgPractice/clsPub    → aiPending 1（stuB submitted）+ reviewPending 1（stuA 的 ai_graded）
    //   asgShared/clsPub 与 clsPub2 各 1（同一学生按行各计一次）→ 2
    //   asgStuUnpub/clsPub    → reviewPending 1（stuS 的 ai_graded 未发布提交）
    //   asgStuPub/asgStuEdge（published）→ 0；asgStuPractice（ai_graded 未发布）→ reviewPending 1
    //   asgNoSub / asgDraftOnly / asgMixedVis 的 clsPub 行 → 0；asgMixedVis 的 clsHidden 行不可见
    // R3-D4（US-B5）：练习等价形态不再「恒 0」⇒ 总待审核 4 → 6
    expect(res.body.data).toMatchObject({ pendingReview: 6, aiPending: 2, abnormal: 1 });
    expect(new Date(res.body.data.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('R2: 与 review-summary 各行 reviewPending 之和严格相等（含练习形态 / rollup 边界）', async () => {
    const rs = await get(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1);
    expect(rs.body.code).toBe(0);
    const rows = rs.body.data;
    // 不可见班级不得出现
    expect(rows.some(r => r.classId === id.clsHidden || r.classId === id.clsOther)).toBe(false);

    const sum = rows.reduce((s, r) => s + r.reviewPending, 0);
    const ps = await get(tokenA, '/api/teacher/pending-summary');
    const psS1 = await get(tokenA, '/api/teacher/pending-summary?schoolId=' + id.s1);
    // R3-D4：asgExam 1 + asgPractice 1 + asgStuUnpub 1 + asgStuPractice 1 + asgShared 2 = 6
    expect(sum).toBe(6);
    expect(ps.body.data.pendingReview).toBe(sum);
    expect(psS1.body.data.pendingReview).toBe(sum);

    // 逐行断言（本文件自行手算）
    const row = (aId, cId) => rows.find(r => r.assignmentId === aId && r.classId === cId);
    const examRow = row(id.asgExam, id.clsPub);
    expect(examRow).toBeDefined();
    expect(examRow.mode).toBe('exam');
    expect(examRow.totalStudents).toBe(5);
    expect(examRow.submittedCount).toBe(4);           // stuA(stuA 两行去重) / stuB / stuE / stuS，stuC 为 draft
    expect(examRow.aiPending).toBe(1);
    expect(examRow.reviewPending).toBe(1);            // stuA 有 submitted → 其 ai_graded 不重复计入 reviewPending
    expect(examRow.abnormal).toBe(1);

    const practiceRow = row(id.asgPractice, id.clsPub);
    expect(practiceRow.mode).toBe('practice');        // 字段保留：仅历史数据，不再驱动行为
    expect(practiceRow.aiPending).toBe(1);
    expect(practiceRow.reviewPending).toBe(1);        // R3-D4：不再恒 0（未发布对学生不可见 ⇒ 需审核）
    expect(practiceRow.aiCompleted).toBe(0);          // 该字段保留但恒 0（新口径下 AI 完成 ≠ 无需审核）

    const sharedRows = rows.filter(r => r.assignmentId === id.asgShared);
    expect(sharedRows.map(r => r.classId).sort()).toEqual([id.clsPub, id.clsPub2].sort());
    expect(sharedRows.every(r => r.reviewPending === 1)).toBe(true);
  });

  it('R3: classId 只在可见集合内收窄（不可见班级 → 全 0，而非报错或放行）', async () => {
    const pub = await get(tokenA, '/api/teacher/pending-summary?classId=' + id.clsPub);
    // asgExam 1 + asgPractice 1 + asgStuUnpub 1 + asgStuPractice 1 + asgShared 1（clsPub 行）= 5
    expect(pub.body.data).toMatchObject({ pendingReview: 5, aiPending: 2, abnormal: 1 });
    const pub2 = await get(tokenA, '/api/teacher/pending-summary?classId=' + id.clsPub2);
    expect(pub2.body.data).toMatchObject({ pendingReview: 1, aiPending: 0, abnormal: 0 });
    for (const cid of [id.clsHidden, id.clsOther, 99999999]) {
      const r = await get(tokenA, '/api/teacher/pending-summary?classId=' + cid);
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ pendingReview: 0, aiPending: 0, abnormal: 0 });
    }
  });

  it('R4: 毒数据注入后（A 不可见的同校隐藏班 + 跨校班）汇总与 baseline 完全一致', async () => {
    const res = await get(tokenA, '/api/teacher/pending-summary');
    // 若退化成全库计数：pendingReview 6（+clsHidden 1 +clsOther 1）/ aiPending 3（+1）/ abnormal 2（+1）
    expect(res.body.data).toMatchObject(base.psNoSchool);
    expect(Object.keys(base.psNoSchool).every(k => res.body.data[k] === base.psNoSchool[k])).toBe(true);
    const s1 = await get(tokenA, '/api/teacher/pending-summary?schoolId=' + id.s1);
    expect(s1.body.data).toMatchObject(base.psSchool1);
    expect(Object.keys(base.psSchool1).every(k => s1.body.data[k] === base.psSchool1[k])).toBe(true);
  });

  // ================= 2. 越权（提交列表） =================

  it('R5: /teacher/submissions 不传 schoolId/classId 严格限于 A 的可见班级', async () => {
    const res = await get(tokenA, '/api/teacher/submissions?pageSize=500');
    expect(res.body.code).toBe(0);
    const allowed = new Set(await prisma.studentClass.findMany({
      where: { classId: { in: [id.clsPub, id.clsPub2] } }, select: { studentId: true },
    }).then(rs => rs.map(r => r.studentId)));
    expect(res.body.data.total).toBe(base.subsTotal);
    expect(res.body.data.list.length).toBeGreaterThan(0);
    for (const s of res.body.data.list) {
      expect(allowed.has(s.student.id)).toBe(true);
    }
    // 毒数据（不可见班级学生的提交）一条都不许出现
    const ids = new Set(res.body.data.list.map(s => s.id));
    for (const pid of base.poisonSubmissionIds) expect(ids.has(pid)).toBe(false);
    expect(res.body.data.list.map(s => s.id).sort()).toEqual(base.subsIds);

    // classId 传入不可见班级 → 空集（fail-closed）
    const hidden = await get(tokenA, '/api/teacher/submissions?classId=' + id.clsHidden);
    expect(hidden.body.data.total).toBe(0);
    expect(hidden.body.data.list).toHaveLength(0);
    const other = await get(tokenA, '/api/teacher/submissions?classId=' + id.clsOther);
    expect(other.body.data.list).toHaveLength(0);
  });

  it('R6: 无任何可见班级的教师 → 空范围（汇总全 0 / 提交列表空），不退化为全库', async () => {
    const ps = await get(tokenZ, '/api/teacher/pending-summary');
    expect(ps.body.data).toMatchObject({ pendingReview: 0, aiPending: 0, abnormal: 0 });
    const subs = await get(tokenZ, '/api/teacher/submissions?pageSize=500');
    expect(subs.body.code).toBe(0);
    expect(subs.body.data.total).toBe(0);
    const visible = await getVisibleClassIds(id.tZ, null);
    expect(visible).toEqual([]);
  });

  // ================= 3. getVisibleClassIds schoolId 生效 =================

  it('R7: schoolId 生效（直连 + 团队两条来源都过滤），schoolId 为空 = 改造前行为', async () => {
    const s1Ids = await getVisibleClassIds(id.tX, id.s1);
    expect(s1Ids).toEqual([id.clsPub]);
    const s2Ids = await getVisibleClassIds(id.tX, id.s2);
    expect([...s2Ids].sort((a, b) => a - b)).toEqual([id.clsOther, id.clsTeam].sort((a, b) => a - b));
    // 字符串入参（controller 里 query 未转数字）
    expect(await getVisibleClassIds(id.tX, String(id.s1))).toEqual([id.clsPub]);
    // 无该类学校 → 空
    expect(await getVisibleClassIds(id.tA, id.s2)).toEqual([]);

    // schoolId 为空 = 改造前行为：在测试内复刻旧实现（teacherClass + teamClass 全量，不看 school）
    const oldImpl = async (teacherId) => {
      const direct = await prisma.teacherClass.findMany({ where: { teacherId }, select: { classId: true } });
      const teamIds = (await prisma.teamTeacher.findMany({ where: { teacherId }, select: { teamId: true } })).map(t => t.teamId);
      let teamClassIds = [];
      if (teamIds.length > 0) {
        teamClassIds = [...new Set((await prisma.teamClass.findMany({ where: { teamId: { in: teamIds } }, select: { classId: true } })).map(t => t.classId))];
      }
      return [...new Set([...direct.map(d => d.classId), ...teamClassIds])];
    };
    for (const tid of [id.tA, id.tX, id.tZ]) {
      const now = await getVisibleClassIds(tid, null);
      const legacy = await oldImpl(tid);
      expect([...now].sort((a, b) => a - b)).toEqual([...legacy].sort((a, b) => a - b));
      const undef = await getVisibleClassIds(tid, undefined);
      expect([...undef].sort((a, b) => a - b)).toEqual([...legacy].sort((a, b) => a - b));
    }
  });

  it('R8: 跨校教师 HTTP 侧 schoolId 生效（作业列表只返回该校班级的作业）', async () => {
    const inS1 = await get(tokenX, '/api/teacher/assignments?pageSize=100&schoolId=' + id.s1);
    const s1List = inS1.body.data.list.map(a => a.id);
    expect(s1List).toContain(id.asgExam);                // clsPub（S1）
    expect(s1List).not.toContain(id.asgPoisonOther);     // clsOther（S2）
    const inS2 = await get(tokenX, '/api/teacher/assignments?pageSize=100&schoolId=' + id.s2);
    const s2List = inS2.body.data.list.map(a => a.id);
    expect(s2List).toContain(id.asgPoisonOther);
    expect(s2List).not.toContain(id.asgExam);
    // 不传 schoolId → 两校可见班级的作业都在（既有语义）
    const all = await get(tokenX, '/api/teacher/assignments?pageSize=100');
    const allList = all.body.data.list.map(a => a.id);
    expect(allList).toContain(id.asgExam);
    expect(allList).toContain(id.asgPoisonOther);
  });

  // ================= 4. 作业列表字段正确性交叉核对 =================

  it('R9: expectedCount / submissionCount（对照旧实现）/ latestSubmittedAt 与独立复算一致', async () => {
    const res = await get(tokenA, '/api/teacher/assignments?pageSize=100');
    expect(res.body.code).toBe(0);
    const list = res.body.data.list;
    const ids = list.map(a => a.id);
    const oldCounts = await oldSubmissionCounts(ids);
    const expCounts = await expectedCountByAssignment(ids);
    const latest = await latestNonDraftByAssignment(ids);

    for (const a of list) {
      expect(a.submissionCount).toBe(oldCounts[a.id] || 0);
      expect(a.expectedCount).toBe(expCounts[a.id] || 0);
      const want = latest[a.id] ? new Date(latest[a.id]).toISOString() : null;
      expect(a.latestSubmittedAt).toBe(want);
      if (a.latestSubmittedAt !== null) expect(typeof a.latestSubmittedAt).toBe('string');
    }

    const byId = new Map(list.map(a => [a.id, a]));
    // asgExam：5 名学生；4 人非 draft（stuA/stuB/stuE/stuS）；待审核 1；最新 = T.t3（published 行）
    expect(byId.get(id.asgExam)).toMatchObject({ submissionCount: 4, expectedCount: 5, pendingReviewCount: 1, latestSubmittedAt: iso(D.t3) });
    expect(byId.get(id.asgPractice)).toMatchObject({ submissionCount: 2, expectedCount: 5, pendingReviewCount: 1, latestSubmittedAt: iso(D.t5) });
    // 跨班同生：分母 5 ∪ 2 = 6，分子去重 1，待审核按行 2
    expect(byId.get(id.asgShared)).toMatchObject({ submissionCount: 1, expectedCount: 6, pendingReviewCount: 2, latestSubmittedAt: iso(D.t6) });
    expect(byId.get(id.asgNoSub)).toMatchObject({ submissionCount: 0, expectedCount: 5, pendingReviewCount: 0, latestSubmittedAt: null });
    // 仅草稿行（且草稿行带 submittedAt 毒值）：一律为 0 / null
    expect(byId.get(id.asgDraftOnly)).toMatchObject({ submissionCount: 0, expectedCount: 5, pendingReviewCount: 0, latestSubmittedAt: null });

    // 毒数据作业不得出现在 A 的列表
    expect(ids).not.toContain(id.asgPoisonHidden);
    expect(ids).not.toContain(id.asgPoisonOther);
  });

  it('R10: 作业列表 pendingReviewCount 按可见班级统计，之和 = pending-summary（t4/R10 已收敛）', async () => {
    const list = (await get(tokenA, '/api/teacher/assignments?pageSize=100')).body.data.list;
    const sum = list.reduce((s, a) => s + a.pendingReviewCount, 0);
    const mixed = list.find(a => a.id === id.asgMixedVis);
    expect(mixed).toBeDefined();
    // t4/R10：待审核数只统计教师可见班级的行 → asgMixedVis 的 clsHidden 行（stuH 的 ai_graded）不再计入；
    // 该作业可见班 clsPub 的花名册无待审核行 → 0。expectedCount 仍是「全部关联班级」去重 = 5 + 3。
    expect(mixed.pendingReviewCount).toBe(0);
    expect(mixed.expectedCount).toBe(8);
    const ps = (await get(tokenA, '/api/teacher/pending-summary')).body.data;
    expect(sum).toBe(ps.pendingReview);   // 同口径：作业明细之和 == 侧栏徽标
  });

  // ================= 5. review-summary 题目数 =================

  it('R11: review-summary 每行 _count.assignmentQuestions = 该作业题目数', async () => {
    const rows = (await get(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1)).body.data;
    const aqCount = await prisma.assignmentQuestion.groupBy({ by: ['assignmentId'], where: { assignmentId: { in: rows.map(r => r.assignmentId) } }, _count: { questionId: true } });
    const want = new Map(aqCount.map(r => [r.assignmentId, r._count.questionId]));
    for (const r of rows) {
      expect(r._count).toBeDefined();
      expect(r._count.assignmentQuestions).toBe(want.get(r.assignmentId) || 0);
    }
    const row = (aId, cId) => rows.find(r => r.assignmentId === aId && r.classId === cId);
    expect(row(id.asgExam, id.clsPub)._count.assignmentQuestions).toBe(2);
    expect(row(id.asgShared, id.clsPub)._count.assignmentQuestions).toBe(1);
  });

  // ================= 6. 学生端可见性白名单 =================

  it('R12: 学生列表 5 字段（含未发布 finalScore=null）+ 响应体无 aiScore/aiFeedback 字段名', async () => {
    const res = await get(tokenStu, '/api/student/assignments?pageSize=100');
    expect(res.body.code).toBe(0);
    expect(res.headers['content-type']).toMatch(/json/);
    const keys = collectKeys(res.body);
    expect(keys.has('aiScore')).toBe(false);
    expect(keys.has('aiFeedback')).toBe(false);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('aiScore');
    expect(text).not.toContain('aiFeedback');
    expect(text).not.toContain(AI_SECRET);
    expect(text).not.toContain(PRACTICE_AI_SECRET);
    expect(text).not.toContain(EDGE_AI_SECRET);

    const byId = new Map(res.body.data.list.map(a => [a.id, a]));
    const unpub = byId.get(id.asgStuUnpub);
    expect(unpub).toMatchObject({ answeredCount: 1, finalScore: null, maxScore: 140, attemptCount: 2, submittedAt: iso(D.t1) });
    expect(Object.keys(unpub.submissions[0]).sort()).toEqual(['id', 'status']);
    expect(unpub.submissions.every(s => s.status !== 'draft' || typeof s.id === 'number')).toBe(true);
    expect(unpub.submissions.length).toBe(2);            // 含 draft 行（列表只下发 id/status）

    const pub = byId.get(id.asgStuPub);
    expect(pub).toMatchObject({ answeredCount: 2, finalScore: 70, maxScore: 140, attemptCount: 2, submittedAt: iso(D.t3) });
    const edge = byId.get(id.asgStuEdge);
    // t4/R14：published 但教师未定案分（finalScore=null）→ 列表与 /student/scores 统一取 finalScore ?? aiScore = 55
    expect(edge.finalScore).toBe(55);
    const practice = byId.get(id.asgStuPractice);
    // R3-D4（US-B5）：练习等价形态不再提前放分 —— 未发布一律 null（不计分）
    expect(practice.finalScore).toBeNull();
    // 未发布的 status 字段仍在（UI 需要），且不带任何分值
    expect(pub.submissions.every(s => Object.keys(s).sort().join(',') === 'id,status')).toBe(true);
  });

  it('R13: 学生详情白名单（published 不再整行下发；未发布一律 finalScore/teacherFeedback null）', async () => {
    const unpub = await get(tokenStu, '/api/student/assignments/' + id.asgStuUnpub);
    expect(unpub.body.code).toBe(0);
    const keysU = collectKeys(unpub.body);
    expect(keysU.has('aiScore')).toBe(false);
    expect(keysU.has('aiFeedback')).toBe(false);
    const textU = JSON.stringify(unpub.body);
    expect(textU).not.toContain(AI_SECRET);
    expect(textU).not.toContain('aiScore');
    expect(textU).not.toContain('aiFeedback');
    const gradedRow = unpub.body.data.submissions.find(s => s.status === 'ai_graded');
    expect(gradedRow).toBeDefined();
    expect(gradedRow.finalScore).toBeNull();
    expect(gradedRow.teacherFeedback).toBeNull();
    // 白名单字段集合（允许集合，不得出现 aiScore/aiFeedback/reviewedAt 等内部列）
    const allowed = ['answer', 'assignmentId', 'attemptCount', 'bestScore', 'finalScore', 'id', 'questionId', 'status', 'studentId', 'subQuestionId', 'submittedAt', 'teacherFeedback'];
    for (const k of Object.keys(gradedRow)) expect(allowed).toContain(k);
    // 未出分 → 参考答案被 strip（既有行为回归）
    expect(unpub.body.data.assignment.assignmentQuestions[0].question.subQuestions[0].referenceAnswer).toBeNull();

    const pub = await get(tokenStu, '/api/student/assignments/' + id.asgStuPub);
    const keysP = collectKeys(pub.body);
    expect(keysP.has('aiScore')).toBe(false);
    expect(keysP.has('aiFeedback')).toBe(false);
    expect(JSON.stringify(pub.body)).not.toContain(AI_SECRET);
    const pubRows = pub.body.data.submissions.filter(s => s.status === 'published');
    expect(pubRows).toHaveLength(2);
    expect(pubRows.map(s => s.finalScore).sort((a, b) => a - b)).toEqual([30, 40]);
    expect(pubRows.every(s => s.teacherFeedback === TEACHER_FB)).toBe(true);
    expect(pubRows.every(s => Object.keys(s).every(k => allowed.includes(k)))).toBe(true);

    const practice = await get(tokenStu, '/api/student/assignments/' + id.asgStuPractice);
    const p = practice.body.data.submissions[0];
    // R3-D4（US-B5）：练习等价形态未发布 ⇒ 分数/评语/AI 原文一律不下发
    expect(p.finalScore).toBeNull();
    expect(p.teacherFeedback).toBeNull();
    expect(JSON.stringify(practice.body)).not.toContain(PRACTICE_AI_SECRET);
    expect(collectKeys(practice.body).has('aiScore')).toBe(false);
  });

  it('R14: 列表 finalScore 与 /student/scores 的口径对照（边界观察项）', async () => {
    const scores = await get(tokenStu, '/api/student/scores');
    expect(scores.body.code).toBe(0);
    const byA = new Map(scores.body.data.map(s => [s.assignmentId, s]));
    expect(byA.has(id.asgStuUnpub)).toBe(false);              // 未发布不进成绩页
    expect(byA.get(id.asgStuPub).totalScore).toBe(70);
    // R3-D4（US-B5）：练习等价形态同样按「发布后可见」——未发布不进成绩页（原 practice 提前可见已移除）
    expect(byA.has(id.asgStuPractice)).toBe(false);
    // t4/R14：已发布但 finalScore=null（aiScore=55）→ 列表与 /student/scores 统一取 finalScore ?? aiScore = 55
    expect(byA.get(id.asgStuEdge).totalScore).toBe(55);
    const list = (await get(tokenStu, '/api/student/assignments?pageSize=100')).body.data.list;
    expect(list.find(a => a.id === id.asgStuEdge).finalScore).toBe(55);
  });

  // ================= 7. 曾登记为残留观察项：R16/R17 已由 t4 修复，本文件断言同步更新为「修复后契约」 =================

  it('R16（t4 修复）: review-summary 的 classId 与可见集合求交——不可见 → 空集', async () => {
    // t4 前：classWhere.id = +classId 直接覆盖了 id:{in:visibleIds}，A 传同校不可见 classId 仍能拿到该班汇总行。
    const hidden = await get(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1 + '&classId=' + id.clsHidden);
    expect(hidden.body.code).toBe(0);
    expect(hidden.body.data).toEqual([]);      // fail-closed：不得返回同校不可见班级的汇总行
    // 对照：可见 classId 仍正常返回该班行
    const pub = await get(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1 + '&classId=' + id.clsPub);
    expect(pub.body.data.length).toBeGreaterThan(0);
    expect(pub.body.data.every(r => r.classId === id.clsPub)).toBe(true);
    // 同一 classId 在另外两个已收敛的入口同样是 fail-closed
    const ps = await get(tokenA, '/api/teacher/pending-summary?schoolId=' + id.s1 + '&classId=' + id.clsHidden);
    expect(ps.body.data).toMatchObject({ pendingReview: 0, aiPending: 0, abnormal: 0 });
    const subs = await get(tokenA, '/api/teacher/submissions?classId=' + id.clsHidden);
    expect(subs.body.data.total).toBe(0);
  });

  it('R17（t4 修复）: GET /teacher/submissions/:id 归属校验——不可见提交被拒且不含题目/答案内容', async () => {
    const hiddenSubId = base.poisonSubmissionIds[0];   // clsHidden 学生的提交（A 不可见）
    const res = await get(tokenA, '/api/teacher/submissions/' + hiddenSubId);
    // t4：失败响应只含 code/message/data:null，绝不下发题目、答案、评分等任何内容
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    expect(res.body.data).toBeNull();
    const keys = collectKeys(res.body);
    for (const key of ['referenceAnswer', 'scoringCriteria', 'objectiveItems', 'subQuestions', 'answer', 'allSubmissions', 'question', 'student']) {
      expect(keys.has(key)).toBe(false);
    }
    // 回归：本人可见提交仍然正常返回
    const own = await prisma.submission.findFirst({ where: { studentId: id.stuB, status: 'ai_graded' } });
    expect(own).toBeTruthy();
    const ok = await get(tokenA, '/api/teacher/submissions/' + own.id);
    expect(ok.status).toBe(200);
    expect(ok.body.code).toBe(0);
    expect(ok.body.data.id).toBe(own.id);
  });

  it('R15: 学生列表 keyword 按 title 生效，且只含本人提交行', async () => {
    const hit = await get(tokenStu, '/api/student/assignments?pageSize=100&keyword=' + encodeURIComponent('学生-已发布exam'));
    expect(hit.body.data.total).toBe(1);
    expect(hit.body.data.list[0].id).toBe(id.asgStuPub);
    const miss = await get(tokenStu, '/api/student/assignments?pageSize=100&keyword=' + encodeURIComponent('不存在的关键字xyz'));
    expect(miss.body.data.total).toBe(0);

    const all = await get(tokenStu, '/api/student/assignments?pageSize=100');
    const mySubIds = new Set((await prisma.submission.findMany({ where: { studentId: id.stuS }, select: { id: true } })).map(s => s.id));
    for (const a of all.body.data.list) for (const s of a.submissions) expect(mySubIds.has(s.id)).toBe(true);
  });
});
