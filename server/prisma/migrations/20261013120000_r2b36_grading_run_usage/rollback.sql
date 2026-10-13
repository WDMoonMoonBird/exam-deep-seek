-- R2-B36（P1）① 回滚：撤销运行用量表（纯增量；不触碰任何既有表）。
-- 说明：回滚**丢弃** history 用量明细 ⇒ 若需保留请先导出：
--   SELECT run_ref, job_id, model_calls, uncached_input_tokens, output_tokens, cache_read_tokens, cost_total, price_version FROM grading_run_usage;
-- 提示：先回滚代码再执行本脚本（或反之，二者不可长时间错配）；session-usage.json 仍留在归档目录中（文件级证据不受影响）。

DROP TABLE IF EXISTS `grading_run_usage`;
