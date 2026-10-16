import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { getJwtSecret } from '../config/jwtSecret.js';   // ★R2-B60：与中间件共用同一密钥解析（消除两处兜底）

/** ★F-1：登录名/院校代码的**字符白名单**（ASCII，带上界）—— 与 normalizeLoginIdentity 的分工见其注释 */
// ★H6（W2-P2c）：把基础设施层的**一次性初始口令生成器**转出给 interface 层使用 ——
//   分层门禁禁止 interface→infrastructure 直连（check-layers: interface-imports-infra），而
//   controllers→infrastructure 是允许方向；此处仅 **re-export，实现唯一一份**（无副本），
//   与 t41 的 "prompt-builder 单一真源" 做法同型。
export { generateInitialPassword, INITIAL_PWD_LEN } from '../infrastructure/security/initial-password.js';

export const LOGIN_USERNAME_RE = /^[A-Za-z0-9_.@-]{1,50}$/;
export const LOGIN_SCHOOLCODE_RE = /^[A-Za-z0-9_-]{0,32}$/;

/**
 * ★F-1：登录身份归一化 —— **唯一实现**，登录侧定位账号与限流侧建键共用（app.js 直接 import 复用，
 *   杜绝两侧各自归一化而漂移）。语义：String 强制转换（与既有模板串 `${username}@${schoolCode}` 同源），
 *   再 trim + toLowerCase。
 *
 * 语义：String 强转（与既有模板串 `${username}@${schoolCode}` 同源）→ NFKC → trim → toLowerCase。
 *
 * 为什么还要配套**字符白名单**（LOGIN_USERNAME_RE / LOGIN_SCHOOLCODE_RE）：
 *   `users.username` 的 collation 是 `utf8mb4_unicode_ci`，其等价类**宽于任何 JS 归一化** ——
 *   实测 ß↔ss / İ↔i / ﬁ↔fi / ①↔1 / ａ↔a 在 DB 侧全部"相等"，而 JS 侧不等；`normalize("NFKC")` 只能关掉其中
 *   应用兼容类（ﬁ/①/ａ），ß↔ss 与 İ↔i **仍然开着** ⇒ 不存在"纯 JS 归一化"能保证与 collation 同向。
 *   ⇒ 与其在 JS 里复刻 MySQL 折叠表（无界、随版本变化），不如**把入口字符集收窄到 ASCII**：
 *     白名单内 unicode_ci 的相对等价只剩**大小写折叠**，而 toLowerCase() 与之逐位一致 ⇒
 *     可证明"同一账号 ⇒ 同一把限流键"（证明与实测见 reports/fix/W1-D13-h5-type-confusion.md）。
 *     NFKC 作为额外纵深保留（关掉全角/连字等兼容形，且 NFKC 后的 ASCII 仍在同一等价类里）。
 *   白名单安全性已用真实库实测：exam_system_test 533 用户 / exam_system 1264 用户 / 2870 个院校代码，
 *   **白名单外用户名 = 0、白名单外代码 = 0**。
 *
 * @param {unknown} value 任意输入（字符串/数组/对象/数字/null…）
 * @returns {string} 归一化后的登录身份串（非字符串走 String 强转，与登录侧解析同源）
 */
