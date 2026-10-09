<template>
  <PageShell :title="assignmentTitle || '加载中...'" :description="pageDesc">
    <template #actions>
      <a-button type="link" @click="$router.push('/teacher/review')">← 返回评分审核</a-button>
    </template>

    <ListPage
      :columns="columns"
      :data-source="list"
      :loading="loading"
      row-key="id"
      :total="pagination.total"
      :current="pagination.current"
      :page-size="pagination.pageSize"
      empty-title="没有符合条件的学生"
      empty-desc="换个筛选条件或清空搜索词后再试。"
      empty-action-text="清空筛选"
      @page-change="onPageChange"
      @empty-action="resetFilters"
      @change="onTableChange"
    >
      <template #toolbar>
        <a-input-search v-model:value="keyword" placeholder="搜索学生姓名" allow-clear class="w-240"
          @search="fetch" @change="onSearchChange" />
        <a-radio-group v-model:value="filter" button-style="solid" size="small" @change="fetch">
          <a-radio-button value="all">全部</a-radio-button>
          <a-radio-button value="submitted">已交</a-radio-button>
          <a-radio-button value="not_submitted">未交</a-radio-button>
          <a-radio-button value="pending_review">待审核</a-radio-button>
          <a-radio-button value="abnormal">异常</a-radio-button>
        </a-radio-group>
      </template>

      <template #toolbar-right>
        <template v-if="!isPracticeMode">
          <a-button type="primary" @click="batchReview" :loading="reviewing">一键审核全班</a-button>
          <a-button @click="batchPublish" :loading="publishing">一键发布全班</a-button>
        </template>
        <a-button @click="exportXlsx">导出 Excel</a-button>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'studentName'">
          {{ record.studentName }}
        </template>
        <template v-else-if="column.key === 'studentNo'">
          {{ formatStudentNo(record.studentNo, record.schoolName) }}
        </template>
        <template v-else-if="column.key === 'aiScore'">{{ record.aiScore ?? '—' }}</template>
        <template v-else-if="column.key === 'finalScore'">
          <template v-if="!record.submitted"><span class="dim-text">—</span></template>
          <template v-else-if="editingId === record.id">
            <input
              ref="scoreInputRef"
              v-model.number="editValue"
              class="score-input"
              @blur="saveScore(record)"
              @keydown.enter="saveScore(record)"
              @keydown.escape="cancelEdit"
            />
          </template>
          <template v-else>
            <span class="score-val" @click="startEdit(record)" :title="record.finalScore != null ? '点击修改分数' : '点击设置分数'">
              {{ record.finalScore != null ? record.finalScore : '—' }}
            </span>
          </template>
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusTag v-if="record.status === 'not_submitted'" tone="neutral" text="未交" />
          <StatusTag
            v-else
            :tone="statusTone(record.status)"
            :text="statusText(record.status)"
            :dot="record.status === 'submitted'"
          />
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="row-actions">
            <a-button v-if="record.submitted" type="link" @click="openReview(record)">审核</a-button>
            <span v-else class="dim-text">—</span>
          </div>
        </template>
      </template>
    </ListPage>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { io } from 'socket.io-client';
import request from '../../api/request.js';
import { useUserStore } from '../../stores/user.js';
import { savedSortField, savedSortOrder, savedPage } from '../../stores/reviewStore.js';
import { exportReviewXlsx } from '../../infrastructure/export.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { useConfirm } from '../../composables/useConfirm.js';

/** 命令式确认框（Wave 2 构件 useConfirm）：替代原 antd 命令式调用，行为等价 */
const { confirm } = useConfirm();

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const classId = +route.params.classId;
const assignmentId = +route.query.assignmentId;

const loading = ref(false);
const list = ref([]);
const keyword = ref('');
const filter = ref('all');
const reviewing = ref(false);
const publishing = ref(false);
const assignmentTitle = ref('');
const className = ref('');
const pagination = reactive({ current: savedPage.value, pageSize: 20, total: 0 });

