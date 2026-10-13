/**
 * teachers.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 811-828）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { getSchoolId } from './guards.js';
import { parsePaging, shapeList, pagingArgs } from './paging.js';

// ===================== 教师列表 =====================

export const getAllTeachers = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const where = { role: 'teacher', deletedAt: null };
    if (schoolId) where.teacherSchools = { some: { schoolId } };
    // ★R2-B47 / U-2：服务端分页（不传 page/pageSize ⇒ 全量数组，向后兼容）；select 已是最小集（无敏感列）
    const paging = parsePaging(req.query);
    const [list, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, username: true, realName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        ...pagingArgs(paging),
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ code: 0, message: 'ok', data: shapeList(paging, list, total) });
  } catch (err) {
    logger.error({ err }, '获取教师列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
