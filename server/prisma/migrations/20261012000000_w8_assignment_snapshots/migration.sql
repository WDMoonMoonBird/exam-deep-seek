-- W8（R2-B1）：assignment_questions 增加快照所需 4 列。
-- 交付物，**不执行**：本迁移只是文件，落地需用户授权的窗口（见 docs/dsh/R2-B1-实施记录.md §3）。
-- 全部可空 ⇒ 对旧代码零影响（旧代码不读这些列）。

ALTER TABLE assignment_questions
  ADD COLUMN rubric_snapshot   JSON         NULL COMMENT 'W8 发布时冻结的 rubric（scoring_rubric 快照）',
  ADD COLUMN material_snapshot TEXT         NULL COMMENT 'W8 发布时冻结的物料文本（questions.material 快照）',
  ADD COLUMN standard_hash     VARCHAR(80)  NULL COMMENT 'W8 标准包目录哈希（批 2 W2 起写入；回填行留空）',
  ADD COLUMN snapshot_origin   VARCHAR(16)  NULL COMMENT 'W8 来源：publish（发布时写入）| backfill（历史回填）';
