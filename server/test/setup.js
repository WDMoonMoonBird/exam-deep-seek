// 避免与已运行的服务端端口冲突
process.env.PORT = '0';

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/utils/prisma.js';

/**
 * 从数据库连接串中解析出「库名」（URL pathname，去掉前导斜杠与 query）。
 *
 * 必须只取库名参与安全判定：若对整条连接串做子串匹配，密码或主机名里
 * 恰好含 'test'（如 password=Test@2024、host=test-db.internal）就会让指向
 * 生产库的清理逻辑被放行——这正是护栏要防的事故类型。
 *
 * 解析失败（空值/非法 URL/密码含裸 '@' 等）一律返回空串，
 * 由调用方按 fail-closed 处理（拒绝执行），绝不因解析不出而放行。
 *
 * @param {string} url 原始连接串
 * @returns {string} 库名；无法解析时为空串
 */
function pickDbName(url) {
  try {
    return decodeURIComponent(new URL(String(url)).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

/**
 * 允许执行测试数据清理与 seed 的测试库名白名单（精确匹配【库名】，大小写不敏感）。
 * 新增测试库时必须先在这里登记，严禁放宽成子串匹配——
 * 否则密码/主机名里恰好含 'test'（如 password=Test@2024、host=test-db.internal）
 * 的库也会被放行，这正是护栏要防的事故类型。
 */
const TEST_DB_NAMES = ['exam_system_test'];

/**
 * 破坏性操作前置护栏：只允许对「测试库」执行测试数据清理与 seed。
 *
 * 判定规则：DATABASE_URL 解析出的【库名】必须精确命中 TEST_DB_NAMES 白名单。
 * 不满足则打印醒目警告并以退出码 1 中止进程，绝不继续往下执行。
 * 库名解析不出时同样拒绝（fail-closed）。
 *
 * 背景：seedTestData() 会按 username 前缀（test_/batch_/tmp_）以及
 * `username contains '@10001'` 批量 deleteMany 学生及其 submission。
 * '@10001' 是「学号@院校代码」格式的真实用户名片段，若本文件运行在
 * 生产/开发主库上，会连带删除院校代码为 10001 的全部真实学生与提交
 * （参见 2026-08-03 数据删除事故）。因此运行前必须确认数据源是测试库。
 *
 * @returns {void}
 */
function assertSafeToWipe() {
  const url = process.env.DATABASE_URL || '';
  const dbName = pickDbName(url);
  if (!TEST_DB_NAMES.includes(dbName.trim().toLowerCase())) {
    console.error('');
    console.error('==================================================');
    console.error('⛔ 拒绝执行：DATABASE_URL 库名不在测试库白名单内，疑似生产/重要库，已中止');
    console.error('==================================================');
    console.error('   test/setup.js 会批量删除学生/提交/作业/班级等数据，');
    console.error(`   仅允许在以下测试库上运行：${TEST_DB_NAMES.join('、')}`);
    console.error('   （精确匹配库名：密码/主机名里含 "test" 不算数）。');
    console.error(`   当前 DATABASE_URL: ${url ? maskDbUrl(url) : '(未设置)'}`);
    console.error(`   解析到的库名: ${dbName || '(无法解析)'}`);
    console.error('   解决办法：创建独立测试库并登记到 TEST_DB_NAMES 后在运行测试时指定，例如');
    console.error('     DATABASE_URL="mysql://user:pass@localhost:3306/exam_system_test" npm test');
    console.error('');
    process.exit(1);
  }
}

/**
 * 打码数据库连接串中的密码，避免凭据出现在日志/终端输出中。
 *
 * @param {string} url 原始连接串
 * @returns {string} 已打码的连接串
 */
function maskDbUrl(url) {
  return String(url).replace(/(:\/\/[^:/?#]+):[^@]*@/, '$1:***@');
}

// 护栏：任何破坏性行为之前先校验数据源安全
assertSafeToWipe();

// 只 seed 一次
const KEY = Symbol.for('testSeededV3');
if (!global[KEY]) {
  global[KEY] = true;
  await seedTestData();
}

/**
 * ★R2-B19：清理**孤儿判分行**（`assignment_id` 指向的作业已不存在）。
 * 为什么：孤儿 running 行会占满 DB 级闸（limit=1）⇒ 所有 worker 系套件集体 `consumed=false` 假失败（t66 实测 12 个套件）。
 * 边界（不删成品数据）：只删除「外键目标已不存在」的行；**任何 assignment 仍存在的 job/checker/锚点一行都不动**。
 */
export async function cleanupOrphanGradingRows(prisma, log = console) {
  const del = async (sql) => { try { return Number(await prisma.$executeRawUnsafe(sql)); } catch { return 0; } };
  const jobs = await del('DELETE FROM grading_jobs WHERE assignment_id NOT IN (SELECT id FROM assignments)');
  const checkers = await del('DELETE FROM grading_checkers WHERE assignment_id NOT IN (SELECT id FROM assignments)');
  const anchors = await del('DELETE FROM grading_assignment_anchors WHERE assignment_id NOT IN (SELECT id FROM assignments)');
  // ★R2-B35：绑定表按「assignment 是否仍存在」判孤儿。grading_rulers 是**按内容指纹的全局资产**
  //   （跨班/跨教师共享，命中即零 LLM）⇒ **不随绑定消失而删**，否则会连带毁掉仍被其他作业复用的尺子。
  const bindings = await del('DELETE FROM assignment_question_rulers WHERE assignment_id NOT IN (SELECT id FROM assignments)');
  if (jobs || checkers || anchors || bindings) log.log('ORPHAN_GRADING_CLEANUP jobs=' + jobs + ' checkers=' + checkers + ' anchors=' + anchors + ' bindings=' + bindings);
  return { jobs, checkers, anchors, bindings };
}

export async function seedTestData() {
  // 二次校验：seed 前置清理为破坏性操作，防止调用方绕过入口直接调用
  assertSafeToWipe();
  // ★R2-B19：先清孤儿判分行（避免下一轮 worker 系套件集体假失败）
  await cleanupOrphanGradingRows(prisma);

  // ===== 1. 彻底清理所有测试数据 =====
  const testTeacher = await prisma.user.findFirst({ where: { username: 'test_teacher' } });

  if (testTeacher) {
    // 清理团队数据
    await prisma.teamTeacher.deleteMany({ where: { teacher: { username: { startsWith: 'test_' } } } });
    await prisma.teamClass.deleteMany({ where: { team: { school: { name: 'test_university' } } } });
    await prisma.team.deleteMany({ where: { school: { name: 'test_university' } } });

    // ==== R2-B15：按 FK 依赖序彻底清理该教师名下的数据 ====
    // 依据：information_schema.KEY_COLUMN_USAGE（测试库实测）；顺序 = 子表先于父表，否则 user.delete 会 FK 失败
    // （t56 亲历：遗留行让下一轮 seed 整批 0 例失败）。
    // ① 项目域：project_submissions/submission_files/project_files/project_classes → projects（projects.teacher_id → users.id）
    const projects = await prisma.project.findMany({ where: { teacherId: testTeacher.id }, select: { id: true } });
    const projectIds = projects.map(p => p.id);
    if (projectIds.length) {
      const projSubs = await prisma.projectSubmission.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
      const projSubIds = projSubs.map(s => s.id);
      if (projSubIds.length) await prisma.submissionFile.deleteMany({ where: { submissionId: { in: projSubIds } } });
      await prisma.projectSubmission.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.projectFile.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.projectClass.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    // ② 该教师创建的团队（teams.created_by → users.id；先前只按学校名删，可能漏）
    await prisma.team.deleteMany({ where: { createdBy: testTeacher.id } });

    // ③ 作业域：submission → assignment_classes/assignment_questions → assignments（assignments.teacher_id → users.id）
    const assignments = await prisma.assignment.findMany({ where: { teacherId: testTeacher.id }, select: { id: true } });
    const assignmentIds = assignments.map(a => a.id);
    if (assignmentIds.length) {
      await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await prisma.assignmentClass.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    }
    await prisma.assignment.deleteMany({ where: { teacherId: testTeacher.id } });

    // ④ 题域：sub_questions → assignment_questions/submissions（按 questionId）→ questions（questions.teacher_id → users.id）
    await prisma.subQuestion.deleteMany({ where: { question: { teacherId: testTeacher.id } } });
    await prisma.assignmentQuestion.deleteMany({ where: { question: { teacherId: testTeacher.id } } });
    await prisma.submission.deleteMany({ where: { question: { teacherId: testTeacher.id } } });
    await prisma.question.deleteMany({ where: { teacherId: testTeacher.id } });
  }

  // 清理测试学生（包括 test_*, batch_*, tmp_* 等）
  const testStudents = await prisma.user.findMany({
    where: {
      role: 'student',
      OR: [
        { username: { startsWith: 'test_' } },
        { username: { startsWith: 'batch_' } },
        { username: { startsWith: 'tmp_' } },
        { username: { contains: '@10001' } },
      ],
    },
    select: { id: true },
  });
  for (const s of testStudents) {
    // R2-B15：同一 FK 缺口也存在于学生侧 —— 先清 project_submissions（含其 submission_files）再删用户，
    // 否则 project_submissions.student_id → users.id 会挡住 user.delete。
    const psubs = await prisma.projectSubmission.findMany({ where: { studentId: s.id }, select: { id: true } });
    const psubIds = psubs.map(p => p.id);
    if (psubIds.length) await prisma.submissionFile.deleteMany({ where: { submissionId: { in: psubIds } } });
    await prisma.projectSubmission.deleteMany({ where: { studentId: s.id } });
    await prisma.submission.deleteMany({ where: { studentId: s.id } });
    await prisma.studentClass.deleteMany({ where: { studentId: s.id } });
    await prisma.user.delete({ where: { id: s.id } });
  }

  // 清理测试教师
  if (testTeacher) {
    await prisma.teacherClass.deleteMany({ where: { teacherId: testTeacher.id } });
    await prisma.teacherSchool.deleteMany({ where: { teacherId: testTeacher.id } });
    await prisma.user.delete({ where: { id: testTeacher.id } });
  }

  // 清理测试班级
  const testClasses = await prisma.class.findMany({
    where: { name: { startsWith: 'test_' } },
    select: { id: true },
  });
  for (const c of testClasses) {
    await prisma.studentClass.deleteMany({ where: { classId: c.id } });
    await prisma.teacherClass.deleteMany({ where: { classId: c.id } });
    await prisma.assignmentClass.deleteMany({ where: { classId: c.id } });
    await prisma.teamClass.deleteMany({ where: { classId: c.id } });
    await prisma.class.delete({ where: { id: c.id } });
  }

  // 清理多学校测试数据
  await prisma.teacherSchool.deleteMany({ where: { school: { officialCode: '99999' } } });
  await prisma.teacherClass.deleteMany({ where: { class: { name: 'test_class_multi' } } });
  await prisma.studentClass.deleteMany({ where: { class: { name: 'test_class_multi' } } });
  await prisma.class.deleteMany({ where: { name: 'test_class_multi' } });
  await prisma.school.deleteMany({ where: { officialCode: '99999' } });

  // ===== 2. 创建测试数据 =====
  // 学校（含院校代码）
  let school = await prisma.school.findFirst({ where: { name: 'test_university' } });
  if (!school) {
    school = await prisma.school.create({ data: { name: 'test_university', officialCode: '10001' } });
  } else if (!school.officialCode) {
    school = await prisma.school.update({ where: { id: school.id }, data: { officialCode: '10001' } });
  }

  // 班级
  const cls = await prisma.class.create({ data: { name: 'test_class', schoolId: school.id } });

  // 教师（密码正确 hash）
  const teacher = await prisma.user.create({
    data: { username: 'test_teacher', password: bcrypt.hashSync('test_teacher', 10), realName: '测试教师', role: 'teacher' },
  });
  await prisma.teacherSchool.create({ data: { teacherId: teacher.id, schoolId: school.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: cls.id } });

  // 学生 × 3（username = 学号@院校代码）
  await prisma.user.createMany({
    data: [
      { username: 'test_stu_01@10001', password: bcrypt.hashSync('test_stu_01', 10), realName: '学生甲', role: 'student' },
      { username: 'test_stu_02@10001', password: bcrypt.hashSync('test_stu_02', 10), realName: '学生乙', role: 'student' },
      { username: 'test_stu_03@10001', password: bcrypt.hashSync('test_stu_03', 10), realName: '学生丙', role: 'student' },
    ],
  });
  const students = await prisma.user.findMany({
    where: { username: { in: ['test_stu_01@10001', 'test_stu_02@10001', 'test_stu_03@10001'] } },
    orderBy: { username: 'asc' },
  });
  for (const s of students) {
    await prisma.studentClass.create({ data: { studentId: s.id, classId: cls.id } });
  }

  // 题目（3 小题）
  const question = await prisma.question.create({
    data: {
      teacherId: teacher.id,
      title: '测试题',
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: {
        create: [
          { sortOrder: 1, title: '小题1', score: 30, content: '<p>题目1</p>', referenceAnswer: 'print(1)', language: 'python' },
          { sortOrder: 2, title: '小题2', score: 30, content: '<p>题目2</p>', referenceAnswer: 'print(2)', language: 'python' },
          { sortOrder: 3, title: '小题3', score: 40, content: '<p>题目3</p>', referenceAnswer: 'print(3)', language: 'python' },
        ],
      },
    },
  });

  // 作业
  const assignment = await prisma.assignment.create({
    data: {
      teacherId: teacher.id,
      title: '测试作业',
      startTime: new Date('2026-01-01'),
      endTime: new Date('2027-01-01'),
      assignmentQuestions: { create: { questionId: question.id, sortOrder: 1 } },
      assignmentClasses: { create: { classId: cls.id } },
    },
  });

  // 提交数据
  const now = new Date();
  await prisma.submission.createMany({
    data: [
      { assignmentId: assignment.id, studentId: students[0].id, questionId: question.id, answer: 'print(1)', status: 'ai_graded', aiScore: 25, aiFeedback: '很好', submittedAt: now },
      { assignmentId: assignment.id, studentId: students[1].id, questionId: question.id, answer: 'print(2)', status: 'submitted', submittedAt: now },
      { assignmentId: assignment.id, studentId: students[2].id, questionId: question.id, answer: '', status: 'draft' },
    ],
  });

  global.__testData = {
    schoolId: school.id,
    schoolCode: '10001',
    classId: cls.id,
    teacherId: teacher.id,
    studentIds: students.map(s => s.id),
    studentUsers: students.map(s => s.username),
    questionId: question.id,
    assignmentId: assignment.id,
  };

  console.log('Test data seeded:', JSON.stringify(global.__testData));
}
