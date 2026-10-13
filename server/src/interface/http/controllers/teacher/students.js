/**
 * students.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 1003-1285）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import bcrypt from 'bcryptjs';
import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { getVisibleClassIds } from '../../../../controllers/teamController.js';
import { getSchoolId, canTeacherManageClass, canTeacherManageStudent } from './guards.js';
import { parsePaging, shapeList, pagingArgs } from './paging.js';

// ===================== 学生管理 =====================

export const getMyStudents = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { classId } = req.query;
    if (!schoolId) return res.json({ code: 0, message: 'ok', data: shapeList(parsePaging(req.query), [], 0) });

    // 查教师可见班级（直连+团队）
    let classIds = await getVisibleClassIds(req.user.id, schoolId);

    if (classId && classIds.includes(+classId)) {
      classIds = [+classId];
    }
    if (classIds.length === 0) return res.json({ code: 0, message: 'ok', data: shapeList(parsePaging(req.query), [], 0) });

    const { keyword } = req.query;
    const where = { role: 'student', studentClasses: { some: { classId: { in: classIds } } } };
    if (keyword) where.realName = { contains: keyword };

    // ★R2-B47 / U-2：服务端分页（不传 page/pageSize ⇒ 全量数组，向后兼容）；★字段最小化：显式 select，
    //   绝不带 password/手机号/证件号等敏感列，class/school 也只取必要字段。
    const paging = parsePaging(req.query);
    const [students, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, username: true, realName: true, createdAt: true,
          studentClasses: {
            select: {
              classId: true,
              class: { select: { id: true, name: true, school: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { username: 'asc' },
        ...pagingArgs(paging),
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ code: 0, message: 'ok', data: shapeList(paging, students, total) });
  } catch (err) {
    logger.error({ err }, '获取学生列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getMyClasses = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ code: 0, message: 'ok', data: [] });
    // ★R2-B47 / U-2：服务端分页（不传参数 ⇒ 全量数组，向后兼容既有下拉/选择器调用方）
    const paging = parsePaging(req.query);
    const where = { schoolId };
    const [list, total] = await Promise.all([
      prisma.class.findMany({ where, include: { school: true }, orderBy: { createdAt: 'desc' }, ...pagingArgs(paging) }),
      prisma.class.count({ where }),
    ]);
    res.json({ code: 0, message: 'ok', data: shapeList(paging, list, total) });
  } catch (err) {
    logger.error({ err }, '获取教师班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { realName, classId, newUsername } = req.body;

    // 先查当前学生
    const student = await prisma.user.findFirst({ where: { id: +id, role: 'student' } });
    if (!student) return res.status(404).json({ code: 1004, message: '学生不存在', data: null });
    // 归属校验（S-2）：既有 404 分支保持原位；此处必须在任何写库动作之前，未命中 → 403 零写入
    if (!(await canTeacherManageStudent(req.user.id, id, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    // 归属校验（round 6 · body 目标）：目标班级 classId ∈ 本人可见班级。
    // 源侧已由上方 canTeacherManageStudent 覆盖（不要求「全部源班级可见」= 保留多班共管语义）；
    // 缺此目标侧校验时，可把学生移入他人班级 ⇒ 他人教师即刻获得该生管理权（账号接管面）
    if (classId && !(await canTeacherManageClass(req.user.id, classId, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

    const data = {};
    if (realName !== undefined) data.realName = realName;

    // 补全临时学号：如果当前用户名含 tmp_，且传入了新学号
    if (newUsername && student.username.startsWith('tmp_')) {
      const code = student.username.split('@')[1]; // 保留原学校代码
      const fullNew = newUsername.includes('@') ? newUsername : `${newUsername}@${code}`;

      // 显式查重，避免修改到已存在的学号
      const existing = await prisma.user.findUnique({ where: { username: fullNew } });
      if (existing && existing.id !== +id) {
        return res.status(400).json({ code: 1001, message: '该学号已被使用，无法保存', data: null });
      }

      data.username = fullNew;
      data.password = bcrypt.hashSync(newUsername.includes('@') ? newUsername.split('@')[0] : newUsername, 10);
      data.passwordChangedAt = new Date(); // ★R2-B67：改学号即改密 ⇒ 旧令牌失效
    }

    // 如果姓名从"(待补全)"变为真实姓名，重置密码
    if (realName && student.realName === '(待补全)' && realName !== '(待补全)') {
      const sid = (data.username || student.username).split('@')[0];
      if (!sid.startsWith('tmp_')) {
        data.password = bcrypt.hashSync(sid, 10);
        data.passwordChangedAt = new Date(); // ★R2-B67：补全姓名即重置密码 ⇒ 旧令牌失效
      }
    }

    await prisma.user.update({ where: { id: +id, role: 'student' }, data });
    // 更新班级
    if (classId) {
      await prisma.studentClass.deleteMany({ where: { studentId: +id } });
      await prisma.studentClass.create({ data: { studentId: +id, classId: +classId } });
    }
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '学号已存在', data: null });
    logger.error({ err }, '更新学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    // 归属校验（S-2）：必须在 $transaction 之外、之前完成；未命中 → 403 零写入
    if (!(await canTeacherManageStudent(req.user.id, id, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    // 软删除：移除班级关联 + 标记删除
    await prisma.$transaction([
      prisma.studentClass.deleteMany({ where: { studentId: +id } }),
      prisma.submission.deleteMany({ where: { studentId: +id } }),
      prisma.user.delete({ where: { id: +id, role: 'student' } }),
    ]);
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const resetStudentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await prisma.user.findFirst({ where: { id: +id, role: 'student' } });
    if (!student) return res.status(404).json({ code: 1004, message: '学生不存在', data: null });
    // 归属校验（S-2）：越权判定优先于业务分支；未命中 → 403 零写入（不泄漏该生学号状态）
    if (!(await canTeacherManageStudent(req.user.id, id, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

    // 密码重置为学号（去掉@学校代码部分）
    const sid = student.username.split('@')[0];
    if (sid.startsWith('tmp_')) {
      return res.status(400).json({ code: 1001, message: '该学生信息尚未补全，请先补全学号', data: null });
    }

    const newPassword = bcrypt.hashSync(sid, 10);
    // ★R2-B67：设密路径③——教师重置学生密码
    await prisma.user.update({ where: { id: +id }, data: { password: newPassword, passwordChangedAt: new Date() } });
    logger.info({ studentId: id }, '学生密码已重置');
    res.json({ code: 0, message: `密码已重置为学号（${sid}）`, data: null });
  } catch (err) {
    logger.error({ err }, '重置学生密码失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const addStudent = async (req, res) => {
  try {
    const { username, realName, classId } = req.body;
    if (!username || !realName || !classId) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }

    // 获取学校院校代码，拼接完整用户名
    const cls = await prisma.class.findUnique({ where: { id: +classId }, include: { school: true } });
    if (!cls) return res.status(400).json({ code: 1001, message: '班级不存在', data: null });
    // 归属校验（round 6 · body 目标）：目标班级必须落在本人可见班级内（既有 400 分支保持原位）
    if (!(await canTeacherManageClass(req.user.id, classId, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    const code = cls.school.officialCode || `school${cls.school.id}`;
    const fullUsername = username.includes('@') ? username : `${username}@${code}`;

    const student = await prisma.user.create({
      data: {
        username: fullUsername, realName, password: bcrypt.hashSync(username, 10), role: 'student',
        passwordChangedAt: new Date(), // ★R2-B67：设密路径④——建号初始口令
        studentClasses: { create: { classId: +classId } },
      },
      select: { id: true, username: true, realName: true, role: true, createdAt: true },
    });
    logger.info({ studentId: student.id }, '学生已新增');
    res.json({ code: 0, message: '新增成功', data: student });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '学号已存在', data: null });
    logger.error({ err }, '新增学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const batchAddStudents = async (req, res) => {
  try {
    const { classId, students } = req.body;
    if (!classId || !students?.length) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }

    // 获取学校院校代码
    const cls = await prisma.class.findUnique({ where: { id: +classId }, include: { school: true } });
    if (!cls) return res.status(400).json({ code: 1001, message: '班级不存在', data: null });
    // 归属校验（round 6 · body 目标）：目标班级必须落在本人可见班级内（既有 400 分支保持原位）
    if (!(await canTeacherManageClass(req.user.id, classId, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    const code = cls.school.officialCode || `school${cls.school.id}`;

    let success = 0;
    let errors = [];

    for (const s of students) {
      try {
        const sid = String(s.username ?? '').trim();
        const name = String(s.realName ?? '').trim();
        if (!sid && !name) continue; // 跳过空行

        // 只有姓名、缺学号 → 生成临时学号
        if (!sid && name) {
          const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const fullUsername = `${tmpId}@${code}`;
          const user = await prisma.user.create({
            data: {
              username: fullUsername,
              realName: name,
              password: bcrypt.hashSync('', 10), // 空密码hash，无法登录
              passwordChangedAt: new Date(), // ★R2-B67：建号即设密（占位口令）
              role: 'student',
            },
          });
          await prisma.studentClass.create({ data: { studentId: user.id, classId: +classId } });
          success++;
          continue;
        }

        // 只有学号、缺姓名 → 正常创建但姓名为"待补全"
        if (sid && !name) {
          const fullUsername = sid.includes('@') ? sid : `${sid}@${code}`;
          const user = await prisma.user.upsert({
            where: { username: fullUsername },
            update: {},
            create: {
              username: fullUsername,
              realName: '(待补全)',
              password: bcrypt.hashSync('', 10), // 空密码hash，无法登录
              passwordChangedAt: new Date(), // ★R2-B67：建号即设密（占位口令）
              role: 'student',
            },
          });
          await prisma.studentClass.upsert({
            where: { studentId_classId: { studentId: user.id, classId: +classId } },
            update: {},
            create: { studentId: user.id, classId: +classId },
          });
          success++;
          continue;
        }

        // 完整的学号+姓名
        const fullUsername = sid.includes('@') ? sid : `${sid}@${code}`;
        const user = await prisma.user.upsert({
          where: { username: fullUsername },
          update: { realName: name },
          create: {
            username: fullUsername,
            realName: name,
            password: bcrypt.hashSync(sid, 10),
            passwordChangedAt: new Date(), // ★R2-B67：建号初始口令
            role: 'student',
          },
        });
        await prisma.studentClass.upsert({
          where: { studentId_classId: { studentId: user.id, classId: +classId } },
          update: {},
          create: { studentId: user.id, classId: +classId },
        });
        success++;
      } catch (e) {
        errors.push({ username: s.username, reason: e.message });
      }
    }

    logger.info({ classId, success, errors: errors.length }, '批量导入学生完成');
    res.json({ code: 0, message: `成功导入 ${success} 名，失败 ${errors.length} 名`, data: { success, errors } });
  } catch (err) {
    logger.error({ err }, '批量导入学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
