/**
 * loss-distribution.js —— R2-B68（WAVE3）管理员端「失分项分布」接口（只读）。
 * 挂载：interface/http/routes/admin.js（父路由已有 auth + requireRole('super_admin')，本文件不重复加守卫，
 *       与既有 listGradingRuns/getGradingRun 的鉴权方式一致）。
 * 可见范围：管理员不受班级可见集合限制（与既有「批改记录」页一致，页面本身就是全量只读留档）；
 *          classId 可选，用于把分布收敛到某个班。
 */
import prisma from '../../../../../utils/prisma.js';
import { loadClassLossDistribution } from '../../../../../application/queries/classLossDistribution.js';

export const getLossDistribution = async (req, res) => {
  try {
    const assignmentId = Number(req.query.assignmentId);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }
    const classId = req.query.classId === undefined || req.query.classId === '' ? null : +req.query.classId;
    const data = await loadClassLossDistribution({ prisma, assignmentId, classId, visibleClassIds: null });
    if (!data.ok) return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    return res.json({ code: 0, message: 'success', data });
  } catch (e) {
    req.log && req.log.error && req.log.error({ err: e }, 'admin loss-distribution failed');
    return res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
