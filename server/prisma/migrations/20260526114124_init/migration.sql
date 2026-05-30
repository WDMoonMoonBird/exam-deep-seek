-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `real_name` VARCHAR(50) NOT NULL,
    `role` ENUM('super_admin', 'teacher', 'student') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `users_username_role_idx`(`username`, `role`),
    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schools` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `schools_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classes` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `school_id` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `classes_school_id_idx`(`school_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teacher_classes` (
    `teacher_id` INTEGER UNSIGNED NOT NULL,
    `class_id` INTEGER UNSIGNED NOT NULL,

    INDEX `teacher_classes_teacher_id_idx`(`teacher_id`),
    INDEX `teacher_classes_class_id_idx`(`class_id`),
    PRIMARY KEY (`teacher_id`, `class_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_classes` (
    `student_id` INTEGER UNSIGNED NOT NULL,
    `class_id` INTEGER UNSIGNED NOT NULL,

    INDEX `student_classes_student_id_idx`(`student_id`),
    INDEX `student_classes_class_id_idx`(`class_id`),
    PRIMARY KEY (`student_id`, `class_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `teacher_id` INTEGER UNSIGNED NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `reference_answer` TEXT NOT NULL,
    `max_score` INTEGER NOT NULL DEFAULT 100,
    `difficulty` ENUM('easy', 'medium', 'hard') NOT NULL,
    `language` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `questions_teacher_id_idx`(`teacher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignments` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `teacher_id` INTEGER UNSIGNED NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `assignments_teacher_id_idx`(`teacher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignment_questions` (
    `assignment_id` INTEGER UNSIGNED NOT NULL,
    `question_id` INTEGER UNSIGNED NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `assignment_questions_assignment_id_idx`(`assignment_id`),
    PRIMARY KEY (`assignment_id`, `question_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignment_classes` (
    `assignment_id` INTEGER UNSIGNED NOT NULL,
    `class_id` INTEGER UNSIGNED NOT NULL,

    INDEX `assignment_classes_class_id_idx`(`class_id`),
    PRIMARY KEY (`assignment_id`, `class_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submissions` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `assignment_id` INTEGER UNSIGNED NOT NULL,
    `student_id` INTEGER UNSIGNED NOT NULL,
    `question_id` INTEGER UNSIGNED NOT NULL,
    `answer` TEXT NULL,
    `ai_score` INTEGER NULL,
    `ai_feedback` TEXT NULL,
    `final_score` INTEGER NULL,
    `teacher_feedback` TEXT NULL,
    `status` ENUM('draft', 'submitted', 'ai_graded', 'reviewed', 'published') NOT NULL DEFAULT 'draft',
    `submitted_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,

    INDEX `submissions_student_id_idx`(`student_id`),
    INDEX `submissions_assignment_id_idx`(`assignment_id`),
    INDEX `submissions_status_idx`(`status`),
    INDEX `submissions_assignment_id_status_idx`(`assignment_id`, `status`),
    UNIQUE INDEX `submissions_assignment_id_student_id_question_id_key`(`assignment_id`, `student_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_classes` ADD CONSTRAINT `teacher_classes_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_classes` ADD CONSTRAINT `teacher_classes_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_classes` ADD CONSTRAINT `student_classes_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_classes` ADD CONSTRAINT `student_classes_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_questions` ADD CONSTRAINT `assignment_questions_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_questions` ADD CONSTRAINT `assignment_questions_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_classes` ADD CONSTRAINT `assignment_classes_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_classes` ADD CONSTRAINT `assignment_classes_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
