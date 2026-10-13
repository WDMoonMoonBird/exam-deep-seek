/**
 * admin/grading-runs/index.js —— 管理员「批改记录」只读控制器 barrel（R2-B65）。
 *
 * 对外导出与拆分前的 controllers/adminGradingRunsController.js **完全一致**（3 个 handler + default 对象）；
 * 纯整形/归档读取函数已按分层移到 infrastructure/dsh/runs（测试按需直取，不再由本 barrel 转出）。
 * ★只读：本目录只有 GET 语义，无任何写路径。
 */
import { listGradingRuns } from './list.js';
import { getGradingRun } from './detail.js';
import { getGradingRunLog } from './log.js';

export { listGradingRuns, getGradingRun, getGradingRunLog };
export default { listGradingRuns, getGradingRun, getGradingRunLog };
