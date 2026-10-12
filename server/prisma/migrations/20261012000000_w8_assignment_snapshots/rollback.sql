-- W8 结构级回滚（**不执行**；仅在授权窗口内、且确认无读取方依赖快照列时使用）。
-- 判据：SELECT COUNT(*) FROM assignment_questions WHERE rubric_snapshot IS NOT NULL OR snapshot_origin IS NOT NULL;  必须为 0（先跑数据级回滚）。
ALTER TABLE assignment_questions
  DROP COLUMN snapshot_origin,
  DROP COLUMN standard_hash,
  DROP COLUMN material_snapshot,
  DROP COLUMN rubric_snapshot;
