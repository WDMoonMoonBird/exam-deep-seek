/**
 * useSubmitPage.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B4，源行 594-601 / 604-636 / 1171-1205）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { computed } from 'vue';
import DOMPurify from 'dompurify';
import { useAnswerState } from './useAnswerState.js';
import { useQuestionNav } from './useQuestionNav.js';
import { useEditorLazyMount } from './useEditorLazyMount.js';
import { useDraftSave } from './useDraftSave.js';
import { useCountdown } from './useCountdown.js';
import { useSubmitActions } from './useSubmitActions.js';
import { useAssignmentLoader } from './useAssignmentLoader.js';

export function useSubmitPage({ route, confirm }) {
  // ═══ 接线根 ═══ 全部 composable 在本函数内同步调用一次；跨单元共享一律参数注入；W1-W8 之间零 import
  // 1) W2 答案状态：P1 的全部状态只在此处创建一次（所有权唯一）
  const {
    data, q, subQuestions, allowResubmit, endTime, showMaterial, isPracticeMode,
    maxAttempts, currentAttempt, submittedAttempts, bestScore, submittingAll, langs,
    answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, editorLangs,
    getNavLabel, sqHasScore, getSqResult, getItemResult, oiCardClass,
    onMultiBindChange, initObjectiveAnswers, markObjectiveCorrect,
    buildObjectiveAnswer, hasPartialOmissions, hasObjectiveAnswer,
  } = useAnswerState({
    // 迟绑定：W5（markDirty）在本行之后才创建；箭头只在作答变更回调里解引用
    markDirty: () => markDirty(),
    isSqReadonly,            // 函数声明提升：可直接传入；且只在渲染期/异步回调里被调用
  });

  // 2) W4 编辑器懒挂载（IntersectionObserver 的创建动作仍由 onMounted 的 .then 内同一调用点触发）
  const {
    editorMounted, editorRefs, ensureEditorObserver, setupEditorObserve,
    formatEditor, resetEditors, disconnectEditorObserver,
  } = useEditorLazyMount({ answers });

  // 3) W6 截止倒计时（isExpired 归此单元；消费者 = 模板 + 下方 isSqReadonly）
  const {
    isExpired, clearDeadlineTimer, armDeadlineTimer, recalibrateDeadline,
  } = useCountdown({
    route, q, endTime, subQuestions, subStatuses, answers,
    hasObjectiveAnswer, buildObjectiveAnswer,
  });

  // 4) 展示 / 决策门面（原 P5「辅助」段按消费者归属：纯展示类留在接线根）

const materialText = computed(() => {
  const m = q.value.material || '';
  return m.replace(/<[^>]*>/g, '').trim();
});
const safeMaterial = computed(() => DOMPurify.sanitize(q.value.material || ''));
function safeSqContent(sq) { return DOMPurify.sanitize((sq || {}).content || ''); }

const remainingAttempts = computed(() => {
  if (!maxAttempts.value) return '不限';
  const rem = maxAttempts.value - submittedAttempts.value;
  return Math.max(0, rem);
});

function isSqReadonly(sqId) {
  if (isExpired.value) return true;
  const s = subStatuses[sqId];
  // 练习模式已评分 → 锁定只读，显示答案
  if (isPracticeMode.value && (s === 'ai_graded' || s === 'reviewed' || s === 'published')) return true;
  if (!allowResubmit.value) {
    return s === 'submitted' || s === 'ai_graded' || s === 'reviewed' || s === 'published';
  }
  return false;
}

const totalScored = computed(() => {
  let sum = 0;
  for (const key in subScores) sum += subScores[key] || 0;
  return sum;
});

const unsubmittedCount = computed(() => {
  let count = 0;
  for (const sq of subQuestions.value) {
    const s = subStatuses[sq.id];
    if (!s || s === 'draft') count++;
  }
  return count;
});

const allSubmitted = computed(() => unsubmittedCount.value === 0);

  // 5) W8 数据加载 + 评分轮询
  const { loadAssignment, startPolling, stopPolling } = useAssignmentLoader({
    route, data, allowResubmit, endTime, isPracticeMode, maxAttempts, q, subQuestions,
    answers, editorLangs, subStatuses, subScores, subFeedbacks, bestScore,
    submittedAttempts, currentAttempt,
    initObjectiveAnswers, markObjectiveCorrect, armDeadlineTimer,
  });

  // 6) W5 脏标记 + 草稿保存（两个全局监听的处理函数；注册/注销仍在 .vue 的 onMounted/onUnmounted）
  const {
    dirtySet, dirtyCount, markDirty, draftNotice, draftNoticeText,
    saveAllDrafts, onVisibilityChange, onBeforeUnload,
    startAnswerWatch, disposeDraftSave,
  } = useDraftSave({
    route, q, subQuestions, answers, itemAnswers, multiAnswerBind,
    isSqReadonly, hasObjectiveAnswer, buildObjectiveAnswer, recalibrateDeadline,
  });

  // 7) W7 提交决策 + 提交全部
  const { submitDisabled, practiceAllGraded, submitAll } = useSubmitActions({
    route, confirm, q, subQuestions, subStatuses, answers,
    allowResubmit, isPracticeMode, currentAttempt, submittedAttempts, submittingAll,
    allSubmitted, draftNotice,
    isSqReadonly, hasObjectiveAnswer, hasPartialOmissions, buildObjectiveAnswer,
    startPolling,
  });

  // 8) W3 导航 / 题号方块 a11y（依赖 W4 的 resetEditors、W5 的脏标记、W8 的加载与轮询）
  const {
    contentRef, collapsedSqs, isActiveAnchor,
    onBoxKeydown, toggleCollapse, scrollTo, activateAnchor,
    retryPractice, sqBoxClass,
  } = useQuestionNav({
    route, confirm,
    answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, bestScore,
    dirtySet, dirtyCount,
    stopPolling, loadAssignment,
    resetEditors,
  });

  // ═══ 生命周期回调体（onMounted / onUnmounted 的注册仍在 .vue，且各只注册一次）═══
  let draftTimer = null;   // 定时兜底保存句柄（唯一读写者 = 本单元的两个回调）

function onPageMounted() {
  loadAssignment().then(() => {
    // 定时兜底保存
    draftTimer = setInterval(() => {
      if (dirtySet.size > 0) saveAllDrafts();
    }, 30000);

    // 监听答案变化 → 防抖保存
    startAnswerWatch();

    // IntersectionObserver：编辑器懒挂载（创建逻辑见 ensureEditorObserver，惰性且幂等）
    ensureEditorObserver();
  });

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', onBeforeUnload);
}

function disposePage() {
  stopPolling();
  clearInterval(draftTimer);
  disposeDraftSave();
  clearDeadlineTimer();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('beforeunload', onBeforeUnload);
  // 离开页面前最后一次保存
  saveAllDrafts();
  // 清理编辑器
  Object.values(editorRefs).forEach(ref => ref?.dispose?.());
  disconnectEditorObserver();
}

  return {
    // 模板直接可见：50 个 script 名字 + 1 个模板 ref（模板内共 57 个 $setup 引用）
    data, q, subQuestions, allowResubmit, showMaterial, isPracticeMode, maxAttempts,
    currentAttempt, bestScore, submittingAll, langs,
    answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, editorLangs,
    contentRef, collapsedSqs, isActiveAnchor,
    onBoxKeydown, toggleCollapse, scrollTo, activateAnchor, retryPractice, sqBoxClass,
    editorMounted, editorRefs, setupEditorObserve, formatEditor,
    dirtyCount, draftNoticeText,
    isExpired, isSqReadonly, materialText, safeMaterial, safeSqContent,
    remainingAttempts, totalScored, unsubmittedCount, allSubmitted,
    submitDisabled, practiceAllGraded, submitAll,
    getNavLabel, sqHasScore, getSqResult, getItemResult, oiCardClass, onMultiBindChange,
    // 生命周期回调体（.vue 只做注册）
    onPageMounted, disposePage,
  };
}
