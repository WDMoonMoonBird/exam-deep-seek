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