// 分页变化时同步到模块变量
watch(() => pagination.current, (v) => { savedPage.value = v; });

const sortField = savedSortField;
const sortOrder = savedSortOrder;

function openReview(record) {
  if (record.projectSubmissionId) {
    router.push(`/teacher/review/project/${record.projectSubmissionId}`);
  } else {
    router.push(`/teacher/review/${record.id}`);
  }
}

/** 表头排序：写回 reviewStore 并带参重新取数（与改前的 onTableChange 逐字一致） */
function onTableChange(_p, _f, sorter) {
  sortField.value = sorter.order ? sorter.field : '';
  sortOrder.value = sorter.order || '';
  fetch();
}

const editingId = ref(null);
const editValue = ref(0);
const scoreInputRef = ref(null);

function startEdit(record) {
  editingId.value = record.id;
  editValue.value = record.finalScore ?? record.aiScore ?? 0;
  nextTick(() => scoreInputRef.value?.focus());
}
function cancelEdit() { editingId.value = null; }
async function saveScore(record) {
  const val = editValue.value;
  editingId.value = null;
  if (val == null || val === record.finalScore) return;
  try {
    const r = await request.put(`/teacher/submissions/${record.id}/score`, { finalScore: val });
    Object.assign(record, { finalScore: r.data.finalScore, status: r.data.status, teacherFeedback: r.data.teacherFeedback || record.teacherFeedback });
    message.success('分数已更新');
  } catch { message.error('修改失败'); }
}

const columns = computed(() => [
  { title: '姓名', key: 'studentName', width: 120 },
  { title: '学号', dataIndex: 'studentNo', key: 'studentNo', width: 140, sorter: (a, b) => (a.studentNo || '').localeCompare(b.studentNo || ''), defaultSortOrder: sortField.value === 'studentNo' ? sortOrder.value : undefined },
  { title: 'AI评分', dataIndex: 'aiScore', key: 'aiScore', width: 90, sorter: (a, b) => (a.aiScore || 0) - (b.aiScore || 0), defaultSortOrder: sortField.value === 'aiScore' ? sortOrder.value : undefined },
  { title: '最终分', dataIndex: 'finalScore', key: 'finalScore', width: 90, sorter: (a, b) => (a.finalScore || 0) - (b.finalScore || 0), defaultSortOrder: sortField.value === 'finalScore' ? sortOrder.value : undefined },
  { title: '状态', key: 'status', width: 120, sorter: (a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0) },
  { title: '操作', key: 'action', width: 80, align: 'right' },
]);

const statusOrder = { not_submitted: 0, submitted: 1, abnormal: 2, ai_graded: 3, reviewed: 4, published: 5 };
/** 状态色调（取值语义与改前的 a-tag 配色一致：green→success / blue→brand / red→danger / default→neutral） */
function statusTone(s) {
  if (s === 'published') return 'success';
  if (s === 'reviewed') return 'brand';
  if (s === 'abnormal') return 'danger';
  if (s === 'ai_graded') return 'success';
  return 'neutral';
}
function statusText(s) {
  if (s === 'published') return '已发布';
  if (s === 'reviewed') return '已审核';
  if (s === 'abnormal') return '评分异常';
  if (s === 'ai_graded') return isPracticeMode.value ? '已完成' : 'AI已评分';
  if (s === 'submitted') return '待评分';
  return s;
}

const isPracticeMode = computed(() => {
  const first = list.value.find(r => r.mode);
  return first?.mode === 'practice';
});

/** 页头副标题：班级名 + 练习模式（原先标题下方的两枚标签） */
const pageDesc = computed(() => {
  const parts = [];
  if (className.value) parts.push(className.value);
  if (isPracticeMode.value) parts.push('练习模式');
  return parts.join(' · ');
});

const reviewSummary = computed(() => {
  const total = list.value.filter(r => r.submitted).length;
  const pending = list.value.filter(r => r.status === 'ai_graded' || r.status === 'submitted').length;
  return { total, pending };
});

