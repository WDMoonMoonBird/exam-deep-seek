/**
 * loss-distribution.js —— R2-B68（WAVE3）教师端「按班看失分项分布」接口。
 *
 * 权限口径**与既有班级维度入口逐字一致**：复用 class-scope.js 的 resolveVisibleClassScope
 * （review-class / review-questions / export-review 同款）——
 *   · classId 显式传入 ⇒ 必须命中可见集合，否则 403 fail-closed；
 *   · classId 未传 ⇒ 收敛到「可见班级并集」，绝不全局返回。
 * 只读：只查 submission/studentClass/assignmentQuestionRuler/gradingRuler，无任何写路径。
 */
import prisma from '../../../../utils/prisma.js';
import { resolveVisibleClassScope } from '../review/class-scope.js';
import { loadClassLossDistribution } from '../../../../services/classLossDistribution.js';

export const getAssignmentLossDistribution = async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }
    const scope = await resolveVisibleClassScope(req.user.id, { schoolId: req.query.schoolId, classId: req.query.classId });
    if (!scope.ok) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    const classId = req.query.classId === undefined || req.query.classId === '' ? null : +req.query.classId;
    const data = await loadClassLossDistribution({ prisma, assignmentId, classId, visibleClassIds: scope.classIds });
    if (!data.ok) return res.status(data.reason === 'forbidden' ? 403 : 400).json({ code: data.reason === 'forbidden' ? 1003 : 1001, message: data.reason === 'forbidden' ? '无权操作' : '参数错误', data: null });
    return res.json({ code: 0, message: 'success', data });
  } catch (e) {
    // 错误正文不外泄（原始错误只进服务端日志），前端统一走 errorCopyOf 文案
    req.log && req.log.error && req.log.error({ err: e }, 'loss-distribution failed');
    return res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
