<template>
  <PageShell
    title="评分审核"
    description="按班级查看作业的 AI 评分与审核进度；点「审核」进入学生提交逐份批改。"
  >
    <!-- TODO(P1-7): 接口支持服务端分页后切换（/teacher/review-summary 目前全量返回，沿用前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="key"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      :empty-title="selectedClass ? '该班级还没有提交记录' : '还没有可审核的作业'"
      :empty-desc="selectedClass ? '换个班级看看，或选择「所有班级」。' : '学生提交作业并完成 AI 评分后，这里会列出待审核的作业。'"
      :empty-action-text="selectedClass ? '查看所有班级' : ''"
      @page-change="onPageChange"
      @empty-action="onEmptyAction"
    >
      <template #toolbar>
        <a-select
          v-model:value="selectedClass"
          :options="classOptions"
          showSearch
          placeholder="选择班级"
          :filterOption="filterOption"
          class="w-260"
          @change="fetch"
        />
      </template>

      <template #toolbar-right>
        <span class="muted">共 {{ list.length }} 份作业</span>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'info'">
          <div class="info-cell">
            <div class="info-title">{{ record.title }}</div>
            <div class="info-class"><TeamOutlined class="info-icon" />{{ record.className }}</div>
            <div class="info-time">作答: {{ fmtDate(record.startTime) }} ~ {{ fmtDate(record.endTime) }}</div>
          </div>
        </template>

        <template v-else-if="column.key === 'aiStatus'">
          <span v-if="!record.submittedCount" class="dim-text">—</span>
          <StatusTag v-else-if="record.aiPending === 0 && record.abnormal > 0" tone="danger" :text="'评分异常 ' + record.abnormal + ' 人'" />
          <StatusTag v-else-if="record.aiPending === 0" tone="success" text="已评分" />
          <StatusTag
            v-else
            tone="neutral"
            dot
            :text="'待评分 ' + record.aiPending + ' 人' + (record.abnormal > 0 ? '，异常 ' + record.abnormal + ' 人' : '')"
          />
        </template>

        <template v-else-if="column.key === 'reviewStatus'">
          <span v-if="!record.submittedCount" class="dim-text">—</span>
          <StatusTag v-else-if="record.allReviewed" tone="success" text="已审核" />
          <StatusTag v-else tone="warning" :text="'待审核 ' + record.reviewPending + ' 人'" />
        </template>

        <template v-else-if="column.key === 'stats'">
          <div class="tnum">{{ record.submittedCount }} 已交</div>
          <div class="tnum">{{ record.totalStudents - record.submittedCount }} 未交</div>
        </template>

        <template v-else-if="column.key === 'action'">
          <div class="row-actions">
            <a-button type="primary" @click="$router.push(`/teacher/review/class/${record.classId}?assignmentId=${record.assignmentId}`)">
              审核
            </a-button>
            <a-button @click="exportForRecord(record)">导出</a-button>
          </div>
        </template>
      </template>
    </ListPage>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { TeamOutlined } from '@ant-design/icons-vue';
import { io } from 'socket.io-client';
import request from '../../api/request.js';
import { useUserStore } from '../../stores/user.js';
import { savedSortField, savedSortOrder, savedPage } from '../../stores/reviewStore.js';
import { exportReviewXlsx } from '../../infrastructure/export.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';

const userStore = useUserStore();
const loading = ref(false);
const list = ref([]);
const selectedClass = ref('');
const page = reactive({ current: 1, pageSize: 20 });

const classes = ref([]);
const classOptions = computed(() => [{ label: '所有班级', value: '' }, ...classes.value.map(c => ({ label: c.name, value: c.id }))]);

const columns = [
  { title: '题目信息', key: 'info', width: 320 },
  { title: 'AI状态', key: 'aiStatus', width: 200 },
  { title: '审核状态', key: 'reviewStatus', width: 140 },
  { title: '已交/未交', key: 'stats', width: 120 },
  { title: '操作', key: 'action', width: 140, align: 'right' },
];

/** 前端切片：接口全量返回（见上方 TODO(P1-7)） */
const pagedList = computed(() => list.value.slice((page.current - 1) * page.pageSize, page.current * page.pageSize));

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
  page.current = 1;
  const r = await request.get('/teacher/review-summary', { params });
  list.value = (r.data || []).map(item => ({ ...item, key: `${item.assignmentId}-${item.classId}` }));
  loading.value = false;
}

async function exportForRecord(record) {
  const r = await request.get('/teacher/export-review', { params: { classId: record.classId, assignmentId: record.assignmentId } });
  exportReviewXlsx(r.data, record.className, record.title);
}

/** 前端切片页码（ListPage 只抛出页码，不内置请求） */
function onPageChange(p) {
  page.current = p;
}

/** 空态按钮：查看所有班级 */
function onEmptyAction() {
  selectedClass.value = '';
  fetch();
}

let socket = null;

onMounted(() => {
  loadClasses();
  fetch();
  const wsUrl = import.meta.env.VITE_WS_URL || undefined;
  const wsOpts = { transports: ['websocket', 'polling'] };
  if (!wsUrl) wsOpts.path = '/exam/socket.io';
  socket = io(wsUrl, wsOpts);
  socket.on('connect', () => socket.emit('join-school', userStore.currentSchool?.id));
  let lastRefresh = 0;
  socket.on('graded', () => {
    const now = Date.now();
    if (now - lastRefresh > 3000) { lastRefresh = now; fetch(); }
  });
});

onUnmounted(() => {
  if (socket) { socket.emit('leave-school', userStore.currentSchool?.id); socket.disconnect(); }
  savedSortField.value = '';
  savedSortOrder.value = '';
  savedPage.value = 1;
});
</script>

<style scoped>
.w-260 {
  width: 260px;
}
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
.tnum {
  font-variant-numeric: tabular-nums;
}
.row-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.info-cell {
  line-height: 1.6;
}
.info-title {
  font-weight: 600;
  font-size: var(--fs-body-lg);
}
.info-class {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-body-sm);
  color: var(--text-tertiary);
}
.info-icon {
  font-size: var(--fs-body);
}
.info-time {
  font-size: var(--fs-caption);
  color: var(--text-tertiary);
}
.dim-text {
  color: var(--text-tertiary);
}
</style>
