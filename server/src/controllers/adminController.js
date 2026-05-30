import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// ===================== 学校管理 =====================

export const getSchools = async (req, res) => {
  try {
    const list = await prisma.school.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取学校列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createSchool = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ code: 1001, message: '校名不能为空', data: null });
    const school = await prisma.school.create({ data: { name } });
    logger.info({ schoolId: school.id }, '学校已创建');
    res.json({ code: 0, message: '创建成功', data: school });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '校名已存在', data: null });
    logger.error({ err }, '创建学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const school = await prisma.school.update({ where: { id: +id }, data: { name } });
    res.json({ code: 0, message: '更新成功', data: school });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '校名已存在', data: null });
    logger.error({ err }, '更新学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteSchool = async (req, res) => {
  try {
    const id = +req.params.id;
    const classes = await prisma.class.findMany({ where: { schoolId: id }, select: { id: true } });
    const classIds = classes.map((c) => c.id);
    await prisma.$transaction([
      prisma.studentClass.deleteMany({ where: { classId: { in: classIds } } }),
      prisma.teacherClass.deleteMany({ where: { classId: { in: classIds } } }),
      prisma.assignmentClass.deleteMany({ where: { classId: { in: classIds } } }),
      prisma.class.deleteMany({ where: { schoolId: id } }),
      prisma.school.delete({ where: { id } }),
    ]);
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 班级管理 =====================

export const getClasses = async (req, res) => {
  try {
    const { schoolId } = req.query;
    const where = schoolId ? { schoolId: +schoolId } : {};
    const list = await prisma.class.findMany({
      where,
      include: { school: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取班级列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createClass = async (req, res) => {
  try {
    const { name, schoolId, teacherIds } = req.body;
    if (!name || !schoolId) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    const cls = await prisma.class.create({
      data: {
        name,
        schoolId: +schoolId,
        teacherClasses: teacherIds?.length
          ? { create: teacherIds.map((tid) => ({ teacherId: +tid })) }
          : undefined,
      },
    });
    logger.info({ classId: cls.id }, '班级已创建');
    res.json({ code: 0, message: '创建成功', data: cls });
  } catch (err) {
    logger.error({ err }, '创建班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, schoolId, teacherIds } = req.body;

    // 更新班级基本信息
    await prisma.class.update({ where: { id: +id }, data: { name, schoolId: +schoolId } });

    // 重建教师关联
    if (teacherIds !== undefined) {
      await prisma.teacherClass.deleteMany({ where: { classId: +id } });
      if (teacherIds.length > 0) {
        await prisma.teacherClass.createMany({
          data: teacherIds.map((tid) => ({ teacherId: +tid, classId: +id })),
        });
      }
    }

    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    logger.error({ err }, '更新班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteClass = async (req, res) => {
  try {
    const id = +req.params.id;
    await prisma.$transaction([
      prisma.studentClass.deleteMany({ where: { classId: id } }),
      prisma.teacherClass.deleteMany({ where: { classId: id } }),
      prisma.assignmentClass.deleteMany({ where: { classId: id } }),
      prisma.class.delete({ where: { id } }),
    ]);
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 教师管理 =====================

export const getTeachers = async (req, res) => {
  try {
    const list = await prisma.user.findMany({
      where: { role: 'teacher' },
      select: { id: true, username: true, realName: true, createdAt: true, teacherSchools: { include: { school: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取教师列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createTeacher = async (req, res) => {
  try {
    const { username, realName, schoolIds } = req.body;
    if (!username || !realName) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    const teacher = await prisma.user.create({
      data: {
        username, realName, password: bcrypt.hashSync(username, 10), role: 'teacher',
        teacherSchools: schoolIds?.length ? { create: schoolIds.map(sid => ({ schoolId: +sid })) } : undefined,
      },
      select: { id: true, username: true, realName: true, role: true, createdAt: true },
    });
    logger.info({ teacherId: teacher.id }, '教师已创建');
    res.json({ code: 0, message: '创建成功', data: teacher });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '工号已存在', data: null });
    logger.error({ err }, '创建教师失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { realName, schoolIds } = req.body;
    const data = {};
    if (realName !== undefined) data.realName = realName;
    await prisma.user.update({ where: { id: +id, role: 'teacher' }, data });

    // 重建学校关联
    if (schoolIds !== undefined) {
      await prisma.teacherSchool.deleteMany({ where: { teacherId: +id } });
      if (schoolIds.length > 0) {
        await prisma.teacherSchool.createMany({ data: schoolIds.map(sid => ({ teacherId: +id, schoolId: +sid })) });
      }
      // 如果当前 lastSchoolId 不在新列表中，清空
      const user = await prisma.user.findUnique({ where: { id: +id } });
      if (user.lastSchoolId && !schoolIds.includes(user.lastSchoolId)) {
        await prisma.user.update({ where: { id: +id }, data: { lastSchoolId: null } });
      }
    }
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    logger.error({ err }, '更新教师失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 学生管理 =====================

export const getStudents = async (req, res) => {
  try {
    const { classId } = req.query;
    const where = { role: 'student' };
    if (classId) {
      where.studentClasses = { some: { classId: +classId } };
    }
    const list = await prisma.user.findMany({
      where,
      select: {
        id: true, username: true, realName: true, createdAt: true,
        studentClasses: { include: { class: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取学生列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createStudent = async (req, res) => {
  try {
    const { username, realName, classIds } = req.body;
    if (!username || !realName) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    const student = await prisma.user.create({
      data: {
        username,
        realName,
        password: bcrypt.hashSync(username, 10),
        role: 'student',
        studentClasses: classIds?.length
          ? { create: classIds.map((cid) => ({ classId: +cid })) }
          : undefined,
      },
      select: { id: true, username: true, realName: true, role: true, createdAt: true },
    });
    logger.info({ studentId: student.id }, '学生已创建');
    res.json({ code: 0, message: '创建成功', data: student });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '学号已存在', data: null });
    logger.error({ err }, '创建学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
