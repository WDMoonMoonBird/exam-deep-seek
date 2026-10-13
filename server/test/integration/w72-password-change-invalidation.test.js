/**
 * W72（R2-B67 / WAVE2·安全）：改密 / 重置后**旧令牌立即失效**（password_changed_at + JWT iat 比对）。
 *
 * 覆盖五类：
 *   ① 旧令牌 401 + code 1002；② 新令牌可用；③ 他人令牌不受影响；
 *   ④ 重置场景（管理员重置教师 / 教师重置学生）；⑤ **秒级边界**（同秒令牌放行、前一秒拒绝、NULL 列不判定）。
 * 另：⑥ 四条设密路径逐条静态核对（含 hashSync↔passwordChangedAt 计数不变式）；⑦ 迁移「只加列且可回滚」。
 * 仅动**测试库**；临时账号 afterAll 清理；种子账号的重置是**幂等**的（密码=用户名/学号，与既有 fixture 一致）。
 */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import prisma from '../../src/utils/prisma.js';
import { getJwtSecret } from '../../src/config/jwtSecret.js';
import { request, authReq, loginAsTeacher, loginAsStudent, getTestData } from './helpers.js';

const U1 = 'w72_pwd_a';
const U2 = 'w72_pwd_b';
const U3 = 'w72_pwd_legacy';
const P1 = 'W72-strong-1';
const P2 = 'W72-strong-2';
const P1B = 'W72-strong-1b';
const SRC = path.resolve(process.cwd(), 'src');
// 按角色取「过鉴权中间件」的受保护 GET 探针（避免用到不存在的路由造成 404 假绿/假红）
const PROBE = { admin: '/api/admin/schools', teacher: '/api/teacher/my-schools', student: '/api/student/profile' };
const API = PROBE.admin;            // 受保护 GET 探针（U1/U2 均为 super_admin）
const CHANGE = '/api/auth/password'; // 自助改密端点（PUT）

let tokenU1 = null;
let tokenU2 = null;

const login = (username, password) => request().post('/api/auth/login').send({ username, password });
/** 让"旧令牌"的 iat 落在**更早的秒**：判定是秒级且用严格小于 ⇒ 同秒令牌属"新令牌"（≤1s 窗口，见 auth.js 注释）。
 *  故"旧令牌必须失效"的用例需跨秒再改密，否则测到的是窗口内行为（这本身就是边界的一部分）。 */
const ageToken = () => new Promise((r) => setTimeout(r, 1100));
const mkUser = async (username, password, role, extra = {}) => prisma.user.upsert({
  where: { username },
  update: { password: bcrypt.hashSync(password, 10), deletedAt: null, ...extra },
  create: { username, password: bcrypt.hashSync(password, 10), realName: 'W72 测试', role, ...extra },
});

beforeAll(async () => {
  await mkUser(U1, P1, 'super_admin', { passwordChangedAt: null });
  await mkUser(U2, P2, 'super_admin', { passwordChangedAt: null });
  tokenU1 = (await login(U1, P1)).body.data.token;
  tokenU2 = (await login(U2, P2)).body.data.token;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [U1, U2, U3] } } });
});

describe('W72-1/2/3 自助改密：旧令牌失效、新令牌可用、他人不受影响', () => {
  test('★旧令牌立即 401 + code 1002；未改密的对照账号令牌仍 200', async () => {
    expect((await authReq(tokenU1).get(API)).status).toBe(200);              // 改密前：旧令牌可用
    const before = await prisma.user.findUnique({ where: { username: U1 }, select: { passwordChangedAt: true } });
    expect(before.passwordChangedAt).toBeNull();                              // 前置：历史行 NULL（不判定）

    await ageToken();                                                         // 旧令牌 iat 落在更早的秒（见 ageToken 注释）
    const changed = await authReq(tokenU1).put(CHANGE, { oldPassword: P1, newPassword: P1B });
    expect(changed.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { username: U1 }, select: { passwordChangedAt: true } });
    expect(after.passwordChangedAt).not.toBeNull();                           // ★设密路径①确实写列

    const denied = await authReq(tokenU1).get(API);
    expect(denied.status).toBe(401);                                          // ★旧令牌立即失效
    expect(denied.body.code).toBe(1002);

    expect((await authReq(tokenU2).get(API)).status).toBe(200);               // ★他人令牌不受影响
  });

  test('★新令牌可用（改密后重新登录 ⇒ 200）', async () => {
    const res = await login(U1, P1B);
    expect(res.status).toBe(200);
    const fresh = res.body.data.token;
    expect((await authReq(fresh).get(API)).status).toBe(200);
    tokenU1 = fresh;                                                          // 供后续用例（管理员操作）使用
  });
});

