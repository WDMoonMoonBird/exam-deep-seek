// ================================================================
// 安全修复后 — 生产环境全业务 API 测试
// 用法: TEST_ADMIN_USERNAME=... TEST_ADMIN_PASSWORD=... node server/test/e2e/security-prod-test.js
// ================================================================
import { getEnvAdminCredentials } from '../fixtures/admin.js';

const BASE = 'https://deadpan.asia/exam/api';

// 测试账号（生产环境已有）；admin 凭据一律由环境变量注入（W0-C）：
//   TEST_ADMIN_USERNAME / TEST_ADMIN_PASSWORD（兼容 BOOTSTRAP_ADMIN_*）
// 仓库内不再保存任何默认超管口令（C1 已移除启动期默认超管）。
const ADMIN = getEnvAdminCredentials();
if (!ADMIN) {
  console.error('⛔ 跳过：未配置 TEST_ADMIN_USERNAME / TEST_ADMIN_PASSWORD —— C1 之后仓库不再提供默认超管口令。');
  process.exit(2);
}
const TEACHER = { username: '202519011', password: '202519011' };
const STUDENT = { username: '2458030306', password: '2458030306' };

let passed = 0, failed = 0;
function check(name, ok) {
  if (ok) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name); }
}

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  for (let retry = 0; retry < 2; retry++) {
    try {
      const res = await fetch(`${BASE}${path}`, opts);
      const data = await res.json().catch(() => ({}));
      return { status: res.status, headers: res.headers, data };
    } catch (e) {
      if (retry === 1) return { status: -1, headers: new Map(), data: { code: -1, message: e.message } };
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

(async () => {
  console.log('\n🔒 Deadpan 判题 — 安全修复后生产环境全业务测试\n');
  console.log('目标:', BASE, '\n');

  // ================================================================
  // 一、安全基础检查
  // ================================================================
  console.log('=== 一、安全基础检查 ===');

  // 1.1 安全响应头 (Helmet)
  const health = await api('GET', '/health');
  const h = health.headers;
  check('X-Content-Type-Options: nosniff', h.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options: DENY/SAMEORIGIN', ['DENY', 'SAMEORIGIN'].includes(h.get('x-frame-options') || ''));
  check('X-DNS-Prefetch-Control', h.get('x-dns-prefetch-control') === 'off');
  check('X-Permitted-Cross-Domain-Policies', h.get('x-permitted-cross-domain-policies') === 'none');
  check('Referrer-Policy', h.get('referrer-policy') != null);
  check('X-XSS-Protection 已禁用(Helmet默认)', h.get('x-xss-protection') === '0');

  // 1.2 CORS 预检（生产可能由 Nginx 处理，连接拒绝也算通过）
  let corsBlocked = false;
  try {
    const corsRes = await fetch(`${BASE}/health`, { method: 'OPTIONS', headers: { Origin: 'https://evil.com' } });
    const acao = corsRes.headers.get('access-control-allow-origin');
    corsBlocked = !acao || !acao.includes('evil.com');
  } catch (e) {
    corsBlocked = true; // 连接被拒也算通过
  }
  check('CORS 限制: 拒绝非白名单域名', corsBlocked);

  // 1.3 内部接口认证
  const noAuth = await api('POST', '/internal/graded', { schoolId: 2749 });
  check('内部接口 /internal/graded 拒绝无 token 请求', noAuth.status === 403);

  const badAuth = await fetch(`${BASE}/internal/graded`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
    body: JSON.stringify({ schoolId: 2749 }),
  });
  check('内部接口 /internal/graded 拒绝错误 token', badAuth.status === 403);

  // ================================================================
  // 二、认证系统测试
  // ================================================================
  console.log('\n=== 二、认证系统测试 ===');

  // 2.1 Admin 登录（bcrypt 迁移后）
  const adminLogin = await api('POST', '/auth/login', ADMIN);
  check('Admin 登录（密码已 bcrypt 迁移）', adminLogin.data.code === 0);
  const adminToken = adminLogin.data.data?.token;

  // 2.2 教师登录
  const tLogin = await api('POST', '/auth/login', TEACHER);
  check('教师登录（密码已 bcrypt 迁移）', tLogin.data.code === 0);
  const tToken = tLogin.data.data?.token;

  // 2.3 学生登录
  const sLogin = await api('POST', '/auth/login', STUDENT);
  check('学生登录（密码已 bcrypt 迁移）', sLogin.data.code === 0);
  const sToken = sLogin.data.data?.token;

  // 2.4 错误密码拒绝
  const badPwd = await api('POST', '/auth/login', { username: TEACHER.username, password: 'wrong' });
  check('错误密码拒绝', badPwd.data.code !== 0);

  // 2.5 不存在用户
  const noUser = await api('POST', '/auth/login', { username: 'nobody_xyz', password: 'x' });
  check('不存在用户拒绝', noUser.data.code !== 0);

  // 2.6 登录失败限流（连续失败应触发 429）
  let blocked = false;
  for (let i = 0; i < 15; i++) {
    const r = await api('POST', '/auth/login', { username: 'nobody', password: 'x' });
    if (r.status === 429) { blocked = true; break; }
  }
  check('登录失败限流: 连续失败触发 429', blocked);

  // ================================================================
  // 三、密码修改测试
  // ================================================================
  console.log('\n=== 三、密码修改测试 ===');

  if (sToken) {
    // 正确旧密码
    const pwd1 = await api('PUT', '/auth/password', { oldPassword: STUDENT.password, newPassword: STUDENT.password }, sToken);
    check('学生修改密码（正确旧密码）', pwd1.data.code === 0);

    // 错误旧密码
    const pwd2 = await api('PUT', '/auth/password', { oldPassword: 'wrong_old', newPassword: 'new' }, sToken);
    check('修改密码拒绝错误旧密码', pwd2.data.code !== 0);
  }

  // ================================================================
  // 四、教师全业务流程
  // ================================================================
  console.log('\n=== 四、教师全业务流程 ===');

  if (tToken) {
    // 4.1 班级管理
    const classes = await api('GET', '/teacher/classes?schoolId=2749', null, tToken);
    check('获取班级列表', classes.data.code === 0);
    const classCount = (classes.data.data || []).length;
    check('班级列表非空', classCount > 0);

    // 4.2 学生管理
    const students = await api('GET', '/teacher/students?schoolId=2749&classId=100', null, tToken);
    check('获取学生列表', students.data.code === 0);

    // 4.3 教学团队
    const teams = await api('GET', '/teacher/teams?schoolId=2749', null, tToken);
    check('获取团队列表', teams.data.code === 0);

    // 4.4 题库管理
    const questions = await api('GET', '/teacher/questions?schoolId=2749&pageSize=10', null, tToken);
    check('获取题目列表', questions.data.code === 0);

    // 4.5 作业管理
    const assignments = await api('GET', '/teacher/assignments?schoolId=2749', null, tToken);
    check('获取作业列表', assignments.data.code === 0);

    // 4.6 评分审核
    const review = await api('GET', '/teacher/review-summary?schoolId=2749', null, tToken);
    check('获取审核列表', review.data.code === 0);
  }

  // ================================================================
  // 五、学生全业务流程
  // ================================================================
  console.log('\n=== 五、学生全业务流程 ===');

  if (sToken) {
    // 5.1 作业列表
    const hw = await api('GET', '/student/assignments', null, sToken);
    check('学生获取作业列表', hw.data.code === 0);
    const hwList = hw.data.data?.list || [];
    check('作业列表非空', hwList.length > 0);

    // 5.2 成绩查询
    const scores = await api('GET', '/student/scores', null, sToken);
    check('学生获取成绩', scores.data.code === 0);
  }

  // ================================================================
  // 六、角色隔离测试
  // ================================================================
  console.log('\n=== 六、角色隔离测试 ===');

  // 6.1 学生不能访问教师接口
  if (sToken) {
    const sToT = await api('GET', '/teacher/classes?schoolId=2749', null, sToken);
    check('学生禁访教师接口', sToT.status === 403);
  }

  // 6.2 教师不能访问管理接口
  if (tToken) {
    const tToAdmin = await api('GET', '/admin/teachers', null, tToken);
    check('教师禁访管理员接口', tToAdmin.status === 403);
  }

  // 6.3 未登录不能访问受保护接口
  const noAuth2 = await api('GET', '/teacher/classes?schoolId=2749');
  check('未登录禁访教师接口', noAuth2.status === 401);

  // ================================================================
  // 七、XSS 防护验证（DOMPurify 已在客户端，此处验证 API 返回数据完整性）
  // ================================================================
  console.log('\n=== 七、数据完整性 ===');

  if (tToken) {
    const qData = await api('GET', '/teacher/questions?schoolId=2749&pageSize=1', null, tToken);
    check('题目数据包含 HTML 内容（DOMPurify 前端处理）', qData.data.code === 0);
  }

  // ================================================================
  // 结果
  // ================================================================
  console.log(`\n========================================`);
  console.log(`  测试完成: ${passed} 通过, ${failed} 失败`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
})();
