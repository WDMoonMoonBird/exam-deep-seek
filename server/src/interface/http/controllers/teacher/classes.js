/**
 * classes.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 830-1001）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { getVisibleClassIds } from '../../../../controllers/teamController.js';
import { getSchoolId, canTeacherManageClass, canTeacherManageTeams, isTeacherInSchool } from './guards.js';

// ===================== 学校 & 班级管理（教师仅看自己的） =====================

export const getMySchools = async (req, res) => {
  try {
    const tss = await prisma.teacherSchool.findMany({
      where: { teacherId: req.user.id },
      include: { school: true },
    });
    res.json({ code: 0, message: 'ok', data: tss.map(ts => ts.school) });
  } catch (err) {
    logger.error({ err }, '获取我的学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getAllClasses = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ code: 0, message: 'ok', data: [] });
    const visibleIds = await getVisibleClassIds(req.user.id, schoolId);
    // 获取教师直连班级 ID
    const directIds = (await prisma.teacherClass.findMany({ where: { teacherId: req.user.id }, select: { classId: true } })).map(d => d.classId);
    const list = await prisma.class.findMany({
      where: { id: { in: visibleIds }, schoolId },
      include: { school: true, teacherClasses: { include: { teacher: { select: { id: true, username: true, realName: true } } } }, teamClasses: { select: { teamId: true } }, _count: { select: { studentClasses: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // 标记团队班级和归属教师
    const result = list.map(c => ({
      ...c,
      isTeamClass: !directIds.includes(c.id),
      ownerTeacherName: c.teacherClasses?.[0]?.teacher?.realName || '',
    }));
    res.json({ code: 0, message: 'ok', data: result });
  } catch (err) {
    logger.error({ err }, '获取班级列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createClass = async (req, res) => {
  try {
    const { name, teamIds } = req.body;
    const schoolId = getSchoolId(req);
    if (!name || !schoolId) return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    // 归属校验（round 6）：① 不得在自己不属于的学校建班；② body.teamIds ⊆ 本人团队。均在任何写库动作之前
    if (!(await isTeacherInSchool(req.user.id, schoolId))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    if (!(await canTeacherManageTeams(req.user.id, teamIds))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    const cls = await prisma.class.create({
      data: { name, schoolId, teacherClasses: { create: { teacherId: req.user.id } } },
    });
    if (teamIds?.length) {
      await prisma.teamClass.createMany({
        data: teamIds.map(tid => ({ teamId: +tid, classId: cls.id })),
      });
    }
    logger.info({ classId: cls.id }, '教师创建了班级');
    res.json({ code: 0, message: '创建成功', data: cls });
  } catch (err) {
    logger.error({ err }, '创建班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, teamIds } = req.body;
    const schoolId = getSchoolId(req);
    // 归属校验（S-2）：必须在任何写库动作之前；未命中 → 403 零写入
    if (!(await canTeacherManageClass(req.user.id, id, schoolId))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    // 归属校验（round 6 · body 目标）：teamIds 必须 ⊆ 本人团队 —— 否则可把班级挂进他人团队，
    // 使该团队成员在 getVisibleClassIds 中获得写权限（C 实测 403→200 链的第一环）
    if (!(await canTeacherManageTeams(req.user.id, teamIds))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    await prisma.class.update({ where: { id: +id }, data: { name, schoolId } });
    if (teamIds !== undefined) {
      await prisma.teamClass.deleteMany({ where: { classId: +id } });
      if (teamIds.length > 0) {
        await prisma.teamClass.createMany({ data: teamIds.map(tid => ({ teamId: +tid, classId: +id })) });
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
    // 归属校验（S-2）：必须在 $transaction 之外、之前完成；未命中 → 403 零写入
    if (!(await canTeacherManageClass(req.user.id, id, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
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

export const switchClassSchool = async (req, res) => {
  try {
    const classId = +req.params.id;
    const { newSchoolId } = req.body;
    if (!newSchoolId) return res.status(400).json({ code: 1001, message: '请选择目标学校', data: null });

    // 查班级 + 当前学校 + 教师权限
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { school: { select: { id: true, name: true } } },
    });
    if (!cls) return res.status(404).json({ code: 1004, message: '班级不存在', data: null });

    const oldSchoolId = cls.schoolId;
    if (oldSchoolId === newSchoolId) return res.status(400).json({ code: 1001, message: '目标学校与当前学校相同', data: null });

    // 验证教师属于当前班级
    const tc = await prisma.teacherClass.findFirst({ where: { teacherId: req.user.id, classId } });
    if (!tc) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    // 验证教师同时属于新旧两校
    const [oldBelongs, newBelongs] = await Promise.all([
      prisma.teacherSchool.findFirst({ where: { teacherId: req.user.id, schoolId: oldSchoolId } }),
      prisma.teacherSchool.findFirst({ where: { teacherId: req.user.id, schoolId: +newSchoolId } }),
    ]);
    if (!oldBelongs) return res.status(403).json({ code: 1003, message: '无权操作当前学校', data: null });
    if (!newBelongs) return res.status(403).json({ code: 1003, message: '你不属于目标学校', data: null });

    // 查目标学校信息
    const newSchool = await prisma.school.findUnique({ where: { id: +newSchoolId }, select: { id: true, name: true } });

    // 查出将被移除的团队
    const existingTeams = await prisma.teamClass.findMany({
      where: { classId },
      include: { team: { select: { name: true } } },
    });

    // 原子操作
    await prisma.$transaction([
      prisma.class.update({ where: { id: classId }, data: { schoolId: +newSchoolId } }),
      prisma.teamClass.deleteMany({ where: { classId } }),
    ]);

    const removedTeamNames = existingTeams.map(tc => tc.team.name);
    logger.info({ classId, oldSchoolId, newSchoolId, removedTeams: removedTeamNames }, '班级已切换学校');

    res.json({
      code: 0,
      message: `已从「${cls.school.name}」迁移至「${newSchool.name}」${removedTeamNames.length ? '，已退出团队：' + removedTeamNames.join('、') : ''}`,
      data: { oldSchoolId, newSchoolId: +newSchoolId, school: newSchool, removedTeams: removedTeamNames },
    });
  } catch (err) {
    logger.error({ err }, '切换班级学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
