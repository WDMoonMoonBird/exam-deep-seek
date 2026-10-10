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
    // 归属校验（round 6）：不得在自己不属于的学校建团队（判据同 switchClassSchool 的 teacherSchool）
    const inSchool = await prisma.teacherSchool.findFirst({
      where: { teacherId: req.user.id, schoolId },
      select: { schoolId: true },
    });
    if (!inSchool) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

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
    // 归属校验（round 6）：仅创建者或团队成员可改；非成员一律 403 且零写入（在任何写库动作之前）。
    // 成员互改名单的治理语义属拍板项 R6-P10，本轮只堵「非成员」这一确定越权面。
    if (team.createdBy !== req.user.id) {
      const member = await prisma.teamTeacher.findFirst({
        where: { teamId: id, teacherId: req.user.id },
        select: { teamId: true },
      });
      if (!member) return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

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

// ===== 获取教师所属团队 ID（body 目标团队的归属校验用） =====
/**
 * 获取教师所属的团队 ID 列表。
 *
 * 用途：写端点收到 body.teamIds 时，必须校验 teamIds ⊆ 本集合（否则教师可把
 * 自己的班级挂进**他人团队**，从而放大该团队成员的可见集 —— round 6 §3.2 第一环）。
 *
 * @param {number} teacherId 教师 ID
 * @returns {Promise<number[]>} 去重后的团队 ID
 */
export async function getMyTeamIds(teacherId) {
  const rows = await prisma.teamTeacher.findMany({ where: { teacherId }, select: { teamId: true } });
  return [...new Set(rows.map(r => r.teamId))];
}

// ===== 获取教师可见班级（直连+团队） =====
/**
 * 获取教师可见班级 ID（直连班级 + 团队共享班级）。
 *
 * schoolId 生效：传入时只返回「班级所属学校 === 该校」的班级（两条来源都过滤），
 * 防止教师用某校 schoolId 带出另一所学校的班级数据；schoolId 为空时保持改造前行为
 * （返回全部可见班级 ID），避免影响未传 schoolId 的既有调用方。
 *
 * @param {number} teacherId 教师 ID
 * @param {number|string|null} [schoolId] 学校 ID；为空/非法时不做学校过滤
 * @returns {Promise<number[]>} 去重后的可见班级 ID
 */
export async function getVisibleClassIds(teacherId, schoolId) {
  const sid = schoolId ? +schoolId : null;
  const classScope = sid ? { class: { schoolId: sid } } : {};

  const direct = await prisma.teacherClass.findMany({
    where: { teacherId, ...classScope },
    select: { classId: true },
  });
  const directIds = direct.map(d => d.classId);

  const teamIds = (await prisma.teamTeacher.findMany({ where: { teacherId }, select: { teamId: true } })).map(t => t.teamId);
  let teamClassIds = [];
  if (teamIds.length > 0) {
    const tcs = await prisma.teamClass.findMany({
      where: { teamId: { in: teamIds }, ...classScope },
      select: { classId: true },
    });
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
