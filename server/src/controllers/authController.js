import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

export const login = async (req, res) => {
  try {
    const { username, password, schoolCode } = req.body;
    if (!username || !password) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }

    // schoolCode 存在时，用户已选择学校 → 精确匹配
    const lookupUsername = schoolCode ? `${username}@${schoolCode}` : username;

    let user = await prisma.user.findUnique({ where: { username: lookupUsername } });

    if (!user) {
      // 精确匹配不到，尝试多学校学生查询
      if (!schoolCode && !username.includes('@')) {
        const students = await prisma.user.findMany({
          where: { username: { startsWith: username + '@' }, role: 'student' },
        });

        if (students.length === 0) {
          return res.status(400).json({ code: 1001, message: '用户名或密码错误', data: null });
        }

        if (students.length === 1) {
          user = students[0];
        } else {
          // 多个学校有相同学号 → 返回学校列表让用户选择
          const codes = [...new Set(students.map(s => s.username.split('@')[1]))];
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
      } else {
        return res.status(400).json({ code: 1001, message: '用户名或密码错误', data: null });
      }
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      // 如果选了学校 or 学生多学校查询唯一命中时，密码错误也统一提示
      return res.status(400).json({ code: 1001, message: '用户名或密码错误', data: null });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'exam_system_fallback_secret',
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

export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const isMatch = bcrypt.compareSync(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ code: 1001, message: '原密码错误', data: null });
    }

    const hashed = bcrypt.hashSync(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });

    logger.info({ userId: user.id }, '密码修改成功');

    res.json({ code: 0, message: '密码修改成功', data: null });
  } catch (err) {
    logger.error({ err }, '修改密码失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
