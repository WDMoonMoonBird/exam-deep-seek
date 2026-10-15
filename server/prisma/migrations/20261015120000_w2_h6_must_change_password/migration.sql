-- H6（W2-P4 / t34）：随机临时口令 + 首登强制改密 —— **数据侧加列**。
--
-- 语义：
--   * users 增 must_change_password TINYINT(1) NOT NULL DEFAULT 0；
--   * default 0 ⇒ 现存行（本机 exam_system 1264 行）该字段**一律为 0**
--     ⇒ 既有登录 / 改密 / 令牌链路行为**零变化**（同 R2-B67 的灰度思路，但本列非空 + 带默认值）。
--   * 建号 / 重置口令链路置 1（应用侧见 W2-P5 / t35），改密成功后置 0。
--
-- ★只加列：无 DROP、无 UPDATE 回填、不改任何既有列或表；回滚见 rollback.sql（一条 DROP COLUMN）。
-- ★不做数据回填的理由：回填会把**现存用户**也置为「待改密」⇒ 立即改变 1264 个真实用户的行为；
--   H6 要修的是「新建 / 重置口令 = 学号 / 工号」这条链路，追认历史账号属**产品决策**，需另行授权。
-- ★生产执行由队长在授权窗口进行（本批只准备迁移文件 + 本地开发库应用）。
ALTER TABLE `users`
  ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'H6/W2-P4：首登强制改密标记（1=需改密；建号/重置置 1，改密成功置 0）' AFTER `password_changed_at`;
