/**
 * autoOpen.js —— 开放性实训题（无标准工程包）自动评价 job 的共享常量（OP-1 / D1）。
 *
 * 背景：截止扫描器对「无标准工程包」的实训题作业建 job 时，装置链路（物料导出 / 内容指纹尺子 / DSH 装置）
 *   全部硬依赖标准工程包三件套 ⇒ 无法复用 __AUTO_BUILD__ 链路。这里用独立的哨兵 checker_id 标记
 *   「开放模式 job」：worker 看到哨兵后走服务端评价式评分（OPEN_PROJECT_ROLE，无标准答案段），
 *   不导物料、不造尺、不算 content_key、不跑装置。
 *
 * 零 schema 变更：沿用 grading_jobs.checker_id（VarChar(80)）存哨兵；content_key 保持 NULL
 *   （无标准包 ⇒ 无可复用尺子，开放题复用零收益）。失败/重试语义与现有 job 一致（needs_rerun + last_error）。
 */
export const AUTO_OPEN_CHECKER = '__AUTO_OPEN__';

/** 判定：checker_id 是否为本模块的开放模式哨兵 */
export function isAutoOpenChecker(value) {
  return String(value || '') === AUTO_OPEN_CHECKER;
}

/** 开放 job 的 last_error 前缀（失败可见；运维/C1 可按前缀聚合，不伪造 done） */
export const OPEN_GRADE_ERROR_PREFIX = 'open_grade_';
