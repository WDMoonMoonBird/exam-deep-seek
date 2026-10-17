<script setup>
/**
 * StudentHome.vue —— 学生首页（Tab 1）· /m/student/home
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #7、10-v1-implementation-contract.md §3/§6/§7
 * 设计参照：docs/mobile-app/preview/screens/student-home.html（只读）
 * 数据：GET /student/assignments（待办/角标/最近提交）、GET /student/scores（最近成绩）、GET /student/profile（姓名/班级）。
 * v1 降级：不显示学期平均分/排名/百分位（D1），通知入口（D6）不渲染。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MEmpty from '../../components/MEmpty.vue';
import MIcon from '../../components/MIcon.vue';
import MListRow from '../../components/MListRow.vue';
import MSkeleton from '../../components/MSkeleton.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { useUserStore } from '../../../stores/user.js';
import {
  assignmentCounts, assignmentState, deadlineInfoAt, deadlineLabel, errorText,
  formatDateAt, formatDateTime, formatRemaining, niceNumber,
} from './studentPure.js';
import { safeGet } from './studentRequests.js';

const router = useRouter();
const userStore = useUserStore();
const toast = useMobileToast();

const assignments = ref([]);
const scores = ref([]);
const profile = ref(null);
const loading = ref(true);
const error = ref('');
const scoresFailed = ref(false);
const now = ref(Date.now());
let nowTimer = null;

const userName = computed(() => {
  const fromProfile = profile.value && profile.value.realName;
  return fromProfile || (userStore.user && userStore.user.realName) || '同学';
});
const firstName = computed(() => String(userName.value || '同学').slice(0, 1));
const greeting = computed(() => {
  const hour = new Date(now.value).getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});
const classLine = computed(() => {
  const classes = (profile.value && profile.value.classes) || [];
  const cls = classes[0] || null;
  return cls && cls.className ? cls.className : '';
});
const todayDueCount = computed(() => {
  const today = formatDateAt(now.value);
  return assignments.value.filter((a) => {
    const st = assignmentState(a, now.value);
    return st.key === 'active' && formatDateAt(a.endTime) === today;
  }).length;
});
const subLine = computed(() => {
  const parts = [];
  if (classLine.value) parts.push(classLine.value);
  parts.push(todayDueCount.value > 0 ? '今天有 ' + todayDueCount.value + ' 份作业截止' : '今天暂无截止作业');
  return parts.join(' · ');
});

const counts = computed(() => assignmentCounts(assignments.value, now.value));
const badges = computed(() => ({ assignments: counts.value.todo }));

/** 首页待办：未完成（进行中/未开始）里截止最近的一份；进行中优先 */
const todoAssignment = computed(() => {
  const candidates = assignments.value
    .filter((a) => {
      const st = assignmentState(a, now.value);
      return st.key === 'active' || st.key === 'upcoming';
    })
    .slice()
    .sort((a, b) => new Date(a.endTime || 0).getTime() - new Date(b.endTime || 0).getTime());
  const active = candidates.filter((a) => assignmentState(a, now.value).key === 'active');
  return active[0] || candidates[0] || null;
});
const todoState = computed(() => (todoAssignment.value ? assignmentState(todoAssignment.value, now.value) : null));
const todoDeadline = computed(() => (todoAssignment.value ? deadlineLabel(todoAssignment.value.endTime, now.value) : ''));
const todoRemaining = computed(() => {
  if (!todoAssignment.value || !todoAssignment.value.endTime) return '';
  return formatRemaining(new Date(todoAssignment.value.endTime).getTime() - now.value);
});
const todoDeadlineTone = computed(() => {
  if (!todoAssignment.value) return 'normal';
  return deadlineInfoAt(todoAssignment.value.endTime, now.value).tone;
});
const todoAnswered = computed(() => Number(todoAssignment.value && todoAssignment.value.answeredCount) || 0);
const todoActionText = computed(() => {
  if (!todoAssignment.value) return '';
  if (todoState.value && todoState.value.key === 'upcoming') return '查看作业';
  return todoAnswered.value > 0 ? '继续作答' : '开始作答';
});

