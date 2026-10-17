-- R1 回滚（20261017123000_r1_grading_jobs_active_assignment）：逆序移除唯一索引与生成列。
-- 旧 active_key（20261012030000_r2b12_grading_jobs_active_key）不受影响：不删列、不删索引。

DROP INDEX `uniq_grading_jobs_active_assignment` ON `grading_jobs`;

ALTER TABLE `grading_jobs` DROP COLUMN `active_assignment_key`;
