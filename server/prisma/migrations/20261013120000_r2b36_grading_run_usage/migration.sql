-- R2-B36（P1）①：运行用量落库 —— grading_run_usage（每次运行的 tokens/缓存命中/费用/工具调用/会话明细）。
--
-- 语义：
--   * run_ref 唯一：worker 批改路径 = 'job:<grading_jobs.id>'；造尺脚本路径 = 'build:<assignment_id>:<run-root 目录名>'；
--   * 数值全部来自**销毁会话前**抽取的 <run-root>/out/session-usage.json（取证阶段，见 src/services/dshSessionUsage.js）；
--   * 零 LLM 运行（复用命中/未起模型会话）如实落 0 token 且 no_model_session=1 —— 不伪造费用；
--   * 逐次分桶不可得（探针结论）⇒ 不落 calls 明细；单价版本 price_version 随行落库，便于日后复核。
--
-- 交付形态：只交付脚本；本流水线**仅测试库应用**（exam_system_test）。生产由队长在授权窗口执行（先备份 + rollback.sql 就绪）。
-- 本迁移不触碰任何既有表（纯增量）。

CREATE TABLE IF NOT EXISTS `grading_run_usage` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `run_ref`              VARCHAR(160) NOT NULL COMMENT '运行标识：job:<jobId> / build:<assignmentId>:<runRootBasename>',
  `job_id`               BIGINT       NULL COMMENT '批改路径=grading_jobs.id；造尺路径可空',
  `model`                VARCHAR(64)  NULL COMMENT '实际使用的模型（会话 request/header 实测；无模型会话为空）',
  `model_calls`          INT          NOT NULL DEFAULT 0 COMMENT '模型调用次数（=会话 steps）',
  `uncached_input_tokens` BIGINT      NOT NULL DEFAULT 0 COMMENT '输入（缓存未命中）',
  `output_tokens`        BIGINT       NOT NULL DEFAULT 0 COMMENT '输出',
  `cache_read_tokens`    BIGINT       NOT NULL DEFAULT 0 COMMENT '缓存命中（读取）',
  `cache_write_tokens`   BIGINT       NOT NULL DEFAULT 0 COMMENT '缓存写入',
  `cache_hit_rate`       DECIMAL(9,6) NULL COMMENT '命中率 = cache_read/(cache_read+uncached_input)；无输入= NULL',
  `cost_total`           DECIMAL(18,6) NULL COMMENT '费用合计（按价目表分档计算）',
  `cost_currency`        VARCHAR(8)   NULL COMMENT '币种（价目表 currency）',
  `price_version`        VARCHAR(64)  NULL COMMENT '价目表版本（effective_from[:source]）',
  `price_tier`           VARCHAR(16)  NULL COMMENT 'peak|idle|mixed（本批=会话参考时刻单档）',
  `no_model_session`     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=本次运行无模型会话（零 LLM）：token 全 0、费用 0',
  `tools_json`           JSON         NULL COMMENT '工具调用清单 [{name,count,ms,errors}]；不可得= NULL（如实）',
  `sessions_json`        JSON         NULL COMMENT '逐会话明细（totals/last_buckets/session_stats）',
  `usage_json`           JSON         NULL COMMENT 'session-usage/1 全文（含 price_tier/calls_note 等口径说明）',
  `created_at`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_grading_run_usage_run_ref` (`run_ref`),
  KEY `idx_grading_run_usage_job` (`job_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='R2-B36：每次运行的使用量/费用/工具调用（取证阶段抽取）';
