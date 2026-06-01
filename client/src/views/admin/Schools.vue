<template>
  <div class="page">
    <div class="page-header">
      <h2>学校管理</h2>
      <span class="page-desc">数据来源：教育部全国高等学校名单，共 {{ total }} 所</span>
    </div>

    <DataTable
      :columns="columns"
      :dataSource="list"
      rowKey="id"
      :loading="loading"
      v-model:current="schoolPage.current"
      :pageSize="schoolPage.pageSize"
      :clientPagination="true"
      :showSizeChanger="true"
      :pageSizeOptions="['20','50','100','200']"
      :showTotal="(t) => `共 ${t} 所`"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'province'">{{ record.province || '—' }}</template>
        <template v-if="column.key === 'city'">{{ record.city || '—' }}</template>
        <template v-if="column.key === 'level'">{{ record.level || '—' }}</template>
        <template v-if="column.key === 'code'">{{ record.officialCode || '—' }}</template>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import request from '../../api/request.js';
import DataTable from '../../components/DataTable.vue';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const schoolPage = reactive({ current: 1, pageSize: 50 });

const columns = [
  { title: '院校代码', key: 'code', width: 140 },
  { title: '学校名称', dataIndex: 'name', width: 220, ellipsis: true },
  { title: '省份', key: 'province', width: 120 },
  { title: '城市', key: 'city', width: 120 },
  { title: '层次', key: 'level', width: 80 },
];

async function fetch() {
  loading.value = true;
  const r = await request.get('/admin/schools');
  list.value = r.data;
  total.value = r.data.length;
  loading.value = false;
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
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.page-header h2 {
  font-size: 28px;
  margin: 0;
}
.page-desc {
  font-size: 14px;
  color: var(--ink-muted);
}
</style>
