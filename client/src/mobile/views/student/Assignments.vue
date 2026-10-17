<script setup>
/**
 * Assignments.vue —— 学生作业列表（Tab 2）· /m/student/assignments
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #8、10-v1-implementation-contract.md §3/§6/§7
 * 设计参照：docs/mobile-app/preview/screens/student-assignments.html（只读）
 * 数据：GET /student/assignments?page&pageSize（列表；状态由 submissions/startTime/endTime 前端推导，与桌面同口径）。
 * v1 降级：不显示均分/排名/等级字母/百分位；分数只在 published 后显示（接口已保证）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MChips from '../../components/MChips.vue';
import MEmpty from '../../components/MEmpty.vue';
import MIcon from '../../components/MIcon.vue';
import MSkeleton from '../../components/MSkeleton.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import request from '../../../api/request.js';
import {
  assignmentCounts, assignmentState, deadlineInfoAt, deadlineLabel, errorText,
  filterGroupOf, formatDateTime, formatRemaining, niceNumber, payload,
} from './studentPure.js';

const route = useRoute();
const router = useRouter();

const list = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const now = ref(Date.now());
const activeFilter = ref(normalizeFilter(route.query.filter));
let nowTimer = null;

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function normalizeFilter(value) {
  const allowed = ['all', 'todo', 'submitted', 'graded'];
  return allowed.indexOf(value) >= 0 ? value : 'all';
}

const counts = computed(() => assignmentCounts(list.value, now.value));
const badges = computed(() => ({ assignments: counts.value.todo }));

const filterOptions = computed(() => ([
  { label: '全部', value: 'all', count: counts.value.all },
  { label: '进行中', value: 'todo', count: counts.value.todo },
  { label: '待评分', value: 'submitted', count: counts.value.submitted },
  { label: '已评分', value: 'graded', count: counts.value.graded },
]));

const filteredList = computed(() => {
  const filter = activeFilter.value;
  const result = list.value.filter((a) => {
    if (filter === 'all') return true;
    return filterGroupOf(assignmentState(a, now.value)) === filter;
  });
  return result.slice().sort(compareAssignments);
});

const STATE_RANK = { active: 0, upcoming: 1, submitted: 2, graded: 3, expired: 4, locked: 5 };
function compareAssignments(a, b) {
  const sa = assignmentState(a, now.value);
  const sb = assignmentState(b, now.value);
  const ra = STATE_RANK[sa.key] == null ? 9 : STATE_RANK[sa.key];
  const rb = STATE_RANK[sb.key] == null ? 9 : STATE_RANK[sb.key];
  if (ra !== rb) return ra - rb;
  const ea = new Date(a.endTime || 0).getTime();
  const eb = new Date(b.endTime || 0).getTime();
  // 未完成按截止升序（越快截止越靠前）；其余按截止降序（最近发生的在前）
  if (ra <= 1) return ea - eb;
  return eb - ea;
}

/** 24 小时内截止的未完成作业 => 顶部提醒 */
const urgentAssignment = computed(() => {
  const candidates = list.value
    .filter((a) => assignmentState(a, now.value).key === 'active' && a.endTime)
    .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime());
  const first = candidates[0];
  if (!first) return null;
  const diff = new Date(first.endTime).getTime() - now.value;
  return diff > 0 && diff <= 24 * 3600 * 1000 ? first : null;
});
const urgentText = computed(() => {
  const a = urgentAssignment.value;
  if (!a) return '';
  const diff = new Date(a.endTime).getTime() - now.value;
  return deadlineLabel(a.endTime, now.value) + ' · 还剩 ' + formatRemaining(diff);
});

const hasFilter = computed(() => activeFilter.value !== 'all');

function cardToneClass(state) { return 'sa-card--' + state.key; }

function cardMeta(a, state) {
  if (state.key === 'submitted') {
    return '提交于 ' + (formatDateTime(a.submittedAt) || '—') + (a.maxScore != null ? ' · 满分 ' + niceNumber(a.maxScore) : '');
  }
  if (state.key === 'graded') {
    return '已发布成绩 · 满分 ' + (a.maxScore == null ? '—' : niceNumber(a.maxScore)) + (a.attemptCount ? ' · 提交 ' + a.attemptCount + ' 次' : '');
  }
  if (state.key === 'upcoming') {
    return '开放时间 ' + (formatDateTime(a.startTime) || '—');
  }
  if (state.key === 'expired') {
    return '截止时间 ' + (formatDateTime(a.endTime) || '—') + ' · 未提交';
  }
  if (state.key === 'locked') {
    return '老师已锁定该作业，暂时无法作答';
  }
  return deadlineLabel(a.endTime, now.value) + ' · ' + deadlineInfoAt(a.endTime, now.value).text;
}

