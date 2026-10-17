<script setup>
/**
 * Answer.vue —— 作答页 · /m/student/assignments/:id/answer
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #10–#13、10-v1-implementation-contract.md §3/§6/§7
 * 设计参照：student-answer-objective / student-answer-code / student-answer-sheet / student-submit-confirm（只读）
 *
 * 核心行为：
 *   · 数据：GET /student/assignments/:id（题目 + 小题 + 已存答案 + submissions 状态）
 *   · 草稿：PUT /student/assignments/:id/draft（逐小题、防抖 1.5s、失败可重试、离开页面前冲刷）
 *   · 提交：POST /student/assignments/:id/submit（交卷 = 循环提交已作答小题，并发 3，失败可重试）
 *   · 编程题/实训题：手机端不提供编辑器，只读 + 复制链接（电脑登录后继续），不出现免登录接力文案
 *   · 答题卡 / 交卷确认：页内 MSheet（answer-sheet / submit-confirm 两屏）
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import DOMPurify from 'dompurify';
import MobileLayout from '../../layout/MobileLayout.vue';
import MEmpty from '../../components/MEmpty.vue';
import MIcon from '../../components/MIcon.vue';
import MProgress from '../../components/MProgress.vue';
import MSheet from '../../components/MSheet.vue';
import MSkeleton from '../../components/MSkeleton.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import { useCountdown } from '../../composables/useCountdown.js';
import { useMobileToast } from '../../composables/useMobileToast.js';
import request from '../../../api/request.js';
import { withAppBase } from '../../../domain/appPath.js';
import { safePut } from './studentRequests.js';
import AnswerCode from './AnswerCode.vue';
import AnswerObjective from './AnswerObjective.vue';
import SubmitConfirm from './SubmitConfirm.vue';
import {
  buildObjectiveAnswer, buildUnits, copyText, errorText, formatClock, formatRemaining,
  limitInfo, niceNumber, objectiveHasAnswer, parseObjectiveAnswer, payload, runLimited,
} from './studentPure.js';

const route = useRoute();
const router = useRouter();
const toast = useMobileToast();

const assignmentId = computed(() => String(route.params.id || ''));

const detail = ref(null);
const loading = ref(true);
const error = ref('');

const built = computed(() => buildUnits(detail.value));
const assignment = computed(() => built.value.assignment);
const units = computed(() => built.value.units);
const byKey = computed(() => built.value.byKey);
const submissions = computed(() => built.value.submissions);
const total = computed(() => units.value.length);
const unitByKey = computed(() => {
  const map = {};
  units.value.forEach((unit) => { map[unit.key] = unit; });
  return map;
});

/* ------------------------------------------------------------ 倒计时 */

const countdown = useCountdown(computed(() => (assignment.value ? assignment.value.endTime : null)));
const isExpired = computed(() => !!assignment.value && countdown.expired.value);
const remainingMs = computed(() => (isExpired.value ? 0 : countdown.remaining.value));
const timerText = computed(() => {
  if (!assignment.value) return '--:--';
  if (isExpired.value) return '已截止';
  return formatClock(remainingMs.value);
});
const timerUrgent = computed(() => !isExpired.value && remainingMs.value > 0 && remainingMs.value <= 10 * 60 * 1000);
const remainingLabel = computed(() => {
  if (!assignment.value) return '—';
  if (isExpired.value) return '已截止';
  return formatRemaining(remainingMs.value);
});

/* ------------------------------------------------------------ 作答状态 */

const currentIndex = ref(0);
const currentUnit = computed(() => units.value[currentIndex.value] || null);
const objectiveAnswers = reactive({}); // unitKey -> { itemKey: string }
const codeAnswers = reactive({});      // unitKey -> string
const unitStatuses = reactive({});     // unitKey -> submission.status
const marked = reactive({});           // unitKey -> true（本地标记，无接口）
const dirty = reactive({});            // unitKey -> true（待保存草稿）

const sheetOpen = ref(false);
const confirmOpen = ref(false);
const leaveOpen = ref(false);

