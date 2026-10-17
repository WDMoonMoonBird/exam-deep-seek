<script setup>
/**
 * 教师工作台（Tab 1）—— v1 零后端版
 *
 * 依据：docs/mobile-app/10-v1-implementation-contract.md §3/§6/§7、
 *       05-page-specs.md 屏 18、09-v1-scope §4 教师工作台降级口径。
 * 数据：GET /teacher/pending-summary（待审核/待AI评/异常）+ GET /teacher/assignments?pageSize=2（最近作业）。
 * 延期项（今日审核耗时/作业均分/催交）一律不请求、不渲染。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MEmpty, MIcon, MSheet, MSkeleton, MStatusTag } from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useUserStore } from '../../../stores/user.js';
import { timeStatus } from '../../../domain/format.js';

const router = useRouter();
const userStore = useUserStore();
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherHome.vue', action: '加载工作台' });

const summary = ref({ pendingReview: 0, aiPending: 0, abnormal: 0 });
const summaryError = ref('');
const summaryLoading = ref(false);
const recent = ref([]);
const recentError = ref('');
const recentLoading = ref(false);
const classes = ref([]);
const classSheetOpen = ref(false);
const classLoading = ref(false);
const classError = ref('');

const badges = computed(() => ({ review: summary.value.pendingReview || 0 }));
const teacherName = computed(() => {
  const u = userStore.user || {};
  return u.realName || u.username || '老师';
});
const schoolName = computed(() => (userStore.currentSchool && userStore.currentSchool.name) || '');
const dateText = computed(() => new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }));
const helloText = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

function progressOf(item) {
  const total = item.expectedCount || 0;
  const done = item.submissionCount || 0;
  return { done, total, percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0 };
}

function rowStatus(item) {
  if (item.locked) return { text: '已锁定', type: 'neutral' };
  const s = timeStatus(item.startTime, item.endTime);
  if (s === 'upcoming') return { text: '未开始', type: 'neutral' };
  if (s === 'ended') return { text: '已结束', type: 'neutral' };
  return { text: '进行中', type: 'success' };
}

function classText(item) {
  const names = (item.assignmentClasses || []).map((ac) => ac.class && ac.class.name).filter(Boolean);
  if (!names.length) return '未关联班级';
  if (names.length <= 2) return names.join(' / ');
  return names.slice(0, 2).join(' / ') + ' 等 ' + names.length + ' 个班';
}

async function loadSummary() {
  summaryLoading.value = true;
  summaryError.value = '';
  const r = await safeLoad(() => request.get('/teacher/pending-summary', { silent: true }), { notify: false });
  summaryLoading.value = false;
  if (r.error) {
    summaryError.value = r.message || '待办数据加载失败';
    return;
  }
  const d = r.data || {};
  summary.value = {
    pendingReview: d.pendingReview || 0,
    aiPending: d.aiPending || 0,
    abnormal: d.abnormal || 0,
  };
}

async function loadRecent() {
  recentLoading.value = true;
  recentError.value = '';
  const r = await safeLoad(() => request.get('/teacher/assignments', { params: { page: 1, pageSize: 2 } }));
  recentLoading.value = false;
  if (r.error) {
    recentError.value = r.message || '最近作业加载失败';
    return;
  }
  recent.value = (r.data && r.data.list) || [];
}

async function openClassSheet() {
  classSheetOpen.value = true;
  if (classes.value.length || classLoading.value) return;
  classLoading.value = true;
  classError.value = '';
  const r = await safeLoad(() => request.get('/teacher/classes'));
  classLoading.value = false;
  if (r.error) {
    classError.value = r.message || '班级加载失败';
    return;
  }
  classes.value = Array.isArray(r.data) ? r.data : ((r.data && r.data.list) || []);
}

function goClass(item) {
  classSheetOpen.value = false;
  router.push('/m/teacher/classes/' + item.id);
}

onMounted(() => {
  loadSummary();
  loadRecent();
});
</script>

<template>
  <MobileLayout role="teacher" active="home" bottom="tabbar" :badges="badges">
    <MobileAppBar align="left">
      <template #right>
        <button type="button" class="iconbtn" aria-label="通知与待审核" @click="router.push('/m/teacher/review')">
          <MIcon name="bell" />
        </button>
        <button type="button" class="avatar avatar--brand avatar-btn" aria-label="我的" @click="router.push('/m/teacher/profile')">
          {{ teacherName.slice(0, 1) }}
        </button>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <h1 class="sr-only">工作台</h1>
      <section class="hero home-hero">
        <div class="hero-row">
          <div class="grow">
            <div class="home-hello">{{ helloText }}，{{ teacherName }}</div>
            <p class="sub">
              <template v-if="schoolName">{{ schoolName }} · </template>{{ dateText }}
            </p>
          </div>
        </div>
      </section>

      <div class="page stack">
        <div class="stats">
          <button type="button" class="stat stat--warn home-stat" @click="router.push('/m/teacher/review')">
            <span class="v">{{ (summaryLoading || summaryError) ? '—' : summary.pendingReview }}<small>份</small></span>
            <span class="k">待审核<MIcon name="chevron-right" /></span>
          </button>
          <button type="button" class="stat stat--info home-stat" @click="router.push('/m/teacher/review')">
            <span class="v">{{ (summaryLoading || summaryError) ? '—' : summary.aiPending }}<small>份</small></span>
            <span class="k">AI 待评<MIcon name="chevron-right" /></span>
          </button>
          <button type="button" class="stat stat--danger home-stat" @click="router.push('/m/teacher/review')">
            <span class="v">{{ (summaryLoading || summaryError) ? '—' : summary.abnormal }}<small>份</small></span>
            <span class="k">评分异常<MIcon name="chevron-right" /></span>
          </button>
        </div>

        <div v-if="summaryError" class="banner banner--danger" role="alert">
          <MIcon name="alert" />
          <div>{{ summaryError }}<button type="button" class="banner-link" @click="loadSummary">重试</button></div>
        </div>

        <div v-if="!summaryLoading && !summaryError && summary.pendingReview > 0" class="banner banner--warning">
          <MIcon name="alert" />
          <div>
            <b>{{ summary.pendingReview }} 份提交等待审核</b>：AI 已完成初评，确认分数与评语后即可通过。
            <button type="button" class="banner-link" @click="router.push('/m/teacher/review')">去审核</button>
          </div>
        </div>

        <div class="home-quick" role="group" aria-label="快捷入口">
          <button type="button" class="home-quick-item" @click="router.push('/m/teacher/assign/new')">
            <span class="home-qicon"><MIcon name="plus" /></span>
            <span class="home-qlabel">布置作业</span>
          </button>
          <button type="button" class="home-quick-item" @click="router.push('/m/teacher/questions')">
            <span class="home-qicon"><MIcon name="book" /></span>
            <span class="home-qlabel">题库</span>
          </button>
          <button type="button" class="home-quick-item" @click="openClassSheet">
            <span class="home-qicon"><MIcon name="users" /></span>
            <span class="home-qlabel">班级</span>
          </button>
          <button type="button" class="home-quick-item" @click="router.push('/m/teacher/review')">
            <span class="home-qicon"><MIcon name="review" /></span>
            <span class="home-qlabel">审核</span>
          </button>
        </div>
      </div>

      <div class="sec">
        <h2>最近作业</h2>
        <router-link class="link" to="/m/teacher/assignments">全部作业<MIcon name="chevron-right" /></router-link>
      </div>

      <div class="page stack">
        <MSkeleton v-if="recentLoading && !recent.length" variant="card" :count="2" />
        <div v-else-if="recentError" class="banner banner--danger" role="alert">
          <MIcon name="alert" />
          <div>{{ recentError }}<button type="button" class="banner-link" @click="loadRecent">重试</button></div>
        </div>
        <MEmpty
          v-else-if="!recent.length"
          icon="assignments"
          title="还没有作业"
          description="布置第一份作业后，学生会在这里看到"
        >
          <button type="button" class="btn btn--primary" @click="router.push('/m/teacher/assign/new')">布置作业</button>
        </MEmpty>
        <template v-else>
          <router-link
            v-for="item in recent"
            :key="item.id"
            class="card home-assign"
            :to="'/m/teacher/assignments/' + item.id"
          >
            <div class="card-head">
              <div class="grow">
                <div class="card-title">{{ item.title }}</div>
                <div class="card-sub">{{ classText(item) }} · {{ (item._count && item._count.assignmentQuestions) || 0 }} 题</div>
              </div>
              <div class="home-assign-tags">
                <MStatusTag :type="rowStatus(item).type">{{ rowStatus(item).text }}</MStatusTag>
                <MStatusTag v-if="item.pendingReviewCount" type="warning" dot>待审核 {{ item.pendingReviewCount }}</MStatusTag>
              </div>
            </div>
            <div class="progress-row">
              <div class="bar grow" role="progressbar" aria-label="提交进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progressOf(item).percent">
                <i :style="{ width: progressOf(item).percent + '%' }"></i>
              </div>
              <span class="progress-num">{{ progressOf(item).done }} / {{ progressOf(item).total }}</span>
            </div>
          </router-link>
        </template>
      </div>
    </main>

    <MSheet v-model:open="classSheetOpen" title="选择班级" subtitle="查看班级进度与学生">
      <div v-if="classLoading" class="class-sheet-state"><MSkeleton variant="line" :count="4" /></div>
      <div v-else-if="classError" class="banner banner--danger" role="alert">
        <MIcon name="alert" /><div>{{ classError }}<button type="button" class="banner-link" @click="classes = []; openClassSheet()">重试</button></div>
      </div>
      <MEmpty v-else-if="!classes.length" icon="users" title="暂无班级" description="请联系管理员分配班级" />
      <div v-else class="list">
        <button v-for="c in classes" :key="c.id" type="button" class="rowitem rowitem--tap" @click="goClass(c)">
          <span class="rowicon" aria-hidden="true"><MIcon name="users" /></span>
          <span class="row-main">
            <span class="row-title">{{ c.name }}</span>
            <span class="row-sub">{{ (c._count && c._count.studentClasses) || 0 }} 名学生</span>
          </span>
          <MIcon name="chevron-right" class="chevron" />
        </button>
      </div>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
.home-hero { padding-top: 4px; padding-bottom: 14px; }
.home-hello {
  font-size: var(--m-fs-display);
  line-height: var(--m-lh-display);
  font-weight: 700;
  letter-spacing: var(--m-tracking-tight);
  color: var(--text-strong);
}
.avatar-btn { border: 0; font-size: 15px; }
.home-stat { display: block; width: 100%; text-align: left; font: inherit; color: inherit; }
.home-stat .k { display: flex; align-items: center; justify-content: space-between; }
.home-stat .k .icon { width: 13px; height: 13px; color: var(--text-disabled); }
.home-quick {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-gap: 6px;
  gap: 6px;
  background: var(--card-bg);
  border: 1px solid var(--card-bd);
  border-radius: var(--m-radius-card);
  padding: 12px 8px;
}
.home-quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 74px;
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
}
.home-quick-item:active { background: var(--bg-hover); }
.home-qicon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--bg-selected);
  color: var(--text-brand);
  display: flex;
  align-items: center;
  justify-content: center;
}
.home-qicon .icon { width: 20px; height: 20px; }
.home-qlabel { margin-top: 7px; }
.home-assign { display: block; color: inherit; }
.home-assign:active { transform: scale(0.995); }
.home-assign-tags { display: flex; flex-direction: column; align-items: flex-end; flex: none; margin-left: 8px; }
.home-assign-tags .tag + .tag { margin-top: 6px; }
.progress-row { display: flex; align-items: center; margin-top: 12px; }
.progress-row .bar { margin-right: 10px; }
.progress-num { flex: none; font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.class-sheet-state { padding: 4px 0; }
</style>
