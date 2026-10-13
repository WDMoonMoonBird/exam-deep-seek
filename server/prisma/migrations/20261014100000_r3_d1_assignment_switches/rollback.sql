-- R3-D1 回滚：仅删除本批新增的两列（不动任何既有列/数据）。
-- 注意：列缺失后 Prisma 对 assignments 的查询会报错 ⇒ 回滚必须**先回滚代码**再执行本文件。
ALTER TABLE `assignments`
  DROP COLUMN `answer_visibility`,
  DROP COLUMN `score_policy`;
