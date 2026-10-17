<script setup>
/**
 * 教师班级详情 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6、05-page-specs 屏 29、09 §4 教师班级降级口径。
 * 数据：
 *   · GET /teacher/classes                          班级信息（可见班级 + 学生数）
 *   · GET /teacher/review-summary?classId=          班级作业进度（提交/待审核/异常）
 *   · GET /teacher/students?classId=                学生名单
 *   · GET /teacher/review-class/:classId?assignmentId=  最近一次作业的学生状态/AI 分（可选增强）
 * 无均分/排名；新增/编辑学生请用电脑端。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import {
  MEmpty, MIcon, MSkeleton, MStatusTag,
} from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';

const route = useRoute();
const router = useRouter();
const toast = useMobileToast();
const classId = computed(() => Number(route.params.classId));
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherClass.vue', action: '加载班级' });

const cls = ref(null);
const baseLoading = ref(false);
const baseError = ref('');
const summaryRows = ref([]);
const summaryLoading = ref(false);
const summaryError = ref('');
const students = ref([]);
const studentsLoading = ref(false);
const studentsError = ref('');
const keyword = ref('');
const scoreMap = ref({});
const scoreLoading = ref(false);
const scoresLoaded = ref(false);
const scoreError = ref('');
const scoreAssignmentTitle = ref('');

const SUB_STATUS = {
  submitted: { text: 'AI 评分中', type: 'info' },
  ai_graded: { text: '待审核', type: 'warning' },
  reviewed: { text: '已审核', type: 'success' },
  published: { text: '已发布', type: 'success' },
  abnormal: { text: '评分异常', type: 'danger' },
  not_submitted: { text: '未提交', type: 'neutral' },
};

const displayTitle = computed(() => (cls.value && cls.value.name) || '班级详情');
const studentCount = computed(() => (cls.value && cls.value._count && cls.value._count.studentClasses) || students.value.length);
const pendingTotal = computed(() => summaryRows.value.reduce((sum, row) => sum + (row.reviewPending || 0), 0));
const latestRow = computed(() => summaryRows.value[0] || null);
const filteredStudents = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return students.value;
  return students.value.filter((item) => String(item.realName || '').indexOf(kw) >= 0 || String(item.username || '').indexOf(kw) >= 0);
});
const backTo = '/m/teacher/home';

function displayNo(no) {
  const text = String(no || '');
  const at = text.indexOf('@');
  return at > 0 ? text.slice(0, at) : text;
}

function summaryStatus(row) {
  if (row.abnormal > 0) return { text: '评分异常 ' + row.abnormal, type: 'danger' };
  if (row.reviewPending > 0) return { text: '待审核 ' + row.reviewPending, type: 'warning' };
  if (row.aiPending > 0) return { text: 'AI 评分中 ' + row.aiPending, type: 'info' };
  if (row.allReviewed) return { text: '已审完', type: 'success' };
  return { text: '已提交 ' + row.submittedCount, type: 'info' };
}

function rowPercent(row) {
  const total = row.totalStudents || 0;
  const done = row.submittedCount || 0;
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

function scoreRowOf(studentId) {
  return scoreMap.value[studentId] || null;
}

function subStatus(row) {
  if (!row) return { text: '未提交', type: 'neutral' };
  return SUB_STATUS[row.status] || { text: row.status || '未知', type: 'neutral' };
}

function scoreText(row) {
  if (!row) return '';
  const value = row.finalScore != null ? row.finalScore : row.aiScore;
  return value == null ? '' : String(value);
}

function scoreLabel(row) {
  if (!row) return '';
  if (row.finalScore != null) return row.status === 'published' ? '已发布' : '教师分';
  if (row.aiScore != null) return 'AI 分';
  return '';
}

async function loadBase() {
  baseLoading.value = true;
  baseError.value = '';
  const r = await safeLoad(() => request.get('/teacher/classes'));
  baseLoading.value = false;
  if (r.error) {
    baseError.value = r.message || '班级信息加载失败';
    return;
  }
  const rows = Array.isArray(r.data) ? r.data : ((r.data && r.data.list) || []);
  cls.value = rows.find((item) => item.id === classId.value) || null;
  if (!cls.value) {
    baseError.value = '班级不存在或不在你的可见范围内';
    return;
  }
  loadSummary();
  loadStudents();
}

async function loadSummary() {
  summaryLoading.value = true;
  summaryError.value = '';
  const r = await safeLoad(() => request.get('/teacher/review-summary', { params: { classId: classId.value } }));
  summaryLoading.value = false;
  if (r.error) {
    summaryError.value = r.message || '作业进度加载失败';
    return;
  }
  const rows = Array.isArray(r.data) ? r.data : ((r.data && r.data.list) || []);
  summaryRows.value = rows.slice().sort((a, b) => (b.assignmentId || 0) - (a.assignmentId || 0));
  if (summaryRows.value.length) {
    loadScores(summaryRows.value[0].assignmentId);
  }
}

async function loadStudents() {
  studentsLoading.value = true;
  studentsError.value = '';
  const r = await safeLoad(() => request.get('/teacher/students', { params: { classId: classId.value } }));
  studentsLoading.value = false;
  if (r.error) {
    studentsError.value = r.message || '学生名单加载失败';
    return;
  }
  students.value = Array.isArray(r.data) ? r.data : ((r.data && r.data.list) || []);
}

async function loadScores(assignmentId) {
  scoreLoading.value = true;
  scoresLoaded.value = false;
  scoreError.value = '';
  const r = await safeLoad(
    () => request.get('/teacher/review-class/' + classId.value, { params: { assignmentId } }),
    { notify: false }
  );
  scoreLoading.value = false;
  if (r.error) {
    scoreError.value = r.message || '学生状态加载失败';
    return;
  }
  const rows = (r.data && r.data.list) || [];
  const map = {};
  rows.forEach((row) => { map[row.studentId] = row; });
  scoreMap.value = map;
  scoresLoaded.value = true;
  const matched = summaryRows.value.find((row) => row.assignmentId === assignmentId);
  scoreAssignmentTitle.value = matched ? matched.title : '';
}

function openAssignment(row) {
  router.push({ path: '/m/teacher/review', query: { assignmentId: String(row.assignmentId), classId: String(classId.value) } });
}

function openStudent(student) {
  if (scoreLoading.value) {
    toast.show('学生状态加载中，请稍候');
    return;
  }
  if (!scoresLoaded.value) {
    toast.show('学生状态尚未加载，请稍后重试');
    return;
  }
  const row = scoreRowOf(student.id);
  if (!row || !row.submitted) {
    toast.show('该学生最近一次作业尚未提交');
    return;
  }
  const submissionId = row.projectSubmissionId || row.id;
  if (!submissionId || String(submissionId).indexOf('ns-') === 0) {
    toast.show('未找到该学生的提交记录');
    return;
  }
  const query = {};
  if (latestRow.value) query.assignmentId = String(latestRow.value.assignmentId);
  query.classId = String(classId.value);
  router.push({ path: '/m/teacher/review/' + submissionId, query });
}

onMounted(loadBase);
</script>

<template>
  <MobileLayout role="" active="" bottom="none">
    <MobileAppBar :title="displayTitle" back :back-to="backTo" />

    <main class="scroll">
      <div v-if="baseLoading" class="page mt8"><MSkeleton variant="card" :count="2" /></div>
      <div v-else-if="baseError" class="page mt8">
        <div class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ baseError }}<button type="button" class="banner-link" @click="loadBase">重试</button></div>
        </div>
        <button type="button" class="btn btn--secondary btn--block mt16" @click="router.push(backTo)">返回工作台</button>
      </div>

      <template v-else-if="cls">
        <div class="page mt8">
          <div class="card">
            <div class="class-hero">
              <span class="class-icon" aria-hidden="true"><MIcon name="users" /></span>
              <div class="grow class-info">
                <div class="class-name">{{ cls.name }}</div>
                <div class="class-sub">
                  {{ (cls.school && cls.school.name) || '未关联学校' }}<template v-if="cls.ownerTeacherName"> · 班主任 {{ cls.ownerTeacherName }}</template>
                </div>
              </div>
              <MStatusTag type="info">班级</MStatusTag>
            </div>
            <div class="class-stats">
              <div class="class-stat"><b>{{ studentCount }}</b><span>学生</span></div>
              <div class="class-stat"><b>{{ summaryRows.length }}</b><span>作业</span></div>
              <div class="class-stat"><b :class="{ warn: pendingTotal > 0 }">{{ pendingTotal }}</b><span>待审核</span></div>
            </div>
          </div>
        </div>

        <div class="sec"><h2>作业进度</h2><span class="sec-note">{{ summaryRows.length }} 份</span></div>
        <div class="page">
          <MSkeleton v-if="summaryLoading && !summaryRows.length" variant="line" :count="3" />
          <div v-else-if="summaryError" class="banner banner--danger" role="alert">
            <MIcon name="alert" /><div>{{ summaryError }}<button type="button" class="banner-link" @click="loadSummary">重试</button></div>
          </div>
          <MEmpty v-else-if="!summaryRows.length" icon="assignments" title="班级还没有作业" description="布置作业后，这里会显示每份作业的提交与审核进度" />
          <div v-else class="list">
            <button v-for="row in summaryRows" :key="row.assignmentId" type="button" class="rowitem rowitem--tap progress-row" @click="openAssignment(row)">
              <span class="row-main">
                <span class="row-title">{{ row.title }}</span>
                <span class="progress-meta">
                  <MStatusTag :type="summaryStatus(row).type">{{ summaryStatus(row).text }}</MStatusTag>
                  <span class="progress-count">{{ row.submittedCount }} / {{ row.totalStudents }}</span>
                </span>
                <span class="progress-bar-row">
                  <span class="bar grow" role="progressbar" aria-label="提交进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="rowPercent(row)">
                    <i :style="{ width: rowPercent(row) + '%' }"></i>
                  </span>
                </span>
              </span>
              <MIcon name="chevron-right" class="chevron" />
            </button>
          </div>
        </div>

        <div class="sec"><h2>学生</h2><span class="sec-note">{{ students.length }} 人</span></div>
        <div class="page">
          <label class="searchbar">
            <MIcon name="search" />
            <input v-model="keyword" type="search" placeholder="搜索姓名或学号" aria-label="搜索学生姓名或学号" />
          </label>

          <p v-if="scoreLoading" class="score-note"><MIcon name="clock" size="sm" />学生状态加载中…</p>
          <p v-else-if="scoreAssignmentTitle" class="score-note">
            <MIcon name="info" size="sm" />
            学生状态来自「{{ scoreAssignmentTitle }}」最近一次作业
          </p>
          <p v-else-if="scoreError" class="score-note warn">
            <MIcon name="alert" size="sm" />{{ scoreError }}
            <button type="button" class="banner-link" @click="latestRow && loadScores(latestRow.assignmentId)">重试</button>
          </p>

          <MSkeleton v-if="studentsLoading" variant="line" :count="5" class="mt12" />
          <div v-else-if="studentsError" class="banner banner--danger" role="alert">
            <MIcon name="alert" /><div>{{ studentsError }}<button type="button" class="banner-link" @click="loadStudents">重试</button></div>
          </div>
          <MEmpty v-else-if="!filteredStudents.length" icon="users" :title="students.length ? '没有匹配的学生' : '班级暂无学生'" :description="students.length ? '换个姓名或学号再试' : '请使用电脑端导入学生名单'" />
          <div v-else class="list mt12">
            <button v-for="item in filteredStudents" :key="item.id" type="button" class="rowitem rowitem--tap" @click="openStudent(item)">
              <span class="avatar avatar--sm" aria-hidden="true">{{ String(item.realName || '?').slice(0, 1) }}</span>
              <span class="row-main student-main">
                <span class="row-title">{{ item.realName }}</span>
                <span class="row-sub">{{ displayNo(item.username) }}</span>
              </span>
              <span class="row-side student-side">
                <span v-if="scoreText(scoreRowOf(item.id))" class="student-score">
                  {{ scoreText(scoreRowOf(item.id)) }}<small>{{ scoreLabel(scoreRowOf(item.id)) }}</small>
                </span>
                <MStatusTag v-if="scoresLoaded" :type="subStatus(scoreRowOf(item.id)).type">{{ subStatus(scoreRowOf(item.id)).text }}</MStatusTag>
              </span>
            </button>
          </div>

          <p class="readonly-tip mt16"><MIcon name="info" />手机端只读；新增/编辑学生、完整成绩表请在电脑端完成。</p>
        </div>
      </template>
    </main>
  </MobileLayout>
</template>

<style scoped>
.class-hero { display: flex; align-items: center; }
.class-icon {
  flex: none;
  width: 52px;
  height: 52px;
  border-radius: 15px;
  background: var(--bg-selected);
  color: var(--text-brand);
  display: flex;
  align-items: center;
  justify-content: center;
}
.class-icon .icon { width: 26px; height: 26px; }
.class-info { margin-left: 13px; min-width: 0; }
.class-name { font-size: 19px; font-weight: 700; letter-spacing: var(--m-tracking-tight); }
.class-sub { margin-top: 3px; font-size: 12px; color: var(--text-tertiary); }
.class-stats { display: flex; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-subtle); }
.class-stat { flex: 1; text-align: center; }
.class-stat + .class-stat { border-left: 1px solid var(--border-subtle); }
.class-stat b { display: block; font-size: 20px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.class-stat span { display: block; margin-top: 4px; font-size: 11.5px; color: var(--text-tertiary); }
.warn { color: var(--status-warning-fg) !important; }
.progress-row { width: 100%; text-align: left; align-items: flex-start; }
.progress-meta { display: flex; align-items: center; margin-top: 6px; font-size: 12px; color: var(--text-tertiary); }
.progress-count { margin-left: 8px; font-variant-numeric: tabular-nums; }
.progress-bar-row { display: flex; margin-top: 8px; }
.score-note { display: flex; align-items: center; margin-top: 10px; font-size: 12px; color: var(--text-tertiary); }
.score-note .icon { width: 14px; height: 14px; margin-right: 5px; }
.student-main { margin-left: 10px; }
.student-side { flex-direction: column; align-items: flex-end; }
.student-score { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; }
.student-score small { display: block; margin-top: 1px; font-size: 10.5px; font-weight: 400; color: var(--text-tertiary); }
.student-side .tag { margin-top: 4px; }
</style>
