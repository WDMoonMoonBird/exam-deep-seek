-- R1（Wave 3 / t22）：把「每作业至多一个活动 job」从应用层判重升级为 **DB 级唯一约束**。
--
-- 语义（与 20261012030000_r2b12_grading_jobs_active_key 并存，旧 active_key 不删除）：
--   * 活动态（pending / running）：每 assignment_id **至多一行**（本迁移新增约束）；
--   * 旧约束 active_key = CONCAT(assignment_id, ':', checker_id) 仍保留（每 (assignment, checker) 至多一行）；
--   * 终态（done / failed / needs_rerun）：两列生成值均为 NULL ⇒ MySQL 唯一索引允许多个 NULL ⇒ 可多行共存。
--
-- 防呆（先 guard 再改结构）：
--   1) 临时表 _r1_active_guard 以 assignment_id 为主键；
--   2) INSERT ... SELECT 活动态 assignment_id：已有重复 ⇒ 1062 duplicate entry，迁移在本语句失败，
--      后续 ADD COLUMN / CREATE INDEX 不会执行 ⇒ 结构零改动；TEMPORARY 表随连接关闭自动消失（失败无残留）；
--   3) 干净 ⇒ DROP 临时表，再建生成列 + 唯一索引。
--   若失败：先用 server/scripts/check-r1-active-jobs.mjs 定位重复作业并归并（保留最新一条，其余置 failed），再重试。
--
-- 回滚：见 rollback.sql（先 DROP INDEX 再 DROP COLUMN；旧 active_key / 旧迁移不受影响）。

DROP TEMPORARY TABLE IF EXISTS `_r1_active_guard`;
CREATE TEMPORARY TABLE `_r1_active_guard` (
  `assignment_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`assignment_id`)
) ENGINE=MEMORY;

INSERT INTO `_r1_active_guard` (`assignment_id`)
SELECT `assignment_id` FROM `grading_jobs` WHERE `status` IN ('pending', 'running');

DROP TEMPORARY TABLE `_r1_active_guard`;

ALTER TABLE `grading_jobs`
  ADD COLUMN `active_assignment_key` INT UNSIGNED
    GENERATED ALWAYS AS (
      CASE WHEN `status` IN ('pending', 'running') THEN `assignment_id` ELSE NULL END
    ) STORED;

CREATE UNIQUE INDEX `uniq_grading_jobs_active_assignment` ON `grading_jobs` (`active_assignment_key`);
