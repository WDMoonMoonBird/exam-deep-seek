/**
 * grading-runs/constants.js —— 管理员批改记录接口的 **HTTP 契约常量**（R2-B65：原样自 adminGradingRunsController.js 拆出）。
 * 放在接口层：它们是响应/请求窗口的对外口径，不是读模型的实现细节。
 */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const LOG_LINE_LIMIT = 200;
export const LOG_LIMIT_MAX = 20000;   // ★R2-B38：单次日志窗口上限（防超大响应；不带窗口参数仍是全量）