const recentScores = computed(() => scores.value.slice(0, 3));
const upcoming = computed(() => assignments.value
  .filter((a) => assignmentState(a, now.value).key === 'upcoming')
  .slice()
  .sort((a, b) => new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime())
  .slice(0, 3));

const quickEntries = computed(() => ([
  {
    key: 'assignments',
    icon: 'assignments',
    label: '我的作业',
    sub: counts.value.todo > 0 ? counts.value.todo + ' 份待完成' : '暂无待完成',
    to: '/m/student/assignments',
  },
  {
    key: 'scores',
    icon: 'scores',
    label: '我的成绩',
    sub: scoresFailed.value ? '成绩加载失败' : (scores.value.length > 0 ? scores.value.length + ' 门已出分' : '暂无已出分'),
    to: '/m/student/scores',
  },
  {
    key: 'doc',
    icon: 'book',
    label: '使用文档',
    sub: '作答与提交帮助',
    to: '/m/doc',
  },
]));

function go(path) {
  router.push(path);
}
function goAnswer(assignment) {
  if (!assignment) return;
  router.push('/m/student/assignments/' + assignment.id + '/answer');
}
function goTodo() {
  if (!todoAssignment.value) return;
  if (todoState.value && todoState.value.key === 'upcoming') {
    go('/m/student/assignments/' + todoAssignment.value.id);
    return;
  }
  goAnswer(todoAssignment.value);
}

async function load() {
  loading.value = true;
  error.value = '';
  scoresFailed.value = false;
  // 并行取数；safeGet 失败就地返回 { ok:false,error }，各分区独立降级（行为与原 Promise.allSettled 一致）
  const [assignRes, scoreRes, profileRes] = await Promise.all([
    safeGet('/student/assignments', { params: { page: 1, pageSize: 100 }, silent: true }),
    safeGet('/student/scores', { silent: true }),
    safeGet('/student/profile', { silent: true }),
  ]);
  if (!assignRes.ok) {
    error.value = errorText(assignRes.error);
    assignments.value = [];
  } else {
    assignments.value = (assignRes.data && assignRes.data.list) || [];
  }
  if (scoreRes.ok) {
    scores.value = scoreRes.data || [];
  } else {
    scores.value = [];
    scoresFailed.value = true;
  }
  profile.value = profileRes.ok ? (profileRes.data || null) : null;
  loading.value = false;
}

