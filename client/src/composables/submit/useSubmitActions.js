/**
 * useSubmitActions.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B4，源行 638-662 / 964-1031）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { computed } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { safeSubmit } from '../useSafeRequest.js';   // ★W1（t1）：批量提交逐题安全提交（失败就地提示、不冒泡）
import { limitReached as isLimitReached, limitText } from './submitSwitches.js';

export function useSubmitActions({
  route, confirm, q, subQuestions, subStatuses, answers,
  allowResubmit, maxAttempts, currentAttempt, submittedAttempts, submittingAll,
  allSubmitted, draftNotice,
  isSqReadonly, hasObjectiveAnswer, hasPartialOmissions, buildObjectiveAnswer,
  startPolling,
}) {

/** US-C2 AC2：已达次数上限 ⇒ 禁止提交（并给出原因文案） */
const limitReached = computed(() => isLimitReached({
  maxAttempts: maxAttempts.value, submittedAttempts: submittedAttempts.value,
}));

/** 上限原因文案（与后端同口径：已达提交次数上限（最多 N 次）） */
const limitNote = computed(() => (limitReached.value ? limitText(maxAttempts.value) : ''));

// 不允许重交时，一旦有题已提交就不能再交；达次数上限时一律禁止
const submitDisabled = computed(() => {
  if (limitReached.value) return true;
  if (allSubmitted.value) return true;
  if (!allowResubmit.value) {
    for (const sq of subQuestions.value) {
      const s = subStatuses[sq.id];
      if (s && s !== 'draft') return true;
    }
  }
  return false;
});

// ===================== 提交全部 =====================

async function submitAll() {
  const fullyDone = [];  // 全部答完的题
  const partial = [];    // 只答了部分的题
  const unanswered = []; // 完全没答的题

  for (const sq of subQuestions.value) {
    if (isSqReadonly(sq.id) && !allowResubmit.value) continue;
    const hasAnswer = sq.type === 'objective' ? hasObjectiveAnswer(sq) : (answers[sq.id]?.trim());
    if (!hasAnswer) {
      unanswered.push(sq);
    } else if (sq.type === 'objective' && hasPartialOmissions(sq)) {
      partial.push(sq);
    } else {
      fullyDone.push(sq);
    }
  }

  const toSubmit = [...fullyDone, ...partial];
  if (!toSubmit.length) {
    return message.warn('没有可提交的答案');
  }

  const total = subQuestions.value.length;
  const isUnfinished = unanswered.length > 0 || partial.length > 0;
  const title = isUnfinished ? '部分题目未作答' : '确认提交全部';
  let content;
  if (isUnfinished) {
    const parts = [];
    const names = (list) => list.map(sq => {
      const idx = subQuestions.value.indexOf(sq);
      return idx >= 0 ? `第${idx + 1}题` : '';
    }).filter(Boolean).join('、');
    if (unanswered.length) parts.push(`${unanswered.length} 题未作答（${names(unanswered)}）`);
    if (partial.length) parts.push(`${partial.length} 题作答不完整（${names(partial)}）`);
    content = `共 ${total} 题，${parts.join('；')}。\n\n仅已作答完整的内容会被提交，提交后不可修改。确定继续？`;
  } else {
    content = `将提交全部 ${toSubmit.length} 道小题的答案，提交后不可修改。确定继续？`;
  }

  confirm({
    title,
    content,
    okText: isUnfinished ? '仍要提交' : '提交全部',
    cancelText: '返回继续作答',
    danger: isUnfinished,
    onOk: async () => {
      submittingAll.value = true;
      // ★W1（t1）：逐题独立 safeSubmit（失败就地提示、**不抛出**）⇒ 提交失败不再冒泡到错误边界
      const results = await Promise.allSettled(
        toSubmit.map(sq => {
          const answer = sq.type === 'objective' ? buildObjectiveAnswer(sq) : answers[sq.id];
          return safeSubmit(() => request.post(`/student/assignments/${route.params.id}/submit`, {
            questionId: q.value.id, subQuestionId: sq.id, answer,
          }), { action: '提交' }).then((r) => {
            if (r.error) return false;
            subStatuses[sq.id] = 'submitted';
            return true;
          });
        })
      );
      submittingAll.value = false;
      const ok = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
      const fail = results.length - ok;
      if (fail === 0) {
        message.success(`全部 ${ok} 题提交成功`);
        draftNotice.value = '';   // 答案已随提交入库，此前的「改动仅在重新提交时保存」提示随之失效
        currentAttempt.value += 1;
        submittedAttempts.value += 1;
        // 有提交在评分中 ⇒ 轮询刷新状态与分数（开关驱动，不再限定练习模式）
        if (ok > 0) startPolling();
      } else message.warning(`${ok} 题成功，${fail} 题失败`);
    },
  });
}

  return { submitDisabled, limitReached, limitNote, submitAll };
}
