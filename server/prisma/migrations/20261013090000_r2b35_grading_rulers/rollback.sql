-- R2-B35（P0）① 回滚：撤销「尺子内容化」的全部结构变更（新表 + grading_jobs.content_key）。
--
-- 语义：老表 grading_checkers / grading_assignment_anchors 与 submissions 的历史分数/绑定**不受本回滚影响**；
--   回滚后代码回落旧路径（按 assignment 找 ready checker），历史分数仍指向当时的 checker_id（不可变）。
-- 注意：本回滚**丢弃** grading_rulers 的 content_key 索引与 checker_raw 原始字节 ⇒ 如需保留请先导出：
--   SELECT id, content_key, status, checker_id, frozen_sha256, LENGTH(checker_raw) FROM grading_rulers;
-- 提示：若已回滚代码但仍保留表，新代码会因表存在而走新路径；请先回滚代码再执行本脚本（或反之，二者不可长时间错配）。

ALTER TABLE `grading_jobs` DROP INDEX `idx_grading_jobs_content`;
ALTER TABLE `grading_jobs` DROP COLUMN `content_key`;

DROP TABLE IF EXISTS `assignment_question_rulers`;
DROP TABLE IF EXISTS `grading_rulers`;
