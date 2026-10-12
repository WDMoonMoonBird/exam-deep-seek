-- AlterTable
ALTER TABLE `assignment_questions` ADD COLUMN `material_snapshot` TEXT NULL,
    ADD COLUMN `rubric_snapshot` JSON NULL,
    ADD COLUMN `snapshot_origin` VARCHAR(16) NULL,
    ADD COLUMN `standard_hash` VARCHAR(80) NULL;

-- AlterTable
ALTER TABLE `questions` ADD COLUMN `checker_meta` JSON NULL,
    ADD COLUMN `checker_script` TEXT NULL,
    ADD COLUMN `checker_status` VARCHAR(20) NULL DEFAULT 'none',
    ADD COLUMN `rubric_items` JSON NULL;

-- AlterTable
ALTER TABLE `submissions` ADD COLUMN `canonical_sha256` VARCHAR(80) NULL,
    ADD COLUMN `checker_id` VARCHAR(80) NULL,
    ADD COLUMN `grading_stale` BOOLEAN NULL;

-- CreateTable
CREATE TABLE `grading_checkers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `checker_id` VARCHAR(80) NOT NULL,
    `assignment_id` INTEGER UNSIGNED NOT NULL,
    `question_id` INTEGER UNSIGNED NULL,
    `version_hash` VARCHAR(80) NOT NULL,
    `rubric_hash` VARCHAR(80) NOT NULL,
    `standard_hash` VARCHAR(80) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ready',
    `checker_json` JSON NOT NULL,
    `generated_session_id` VARCHAR(160) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `grading_checkers_checker_id_key`(`checker_id`),
    INDEX `grading_checkers_assignment_id_status_idx`(`assignment_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `grading_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assignment_id` INTEGER UNSIGNED NOT NULL,
    `checker_id` VARCHAR(80) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `written_count` INTEGER NOT NULL DEFAULT 0,
    `skipped_count` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `grading_jobs_assignment_id_idx`(`assignment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `grading_assignment_anchors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assignment_id` INTEGER UNSIGNED NOT NULL,
    `checker_id` VARCHAR(80) NOT NULL,
    `frozen_sha256` VARCHAR(96) NULL,
    `materials_manifest_digest` VARCHAR(96) NULL,
    `n_submissions` INTEGER NOT NULL DEFAULT 0,
    `checker_raw` LONGBLOB NULL,
    `submissions_json` JSON NOT NULL,
    `anchor_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `grading_assignment_anchors_assignment_id_checker_id_key`(`assignment_id`, `checker_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

