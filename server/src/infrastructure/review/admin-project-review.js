/**
 * admin-project-review.js —— 管理员侧实训题重评/改分端点（R3-D5 / G5 · US-A3 AC2）。
 *
 * 层级：infrastructure（与 teacher 侧 project.js / submission.js 同层）。
 *   为什么不在 interface 层：业务实现要复用 infrastructure/review/project-review-ops.js，
 *   而 check-layers 禁止 interface → infrastructure（interface-imports-infra）⇒ 按既有约定
 *   落在 infrastructure，由 routes/admin.js 组装（routes 层可同时引用 interface 与 infrastructure）。
 *
 * 契约（与教师端同形，便于前端复用同一套渲染/轮询逻辑）：
 *   POST /api/admin/submissions/:id/project/regrade  → 200 { code:0, message:'已重新触发评分', data:null }
 *        409 + code 1010（评分标准已变，需 ?confirm=1）· 404/1004 · 400/1001（非实训题/评分进行中）
 *   PUT  /api/admin/submissions/:id/project/review   → 200 { code:0, message:'审核成功',
 *        data:{ id, status, finalScore, teacherFeedback } }
 *        400 + code 1001（分值非法）· 404 + code 1004（提交不存在）
 *
 * 与教师端的唯一差异：**不按「教师可见班级」收窄**（管理员可操作任意班级，与既有管理端一致）；
 * super_admin 鉴权由 routes/admin.js 的 router.use(auth, requireRole('super_admin')) 统一保证。
 * 业务实现全部复用 project-review-ops.js（同一套 G2 分值校验 / G3 published 保持语义）。
 */
import logger from '../../utils/logger.js';
import { regradeProjectSubmissionCore, reviewProjectSubmissionCore } from './project-review-ops.js';

/** POST /api/admin/submissions/:id/project/regrade —— 管理员重评（任意班级） */
export const adminRegradeProjectSubmission = async (req, res) => {
  try {
    const r = await regradeProjectSubmissionCore({
      submissionId: +req.params.id,
      confirm: String(req.query?.confirm ?? '') === '1',
      actorId: req.user?.id,
      checkVisibility: false,   // 管理员：不按教师可见班级收窄（路由层已鉴权 super_admin）
    });
    res.status(r.status).json(r.body);
  } catch (err) {
    logger.error({ err, adminId: req.user?.id }, '管理员实训题重评失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** PUT /api/admin/submissions/:id/project/review —— 管理员改分/评语（任意班级） */
export const adminReviewProjectSubmission = async (req, res) => {
  try {
    const { finalScore, teacherFeedback } = req.body;
    const r = await reviewProjectSubmissionCore({
      submissionId: +req.params.id, finalScore, teacherFeedback,
      actorId: req.user?.id, checkVisibility: false,
    });
    res.status(r.status).json(r.body);
  } catch (err) {
    logger.error({ err, adminId: req.user?.id }, '管理员实训题审核失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