function refresh() {
  toast.show('正在刷新');
  load();
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
  <MobileLayout role="student" active="home" bottom="tabbar" :badges="badges">
    <main class="scroll">
      <header class="sh-head">
        <div class="grow">
          <h1 class="sh-hello">{{ greeting }}，{{ userName }}</h1>
          <p class="sh-hello-sub">{{ subLine }}</p>
        </div>
        <button type="button" class="iconbtn sh-refresh" aria-label="刷新首页数据" @click="refresh">
          <MIcon name="refresh" />
        </button>
        <button type="button" class="avatar avatar--brand sh-avatar" aria-label="进入我的主页" @click="go('/m/student/profile')">
          {{ firstName }}
        </button>
      </header>

      <div v-if="loading" class="page">
        <MSkeleton variant="card" :count="3" />
      </div>

      <div v-else-if="error" class="page">
        <MEmpty icon="alert" title="首页加载失败" :description="error">
          <button type="button" class="btn btn--primary" @click="refresh">重新加载</button>
        </MEmpty>
      </div>

      <template v-else>
        <div class="page">
          <article v-if="todoAssignment" class="card sh-todo" aria-labelledby="sh-todo-title">
            <div class="between">
              <span class="tag" :class="todoDeadlineTone === 'danger' ? 'tag--danger' : 'tag--warning'">
                <i class="dot"></i>{{ todoDeadline }}
              </span>
              <span class="sh-todo-left tnum">{{ todoRemaining }}</span>
            </div>
            <h2 id="sh-todo-title" class="sh-todo-title">{{ todoAssignment.title }}</h2>
            <p class="sh-todo-sub">
              已作答 {{ todoAnswered }} 项
              <span v-if="todoAssignment._count && todoAssignment._count.assignmentQuestions"> · 共 {{ todoAssignment._count.assignmentQuestions }} 题</span>
              <span v-if="todoAssignment.maxScore != null"> · 满分 {{ niceNumber(todoAssignment.maxScore) }}</span>
            </p>
            <div class="sh-todo-foot">
              <span class="sh-hint">
                <MIcon name="alert" />
                {{ todoState && todoState.key === 'upcoming' ? '开放后即可作答' : '提交后不可修改' }}
              </span>
              <button type="button" class="btn btn--primary btn--sm sh-todo-act" @click="goTodo">
                {{ todoActionText }}
                <MIcon name="arrow-right" />
              </button>
            </div>
          </article>

          <article v-else class="card sh-empty-todo">
            <div class="sh-empty-icon" aria-hidden="true"><MIcon name="check-circle" /></div>
            <div class="grow">
              <h2 class="card-title">今天没有待办作业</h2>
              <p class="card-sub">有新作业时这里会提醒你；也可以去作业列表看看。</p>
            </div>
            <button type="button" class="btn btn--secondary btn--sm" @click="go('/m/student/assignments')">全部作业</button>
          </article>
        </div>

        <section class="page mt20" aria-label="快捷入口">
          <div class="sh-quick">
            <button v-for="entry in quickEntries" :key="entry.key" type="button" class="card sh-quick-item" @click="go(entry.to)">
              <span class="sh-quick-icon" aria-hidden="true"><MIcon :name="entry.icon" /></span>
              <span class="sh-quick-label">{{ entry.label }}</span>
              <span class="sh-quick-sub">{{ entry.sub }}</span>
            </button>
          </div>
        </section>

        <div class="sec">
          <h2>最近成绩</h2>
          <button type="button" class="link" @click="go('/m/student/scores')">
            全部成绩<MIcon name="chevron-right" />
          </button>
        </div>
        <div class="page">
          <div v-if="scoresFailed" class="banner banner--neutral" role="status">
            <MIcon name="alert" />
            <div>成绩加载失败。<button type="button" class="banner-link" @click="refresh">重试</button></div>
          </div>
          <div v-else-if="recentScores.length" class="list">
            <MListRow
              v-for="row in recentScores"
              :key="row.assignmentId"
              :title="row.assignmentTitle"
              :subtitle="'已出分 · 满分 ' + (row.maxScore == null ? '—' : niceNumber(row.maxScore))"
              :to="'/m/student/scores/' + row.assignmentId"
            >
              <template #right>
                <span class="sh-row-score tnum">{{ row.totalScore == null ? '—' : niceNumber(row.totalScore) }}</span>
                <span v-if="row.maxScore != null" class="sh-row-total tnum">/{{ niceNumber(row.maxScore) }}</span>
              </template>
            </MListRow>
          </div>
          <p v-else class="sh-note">还没有已出分的成绩；老师发布后可在「成绩」查看。</p>
        </div>

        <template v-if="upcoming.length">
          <div class="sec">
            <h2>即将开始</h2>
            <span class="sec-note">开放后即可作答</span>
          </div>
          <div class="page">
            <div class="list">
              <div v-for="item in upcoming" :key="item.id" class="rowitem">
                <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="clock" /></span>
                <span class="row-main">
                  <span class="row-title">{{ item.title }}</span>
                  <span class="row-sub">
                    {{ formatDateTime(item.startTime) }} 开放
                    <span v-if="item._count && item._count.assignmentQuestions"> · {{ item._count.assignmentQuestions }} 题</span>
                  </span>
                </span>
                <span class="row-side"><MStatusTag type="neutral">未开始</MStatusTag></span>
              </div>
            </div>
          </div>
        </template>

        <p class="sh-update">
          <MIcon name="refresh" />数据更新于 {{ formatDateTime(now) }} · 点右上角刷新
        </p>
      </template>
    </main>
  </MobileLayout>
</template>

<style scoped>
.sh-head { display: flex; align-items: center; padding: 10px var(--m-gutter) 14px; }
.sh-hello { font-size: var(--m-fs-display); line-height: var(--m-lh-display); font-weight: var(--m-fw-bold); letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.sh-hello-sub { margin-top: 4px; font-size: var(--m-fs-body-sm); color: var(--text-secondary); }
.sh-refresh { color: var(--text-secondary); }
.sh-avatar { width: 44px; height: 44px; font-size: 16px; margin-left: 8px; }
.sh-todo { position: relative; overflow: hidden; padding-left: 18px; }
.sh-todo::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--status-warning-fg); }
.sh-todo-left { font-size: var(--m-fs-caption); color: var(--status-warning-fg); font-weight: var(--m-fw-medium); font-variant-numeric: tabular-nums; }
.sh-todo-title { margin-top: 10px; font-size: var(--m-fs-title-2); line-height: var(--m-lh-title-2); font-weight: var(--m-fw-semibold); letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.sh-todo-sub { margin-top: 5px; font-size: var(--m-fs-body-sm); color: var(--text-secondary); }
.sh-todo-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
.sh-hint { display: inline-flex; align-items: center; font-size: 12px; color: var(--text-tertiary); }
.sh-hint .icon { width: 14px; height: 14px; margin-right: 4px; flex: none; }
.sh-todo-act { flex: none; margin-left: 10px; height: 44px; padding: 0 14px; border-radius: 12px; font-size: 14px; }
.sh-todo-act .icon { width: 16px; height: 16px; margin-left: 4px; margin-right: 0; }
.sh-empty-todo { display: flex; align-items: center; }
.sh-empty-icon { width: 44px; height: 44px; border-radius: 13px; background: var(--status-success-bg); color: var(--status-success-fg); display: flex; align-items: center; justify-content: center; flex: none; margin-right: 12px; }
.sh-empty-icon .icon { width: 22px; height: 22px; }
.sh-empty-todo .btn { flex: none; margin-left: 10px; }
.sh-quick { display: grid; grid-template-columns: repeat(3, 1fr); grid-gap: 10px; gap: 10px; }
.sh-quick-item { display: flex; flex-direction: column; align-items: flex-start; padding: 12px; text-align: left; min-height: 104px; }
.sh-quick-item:active { transform: scale(0.985); }
.sh-quick-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--bg-selected); color: var(--text-brand); }
.sh-quick-icon .icon { width: 19px; height: 19px; }
.sh-quick-label { margin-top: 9px; font-size: 14px; font-weight: var(--m-fw-semibold); color: var(--text-primary); }
.sh-quick-sub { margin-top: 1px; font-size: 11px; color: var(--text-tertiary); }
.sh-row-score { font-size: 22px; font-weight: var(--m-fw-bold); line-height: 1; letter-spacing: -0.02em; color: var(--score-excellent); font-variant-numeric: tabular-nums; }
.sh-row-total { font-size: 12px; color: var(--text-tertiary); margin-left: 2px; font-variant-numeric: tabular-nums; }
.sh-note { padding: 16px 4px; font-size: 13px; line-height: 1.6; color: var(--text-tertiary); }
.sh-update { margin: 18px var(--m-gutter) 4px; text-align: center; font-size: 11.5px; color: var(--text-tertiary); }
.sh-update .icon { width: 13px; height: 13px; margin-right: 3px; vertical-align: -2px; }
</style>
