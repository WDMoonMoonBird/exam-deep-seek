<template>
  <div class="page">
    <div class="page-header">
      <h2>实训任务</h2>
      <a-button type="primary" @click="$router.push('/teacher/projects/new')">新建任务</a-button>
    </div>

    <div class="toolbar">
      <a-input-search
        v-model:value="keyword"
        placeholder="搜索任务标题"
        style="width: 260px"
        @search="doSearch"
        allowClear
      />
      <a-select
        v-model:value="filterStatus"
        placeholder="状态筛选"
        style="width: 140px"
        allowClear
        @change="doSearch"
      >
        <a-select-option value="draft">草稿</a-select-option>
        <a-select-option value="published">已发布</a-select-option>
        <a-select-option value="closed">已关闭</a-select-option>
      </a-select>
    </div>

    <a-table
      :columns="columns"
      :dataSource="list"
      :loading="loading"
      :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: t => `共 ${t} 条` }"
      rowKey="id"
      @change="onTableChange"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <span>{{ record.title }}</span>
        </template>
        <template v-if="column.key === 'classes'">
          <a-tag v-for="c in record.classes" :key="c.classId" size="small">{{ c.class?.name }}</a-tag>
        </template>
        <template v-if="column.key === 'time'">
          {{ formatDateTime(record.endTime) }}
        </template>
        <template v-if="column.key === 'stats'">
          {{ record.submissionCount || 0 }} / {{ record.totalStudents || 0 }}
        </template>
        <template v-if="column.key === 'status'">
          <a-tag v-if="record.status === 'draft'" color="default">草稿</a-tag>
          <a-tag v-else-if="record.status === 'published'" color="green">已发布</a-tag>
          <a-tag v-else-if="record.status === 'closed'" color="red">已关闭</a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button type="link" size="small" @click="$router.push(`/teacher/projects/${record.id}/submissions`)">查看提交</a-button>
            <a-button type="link" size="small" @click="$router.push(`/teacher/projects/${record.id}/edit`)">编辑</a-button>
            <a-popconfirm title="确定删除？" ok-text="确定" cancel-text="取消" @confirm="handleDelete(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { getProjects, deleteProject } from '../../api/projects.js';
import { formatDateTime } from '../../domain/format.js';

const loading = ref(false);
const list = ref([]);
const keyword = ref('');
const filterStatus = ref(undefined);
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });

const columns = [
  { title: '标题', key: 'title', width: 240, ellipsis: true },
  { title: '班级', key: 'classes', width: 180 },
  { title: '截止时间', key: 'time', width: 160 },
  { title: '提交统计', key: 'stats', width: 110 },
  { title: '状态', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 220 },
];

async function fetch() {
  loading.value = true;
  try {
    const r = await getProjects({
      page: pagination.current,
      pageSize: pagination.pageSize,
      keyword: keyword.value || undefined,
      status: filterStatus.value || undefined,
    });
    list.value = r.data.list;
    pagination.total = r.data.total;
  } catch { /* handled by interceptor */ }
  loading.value = false;
}

function doSearch() {
  pagination.current = 1;
  fetch();
}

function onTableChange(pag) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  fetch();
}

async function handleDelete(id) {
  try {
    await deleteProject(id);
    message.success('删除成功');
    fetch();
  } catch { message.error('删除失败'); }
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.page-header h2 {
  font-size: 28px;
  margin: 0;
}
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
</style>
