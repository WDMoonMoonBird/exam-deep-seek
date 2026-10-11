/**
 * class-scope.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 145-168）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import { getVisibleClassIds } from '../../../../controllers/teamController.js';

/**
 * 解析教师端「班级维度」入口的可见范围（t6 · 越权收敛统一落点）。
 *
 * 语义（三个 classId 型入口 export-review / review-class / review-questions 共用）：
 *   - schoolId 合法正整数 → 可见集合收窄到该校；缺失/非法 → 取全部可见班级（保持既有语义，不越权）
 *   - classId 显式传入 → 必须命中可见集合；未命中/非法 → { ok:false }，由调用方 403 fail-closed
 *   - classId 未传 → 返回全部可见班级，调用方据此把结果收敛到可见范围
 *     （绝不允许「不传 classId 就全局返回」）
 *
 * @param {number} teacherId 教师 ID
 * @param {{schoolId?: string|number|null, classId?: string|number|null}} [params]
 * @returns {Promise<{ok:true, classIds:number[]}|{ok:false}>}
 */
async function resolveVisibleClassScope(teacherId, { schoolId, classId } = {}) {
  const sid = (schoolId === undefined || schoolId === null || schoolId === '') ? null : +schoolId;
  const visibleClassIds = await getVisibleClassIds(teacherId, Number.isInteger(sid) && sid > 0 ? sid : null);

  if (classId !== undefined && classId !== null && classId !== '') {
    const cid = +classId;
    if (!Number.isInteger(cid) || !visibleClassIds.includes(cid)) return { ok: false };
    return { ok: true, classIds: [cid] };
  }
  return { ok: true, classIds: visibleClassIds };
}

export { resolveVisibleClassScope };
