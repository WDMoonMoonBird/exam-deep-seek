-- R3-D1（t2 / 需求 v1.0 · US-B1/US-B4/US-B2）：作业三个正交开关的持久化列。
--
-- 语义：
--   * score_policy      计分口径：'best'（取最高 = submissions.best_score）| 'last'（取最后 = 最新 ai_score）；
--   * answer_visibility 答案可见性：'immediate'（评分完成即可见答案与解析）| 'after_publish'（发布后可见）；
--   * 三开关之①（允许重交 / 次数上限）复用既有列 allow_resubmit / max_attempts，本次**零新增**。
--
-- ★只加列、nullable、带默认值 ⇒ 历史行填充为 'last' / 'after_publish' =
--   需求落地前的既有行为（取最后 / 发布后可见），**不产生任何行为变化**（US-B1 AC3）。
-- ★不删/不改任何既有列与表；可回滚（见 rollback.sql，两条 DROP COLUMN）。
-- ★生产执行由队长在授权窗口执行（本批只准备迁移文件，**未**对生产库执行）；
--   测试库 exam_system_test 已按本文件同步（否则相关集成套件无法覆盖新列）。

ALTER TABLE `assignments`
  ADD COLUMN `score_policy` VARCHAR(16) NULL DEFAULT 'last' COMMENT 'R3-D1 计分口径：best=取最高(best_score) / last=取最后(最新 ai_score)' AFTER `max_attempts`,
  ADD COLUMN `answer_visibility` VARCHAR(16) NULL DEFAULT 'after_publish' COMMENT 'R3-D1 答案可见性：immediate=评分完成即可见 / after_publish=发布后可见' AFTER `score_policy`;
