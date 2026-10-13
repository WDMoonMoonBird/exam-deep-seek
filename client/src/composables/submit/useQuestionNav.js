/**
 * useQuestionNav.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B2，源行 324-326 / 368-402 / 467-479 / 481-495 / 505-533 / 539-551）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { ref, reactive, computed, nextTick } from 'vue';

/**
 * 题号导航 / 面板状态。
 *
 * ★R3-D1（US-B5 前端部分）：原「练习模式 · 重新答题」入口（retryPractice）随练习模式壳一并移除 ——
 *   其能力等价于「允许重交 + 不限次」+ 提交后可见答案（三开关），学生直接改答案再提交即可；
 *   后端 /student/assignments/:id/retry 端点未删（属后端 US-B5 范围）。
 */
export function useQuestionNav({ subQuestions }) {

// ===================== 导航 =====================

const contentRef = ref(null);
const activeAnchor = ref('');
const collapsedSqs = reactive(new Set()); // 折叠状态

// 方块 class
function sqBoxClass(sqId, itemKey, result) {
  const anchor = itemKey != null ? `sq-${sqId}-item-${itemKey}` : `sq-${sqId}`;
  return {
    'n-box': true,
    'n-box-correct': result === 'correct',
    'n-box-wrong': result === 'wrong',
    'n-box-partial': result === 'partial',
    'n-box-done': result === 'done',
    'n-box-empty': result === 'empty',
    'n-box-active': activeAnchor.value === anchor,
  };
}

// ===================== 题号方块：a11y 与键盘导航（05-page-specs T4） =====================

/** 与 DOM 顺序一致的方块索引表（客观题按 objectiveItems 顺序，编程题为单个方块） */
const boxIndex = computed(() => {
  const list = [];
  subQuestions.value.forEach((sq, i) => {
    if (sq.type === 'code' || !sq.type) {
      list.push({ sqId: sq.id, itemKey: undefined, anchor: 'sq-' + sq.id, sqIndex: i });
    } else {
      (sq.objectiveItems || []).forEach(item => {
        list.push({ sqId: sq.id, itemKey: item.key, anchor: 'sq-' + sq.id + '-item-' + item.key, sqIndex: i });
      });
    }
  });
  return list;
});

function isActiveAnchor(anchor) { return activeAnchor.value === anchor; }

function focusBoxAt(index) {
  const el = document.querySelectorAll('.n-box')[index];
  if (el && typeof el.focus === 'function') el.focus();
}

/** 激活第 idx 个方块：展开所在小节 → 定位 + 高亮 → 焦点跟随（点击与键盘等价） */
function activateBoxAt(idx) {
  const target = boxIndex.value[idx];
  if (!target) return;
  if (collapsedSqs.has(target.sqId)) collapsedSqs.delete(target.sqId);
  activateAnchor(target.anchor);
  scrollTo(target.anchor);
  nextTick(() => focusBoxAt(idx));
}

/** 方向键在方块间移动；Enter/Space 等价点击（无障碍：方块可 Tab 聚焦 + 方向键切换） */
function onBoxKeydown(e, sqIndex, itemKey) {
  const idx = boxIndex.value.findIndex(x => x.sqIndex === sqIndex && x.itemKey === itemKey);
  if (idx < 0) return;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    activateBoxAt(idx);
    return;
  }
  let target = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = Math.min(idx + 1, boxIndex.value.length - 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = Math.max(idx - 1, 0);
  else return;
  e.preventDefault();
  activateBoxAt(target);
}

function toggleCollapse(sqId) {
  if (collapsedSqs.has(sqId)) collapsedSqs.delete(sqId);
  else collapsedSqs.add(sqId);
}

function scrollTo(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function activateAnchor(anchor) {
  activeAnchor.value = anchor;
}

  return {
    contentRef, activeAnchor, collapsedSqs, boxIndex, isActiveAnchor, focusBoxAt,
    activateBoxAt, onBoxKeydown, toggleCollapse, scrollTo, activateAnchor,
    sqBoxClass,
  };
}
