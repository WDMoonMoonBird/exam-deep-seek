/**
 * 管理员「批改记录」只读路由（R2-B24 / t91）
 *
 * ★挂载方式（需要 `server/src/routes/admin.js` 加两行，该文件不在本轮 inScope ⇒ 已在记录中列为待授权项）：
 *   import adminGradingRunsRoutes from '../interface/http/routes/admin.js';   // 本模块
 *   router.use('/grading-runs', adminGradingRunsRoutes);
 * 因为挂在既有的 `/api/admin`（app.js:96）之下，**鉴权由既有 admin 路由层统一承担**（未登录被拒），本模块不重复加守卫。
 * ★只读：只有 GET；无任何写路径。
 */
import express from 'express';
import { getGradingRun, getGradingRunLog, listGradingRuns } from '../../../controllers/adminGradingRunsController.js';

const router = express.Router();

router.get('/', listGradingRuns);
router.get('/:id', getGradingRun);
router.get('/:id/log', getGradingRunLog);

export default router;
