-- R2-B16① rollback：删除字节级字段（回滚后回填退回「再序列化」语义，需同时注意装置会判 tampered）
ALTER TABLE `grading_assignment_anchors` DROP COLUMN `checker_raw`;
