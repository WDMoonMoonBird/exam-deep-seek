/**
 * grading-runs/list.js —— GET /api/admin/grading-runs（列表）。
 * 职责边界：① 解析/裁剪查询参数（HTTP 契约）② 调读模型 ③ 组装响应与错误码。★无任何写路径。
 */
import logger from '../../../../../utils/logger.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants.js';
import { dshRunsOf } from './deps.js';

/** GET /api/admin/grading-runs —— 列表（worker 表行 ∪ 造尺归档） */
export const listGradingRuns = async (req, res) => {
  try {
    const q = (req && req.query) || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || DEFAULT_PAGE_SIZE));
    const assignmentId = q.assignmentId ? Number(q.assignmentId) : null;
    const status = q.status ? String(q.status) : null;
    const archiveType = q.type ? String(q.type) : null;
    const purgeFlag = q.sessions_purged ? String(q.sessions_purged) : null;

    // 读模型出口已 toJsonSafe（BIGINT ⇒ Number）
    const data = await dshRunsOf(req).listRuns({
      page, pageSize, assignmentId, status, archiveType, purgeFlag,
      orderBy: q.order_by, orderDir: q.order,
    });
    res.json({ code: 0, message: 'ok', data });
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
