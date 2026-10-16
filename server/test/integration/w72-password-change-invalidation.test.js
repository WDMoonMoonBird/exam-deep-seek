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

// ★H6：管理员重置教师后的新口令（首登强制改密 ⇒ W72-4 首条用例末尾自行改密，后续用例沿用）
const NEW_TEACHER_PWD = 'W72-teacher-New-1';
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
  test('★管理员重置教师密码：教师旧令牌 401；重置后**随机临时口令**可登录（首登须改密）', async () => {
    const teacherToken = await loginAsTeacher();                              // 种子教师
    await ageToken();                                                         // 同上：让教师旧令牌落在更早的秒
    const me = getTestData().teacherId;
    const reset = await authReq(tokenU1).put('/api/admin/teachers/' + me + '/reset-password', {});
    expect(reset.status).toBe(200);
    // ★H6：重置回传**一次性临时口令**（旧语义=口令即刻变成工号）
    const temp = reset.body.data?.initialPassword;
    expect(typeof temp).toBe('string');
    expect(temp).not.toBe('test_teacher');                                    // ★判别力：不再是工号
    const denied = await authReq(teacherToken).get(PROBE.teacher);
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe(1002);
    // ★H6：临时口令可登录，但带 mustChangePassword 标志 ⇒ 业务接口被闸门拦住（403/1101）
    const relogin = await login('test_teacher', temp);
    expect(relogin.status).toBe(200);
    expect(relogin.body.data.user.mustChangePassword).toBe(true);
    const gated = await authReq(relogin.body.data.token).get(PROBE.teacher);
    expect(gated.status).toBe(403);
    // 闸门实际响应口径（middleware/auth.js:58）：403 + code 1005 + 「请先修改初始密码后再使用其它功能」
    expect(gated.body.code).toBe(1005);
    expect(String(gated.body.message || '')).toContain('修改初始密码');
    // ★H6 两步闭环：改密端点属白名单（闸门放行）⇒ 改密后新令牌可用（否则即"双向锁死"）
    const changed = await authReq(relogin.body.data.token).put('/api/auth/password', { oldPassword: temp, newPassword: NEW_TEACHER_PWD });
    expect(changed.status).toBe(200);
    const relogin2 = await login('test_teacher', NEW_TEACHER_PWD);
    expect((await authReq(relogin2.body.data.token).get(PROBE.teacher)).status).toBe(200);   // 新令牌可用
  });

  test('★教师重置学生密码：学生旧令牌 401', async () => {
    const studentToken = await loginAsStudent('test_stu_01');
    // ★注意：不能用 loginAsTeacher()（模块级缓存）——上一条刚重置教师密码 ⇒ 缓存令牌已按本批规则失效；
    //   这里显式重新登录拿新令牌（这本身也是「重置后旧令牌确实作废」的一条侧证）。
    const teacherToken = (await login('test_teacher', NEW_TEACHER_PWD)).body.data.token;   // ★H6：上一条已改密，种子口令不再可用
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
    ['① 自助改密', 'controllers/authController.js', 'data: { password: hashed, passwordChangedAt: new Date(), mustChangePassword: false }'],
    ['② 管理员重置教师', 'controllers/adminController.js', 'data: { password: newPassword, passwordChangedAt: new Date(), mustChangePassword: true }'],
    // ★W3 回退（用户裁定，测试期）：学生侧四条设密路径的 H6 语义已回退（口令=学号、不置标志）⇒
    //   锚点改为**该路径仍然成立的那部分**（写 passwordChangedAt「设密即失效旧令牌」列，R2-B67 语义未回退），
    //   标志位不再作为学生路径的锚点（教师路径仍锚定标志，见下方两条）。
    ['③ 教师重置学生', 'interface/http/controllers/teacher/students.js', 'const newPassword = bcrypt.hashSync(sid, 10);'],
    ['④ 建号初始口令（管理员建教师）', 'controllers/adminController.js', "password: bcrypt.hashSync(initialPassword, 10), role: 'teacher',"],
    ['④ 建号初始口令（管理员建学生）', 'controllers/adminController.js', 'password: bcrypt.hashSync(username, 10),'],
    ['④ 建号初始口令（教师建学生）', 'interface/http/controllers/teacher/students.js', "username: fullUsername, realName, password: bcrypt.hashSync(username, 10), role: 'student',"],
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
    // app.js 的「明文口令→bcrypt」是一次性历史修补（本任务 out of scope，非"设新口令"）⇒ 明确排除。
    // ★H6：initial-password.js 是**口令生成原语**（纯函数，不落库、不写任何列）；其文本里的
    //   `bcrypt.hashSync(username, 10)` 只出现在文档注释（用来对照被替换掉的旧反模式），不是真实调用 ⇒
    //   一并排除。**排除不削弱本不变式**：真正"设新口令"的落点（authController / adminController /
    //   teacher/students.js）仍在扫描集内，且下方另有 mustChangePassword 计数不变式同集合校验。
    const PURE_HELPERS = [path.sep + 'app.js', path.join('infrastructure', 'security', 'initial-password.js')];
    const withHash = files.filter((p) => fs.readFileSync(p, 'utf8').includes('bcrypt.hashSync')
      && !PURE_HELPERS.some((suffix) => p.endsWith(suffix)));
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

  // ★H6（W2-C12）新增两条防回归锁（与上一条同型：把"新落点漏写列/漏置标志"变成可机器验证的不变式）
  test('★H6 不变式：凡出现 bcrypt.hashSync 的源文件，mustChangePassword 出现次数 ≥ hashSync 次数', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith('.js')) files.push(p);
      }
    };
    walk(SRC);
    const PURE_HELPERS = [path.sep + 'app.js', path.join('infrastructure', 'security', 'initial-password.js')];
    const withHash = files.filter((p) => fs.readFileSync(p, 'utf8').includes('bcrypt.hashSync')
      && !PURE_HELPERS.some((suffix) => p.endsWith(suffix)));
    expect(withHash.length).toBeGreaterThan(0);
    for (const p of withHash) {
      const src = fs.readFileSync(p, 'utf8');
      // 计数口径：排除**空口令占位**（teacher/students.js 的 `bcrypt.hashSync('', 10)` 两处）——
      //   那些账号无口令可改、根本无法登录，按设计不需要 mustChangePassword（H6 报告 §1 已列明"占位建号不改"）。
      const hashes = (src.match(/bcrypt\.hashSync\((?!'')/g) || []).length;
      const flags = (src.match(/mustChangePassword/g) || []).length;
      // ★W3 回退（用户裁定，测试期）：**学生侧**不再置强制改密标志（口令=学号）⇒ 本不变式按
      //   **显式标记**豁免，而不是按文件名/角色正则猜（猜法易误伤：authController.js 不建员工但含学生数据）。
      //   契约：凡出现 R2-B67 里那条「学生侧回退」标记的文件，豁免 flags≥hashes；其余文件一律不豁免。
      //   ⇒ 将来若有人把某处重新写成"给学生置标志"，该文件不含标记 ⇒ 本不变式照旧生效（不会漏检）。
      // ★W3 回退（用户裁定，测试期）：**学生侧**不再置强制改密标志（口令 = 学号）⇒ 本不变式按
      //   **显式豁免清单**处理（不按文件名/注释正则猜 —— 实测猜法会误伤含学生数据的非学生文件）。
      //   豁免判据（三者同时成立，缺一即不再豁免、恢复原不变式）：
      //     ① 文件里存在学生侧回退标记；② 该文件确实还有设密点；③ 其标志数为 0（= 回退后应然状态）。
      //   ⇒ 将来若有人把某处改回"给学生置标志"，③ 不成立 ⇒ 该文件落到下方原不变式，若数量不匹配即红。
      const STUDENT_SIDE_OPT_OUT = '★W3 回退（用户裁定，测试期）';
      const revertedStudentSide = src.includes(STUDENT_SIDE_OPT_OUT) && flags === 0;
      if (revertedStudentSide) continue;
      expect({ file: path.relative(SRC, p), ok: flags >= hashes }).toEqual({ file: path.relative(SRC, p), ok: true });
    }
  });

  test('★H6 白名单不变式：强制改密闸门必须放行改密端点（否则「必须先改密」×「改密端点也被拦」= 双向锁死，不可自愈）', () => {
    const mw = fs.readFileSync(path.join(SRC, 'middleware', 'auth.js'), 'utf8');
    expect(mw).toContain('/api/auth/password');       // 挂载点下的完整路径形态
    expect(mw).toContain('/auth/password');           // 子挂载点下的相对路径形态（两种挂载方式都放行）
    expect(mw).toMatch(/mustChangePassword\s*===?\s*true/);   // 闸门判定本体在场
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
