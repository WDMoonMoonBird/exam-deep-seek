/**
 * admin-teacher-delete.test.js — 管理员删除教师（软删除）集成测试。
 * 覆盖：删除成功/不存在/删除自己/删除后登录被拒/旧 token 失效。
 */
import { request } from './helpers.js';

async function adminLogin() {
  const r = await request().post('/api/auth/login').send({ username: 'admin', password: '***REDACTED***' });
  if (r.body.code !== 0) throw new Error('admin 登录失败: ' + r.body.message);
  return r.body.data.token;
}

async function createTempTeacher(adminToken, name) {
  const uname = 'del_teacher_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const r = await request().post('/api/admin/teachers').set('Authorization', 'Bearer ' + adminToken).send({ username: uname, realName: name, schoolIds: [] });
  if (r.body.code !== 0) throw new Error('创建教师失败: ' + JSON.stringify(r.body));
  return { id: r.body.data.id, username: uname, password: uname };
}

describe('管理员删除教师（软删除）', () => {
  let adminToken;
  let teacher;

  beforeAll(async () => {
    adminToken = await adminLogin();
    teacher = await createTempTeacher(adminToken, '待删除教师');
  });

  it('删除教师 → 成功，且该教师登录被拒', async () => {
    const del = await request().delete('/api/admin/teachers/' + teacher.id).set('Authorization', 'Bearer ' + adminToken);
    expect(del.body.code).toBe(0);
    expect(del.body.message).toBe('删除成功');

    // 删除后登录被拒
    const login = await request().post('/api/auth/login').send({ username: teacher.username, password: teacher.password });
    expect(login.body.code).toBe(1001);
  });

  it('删除已删除/不存在的教师 → 404', async () => {
    const r = await request().delete('/api/admin/teachers/999999').set('Authorization', 'Bearer ' + adminToken);
    expect(r.body.code).toBe(1004);
  });

  it('删除当前登录账号 → 400 拒绝', async () => {
    const me = JSON.parse((await request().post('/api/auth/login').send({ username: 'admin', password: '***REDACTED***' })).body.data.token.split('.')[1] ? '{}' : '{}');
    // 用 admin 列表找自己的 id（username=admin）
    const list = await request().get('/api/admin/teachers').set('Authorization', 'Bearer ' + adminToken);
    const adminRow = list.body.data.find(t => t.username === 'admin');
    if (adminRow) {
      const r = await request().delete('/api/admin/teachers/' + adminRow.id).set('Authorization', 'Bearer ' + adminToken);
      expect(r.body.code).toBe(1001);
      expect(r.body.message).toContain('当前登录账号');
    }
  });

  it('删除后旧 token 立即失效（401）', async () => {
    // 再造一个临时教师并删除，用删除前签发的 token 访问受保护接口
    const t2 = await createTempTeacher(adminToken, '待删Token验证');
    const login = await request().post('/api/auth/login').send({ username: t2.username, password: t2.password });
    const oldToken = login.body.data.token;
    expect(login.body.code).toBe(0);

    await request().delete('/api/admin/teachers/' + t2.id).set('Authorization', 'Bearer ' + adminToken);

    const r = await request().get('/api/teacher/questions').set('Authorization', 'Bearer ' + oldToken);
    expect(r.status).toBe(401);
  });
});