function cardNote(a, state) {
  if (state.key === 'active') {
    const answered = Number(a.answeredCount) || 0;
    return answered > 0 ? '已作答 ' + answered + ' 项 · 草稿自动保存' : '尚未开始作答 · 提交后不可修改';
  }
  if (state.key === 'submitted') return '等待老师评分，发布后可在成绩中查看';
  if (state.key === 'graded') return '成绩已发布，可查看逐题反馈';
  if (state.key === 'upcoming') return '开放后限时作答，可提前交卷';
  if (state.key === 'expired') return '已过截止时间，无法再提交';
  if (state.key === 'locked') return '如需解锁请联系任课教师';
  return '';
}

function openCard(a, state) {
  if (!state.canEnter) return;
  if (state.key === 'graded') {
    router.push('/m/student/scores/' + a.id);
    return;
  }
  if (state.key === 'submitted') {
    router.push('/m/student/assignments/' + a.id + '/done');
    return;
  }
  router.push('/m/student/assignments/' + a.id);
}

function continueAnswer(a) {
  router.push('/m/student/assignments/' + a.id + '/answer');
}
function openDetail(a) {
  router.push('/m/student/assignments/' + a.id);
}

function setFilter(value) {
  activeFilter.value = normalizeFilter(value);
}

watch(activeFilter, (value) => {
  const query = { ...route.query };
  if (value === 'all') delete query.filter;
  else query.filter = value;
  router.replace({ path: route.path, query });
});

watch(() => route.query.filter, (value) => {
  const next = normalizeFilter(value);
  if (next !== activeFilter.value) activeFilter.value = next;
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const collected = [];
    let page = 1;
    let serverTotal = 0;
    while (page <= MAX_PAGES) {
      const res = await request.get('/student/assignments', {
        params: { page, pageSize: PAGE_SIZE },
        silent: true,
      });
      const data = payload(res) || {};
      const rows = Array.isArray(data.list) ? data.list : [];
      serverTotal = Number(data.total) || rows.length;
      collected.push(...rows);
      if (rows.length === 0 || collected.length >= serverTotal) break;
      page += 1;
    }
    list.value = collected;
    total.value = serverTotal;
  } catch (err) {
    error.value = errorText(err);
    list.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  nowTimer = setInterval(() => { now.value = Date.now(); }, 30000);
});
onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
});
</script>

<template>
  <MobileLayout role="student" active="assignments" bottom="tabbar" :badges="badges">
    <main class="scroll">
      <div class="page-title">
        <div class="between sa-title">
          <h1>我的作业</h1>
          <button type="button" class="iconbtn sa-refresh" aria-label="刷新作业列表" @click="load">
            <MIcon name="refresh" />
          </button>
        </div>
        <p>
          共 {{ counts.all }} 份 · {{ counts.todo }} 份待完成 · {{ counts.submitted }} 份待评分
          <span v-if="total > list.length"> · 已加载 {{ list.length }} / {{ total }}</span>
        </p>
      </div>

      <MChips
        class="sa-chips"
        :model-value="activeFilter"
        :options="filterOptions"
        label="按状态筛选作业"
        @update:model-value="setFilter"
      />

      <div v-if="urgentAssignment" class="page">
        <div class="banner banner--warning sa-banner" role="status">
          <MIcon name="clock" />
          <div>
            <b>{{ urgentText }}</b>：{{ urgentAssignment.title }} 尚未提交，提交后不可修改。
            <button type="button" class="banner-link" @click="continueAnswer(urgentAssignment)">去完成</button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="page sa-list">
        <MSkeleton variant="card" :count="4" />
      </div>

      <div v-else-if="error" class="page sa-list">
        <MEmpty icon="alert" title="作业加载失败" :description="error">
          <button type="button" class="btn btn--primary" @click="load">重新加载</button>
        </MEmpty>
      </div>

      <div v-else-if="!filteredList.length" class="page sa-list">
        <MEmpty
          :icon="hasFilter ? 'filter' : 'inbox'"
          :title="hasFilter ? '没有符合条件的作业' : '还没有收到作业'"
          :description="hasFilter ? '换个筛选条件再试，或查看全部作业。' : '老师布置作业后，这里会显示作业要求与截止时间。'"
        >
          <button v-if="hasFilter" type="button" class="btn btn--secondary" @click="setFilter('all')">查看全部</button>
          <button v-else type="button" class="btn btn--secondary" @click="load">刷新</button>
        </MEmpty>
      </div>

      <div v-else class="page sa-list">
        <article
          v-for="a in filteredList"
          :key="a.id"
          class="card sa-card"
          :class="cardToneClass(assignmentState(a, now))"
        >
          <div class="card-head">
            <div class="grow">
              <h2 class="card-title sa-card-title">{{ a.title }}</h2>
              <p class="card-sub sa-card-sub">
                <span v-if="a._count && a._count.assignmentQuestions">共 {{ a._count.assignmentQuestions }} 题</span>
                <span v-if="a.maxScore != null"> · 满分 {{ niceNumber(a.maxScore) }}</span>
                <span v-if="a.maxAttempts"> · 限 {{ a.maxAttempts }} 次</span>
                <span v-else-if="a.allowResubmit"> · 可重交</span>
              </p>
            </div>
            <MStatusTag :type="assignmentState(a, now).tone" dot>{{ assignmentState(a, now).text }}</MStatusTag>
          </div>

          <p class="sa-meta">{{ cardMeta(a, assignmentState(a, now)) }}</p>

          <div v-if="assignmentState(a, now).key === 'graded'" class="sa-score-row">
            <span class="sa-score tnum">{{ a.finalScore == null ? '—' : niceNumber(a.finalScore) }}</span>
            <span class="sa-score-total tnum">/ {{ a.maxScore == null ? '—' : niceNumber(a.maxScore) }}</span>
          </div>

          <div class="card-foot">
            <span class="sa-foot-note">{{ cardNote(a, assignmentState(a, now)) }}</span>
            <button
              v-if="assignmentState(a, now).key === 'active'"
              type="button"
              class="btn btn--primary btn--sm sa-act"
              @click="continueAnswer(a)"
            >
              {{ Number(a.answeredCount) > 0 ? '继续作答' : '开始作答' }}
            </button>
            <button
              v-else-if="assignmentState(a, now).key === 'submitted'"
              type="button"
              class="btn btn--secondary btn--sm sa-act"
              @click="openCard(a, assignmentState(a, now))"
            >
              查看提交
            </button>
            <button
              v-else-if="assignmentState(a, now).key === 'graded'"
              type="button"
              class="btn btn--soft btn--sm sa-act"
              @click="openCard(a, assignmentState(a, now))"
            >
              查看反馈
            </button>
            <button
              v-else-if="assignmentState(a, now).key === 'upcoming'"
              type="button"
              class="btn btn--secondary btn--sm sa-act"
              disabled
              aria-disabled="true"
            >
              暂未开放
            </button>
            <button
              v-else-if="assignmentState(a, now).key === 'locked'"
              type="button"
              class="btn btn--secondary btn--sm sa-act"
              disabled
              aria-disabled="true"
            >
              已锁定
            </button>
            <button v-else type="button" class="btn btn--secondary btn--sm sa-act" disabled aria-disabled="true">已截止</button>
          </div>

          <button
            v-if="assignmentState(a, now).canEnter"
            type="button"
            class="sa-card-link"
            :aria-label="'查看作业详情：' + a.title"
            @click="openDetail(a)"
          >
            查看作业详情
          </button>
        </article>

        <p class="sa-end">
          {{ activeFilter === 'all' ? '已显示全部 ' + filteredList.length + ' 份作业' : '筛选结果 ' + filteredList.length + ' 份' }} · 按状态与截止时间排序
        </p>
      </div>
    </main>
  </MobileLayout>
