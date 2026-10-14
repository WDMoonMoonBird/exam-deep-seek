/**
 * ★H5（P0/P1）回归断言：登录失败限流必须按「账号 + IP」双维度生效，且**不连带其他账号**
 *
 * 阈值来源：server/src/infrastructure/bootstrap/compose.js:30 `new InMemoryRateLimiter()`
 *   ⇒ maxFailures = 10（默认值，见 in-memory-rate-limiter.js），窗口 5 分钟。
 *
 * 断言的是「**被拒绝**」：
 *   H5-1 连续 10 次错误口令（唯一 X-Forwarded-For）⇒ 第 11 次 429 + code 1003
 *   H5-2 该账号**换一个 IP** 用**正确口令** ⇒ 仍 429（账号维度，攻击者换 IP 也猜不动）
 *   H5-3 ★其他账号不受影响：正常账号从**新 IP** 登录 ⇒ 200 + code 0
 *   H5-4 ★N11 持久化反证：同 username **轮换 3 个 schoolCode** 打满阈值
 *        ⇒ 第 11 次（**全新 IP + 全新 schoolCode**）仍 429（只能来自全局键 `acct:<username>`）
 *   H5-5 ★N11 清键语义：成功登录**只清** `acct:<u>@<本schoolCode>` 与全局 `acct:<u>`，
 *        `ip:<ip>` 键与其它 schoolCode 键**不变**（逐键读数取自限流器内部 map）
 *
 *   ★R1-1 ★R1-2 ★R1-3（t27）：非字符串 password（`{}`/`123`/`[]`）必须归一为 **400 + code 1001**
 *        （修复前直达 `bcrypt.compareSync` ⇒ `Illegal arguments` ⇒ **500/2001 且不进任何限流计数**），
 *        并且**该路径同样进入限流**（连打阈值 ⇒ 第 11 次 429）；字符串口令行为保持逐字不变（正对照）。
 *
 * 修复前（HEAD）：无 trust proxy ⇒ req.ip 恒为回环、且只有单维度
 *   ⇒ 10 次失败后**所有人**（含正常账号）一律 429 ⇒ H5-3 必红。
 * 修复前（无 N11 三键）：账号维度只有 `acct:<u>@<schoolCode>` ⇒ 轮换 schoolCode 即换新键
 *   ⇒ H5-4 的场景会**返回 400**（绕过成立）⇒ H5-4 必红（对照证据见 reports/fix/W1-C3-lint-closure.md §2）。
 */
import bcrypt from 'bcryptjs';
import app from '../../src/app.js';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'secp0h5_';
const TAG = PREFIX + Date.now() + '_';
const USERNAME = TAG + 'victim';
const PASSWORD = 'SecP0#' + Date.now();
const MAX_FAILURES = 10;                       // compose.js 默认值
const IP_VICTIM = '10.99.0.7';
const IP_VICTIM_2 = '10.99.0.8';
const IP_OTHER = '10.99.0.9';

const IP_ROTATE = '10.99.4.9';
const IP_FRESH = '10.99.4.10';

const login = (username, password, ip, schoolCode) => request()
  .post('/api/auth/login')
  .set('X-Forwarded-For', ip)
  .send({ username, password, ...(schoolCode ? { schoolCode } : {}) });

