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

  // 2. 确保学校存在
  let schools = await get('/admin/schools', adminToken);
  let schoolId = schools.data?.[0]?.id;
  if (!schoolId) {
    const s = await post('/admin/schools', { name: 'E2E测试大学' }, adminToken);
    schoolId = s.data?.id;
  }
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

  // 4. 确保班级存在
  let classes = await get(`/teacher/classes?schoolId=${schoolId}`, teacherToken);
  let classId = classes.data?.[0]?.id;
  if (!classId) {
    const c = await post('/teacher/classes', { name: 'E2E测试班' }, teacherToken);
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

  const state = {
    teacher: { username: 'e2e_teacher', password: 'e2e_teacher' },
    student: { username: studentUsername, password: studentUsername },
    schoolId, classId, questionId, assignmentId,
  };

  fs.writeFileSync(path.join(__dirname, '.e2e-state.json'), JSON.stringify(state, null, 2));
  console.log('E2E setup done:', JSON.stringify(state));
}
