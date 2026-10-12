-- R2-B3（W6/W7）：checker 持久化 + 作业级幂等队列 + submissions 审计列。
-- 交付物：允许在测试库应用（R2-B3 契约），生产库只交付不执行（见 docs/dsh/R2-B3-实施记录.md）。

ALTER TABLE submissions
  ADD COLUMN checker_id        VARCHAR(80) NULL COMMENT 'R2-B3 W6：本次评分依据的 checker_id（sha256:…）',
  ADD COLUMN canonical_sha256  VARCHAR(80) NULL COMMENT 'R2-B3 W6：装置规范化结果哈希（同 checker+同提交 ⇒ 逐位相同）',
  ADD COLUMN grading_stale     TINYINT(1)  NULL COMMENT 'R2-B3 W6：1=装置判定陈旧（标准已变），此时不写分';

CREATE TABLE IF NOT EXISTS grading_checkers (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  checker_id           VARCHAR(80)  NOT NULL COMMENT 'validate.py 口径的 checker_id（sha256:…）',
  assignment_id        INT UNSIGNED NOT NULL,
  question_id          INT UNSIGNED NULL,
  version_hash         VARCHAR(80)  NOT NULL COMMENT '版本哈希（当前与 checker_id 同值：同口径）',
  rubric_hash          VARCHAR(80)  NOT NULL,
  standard_hash        VARCHAR(80)  NOT NULL,
  status               VARCHAR(16)  NOT NULL DEFAULT 'ready' COMMENT 'ready|superseded|rejected',
  checker_json         JSON         NOT NULL,
  generated_session_id VARCHAR(160) NULL,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_grading_checkers_checker_id (checker_id),
  KEY idx_grading_checkers_assignment_status (assignment_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='R2-B3 W6：装置造出的 checker 本体';

CREATE TABLE IF NOT EXISTS grading_jobs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NOT NULL,
  checker_id    VARCHAR(80)  NOT NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending|running|done|failed|skipped',
  attempts      INT NOT NULL DEFAULT 0,
  written_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  last_error    TEXT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_grading_jobs_assignment_checker_status (assignment_id, checker_id, status),
  KEY idx_grading_jobs_assignment (assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='R2-B3 W7：作业级批改任务（唯一键=幂等）';
