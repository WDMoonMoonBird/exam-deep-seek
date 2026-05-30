<template>
  <div class="page">
    <h2 class="page-title">评分审核</h2>

    <div class="toolbar">
      <a-select
        v-model:value="selectedClass"
        :options="classOptions"
        showSearch
        placeholder="选择班级"
        :filterOption="filterOption"
        style="width: 260px;"
        @change="fetch"
      />
    </div>

    <a-card class="table-card" :bodyStyle="{ padding: 0 }">
      <a-table
        :columns="columns"
        :dataSource="list"
        rowKey="key"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 'max-content', y: 'calc(100vh - 270px)' }"
        :sticky="true"
        size="small"
      >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'info'">
          <div class="info-cell">
            <div class="info-title">{{ record.title }}</div>
            <div class="info-class"><TeamOutlined class="info-icon" />{{ record.className }}</div>
            <div class="info-time">作答: {{ fmtDate(record.startTime) }} ~ {{ fmtDate(record.endTime) }}</div>
          </div>
        </template>
        <template v-if="column.key === 'aiStatus'">
          <template v-if="!record.submittedCount">
            <span class="dim-text">—</span>
          </template>
          <template v-else-if="record.aiPending === 0 && record.abnormal > 0">
            <a-tag color="red">评分异常 {{ record.abnormal }} 人</a-tag>
          </template>
          <template v-else-if="record.aiPending === 0">
            <a-tag color="green">已评分</a-tag>
          </template>
          <template v-else>
            <a-tag><span class="spinner-dot"></span>待评分 {{ record.aiPending }} 人
              <template v-if="record.abnormal > 0">，异常 {{ record.abnormal }} 人</template>
            </a-tag>
          </template>
        </template>
        <template v-if="column.key === 'reviewStatus'">
          <template v-if="!record.submittedCount">
            <span class="dim-text">—</span>
          </template>
          <template v-else-if="record.allReviewed">
            <a-tag color="green">已审核</a-tag>
          </template>
          <template v-else>
            <a-tag color="orange">待审核 {{ record.reviewPending }} 人</a-tag>
          </template>
        </template>
        <template v-if="column.key === 'stats'">
          <div>{{ record.submittedCount }} 已交</div>
          <div>{{ record.totalStudents - record.submittedCount }} 未交</div>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button type="primary" @click="$router.push(`/teacher/review/class/${record.classId}?assignmentId=${record.assignmentId}`)">
              审核
            </a-button>
            <a-button @click="exportForRecord(record)">导出</a-button>
          </a-space>
        </template>
      </template>
    </a-table>
    </a-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { TeamOutlined } from '@ant-design/icons-vue';
import { io } from 'socket.io-client';
import request from '../../api/request.js';
import { useUserStore } from '../../stores/user.js';
import { savedSortField, savedSortOrder, savedPage } from '../../stores/reviewStore.js';
import { exportReviewXlsx } from '../../utils/export.js';

const userStore = useUserStore();
const loading = ref(false);
const list = ref([]);
const selectedClass = ref('');

const classes = ref([]);
const classOptions = computed(() => [{ label: '所有班级', value: '' }, ...classes.value.map(c => ({ label: c.name, value: c.id }))]);

const columns = [
  { title: '题目信息', key: 'info', width: 320, customHeaderCell: () => ({ style: { textAlign: 'center' } }) },
  { title: 'AI状态', key: 'aiStatus', width: 140, align: 'center' },
  { title: '审核状态', key: 'reviewStatus', width: 140, align: 'center' },
  { title: '已交/未交', key: 'stats', width: 120, align: 'center' },
  { title: '操作', key: 'action', width: 100, align: 'center' },
];

function filterOption(input, option) { return option.label.toLowerCase().includes(input.toLowerCase()); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : ''; }

async function loadClasses() {
  const r = await request.get('/teacher/classes');
  classes.value = r.data || [];
}

async function fetch() {
  const schoolId = userStore.currentSchool?.id;
  if (!schoolId) { list.value = []; return; }
  loading.value = true;
  const params = { schoolId };
  if (selectedClass.value) params.classId = selectedClass.value;
  const r = await request.get('/teacher/review-summary', { params });
  list.value = (r.data || []).map(item => ({ ...item, key: `${item.assignmentId}-${item.classId}` }));
  loading.value = false;
}

async function exportForRecord(record) {
  const r = await request.get('/teacher/export-review', { params: { classId: record.classId, assignmentId: record.assignmentId } });
  exportReviewXlsx(r.data, record.className, record.title);
}

let socket = null;

onMounted(() => {
  loadClasses();
  fetch();
  const wsUrl = import.meta.env.VITE_WS_URL || undefined;
  socket = io(wsUrl, { transports: ['websocket', 'polling'] });
  socket.on('connect', () => socket.emit('join-school', userStore.currentSchool?.id));
  let lastRefresh = 0;
  socket.on('graded', () => {
    const now = Date.now();
    if (now - lastRefresh > 3000) { lastRefresh = now; fetch(); }
  });
});

onUnmounted(() => {
  if (socket) { socket.emit('leave-school', userStore.currentSchool?.id); socket.disconnect(); }
  // 离开评分审核页时清空排序/分页状态
  savedSortField.value = '';
  savedSortOrder.value = '';
  savedPage.value = 1;
});
</script>

<style scoped>
.page { max-width: 1400px; }
.page-title { font-size: 28px; margin-bottom: 24px; }
.toolbar { margin-bottom: 24px; }
.info-cell { line-height: 1.6; }
:deep(.col-pad-left) { padding-left: 20px !important; }
.info-title { font-weight: 600; font-size: 15px; }
.info-class { font-size: 13px; color: var(--ink-muted); display: flex; align-items: center; gap: 4px; }
.info-icon { font-size: 14px; }
.info-time { font-size: 12px; color: var(--ink-muted); }
.dim-text { color: var(--ink-muted); }
.table-card { border-radius: 12px; overflow: hidden; border: 1px solid var(--hairline); }
:deep(.ant-table-body) { scroll-behavior: smooth; }
:deep(.ant-table-container) { border-radius: 12px; overflow: hidden; }
:deep(.ant-table-thead > tr > th) { padding: 10px 12px !important; }
.table-card :deep(.ant-table-cell) { border-bottom: none !important; padding: 8px 12px !important; vertical-align: middle !important; }
:deep(.ant-table-tbody > tr:hover > td) { background: #fafafa !important; }
:deep(.ant-table-sticky-holder) { overflow: hidden; }
:deep(.ant-table-pagination) {
  background: #fafafa; margin: 0 !important;
  padding: 10px 16px; border-top: 1px solid #f0f0f0;
  border-radius: 0 0 12px 12px;
}
:deep(.ant-table-pagination.ant-pagination) { margin: 0 !important; }
.spinner-dot {
  display: inline-block; width: 10px; height: 10px;
  border: 2px solid #d9d9d9; border-top-color: #1677ff;
  border-radius: 50%; animation: spin 0.8s linear infinite;
  margin-right: 4px; vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
