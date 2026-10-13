/**
 * W67（R2-B58）自助改密码策略：API 层（真跑 HTTP，仅动**测试库**；用独立临时账号，不碰既有账号密码语义）。
 *   覆盖：强度三条正反例 + 限速（阈值/锁定/成功清零/强度失败不计入）+ 既有重置流程仍可用弱密码。
 */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../../src/utils/prisma.js';
import { request, authReq, loginAsTeacher, getTestData } from './helpers.js';
import { __resetPasswordGuard } from '../../src/controllers/authController.js';

const U = 'w67_pwd_user';
const P0 = 'W67-strong-1';
const P1 = 'W67-strong-2';
let token = null;

async function ensureUser() {
  const password = bcrypt.hashSync(P0, 10);
  await prisma.user.upsert({
    where: { username: U },
    update: { password, deletedAt: null },
    create: { username: U, password, realName: 'W67 策略测试', role: 'super_admin' },
  });
}

async function loginTemp() {
  const res = await request().post('/api/auth/login').send({ username: U, password: P0 });
  if (!res.body || !res.body.data || !res.body.data.token) throw new Error('临时账号登录失败：' + JSON.stringify(res.body));
  return res.body.data.token;
}

beforeAll(async () => { await ensureUser(); token = await loginTemp(); });
beforeEach(() => __resetPasswordGuard());
afterAll(async () => { __resetPasswordGuard(); await prisma.user.deleteMany({ where: { username: U } }); });

const changePwd = (body) => authReq(token).put('/api/auth/password', body);

describe('W67-1 强度校验三条（逐条正反例 + 明确中文文案）', () => {
  test('7 位 ⇒ 400「新密码至少 8 位」', async () => {
    const res = await changePwd({ oldPassword: P0, newPassword: 'Ab1cdef' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toBe('新密码至少 8 位');
  });

  test('纯字母 / 纯数字 ⇒ 400「新密码需同时包含字母和数字」', async () => {
    const r1 = await changePwd({ oldPassword: P0, newPassword: 'Abcdefgh' });
    expect(r1.status).toBe(400);
    expect(r1.body.message).toBe('新密码需同时包含字母和数字');
    const r2 = await changePwd({ oldPassword: P0, newPassword: '12345678' });
    expect(r2.status).toBe(400);
    expect(r2.body.message).toBe('新密码需同时包含字母和数字');
  });

  test('与原密码相同 ⇒ 400「新密码不能与原密码相同」', async () => {
    const res = await changePwd({ oldPassword: P0, newPassword: P0 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('新密码不能与原密码相同');
  });

  test('合法新密码 ⇒ 200；随后改回（同样合法）⇒ 200；响应不回显密码', async () => {
    const ok = await changePwd({ oldPassword: P0, newPassword: P1 });
    expect(ok.status).toBe(200);
    expect(ok.body.message).toBe('密码修改成功');
    expect(JSON.stringify(ok.body)).not.toContain(P1);
    const back = await changePwd({ oldPassword: P1, newPassword: P0 });
    expect(back.status).toBe(200);
  });
});

describe('W67-2 强度失败不计入错误次数（不会被自己的输入错误锁死）', () => {
  test('连续 6 次强度失败后，用正确原密码 ⇒ 仍 200（未被锁定）', async () => {
    for (let i = 0; i < 6; i += 1) {
      const bad = await changePwd({ oldPassword: P0, newPassword: '12345678' });
      expect(bad.status).toBe(400);
    }
    const ok = await changePwd({ oldPassword: P0, newPassword: P1 });
    expect(ok.status).toBe(200);
    expect((await changePwd({ oldPassword: P1, newPassword: P0 })).status).toBe(200);
  });
});

describe('W67-3 原密码错误限速（4 次 400 ⇒ 第 5 次 429；锁定期内正确密码也拒绝）', () => {
  test('逐次：前 4 次 400「原密码错误」，第 5 次 429「…请 15 分钟后再试」', async () => {
    for (let i = 1; i <= 4; i += 1) {
      const res = await changePwd({ oldPassword: 'wrong-old-pwd', newPassword: P1 });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('原密码错误');
    }
    const fifth = await changePwd({ oldPassword: 'wrong-old-pwd', newPassword: P1 });
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe(1002);
    expect(fifth.body.message).toBe('原密码错误次数过多，请 15 分钟后再试');
  });

  test('锁定期间：原密码正确 + 新密码合法 ⇒ 仍 429，且原密码未变（仍可用其登录）', async () => {
    for (let i = 0; i < 5; i += 1) await changePwd({ oldPassword: 'wrong-old-pwd', newPassword: P1 });
    const res = await changePwd({ oldPassword: P0, newPassword: P1 });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/原密码错误次数过多，请 \d+ 分钟后再试/);
    const relogin = await request().post('/api/auth/login').send({ username: U, password: P0 });
    expect(relogin.status).toBe(200);
  });

  test('不影响其它接口：锁定期间带令牌的其它请求不被限速逻辑波及', async () => {
    for (let i = 0; i < 5; i += 1) await changePwd({ oldPassword: 'wrong-old-pwd', newPassword: P1 });
    const me = await authReq(token).get('/api/auth/password');
    expect([200, 404, 405]).toContain(me.status);
  });
});

describe('W67-4 成功一次即清零', () => {
  test('3 次错误 ⇒ 正确密码改密成功 ⇒ 再错 4 次仍只到 400（计数已清零，不提前锁）', async () => {
    for (let i = 0; i < 3; i += 1) await changePwd({ oldPassword: 'wrong-old-pwd', newPassword: P1 });
    expect((await changePwd({ oldPassword: P0, newPassword: P1 })).status).toBe(200);
    expect((await changePwd({ oldPassword: P1, newPassword: P0 })).status).toBe(200);
    for (let i = 0; i < 4; i += 1) {
      const res = await changePwd({ oldPassword: 'wrong-old-pwd', newPassword: P1 });
      expect(res.status).toBe(400);
    }
  });
});

describe('W67-5 既有流程不受影响（教师重置学生密码仍可用弱密码）', () => {
  test('PUT /teacher/students/:id/reset-password 重置为纯数字学号 ⇒ 200', async () => {
    const data = getTestData();
    expect(data && data.studentIds && data.studentIds.length).toBeTruthy();
    const teacherToken = await loginAsTeacher();
    const sid = data.studentIds[0];
    const res = await authReq(teacherToken).put('/api/teacher/students/' + sid + '/reset-password?schoolId=' + data.schoolId, {});
    expect(res.status).toBe(200);
    expect(String(res.body.message || '')).toMatch(/密码已重置为学号/);
  });

  test('静态断言：策略函数只在 authController.js 出现（不渗到其它设密路径）', () => {
    const root = path.resolve(process.cwd(), 'src');
    const hits = [];
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (p.endsWith('.js')) {
          const t = fs.readFileSync(p, 'utf8');
          if (/validateSelfServicePassword/.test(t)) hits.push(path.relative(root, p));
        }
      }
    };
    walk(root);
    expect(hits.sort()).toEqual(['controllers/authController.js']);
  });
});