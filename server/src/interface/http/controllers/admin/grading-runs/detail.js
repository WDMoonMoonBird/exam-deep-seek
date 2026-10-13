/**
 * grading-runs/detail.js —— GET /api/admin/grading-runs/:id（详情）。
 * 职责边界：谓词解析交给读模型（id 形式/归档白名单/存在性），本文件只做 **状态码与文案映射**。★无任何写路径。
 * 映射表（与拆分前逐字一致）：bad_id/bad_archive ⇒ 400 + code1001；not_found ⇒ 404 + code1002；ok ⇒ 200。
 */
import logger from '../../../../../utils/logger.js';
import { LOG_LINE_LIMIT } from './constants.js';
import { dshRunsOf } from './deps.js';

/** GET /api/admin/grading-runs/:id —— 详情（含 teardown 全量、逐份摘要、日志尾部） */
export const getGradingRun = async (req, res) => {
  try {
    const id = String((req && req.params && req.params.id) || '');
    const out = await dshRunsOf(req).getRunDetail({ id, logLineLimit: LOG_LINE_LIMIT });
    if (out.status === 'bad_id') {
      return res.status(400).json({ code: 1001, message: 'id 形式非法（应为 job-<n> 或 archive-build-…）', data: null });
    }
    if (out.status === 'bad_archive') {
      return res.status(400).json({ code: 1001, message: '归档目录名非法', data: null });
    }
    if (out.status === 'not_found') {
      return res.status(404).json({ code: 1002, message: '运行记录不存在：归档目录与数据库行都不存在', data: null });
    }
    res.json({ code: 0, message: 'ok', data: out.data });
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
