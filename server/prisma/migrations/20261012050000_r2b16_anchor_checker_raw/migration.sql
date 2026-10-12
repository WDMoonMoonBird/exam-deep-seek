-- R2-B16①：锚点补字节级字段 checker_raw（ingest 时 out/checker/checker.json 的原始字节）。
--
-- 背景：仅存 JSON（anchor_json）时，回填只能「再序列化」，键序/空白与冻结原文不同 ⇒ 装置 frozen_intact 预检判 tampered ⇒ exit 3。
-- 语义：checker_raw = 原始字节（与 out/assignment/checker.frozen.json 相同则取该文件）；回填时**原样写出**，不得再序列化。
-- 历史行 checker_raw 为 NULL ⇒ materializeAnchor 必须拒绝回填（reason=raw_bytes_unavailable），由装置自行重建。

ALTER TABLE `grading_assignment_anchors`
  ADD COLUMN `checker_raw` LONGBLOB NULL;
