<template>
  <div class="page">
    <!-- 顶栏 -->
    <div class="top-row">
      <a-button type="link" @click="$router.push('/teacher/review')" class="back-btn">← 返回</a-button>
      <div>
        <h2 class="top-title">{{ assignmentTitle || '加载中...' }}</h2>
        <div class="top-sub" v-if="className">
          <a-tag>{{ className }}</a-tag>
          <a-tag v-if="isPracticeMode" color="green" style="margin-left:4px">练习模式</a-tag>
        </div>
      </div>
    </div>

    <DataTable
      ref="dtRef"
      :columns="columns"
      :dataSource="list"
      rowKey="id"
      :loading="loading"
      v-model:current="pagination.current"
      :pageSize="pagination.pageSize"
      :total="pagination.total"
      @change="onTableChange"
      @page-change="onPageChange"
    >
      <template #toolbar-left>
        <a-input-search v-model:value="keyword" placeholder="搜索学生姓名" allow-clear style="width: 240px;"
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
        <template v-if="column.key === 'studentNo'">
          {{ formatStudentNo(record.studentNo, record.schoolName) }}
        </template>
        <template v-if="column.key === 'aiScore'">{{ record.aiScore ?? '—' }}</template>
        <template v-if="column.key === 'finalScore'">
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
        <template v-if="column.key === 'status'">
          <a-tag v-if="record.status === 'not_submitted'" color="default">未交</a-tag>
          <a-tag v-else :color="statusColor(record.status)">
            <span v-if="record.status === 'submitted'" class="spinner-dot"></span>
            {{ statusText(record.status) }}
          </a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-button v-if="record.submitted" type="link"
            @click="openReview(record)">审核</a-button>
          <span v-else class="dim-text">—</span>
        </template>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { io } from 'socket.io-client';
import request from '../../api/request.js';
import { useUserStore } from '../../stores/user.js';
import { savedSortField, savedSortOrder, savedPage } from '../../stores/reviewStore.js';
import { exportReviewXlsx } from '../../utils/export.js';
import DataTable from '../../components/DataTable.vue';

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
  { title: '姓名', key: 'studentName', width: 120, align: 'center' },
  { title: '学号', dataIndex: 'studentNo', key: 'studentNo', width: 140, align: 'center', sorter: (a, b) => (a.studentNo || '').localeCompare(b.studentNo || ''), defaultSortOrder: sortField.value === 'studentNo' ? sortOrder.value : undefined },
  { title: 'AI评分', dataIndex: 'aiScore', key: 'aiScore', width: 90, align: 'center', sorter: (a, b) => (a.aiScore || 0) - (b.aiScore || 0), defaultSortOrder: sortField.value === 'aiScore' ? sortOrder.value : undefined },
  { title: '最终分', dataIndex: 'finalScore', key: 'finalScore', width: 90, align: 'center', sorter: (a, b) => (a.finalScore || 0) - (b.finalScore || 0), defaultSortOrder: sortField.value === 'finalScore' ? sortOrder.value : undefined },
  { title: '状态', key: 'status', width: 120, align: 'center', sorter: (a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0) },
  { title: '操作', key: 'action', width: 80, align: 'center' },
]);

const statusOrder = { not_submitted: 0, submitted: 1, abnormal: 2, ai_graded: 3, reviewed: 4, published: 5 };
function statusColor(s) {
  if (s === 'published') return 'green';
  if (s === 'reviewed') return 'blue';
  if (s === 'abnormal') return 'red';
  if (s === 'ai_graded') return 'green';
  return 'default';
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
  pagination.pageSize = size;
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
  Modal.confirm({
    title: '确认一键发布全班？',
    content: '发布后学生将能看到分数和评语。发布后仍可修改分数，修改后重新发布即可。',
    okText: '确定发布',
    cancelText: '取消',
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
.page {
  max-width: 1400px;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.top-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 0;
  flex-shrink: 0;
}

.back-btn {
  flex-shrink: 0;
  font-size: 14px;
}

.top-title {
  font-size: 24px;
  margin: 0;
}

.top-sub {
  margin-top: 4px;
}

.score-val { cursor: pointer; border-bottom: 1px dashed transparent; }
.score-val:hover { border-bottom-color: var(--blue); }
.score-input {
  width: 60px; height: 28px; text-align: center;
  border: 1px solid #1677ff; border-radius: 4px; outline: none;
  font-size: 14px;
}
.dim-text {
  color: var(--ink-muted);
}

.spinner-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid #d9d9d9;
  border-top-color: #1677ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 4px;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
