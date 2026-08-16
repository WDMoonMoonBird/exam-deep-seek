<template>
  <div class="page">
    <div class="page-header">
      <a-button type="link" @click="$router.push('/teacher/projects')" style="padding:0;margin-bottom:8px">
        <ArrowLeftOutlined /> 返回任务列表
      </a-button>
      <h2>{{ project?.title || '提交列表' }}</h2>
    </div>

    <!-- 任务信息摘要 -->
    <a-descriptions v-if="project" size="small" bordered :column="4" class="info-card">
      <a-descriptions-item label="班级">
        <a-tag v-for="c in project.classes" :key="c.classId" size="small">{{ c.class?.name }}</a-tag>
      </a-descriptions-item>
      <a-descriptions-item label="截止时间">{{ formatDateTime(project.endTime) }}</a-descriptions-item>
      <a-descriptions-item label="提交率">
        {{ stats.submitted }} / {{ stats.totalStudents }}
      </a-descriptions-item>
      <a-descriptions-item label="已评分">{{ stats.graded }}</a-descriptions-item>
    </a-descriptions>

    <!-- 状态筛选 -->
    <div class="toolbar">
      <a-radio-group v-model:value="filterStatus" @change="doFilter" size="small">
        <a-radio-button :value="undefined">全部</a-radio-button>
        <a-radio-button value="submitted">已提交</a-radio-button>
        <a-radio-button value="graded">已评分</a-radio-button>
        <a-radio-button value="reviewed">已批改</a-radio-button>
        <a-radio-button value="published">已发布</a-radio-button>
      </a-radio-group>
      <a-button style="margin-left:auto" @click="handleExport" size="small">
        <DownloadOutlined /> 导出Excel
      </a-button>
    </div>

    <!-- 提交列表 -->
    <a-table
      :columns="columns"
      :dataSource="list"
      :loading="loading"
      :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showTotal: t => `共 ${t} 条` }"
      rowKey="id"
      :rowClassName="rowClassName"
      @change="onTableChange"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'student'">
          {{ record.student?.username }} / {{ record.student?.realName }}
        </template>
        <template v-if="column.key === 'submittedAt'">
          {{ record.submittedAt ? formatDateTime(record.submittedAt) : '-' }}
        </template>
        <template v-if="column.key === 'machineScore'">
          {{ record.machineScore != null ? record.machineScore : '-' }}
        </template>
        <template v-if="column.key === 'astScore'">
          {{ record.astScore != null ? record.astScore : '-' }}
        </template>
        <template v-if="column.key === 'aiScore'">
          {{ record.aiScore != null ? record.aiScore : '-' }}
        </template>
        <template v-if="column.key === 'totalScore'">
          <strong>{{ record.totalScore != null ? record.totalScore : '-' }}</strong>
        </template>
        <template v-if="column.key === 'status'">
          <a-tag v-if="record.status === 'submitted'" color="blue">已提交</a-tag>
          <a-tag v-else-if="record.status === 'grading'" color="processing">评分中</a-tag>
          <a-tag v-else-if="record.status === 'graded'" color="orange">已评分</a-tag>
          <a-tag v-else-if="record.status === 'reviewed'" color="purple">已批改</a-tag>
          <a-tag v-else-if="record.status === 'published'" color="green">已发布</a-tag>
          <a-tag v-else-if="record.status === 'draft'" color="default">草稿</a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-button type="link" size="small" @click="$router.push(`/teacher/projects/${projectId}/review/${record.id}`)">
            批改
          </a-button>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons-vue';
import { getProject, getSubmissions } from '../../api/projects.js';
import { formatDateTime } from '../../domain/format.js';

const route = useRoute();
const projectId = +route.params.id;
const project = ref(null);
const loading = ref(false);
const list = ref([]);
const filterStatus = ref(undefined);
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });
const stats = reactive({ submitted: 0, unsubmitted: 0, graded: 0, totalStudents: 0 });

const columns = [
  { title: '学号/姓名', key: 'student', width: 160 },
  { title: '提交时间', key: 'submittedAt', width: 160 },
  { title: '机器得分', key: 'machineScore', width: 90 },
  { title: 'AST得分', key: 'astScore', width: 90 },
  { title: 'AI得分', key: 'aiScore', width: 90 },
  { title: '总分', key: 'totalScore', width: 80 },
  { title: '状态', key: 'status', width: 80 },
  { title: '操作', key: 'action', width: 80 },
];

function rowClassName(record) {
  if (record.status === 'graded' || record.status === 'reviewed' || record.status === 'published') {
    return 'graded-row';
  }
  return '';
}

async function fetch() {
  loading.value = true;
  try {
    const [pRes, sRes] = await Promise.all([
      getProject(projectId),
      getSubmissions(projectId, {
        page: pagination.current,
        pageSize: pagination.pageSize,
        status: filterStatus.value || undefined,
      }),
    ]);
    project.value = pRes.data;
    list.value = sRes.data.list;
    pagination.total = sRes.data.total;
    Object.assign(stats, sRes.data.stats || {});
  } catch { /* ignore */ }
  loading.value = false;
}

function doFilter() {
  pagination.current = 1;
  fetch();
}

function onTableChange(pag) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  fetch();
}

function handleExport() {
  message.info('导出功能开发中');
}

onMounted(fetch);
</script>

<style scoped>
.page {
  max-width: 1400px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.page-header {
  margin-bottom: 12px;
}
.page-header h2 {
  font-size: 24px;
  margin: 0;
}
.info-card {
  margin-bottom: 16px;
  flex-shrink: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
:deep(.graded-row) {
  background-color: #f6ffed;
}
</style>