</template>

<style scoped>
.sa-title .between { align-items: flex-start; }
.sa-title h1 { flex: 1; min-width: 0; }
.sa-refresh { color: var(--text-secondary); margin-top: -4px; }
.sa-chips { padding-top: 2px; }
.sa-chips :deep(.chip) { height: 44px; padding: 0 16px; font-size: 14px; }
.sa-banner { margin-top: 2px; }
.sa-banner .banner-link { display: inline-flex; align-items: center; min-height: var(--m-touch-min); padding: 0 4px; margin-right: -4px; margin-top: -12px; margin-bottom: -12px; background: none; border: 0; font: inherit; cursor: pointer; }
.sa-list { margin-top: 4px; }
.sa-card { position: relative; overflow: hidden; padding-left: 18px; }
.sa-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--border-default); }
.sa-card--active::before { background: var(--status-warning-fg); }
.sa-card--submitted::before { background: var(--status-info-fg); }
.sa-card--graded::before { background: var(--score-excellent); }
.sa-card--upcoming::before { background: var(--border-strong); }
.sa-card--expired::before { background: var(--status-danger-fg); }
.sa-card--locked::before { background: var(--status-danger-fg); }
.sa-card-title { font-size: 16px; line-height: 1.4; }
.sa-card-sub { margin-top: 4px; }
.sa-meta { margin-top: 10px; font-size: 12px; line-height: 1.55; color: var(--text-tertiary); }
.sa-score-row { display: flex; align-items: baseline; margin-top: 10px; }
.sa-score { font-size: 32px; line-height: 0.95; font-weight: var(--m-fw-bold); letter-spacing: -0.03em; color: var(--score-excellent); font-variant-numeric: tabular-nums; }
.sa-score-total { margin-left: 4px; font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.sa-foot-note { display: inline-flex; align-items: center; font-size: 12px; color: var(--text-tertiary); line-height: 1.45; min-width: 0; }
.sa-act { flex: none; margin-left: 10px; height: 44px; padding: 0 16px; border-radius: 12px; font-size: 14px; }
.sa-card-link { display: block; width: 100%; min-height: var(--m-touch-min); margin-top: 6px; padding-top: 4px; text-align: left; font-size: 12px; color: var(--text-link); }
.sa-end { margin: 20px 0 4px; text-align: center; font-size: 11.5px; color: var(--text-tertiary); line-height: 1.6; }
</style>
