<script setup>
/**
 * Scores.vue —— 学生成绩列表（Tab 3）· /m/student/scores
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #15、10-v1-implementation-contract.md §3/§6/§7
 * 设计参照：docs/mobile-app/preview/screens/student-scores.html（只读）
 * 数据：GET /student/scores（仅 published 的成绩） + GET /student/assignments（推导待出分项）。
 * v1 降级：不显示学期平均分、班级排名、百分位、等级分布、A/B/C 等级（D1）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MEmpty from '../../components/MEmpty.vue';
import MIcon from '../../components/MIcon.vue';
import MSkeleton from '../../components/MSkeleton.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import {
  assignmentState, errorText, formatDateTime, hasPublishedSubmission, hasRealSubmission,
  niceNumber, scorePercent,
} from './studentPure.js';
import { safeGet } from './studentRequests.js';

const router = useRouter();

const scores = ref([]);
const assignments = ref([]);
const loading = ref(true);
const error = ref('');
const pendingFailed = ref(false);

const scoresList = computed(() => scores.value);
const pendingList = computed(() => assignments.value
  .filter((a) => hasRealSubmission(a) && !hasPublishedSubmission(a))
  .map((a) => ({
    id: a.id,
    title: a.title,
    submittedAt: a.submittedAt,
    maxScore: a.maxScore,
    state: assignmentState(a, Date.now()),
  }))
  .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()));
const pendingCount = computed(() => pendingList.value.length);
const hasAny = computed(() => scoresList.value.length > 0 || pendingList.value.length > 0);

function scoreToneClass(row) {
  const percent = scorePercent(row.totalScore, row.maxScore);
  if (percent == null) return '';
  if (percent >= 90) return 'ss-num--excellent';
  if (percent >= 60) return 'ss-num--good';
  return 'ss-num--pass';
}
function scoreAria(row) {
  const score = row.totalScore == null ? '未出分' : niceNumber(row.totalScore) + ' 分';
  const max = row.maxScore == null ? '' : '，满分 ' + niceNumber(row.maxScore);
  return row.assignmentTitle + '，' + score + max + '，查看反馈';
}
function openScore(row) {
  router.push('/m/student/scores/' + row.assignmentId);
}
function openPending(item) {
  router.push('/m/student/assignments/' + item.id + '/done');
}
function goAssignments() {
  router.push('/m/student/assignments');
}

async function load() {
  loading.value = true;
  error.value = '';
  pendingFailed.value = false;
  // 并行取数；safeGet 失败就地返回 { ok:false,error }，主成绩失败进错误态、待出分失败只降级
  const [scoreRes, assignRes] = await Promise.all([
    safeGet('/student/scores', { silent: true }),
    safeGet('/student/assignments', { params: { page: 1, pageSize: 100 }, silent: true }),
  ]);
  if (scoreRes.ok) {
    scores.value = scoreRes.data || [];
  } else {
    scores.value = [];
    error.value = errorText(scoreRes.error);
  }
  if (assignRes.ok) {
    const data = assignRes.data || {};
    assignments.value = Array.isArray(data.list) ? data.list : [];
  } else {
    assignments.value = [];
    pendingFailed.value = true;
  }
  loading.value = false;
}

onMounted(load);
</script>

<template>
  <MobileLayout role="student" active="scores" bottom="tabbar">
    <main class="scroll">
      <div class="page-title">
        <div class="between ss-title">
          <h1>成绩</h1>
          <button type="button" class="iconbtn ss-refresh" aria-label="刷新成绩" @click="load">
            <MIcon name="refresh" />
          </button>
        </div>
        <p>已出分 {{ scoresList.length }} 门 · 待出分 {{ pendingCount }} 份</p>
      </div>

      <div v-if="loading" class="page">
        <MSkeleton variant="card" :count="3" />
      </div>

      <div v-else-if="error" class="page">
        <MEmpty icon="alert" title="成绩加载失败" :description="error">
          <button type="button" class="btn btn--primary" @click="load">重新加载</button>
        </MEmpty>
      </div>

      <template v-else>
        <div class="page">
          <div class="stats stats--2 ss-stats">
            <div class="stat stat--success">
              <div class="v tnum">{{ scoresList.length }}</div>
              <div class="k">已出分成绩</div>
            </div>
            <div class="stat" :class="{ 'stat--warn': pendingCount > 0 }">
              <div class="v tnum">{{ pendingCount }}</div>
              <div class="k">待出分作业</div>
            </div>
          </div>
        </div>

        <template v-if="scoresList.length">
          <div class="sec">
            <h2>已出分</h2>
            <span class="sec-note">{{ scoresList.length }} 份</span>
          </div>
          <div class="page">
            <div class="list">
              <button
                v-for="row in scoresList"
                :key="row.assignmentId"
                type="button"
                class="rowitem rowitem--tap ss-grade"
                :aria-label="scoreAria(row)"
                @click="openScore(row)"
              >
                <span class="row-main">
                  <span class="row-title">{{ row.assignmentTitle }}</span>
                  <span class="row-sub">
                    <span v-if="row.attemptCount">提交 {{ row.attemptCount }} 次</span>
                    <span v-else>已发布成绩</span>
                    <span v-if="row.maxScore != null"> · 满分 {{ niceNumber(row.maxScore) }}</span>
                  </span>
                </span>
                <span class="row-side ss-side">
                  <span class="ss-num" :class="scoreToneClass(row)">{{ row.totalScore == null ? '—' : niceNumber(row.totalScore) }}</span>
                  <MStatusTag type="success">已出分</MStatusTag>
                  <MIcon name="chevron-right" class="chevron" />
                </span>
              </button>
            </div>
            <p class="ss-hint">点击任一成绩可查看逐题得分与评语。</p>
          </div>
        </template>

        <div v-else-if="pendingCount" class="page ss-blank">
          <div class="banner banner--neutral" role="status">
            <MIcon name="info" />
            <div>暂无已出分成绩。老师发布成绩后会显示在这里，未发布前不显示分数。</div>
          </div>
        </div>

        <template v-if="pendingCount">
          <div class="sec">
            <h2>待出分</h2>
            <span class="sec-note">{{ pendingCount }} 份</span>
          </div>
          <div class="page">
            <div class="list">
              <button
                v-for="item in pendingList"
                :key="item.id"
                type="button"
                class="rowitem rowitem--tap ss-pending"
                :aria-label="item.title + '，待评分，查看提交'"
                @click="openPending(item)"
              >
                <span class="rowicon rowicon--warning" aria-hidden="true"><MIcon name="clock" /></span>
                <span class="row-main">
                  <span class="row-title">{{ item.title }}</span>
                  <span class="row-sub">提交于 {{ formatDateTime(item.submittedAt) || '—' }}</span>
                </span>
                <span class="row-side"><MStatusTag type="warning" dot>待评分</MStatusTag></span>
              </button>
            </div>
            <p class="ss-note">成绩发布后会显示在「已出分」中；未发布前不显示分数。</p>
          </div>
        </template>

        <div v-if="!hasAny" class="page">
          <MEmpty icon="scores" title="还没有成绩" description="完成作业并等待老师发布成绩后，这里会显示每次作业的得分。">
            <button type="button" class="btn btn--primary" @click="goAssignments">查看我的作业</button>
          </MEmpty>
        </div>

        <div v-if="pendingFailed" class="page ss-blank">
          <div class="banner banner--neutral" role="status">
            <MIcon name="alert" />
            <div>待出分列表加载失败，不影响已出分成绩。<button type="button" class="banner-link" @click="load">重试</button></div>
          </div>
        </div>
      </template>
    </main>
  </MobileLayout>
</template>

<style scoped>
.ss-title .between { align-items: flex-start; }
.ss-title h1 { flex: 1; min-width: 0; }
.ss-refresh { color: var(--text-tertiary); margin-top: -4px; }
.ss-stats { margin-top: 4px; }
.ss-stats .stat .v { font-size: 26px; }
.ss-stats .stat .k { white-space: normal; }
.ss-grade { width: 100%; text-align: left; }
.ss-grade .row-main { display: flex; flex-direction: column; }
.ss-grade .row-sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-side { display: flex; align-items: center; }
.ss-num { font-size: 24px; font-weight: var(--m-fw-bold); line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.ss-num--excellent { color: var(--score-excellent); }
.ss-num--good { color: var(--score-good); }
.ss-num--pass { color: var(--score-pass); }
.ss-side .tag { margin-left: 7px; }
.ss-side .chevron { margin-left: 4px; }
.ss-pending { width: 100%; text-align: left; }
.ss-pending .row-main { display: flex; flex-direction: column; }
.ss-pending .row-sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-hint { margin: 10px 4px 0; font-size: 11.5px; line-height: 1.6; color: var(--text-tertiary); }
.ss-note { margin: 10px 4px 0; font-size: 11.5px; line-height: 1.6; color: var(--text-tertiary); }
.ss-blank { margin-top: 8px; }
</style>
