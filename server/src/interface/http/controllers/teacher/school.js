/**
 * school.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 69-81）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';

// ===================== 学校切换 =====================

export const switchSchool = async (req, res) => {
  try {
    const { schoolId } = req.body;
    await prisma.user.update({ where: { id: req.user.id }, data: { lastSchoolId: +schoolId } });
    const school = await prisma.school.findUnique({ where: { id: +schoolId } });
    res.json({ code: 0, message: '切换成功', data: school });
  } catch (err) {
    logger.error({ err }, '切换学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
