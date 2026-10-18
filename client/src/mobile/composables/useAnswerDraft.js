/**
 * useAnswerDraft.js —— 作答页草稿自动保存（自 views/student/Answer.vue 纯搬运，行为不变）
 *
 * 搬运范围：Answer.vue 原「草稿保存」段（逐小题 PUT、防抖 1.5s、失败可重试、离开页面前冲刷）。
 * 页面级状态（assignmentId / unitByKey / dirty / objectiveAnswers 等）由调用方注入，本模块不持有所有权。
 */
import { computed, ref } from 'vue';
import { buildObjectiveAnswer } from '../views/student/studentPure.js';
import { safePut } from '../views/student/studentRequests.js';

export function useAnswerDraft({
  assignmentId,
  unitByKey,
  dirty,
  objectiveAnswers,
  itemsOf,
  unitReadonly,
  currentUnit,
  currentReadonly,
  readonlyNotice,
  toast,
}) {
  let saveTimer = null;
  const saveState = ref('idle'); // idle | dirty | saving | saved | error
  const lastSavedAt = ref('');
  const saveNotice = ref('');

  function clockNow() {
    const d = new Date();
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }
  function markDirty(key) {
    if (!key) return;
    dirty[key] = true;
    saveState.value = 'dirty';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; saveDrafts(); }, 1500);
  }
  async function saveDrafts(options) {
    const opts = options || {};
    const keys = Object.keys(dirty).filter((key) => dirty[key]);
    if (!keys.length) return true;
    const targets = [];
    keys.forEach((key) => {
      const unit = unitByKey.value[key];
      if (!unit || unit.type !== 'objective' || unitReadonly(unit)) {
        delete dirty[key];
        return;
      }
      targets.push(unit);
    });
    if (!targets.length) return true;
    saveState.value = 'saving';
    const results = await Promise.allSettled(targets.map(async (unit) => {
      const body = {
        questionId: unit.q.id,
        answer: buildObjectiveAnswer(itemsOf(unit), objectiveAnswers[unit.key] || {}),
      };
      if (unit.sq) body.subQuestionId = unit.sq.id;
      const outcome = await safePut('/student/assignments/' + assignmentId.value + '/draft', body, { silent: true });
      if (!outcome.ok) throw outcome.error;
      return { key: unit.key, message: outcome.message };
    }));
    let ok = 0;
    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      ok += 1;
      delete dirty[result.value.key];
      const message = result.value.message || '';
      if (message.indexOf('跳过草稿') >= 0) saveNotice.value = message;
    });
    if (ok === targets.length) {
      if (saveNotice.value) {
        saveState.value = 'idle';
      } else {
        saveState.value = Object.keys(dirty).some((key) => dirty[key]) ? 'dirty' : 'saved';
        if (saveState.value === 'saved') lastSavedAt.value = clockNow();
      }
    } else {
      saveState.value = 'error';
      if (!opts.silent) toast.show('草稿保存失败，可重试');
    }
    return ok === targets.length;
  }
  function retrySave() {
    saveDrafts();
  }
  const saveText = computed(() => {
    const unit = currentUnit.value;
    if (!unit) return '';
    if (unit.type !== 'objective') return '手机端不提供该题编辑，请复制链接到电脑继续';
    if (currentReadonly.value) return readonlyNotice.value || '当前为只读状态';
    if (saveState.value === 'saving') return '草稿保存中…';
    if (saveState.value === 'error') return '草稿保存失败，点击重试';
    if (saveState.value === 'saved') return '草稿已保存' + (lastSavedAt.value ? ' ' + lastSavedAt.value : '');
    if (saveState.value === 'dirty') return '修改未保存，会自动保存';
    return '答案会自动保存为草稿';
  });

  /** 取消待执行的防抖保存（原 Answer.vue 内三处 saveTimer 清理的等价封装） */
  function cancelPendingSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  }

  /** 重置保存状态（原 Answer.vue initState 内三行重置的等价封装） */
  function resetDraftState() {
    saveState.value = 'idle';
    lastSavedAt.value = '';
    saveNotice.value = '';
  }

  return { saveState, saveText, markDirty, saveDrafts, retrySave, cancelPendingSave, resetDraftState };
}
