-- AlterTable
ALTER TABLE `assignments` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `questions` ADD COLUMN `deleted_at` DATETIME(3) NULL;
