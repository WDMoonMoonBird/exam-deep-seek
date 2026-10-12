-- R2-B14① rollback：删除作业锚点表（回滚后复用路径将退回「无锚点 ⇒ 明确记录并继续」的行为）
DROP TABLE `grading_assignment_anchors`;
