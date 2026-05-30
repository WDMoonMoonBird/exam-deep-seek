// 避免与已运行的服务端端口冲突
process.env.PORT = '0';

import prisma from '../src/utils/prisma.js';

// 只 seed 一次
const KEY = Symbol.for('testSeededV2');
if (!global[KEY]) {
  global[KEY] = true;
  await seedTestData();
}

async function seedTestData() {
  // ===== 1. 彻底清理所有测试数据 =====
  // 按 FK 依赖顺序删除
  const testTeacher = await prisma.user.findFirst({ where: { username: 'test_teacher' } });

  if (testTeacher) {
    // 清理团队数据
    await prisma.teamTeacher.deleteMany({ where: { teacher: { username: { startsWith: 'test_' } } } });
    await prisma.teamClass.deleteMany({ where: { team: { school: { name: 'test_university' } } } });
    await prisma.team.deleteMany({ where: { school: { name: 'test_university' } } });

    // 删除该教师的所有作业的提交
    const assignments = await prisma.assignment.findMany({ where: { teacherId: testTeacher.id }, select: { id: true } });
    const assignmentIds = assignments.map(a => a.id);
    if (assignmentIds.length) {
      await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await prisma.assignmentClass.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    }
    await prisma.assignment.deleteMany({ where: { teacherId: testTeacher.id } });
    await prisma.subQuestion.deleteMany({ where: { question: { teacherId: testTeacher.id } } });
    await prisma.question.deleteMany({ where: { teacherId: testTeacher.id } });
  }

  // 清理测试学生（包括 test_*, batch_* 等）
  const testStudents = await prisma.user.findMany({
    where: { role: 'student', OR: [{ username: { startsWith: 'test_' } }, { username: { startsWith: 'batch_' } }] },
    select: { id: true },
  });
  for (const s of testStudents) {
    await prisma.submission.deleteMany({ where: { studentId: s.id } });
    await prisma.studentClass.deleteMany({ where: { studentId: s.id } });
    await prisma.user.delete({ where: { id: s.id } });
  }

  // 清理教师
  if (testTeacher) {
    await prisma.teacherClass.deleteMany({ where: { teacherId: testTeacher.id } });
    await prisma.teacherSchool.deleteMany({ where: { teacherId: testTeacher.id } });
    await prisma.user.delete({ where: { id: testTeacher.id } });
  }

  // 清理测试班级（先删关联）
  const testClass = await prisma.class.findFirst({ where: { name: 'test_class' } });
  if (testClass) {
    await prisma.studentClass.deleteMany({ where: { classId: testClass.id } });
    await prisma.teacherClass.deleteMany({ where: { classId: testClass.id } });
    await prisma.assignmentClass.deleteMany({ where: { classId: testClass.id } });
    await prisma.class.delete({ where: { id: testClass.id } });
  }

  // ===== 2. 创建测试数据 =====
  // 学校（如果不存在则创建）
  let school = await prisma.school.findFirst({ where: { name: 'test_university' } });
  if (!school) {
    school = await prisma.school.create({ data: { name: 'test_university' } });
  }

  // 班级
  const cls = await prisma.class.create({ data: { name: 'test_class', schoolId: school.id } });

  // 教师
  const teacher = await prisma.user.create({
    data: { username: 'test_teacher', password: 'test_teacher', realName: '测试教师', role: 'teacher' },
  });
  await prisma.teacherSchool.create({ data: { teacherId: teacher.id, schoolId: school.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: cls.id } });

  // 学生 × 3
  await prisma.user.createMany({
    data: [
      { username: 'test_stu_01', password: 'test_stu_01', realName: '学生甲', role: 'student' },
      { username: 'test_stu_02', password: 'test_stu_02', realName: '学生乙', role: 'student' },
      { username: 'test_stu_03', password: 'test_stu_03', realName: '学生丙', role: 'student' },
    ],
  });
  const students = await prisma.user.findMany({
    where: { username: { in: ['test_stu_01', 'test_stu_02', 'test_stu_03'] } },
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
    classId: cls.id,
    teacherId: teacher.id,
    studentIds: students.map(s => s.id),
    questionId: question.id,
    assignmentId: assignment.id,
  };

  console.log('Test data seeded:', JSON.stringify(global.__testData));
}
