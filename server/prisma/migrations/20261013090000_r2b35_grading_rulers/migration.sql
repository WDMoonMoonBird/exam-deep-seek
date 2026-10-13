-- R2-B35（P0）①：尺子内容化 —— 内容指纹全局唯一的尺子表 + 作业-题目-尺子绑定表 + grading_jobs.content_key。
--
-- 语义（已批准口径）：
--   * content_key = sha256(标准工程包 sha256 + 评分标准全文 + 题目描述全文)（规范化：统一换行、去首尾空白；
--     口径与实现见 server/src/services/dshRulerContentKey.js）⇒ 同一 content_key 默认**跨班、跨教师**复用；
--   * grading_rulers 全局唯一（UNIQUE(content_key)）⇒ 并发同内容只可能有一行（building 抢占 + 等待者轮询）；
--   * assignment_question_rulers 记录「某作业的某题【当时】用哪把尺」⇒ 改了评分标准/题目后只有**新布置**会造新尺，
--     老作业的绑定与历史分数**永不变化**（submissions.checker_id 仍逐份指向当时的尺子）；
--   * 老表 grading_checkers / grading_assignment_anchors **不动**（继续作为锚点/兼容层；本迁移不迁移、不改写老数据）。
--
-- 交付形态：只交付脚本；本流水线**仅测试库应用**（exam_system_test）。生产由队长在授权窗口执行（执行前备份 + rollback.sql 就绪）。
-- 前置检查（本迁移不改写任何数据；若手工预置过同名表，请先核对结构与数据）：
--   SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('grading_rulers','assignment_question_rulers');

CREATE TABLE IF NOT EXISTS `grading_rulers` (
  `id`                 BIGINT       NOT NULL AUTO_INCREMENT,
  `content_key`        CHAR(64)     NOT NULL COMMENT 'sha256(standard_sha256 + rubric + description)（规范化后；64 位小写 hex）',
  `status`             VARCHAR(20)  NOT NULL DEFAULT 'building' COMMENT 'building|ready|failed',
  `checker_id`         VARCHAR(80)  NULL COMMENT 'ready 时=装置 checker_id（sha256:…，= 冻结尺子字节哈希）',
  `standard_sha256`    VARCHAR(80)  NULL COMMENT '标准工程包口径值：hex64=标准包 zip 字节 sha；sha256:*=快照 standard_hash 回落值',
  `rubric_sha256`      VARCHAR(80)  NULL COMMENT '评分标准哈希（与 utils/snapshotHash.textSha256 同口径）',
  `description_sha256` VARCHAR(80)  NULL COMMENT '题目描述哈希（同上口径）',
  `model`              VARCHAR(64)  NULL COMMENT '造尺使用的模型（审计）',
  `source_run_id`      BIGINT       NULL COMMENT '哪次运行造的（worker 路径=grading_jobs.id；脚本路径可空）',
  `frozen_sha256`      VARCHAR(96)  NULL COMMENT '冻结尺子字节哈希（锚点同源）',
  `checker_raw`        LONGBLOB     NULL COMMENT '尺子原始字节（复用落位必须逐字节一致；沿用既有锚点机制）',
  `last_error`         TEXT         NULL COMMENT 'status=failed 时的原因留痕（可重试）',
  `created_at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_grading_rulers_content_key` (`content_key`),
  KEY `idx_grading_rulers_checker` (`checker_id`),
  KEY `idx_grading_rulers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='R2-B35：内容指纹 → 尺子（全局唯一；跨班/跨教师复用）';

CREATE TABLE IF NOT EXISTS `assignment_question_rulers` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `assignment_id` INT UNSIGNED NOT NULL,
  `question_id`   INT UNSIGNED NOT NULL,
  `ruler_id`      BIGINT       NOT NULL,
  `bound_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_assignment_question_rulers` (`assignment_id`, `question_id`),
  KEY `idx_assignment_question_rulers_ruler` (`ruler_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='R2-B35：作业-题目 → 当时所用尺子（历史分数不可变的锚）';

ALTER TABLE `grading_jobs`
  ADD COLUMN `content_key` CHAR(64) NULL COMMENT 'R2-B35：本次批改使用的内容指纹（复用命中统计/审计）',
  ADD KEY `idx_grading_jobs_content` (`content_key`);
