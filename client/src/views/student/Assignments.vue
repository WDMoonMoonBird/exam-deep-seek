<template>
  <div class="page">
    <h2 class="page-title">作业列表</h2>

    <DataTable
      :columns="columns"
      :dataSource="filteredList"
      rowKey="id"
      :loading="loading"
      v-model:current="listPage.current"
      :pageSize="listPage.pageSize"
      :clientPagination="true"
      :showTotal="(t) => `共 ${t} 项`"
      :customRow="(r) => ({ onClick: () => goDetail(r), style: { cursor: canEnter(r) ? 'pointer' : 'not-allowed' } })"
    >
      <template #toolbar-left>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索作业标题"
          allow-clear
          style="width: 280px;"
          @search="fetch"
          @change="onSearchChange"
        />
        <a-radio-group v-model:value="activeFilter" button-style="solid" size="small" @change="onFilterChange">
          <a-radio-button v-for="f in filters" :key="f.key" :value="f.key">{{ f.label }}</a-radio-button>
        </a-radio-group>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <span :class="{ 'locked-text': record.locked }">{{ record.title }}</span>
          <a-tag v-if="record.mode === 'practice'" color="green" size="small" style="margin-left:6px">练习</a-tag>
          <LockOutlined v-if="record.locked" style="color:#ff4d4f;margin-left:4px" />
        </template>
        <template v-if="column.key === 'qCount'">
          {{ record._count?.assignmentQuestions || 0 }}
        </template>
        <template v-if="column.key === 'status'">
          <a-tag :color="statusColor(record)">{{ statusText(record) }}</a-tag>
        </template>
        <template v-if="column.key === 'startTime'">
          <div class="time-cell">
            <FieldTimeOutlined class="time-icon" />
            <div class="time-text">
              <div>{{ formatDate(record.startTime) }}</div>
              <div class="time-sub">{{ formatTime(record.startTime) }}</div>
            </div>
          </div>
        </template>
        <template v-if="column.key === 'endTime'">
          <div class="time-cell">
            <FieldTimeOutlined class="time-icon" />
            <div class="time-text">
              <div>{{ formatDate(record.endTime) }}</div>
              <div class="time-sub">{{ formatTime(record.endTime) }}</div>
            </div>
          </div>
        </template>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import request from '../../api/request.js';
import { FieldTimeOutlined, LockOutlined } from '@ant-design/icons-vue';
import DataTable from '../../components/DataTable.vue';

const router = useRouter();
const list = ref([]);
const listPage = reactive({ current: 1, pageSize: 20 });
const loading = ref(false);
const keyword = ref('');
const activeFilter = ref('all');
const now = ref(Date.now());
let nowTimer = null;

const filters = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '未完成' },
  { key: 'done', label: '已完成' },
  { key: 'published', label: '已出分' },
];

const columns = [
  { title: '标题', key: 'title', dataIndex: 'title', width: 300, ellipsis: true },
  { title: '题目数', key: 'qCount', width: 80, align: 'center' },
  { title: '状态', key: 'status', width: 110, align: 'center' },
  { title: '开始时间', key: 'startTime', width: 130 },
  { title: '截止时间', key: 'endTime', width: 130 },
];

function isNotStarted(a) { return now.value < new Date(a.startTime).getTime(); }
function isExpired(a) { return now.value > new Date(a.endTime).getTime(); }
function hasRealSubmit(a) { return (a.submissions || []).some(s => s.status !== 'draft'); }
/** 实训题作业判定：仅实训题使用"已批改"文案，编程题保持原语义 */
function isProjectAssignment(a) {
  return (a.assignmentQuestions || []).some(q => q.question?.type === 'project');
}

function statusColor(a) {
  if (isNotStarted(a) && !hasRealSubmit(a)) return 'orange';
  const s = a.submissions?.[0]?.status;
  if (s === 'published') return 'success';
  // 实训题：已批改（reviewed）绿色；编程题保持 processing
  if (s === 'reviewed') return isProjectAssignment(a) ? 'success' : 'processing';
  if (s === 'submitted' || s === 'ai_graded') return 'processing';
  if (isExpired(a) && !hasRealSubmit(a)) return 'red';
  if (s === 'draft') return 'default';
  return 'default';
}

function statusText(a) {
  if (isNotStarted(a) && !hasRealSubmit(a)) return '未开始';
  const s = a.submissions?.[0]?.status;
  if (s === 'published') return '已出分';
  // 实训题：审核通过（reviewed）即已批改放分；编程题保持"已提交"
  if (s === 'reviewed') return isProjectAssignment(a) ? '已批改' : '已提交';
  if (s === 'submitted' || s === 'ai_graded') return '已提交';
  if (isExpired(a) && !hasRealSubmit(a)) return '已过期';
  if (s === 'draft') return '草稿';
  return '未提交';
}

function canEnter(a) { return !a.locked && !isNotStarted(a) && !(isExpired(a) && !hasRealSubmit(a)); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : ''; }
function formatTime(d) { return d ? new Date(d).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''; }

let timer = null;
function onSearchChange() { listPage.current = 1; clearTimeout(timer); timer = setTimeout(fetch, 300); }
function onFilterChange() { listPage.current = 1; fetch(); }

const filteredList = computed(() => {
  let result = list.value;
  if (activeFilter.value !== 'all') {
    result = result.filter(a => {
      const s = a.submissions?.length ? a.submissions[0]?.status : null;
      if (activeFilter.value === 'published') return s === 'published';
      if (activeFilter.value === 'done') return s === 'submitted' || s === 'ai_graded' || s === 'reviewed';
      if (activeFilter.value === 'todo') return !s || s === 'draft';
      return true;
    });
  }
  return result;
});

function goDetail(record) {
  if (!canEnter(record)) return;
  const projectQ = record.assignmentQuestions?.find(aq => aq.question?.type === 'project');
  if (projectQ) {
    router.push(`/student/assignments/${record.id}/project/${projectQ.question.id}`);
  } else {
    router.push(`/student/assignments/${record.id}`);
  }
}

async function fetch() {
  loading.value = true;
  const r = await request.get('/student/assignments', { params: { keyword: keyword.value || undefined } });
  list.value = r.data.list || [];
  loading.value = false;
}

onMounted(() => {
  fetch();
  nowTimer = setInterval(() => { now.value = Date.now(); }, 10000);
});
onUnmounted(() => { clearInterval(nowTimer); });
</script>

<style scoped>
.page {
  max-width: 1400px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 0 auto;
}
.page-title {
  font-size: 28px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.hw-link { color: var(--blue); }
.locked-text { color: var(--ink-muted); }
.time-cell { display: flex; align-items: center; gap: 6px; justify-content: center; }
.time-icon { font-size: 16px; color: var(--ink-muted); flex-shrink: 0; }
.time-text { line-height: 1.4; }
.time-sub { font-size: 12px; color: var(--ink-muted); }
</style>
