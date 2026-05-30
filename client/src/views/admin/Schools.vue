<template>
  <div class="page">
    <div class="page-header">
      <h2>学校管理</h2>
      <span class="page-desc">数据来源：教育部全国高等学校名单，共 {{ total }} 所</span>
    </div>
    <a-card class="page-card">
      <a-table :columns="columns" :dataSource="list" rowKey="id" :loading="loading" :scroll="{ x: 'max-content' }" :pagination="{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 所` }">
        <template #province="{ text }">{{ text || '—' }}</template>
        <template #city="{ text }">{{ text || '—' }}</template>
        <template #level="{ text }">{{ text || '—' }}</template>
        <template #code="{ text }">{{ text || '—' }}</template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '../../api/request.js';

const loading = ref(false);
const list = ref([]);
const total = ref(0);

const columns = [
  { title: '院校代码', dataIndex: 'officialCode', width: 140, slots: { customRender: 'code' } },
  { title: '学校名称', dataIndex: 'name', width: 220, ellipsis: true },
  { title: '省份', dataIndex: 'province', width: 120, slots: { customRender: 'province' } },
  { title: '城市', dataIndex: 'city', width: 120, slots: { customRender: 'city' } },
  { title: '层次', dataIndex: 'level', width: 80, slots: { customRender: 'level' } },
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
.page { max-width: 1400px; }
.page-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 32px; }
.page-header h2 { font-size: 28px; }
.page-desc { font-size: 14px; color: var(--ink-muted); }
.page-card { border: 1px solid var(--hairline); }
</style>
