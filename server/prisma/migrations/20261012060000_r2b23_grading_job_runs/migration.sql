-- R2-B23：每次运行的**结构化摘要**（归档证据 + 计数 + 会话销毁结果）。
-- 与 grading_jobs 一对一（job_id 唯一）；只存摘要与证据路径/尾部日志，不存明文凭据。

CREATE TABLE `grading_job_runs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `job_id` INT UNSIGNED NOT NULL,
  `assignment_id` INT UNSIGNED NOT NULL,
  `checker_id` VARCHAR(80) NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `device_exit` INT NULL,
  `measured` INT NOT NULL DEFAULT 0,
  `unmeasurable` INT NOT NULL DEFAULT 0,
  `skipped` INT NOT NULL DEFAULT 0,
  `written` INT NOT NULL DEFAULT 0,
  `teardown_json` JSON NULL,
  `run_dir` VARCHAR(500) NULL,
  `log_stdout` TEXT NULL,
  `log_stderr` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uniq_grading_job_runs_job` (`job_id`),
  INDEX `idx_grading_job_runs_assignment` (`assignment_id`)
);