const limit = computed(() => limitInfo(assignment.value, submissions.value));
const limitReached = computed(() => limit.value.reached);

const currentTypeLabel = computed(() => {
  const unit = currentUnit.value;
  if (!unit) return '';
  if (unit.type === 'objective') return '客观题';
  if (unit.type === 'project') return '实训题';
  return '编程题';
});
const headerSub = computed(() => (total.value
  ? '第 ' + (currentIndex.value + 1) + ' / ' + total.value + ' 题 · ' + currentTypeLabel.value
  : '加载中'));

// 名称以 safe 开头：全仓门禁 verify-frontend ⑬c 只认「已清洗」的 v-html 表达式（DOMPurify 在 sanitizeHtml 内）
const safeMaterialHtml = computed(() => sanitizeHtml(currentUnit.value && currentUnit.value.q ? currentUnit.value.q.material : ''));
const safeContentHtml = computed(() => sanitizeHtml(currentUnit.value ? currentUnit.value.content : ''));
const showMaterial = ref(true);

const currentObjAnswers = computed(() => {
  const unit = currentUnit.value;
  if (!unit) return {};
  return objectiveAnswers[unit.key] || {};
});
const currentSavedAnswer = computed(() => {
  const unit = currentUnit.value;
  if (!unit) return '';
  return String(codeAnswers[unit.key] || '');
});
const currentStatus = computed(() => {
  const unit = currentUnit.value;
  return unit ? (unitStatuses[unit.key] || '') : '';
});
const currentSubmission = computed(() => {
  const unit = currentUnit.value;
  return unit ? (byKey.value[unit.key] || null) : null;
});
const currentPublishedScore = computed(() => {
  const submission = currentSubmission.value;
  if (!submission || submission.status !== 'published' || submission.finalScore == null) return null;
  return submission.finalScore;
});
const currentFeedback = computed(() => {
  const submission = currentSubmission.value;
  if (!submission || submission.status !== 'published') return '';
  return String(submission.teacherFeedback || '').trim();
});

function sanitizeHtml(html) {
  if (!html) return '';
  try {
    return DOMPurify.sanitize(String(html));
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------ 已答 / 只读 */

function itemsOf(unit) {
  if (!unit || !unit.sq || !Array.isArray(unit.sq.objectiveItems)) return [];
  return unit.sq.objectiveItems;
}
function categoryLabel(unit) {
  if (!unit) return '';
  if (unit.type === 'objective') return '客观题';
  if (unit.type === 'project') return '实训题';
  return '编程题';
}
function unitAnsweredState(unit) {
  if (!unit) return false;
  if (unit.type === 'objective') {
    return objectiveHasAnswer(itemsOf(unit), objectiveAnswers[unit.key] || {});
  }
  if (unit.type === 'project') {
    const status = unitStatuses[unit.key];
    return !!status && status !== 'draft';
  }
  const status = unitStatuses[unit.key];
  if (status && status !== 'draft') return true;
  return String(codeAnswers[unit.key] || '').trim() !== '';
}
function unitReadonly(unit) {
  if (!unit) return true;
  if (isExpired.value) return true;
  if (limitReached.value) return true;
  const status = unitStatuses[unit.key];
  if (!assignment.value.allowResubmit && status && status !== 'draft') return true;
  return false;
}
const currentReadonly = computed(() => (currentUnit.value ? unitReadonly(currentUnit.value) : true));
const answeredCount = computed(() => units.value.filter(unitAnsweredState).length);
const markedCount = computed(() => units.value.filter((unit) => !!marked[unit.key]).length);
const unansweredUnits = computed(() => units.value.filter((unit) => !unitAnsweredState(unit)));

const readonlyNotice = computed(() => {
  if (!assignment.value) return '';
  if (isExpired.value) return '已过截止时间，无法继续作答或提交，可查看已作答内容。';
  if (limitReached.value) return limit.value.text;
  if (!assignment.value.allowResubmit && submissions.value.some((s) => s && s.status && s.status !== 'draft')) {
    const allSubmitted = units.value.length > 0 && units.value.every((unit) => {
      const status = unitStatuses[unit.key];
      return !!status && status !== 'draft';
    });
    return allSubmitted
      ? '本题已提交，当前为只读状态；如需修改请联系任课教师。'
      : '部分题目已提交，已提交的题目为只读；未提交的题目仍可作答并交卷。';
  }
  return '';
});

/* ------------------------------------------------------------ 草稿保存 */

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

/* ------------------------------------------------------------ 导航 / 标记 / 复制 */

const scrollRef = ref(null);
function scrollTop() {
  try {
    if (scrollRef.value && typeof scrollRef.value.scrollTo === 'function') scrollRef.value.scrollTo({ top: 0, behavior: 'smooth' });
  } catch { /* 滚动失败不影响作答 */ }
}
function jumpTo(index) {
  if (!Number.isInteger(index) || index < 0 || index >= total.value) return;
  currentIndex.value = index;
  showMaterial.value = true;
  sheetOpen.value = false;
  scrollTop();
}
function goPrev() { jumpTo(currentIndex.value - 1); }
function goNext() { jumpTo(currentIndex.value + 1); }
function toggleMark() {
  const unit = currentUnit.value;
  if (!unit) return;
  if (marked[unit.key]) delete marked[unit.key];
  else marked[unit.key] = true;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(10); } catch { /* 不支持震动 */ }
  }
}
const handoffLink = computed(() => {
  const unit = currentUnit.value;
  if (!unit) return '';
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const basePath = unit.type === 'project'
    ? '/student/assignments/' + assignmentId.value + '/project/' + unit.q.id
    : '/student/assignments/' + assignmentId.value;
  return origin + withAppBase(basePath);
});
async function copyHandoff() {
  const ok = await copyText(handoffLink.value);
  toast.show(ok ? '链接已复制，请在电脑浏览器打开并登录' : '复制失败，请长按链接手动复制');
}

