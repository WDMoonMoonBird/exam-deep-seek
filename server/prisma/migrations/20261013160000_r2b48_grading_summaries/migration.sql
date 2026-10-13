-- R2-B48（t29）：会话内生成总评的**缓存表**（设计见 docs/dsh/R2-A26-总评入会话设计.md、实施见 docs/dsh/R2-B48-实施记录.md）。
--
-- 语义：
--   * summary_key = sha256(content_key + 结果摘要) —— content_key 来自发布冻结快照（standard_hash / rubricSha256）；
--     rubric 或尺子内容变化 ⇒ content_key 变 ⇒ summary_key 变 ⇒ **自然失效**（旧行留作审计，不参与命中）；
--   * 结果摘要只取 (分项 id, 判定, 得分/满分)，与判据文案无关 ⇒ 文案微调不会造成整体 miss；
--   * hits = 命中次数（审计"缓存到底省了多少次模型调用"）；
--   * 本迁移**只新增表**：不改动、不删除任何既有表/列（云上应用由队长在授权窗口执行，rollback.sql 已就绪）。

CREATE TABLE IF NOT EXISTS `grading_summaries` (
  `summary_key` CHAR(71) NOT NULL COMMENT 'sha256:<hex>（content_key + 结果摘要）',
  `content_key` CHAR(71) NOT NULL COMMENT '内容键（来自发布冻结快照）',
  `result_digest` CHAR(71) NOT NULL COMMENT '结果摘要（分项 id/判定/得分）',
  `text` TEXT NOT NULL COMMENT '总评正文',
  `facts` JSON NULL COMMENT 'facts{passed,total,score,failed_count,failed_items}',
  `model` VARCHAR(100) NULL,
  `prompt_version` VARCHAR(40) NULL,
  `tokens` JSON NULL,
  `source` VARCHAR(40) NULL,
  `hits` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`summary_key`),
  KEY `idx_grading_summaries_content_key` (`content_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='R2-B48 总评缓存（会话内生成）';
