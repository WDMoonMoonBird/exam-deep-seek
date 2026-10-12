-- R2-B14①：作业锚点表（assignment-manifest 的平台侧持久化副本）
--
-- 语义：每个 (assignment_id, checker_id) 一行，存该作业在该尺子下的锚点快照：
--   frozen_sha256 / materials_manifest_digest / n_submissions / submissions_json（slug↔源目录名 映射）/ anchor_json（原始 manifest）
-- 用途：
--   1) 复用（measure-only-reuse）拉起装置前把 anchor_json 回填到 <run-root>/out/assignment/assignment-manifest.json
--      ⇒ 装置 frozen_intact 预检与 ASSIGNMENT_FROZEN_SHA256 恢复；
--   2) 消费侧在缺锚点时可用 materials-manifest 兜底（见 dshCheckerConsumer.deriveSlugMapFromRunRoot）。
--
-- BCNF：唯一非平凡 FD = (assignment_id, checker_id) → 其它属性 ⇒ 该对即候选键 ⇒ 满足 BCNF。

CREATE TABLE `grading_assignment_anchors` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `assignment_id` INT UNSIGNED NOT NULL,
  `checker_id` VARCHAR(80) NOT NULL,
  `frozen_sha256` VARCHAR(96) NULL,
  `materials_manifest_digest` VARCHAR(96) NULL,
  `n_submissions` INT NOT NULL DEFAULT 0,
  `submissions_json` JSON NOT NULL,
  `anchor_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uniq_grading_assignment_anchors_assignment_checker` (`assignment_id`, `checker_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
