-- R2-B12②：J1 修复 —— 「状态入键」→ BCNF 活动键（active key）方案
--
-- 目标语义：
--   * 活动态（pending / running）：每 (assignment_id, checker_id) **至多一行**；
--   * 终态（done / failed / needs_rerun）：**可多行共存**（历史留痕，供审计与重跑对比）。
--
-- 实现：生成列 active_key = CONCAT(assignment_id, ':', checker_id) 仅对活动态取值，终态为 NULL；
--   MySQL 唯一索引允许多个 NULL ⇒ 终态行天然不受约束。
--
-- 前置检查（本迁移不做数据改写；若已有重复活动行需先归并，见下方 SQL）：
--   SELECT assignment_id, checker_id, COUNT(*) AS n FROM grading_jobs
--    WHERE status IN ('pending','running') GROUP BY assignment_id, checker_id HAVING n > 1;
--   归并 SQL（保留最新一条，其余降级为 failed）：
--     UPDATE grading_jobs j
--       JOIN (SELECT assignment_id, checker_id, MAX(id) AS keep_id FROM grading_jobs
--              WHERE status IN ('pending','running')
--              GROUP BY assignment_id, checker_id HAVING COUNT(*) > 1) d
--         ON j.assignment_id = d.assignment_id AND j.checker_id = d.checker_id
--        SET j.status = 'failed', j.last_error = 'superseded_by_active_key_migration'
--      WHERE j.status IN ('pending','running') AND j.id <> d.keep_id;
--   本团队测试库实测 active_duplicates=0（2026-10-12）⇒ 直接建索引。

ALTER TABLE `grading_jobs`
  ADD COLUMN `active_key` VARCHAR(96)
    GENERATED ALWAYS AS (
      CASE WHEN `status` IN ('pending', 'running')
           THEN CONCAT(`assignment_id`, ':', `checker_id`)
           ELSE NULL END
    ) STORED;

DROP INDEX `uniq_grading_jobs_assignment_checker_status` ON `grading_jobs`;

CREATE UNIQUE INDEX `uniq_grading_jobs_active_key` ON `grading_jobs` (`active_key`);