describe('W72-4 重置场景：管理员重置教师 / 教师重置学生 ⇒ 被重置者旧令牌失效', () => {
  test('★管理员重置教师密码：教师旧令牌 401；重置后新密码（=工号）可登录', async () => {
    const teacherToken = await loginAsTeacher();                              // 种子教师（密码=工号，重置幂等）
    await ageToken();                                                         // 同上：让教师旧令牌落在更早的秒
    const me = getTestData().teacherId;
    const reset = await authReq(tokenU1).put('/api/admin/teachers/' + me + '/reset-password', {});
    expect(reset.status).toBe(200);
    const denied = await authReq(teacherToken).get(PROBE.teacher);
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe(1002);
    const relogin = await login('test_teacher', 'test_teacher');
    expect((await authReq(relogin.body.data.token).get(PROBE.teacher)).status).toBe(200);   // 新令牌可用
    expect(relogin.status).toBe(200);
  });

  test('★教师重置学生密码：学生旧令牌 401', async () => {
    const studentToken = await loginAsStudent('test_stu_01');
    // ★注意：不能用 loginAsTeacher()（模块级缓存）——上一条刚重置教师密码 ⇒ 缓存令牌已按本批规则失效；
    //   这里显式重新登录拿新令牌（这本身也是「重置后旧令牌确实作废」的一条侧证）。
    const teacherToken = (await login('test_teacher', 'test_teacher')).body.data.token;
    await ageToken();                                                         // 同上：让学生旧令牌落在更早的秒
    const sid = getTestData().studentIds[0];
    const reset = await authReq(teacherToken).put('/api/teacher/students/' + sid + '/reset-password?schoolId=' + getTestData().schoolId, {});
    expect(reset.status).toBe(200);
    const denied = await authReq(studentToken).get(PROBE.student);
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe(1002);
  });
});

describe('W72-5 ★秒级边界（iat 秒 + 严格小于；NULL 列不判定）', () => {
  // ★注意：**不能**用 { noTimestamp: true } —— jsonwebtoken 在该分支会 `delete payload.iat`（实测），
  //   于是令牌根本没有 iat，中间件的"无 iat ⇒ 不判定"守卫会放行，用例会假绿。默认分支会保留我们指定的 iat。
  const mint = (id, iat) => jwt.sign({ id, iat, exp: iat + 3600 }, getJwtSecret());

  test('同秒令牌**放行**（iat == floor(changed/1000)）、前一秒**拒绝**（iat < changedSec）——边界与理由见 auth.js 注释', async () => {
    const u = await prisma.user.findUnique({ where: { username: U1 }, select: { id: true } });
    const now = new Date();
    await prisma.user.update({ where: { id: u.id }, data: { passwordChangedAt: now } });
    const changedSec = Math.floor(now.getTime() / 1000);

    const sameSec = await authReq(mint(u.id, changedSec)).get(API);
    expect(sameSec.status).toBe(200);            // 同秒 ⇒ 视为新令牌（否则"改密后立刻重新登录"会被假 401 锁死）
    const prevSec = await authReq(mint(u.id, changedSec - 1)).get(API);
    expect(prevSec.status).toBe(401);            // 早于改密秒 ⇒ 失效
    expect(prevSec.body.code).toBe(1002);

    // 边界补记：**没有 iat** 的令牌无法判定（不误杀）——既有签发路径（jwt.sign 默认）恒写 iat，
    // 此处显式固化该保守行为，避免"删了 iat 反而绕过失效"的改动被无声接受。
    const noIat = jwt.sign({ id: u.id, exp: changedSec + 3600 }, getJwtSecret(), { noTimestamp: true });
    const noIatRes = await authReq(noIat).get(API);
    expect(noIatRes.status).toBe(200);
  });

  test('password_changed_at 为 NULL（历史行/从未改密）⇒ 不参与判定（行为与本批之前一致）', async () => {
    await mkUser(U3, P2, 'super_admin', { passwordChangedAt: null });
    const tok = (await login(U3, P2)).body.data.token;
    expect((await authReq(tok).get(API)).status).toBe(200);
    const row = await prisma.user.findUnique({ where: { username: U3 }, select: { passwordChangedAt: true } });
    expect(row.passwordChangedAt).toBeNull();
  });
});