/* ------------------------------------------------------------ 客观题答案变更 */

function onObjectiveUpdate(itemKey, value) {
  const unit = currentUnit.value;
  if (!unit || unit.type !== 'objective' || currentReadonly.value) return;
  if (!objectiveAnswers[unit.key]) objectiveAnswers[unit.key] = {};
  objectiveAnswers[unit.key][String(itemKey)] = String(value == null ? '' : value);
  markDirty(unit.key);
}

/* ------------------------------------------------------------ 答题卡 */

function sheetClass(unit, index) {
  return {
    done: unitAnsweredState(unit),
    current: index === currentIndex.value,
    marked: !!marked[unit.key],
  };
}
function sheetAria(unit, index) {
  const parts = ['第 ' + (index + 1) + ' 题', categoryLabel(unit)];
  if (index === currentIndex.value) parts.push('当前题目');
  if (marked[unit.key]) parts.push('已标记');
  parts.push(unitAnsweredState(unit) ? '已作答' : '未作答');
  return parts.join('，');
}
const sheetGroups = computed(() => {
  const groups = [];
  units.value.forEach((unit, index) => {
    const label = categoryLabel(unit);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.total += 1;
      last.end = index;
      if (unitAnsweredState(unit)) last.answered += 1;
    } else {
      groups.push({ label, start: index, end: index, total: 1, answered: unitAnsweredState(unit) ? 1 : 0 });
    }
  });
  return groups;
});

/* ------------------------------------------------------------ 交卷 */

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

/* ------------------------------------------------------------ 退出确认 / 数据加载 */

function requestLeave() {
  if (sheetOpen.value) { sheetOpen.value = false; return; }
  if (confirmOpen.value) { confirmOpen.value = false; return; }
  leaveOpen.value = true;
}
async function confirmLeave() {
  leaveOpen.value = false;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await saveDrafts({ silent: true });
  router.push('/m/student/assignments/' + assignmentId.value);
}

