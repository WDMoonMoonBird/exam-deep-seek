-- R2-B67（t16 / WAVE2·安全）：改密 / 重置后旧令牌立即失效。
--
-- 语义（方案 A，见 docs/dsh/R2-B58-实施记录.md §5）：
--   * users 增 **nullable** 列 password_changed_at = 该口令的生效时刻；
--   * 鉴权中间件比对 JWT 的 iat（秒）与该列：iat < floor(password_changed_at/1000) ⇒ 401 + code 1002；
--   * nullable ⇒ 历史行（迁移前建的用户）不参与判定，**不产生任何行为变化**（灰度安全）。
--
-- ★只加列、不改/不删任何既有列或表；可回滚（见 rollback.sql，一条 DROP COLUMN）。
-- ★生产执行由队长在授权窗口执行（本批只准备迁移文件，**未**对生产库执行）。

ALTER TABLE `users`
  ADD COLUMN `password_changed_at` DATETIME(3) NULL COMMENT 'R2-B67：该口令的生效时刻（改密/重置写入；NULL=历史行不判定）' AFTER `deleted_at`;
