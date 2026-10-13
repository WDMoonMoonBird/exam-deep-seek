-- R2-B67 回滚：仅删除本批新增的列（不动任何既有列/数据）。
-- 执行后中间件因列缺失会走 Prisma 查询报错 ⇒ 回滚必须**先回滚代码**再执行本文件（或同时把中间件判定撤下）。
ALTER TABLE `users` DROP COLUMN `password_changed_at`;