function formatStudentNo(studentNo, schoolName) {
  if (!studentNo) return '';
  const at = studentNo.lastIndexOf('@');
  if (at > 0 && schoolName) {
    return studentNo.substring(0, at) + '@' + schoolName;
  }
  // 没有学校名但有@ → 只显示学号
  if (at > 0) return studentNo.substring(0, at);
  return studentNo;
}

let timer = null;
function onSearchChange() { clearTimeout(timer); timer = setTimeout(fetch, 300); }

function resetFilters() {
  keyword.value = '';
  filter.value = 'all';
  pagination.current = 1;
  fetch();
}

async function fetch() {
  loading.value = true;
  const params = { assignmentId, page: pagination.current, pageSize: pagination.pageSize, filter: filter.value };
  if (sortField.value) { params.sortField = sortField.value; params.sortOrder = sortOrder.value; }
  if (keyword.value) params.keyword = keyword.value;
  const r = await request.get(`/teacher/review-class/${classId}`, { params });
  list.value = r.data.list;
  pagination.total = r.data.total;
  if (r.data.list.length && !assignmentTitle.value) {
    const first = r.data.list.find(i => i.assignmentTitle);
    if (first) {
      assignmentTitle.value = first.assignmentTitle || '';
      className.value = first.className || '';
    }
  }
  loading.value = false;
}

function onPageChange(page, size) {
  pagination.current = page;
  pagination.pageSize = size || pagination.pageSize;
  fetch();
}

async function batchReview() {
  reviewing.value = true;
  try {
    const r = await request.post('/teacher/submissions/batch-review', { schoolId: userStore.currentSchool?.id, classId, assignmentId });
    message.success(r.message); fetch();
  } finally { reviewing.value = false; }
}
async function batchPublish() {
  confirm({
    title: '确认一键发布全班？',
    content: '发布后全班学生将能看到分数和评语；分数仍可修改，改完重新发布即可。',
    okText: '发布全班成绩',
    cancelText: '取消',
    danger: true,   // 全班成绩公开（批量发布）
    onOk: async () => {
      publishing.value = true;
      try {
        const r = await request.post('/teacher/submissions/batch-publish', { schoolId: userStore.currentSchool?.id, classId, assignmentId });
        message.success(r.message); fetch();
      } finally { publishing.value = false; }
    },
  });
}
async function exportXlsx() {
  const r = await request.get('/teacher/export-review', { params: { classId, assignmentId } });
  exportReviewXlsx(r.data, className.value, assignmentTitle.value);
}

let socket = null;
function connectSocket() {
  const base = import.meta.env.VITE_WS_URL || undefined;
  const opts = { transports: ['websocket', 'polling'] };
  if (!base) opts.path = '/exam/socket.io';
  socket = io(base, opts);
  socket.on('connect', () => { socket.emit('join-school', userStore.currentSchool?.id); });
  let lastRefresh = 0;
  socket.on('graded', () => {
    const now = Date.now();
    if (now - lastRefresh > 3000) { lastRefresh = now; fetch(); }
  });
}

onMounted(() => {
  fetch();
  connectSocket();
});
onUnmounted(() => {
  if (socket) { socket.emit('leave-school', userStore.currentSchool?.id); socket.disconnect(); }
});
</script>

<style scoped>
.w-240 {
  width: 240px;
}
.dim-text {
  color: var(--text-tertiary);
}
.row-actions {
  display: flex;
  justify-content: flex-end;
}

/* 行内改分：点击分数进入编辑（交互未改动） */
.score-val {
  cursor: pointer;
  border-bottom: 1px dashed transparent;
}
.score-val:hover {
  border-bottom-color: var(--brand-600);
}
.score-input {
  width: 60px;
  height: var(--control-h-sm);
  text-align: center;
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-xs);
  outline: none;
  font-size: var(--fs-body);
}
</style>
