import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { getJwtSecret } from '../config/jwtSecret.js';   // ★R2-B60：与中间件共用同一密钥解析（消除两处兜底）

export const login = async (req, res) => {
  try {
    const { username, password, schoolCode } = req.body;
    if (!username || !password) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }

    // schoolCode 存在时 → 精确匹配 username@schoolCode
    const lookupUsername = schoolCode ? `${username}@${schoolCode}` : username;

    let user = null;
    const isStudentLogin = !username.includes('@') && !schoolCode;

    // 学生登录：优先匹配新格式（学号@院校代码），避免旧格式空壳用户抢先命中
    if (isStudentLogin) {
      const newStudents = await prisma.user.findMany({
        where: { username: { startsWith: username + '@' }, role: 'student', deletedAt: null },
      });

      if (newStudents.length === 1) {
        user = newStudents[0];
      } else if (newStudents.length > 1) {
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

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      // 如果选了学校 or 学生多学校查询唯一命中时，密码错误也统一提示
      return res.status(400).json({ code: 1001, message: '用户名或密码错误', data: null });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
    await prisma.user.update({ where: { id: userId }, data: { password: hashed, passwordChangedAt: new Date() } });
    clearOldPasswordFailures(userId);

    logger.info({ userId }, '密码修改成功');

    res.json({ code: 0, message: '密码修改成功', data: null });
  } catch (err) {
    logger.error({ err }, '修改密码失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