export function normalizeLoginIdentity(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

/**
 * ★F-1：登录限流身份 —— 登录侧与限流侧**共用同一个判定**（app.js 直接 import 复用）：
 *   通过白名单 ⇒ 返回归一化后的 { username, schoolCode }（= 该输入**有可能定位到账号**）；
 *   不通过 ⇒ 返回 null ⇒ 登录侧 400、限流侧**不产生账号键**（该输入进不了口令比对，无需账号维度）。
 */
export function loginRateLimitIdentity(body) {
  const username = normalizeLoginIdentity(body == null ? '' : body.username);
  const schoolCode = normalizeLoginIdentity(body == null ? '' : body.schoolCode);
  if (!LOGIN_USERNAME_RE.test(username) || !LOGIN_SCHOOLCODE_RE.test(schoolCode)) return null;
  return { username, schoolCode };
}

export const login = async (req, res) => {
  try {
    const { password } = req.body;
    // ★R-1（A 的 round 2 复核，W1-A-review 残留表 R-1）：非字符串口令必须先归一为 400/1001 ——
    //   此前 `{}`/`123` 会走到 `bcrypt.compareSync` 抛 Illegal arguments ⇒ 500/2001，且 500 **不计入任何限流键**
    //   （限流只计 400/1001）⇒ 形成一条「不受限流的请求路径」。归一为 400/1001 后即被既有中间件正常计数。
    //   注：非字符串口令本不可能比对成功（无认证风险），本项修的是「不受限流」这一面；无新增依赖、无阈值改动。
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }

    // ★F-1：与**限流侧共用同一个判定/归一化**（唯一实现在本文件导出，app.js 复用）——
    //   通过白名单 ⇒ 该输入可能定位到账号（限流必然记账号键）；不通过 ⇒ 400 且不产生账号键。
    //   这样"DB 折叠比 JS 宽"的面从源头消失：非 ASCII/非白名单输入进不了查库与口令比对。
    const identity = loginRateLimitIdentity(req.body);
    if (!identity) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }
    const u = identity.username;
    const sc = identity.schoolCode;

    // schoolCode 存在时 → 精确匹配 username@schoolCode
    const lookupUsername = sc ? `${u}@${sc}` : u;

    let user = null;
    const isStudentLogin = !u.includes('@') && !sc;

    // 学生登录：优先匹配新格式（学号@院校代码），避免旧格式空壳用户抢先命中
    if (isStudentLogin) {
      const newStudents = await prisma.user.findMany({
        where: { username: { startsWith: u + '@' }, role: 'student', deletedAt: null },
      });

      if (newStudents.length === 1) {
        user = newStudents[0];
      } else if (newStudents.length > 1) {
        // ★M4（W2-P2）：**先校验口令、再回学校名单** —— 原实现于口令校验前即返回多校清单，
        //   构成账号枚举（只要知道学号即可确认其存在与所在院校）。失败统一文案，不暴露「该学号存在多校」。
        const passwordOk = newStudents.some((s) => {
          try { return bcrypt.compareSync(password, s.password); } catch { return false; }
        });
        if (!passwordOk) {
          return res.status(400).json({ code: 1001, message: '用户名或密码错误', data: null });
        }
        const codes = [...new Set(newStudents.map(s => s.username.split('@')[1]))];
        const schools = await prisma.school.findMany({
          where: { officialCode: { in: codes } },
          select: { name: true, officialCode: true },
        });
        return res.json({
          code: 1002,
          message: '该学号存在多个学校，请选择所在学校',
          data: { schools },
        });
      }
    }

    // 兜底：findUnique（教师、管理员、或确实只有旧格式的学生）
    if (!user) {
      user = await prisma.user.findFirst({ where: { username: lookupUsername, deletedAt: null } });
    }

    if (!user) {
      return res.status(400).json({ code: 1001, message: '用户名或密码错误', data: null });
    }

    // ★t24（B-1 复核的加强项）：以**DB 实际命中的行**为锚的权威账号键 —— 与"输入派生键"并存。
    //   为什么值得做：输入派生键在查库前就能拦（便宜），但**同一账号的不同写法**（如 `10001@学号` 与
    //   `学号` + `院校代码`）会落在**不同的输入键**上 ⇒ 属"少记"方向（计数可被写法切换拆散）；命中行的
    //   id 与写法无关 ⇒ `acct-id:<id>` 让"同一账号 ⇒ 同一把键"**结构上成立**，不依赖正则与 collation 的巧合。
    //   成本：handler 内一次内存查/记（查库本就已发生）⇒ 无额外 DB 查询、无新增依赖。
    const limiter = req.app && req.app.locals ? req.app.locals.rateLimiter : null;
    const idKey = limiter && user.id != null ? `acct-id:${user.id}` : null;
    if (idKey && await limiter.isBlocked(idKey)) {
      return res.status(429).json({ code: 1003, message: '登录失败次数过多，请 5 分钟后再试', data: null });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      if (idKey) limiter.recordFailure(idKey);   // ★t24：权威键按"命中行"计失败（与写法无关）
      // 如果选了学校 or 学生多学校查询唯一命中时，密码错误也统一提示
      return res.status(400).json({ code: 1001, message: '用户名或密码错误', data: null });
    }
    if (idKey) limiter.recordSuccess(idKey);   // ★t24：成功登录清权威键（与账号维度"成功即清"口径一致）

    const token = jwt.sign(
      // ★L1（W2-P2）：签发侧同样**显式**指定算法，与 middleware/auth.js 的 verify({algorithms:['HS256']}) 对称
      { id: user.id, username: user.username, role: user.role },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d', algorithm: 'HS256' }   // ★L1（W2-P2）：显式算法
    );

    logger.info({ userId: user.id, role: user.role }, '用户登录成功');

    // 教师：加载绑定学校 + 当前学校
    let teacherSchools = null;
    let currentSchool = null;
    if (user.role === 'teacher') {
      const tss = await prisma.teacherSchool.findMany({
        where: { teacherId: user.id },
        include: { school: true },
      });
      teacherSchools = tss.map(ts => ts.school);
      const lastId = user.lastSchoolId;
      if (lastId && teacherSchools.find(s => s.id === lastId)) {
        currentSchool = teacherSchools.find(s => s.id === lastId);
      } else if (teacherSchools.length > 0) {
        currentSchool = teacherSchools[0];
      }
    }

    res.json({
      code: 0,
      message: 'ok',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          realName: user.realName,
          role: user.role,
          teacherSchools,
          currentSchool,
          // ★H6（W2-P2c）：首登强制改密标志（布尔，不回显任何口令信息）—— 前端据此引导用户先改密；
          //   后端侧由 middleware/auth.js 的闸门拦截其它已认证接口（白名单：PUT /api/auth/password）。
          //   ★W3 回退（用户裁定，测试期）：只对**非学生**返回 —— 学生口令 = 学号、无待改密状态，
          //   前端亦零消费该标志 ⇒ 给学生返回它只会在响应里留下一个无人处理的字段。
          mustChangePassword: user.role !== 'student' && user.mustChangePassword === true,
        },
      },
    });
  } catch (err) {
    logger.error({ err }, '登录失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/**
 * ★R2-B58：自助改密码策略（**仅** PUT /auth/password 使用 —— 教师重置/批量建号等其它设密路径不受影响）。
 *   ① 新密码 >= 8 位；② 必须同时含字母与数字；③ 不得与原密码相同。
 *   原密码错误**限速**：连续 5 次 ⇒ 锁定 15 分钟（内存实现，**重启即清零**；多实例部署下各自计数）。
 *   顺序：① 锁定判定 ⇒ ② 强度校验（失败**不计入**错误次数，避免自锁）⇒ ③ 原密码校验（失败累计）⇒ ④ 落库并清零。
 *   日志只记 userId + 原因分类，**不记任何明文/哈希**。
 */
export const PWD_MIN_LEN = 8;
export const PWD_FAIL_THRESHOLD = 5;
export const PWD_LOCK_MS = 15 * 60 * 1000;
const pwdGuard = new Map();   // userId -> { fails, lockedUntil }

// 测试钩子：清空限速状态（生产不使用）
export function __resetPasswordGuard() { pwdGuard.clear(); }

// 剩余锁定毫秒（0 = 未锁定）
export function lockRemainingMs(userId, now = Date.now()) {
  const st = pwdGuard.get(userId);
  if (!st || !st.lockedUntil) return 0;
  return st.lockedUntil > now ? st.lockedUntil - now : 0;
}

// 记一次原密码错误：达阈值 ⇒ 置锁定并返回 locked=true
export function noteOldPasswordFailure(userId, now = Date.now()) {
  const st = pwdGuard.get(userId) || { fails: 0, lockedUntil: 0 };
  st.fails += 1;
  let locked = false;
  if (st.fails >= PWD_FAIL_THRESHOLD) { st.lockedUntil = now + PWD_LOCK_MS; st.fails = 0; locked = true; }
  pwdGuard.set(userId, st);
  return { fails: st.fails, locked, retryAfterMs: lockRemainingMs(userId, now) };
}

export function clearOldPasswordFailures(userId) { pwdGuard.delete(userId); }

// 强度校验（纯函数；前端 passwordPolicy.js 使用同一套中文文案）：返回 { ok, code, message, reason }
export function validateSelfServicePassword(oldPassword, newPassword) {
  const pwd = typeof newPassword === 'string' ? newPassword : '';
  const oldPwd = typeof oldPassword === 'string' ? oldPassword : '';
  if (pwd.length < PWD_MIN_LEN) return { ok: false, code: 1001, message: '新密码至少 ' + PWD_MIN_LEN + ' 位', reason: 'too_short' };
  if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) return { ok: false, code: 1001, message: '新密码需同时包含字母和数字', reason: 'need_letter_digit' };
  if (oldPwd && pwd === oldPwd) return { ok: false, code: 1001, message: '新密码不能与原密码相同', reason: 'same_as_old' };
  return { ok: true, code: 0, message: '', reason: null };
}

export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    // ① 锁定判定：锁定期间即使密码正确也拒绝（HTTP 429 + 明确文案）
    const lockedMs = lockRemainingMs(userId);
    if (lockedMs > 0) {
      const mins = Math.max(1, Math.ceil(lockedMs / 60000));
      logger.warn({ userId, reason: 'locked' }, '改密码被拒：锁定中');
      return res.status(429).json({ code: 1002, message: '原密码错误次数过多，请 ' + mins + ' 分钟后再试', data: null });
    }

    // ② 强度校验：失败**不计入**错误次数（否则用户会被自己的输入错误锁死）
    const strength = validateSelfServicePassword(oldPassword, newPassword);
    if (!strength.ok) {
      logger.warn({ userId, reason: strength.reason }, '改密码被拒：强度不足');
      return res.status(400).json({ code: strength.code, message: strength.message, data: null });
    }

    // ③ 原密码校验（失败累计；达阈值 ⇒ 本次即返回锁定文案）
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const isMatch = !!user && bcrypt.compareSync(String(oldPassword == null ? '' : oldPassword), user.password);
    if (!isMatch) {
      const st = noteOldPasswordFailure(userId);
      if (st.locked) {
        logger.warn({ userId, reason: 'lock_triggered' }, '改密码被拒：达到错误阈值');
        return res.status(429).json({ code: 1002, message: '原密码错误次数过多，请 ' + Math.round(PWD_LOCK_MS / 60000) + ' 分钟后再试', data: null });
      }
      logger.warn({ userId, reason: 'bad_old_password', fails: st.fails }, '改密码被拒：原密码错误');
      return res.status(400).json({ code: 1001, message: '原密码错误', data: null });
    }

    // ④ 落库 + 成功清零
    const hashed = bcrypt.hashSync(newPassword, 10);
    // ★R2-B67：设密路径①——自助改密：同时写 password_changed_at ⇒ 本用户所有旧令牌立即失效
    // ★H6（W2-P2c）：**同一条 update 内**同时清 must_change_password（原子）—— 两列必须同处落库，否则留下两种半状态：
    //   ① 只清标志不写时间 ⇒ 旧令牌仍可用（改密形同未生效）；② 只写时间不清标志 ⇒ 本账号被强制改密闸门永久拦截（不可自愈）。
    await prisma.user.update({ where: { id: userId }, data: { password: hashed, passwordChangedAt: new Date(), mustChangePassword: false } });
    clearOldPasswordFailures(userId);

    logger.info({ userId }, '密码修改成功');

    res.json({ code: 0, message: '密码修改成功', data: null });
  } catch (err) {
    logger.error({ err }, '修改密码失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
