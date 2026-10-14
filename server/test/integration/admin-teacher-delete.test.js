/**
 * admin-teacher-delete.test.js — 管理员删除教师（软删除）集成测试。
 * 覆盖：删除成功/不存在/删除自己/删除后登录被拒/旧 token 失效。
 */
import { request } from './helpers.js';
import { ensureAdminAccount } from '../fixtures/admin.js';

async function adminLogin() {
  const { username, password } = await ensureAdminAccount();
  const r = await request().post('/api/auth/login').send({ username, password });
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

  it('删除管理员账号 → 404（非教师角色不可删）；教师无权限调管理接口 → 1003', async () => {
    // BUG-013：删除自身（400 分支）在真实权限模型下不可达——admin 为 super_admin 不满足 role=teacher；
    // 验证真实可达分支：① 删除 super_admin → 404；② 教师调用管理删除接口 → 1003 无权限
    const adminCreds = await ensureAdminAccount();
    const me = await request().post('/api/auth/login').send({ username: adminCreds.username, password: adminCreds.password });
    const adminId = me.body.data.user.id;
    const r1 = await request().delete('/api/admin/teachers/' + adminId).set('Authorization', 'Bearer ' + adminToken);
    expect(r1.body.code).toBe(1004); // role !== teacher → 教师不存在

    const teacherLogin = await request().post('/api/auth/login').send({ username: 'test_teacher', password: 'test_teacher' });
    const teacherToken2 = teacherLogin.body.data.token;
    const list = await request().get('/api/admin/teachers').set('Authorization', 'Bearer ' + adminToken);
    const someTeacher = list.body.data[0];
    expect(someTeacher).toBeTruthy();
    const r2 = await request().delete('/api/admin/teachers/' + someTeacher.id).set('Authorization', 'Bearer ' + teacherToken2);
    expect(r2.body.code).toBe(1003); // teacher 无 admin 权限
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