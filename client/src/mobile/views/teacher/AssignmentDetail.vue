<script setup>
/**
 * 教师作业详情 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6、05-page-specs 屏 20、09 §4 降级口径。
 * 数据：
 *   · GET /teacher/assignments/:id      作业信息 + 题目 + 班级
 *   · GET /teacher/review-summary       进度/待审核（按 assignmentId 过滤行；失败时退回列表接口）
 *   · GET /teacher/review-class/:classId?assignmentId=  学生名单与状态（可选，失败不阻塞进度）
 * 延期项（催交/导出/均分）不请求、不渲染。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import {
  MEmpty, MIcon, MRing, MSeg, MSkeleton, MStatusTag,
} from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { formatDateTime, timeStatus } from '../../../domain/format.js';

const route = useRoute();
const router = useRouter();
const toast = useMobileToast();
const assignmentId = computed(() => Number(route.params.id));
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherAssignmentDetail.vue', action: '加载作业详情' });

const assignment = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
const progress = ref({ submitted: 0, expected: 0, pendingReview: 0, percent: 0, source: '' });
const progressError = ref('');
const students = ref([]);
const studentsLoading = ref(false);
const studentsError = ref('');
const classId = ref(null);
const tab = ref('submit');

const classes = computed(() => ((assignment.value && assignment.value.assignmentClasses) || [])
  .map((ac) => ac.class)
  .filter(Boolean));
const questions = computed(() => {
  const list = (assignment.value && assignment.value.assignmentQuestions) || [];
  return list.filter((aq) => aq.question).map((aq) => aq.question);
});
const statusInfo = computed(() => {
  const item = assignment.value;
  if (!item) return { text: '', type: 'neutral' };
  if (item.locked) return { text: '已锁定', type: 'neutral' };
  const s = timeStatus(item.startTime, item.endTime);
  if (s === 'upcoming') return { text: '未开始', type: 'neutral' };
  if (s === 'ended') return { text: '已结束', type: 'neutral' };
  return { text: '进行中', type: 'success' };
});
const classNames = computed(() => classes.value.map((c) => c.name).join(' / '));
const canReview = computed(() => progress.value.pendingReview > 0);
const backTo = '/m/teacher/assignments';

const SUB_STATUS = {
  submitted: { text: 'AI 评分中', type: 'info' },
  ai_graded: { text: '待审核', type: 'warning' },
  reviewed: { text: '已审核', type: 'success' },
  published: { text: '已发布', type: 'success' },
  abnormal: { text: '评分异常', type: 'danger' },
  not_submitted: { text: '未提交', type: 'neutral' },
};

function subStatus(row) {
  return SUB_STATUS[row.status] || { text: row.status || '未知', type: 'neutral' };
}

function displayNo(no) {
  const text = String(no || '');
  const at = text.indexOf('@');
  return at > 0 ? text.slice(0, at) : text;
}

function scoreOf(row) {
  const value = row.finalScore != null ? row.finalScore : row.aiScore;
  if (value == null) return null;
  if (row.finalScore != null) return { value, label: row.status === 'published' ? '已发布' : '教师分' };
  return { value, label: 'AI 分' };
}

async function loadDetail() {
  detailLoading.value = true;
  detailError.value = '';
  const r = await safeLoad(() => request.get('/teacher/assignments/' + assignmentId.value));
  detailLoading.value = false;
  if (r.error) {
    detailError.value = r.message || '作业详情加载失败';
    return;
  }
  assignment.value = r.data || null;
  const classList = (assignment.value && assignment.value.assignmentClasses) || [];
  if (classList.length) {
    classId.value = classList[0].classId || (classList[0].class && classList[0].class.id) || null;
  }
}

async function loadProgress() {
  progressError.value = '';
  const listRes = await safeLoad(
    () => request.get('/teacher/assignments', { params: { page: 1, pageSize: 100 }, silent: true }),
    { notify: false }
  );
  if (!listRes.error) {
    const target = ((listRes.data && listRes.data.list) || []).find((item) => item.id === assignmentId.value);
    if (target) {
      const submitted = target.submissionCount || 0;
      const expected = target.expectedCount || 0;
      progress.value = {
        submitted,
        expected,
        pendingReview: target.pendingReviewCount || 0,
        percent: expected > 0 ? Math.min(100, Math.round((submitted / expected) * 100)) : 0,
        source: 'list',
      };
      return;
    }
  }
  // 列表 100 条内找不到（历史作业）时退回 review-summary 聚合
  const summaryRes = await safeLoad(() => request.get('/teacher/review-summary', { silent: true }), { notify: false });
  if (!summaryRes.error) {
    const rows = Array.isArray(summaryRes.data) ? summaryRes.data : ((summaryRes.data && summaryRes.data.list) || []);
    const matched = rows.filter((row) => row.assignmentId === assignmentId.value);
    if (matched.length) {
      let submitted = 0;
      let expected = 0;
      let pendingReview = 0;
      matched.forEach((row) => {
        submitted += row.submittedCount || 0;
        expected += row.totalStudents || 0;
        pendingReview += row.reviewPending || 0;
      });
      progress.value = {
        submitted,
        expected,
        pendingReview,
        percent: expected > 0 ? Math.min(100, Math.round((submitted / expected) * 100)) : 0,
        source: 'summary',
      };
      return;
    }
  }
  progress.value = { submitted: 0, expected: 0, pendingReview: 0, percent: 0, source: '' };
  progressError.value = '进度统计加载失败，请重试';
}

async function loadStudents() {
  if (!classId.value) {
    students.value = [];
    return;
  }
  studentsLoading.value = true;
  studentsError.value = '';
  const r = await safeLoad(() => request.get('/teacher/review-class/' + classId.value, { params: { assignmentId: assignmentId.value } }));
  studentsLoading.value = false;
  if (r.error) {
    studentsError.value = r.message || '学生名单加载失败';
    students.value = [];
    return;
  }
  const d = r.data || {};
  students.value = (d.list || []).slice().sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? -1 : 1;
    return String(a.studentName || '').localeCompare(String(b.studentName || ''), 'zh-CN');
  });
}

function onClassChange(value) {
  classId.value = value;
  loadStudents();
}

async function loadAll() {
  await loadDetail();
  if (detailError.value) return;
  loadProgress();
  if (classId.value) loadStudents();
}

function goReview() {
  router.push({ path: '/m/teacher/review', query: { assignmentId: String(assignmentId.value) } });
}

function openStudent(row) {
  if (!row.submitted) {
    toast.show('该学生尚未提交');
    return;
  }
  const submissionId = row.projectSubmissionId || row.id;
  if (!submissionId || String(submissionId).indexOf('ns-') === 0) {
    toast.show('未找到该学生的提交记录');
    return;
  }
  router.push({ path: '/m/teacher/review/' + submissionId, query: { assignmentId: String(assignmentId.value) } });
}

onMounted(loadAll);
</script>

<template>
  <MobileLayout role="" active="" bottom="actionbar">
    <MobileAppBar title="作业详情" back :back-to="backTo" />

    <main class="scroll">
      <div v-if="detailLoading" class="page mt8"><MSkeleton variant="card" :count="2" /></div>
      <div v-else-if="detailError" class="page mt8">
        <div class="banner banner--danger" role="alert">
          <MIcon name="alert" />
          <div>{{ detailError }}<button type="button" class="banner-link" @click="loadAll">重试</button></div>
        </div>
        <button type="button" class="btn btn--secondary btn--block mt16" @click="router.push('/m/teacher/assignments')">返回作业列表</button>
      </div>

      <template v-else-if="assignment">
        <div class="page mt8">
          <h2 class="detail-title">{{ assignment.title }}</h2>
          <div class="detail-tags">
            <MStatusTag :type="statusInfo.type">{{ statusInfo.text }}</MStatusTag>
            <MStatusTag v-if="progress.pendingReview" type="warning" dot>待审核 {{ progress.pendingReview }}</MStatusTag>
            <span class="detail-class">{{ classNames || '未关联班级' }}</span>
          </div>

          <div class="card mt16">
            <div class="progress-card">
              <MRing :value="progress.percent" label="提交率" />
              <div class="grow progress-side">
                <div class="kv"><span class="k">已交</span><span class="v">{{ progress.submitted }} <small>/ {{ progress.expected }} 人</small></span></div>
                <div class="kv"><span class="k">未交</span><span class="v warn">{{ Math.max(0, progress.expected - progress.submitted) }} <small>人</small></span></div>
                <div class="kv"><span class="k">待审核</span><span class="v warn">{{ progress.pendingReview }} <small>份</small></span></div>
              </div>
            </div>
            <div class="deadline-row">
              <MIcon name="clock" size="sm" />
              <span>截止 {{ formatDateTime(assignment.endTime) || '未设置' }}</span>
              <MStatusTag v-if="assignment.locked" type="neutral">已锁定</MStatusTag>
            </div>
            <div v-if="progressError" class="banner banner--danger mt12" role="alert">
              <MIcon name="alert" /><div>{{ progressError }}<button type="button" class="banner-link" @click="loadProgress">重试</button></div>
            </div>
          </div>
        </div>

        <div class="seg-wrap">
          <MSeg
            v-model="tab"
            :options="[{ label: '提交', value: 'submit' }, { label: '题目', value: 'questions' }, { label: '概况', value: 'overview' }]"
            label="作业详情分段"
          />
        </div>

        <div class="page mt16">
          <section v-if="tab === 'submit'">
            <div v-if="classes.length > 1" class="class-filter">
              <div class="class-buttons">
                <button
                  v-for="c in classes"
                  :key="c.id"
                  type="button"
                  class="class-btn"
                  :class="{ active: classId === c.id }"
                  :aria-pressed="classId === c.id"
                  @click="onClassChange(c.id)"
                >{{ c.name }}</button>
              </div>
            </div>

            <div v-if="studentsLoading" class="mt12"><MSkeleton variant="line" :count="5" /></div>
            <div v-else-if="studentsError" class="banner banner--danger" role="alert">
              <MIcon name="alert" /><div>{{ studentsError }}<button type="button" class="banner-link" @click="loadStudents">重试</button></div>
            </div>
            <MEmpty
              v-else-if="!students.length"
              icon="users"
              title="暂无可展示的学生"
              description="该班级还没有学生，或学生尚未进入名单"
            />
            <div v-else class="list mt12">
              <button
                v-for="row in students"
                :key="row.studentId"
                type="button"
                class="rowitem"
                :class="{ 'rowitem--tap': row.submitted }"
                @click="openStudent(row)"
              >
                <span class="avatar avatar--sm" aria-hidden="true">{{ String(row.studentName || '?').slice(0, 1) }}</span>
                <span class="row-main student-main">
                  <span class="row-title">{{ row.studentName }}</span>
                  <span class="row-sub">{{ displayNo(row.studentNo) }}</span>
                </span>
                <span class="row-side student-side">
                  <span v-if="scoreOf(row)" class="student-score">
                    {{ scoreOf(row).value }}<small>{{ scoreOf(row).label }}</small>
                  </span>
                  <MStatusTag :type="subStatus(row).type">{{ subStatus(row).text }}</MStatusTag>
                </span>
                <MIcon v-if="row.submitted" name="chevron-right" class="chevron" />
              </button>
            </div>
            <p class="help mt12">学生状态与 AI 分数来自真实提交；发布前学生不可见成绩。</p>
          </section>

          <section v-else-if="tab === 'questions'">
            <div v-if="!questions.length" class="mt12">
              <MEmpty icon="assignments" title="暂无题目" description="该作业没有可展示的题目" />
            </div>
            <div v-else class="list">
              <div v-for="(q, index) in questions" :key="q.id" class="question-row">
                <span class="question-index">{{ index + 1 }}</span>
                <span class="row-main">
                  <span class="row-title">{{ q.title }}</span>
                  <span class="row-sub question-sub">
                    <MStatusTag :type="q.type === 'project' ? 'accent' : 'info'">{{ q.type === 'project' ? '实训题' : '编程题' }}</MStatusTag>
                    <span class="question-score">{{ q.maxScore }} 分</span>
                  </span>
                </span>
              </div>
            </div>
            <p class="readonly-tip mt12"><MIcon name="info" />题目编辑请在电脑端完成，手机端仅查看。</p>
          </section>

          <section v-else>
            <div class="card">
              <div class="kv"><span class="k">开始时间</span><span class="v">{{ formatDateTime(assignment.startTime) || '未设置' }}</span></div>
              <div class="kv"><span class="k">截止时间</span><span class="v">{{ formatDateTime(assignment.endTime) || '未设置' }}</span></div>
              <div class="kv"><span class="k">题目数</span><span class="v">{{ questions.length }} 题</span></div>
              <div class="kv"><span class="k">关联班级</span><span class="v">{{ classNames || '未关联' }}</span></div>
              <div class="kv"><span class="k">允许重交</span><span class="v">{{ assignment.allowResubmit ? '允许' : '不允许' }}</span></div>
              <div class="kv"><span class="k">最多提交次数</span><span class="v">{{ assignment.maxAttempts == null ? '不限' : assignment.maxAttempts + ' 次' }}</span></div>
              <div class="kv"><span class="k">计分口径</span><span class="v">{{ assignment.scorePolicy === 'best' ? '取最高分' : '取最后一次' }}</span></div>
              <div class="kv"><span class="k">答案可见性</span><span class="v">{{ assignment.answerVisibility === 'immediate' ? '评分后可见' : '发布后可见' }}</span></div>
              <div class="kv"><span class="k">锁定状态</span><span class="v">{{ assignment.locked ? '已锁定' : '未锁定' }}</span></div>
            </div>
            <p class="readonly-tip mt12"><MIcon name="info" />锁定/解锁、复制作业链接请在作业列表的「更多」中操作。</p>
          </section>
        </div>
      </template>
    </main>

    <div class="actionbar">
      <button type="button" class="btn btn--primary btn--block" :disabled="!assignment" @click="goReview">
        <MIcon name="review" />
        {{ canReview ? '去审核（' + progress.pendingReview + '）' : '查看评分与审核' }}
      </button>
    </div>
  </MobileLayout>
</template>

<style scoped>
.detail-title {
  font-size: var(--m-fs-title-1);
  line-height: var(--m-lh-title-1);
  font-weight: 700;
  letter-spacing: var(--m-tracking-tight);
  color: var(--text-strong);
}
.detail-tags { display: flex; flex-wrap: wrap; align-items: center; margin-top: 8px; }
.detail-tags > * + * { margin-left: 8px; }
.detail-class { font-size: 13px; color: var(--text-secondary); }
.progress-card { display: flex; align-items: center; }
.progress-side { margin-left: 18px; min-width: 0; }
.progress-side .kv { padding: 5px 0; }
.warn { color: var(--status-warning-fg) !important; }
.deadline-row {
  display: flex;
  align-items: center;
  margin-top: 13px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12.5px;
  color: var(--text-secondary);
}
.deadline-row .icon { width: 14px; height: 14px; margin-right: 5px; color: var(--text-tertiary); }
.deadline-row .tag { margin-left: 8px; }
.seg-wrap { padding: 18px var(--m-gutter) 0; }
.class-filter { margin-bottom: 4px; }
.class-buttons { display: flex; flex-wrap: wrap; margin: 0 -4px; }
.class-btn {
  position: relative;
  min-height: 38px;
  margin: 0 4px 8px;
  padding: 0 14px;
  border-radius: var(--m-radius-chip);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
}
.class-btn::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 44px; transform: translateY(-50%); }
.class-btn.active { background: var(--brand-600); border-color: var(--brand-600); color: var(--text-on-brand); }
.student-main { margin-left: 10px; }
.student-side { flex-direction: column; align-items: flex-end; }
.student-score { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.student-score small { display: block; margin-top: 1px; font-size: 10.5px; font-weight: 400; color: var(--text-tertiary); }
.student-side .tag { margin-top: 4px; }
.question-row { display: flex; align-items: flex-start; padding: 13px var(--m-card-pad); }
.question-row + .question-row { box-shadow: inset 0 1px 0 var(--border-subtle); }
.question-index {
  flex: none;
  width: 26px;
  height: 26px;
  margin-right: 11px;
  border-radius: 8px;
  background: var(--bg-selected);
  color: var(--text-brand);
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  justify-content: center;
}
.question-sub { display: flex; align-items: center; }
.question-score { margin-left: 10px; font-size: 12px; color: var(--text-tertiary); }
</style>