/** 逐键读数：限流器内部 map 为公开字段（Map<key, 时间戳数组>）；键不存在 ⇒ 0 */
const keyCount = (key) => ((app.locals.rateLimiter.map.get(key)) || []).length;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
  await prisma.user.create({
    data: { username: USERNAME, password: bcrypt.hashSync(PASSWORD, 10), realName: 'SEC-P0 限流靶', role: 'teacher' },
  });
  // H5-4 用靶（只需存在，口令错误即可触发限流）
  await prisma.user.create({
    data: { username: TAG + 'rotate', password: bcrypt.hashSync(PASSWORD, 10), realName: 'SEC-P0 N11 轮换靶', role: 'teacher' },
  });
  // H5-5 用靶：**库内用户名 = `<base>@10001`** —— authController 在带 schoolCode 时按 `${username}@${schoolCode}` 精确查找，
  //   故登录体传 `base` + `schoolCode='10001'` 才能命中该行并成功登录；限流键同样是 `acct:<base>@10001`（与失败用例同键）
  await prisma.user.create({
    data: { username: TAG + 'clear@10001', password: bcrypt.hashSync(PASSWORD, 10), realName: 'SEC-P0 N11 清键靶', role: 'teacher' },
  });
  // ★R-1 用靶：三个**库内已存在**的账号（关键是"存在" —— 否则请求在查库前就 400/1001，pre-t25 也会计数 ⇒ 断言不判别）
  await prisma.user.create({
    data: { username: TAG + 'r1type', password: bcrypt.hashSync(PASSWORD, 10), realName: 'SEC-R1 形态靶', role: 'teacher' },
  });
  await prisma.user.create({
    data: { username: TAG + 'r1count', password: bcrypt.hashSync(PASSWORD, 10), realName: 'SEC-R1 计数靶', role: 'teacher' },
  });
  // R1-3 正对照用靶：库内用户名 = `<base>@10001`（字符串口令成功登录需要 schoolCode 精确命中该行）
  await prisma.user.create({
    data: { username: TAG + 'r1str@10001', password: bcrypt.hashSync(PASSWORD, 10), realName: 'SEC-R1 正对照靶', role: 'teacher' },
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) await prisma.teacherSchool.deleteMany({ where: { teacherId: { in: ids } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
});

describe('★H5（P0）：登录失败限流（账号 + IP 双维度）', () => {
  it('H5-1 连续错误口令达阈值 ⇒ 前端第 ' + (MAX_FAILURES + 1) + ' 次返回 429 + code 1003', async () => {
    for (let i = 1; i <= MAX_FAILURES; i += 1) {
      const res = await login(USERNAME, 'wrong-password-' + i, IP_VICTIM);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    }
    const blocked = await login(USERNAME, 'wrong-password-final', IP_VICTIM);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe(1003);
  }, 60000);

  it('H5-2 账号维度：换 IP + 正确口令 ⇒ 仍 429（不得放行）', async () => {
    const res = await login(USERNAME, PASSWORD, IP_VICTIM_2);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe(1003);
  }, 30000);

  it('★H5-3 其他账号不受影响：正常账号从新 IP 登录 ⇒ 200 + code 0', async () => {
    const res = await login('test_teacher', 'test_teacher', IP_OTHER);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();
  }, 30000);
});

describe('★N11（持久化）：全局账号维度 `acct:<username>` 堵住 schoolCode 轮换绕过', () => {
  it('★H5-4 轮换 3 个 schoolCode 打满阈值 ⇒ 第 11 次（全新 IP + 全新 schoolCode）仍 429', async () => {
    const user = TAG + 'rotate';
    const codes = ['10001', '10002', '10003'];
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      const res = await login(user, 'wrong-rotate-' + i, IP_ROTATE, codes[i % codes.length]);
      expect(res.status).toBe(400);       // 每个 acct@schoolCode 键各自 ≤4 次 ⇒ 不提前封锁（绕过成立的前提）
      expect(res.body.code).toBe(1001);
    }
    // 逐键读数：只有「全局账号键」达阈值，两个"新维度"键都是 0
    expect(keyCount('acct#global:' + user)).toBe(MAX_FAILURES);
    expect(keyCount('ip:' + IP_FRESH)).toBe(0);
    expect(keyCount('acct:' + user + '@10004')).toBe(0);

    const eleventh = await login(user, 'wrong-rotate-final', IP_FRESH, '10004');
    expect(eleventh.status).toBe(429);    // 全新 IP + 全新 schoolCode ⇒ 429 只可能来自全局账号键
    expect(eleventh.body.code).toBe(1003);
  }, 90000);

  it('★H5-5 成功登录只清账号键（本 schoolCode + 全局），IP 键与其它 schoolCode 键不变', async () => {
    const user = TAG + 'clear';
    const IP_A = '10.99.5.1';
    const IP_B = '10.99.5.2';

    for (let i = 0; i < 6; i += 1) {
      const res = await login(user, 'wrong-clear-' + i, IP_A, '10001');
      expect(res.status).toBe(400);
    }
    expect(keyCount('ip:' + IP_A)).toBe(6);
    expect(keyCount('acct:' + user + '@10001')).toBe(6);
    expect(keyCount('acct#global:' + user)).toBe(6);

    const otherSc = await login(user, 'wrong-clear-other', IP_B, '88888');   // 另一 schoolCode 键（用于"不误清"对照）
    expect(otherSc.status).toBe(400);
    expect(keyCount('acct:' + user + '@88888')).toBe(1);
    expect(keyCount('acct#global:' + user)).toBe(7);

    const ok = await login(user, PASSWORD, IP_A, '10001');
    expect(ok.status).toBe(200);
    expect(ok.body.code).toBe(0);

    expect(keyCount('acct:' + user + '@10001')).toBe(0);   // 本 schoolCode 键：被清
    expect(keyCount('acct#global:' + user)).toBe(0);              // 全局账号键：被清
    expect(keyCount('acct:' + user + '@88888')).toBe(1);   // 其它 schoolCode 键：不误清
    expect(keyCount('ip:' + IP_A)).toBe(6);                // IP 键：不清（仅失败累积）
    expect(keyCount('ip:' + IP_B)).toBe(1);
  }, 90000);
});

describe('★R-1 password 非字符串：400/1001 且进入限流计数', () => {
  const IP_TYPE = (n) => '10.99.7.' + n;
  const IP_COUNT = '10.99.7.20';
  const IP_STR = '10.99.7.30';

  it('★R1-1 非字符串/缺省 password ⇒ 一律 400 + code 1001（不再 500/2001）', async () => {
    const user = TAG + 'r1type';
    const cases = [
      ['对象 {}', { username: user, password: {} }],
      ['数字 123', { username: user, password: 123 }],
      ['数组 []', { username: user, password: [] }],
      ['null', { username: user, password: null }],
      ['缺省字段', { username: user }],
    ];
    for (const [i, [label, body]] of cases.entries()) {
      const res = await request().post('/api/auth/login').set('X-Forwarded-For', IP_TYPE(i + 1)).send(body);
      // 判别力：{} / 123 / [] 修复前为 500/2001（本条红）；null / 缺省 修复前即为 400/1001（不判别，作不回归对照）
      expect([label, res.status, res.body.code]).toEqual([label, 400, 1001]);
      expect(res.body.code).not.toBe(2001);          // 明确"不再是服务器内部错误"
      expect(String(res.body.message)).not.toContain('服务器内部错误');
    }
  }, 90000);

  it('★R1-2 非字符串口令同样进入限流计数：连打阈值 ⇒ 第 11 次 429', async () => {
    const user = TAG + 'r1count';   // 必须是**库内已存在**账号（否则查库前就 400/1001，pre-t25 也会计数 ⇒ 不判别）
    for (let i = 1; i <= MAX_FAILURES; i += 1) {
      const res = await request().post('/api/auth/login')
        .set('X-Forwarded-For', IP_COUNT)
        .send({ username: user, password: { attempt: i } });
      expect(res.status).toBe(400);                 // 修复前：每次都是 500 ⇒ 本行先红，且永远到不了 429
      expect(res.body.code).toBe(1001);
    }
    const eleventh = await request().post('/api/auth/login')
      .set('X-Forwarded-For', IP_COUNT)
      .send({ username: user, password: { attempt: 'final' } });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.code).toBe(1003);
  }, 90000);

  it('★R1-3 正对照：字符串口令行为逐字不变（失败 400/1001、成功 200/0、只清账号键）', async () => {
    const base = TAG + 'r1str';                    // 库内 = base@10001
    for (let i = 0; i < 3; i += 1) {
      const res = await login(base, 'wrong-str-' + i, IP_STR, '10001');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    }
    expect(keyCount('ip:' + IP_STR)).toBe(3);
    expect(keyCount('acct#global:' + base)).toBe(3);

    const ok = await login(base, PASSWORD, IP_STR, '10001');
    expect(ok.status).toBe(200);
    expect(ok.body.code).toBe(0);
    expect(keyCount('acct#global:' + base)).toBe(0);      // 成功 ⇒ 清账号键
    expect(keyCount('ip:' + IP_STR)).toBe(3);             // IP 键：仅失败累积
  }, 90000);
});
