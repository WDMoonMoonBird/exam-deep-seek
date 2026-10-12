-- R2-B3 结构级回滚（不执行；授权窗口内、确认无消费方后再用）
DROP TABLE IF EXISTS grading_jobs;
DROP TABLE IF EXISTS grading_checkers;
ALTER TABLE submissions
  DROP COLUMN grading_stale,
  DROP COLUMN canonical_sha256,
  DROP COLUMN checker_id;