function initState() {
  Object.keys(objectiveAnswers).forEach((key) => { delete objectiveAnswers[key]; });
  Object.keys(codeAnswers).forEach((key) => { delete codeAnswers[key]; });
  Object.keys(unitStatuses).forEach((key) => { delete unitStatuses[key]; });
  Object.keys(marked).forEach((key) => { delete marked[key]; });
  Object.keys(dirty).forEach((key) => { delete dirty[key]; });
  saveState.value = 'idle';
  lastSavedAt.value = '';
  saveNotice.value = '';
  const currentBuilt = built.value;
  currentBuilt.units.forEach((unit) => {
    const submission = currentBuilt.byKey[unit.key] || null;
    unitStatuses[unit.key] = submission && submission.status ? submission.status : '';
    if (unit.type === 'objective') {
      const map = {};
      if (submission) {
        parseObjectiveAnswer(submission.answer).forEach((entry) => {
          if (!entry || entry.key === undefined || entry.key === null) return;
          map[String(entry.key)] = String(entry.answer == null ? '' : entry.answer);
        });
      }
      objectiveAnswers[unit.key] = map;
    } else {
      codeAnswers[unit.key] = submission && submission.answer != null ? String(submission.answer) : '';
    }
  });
  const queryIndex = Number(route.query.q);
  currentIndex.value = Number.isInteger(queryIndex) && queryIndex >= 0 && queryIndex < currentBuilt.units.length ? queryIndex : 0;
  if (String(route.query.sheet) === '1' && currentBuilt.units.length) sheetOpen.value = true;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await request.get('/student/assignments/' + assignmentId.value, { silent: true });
    detail.value = payload(res) || null;
    initState();
  } catch (err) {
    error.value = errorText(err);
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

/* ------------------------------------------------------------ 生命周期 */

function onVisibilityChange() {
  if (typeof document === 'undefined' || !document.hidden) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveDrafts({ silent: true });
}
function keepaliveFlush() {
  const keys = Object.keys(dirty).filter((key) => dirty[key]);
  if (!keys.length || !assignmentId.value) return;
  let token = '';
  try { token = localStorage.getItem('token') || ''; } catch { token = ''; }
  keys.forEach((key) => {
    const unit = unitByKey.value[key];
    if (!unit || unit.type !== 'objective' || unitReadonly(unit)) return;
    try {
      const body = { questionId: unit.q.id, answer: buildObjectiveAnswer(itemsOf(unit), objectiveAnswers[key] || {}) };
      if (unit.sq) body.subQuestionId = unit.sq.id;
      window.fetch('/api/student/assignments/' + assignmentId.value + '/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    } catch { /* 页面卸载期间保存失败不阻塞 */ }
  });
}
function onPageHide() { keepaliveFlush(); }

onMounted(() => {
  load();
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
});
onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', onPageHide);
});
onBeforeRouteLeave(async () => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await saveDrafts({ silent: true });
  return true;
});
</script>

