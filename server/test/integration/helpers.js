import supertest from 'supertest';
import app from '../../src/app.js';

let teacherToken = null;

export const request = () => supertest(app);

export async function loginAsTeacher() {
  if (teacherToken) return teacherToken;
  const res = await request()
    .post('/api/auth/login')
    .send({ username: 'test_teacher', password: 'test_teacher' });
  teacherToken = res.body.data.token;
  return teacherToken;
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
