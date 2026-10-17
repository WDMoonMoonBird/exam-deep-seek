<script setup>
/**
 * 批量审核 · 多选 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6/§7.4、05-page-specs 屏 25、09 §4 批量降级口径。
 * 数据：GET /teacher/submissions?status=ai_graded&page&pageSize[&assignmentId][&classId]
 * 批量动作在下一屏逐条 PUT review（并发 3）+ 一次 PUT publish；本页不做任何写操作。
 * 不含「含教师评语 N 份」等延期统计；仅显示 AI 已评分且未审核的提交。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MEmpty, MIcon, MSkeleton, MStatusTag } from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { formatDateTime } from '../../../domain/format.js';

const route = useRoute();
const router = useRouter();
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherBatchSelect.vue', action: '加载批量列表' });

const list = ref([]);
const total = ref(0);
const page = ref(1);
const PAGE_SIZE = 50;
const loading = ref(false);
const loadingMore = ref(false);
const errorText = ref('');
const selectedIds = ref([]);
const assignment = ref(null);
const assignmentLoading = ref(false);
const assignmentError = ref('');

const assignmentId = computed(() => {
  const n = Number(route.query.assignmentId);
  return Number.isInteger(n) && n > 0 ? n : null;
});
const classId = computed(() => {
  const n = Number(route.query.classId);
  return Number.isInteger(n) && n > 0 ? n : null;
});
const selectedSet = computed(() => {
  const set = {};
  selectedIds.value.forEach((id) => { set[id] = true; });
  return set;
});
const selectedCount = computed(() => selectedIds.value.length);
const allSelected = computed(() => list.value.length > 0 && list.value.every((item) => !!selectedSet.value[item.id]));
const hasMore = computed(() => list.value.length < total.value);
// 契约 §6/§7：批量只允许「通用题」作业；含实训题（project）必须逐份审核。
// 有 assignmentId 时先 GET /teacher/assignments/:id 检查 assignmentQuestions[].question.type。
const hasProject = computed(() => {
  const rows = (assignment.value && assignment.value.assignmentQuestions) || [];
  return rows.some((aq) => aq && aq.question && aq.question.type === 'project');
});
const guardReason = computed(() => {
  if (!assignmentId.value) return '未指定作业：请从具体作业进入批量审核，以便确认是否含实训题。';
  if (assignmentError.value) return assignmentError.value;
  if (hasProject.value) return '该作业含实训题，请逐份审核。';
  return '';
});
const batchBlocked = computed(() => !assignmentId.value || assignmentLoading.value || !!assignmentError.value || hasProject.value);
const rowTagText = computed(() => (hasProject.value ? '需逐份审核' : '待审核'));
const backTo = computed(() => {
  const query = {};
  if (assignmentId.value) query.assignmentId = String(assignmentId.value);
  if (classId.value) query.classId = String(classId.value);
  return { path: '/m/teacher/review', query };
});

function displayNo(no) {
  const text = String(no || '');
  const at = text.indexOf('@');
  return at > 0 ? text.slice(0, at) : text;
}

function parseIdsFromQuery() {
  const raw = route.query.ids;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const seen = {};
  const out = [];
  raw.split(',').forEach((part) => {
    const n = Number(part);
    if (Number.isInteger(n) && n > 0 && !seen[n]) {
      seen[n] = true;
      out.push(n);
    }
  });
  return out;
}

async function loadAssignment() {
  if (!assignmentId.value) return;
  assignmentLoading.value = true;
  assignmentError.value = '';
  const r = await safeLoad(
    () => request.get('/teacher/assignments/' + assignmentId.value, { silent: true }),
    { notify: false }
  );
  assignmentLoading.value = false;
  if (r.error) {
    assignmentError.value = r.message || '作业信息加载失败，无法确认是否含实训题';
    return;
  }
  assignment.value = r.data || null;
}

function toggle(item) {
  if (batchBlocked.value) return;
  const at = selectedIds.value.indexOf(item.id);
  if (at >= 0) selectedIds.value.splice(at, 1);
  else selectedIds.value.push(item.id);
}

function toggleSelectAll() {
  if (batchBlocked.value) return;
  if (allSelected.value) {
    selectedIds.value = [];
    return;
  }
  selectedIds.value = list.value.map((item) => item.id);
}

function clearSelection() {
  selectedIds.value = [];
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
    errorText.value = r.message || '批量列表加载失败，请重试';
    return;
  }
  const d = r.data || {};
  const rows = d.list || [];
  list.value = append ? list.value.concat(rows) : rows;
  total.value = d.total || 0;
  const available = {};
  list.value.forEach((item) => { available[item.id] = true; });
  selectedIds.value = selectedIds.value.filter((id) => available[id]);
}

function loadMore() {
  if (loading.value || loadingMore.value) return;
  page.value += 1;
  fetchList(true);
}

function goConfirm() {
  if (batchBlocked.value || !selectedCount.value) return;
  const query = { ids: selectedIds.value.join(',') };
  if (assignmentId.value) query.assignmentId = String(assignmentId.value);
  if (classId.value) query.classId = String(classId.value);
  router.push({ path: '/m/teacher/batch/confirm', query });
}

onMounted(() => {
  selectedIds.value = parseIdsFromQuery();
  if (assignmentId.value) loadAssignment();
  fetchList(false);
});
</script>

<template>
  <MobileLayout role="" active="" bottom="actionbar">
    <MobileAppBar title="批量审核" back :back-to="backTo">
      <template #right>
        <button type="button" class="iconbtn iconbtn--text" @click="router.push(backTo)">完成</button>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <div class="page mt8">
        <div class="card batch-bar">
          <div class="grow">
            <div class="batch-title">已选 <b>{{ selectedCount }}</b> 项</div>
            <div class="batch-sub">本页 {{ list.length }} 份待审核 · 共 {{ total }} 份</div>
          </div>
          <div class="batch-actions">
            <button type="button" class="btn btn--sm btn--secondary" :disabled="batchBlocked" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选本页' }}</button>
            <button type="button" class="btn btn--sm btn--ghost" :disabled="!selectedCount" @click="clearSelection">清空</button>
          </div>
        </div>

        <div v-if="assignmentLoading" class="banner banner--neutral mt12" role="status">
          <MIcon name="clock" />
          <div>正在检查作业题型（是否含实训题）…</div>
        </div>
        <div v-else-if="guardReason" class="banner" :class="hasProject || assignmentError ? 'banner--danger' : 'banner--warning'" role="alert">
          <MIcon name="alert" />
          <div>
            {{ guardReason }}
            <button v-if="assignmentError" type="button" class="banner-link" @click="loadAssignment">重试</button>
            <button v-else-if="!assignmentId" type="button" class="banner-link" @click="router.push('/m/teacher/assignments')">去选择作业</button>
          </div>
        </div>

        <div class="list-head">
          <span>AI 已评分 · 待审核</span>
          <span>{{ selectedCount }} / {{ total }}</span>
        </div>

        <MSkeleton v-if="loading && !list.length" variant="card" :count="3" />
        <div v-else-if="errorText" class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ errorText }}<button type="button" class="banner-link" @click="fetchList(false)">重试</button></div>
        </div>
        <MEmpty
          v-else-if="!list.length"
          icon="inbox"
          title="没有可批量审核的提交"
          description="AI 评分完成后会进入这里；评分中的提交请稍后再来。"
        >
          <button type="button" class="btn btn--secondary" @click="router.push(backTo)">返回审核队列</button>
        </MEmpty>

        <div v-else class="list">
          <button
            v-for="item in list"
            :key="item.id"
            type="button"
            class="rowitem batch-row"
            :class="{ 'rowitem--selected': !!selectedSet[item.id], 'batch-row--disabled': batchBlocked }"
            :aria-pressed="!!selectedSet[item.id]"
            :aria-disabled="batchBlocked ? 'true' : undefined"
            @click="toggle(item)"
          >
            <span class="check" :class="{ on: !!selectedSet[item.id] }" aria-hidden="true"><MIcon name="check" /></span>
            <span class="avatar avatar--sm" aria-hidden="true">{{ String((item.student && item.student.realName) || '?').slice(0, 1) }}</span>
            <span class="row-main batch-main">
              <span class="row-title">{{ (item.student && item.student.realName) || '未知学生' }}</span>
              <span class="row-sub">{{ displayNo(item.student && item.student.username) }} · {{ (item.assignment && item.assignment.title) || '未知作业' }}</span>
              <span class="row-sub">提交于 {{ formatDateTime(item.submittedAt) || '未知时间' }}</span>
            </span>
            <span class="row-side batch-side">
              <span class="batch-score">{{ item.aiScore == null ? '--' : item.aiScore }}<small>AI 分</small></span>
              <MStatusTag type="warning">{{ rowTagText }}</MStatusTag>
            </span>
          </button>
          <button v-if="hasMore" type="button" class="load-more" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? '加载中…' : '加载更多' }}
          </button>
        </div>

        <div class="banner banner--info mt12">
          <MIcon name="info" />
          <div v-if="hasProject">该作业含实训题（工程包），批量审核会走通用评分接口，无法保证实训题评分规则，因此已禁用批量入口；请返回审核队列逐份审核。</div>
          <div v-else>批量审核会逐条提交（并发 3 条），全部成功后再统一发布成绩；不保证批量操作原子，失败项可在下一步重试。</div>
        </div>
      </div>
    </main>

    <div class="actionbar">
      <button type="button" class="btn btn--secondary" :disabled="!selectedCount" @click="clearSelection">清空选择</button>
      <button type="button" class="btn btn--primary" :disabled="!selectedCount || batchBlocked" @click="goConfirm">审核通过 ({{ selectedCount }})</button>
    </div>
  </MobileLayout>
</template>

<style scoped>
.batch-bar { display: flex; align-items: center; }
.batch-title { font-size: 15px; font-weight: 650; }
.batch-title b { color: var(--text-brand); font-variant-numeric: tabular-nums; }
.batch-sub { margin-top: 2px; font-size: 12px; color: var(--text-tertiary); }
.batch-actions { display: flex; align-items: center; flex: none; margin-left: 10px; }
.batch-actions .btn + .btn { margin-left: 6px; }
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 4px 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.batch-row { width: 100%; text-align: left; color: inherit; font: inherit; }
.batch-row .check { margin-right: 12px; }
.batch-row--disabled { opacity: 0.72; }
.batch-row .avatar { margin-right: 10px; }
.batch-main { min-width: 0; }
.batch-side { flex-direction: column; align-items: flex-end; }
.batch-score { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
.batch-score small { display: block; margin-top: 1px; font-size: 10.5px; font-weight: 400; color: var(--text-tertiary); }
.batch-side .tag { margin-top: 4px; }
.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  font-size: 13.5px;
  color: var(--text-link);
}
</style>
