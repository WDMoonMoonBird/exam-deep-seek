/**
 * paging.js —— 教师端列表分页统一口径（R2-B47 / U-2）。
 *
 * 语义（★向后兼容，见 docs/dsh/R2-B47-修复记录.md §2）：
 *   · **完全不传** page / pageSize ⇒ 维持历史行为：返回**全量数组**（data 仍是数组，老调用方零破坏）；
 *   · 传了 page 或 pageSize ⇒ 服务端分页：返回 { list, total, page, pageSize }；
 *     page 默认 1，pageSize 默认 20、**上限 100**（超出按 100 截断，防止一次拉全库）。
 * 说明：本文件只做参数解析与响应整形，不做鉴权/作用域（作用域仍由各 controller 的 getVisibleClassIds/getSchoolId 决定）。
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** 解析 page/pageSize ⇒ { paginated, page, pageSize, skip, take } */
export function parsePaging(query = {}) {
  const rawPage = query === null || query === undefined ? undefined : query.page;
  const rawSize = query === null || query === undefined ? undefined : query.pageSize;
  const hasPage = rawPage !== undefined && rawPage !== null && rawPage !== '';
  const hasSize = rawSize !== undefined && rawSize !== null && rawSize !== '';
  if (!hasPage && !hasSize) return { paginated: false, page: 1, pageSize: null, skip: 0, take: null };
  const p = Number.parseInt(rawPage, 10);
  const page = Number.isInteger(p) && p > 0 ? p : 1;
  const s = Number.parseInt(rawSize, 10);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isInteger(s) && s > 0 ? s : DEFAULT_PAGE_SIZE));
  return { paginated: true, page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** 响应整形：分页 ⇒ { list, total, page, pageSize }；不分页 ⇒ 原样全量数组（向后兼容） */
export function shapeList(paging, list, total) {
  if (!paging || !paging.paginated) return list;
  return { list, total, page: paging.page, pageSize: paging.pageSize };
}

/** findMany 的分页片段（不分页时为空对象 ⇒ 不改变历史查询） */
export function pagingArgs(paging) {
  return paging && paging.paginated ? { skip: paging.skip, take: paging.take } : {};
}
