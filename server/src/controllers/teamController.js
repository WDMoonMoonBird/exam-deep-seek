import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * ★R3-R4（P1，2026-10-18）：query.schoolId 是**客户端可控输入**（桌面端 request.js 拦截器会自动
 * 注入 localStorage 里的 currentSchool.id，而 currentSchool 又来自未做归属校验的 switch-school 返回值），
 * 不能作为租户/授权基准。解析口径：未传 ⇒ null（沿用旧行为）；非正整数 ⇒ NaN（调用方 fail-closed 403）。
 */
function parseQuerySchoolId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const schoolId = Number(raw);
  return Number.isInteger(schoolId) && schoolId > 0 ? schoolId : NaN;
}

/**
 * ★R3-R4：教师是否属于该学校（判据与 interface/http/controllers/teacher/guards.js 的
 * isTeacherInSchool 同源）。本文件**内联实现**以避免 controller → interface 反向依赖
 * （层次门禁基线 0 条，见 server/scripts/check-layers.mjs）。
 */
async function isTeacherInSchool(teacherId, schoolId) {
  const sid = Number(schoolId);
  if (!Number.isInteger(sid) || sid <= 0) return false;
  const link = await prisma.teacherSchool.findFirst({
    where: { teacherId, schoolId: sid },
    select: { schoolId: true },
  });
  return !!link;
}

// ===== 我的团队列表 =====
export const getTeams = async (req, res) => {
  try {
    const schoolId = parseQuerySchoolId(req.query.schoolId);
    // 未传 schoolId：维持既有语义（无当前学校视图 ⇒ 空列表）
    if (schoolId === null) return res.json({ code: 0, data: [] });
    // ★R3-R4：query 校必须经 teacherSchool 归属校验；非法/跨校一律 fail-closed 403
    if (!(await isTeacherInSchool(req.user.id, schoolId))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

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
    // ★H3：归属校验 —— 仅「团队成员」或「同校教师」可读；越权与不存在**同响 404**（不泄漏存在性）。
    const mySchools = await prisma.teacherSchool.findMany({
      where: { teacherId: req.user.id },
      select: { schoolId: true },
    });
    const team = await prisma.team.findFirst({
      where: {
        id: +req.params.id,
        OR: [
          { teachers: { some: { teacherId: req.user.id } } },
          { schoolId: { in: mySchools.map(s => s.schoolId) } },
        ],
      },
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
    const schoolId = parseQuerySchoolId(req.query.schoolId);
    if (!name || schoolId === null || Number.isNaN(schoolId)) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }
    // 归属校验（round 6）：不得在自己不属于的学校建团队（判据同 switchClassSchool 的 teacherSchool）
    // ★R3-R4：复用本地 helper（判据不变，行为等价）——建团队路径签名服务器数据同源校验，不存在跨校注入面。
    if (!(await isTeacherInSchool(req.user.id, schoolId))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

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

    // ★R3-R4（P1，2026-10-18）：**授权基准改为 team.schoolId（服务端数据）**，query.schoolId 只做一致性核对。
    //   修复前：teacherIds/classIds 的校验基准取自 req.query.schoolId ⇒ 多校教师传 ?schoolId=另一校
    //   即可把另一校教师/班级写进本团队（跨校授权注入）。现口径（全部前置到写库动作之前，零部分写入）：
    //     ① team.schoolId 缺失（历史脏行）⇒ fail-closed 403，绝不回退 query；
    //     ② 操作者必须仍属于团队所在校（成员关系之外再绑学校，防离校后仍可操控团队）；
    //     ③ query.schoolId 存在时必须等于 team.schoolId（旧客户端传本校 query 的行为不变）。
    if (!team.schoolId || !(await isTeacherInSchool(req.user.id, team.schoolId))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    const requestedSchoolId = parseQuerySchoolId(req.query.schoolId);
    if (requestedSchoolId !== null && requestedSchoolId !== team.schoolId) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

    const { name, teacherIds, classIds } = req.body;
    // 内容校验（round 7 · 阻断 C6-1）：classIds 必须 ⊆ 本人可见班级（直连 ∪ 团队），
    // 且**前置到全部写库动作之前**——否则「挂他人班级进自有团队」会先改名成功再 403（部分写入），
    // 更严重的是：他人班级经 teamClass 进入 getVisibleClassIds ⇒ 本文件其余写守卫对其一律放行
    // （C 实测跨租户改班 → 重置他生口令 → 越权建学生，四条 200 真实落库）。
    // 空数组 = 清空团队班级关联（只减不增）⇒ 放行，语义同 canTeacherManageClasses。
    // 治理边界：本轮只校验「内容归属」，成员/创建者可否改名单 = 拍板项 R6-P10（未扩大）。
    if (classIds?.length) {
      // ★R3-R4：可见集基准 = team.schoolId（不再使用 query.schoolId）
      const visibleIds = await getVisibleClassIds(req.user.id, team.schoolId);
      if (!classIds.every(cid => visibleIds.includes(+cid))) {
        return res.status(403).json({ code: 1003, message: '无权操作', data: null });
      }
    }
    // ★M2（W2-P2）：**权限放大** —— 原实现完全不校验 teacherIds ⇒ 可把任意 userId 拉进自有团队
    //   （团队数据面对其可见，等同越权授权）。口径：teacherIds 必须 ⊆ **本校教师集合**；
    //   空数组 = 清空成员（只减不增）⇒ 放行；与 classIds 同层、**前置到全部写库动作之前**。
    if (teacherIds?.length) {
      const schoolTeachers = await prisma.teacherSchool.findMany({
        where: { schoolId: team.schoolId },   // ★R3-R4：本校教师集合基准 = team.schoolId
        select: { teacherId: true },
      });
      const allowedTeacherIds = new Set(schoolTeachers.map((t) => t.teacherId));
      if (!teacherIds.every((tid) => allowedTeacherIds.has(+tid))) {
        return res.status(403).json({ code: 1003, message: "包含非本校教师", data: null });
      }
    }

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
export async function getTeamTeacherIds(teacherId) {
  const teamIds = (await prisma.teamTeacher.findMany({ where: { teacherId }, select: { teamId: true } })).map(t => t.teamId);
  if (!teamIds.length) return [];
  const members = await prisma.teamTeacher.findMany({ where: { teamId: { in: teamIds } }, select: { teacherId: true } });
  return [...new Set(members.map(m => m.teacherId))];
}
