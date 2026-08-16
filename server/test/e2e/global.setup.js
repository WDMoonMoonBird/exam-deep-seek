import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:3000/api';

async function post(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}

async function get(url, token) {
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch(`${API}${url}`, { headers });
  return res.json();
}

export default async function () {
  // 1. 管理员登录（服务启动时自动创建 admin/***REDACTED***）
  const adminLogin = await post('/auth/login', { username: 'admin', password: '***REDACTED***' });
  const adminToken = adminLogin.data?.token;
  if (!adminToken) throw new Error('Admin login failed: ' + JSON.stringify(adminLogin));
  console.log('E2E setup: admin logged in');

  // 2. 学校：admin 仅可读学校列表（无 POST /schools 端点），复用库中第一个学校，
  //    并把实际名称写入 state 供 spec 动态引用（严禁 spec 硬编码学校名）。
  let schools = await get('/admin/schools', adminToken);
  let schoolId = schools.data?.[0]?.id;
  const schoolName = schools.data?.[0]?.name || '';
  if (!schoolId) throw new Error('E2E setup: 库中无学校，无法继续（admin 不可创建学校，需先以 jest seed 建学校）');
  // 确保学校有 officialCode
  const school = schools.data?.find(s => s.id === schoolId);
  if (school && !school.officialCode) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.school.update({ where: { id: schoolId }, data: { officialCode: '20001' } });
    await prisma.$disconnect();
    console.log('E2E setup: school officialCode set to 20001');
  }

  // 3. 确保教师存在
  let teacherToken;
  const teacherLogin = await post('/auth/login', { username: 'e2e_teacher', password: 'e2e_teacher' });
  if (teacherLogin.code === 0) {
    teacherToken = teacherLogin.data.token;
  } else {
    await post('/admin/teachers', { username: 'e2e_teacher', realName: 'E2E教师', schoolIds: [schoolId] }, adminToken);
    const login = await post('/auth/login', { username: 'e2e_teacher', password: 'e2e_teacher' });
    teacherToken = login.data.token;
  }
  console.log('E2E setup: teacher ready');

  // 4. 确保班级存在（固定名 E2E测试班）
  let classes = await get(`/teacher/classes?schoolId=${schoolId}`, teacherToken);
  let classId = classes.data?.find((c) => c.name === 'E2E测试班')?.id;
  if (!classId) {
    // createClass 从 req.query.schoolId 取值（teacherController.js:13 getSchoolId），必须带 query
    const c = await post(`/teacher/classes?schoolId=${schoolId}`, { name: 'E2E测试班' }, teacherToken);
    classId = c.data?.id;
  }

  // 5. 确保学生存在
  let students = await get(`/teacher/students?schoolId=${schoolId}&classId=${classId}`, teacherToken);
  let studentUsername;
  if (!students.data?.length) {
    await post('/teacher/students', { username: 'e2e_stu_01', realName: 'E2E学生甲', classId }, teacherToken);
    await post('/teacher/students', { username: 'e2e_stu_02', realName: 'E2E学生乙', classId }, teacherToken);
    studentUsername = 'e2e_stu_01';
  } else {
    studentUsername = students.data[0].username;
  }
  console.log('E2E setup: student =', studentUsername);

  // 6. 创建题目
  const q = await post('/teacher/questions', {
    title: 'E2E测试题',
    maxScore: 100,
    difficulty: 'easy',
    subQuestions: [
      { title: '第1小题', content: '<p>写出 Hello World</p>', referenceAnswer: 'print("Hello")', language: 'python' },
    ],
  }, teacherToken);
  const questionId = q.data?.id;

  // 7. 创建作业
  const a = await post('/teacher/assignments', {
    title: 'E2E测试作业',
    startTime: new Date(Date.now() - 864e5).toISOString(),
    endTime: new Date(Date.now() + 864e5 * 30).toISOString(),
    questionIds: [questionId],
    classIds: [classId],
  }, teacherToken);
  const assignmentId = a.data?.id;

  // 学生密码 = 学号（@ 前部分），而非完整用户名（用户名含 @学校代码）
  const studentPassword = studentUsername.includes('@') ? studentUsername.split('@')[0] : studentUsername;
  const state = {
    admin: { username: 'admin', password: '***REDACTED***' },
    teacher: { username: 'e2e_teacher', password: 'e2e_teacher' },
    student: { username: studentUsername, password: studentPassword },
    schoolId, schoolName, classId, questionId, assignmentId,
  };

  fs.writeFileSync(path.join(__dirname, '.e2e-state.json'), JSON.stringify(state, null, 2));
  console.log('E2E setup done:', JSON.stringify(state));
}