<template>
  <MobileLayout bottom="actionbar">
    <header class="appbar appbar--bordered">
      <div class="appbar-side">
        <button type="button" class="iconbtn" aria-label="退出作答并返回作业详情" @click="requestLeave">
          <MIcon name="back" />
        </button>
      </div>
      <h1 class="appbar-title">
        {{ assignment ? assignment.title : '作答' }}
        <small>{{ headerSub }}</small>
      </h1>
      <div class="appbar-actions">
        <button
          type="button"
          class="iconbtn ans-sheetbtn"
          :aria-label="'打开答题卡，已答 ' + answeredCount + ' / ' + total + ' 题'"
          :disabled="loading || !!error || !total"
          @click="sheetOpen = true"
        >
          <MIcon name="grid" />
          <span v-if="total" class="ans-badge" aria-hidden="true">{{ answeredCount }}/{{ total }}</span>
        </button>
      </div>
    </header>

    <div v-if="total" class="ans-exam">
      <span class="ans-timer" :class="{ 'ans-timer--danger': timerUrgent }" role="timer" :aria-label="'剩余作答时间 ' + remainingLabel">
        <MIcon name="clock" />
        <span class="tnum">{{ timerText }}</span>
      </span>
      <MProgress class="ans-bar" :value="currentIndex + 1" :max="total || 1" size="sm" label="题目进度" />
      <span class="ans-count tnum">{{ currentIndex + 1 }}/{{ total }}</span>
    </div>

    <main ref="scrollRef" class="scroll">
      <div v-if="loading" class="page mt16">
        <MSkeleton variant="card" :count="2" />
      </div>

      <div v-else-if="error" class="page mt16">
        <MEmpty icon="alert" title="作答页加载失败" :description="error">
          <button type="button" class="btn btn--secondary" @click="load">重新加载</button>
          <button type="button" class="btn btn--ghost" @click="router.push('/m/student/assignments')">返回作业列表</button>
        </MEmpty>
      </div>

      <div v-else-if="!total" class="page mt16">
        <MEmpty icon="inbox" title="该作业暂无可作答题目" description="如有疑问请联系任课教师。">
          <button type="button" class="btn btn--secondary" @click="router.push('/m/student/assignments/' + assignmentId)">返回作业详情</button>
        </MEmpty>
      </div>

      <template v-else-if="currentUnit">
        <div class="page mt12">
          <div v-if="readonlyNotice" class="banner banner--neutral ans-readonly" role="note">
            <MIcon name="lock" />
            <div>{{ readonlyNotice }}</div>
          </div>

          <article class="card ans-q">
            <div class="ans-q-head">
              <div class="ans-q-meta">
                <MStatusTag :type="currentUnit.type === 'objective' ? 'info' : (currentUnit.type === 'project' ? 'warning' : 'accent')">{{ currentTypeLabel }}</MStatusTag>
                <MStatusTag type="neutral">第 {{ currentIndex + 1 }} 题</MStatusTag>
                <span v-if="currentUnit.score != null" class="ans-score tnum">{{ niceNumber(currentUnit.score) }} 分</span>
              </div>
              <button
                type="button"
                class="ans-mark"
                :class="{ selected: !!marked[currentUnit.key] }"
                :aria-pressed="marked[currentUnit.key] ? 'true' : 'false'"
                :aria-label="marked[currentUnit.key] ? '取消标记本题' : '标记本题，方便稍后检查'"
                @click="toggleMark"
              >
                <MIcon name="star" />{{ marked[currentUnit.key] ? '已标记' : '标记本题' }}
              </button>
            </div>

            <div v-if="safeMaterialHtml" class="ans-material">
              <button type="button" class="ans-material-toggle" :aria-expanded="showMaterial ? 'true' : 'false'" @click="showMaterial = !showMaterial">
                题目材料<MIcon :name="showMaterial ? 'chevron-up' : 'chevron-down'" />
              </button>
              <Transition name="m-collapse">
                <div v-if="showMaterial" class="ans-material-body q-html" v-html="safeMaterialHtml"></div>
              </Transition>
            </div>

            <h2 class="ans-stem">{{ currentUnit.title }}</h2>

            <div v-if="safeContentHtml" class="ans-content q-html" v-html="safeContentHtml"></div>

            <Transition name="m-fade-slide" mode="out-in">
              <AnswerObjective
                v-if="currentUnit.type === 'objective'"
                :key="'objective-' + currentUnit.key"
                :items="itemsOf(currentUnit)"
                :answers="currentObjAnswers"
                :readonly="currentReadonly"
                @update="onObjectiveUpdate"
              />
              <AnswerCode
                v-else
                :key="'code-' + currentUnit.key"
                :unit="currentUnit"
                :saved-answer="currentSavedAnswer"
                :status="currentStatus"
                :readonly="currentReadonly"
                :link="handoffLink"
                @copy="copyHandoff"
              />
            </Transition>

            <div v-if="currentPublishedScore != null || currentFeedback" class="ans-feedback">
              <div class="between">
                <span class="ans-feedback-title">本题反馈</span>
                <MStatusTag v-if="currentPublishedScore != null" type="success">得分 {{ niceNumber(currentPublishedScore) }}</MStatusTag>
              </div>
              <p v-if="currentFeedback" class="quote mt8">{{ currentFeedback }}</p>
            </div>

            <div class="ans-save" role="status" aria-live="polite">
              <template v-if="currentUnit.type !== 'objective'">
                <MIcon name="link" /><span>{{ saveText }}</span>
              </template>
              <template v-else-if="saveState === 'error'">
                <MIcon name="alert" />
                <span>{{ saveText }}</span>
                <button type="button" class="ans-save-retry" @click="retrySave">重试</button>
              </template>
              <template v-else>
                <MIcon :name="saveState === 'saved' ? 'check-circle' : 'clock'" /><span>{{ saveText }}</span>
              </template>
            </div>
          </article>

          <div class="banner banner--neutral ans-note" role="note">
            <MIcon name="clock" />
            <div>剩余 {{ remainingLabel }} · 交卷后不可修改，未作答的题按 0 分计。</div>
          </div>
        </div>
      </template>
    </main>

    <div v-if="!loading && !error && total" class="actionbar ans-actionbar" role="group" aria-label="作答操作">
      <button type="button" class="btn btn--secondary ans-prev" :disabled="currentIndex <= 0" @click="goPrev">上一题</button>
      <button type="button" class="btn btn--primary ans-next" :disabled="currentIndex >= total - 1" @click="goNext">下一题</button>
      <button type="button" class="btn btn--danger-soft ans-submit" :disabled="!canSubmit" @click="openConfirm">交卷</button>
    </div>

    <!-- 答题卡 Sheet（answer-sheet 屏） -->
    <MSheet
      v-model:open="sheetOpen"
      title="答题卡"
      :subtitle="'已答 ' + answeredCount + ' / ' + total + ' · 未答 ' + (total - answeredCount) + ' 题 · 标记 ' + markedCount + ' 题'"
    >
      <div class="ans-sheet-progress">
        <div class="bar" role="progressbar" aria-label="已答进度" aria-valuemin="0" :aria-valuemax="total || 1" :aria-valuenow="answeredCount">
          <i :style="{ width: (total ? Math.round((answeredCount / total) * 100) : 0) + '%' }"></i>
        </div>
        <span class="num tnum">{{ answeredCount }}/{{ total }}</span>
      </div>

      <div class="qgrid ans-grid" role="group" aria-label="题目列表">
        <button
          v-for="(unit, index) in units"
          :key="unit.key"
          type="button"
          class="qnum"
          :class="sheetClass(unit, index)"
          :aria-current="index === currentIndex ? 'true' : undefined"
          :aria-label="sheetAria(unit, index)"
          @click="jumpTo(index)"
        >
          {{ index + 1 }}
        </button>
      </div>

      <div class="qlegend mt16">
        <span><i class="legend-done"></i>已答</span>
        <span><i class="legend-current"></i>当前</span>
        <span><i class="legend-undone"></i>未答</span>
        <span><i class="legend-marked"></i>标记</span>
      </div>

      <div class="ans-summary">
        <div v-for="(group, groupIndex) in sheetGroups" :key="groupIndex" class="ans-sumrow">
          <span class="k">
            <MIcon :name="group.label === '客观题' ? 'check-circle' : 'code'" />
            {{ group.label }}（{{ group.start === group.end ? '第 ' + (group.start + 1) + ' 题' : (group.start + 1) + '–' + (group.end + 1) }}）
          </span>
          <span class="v tnum" :class="{ 'ans-sumrow--warn': group.answered < group.total }">已答 {{ group.answered }}/{{ group.total }}</span>
        </div>
      </div>

      <div v-if="unansweredUnits.length" class="banner banner--warning ans-sheet-note" role="note">
        <MIcon name="alert" />
        <div>还有 {{ unansweredUnits.length }} 题未作答：{{ unansweredUnits.slice(0, 3).map((unit) => '第 ' + (units.indexOf(unit) + 1) + ' 题').join('、') }}{{ unansweredUnits.length > 3 ? ' 等' : '' }}。未作答的题按 0 分计。</div>
      </div>
      <div v-else class="banner banner--success ans-sheet-note" role="note">
        <MIcon name="check-circle" />
        <div>全部题目已作答，可交卷。</div>
      </div>

      <template #foot>
        <button type="button" class="btn btn--primary btn--block" @click="sheetOpen = false">继续作答</button>
        <button type="button" class="btn btn--ghost btn--block" :disabled="!canSubmit" @click="sheetOpen = false; openConfirm()">交卷</button>
      </template>
    </MSheet>

    <!-- 交卷确认 Sheet（submit-confirm 屏） -->
    <MSheet v-model:open="confirmOpen" title="确认交卷" :subtitle="assignment ? assignment.title : ''">
      <SubmitConfirm
        :answered="answeredCount"
        :total="total"
        :unanswered="confirmUnanswered"
        :remaining-text="remainingLabel"
        :submitting="submitting"
        :progress="submitProgress"
        :result="submitResult"
        :expired="isExpired"
        :limit-text="limitReached ? limit.text : ''"
      />
      <template #foot>
        <button
          v-if="submitResult && submitResult.fail > 0"
          type="button"
          class="btn btn--primary btn--block"
          :disabled="submitting"
          @click="retrySubmit"
        >
          {{ submitting ? '重试中…' : '重试失败项（' + submitResult.fail + '）' }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn--primary btn--block"
          :disabled="submitting || !canSubmit"
          @click="confirmSubmit"
        >
          {{ submitting ? '提交中…' : '确认交卷' }}
        </button>
        <button type="button" class="btn btn--secondary btn--block" :disabled="submitting" @click="confirmOpen = false">继续作答</button>
        <p class="ans-foot-note">只提交已作答内容 · 提交后不可修改</p>
      </template>
    </MSheet>

    <!-- 退出作答确认 -->
    <MSheet v-model:open="leaveOpen" title="退出作答？" subtitle="已填写的客观题会自动保存为草稿">
      <div class="banner banner--neutral" role="note">
        <MIcon name="info" />
        <div>退出后可在作业详情继续作答；交卷前不会提交。编程题请复制链接到电脑继续。</div>
      </div>
      <template #foot>
        <button type="button" class="btn btn--primary btn--block" @click="leaveOpen = false">继续作答</button>
        <button type="button" class="btn btn--secondary btn--block" @click="confirmLeave">退出并保存草稿</button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
.ans-sheetbtn { position: relative; }
.ans-badge { position: absolute; top: -1px; right: -2px; min-width: 28px; height: 17px; padding: 0 4px; border-radius: 9px; background: var(--red-600); color: var(--text-on-brand); font-size: 10px; line-height: 17px; font-weight: var(--m-fw-semibold); text-align: center; font-variant-numeric: tabular-nums; box-shadow: 0 0 0 2px var(--bg-canvas); }
.ans-exam { display: flex; align-items: center; padding: 0 var(--m-gutter) 12px; }
.ans-timer { display: inline-flex; align-items: center; flex: none; font-size: 14px; font-weight: var(--m-fw-semibold); color: var(--status-warning-fg); font-variant-numeric: tabular-nums; }
.ans-timer--danger { color: var(--status-danger-fg); }
.ans-timer .icon { width: 17px; height: 17px; margin-right: 5px; flex: none; }
.ans-bar { flex: 1; margin: 0 12px; }
.ans-count { flex: none; font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.ans-readonly { margin-bottom: 12px; align-items: flex-start; }
.ans-q { padding: 16px; }
.ans-q-head { display: flex; align-items: flex-start; justify-content: space-between; }
.ans-q-meta { display: flex; align-items: center; flex-wrap: wrap; min-width: 0; }
.ans-q-meta .tag + .tag { margin-left: 6px; }
.ans-score { margin-left: 8px; font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.ans-mark { display: inline-flex; align-items: center; justify-content: center; min-height: var(--m-touch-min); padding: 0 12px; border-radius: 10px; color: var(--text-secondary); font-size: 13px; font-weight: var(--m-fw-medium); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); flex: none; margin-left: 8px; }
.ans-mark .icon { width: 16px; height: 16px; margin-right: 4px; }
.ans-mark.selected { background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg); }
.ans-material { margin-top: 12px; }
.ans-material-toggle { display: inline-flex; align-items: center; min-height: var(--m-touch-min); font-size: 13px; font-weight: var(--m-fw-medium); color: var(--text-link); }
.ans-material-toggle .icon { width: 15px; height: 15px; margin-left: 3px; }
.ans-material-body { margin-top: 2px; padding: 12px 14px; border-radius: 12px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); font-size: 14px; line-height: 1.65; color: var(--text-secondary); }
.ans-stem { margin-top: 12px; font-size: 17px; line-height: 1.6; font-weight: var(--m-fw-semibold); letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.ans-content { margin-top: 10px; font-size: 15px; line-height: 1.65; color: var(--text-primary); }
.q-html { word-break: break-word; }
.q-html :deep(p) { margin: 0 0 8px; }
.q-html :deep(p:last-child) { margin-bottom: 0; }
.q-html :deep(pre) { margin: 8px 0; padding: 10px 12px; border-radius: 10px; background: var(--code-bg); color: #cdd6e4; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.7; white-space: pre; overflow-x: auto; }
.q-html :deep(code) { font-family: var(--font-mono); font-size: 0.92em; }
.q-html :deep(img) { max-width: 100%; height: auto; border-radius: 8px; }
.q-html :deep(table) { width: 100%; border-collapse: collapse; font-size: 13px; }
.q-html :deep(th), .q-html :deep(td) { border: 1px solid var(--border-subtle); padding: 6px 8px; text-align: left; }
.ans-feedback { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
.ans-feedback-title { font-size: 13px; font-weight: var(--m-fw-semibold); color: var(--text-secondary); }
.ans-save { display: flex; align-items: center; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-subtle); font-size: 12px; line-height: 1.5; color: var(--text-tertiary); }
.ans-save .icon { width: 14px; height: 14px; margin-right: 5px; flex: none; }
.ans-save-retry { min-height: var(--m-touch-min); margin-left: 6px; padding: 0 8px; color: var(--text-link); font-size: 12px; font-weight: var(--m-fw-semibold); }
.ans-note { margin-top: 12px; }
.ans-actionbar .ans-prev { flex: 0 0 26%; }
.ans-actionbar .ans-next { flex: 1; }
.ans-actionbar .ans-submit { flex: 0 0 24%; padding: 0; font-size: 15px; }
.ans-sheet-progress { display: flex; align-items: center; }
.ans-sheet-progress .bar { flex: 1; }
.ans-sheet-progress .num { margin-left: 10px; font-size: 12px; color: var(--text-secondary); font-weight: var(--m-fw-medium); font-variant-numeric: tabular-nums; }
.ans-grid { margin-top: 14px; grid-template-columns: repeat(6, 1fr); }
.ans-grid .qnum { height: 46px; font-size: 15px; position: relative; }
.ans-grid .qnum.current { background: var(--brand-600); border-color: var(--brand-600); color: var(--text-on-brand); font-weight: var(--m-fw-semibold); }
.ans-grid .qnum.done::after { content: ""; position: absolute; left: 50%; bottom: 5px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; transform: translateX(-50%); }
.ans-grid .qnum.marked::before { content: "★"; position: absolute; top: 1px; right: 3px; font-size: 9px; line-height: 1; color: var(--status-warning-fg); }
.ans-grid .qnum.marked.current::before { color: var(--text-on-brand); }
.ans-summary { margin-top: 16px; border-top: 1px solid var(--border-subtle); padding-top: 12px; }
.ans-sumrow { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; }
.ans-sumrow .k { display: flex; align-items: center; font-size: 13.5px; color: var(--text-secondary); }
.ans-sumrow .k .icon { width: 15px; height: 15px; margin-right: 6px; color: var(--text-tertiary); }
.ans-sumrow .v { font-size: 13px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.ans-sumrow .ans-sumrow--warn, .ans-sumrow .v.ans-sumrow--warn { color: var(--status-warning-fg); }
.ans-sheet-note { margin-top: 12px; }
.ans-foot-note { margin-top: 10px; text-align: center; font-size: 12px; color: var(--text-tertiary); }
/* 共享 sheet-close 命中区补宽：设计稿 32px 视觉 + 44px 命中（QA P1-3） */
:deep(.sheet-close)::after { left: -6px; right: -6px; }
</style>
