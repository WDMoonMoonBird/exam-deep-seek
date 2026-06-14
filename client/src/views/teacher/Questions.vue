<template>
  <div class="page">
    <div class="page-header">
      <h2>题库管理</h2>
      <a-button type="primary" @click="$router.push('/teacher/questions/new')">新增题目</a-button>
    </div>

    <DataTable
      :columns="columns"
      :dataSource="list"
      rowKey="id"
      :loading="loading"
      v-model:current="pagination.current"
      :pageSize="pagination.pageSize"
      :total="pagination.total"
      @page-change="onPageChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</template>
        <template v-if="column.dataIndex === 'difficulty'">
          <a-tag :color="record.difficulty === 'easy' ? 'green' : record.difficulty === 'medium' ? 'orange' : 'red'">{{ record.difficulty }}</a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button type="link" @click="$router.push(`/teacher/questions/${record.id}/edit`)">编辑</a-button>
            <a-popconfirm title="确定删除？" ok-text="确定" cancel-text="取消" @confirm="del(record.id)">
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import DataTable from '../../components/DataTable.vue';
import { formatDateTime } from '../../utils/format.js';

const loading = ref(false);
const list = ref([]);
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });

const columns = [
  { title: '标题', dataIndex: 'title', width: 250, ellipsis: true },
{ title: '难度', dataIndex: 'difficulty', width: 70 },
  { title: '满分', dataIndex: 'maxScore', width: 70 },
  { title: '创建时间', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 160 },
];

async function fetch() {
  loading.value = true;
  const r = await request.get('/teacher/questions', { params: { page: pagination.current, pageSize: pagination.pageSize } });
  list.value = r.data.list;
  pagination.total = r.data.total;
  loading.value = false;
}

function onPageChange(page) {
  pagination.current = page;
  fetch();
}

async function del(id) {
  await request.delete(`/teacher/questions/${id}`);
  message.success('删除成功');
  fetch();
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
</style>
