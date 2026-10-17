<script setup>
/**
 * 教师评分审核队列（Tab 3）—— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6、05-page-specs 屏 21、09 §4 教师队列降级口径。
 * 数据：
 *   · GET /teacher/submissions?status=ai_graded&page&pageSize[&assignmentId][&classId]
 *   · GET /teacher/review-summary（队列进度：已提交/待审核；按 assignmentId/classId 收窄）
 * 延期项（高于班均/队列卡 AI 分项/评语）不请求、不渲染；队列只做「进入逐份审核」。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import {
  MEmpty, MIcon, MProgress, MSkeleton, MStatusTag,
} from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { formatDateTime } from '../../../domain/format.js';

const route = useRoute();
const router = useRouter();
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherReviewQueue.vue', action: '加载审核队列' });

const list = ref([]);
const total = ref(0);
const page = ref(1);
const PAGE_SIZE = 20;
const loading = ref(false);
const loadingMore = ref(false);
const errorText = ref('');
const badges = ref({});
const progress = ref({ submitted: 0, pending: 0, percent: 0, available: false });
const progressError = ref('');
const filterTitle = ref('');

const assignmentId = computed(() => {
  const raw = route.query.assignmentId;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
});
const classId = computed(() => {
  const raw = route.query.classId;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
});
const hasFilter = computed(() => !!(assignmentId.value || classId.value));
const hasMore = computed(() => list.value.length < total.value);
const filterQuery = computed(() => {
  const q = {};
  if (assignmentId.value) q.assignmentId = String(assignmentId.value);
  if (classId.value) q.classId = String(classId.value);
  return q;
});

function displayNo(no) {
  const text = String(no || '');
  const at = text.indexOf('@');
  return at > 0 ? text.slice(0, at) : text;
}

function aiScoreText(item) {
  return item.aiScore == null ? '--' : item.aiScore;
}

async function loadBadge() {
  const r = await safeLoad(() => request.get('/teacher/pending-summary', { silent: true }), { notify: false });
  if (!r.error) badges.value = { review: (r.data && r.data.pendingReview) || 0 };
}

async function loadProgress() {
  progressError.value = '';
  const params = {};
  if (classId.value) params.classId = classId.value;
  const r = await safeLoad(() => request.get('/teacher/review-summary', { params, silent: true }), { notify: false });
  if (r.error) {
    progress.value = { submitted: 0, pending: 0, percent: 0, available: false };
    progressError.value = r.message || '队列进度加载失败';
    return;
  }
  const rows = Array.isArray(r.data) ? r.data : ((r.data && r.data.list) || []);
  const matched = assignmentId.value ? rows.filter((row) => row.assignmentId === assignmentId.value) : rows;
  if (!matched.length) {
    progress.value = { submitted: 0, pending: 0, percent: 0, available: false };
    return;
  }
  let submitted = 0;
  let pending = 0;
  matched.forEach((row) => {
    submitted += row.submittedCount || 0;
    pending += row.reviewPending || 0;
  });
  if (!assignmentId.value) {
    // 未按作业筛选时，若全量汇总过宽也保持可用；标题取第一行的作业名仅用于筛选提示
    filterTitle.value = '';
  } else if (!filterTitle.value) {
    filterTitle.value = matched[0].title || ('作业 #' + assignmentId.value);
  }
  progress.value = {
    submitted,
    pending,
    percent: submitted > 0 ? Math.min(100, Math.round(((submitted - pending) / submitted) * 100)) : 0,
    available: true,
  };
}

async function fetchList(append) {
  if (append) loadingMore.value = true;
  else loading.value = true;
  errorText.value = '';
  const params = { status: 'ai_graded', page: page.value, pageSize: PAGE_SIZE };
  if (assignmentId.value) params.assignmentId = assignmentId.value;
  if (classId.value) params.classId = classId.value;
  const r = await safeLoad(() => request.get('/teacher/submissions', { params }));
  loading.value = false;
  loadingMore.value = false;
  if (r.error) {
    errorText.value = r.message || '审核队列加载失败，请重试';
    return;
  }
  const d = r.data || {};
  const rows = d.list || [];
  list.value = append ? list.value.concat(rows) : rows;
  total.value = d.total || 0;
  if (assignmentId.value && !filterTitle.value) {
    const first = list.value.find((item) => item.assignment && item.assignment.title);
    if (first) filterTitle.value = first.assignment.title;
  }
}

function reload() {
  page.value = 1;
  fetchList(false);
}

function loadMore() {
  if (loading.value || loadingMore.value) return;
  page.value += 1;
  fetchList(true);
}

function clearFilter() {
  router.replace('/m/teacher/review');
  page.value = 1;
  filterTitle.value = '';
  fetchList(false);
  loadProgress();
}

function openItem(item) {
  const query = {};
  if (assignmentId.value) query.assignmentId = String(assignmentId.value);
  if (classId.value) query.classId = String(classId.value);
  router.push({ path: '/m/teacher/review/' + item.id, query });
}

function goBatch() {
  router.push({ path: '/m/teacher/batch', query: filterQuery.value });
}

onMounted(() => {
  fetchList(false);
  loadProgress();
  loadBadge();
});
</script>

<template>
  <MobileLayout role="teacher" active="review" bottom="tabbar" :badges="badges">
    <MobileAppBar align="left">
      <template #right>
        <button type="button" class="iconbtn" aria-label="批量审核" @click="goBatch">
          <MIcon name="grid" />
        </button>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <h1 class="sr-only">评分审核</h1>
      <div class="page mt8">
        <div v-if="hasFilter" class="filterbar">
          <MIcon name="filter" />
          <span class="filterbar-text">{{ filterTitle || (assignmentId ? '作业 #' + assignmentId : '班级筛选') }}</span>
          <button type="button" class="filterbar-clear" @click="clearFilter">清除筛选</button>
        </div>

        <div class="card queue-summary">
          <div class="between">
            <div class="card-title">待审核 {{ total }} 份</div>
            <MStatusTag v-if="progress.available" type="info">已处理 {{ progress.percent }}%</MStatusTag>
          </div>
          <template v-if="progress.available">
            <div class="queue-progress-row">
              <MProgress :value="progress.submitted - progress.pending" :max="progress.submitted || 1" label="审核进度" />
            </div>
            <p class="queue-sub">已提交 {{ progress.submitted }} 份 · 待审核 {{ progress.pending }} 份</p>
          </template>
          <p v-else-if="progressError" class="queue-sub">{{ progressError }}</p>
          <p v-else class="queue-sub">队列按提交时间倒序；AI 评分完成后自动进入。</p>
        </div>
      </div>

      <div class="page mt12">
        <MSkeleton v-if="loading && !list.length" variant="card" :count="3" />
        <div v-else-if="errorText" class="banner banner--danger" role="alert">
          <MIcon name="alert" />
          <div>{{ errorText }}<button type="button" class="banner-link" @click="reload">重试</button></div>
        </div>
        <MEmpty
          v-else-if="!list.length"
          icon="check-circle"
          title="没有待审核的提交"
          description="AI 评分完成后会自动进入这里；评分中的提交请稍后再来。"
        >
          <button type="button" class="btn btn--secondary" @click="reload">刷新</button>
        </MEmpty>

        <div v-else class="stack">
          <button
            v-for="item in list"
            :key="item.id"
            type="button"
            class="card queue-card"
            :aria-label="'审核 ' + (item.student && item.student.realName) + ' 的提交'"
            @click="openItem(item)"
          >
            <div class="queue-head">
              <span class="avatar avatar--sm" aria-hidden="true">{{ String((item.student && item.student.realName) || '?').slice(0, 1) }}</span>
              <span class="grow queue-student">
                <span class="queue-name">{{ (item.student && item.student.realName) || '未知学生' }}</span>
                <span class="queue-no">{{ displayNo(item.student && item.student.username) }}</span>
              </span>
              <span class="queue-score" aria-hidden="true">
                <b>{{ aiScoreText(item) }}</b>
                <span>AI 分</span>
              </span>
              <MIcon name="chevron-right" class="chevron" />
            </div>
            <p class="queue-turn">{{ (item.assignment && item.assignment.title) || '未知作业' }}<span class="dot-sep">{{ (item.question && item.question.title) || '' }}</span></p>
            <p class="queue-time"><MIcon name="clock" size="sm" />提交于 {{ formatDateTime(item.submittedAt) || '未知时间' }}</p>
          </button>

          <button v-if="hasMore" type="button" class="btn btn--secondary btn--block" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? '加载中…' : '加载更多' }}
          </button>
        </div>
      </div>
    </main>
  </MobileLayout>
</template>

<style scoped>
.filterbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--bg-selected);
  color: var(--text-brand);
  font-size: 13px;
}
.filterbar .icon { width: 15px; height: 15px; margin-right: 6px; }
.filterbar-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filterbar-clear { margin-left: 8px; flex: none; font-size: 12.5px; font-weight: 600; color: var(--text-brand); }
.queue-summary { padding-bottom: 14px; }
.queue-progress-row { margin-top: 12px; }
.queue-sub { margin-top: 8px; font-size: 12px; color: var(--text-tertiary); }
.queue-card {
  display: block;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: transform var(--m-duration-press) var(--m-ease-out);
}
.queue-card:active { transform: scale(0.99); }
.queue-head { display: flex; align-items: center; }
.queue-student { margin-left: 10px; min-width: 0; }
.queue-name { display: block; font-size: 15px; font-weight: 600; }
.queue-no { display: block; margin-top: 2px; font-size: 12px; color: var(--text-tertiary); }
.queue-score { flex: none; text-align: right; margin-left: 10px; }
.queue-score b { display: block; font-size: 26px; line-height: 1; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.queue-score span { display: block; margin-top: 2px; font-size: 10.5px; color: var(--text-tertiary); }
.queue-turn {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-time {
  display: flex;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.queue-time .icon { width: 13px; height: 13px; margin-right: 4px; }
</style>