describe('W72-6 静态核对：四条设密路径全部写列 + 计数不变式', () => {
  const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
  const pathOne = [
    ['① 自助改密', 'controllers/authController.js', 'data: { password: hashed, passwordChangedAt: new Date() }'],
    ['② 管理员重置教师', 'controllers/adminController.js', 'data: { password: newPassword, passwordChangedAt: new Date() }'],
    ['③ 教师重置学生', 'interface/http/controllers/teacher/students.js', 'data: { password: newPassword, passwordChangedAt: new Date() }'],
    ['④ 建号初始口令（管理员建教师）', 'controllers/adminController.js', "password: bcrypt.hashSync(username, 10), role: 'teacher',"],
    ['④ 建号初始口令（管理员建学生）', 'controllers/adminController.js', 'password: bcrypt.hashSync(username, 10),\n        passwordChangedAt: new Date()'],
    ['④ 建号初始口令（教师建学生）', 'interface/http/controllers/teacher/students.js', 'passwordChangedAt: new Date(), // ★R2-B67：设密路径④——建号初始口令'],
    ['④ 变更学号即改密', 'interface/http/controllers/teacher/students.js', 'data.passwordChangedAt = new Date(); // ★R2-B67：改学号即改密'],
    ['④ 补全姓名即重置密码', 'interface/http/controllers/teacher/students.js', 'data.passwordChangedAt = new Date(); // ★R2-B67：补全姓名即重置密码'],
    ['④ 批量导入建号（占位口令 ×2）', 'interface/http/controllers/teacher/students.js', 'passwordChangedAt: new Date(), // ★R2-B67：建号即设密（占位口令）'],
    ['④ 批量导入建号（完整学号）', 'interface/http/controllers/teacher/students.js', 'passwordChangedAt: new Date(), // ★R2-B67：建号初始口令'],
  ];
  test('逐条：每条设密路径的代码锚点都在（缺一即红）', () => {
    for (const [label, rel, anchor] of pathOne) {
      expect([label, read(rel).includes(anchor)]).toEqual([label, true]);
    }
  });

  test('★不变式：凡出现 bcrypt.hashSync 的源文件，passwordChangedAt 出现次数 ≥ hashSync 次数（防新增漏网设密点）', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith('.js')) files.push(p);
      }
    };
    walk(SRC);
    // app.js 的「明文口令→bcrypt」是一次性历史修补（本任务 out of scope，非"设新口令"）⇒ 明确排除
    const withHash = files.filter((p) => fs.readFileSync(p, 'utf8').includes('bcrypt.hashSync') && !p.endsWith(path.sep + 'app.js'));
    expect(withHash.length).toBeGreaterThan(0);
    for (const p of withHash) {
      const src = fs.readFileSync(p, 'utf8');
      const hashes = (src.match(/bcrypt\.hashSync\(/g) || []).length;
      const stamps = (src.match(/passwordChangedAt/g) || []).length;
      expect({ file: path.relative(SRC, p), ok: stamps >= hashes }).toEqual({ file: path.relative(SRC, p), ok: true });
    }
    // app.js 的「明文口令→bcrypt」是一次性历史修补（本任务 out of scope）：它不是"设新口令"，故不写列。
    expect(fs.readFileSync(path.join(SRC, 'app.js'), 'utf8')).toContain('已迁移明文密码');
  });
});

describe('W72-7 迁移：只加列、可回滚、未动 JWT_SECRET', () => {
  test('★migration.sql 只有 ADD COLUMN（无 DROP/MODIFY/DELETE）；rollback.sql 恰好是 DROP COLUMN', () => {
    const dir = path.resolve(process.cwd(), 'prisma', 'migrations', '20261013190000_r2b67_password_changed_at');
    const up = fs.readFileSync(path.join(dir, 'migration.sql'), 'utf8');
    const down = fs.readFileSync(path.join(dir, 'rollback.sql'), 'utf8');
    const code = up.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');   // 只审可执行语句，注释不算
    expect(code).toContain('ADD COLUMN');
    expect(code).toContain('password_changed_at');
    expect(code).toContain('DATETIME(3) NULL');
    expect(/\bDROP\b|\bMODIFY\b|\bDELETE\b/i.test(code)).toBe(false);
    expect(down).toContain('DROP COLUMN');
    expect(down).toContain('password_changed_at');
  });

  test('★未改 JWT_SECRET 逻辑：中间件仍走 getJwtSecret 唯一解析点；schema 里 User 有新列', () => {
    const authSrc = fs.readFileSync(path.join(SRC, 'middleware', 'auth.js'), 'utf8');
    expect(authSrc).toContain("import { getJwtSecret } from '../config/jwtSecret.js'");
    expect(authSrc).toContain('getJwtSecret()');
    expect(authSrc).not.toMatch(/process\.env\.JWT_SECRET\s*\|\|/);
    const schema = fs.readFileSync(path.resolve(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).toMatch(/passwordChangedAt\s+DateTime\?\s+@map\("password_changed_at"\)/);
  });
});
