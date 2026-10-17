<script setup>
/**
 * Done.vue —— 已提交回执 / 评分进度 · /m/student/assignments/:id/done
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #14、10-v1-implementation-contract.md §3/§6/§7
 * 设计参照：docs/mobile-app/preview/screens/student-assignment-done.html（只读）
 * 数据：GET /student/assignments/:id（submissions 状态 + submittedAt；未发布不返回分数）。
 * v1 文案修正：AI 评分在作业截止后由统一 worker 触发，不承诺「提交后立即 AI 评分中」。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileActionBar from '../../layout/MobileActionBar.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import MEmpty from '../../components/MEmpty.vue';
import MIcon from '../../components/MIcon.vue';
import MSkeleton from '../../components/MSkeleton.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import request from '../../../api/request.js';
import {
  assignmentState, buildUnits, errorText, formatDateTime, hasPublishedSubmission, niceNumber, payload,
} from './studentPure.js';

const route = useRoute();
const router = useRouter();

const detail = ref(null);
const loading = ref(true);
const error = ref('');
let pollTimer = null;

const assignmentId = computed(() => String(route.params.id || ''));
const built = computed(() => buildUnits(detail.value));
const assignment = computed(() => built.value.assignment);
const units = computed(() => built.value.units);
const byKey = computed(() => built.value.byKey);
const submissions = computed(() => built.value.submissions);
const state = computed(() => assignmentState({ ...assignment.value, submissions: submissions.value }, Date.now()));

const realSubmissions = computed(() => submissions.value.filter((s) => s && s.status && s.status !== 'draft'));
const submittedUnitCount = computed(() => units.value.filter((unit) => {
  const sub = byKey.value[unit.key];
  return !!sub && !!sub.status && sub.status !== 'draft';
}).length);
const published = computed(() => hasPublishedSubmission({ submissions: submissions.value }));
const hasSubmission = computed(() => realSubmissions.value.length > 0);
const latestSubmittedAt = computed(() => {
  let latest = null;
  realSubmissions.value.forEach((s) => {
    if (!s.submittedAt) return;
    if (!latest || new Date(s.submittedAt).getTime() > new Date(latest).getTime()) latest = s.submittedAt;
  });
  return latest;
});
const maxScoreTotal = computed(() => {
  let sum = 0;
  let has = false;
  units.value.forEach((unit) => {
    const score = Number(unit.score);
    if (!Number.isFinite(score)) return;
    sum += score;
    has = true;
  });
  return has ? sum : null;
});
const attemptCount = computed(() => {
  let max = 0;
  realSubmissions.value.forEach((s) => {
    if (Number(s.attemptCount) > max) max = Number(s.attemptCount);
  });
  return max;
});
const statusSet = computed(() => {
  const set = {};
  realSubmissions.value.forEach((s) => { set[s.status] = true; });
  return set;
});
const hasStatusAtLeast = (names) => names.some((name) => statusSet.value[name]);

const heroTitle = computed(() => (published.value ? '成绩已发布' : (hasSubmission.value ? '提交成功' : '尚未提交')));
const heroText = computed(() => {
  if (!hasSubmission.value) {
    return '该作业还没有提交记录；如仍可作答，可返回作业详情继续作答。';
  }
  if (published.value) {
    return '老师已发布成绩，可在「成绩」中查看本题得分与评语。';
  }
  return '已提交，评分将在作业截止后统一进行；出分后会显示在「成绩」中。';
});

const steps = computed(() => {
  const submitDone = hasSubmission.value;
  const gradingDone = hasStatusAtLeast(['ai_graded', 'reviewed', 'published']);
  const reviewDone = hasStatusAtLeast(['reviewed', 'published']);
  const publishDone = published.value;
  const ended = !!assignment.value.endTime && Date.now() > new Date(assignment.value.endTime).getTime();
  const gradingActive = !gradingDone && hasStatusAtLeast(['submitted']) && ended;
  const reviewActive = !reviewDone && gradingDone && hasStatusAtLeast(['ai_graded']);

  return [
    {
      key: 'submitted',
      title: '已提交',
      state: submitDone ? 'done' : 'pending',
      tag: submitDone ? { text: '完成', type: 'success' } : { text: '未提交', type: 'neutral' },
      desc: submitDone
        ? (formatDateTime(latestSubmittedAt.value) || '—') + ' · 已提交 ' + submittedUnitCount.value + '/' + units.value.length + ' 小题'
        : '尚无提交记录',
    },
    {
      key: 'grading',
      title: '评分中',
      state: gradingDone ? 'done' : (gradingActive ? 'active' : 'pending'),
      tag: gradingDone ? { text: '完成', type: 'success' } : (gradingActive ? { text: '进行中', type: 'info' } : { text: '待开始', type: 'neutral' }),
      desc: gradingDone
        ? (reviewDone ? '评分与审核已完成' : '评分已完成，等待教师审核发布')
        : (gradingActive ? '统一评分进行中，请耐心等待' : '作业截止后统一评分'),
    },
    {
      key: 'review',
      title: '教师审核',
      state: reviewDone ? 'done' : (reviewActive ? 'active' : 'pending'),
      tag: reviewDone ? { text: '完成', type: 'success' } : (reviewActive ? { text: '进行中', type: 'info' } : { text: '待开始', type: 'neutral' }),
      desc: reviewDone ? '教师已完成审核' : '评分完成后进入教师复核',
    },
    {
      key: 'publish',
      title: '发布成绩',
      state: publishDone ? 'done' : 'pending',
      tag: publishDone ? { text: '已发布', type: 'success' } : { text: '待发布', type: 'neutral' },
      desc: publishDone ? '成绩已发布，可查看反馈' : '发布后可在「成绩」查看反馈',
    },
  ];
});

async function load(silentMode) {
  if (!silentMode) loading.value = true;
  if (!silentMode) error.value = '';
  try {
    const res = await request.get('/student/assignments/' + assignmentId.value, { silent: true });
    detail.value = payload(res) || null;
  } catch (err) {
    if (!silentMode) {
      error.value = errorText(err);
      detail.value = null;
    }
  } finally {
    if (!silentMode) loading.value = false;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (published.value) { stopPolling(); return; }
    load(true);
  }, 30000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
function onVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (!document.hidden && !published.value) startPolling();
  else if (document.hidden) stopPolling();
}

function goScores() {
  if (published.value) router.push('/m/student/scores/' + assignmentId.value);
  else router.push('/m/student/scores');
}
function goAnswer() {
  router.push('/m/student/assignments/' + assignmentId.value + '/answer');
}

onMounted(() => {
  load(false);
  startPolling();
  document.addEventListener('visibilitychange', onVisibilityChange);
});
onBeforeUnmount(() => {
  stopPolling();
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<template>
  <MobileLayout bottom="actionbar">
    <MobileAppBar back back-to="/m/student/assignments">
      <template #title><span>已提交</span></template>
    </MobileAppBar>

    <main class="scroll">
      <div v-if="loading" class="page mt16">
        <MSkeleton variant="card" :count="3" />
      </div>

      <div v-else-if="error" class="page mt16">
        <MEmpty icon="alert" title="提交回执加载失败" :description="error">
          <button type="button" class="btn btn--secondary" @click="load(false)">重新加载</button>
          <button type="button" class="btn btn--ghost" @click="router.push('/m/student/assignments')">返回作业列表</button>
        </MEmpty>
      </div>

      <template v-else>
        <div class="ad-hero">
          <span class="ad-success" :class="{ 'ad-success--pending': !hasSubmission }" aria-hidden="true">
            <MIcon :name="hasSubmission ? 'check-circle' : 'clock'" />
          </span>
          <h1>{{ heroTitle }}</h1>
          <p>{{ heroText }}</p>
          <MStatusTag v-if="hasSubmission" :type="state.tone" dot>{{ state.text }}</MStatusTag>
          <MStatusTag v-else type="warning" dot>未提交</MStatusTag>
        </div>

        <div v-if="!hasSubmission" class="page">
          <MEmpty icon="inbox" title="还没有提交记录" description="如果作业仍在开放时间内，可以返回作业详情继续作答并交卷。">
            <button type="button" class="btn btn--primary" @click="goAnswer">去作答</button>
          </MEmpty>
        </div>

        <template v-else>
          <div class="page">
            <article class="card ad-sum">
              <div class="between">
                <h2 class="card-title">{{ assignment.title }}</h2>
                <MStatusTag v-if="published" type="success">已发布</MStatusTag>
                <MStatusTag v-else type="warning">待发布</MStatusTag>
              </div>
              <div class="mt12">
                <div class="ad-kv"><span class="k">提交时间</span><span class="v">{{ formatDateTime(latestSubmittedAt) || '—' }}</span></div>
                <div class="ad-kv"><span class="k">已提交题目</span><span class="v">{{ submittedUnitCount }} / {{ units.length }} 小题</span></div>
                <div class="ad-kv" v-if="maxScoreTotal != null"><span class="k">满分</span><span class="v">{{ niceNumber(maxScoreTotal) }} 分</span></div>
                <div class="ad-kv" v-if="attemptCount > 1"><span class="k">提交次数</span><span class="v">{{ attemptCount }} 次</span></div>
                <div class="ad-kv"><span class="k">截止时间</span><span class="v">{{ formatDateTime(assignment.endTime) || '—' }}</span></div>
              </div>
            </article>
          </div>

          <div class="sec">
            <h2>评分进度</h2>
            <span class="sec-note">{{ published ? '已出分' : '评分在截止后统一进行' }}</span>
          </div>

          <div class="page">
            <div class="list ad-timeline">
              <div v-for="step in steps" :key="step.key" class="ad-tl" :class="{ 'ad-tl--pending': step.state === 'pending' }">
                <div class="ad-rail">
                  <span class="ad-dot" :class="{ 'ad-dot--done': step.state === 'done', 'ad-dot--active': step.state === 'active' }" aria-hidden="true">
                    <MIcon v-if="step.state === 'done'" name="check" />
                    <span v-else-if="step.state === 'active'" class="spinner"></span>
                  </span>
                </div>
                <div class="ad-tl-body">
                  <div class="ad-tl-top">
                    <span class="ad-tl-title">{{ step.title }}</span>
                    <MStatusTag :type="step.tag.type">{{ step.tag.text }}</MStatusTag>
                  </div>
                  <p class="ad-tl-sub">{{ step.desc }}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="page">
            <div class="banner banner--info ad-note" role="note">
              <MIcon name="info" />
              <div>{{ published ? '成绩已发布，点击下方「查看成绩」查看逐题反馈。' : '无需停留在本页：评分完成后可在「成绩」中查看；本页每 30 秒自动刷新进度。' }}</div>
            </div>
          </div>
        </template>
      </template>
    </main>

    <MobileActionBar v-if="!loading && !error">
      <button type="button" class="btn btn--secondary" @click="goScores">{{ published ? '查看成绩' : '我的成绩' }}</button>
      <button type="button" class="btn btn--primary" @click="router.push('/m/student/assignments')">返回作业列表</button>
    </MobileActionBar>
  </MobileLayout>
</template>

<style scoped>
.ad-hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 14px var(--m-gutter) 18px; }
.ad-success { width: 76px; height: 76px; border-radius: 50%; background: var(--status-success-bg); color: var(--status-success-fg); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 8px var(--bg-canvas); }
.ad-success--pending { background: var(--status-warning-bg); color: var(--status-warning-fg); }
.ad-success .icon { width: 38px; height: 38px; stroke-width: 2; }
.ad-hero h1 { margin-top: 16px; font-size: var(--m-fs-title-1); line-height: var(--m-lh-title-1); font-weight: var(--m-fw-bold); letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.ad-hero p { margin-top: 6px; max-width: 300px; font-size: var(--m-fs-body-sm); line-height: 1.6; color: var(--text-secondary); }
.ad-hero .tag { margin-top: 10px; }
.ad-sum .card-title { font-size: 16px; }
.ad-kv { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; font-size: 13.5px; }
.ad-kv + .ad-kv { border-top: 1px solid var(--border-subtle); }
.ad-kv .k { color: var(--text-secondary); }
.ad-kv .v { color: var(--text-primary); font-weight: var(--m-fw-medium); font-variant-numeric: tabular-nums; }
.ad-timeline { margin-top: 0; }
.ad-tl { display: grid; grid-template-columns: 26px 1fr; padding: 0 16px; }
.ad-rail { position: relative; display: flex; justify-content: center; padding-top: 15px; }
.ad-rail::after { content: ""; position: absolute; top: 37px; bottom: -15px; width: 2px; background: var(--border-subtle); }
.ad-tl:last-child .ad-rail::after { display: none; }
.ad-dot { position: relative; z-index: 1; width: 22px; height: 22px; border-radius: 50%; background: var(--bg-sunken); border: 2px solid var(--border-strong); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); }
.ad-dot .icon { width: 12px; height: 12px; stroke-width: 2.6; }
.ad-dot--done { background: var(--status-success-bg); border-color: var(--status-success-fg); color: var(--status-success-fg); }
.ad-dot--active { background: var(--bg-selected); border-color: var(--brand-600); color: var(--text-brand); }
.ad-dot--active .spinner { width: 11px; height: 11px; margin: 0; border-width: 2px; }
.ad-tl-body { padding: 12px 0 16px 12px; border-bottom: 1px solid var(--border-subtle); }
.ad-tl:last-child .ad-tl-body { border-bottom: 0; padding-bottom: 8px; }
.ad-tl-top { display: flex; align-items: center; justify-content: space-between; }
.ad-tl-title { font-size: 15px; font-weight: var(--m-fw-semibold); }
.ad-tl--pending .ad-tl-title { color: var(--text-tertiary); font-weight: var(--m-fw-medium); }
.ad-tl-sub { margin-top: 3px; font-size: 12px; line-height: 1.55; color: var(--text-tertiary); }
.ad-note { margin-top: 12px; }
</style>
