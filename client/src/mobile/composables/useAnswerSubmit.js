/**
 * useAnswerSubmit.js —— 作答页交卷流程（自 views/student/Answer.vue 纯搬运，行为不变）
 *
 * 搬运范围：Answer.vue 原「交卷」段（候选筛选、并发 3 提交、成功跳转 done、失败可重试）。
 * 页面级状态（units / unitStatuses / objectiveAnswers / confirmOpen 等）由调用方注入，本模块不持有所有权。
 */
import { computed, reactive, ref } from 'vue';
import request from '../../api/request.js';
import { buildObjectiveAnswer, errorText, niceNumber, runLimited } from '../views/student/studentPure.js';

export function useAnswerSubmit({
  assignment,
  total,
  units,
  isExpired,
  limitReached,
  limit,
  unitReadonly,
  unitAnsweredState,
  unitStatuses,
  dirty,
  objectiveAnswers,
  codeAnswers,
  itemsOf,
  assignmentId,
  confirmOpen,
  toast,
  router,
  unansweredUnits,
  categoryLabel,
}) {
  const submitting = ref(false);
  const submitProgress = reactive({ done: 0, total: 0 });
  const submitResult = ref(null);
  const failedUnits = ref([]);
  const canSubmit = computed(() => !!assignment.value
    && total.value > 0
    && !isExpired.value
    && !limitReached.value
    && !submitting.value
    && units.value.some((unit) => !unitReadonly(unit)));

  function submitBlockReason() {
    if (isExpired.value) return '已过截止时间，无法提交';
    if (limitReached.value) return limit.value.text;
    if (!total.value) return '该作业暂无可作答题目';
    return '';
  }
  function unitLabel(unit) {
    const index = units.value.indexOf(unit);
    return '第 ' + (index + 1) + ' 题 · ' + (unit.title || '未命名题目');
  }
  function submitCandidates() {
    return units.value.filter((unit) => {
      if (unitReadonly(unit)) return false;
      if (!unitAnsweredState(unit)) return false;
      if (unit.type === 'project') return false;
      const status = unitStatuses[unit.key];
      if (unit.type === 'code' && status && status !== 'draft') return false;
      if (status && status !== 'draft' && !(assignment.value && assignment.value.allowResubmit)) return false;
      return true;
    });
  }
  function answerForSubmit(unit) {
    if (unit.type === 'objective') {
      return buildObjectiveAnswer(itemsOf(unit), objectiveAnswers[unit.key] || {});
    }
    return String(codeAnswers[unit.key] || '');
  }
  async function submitUnits(list) {
    if (!list.length) return;
    submitting.value = true;
    submitProgress.done = 0;
    submitProgress.total = list.length;
    const outcomes = await runLimited(list, 3, async (unit) => {
      try {
        const body = { questionId: unit.q.id, answer: answerForSubmit(unit) };
        if (unit.sq) body.subQuestionId = unit.sq.id;
        await request.post('/student/assignments/' + assignmentId.value + '/submit', body, { silent: true });
        unitStatuses[unit.key] = 'submitted';
        delete dirty[unit.key];
        return { ok: true, key: unit.key };
      } catch (err) {
        return { ok: false, unit, message: errorText(err) };
      } finally {
        submitProgress.done += 1;
      }
    });
    submitting.value = false;
    const failures = outcomes.filter((outcome) => !outcome.ok);
    const ok = outcomes.length - failures.length;
    if (!failures.length) {
      submitResult.value = null;
      failedUnits.value = [];
      confirmOpen.value = false;
      toast.show('提交成功');
      try {
        await router.replace('/m/student/assignments/' + assignmentId.value + '/done');
      } catch { /* 导航失败不影响已提交结果 */ }
      return;
    }
    failedUnits.value = failures.map((failure) => failure.unit);
    submitResult.value = {
      ok,
      fail: failures.length,
      failures: failures.map((failure) => ({ title: unitLabel(failure.unit), message: failure.message })),
    };
    toast.show(ok > 0 ? ok + ' 题成功，' + failures.length + ' 题失败，可重试' : '提交失败，请检查网络后重试');
  }
  function openConfirm() {
    if (!canSubmit.value) {
      toast.show(submitBlockReason() || '当前不可提交');
      return;
    }
    const candidates = submitCandidates();
    if (!candidates.length) {
      if (units.value.some(unitAnsweredState)) toast.show('已作答题目均已提交，无需重复提交');
      else if (units.value.some((unit) => unit.type === 'project' || unit.type === 'code')) toast.show('编程题 / 实训题请在电脑端提交，手机端暂无可提交的答案');
      else toast.show('还没有可提交的答案');
      return;
    }
    submitResult.value = null;
    failedUnits.value = [];
    confirmOpen.value = true;
  }
  function confirmSubmit() {
    if (!canSubmit.value) return;
    const candidates = submitCandidates();
    if (!candidates.length) {
      toast.show('没有可提交的答案');
      return;
    }
    submitUnits(candidates);
  }
  function retrySubmit() {
    const list = failedUnits.value.slice();
    if (!list.length) return;
    submitResult.value = null;
    failedUnits.value = [];
    submitUnits(list);
  }
  const confirmUnanswered = computed(() => unansweredUnits.value.map((unit) => ({
    title: unitLabel(unit),
    typeLabel: categoryLabel(unit),
    score: unit.score == null ? null : niceNumber(unit.score),
  })));

  return { submitting, submitProgress, submitResult, canSubmit, confirmUnanswered, openConfirm, confirmSubmit, retrySubmit };
}
