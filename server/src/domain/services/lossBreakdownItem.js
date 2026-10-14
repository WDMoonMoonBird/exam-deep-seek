/**
 * lossBreakdownItem.js —— 失分项（aiFeedback.breakdown[]）的规范化 + status 推导（R3-S5 / t30 唯一口径真值源）。
 *
 * 背景（端到端实测暴露的失真）：aiFeedback.breakdown 存在**两代形状**：
 *   · 新（检查器链路）：infrastructure/dsh/checker/dshCheckerConsumer.js buildWriteback（:91 起）
 *     ⇒ { item, title, status, score, maxScore, comment, kind }；
 *   · 旧（legacy 写回）：services/projectGrading.js clampBreakdown（:294-300）+ aiFeedback 序列化（:301-309）
 *     ⇒ { item, score, maxScore, comment, kind }（**没有 title / status**）。
 * 读取侧 application/queries/classLossDistribution.js 按 it.status 聚合 hit/miss ⇒ 旧形状数据每项都落 unknown、
 * 失分项分布必然失真（云上/本地实测均如此）。
 *
 * 本模块是**唯一**的推导口径（写入端补齐 A + 读取端兜底 B 共用）：
 *   ① status 显式给出 ⇒ 原样采用（新形状优先级最高）；
 *   ② 缺失 ⇒ 由 score/maxScore 推导：maxScore > 0 且 score >= maxScore ⇒ 'hit'；score <= 0 ⇒ 'miss'；
 *   ③ 其余（部分得分、maxScore 缺失/不可解析、非数字）⇒ **null（未知）** —— 绝不猜测、绝不折算，
 *      未知项在聚合里仍计 unknown 且不进分母（与 US/既有口径一致）。
 *
 * 读取端为何内联同规则：application/queries/classLossDistribution.js 有「零 import」契约
 *   （client/scripts/verify-frontend.mjs ⑭b 断言 `!/^\s*import\s/m`，为让该纯函数被前端校验脚本直接 import），
 *   故无法 import 本文件 ⇒ 两侧规则由 server/test/unit/domain/loss-breakdown-item.test.js 的一致性表锁定。
 */

export const ITEM_STATUS = { hit: 'hit', miss: 'miss' };

/** 观察到的状态字符串上限（与既有落库/读取截断一致） */
const STATUS_MAX = 24;
const ITEM_MAX = 50;
const TITLE_MAX = 80;

/**
 * status 推导（纯函数）：
 * @param {number} score 实得分
 * @param {number} maxScore 满分
 * @returns {'hit'|'miss'|null} null = 未知（不进分母）
 */
export function deriveItemStatus(score, maxScore) {
  const s = Number(score);
  const m = Number(maxScore);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null;   // 不可判定 ⇒ 未知（不猜）
  if (s >= m) return ITEM_STATUS.hit;
  if (s <= 0) return ITEM_STATUS.miss;
  return null;                                                             // 部分得分 ⇒ 未知
}

/**
 * 规范化单个 breakdown 项（写入端投影 / 读取端共用形状）：
 *   · item 取名沿用既有优先级：item → name → ''（截断 50）；
 *   · title 新增：title → name → ''（截断 80）；legacy 形状无 title ⇒ 空串（不编造）；
 *   · status：显式优先，缺失/空串才推导（见 deriveItemStatus）；
 *   · score / maxScore：非数字 ⇒ 0（与既有落库一致）；maxScore 兼容 max_score 驼峰别名。
 * @param {object} raw
 * @param {{commentLimit?:number, withComment?:boolean}} [opts] commentLimit 默认 300（检查器链路口径）；
 *        legacy 写回路径传 60 以保持既有截断长度。
 */
export function normalizeLossItem(raw = {}, { commentLimit = 300, withComment = true } = {}) {
  const it = raw && typeof raw === 'object' ? raw : {};
  const score = Number(it.score) || 0;
  const maxScore = Number(it.maxScore !== undefined ? it.maxScore : it.max_score) || 0;
  const explicit = it.status === undefined || it.status === null || it.status === '' ? '' : String(it.status).slice(0, STATUS_MAX);
  const out = {
    item: String(it.item !== undefined && it.item !== null ? it.item : (it.name || '')).slice(0, ITEM_MAX),
    title: String(it.title || it.name || '').slice(0, TITLE_MAX),
    status: explicit || deriveItemStatus(score, maxScore),
    score,
    maxScore,
  };
  if (withComment) out.comment = String(it.comment || it.reason || '').slice(0, commentLimit);
  return out;
}

/**
 * 写入端投影（★R3-S5 修法 A 的唯一落点）：把评分器产出的 breakdown 映射为落库形状。
 * 原实现（services/projectGrading.js 旧 clampBreakdown）只写 { item, score, maxScore, comment, kind }
 * ⇒ 读取侧按 status 聚合时整项落 unknown、失分项分布失真。现统一经本函数补齐 title/status。
 *
 * @param {Array} items 评分器 breakdown（两代形状均可）
 * @param {{commentLimit?:number, maxItems?:number}} [opts] commentLimit 默认 300；maxItems 缺省不截断
 * @returns {Array<{item:string,title:string,status:'hit'|'miss'|null,score:number,maxScore:number,comment:string}>}
 */
export function buildLossBreakdown(items, { commentLimit = 300, maxItems } = {}) {
  const list = Array.isArray(items) ? items : [];
  const limited = maxItems && maxItems > 0 ? list.slice(0, maxItems) : list;
  return limited.map((it) => normalizeLossItem(it, { commentLimit }));
}
