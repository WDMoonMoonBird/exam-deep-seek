/**
 * useReviewNav.js —— 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 B3，源行 284-304 / 402-437）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动（导出集中在文末）。
 * ★R3-D9（t17 / F-C4-2）：本页**不再有「模式」真值源**（isPracticeMode 已删除）——
 *      控件显隐与行为差异一律由三开关与提交状态表达，不看 assignment.mode。
 * 左导航 + 方块配色 + 滚动锚定；唯一内部 import 边：本文件 → U1（itemTypeLabel）。
 * collapsedSqs 是 reactive(new Set())（Set 代理语义）；contentRef 绑定 .rp-content，scrollTo 只滚该面板。
 */
import { ref, reactive } from 'vue';
import { itemTypeLabel } from './reviewPure.js';

export function useReviewNav({ q, getSub }) {

// ===================== 导航 =====================
const contentRef = ref(null);
const activeAnchor = ref('');
const collapsedSqs = reactive(new Set());

function toggleCollapse(sqId) {
  if (collapsedSqs.has(sqId)) collapsedSqs.delete(sqId);
  else collapsedSqs.add(sqId);
}

function getNavLabel(sq, i) {
  const n = `第${i + 1}小题`;
  const settings = q.value.objectiveSettings || {};
  if (sq.type === 'code' || !sq.type) return n;
  if (settings.classificationMode === 'flat') {
    const items = sq.objectiveItems || [];
    const firstType = items[0]?.type;
    return firstType ? `${n} ${itemTypeLabel(firstType)}` : n;
  }
  return n;
}

// 导航方块颜色
function sqResultColor(sq) {
  const sub = getSub(sq.id);
  if (!sub || sub.aiScore == null) return 'empty';
  const ratio = (sub.aiScore || 0) / (sq.score || 1);
  if (ratio >= 0.8) return 'correct';
  if (ratio >= 0.4) return 'partial';
  return 'wrong';
}

function sqBoxClass(sqId, itemKey, result) {
  const anchor = itemKey != null ? `sq-${sqId}-item-${itemKey}` : `sq-${sqId}`;
  return {
    'n-box': true,
    'n-box-correct': result === 'correct',
    'n-box-wrong': result === 'wrong',
    'n-box-partial': result === 'partial',
    'n-box-empty': result === 'empty',
    'n-box-active': activeAnchor.value === anchor,
  };
}

// ===================== 滚动 =====================
// 只滚右侧阅卷面板（.rp-content）；不要用 scrollIntoView，
// 否则外层 Layout 也会被带滚，出现整页上移/底部空白。
function scrollTo(sectionId) {
  const el = document.getElementById(sectionId);
  const scroller = contentRef.value;
  if (!el || !scroller) return;
  const top =
    el.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop;
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function activateAnchor(anchor) {
  activeAnchor.value = anchor;
}

  return {
    contentRef, activeAnchor, collapsedSqs, toggleCollapse, getNavLabel,
    sqResultColor, sqBoxClass, scrollTo, activateAnchor,
  };
}

export default useReviewNav;
