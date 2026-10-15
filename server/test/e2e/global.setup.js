import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureAdminAccount } from '../fixtures/admin.js';
import { E2E_API_BASE } from './e2e-env.js';
import { E2E_TEACHER, E2E_STUDENT_PASSWORD, ensureLoginable } from './e2e-accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ★W1-C6：API 基址随端口可配置（默认 3000 不变）——否则全局 setup 会死打 3000，而 webServer 可能跑在备用端口
const API = E2E_API_BASE;

// 与 playwright.config.js 的 webServer 保持**同一个测试库**：
// 该进程不继承 webServer 的内联 DATABASE_URL，缺省从 server/.env 派生 /exam_system_test，
// 否则夹具会把测试管理员建到开发库（exam_system）而服务端连的是测试库 ⇒ 登录必失败。
if (!process.env.DATABASE_URL) {
  const m = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
  if (m) {
    const u = new URL(m[1].trim());
    u.pathname = '/exam_system_test';
    process.env.DATABASE_URL = u.toString();
  }
}

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

async function put(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${url}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  return res.json();
}

/** 统一请求适配器：供 e2e-accounts.ensureLoginable 复用（它需要 (method,url,body,token) 形态） */
const request = (method, url, body, token) => (method === 'GET' ? get(url, token) : method === 'PUT' ? put(url, body, token) : post(url, body, token));

export default async function () {
  // 1. 管理员登录（W0-C 夹具：环境变量优先，缺省自建/复用专用测试管理员；
  //    不再依赖 C1 已移除的「启动期默认超管」）
  const adminCreds = await ensureAdminAccount();
  const adminLogin = await post('/auth/login', { username: adminCreds.username, password: adminCreds.password });
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

  // 3. 确保教师存在且**可用已知口令登录**
  //    ★W2-C15（H6）：经 API 建号返回的是**一次性随机临时口令**，且首登被强制改密闸门拦住
  //    ⇒ 必须走「建号/重置 → 临时口令登录 → 首登改密 → 已知口令重登」。严禁再按「口令=用户名」取。
  const teacherReady = await ensureLoginable({
    request, kind: 'teacher', username: E2E_TEACHER.username, password: E2E_TEACHER.password,
    adminToken, schoolId, realName: 'E2E教师',
  });
  const teacherToken = teacherReady.token;
  console.log('E2E setup: teacher ready（' + (teacherReady.viaChange ? '走了 H6 首登改密流程' : '已知口令直登') + '）');

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
  let studentId;
  if (!students.data?.length) {
    const s1 = await post('/teacher/students', { username: 'e2e_stu_01', realName: 'E2E学生甲', classId }, teacherToken);
    studentId = s1.data?.id;
    await post('/teacher/students', { username: 'e2e_stu_02', realName: 'E2E学生乙', classId }, teacherToken);
    studentUsername = 'e2e_stu_01';
  } else {
    studentUsername = students.data[0].username;
    studentId = students.data[0].id;
  }
  console.log('E2E setup: student =', studentUsername);
  // ★W2-C15（H6）：学生同样必须走「临时口令 → 首登改密 → 已知口令」，否则登录后会被闸门拦 403/1005
  const studentLoginName = studentUsername.includes('@') ? studentUsername.split('@')[0] : studentUsername;
  await ensureLoginable({
    request, kind: 'student', username: studentLoginName, password: E2E_STUDENT_PASSWORD,
    teacherToken, schoolId, classId, userId: studentId, realName: 'E2E学生',
  });

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

  // ★W2-C15（H6）：口令一律取**首登改密后的已知口令**（旧语义「口令 = 学号/用户名」已随 H6 移除，不得恢复）
  const state = {
    admin: { username: adminCreds.username, password: adminCreds.password },
    teacher: { username: E2E_TEACHER.username, password: E2E_TEACHER.password },
    student: { username: studentUsername, password: E2E_STUDENT_PASSWORD },
    schoolId, schoolName, classId, questionId, assignmentId,
  };

  fs.writeFileSync(path.join(__dirname, '.e2e-state.json'), JSON.stringify(state, null, 2));
  console.log('E2E setup done:', JSON.stringify(state));
}
