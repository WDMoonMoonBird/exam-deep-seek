/**
 * useQuestionNav.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B2，源行 324-326 / 368-402 / 467-479 / 481-495 / 505-533 / 539-551）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { ref, reactive, computed, nextTick } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';

export function useQuestionNav({
  route, confirm,
  answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, bestScore,
  dirtySet, dirtyCount,
  stopPolling, loadAssignment,
  resetEditors,
}) {

// ===================== 导航 =====================

const contentRef = ref(null);
const activeAnchor = ref('');
const collapsedSqs = reactive(new Set()); // 折叠状态

async function retryPractice() {
  // 危险操作（清空全部作答）→ danger=true；ok 文案动词化（R-15）
  confirm({
    title: '重新答题',
    content: '将清空当前所有答案，之前的高分记录会被保留。',
    okText: '重新答题',
    cancelText: '取消',
    danger: true,
    onOk: async () => {
      try {
        await request.post(`/student/assignments/${route.params.id}/retry`);
        // 清空本地状态
        for (const key in answers) answers[key] = '';
        for (const key in itemAnswers) {
          itemAnswers[key].answer = '';
          itemAnswers[key].correct = undefined;
        }
        for (const key in multiAnswerBind) multiAnswerBind[key] = [];
        for (const key in subStatuses) subStatuses[key] = null;
        for (const key in subScores) subScores[key] = null;
        for (const key in subFeedbacks) subFeedbacks[key] = '';
        bestScore.value = null;
        stopPolling();
        dirtySet.clear();
        dirtyCount.value = 0;
        // 卸载旧的编辑器状态以便重新挂载
        resetEditors();
        // 重新加载
        await nextTick();
        await loadAssignment();
      } catch { message.error('操作失败'); }
    },
  });
}

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
    retryPractice, sqBoxClass,
  };
}
