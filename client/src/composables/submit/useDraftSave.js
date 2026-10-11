/**
 * useDraftSave.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B3，源行 327-328 / 754-777 / 779-865（另含 :1178-1183 的 watch））。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { ref, computed, watch } from 'vue';
import request from '../../api/request.js';

export function useDraftSave({
  route, q, subQuestions, answers, itemAnswers, multiAnswerBind,
  isSqReadonly, hasObjectiveAnswer, buildObjectiveAnswer, recalibrateDeadline,
}) {

const dirtyCount = ref(0);
let dirtySet = new Set();

// ===================== 脏标记 =====================

function markDirty() {
  dirtySet.add('__any__');
  dirtyCount.value = dirtySet.size;
}

function clearDirty() {
  dirtySet.clear();
  dirtyCount.value = 0;
}

// ===================== 草稿保存 =====================

// D3：服务端对「已提交 / 已过截止」的草稿会返回 HTTP 200 + 「跳过草稿」（不入库）。
// 前端若仍按请求成功显示「草稿已同步」，用户刷新后编辑会静默丢失 —— 故单独记账并如实呈现。
const draftNotice = ref('');   // '' | 'submitted' | 'expired'
const draftNoticeText = computed(() => {
  if (draftNotice.value === 'submitted') return '已提交，改动仅在重新提交时保存';
  if (draftNotice.value === 'expired') return '已过截止时间，改动不再保存';
  return '';
});

function getToken() {
  try { return localStorage.getItem('token') || ''; } catch { return ''; }
}

async function saveAllDrafts() {
  if (dirtySet.size === 0) return;
  const assignmentId = route.params.id;
  if (!assignmentId) return;
  const questionId = q.value.id;

  const tasks = [];
  const skipped = [];   // 服务端明确跳过（200 但未入库）的题
  for (const sq of subQuestions.value) {
    const sqId = sq.id;
    if (isSqReadonly(sqId)) continue;
    let answer;
    if (sq.type === 'objective') {
      if (!hasObjectiveAnswer(sq)) continue;
      answer = buildObjectiveAnswer(sq);
    } else {
      if (!answers[sqId]?.trim()) continue;
      answer = answers[sqId];
    }
    tasks.push(
      // 逐条记录成败（请求形状不变）：失败不清脏，留待下一轮重试（V4）
      request.put(`/student/assignments/${assignmentId}/draft`, {
        questionId, subQuestionId: sqId, answer,
      }).then((r) => {
        // D3：HTTP 200 不等于已入库 —— 识别服务端的「跳过」语义
        const msg = r?.message || '';
        if (msg.includes('跳过草稿')) skipped.push(msg.includes('已提交') ? 'submitted' : 'expired');
        return true;
      }, () => false)
    );
  }
  if (tasks.length === 0) return;
  const results = await Promise.allSettled(tasks);
  // 只有全部成功才清脏：任一失败都保留脏标记，下一轮（防抖 / 30s 定时）自动重试（V4）
  const allSaved = results.every(r => r.status === 'fulfilled' && r.value === true);
  if (allSaved) clearDirty();
  else markDirty();
  // D3：状态区文案以「是否真的入库」为准，而不是以 HTTP 是否成功为准
  if (skipped.length) draftNotice.value = skipped.includes('submitted') ? 'submitted' : 'expired';
  else if (allSaved) draftNotice.value = '';
}

// 防抖保存
let saveDebounce = null;
function scheduleSave() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(saveAllDrafts, 1500);
}

// 页面可见性变化时立即保存
function onVisibilityChange() {
  if (document.hidden) {
    clearTimeout(saveDebounce);
    saveAllDrafts();
  } else {
    // 回到前台：按当前时刻重新校准截止计时（后台节流后不再依赖旧延迟）
    recalibrateDeadline();
  }
}

// 关闭/崩溃时用 keepalive 保存
function onBeforeUnload() {
  clearTimeout(saveDebounce);
  const assignmentId = route.params.id;
  if (!assignmentId) return;
  const questionId = q.value.id;
  const token = getToken();

  for (const sq of subQuestions.value) {
    if (isSqReadonly(sq.id)) continue;
    let answer;
    if (sq.type === 'objective') {
      if (!hasObjectiveAnswer(sq)) continue;
      answer = buildObjectiveAnswer(sq);
    } else {
      if (!answers[sq.id]?.trim()) continue;
      answer = answers[sq.id];
    }
    // 显式走 window.fetch：keepalive 通道不受同模块作用域影响（V3）
    window.fetch(`/api/student/assignments/${assignmentId}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId, subQuestionId: sq.id, answer }),
      keepalive: true,
    }).catch(() => {});
  }
}

/** 监听答案变化 → 防抖保存（注册动作由 onMounted 的 .then 内同一调用点触发，注册时机与拆分前完全一致） */
function startAnswerWatch() {
    // 监听答案变化 → 防抖保存
    watch(
      () => [answers, itemAnswers, multiAnswerBind],
      () => { markDirty(); scheduleSave(); },
      { deep: true }
    );
}

/** 清理防抖计时器（onUnmounted 集中调用；saveDebounce 归本单元私有） */
function disposeDraftSave() {
  clearTimeout(saveDebounce);
}

  return {
    dirtySet, dirtyCount, markDirty, clearDirty, draftNotice, draftNoticeText,
    getToken, saveAllDrafts, scheduleSave, onVisibilityChange, onBeforeUnload,
    startAnswerWatch, disposeDraftSave,
  };
}
