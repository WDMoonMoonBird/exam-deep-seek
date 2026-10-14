import supertest from 'supertest';
import app from '../../src/app.js';
import { ensureAdminAccount } from '../fixtures/admin.js';

let teacherToken = null;
let adminToken = null;

export const request = () => supertest(app);

export async function loginAsTeacher() {
  if (teacherToken) return teacherToken;
  const res = await request()
    .post('/api/auth/login')
    .send({ username: 'test_teacher', password: 'test_teacher' });
  teacherToken = res.body.data.token;
  return teacherToken;
}

/**
 * 管理员登录（W0-C 统一夹具）：凭据来自 test/fixtures/admin.js
 * —— 环境变量 TEST_ADMIN_PASSWORD 优先（只读，不改库）；缺省自建/复用专用测试管理员。
 * 测试**不得**再硬编码任何默认超管口令（C1 已移除启动期默认超管）。
 */
export async function loginAsAdmin() {
  if (adminToken) return adminToken;
  const { username, password } = await ensureAdminAccount();
  const res = await request().post('/api/auth/login').send({ username, password });
  if (res.body.code !== 0) {
    throw new Error('admin 登录失败（' + username + '）: ' + JSON.stringify(res.body));
  }
  adminToken = res.body.data.token;
  return adminToken;
}

export async function loginAsStudent(username = 'test_stu_01') {
  const res = await request()
    .post('/api/auth/login')
    .send({ username, password: username });
  // 如果返回多学校选择（code=1002），自动选第一个
  if (res.body.code === 1002) {
    const schoolCode = res.body.data.schools[0]?.officialCode;
    const res2 = await request()
      .post('/api/auth/login')
      .send({ username, password: username, schoolCode });
    return res2.body.data.token;
  }
  return res.body.data.token;
}

export function authReq(token) {
  return {
    get: (url) => request().get(url).set('Authorization', `Bearer ${token}`),
    post: (url, body) => request().post(url).send(body).set('Authorization', `Bearer ${token}`),
    put: (url, body) => request().put(url).send(body).set('Authorization', `Bearer ${token}`),
    delete: (url) => request().delete(url).set('Authorization', `Bearer ${token}`),
  };
}

export function getTestData() {
  return global.__testData || {};
}
