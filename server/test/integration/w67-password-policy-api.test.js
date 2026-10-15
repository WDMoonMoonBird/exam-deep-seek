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

/** ★R2-B67（WAVE2·安全）：改密成功 ⇒ 本人**所有旧令牌**立即失效（新规则）⇒ 套件内必须重新登录后再继续。
 *  这不是把断言放宽：失效本身由 w72 用例正向断言，这里只是让 w67 的后续步骤改用新令牌。 */
async function relogin(password) {
  const res = await request().post('/api/auth/login').send({ username: U, password });
  if (!res.body || !res.body.data || !res.body.data.token) throw new Error('改密后重新登录失败：' + JSON.stringify(res.body));
  token = res.body.data.token;
  return token;
}

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
    const oldToken = token;                                                   // ★改密前捕获：用于验证「旧令牌立即失效」
    // ★跨秒再改密：失效判定是**秒级**且用严格小于（同秒签发的令牌视为"新令牌"，见 auth.js 注释的 ≤1s 窗口）；
    //   否则本用例会测到窗口内行为（旧令牌仍在 1 秒内可用），断言会假红。
    await new Promise((r) => setTimeout(r, 1100));
    const ok = await changePwd({ oldPassword: P0, newPassword: P1 });
    expect(ok.status).toBe(200);
    expect(ok.body.message).toBe('密码修改成功');
    expect(JSON.stringify(ok.body)).not.toContain(P1);
    // ★R2-B67 新规则：改密后旧令牌立即 401（code 1002）
    const stale = await authReq(oldToken).put('/api/auth/password', { oldPassword: P0, newPassword: P1 });
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe(1002);
    token = await relogin(P1);
    const back = await changePwd({ oldPassword: P1, newPassword: P0 });
    expect(back.status).toBe(200);
    token = await relogin(P0);
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
    token = await relogin(P1);                                                // ★改密即失效 ⇒ 换新令牌
    expect((await changePwd({ oldPassword: P1, newPassword: P0 })).status).toBe(200);
    token = await relogin(P0);
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
    token = await relogin(P1);                                                // ★改密即失效 ⇒ 换新令牌
    expect((await changePwd({ oldPassword: P1, newPassword: P0 })).status).toBe(200);
    token = await relogin(P0);
    for (let i = 0; i < 4; i += 1) {
      const res = await changePwd({ oldPassword: 'wrong-old-pwd', newPassword: P1 });
      expect(res.status).toBe(400);
    }
  });
});

describe('W67-5 既有流程：教师重置学生密码 ⇒ **随机临时口令**（★H6：旧语义「重置为学号」已移除）', () => {
  test('PUT /teacher/students/:id/reset-password ⇒ 200 + 随机临时口令（≠学号）+ 标志置位 + 可用其登录', async () => {
    const data = getTestData();
    expect(data && data.studentIds && data.studentIds.length).toBeTruthy();
    const teacherToken = await loginAsTeacher();
    const sid = data.studentIds[0];
    const row0 = await prisma.user.findUnique({ where: { id: sid }, select: { username: true } });
    const stuNo = row0.username.split('@')[0];                 // 该 seed 学生的学号（旧语义下的"口令"）
    const res = await authReq(teacherToken).put('/api/teacher/students/' + sid + '/reset-password?schoolId=' + data.schoolId, {});
    expect(res.status).toBe(200);
    // ★H6：一次性临时口令**只在响应回传一次**（库里只存哈希）
    const temp = res.body.data?.initialPassword;
    expect(typeof temp).toBe('string');
    expect(temp.length).toBeGreaterThanOrEqual(8);              // 满足自助改密策略下限
    expect(temp).not.toBe(stuNo);                              // ★核心判别力：不再是学号（旧语义即此）
    expect(/^[0-9]+$/.test(temp)).toBe(false);                  // ★随机性：不是纯数字学号形态
    // message 同时回显同一口令（各端已展示 message ⇒ 零前端改动即可转交）
    expect(String(res.body.message || '')).toContain(temp);
    expect(String(res.body.message || '')).not.toMatch(/重置为学号/);
    const row1 = await prisma.user.findUnique({ where: { id: sid }, select: { mustChangePassword: true } });
    expect(row1.mustChangePassword).toBe(true);                 // ★标志置位（闸门依据）
    // ★该口令确实可用（且登录响应回带标志 ⇒ 客户端/闸门据此强制改密）
    const login = await request().post('/api/auth/login').send({ username: stuNo, password: temp });
    expect(login.body.code).toBe(0);
    expect(login.body.data.user.mustChangePassword).toBe(true);
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