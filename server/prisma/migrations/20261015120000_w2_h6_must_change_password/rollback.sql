-- 回滚（H6/W2-P4 / t34）：删除本迁移新增的列。
-- ★仅删本迁移新增的列；不触碰任何既有列/表；应用侧需同时回退 W2-P5（t35）对 mustChangePassword 的读写。
ALTER TABLE `users` DROP COLUMN `must_change_password`;
