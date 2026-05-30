import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

function getSchoolId(req) { return req.query.schoolId ? +req.query.schoolId : null; }

// ===== 我的团队列表 =====
export const getTeams = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ code: 0, data: [] });

    const list = await prisma.team.findMany({
      where: {
        schoolId,
        teachers: { some: { teacherId: req.user.id } },
      },
      include: {
        creator: { select: { id: true, realName: true } },
        _count: { select: { teachers: true, classes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, data: list });
  } catch (err) {
    logger.error({ err }, '获取团队列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===== 团队详情 =====
export const getTeam = async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: +req.params.id },
      include: {
        creator: { select: { id: true, realName: true } },
        teachers: { include: { teacher: { select: { id: true, username: true, realName: true } } } },
        classes: { include: { class: { select: { id: true, name: true } } } },
      },
    });
    if (!team) return res.status(404).json({ code: 1004, message: '团队不存在', data: null });
    res.json({ code: 0, data: team });
  } catch (err) {
    logger.error({ err }, '获取团队详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===== 创建团队 =====
export const createTeam = async (req, res) => {
  try {
    const { name } = req.body;
    const schoolId = getSchoolId(req);
    if (!name || !schoolId) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    const team = await prisma.team.create({
      data: {
        name,
        schoolId,
        createdBy: req.user.id,
        teachers: { create: { teacherId: req.user.id } },
      },
    });
    logger.info({ teamId: team.id }, '团队已创建');
    res.json({ code: 0, message: '创建成功', data: team });
  } catch (err) {
    logger.error({ err }, '创建团队失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===== 更新团队（增删教师、班级） =====
export const updateTeam = async (req, res) => {
  try {
    const id = +req.params.id;
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) return res.status(404).json({ code: 1004, message: '团队不存在', data: null });

    const { name, teacherIds, classIds } = req.body;
    if (name !== undefined) {
      await prisma.team.update({ where: { id }, data: { name } });
    }
    if (teacherIds !== undefined) {
      await prisma.teamTeacher.deleteMany({ where: { teamId: id } });
      if (teacherIds.length > 0) {
        await prisma.teamTeacher.createMany({ data: teacherIds.map(tid => ({ teamId: id, teacherId: +tid })) });
      }
    }
    if (classIds !== undefined) {
      await prisma.teamClass.deleteMany({ where: { teamId: id } });
      if (classIds.length > 0) {
        await prisma.teamClass.createMany({ data: classIds.map(cid => ({ teamId: id, classId: +cid })) });
      }
    }
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    logger.error({ err }, '更新团队失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===== 删除团队（仅创建者） =====
export const deleteTeam = async (req, res) => {
  try {
    const id = +req.params.id;
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) return res.status(404).json({ code: 1004, message: '团队不存在', data: null });
    if (team.createdBy !== req.user.id) return res.status(403).json({ code: 1003, message: '仅创建者可删除团队', data: null });

    await prisma.team.delete({ where: { id } });
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除团队失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===== 退出团队 =====
export const leaveTeam = async (req, res) => {
  try {
    const id = +req.params.id;
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) return res.status(404).json({ code: 1004, message: '团队不存在', data: null });
    if (team.createdBy === req.user.id) return res.status(400).json({ code: 1001, message: '创建者不可退出，请删除团队', data: null });

    await prisma.teamTeacher.delete({ where: { teamId_teacherId: { teamId: id, teacherId: req.user.id } } });
    res.json({ code: 0, message: '已退出团队', data: null });
  } catch (err) {
    logger.error({ err }, '退出团队失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===== 获取教师可见班级（直连+团队） =====
export async function getVisibleClassIds(teacherId, schoolId) {
  const direct = await prisma.teacherClass.findMany({ where: { teacherId }, select: { classId: true } });
  const directIds = direct.map(d => d.classId);

  const teamIds = (await prisma.teamTeacher.findMany({ where: { teacherId }, select: { teamId: true } })).map(t => t.teamId);
  let teamClassIds = [];
  if (teamIds.length > 0) {
    const tcs = await prisma.teamClass.findMany({ where: { teamId: { in: teamIds } }, select: { classId: true } });
    teamClassIds = [...new Set(tcs.map(tc => tc.classId))];
  }
  return [...new Set([...directIds, ...teamClassIds])];
}

// ===== 获取教师团队内的其他教师ID（用于作业/审核共享） =====
export async function getTeamTeacherIds(teacherId, schoolId) {
  const teamIds = (await prisma.teamTeacher.findMany({ where: { teacherId }, select: { teamId: true } })).map(t => t.teamId);
  if (!teamIds.length) return [];
  const members = await prisma.teamTeacher.findMany({ where: { teamId: { in: teamIds } }, select: { teacherId: true } });
  return [...new Set(members.map(m => m.teacherId))];
}
