-- R2-B12② rollback：活动键 → 还原「状态入键」唯一约束
--
-- ⚠️ 回滚前需先归并**终态**重复行（老唯一键要求 (assignment, checker, status) 唯一）：
--   SELECT assignment_id, checker_id, status, COUNT(*) AS n FROM grading_jobs
--    GROUP BY assignment_id, checker_id, status HAVING n > 1;
--   归并 SQL（保留每组最新一条 id，其余删除）：
--     DELETE j FROM grading_jobs j
--       JOIN grading_jobs k
--         ON j.assignment_id = k.assignment_id AND j.checker_id = k.checker_id
--        AND j.status = k.status AND j.id < k.id;

DROP INDEX `uniq_grading_jobs_active_key` ON `grading_jobs`;

ALTER TABLE `grading_jobs` DROP COLUMN `active_key`;

CREATE UNIQUE INDEX `uniq_grading_jobs_assignment_checker_status`
  ON `grading_jobs` (`assignment_id`, `checker_id`, `status`);
