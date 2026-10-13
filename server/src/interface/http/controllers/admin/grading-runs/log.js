/**
 * grading-runs/log.js —— GET /api/admin/grading-runs/:id/log?kind=stdout|stderr|run（text/plain）。
 *
 * 职责边界：kind/id 形式校验、行窗口参数校验、下载头组装在本文件；
 * 「归档白名单 + 脱敏 + 开窗读取」在读模型（infrastructure/dsh/runs）——★先脱敏再开窗，窗口内绝不出现原文。
 * 缺失日志仍返回 200 + 说明文本 + X-Log-Missing-Reason（口径与拆分前逐字一致）。★无任何写路径。
 */
import logger from '../../../../../utils/logger.js';
import { LOG_LIMIT_MAX } from './constants.js';
import { dshRunsOf } from './deps.js';

/** GET /api/admin/grading-runs/:id/log?kind=stdout|stderr|run —— text/plain 下载（脱敏） */
export const getGradingRunLog = async (req, res) => {
  try {
    const q = (req && req.query) || {};
    const id = String((req && req.params && req.params.id) || '');
    const kind = String(q.kind || 'stdout');
    const fileMap = { stdout: 'device.stdout.log', stderr: 'device.stderr.log', run: 'run.log' };
    const fileName = fileMap[kind];
    if (!fileName) return res.status(400).json({ code: 1001, message: 'kind 只允许 stdout|stderr|run', data: null });
    let archive = null;
    if (/^job-\d+$/.test(id) || /^\d+$/.test(id)) archive = String(id.replace(/^job-/, ''));
    else if (/^archive-/.test(id)) archive = id.slice('archive-'.length);
    const readModel = dshRunsOf(req);
    if (!readModel.safeArchiveDir(archive)) return res.status(400).json({ code: 1001, message: '归档目录名非法', data: null });
    // ★R2-B38（t6）：行窗口参数校验（非法一律 400，便于前端报错）
    const hasWindow = q.limit !== undefined || q.offset !== undefined;
    if (q.limit !== undefined && !Number.isFinite(Number(q.limit))) {
      return res.status(400).json({ code: 1001, message: 'limit 必须是数字（行数）', data: null });
    }
    if (q.offset !== undefined && !Number.isFinite(Number(q.offset))) {
      return res.status(400).json({ code: 1001, message: 'offset 必须是数字（起始行，0 起）', data: null });
    }
    const wantLimit = q.limit === undefined ? null : Math.min(LOG_LIMIT_MAX, Math.max(0, Number(q.limit)));
    const wantOffset = q.offset === undefined ? null : Math.max(0, Number(q.offset));
    const download = String(q.download || '') === '1' || String(q.download || '').toLowerCase() === 'true';
    const r = readModel.readLog({
      archive, fileName,
      window: hasWindow ? { offset: wantOffset === null ? 0 : wantOffset, limit: wantLimit } : null,
    });
    if (!r.ok) {
      res.type('text/plain; charset=utf-8');
      res.setHeader('X-Log-Missing-Reason', String(r.reason || 'unknown'));
      return res.status(200).send('# 日志缺失\nreason=' + r.reason + '\narchive=' + archive + '\nkind=' + kind + '\n#');
    }
    res.type('text/plain; charset=utf-8');
    const from = r.offset === undefined ? 0 : r.offset;
    const gotLines = String(r.text).split(String.fromCharCode(10)).length;
    res.setHeader('X-Total-Lines', String(r.total_lines === undefined ? gotLines : r.total_lines));
    res.setHeader('X-Log-Range', from + '-' + (from + Math.max(0, gotLines - 1)) + (wantLimit === null ? '/全量' : '/limit=' + wantLimit));
    res.setHeader('X-Log-More', r.more ? 'yes' : 'no');
    res.setHeader('Content-Disposition', (download ? 'attachment' : 'inline') + '; filename="' + archive + '.' + kind + '.log"');
    res.send(r.text);
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录日志读取失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
