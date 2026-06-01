<template>
  <div class="page">
    <h2 class="page-title">我的成绩</h2>

    <a-empty v-if="!list.length && !loading" description="暂无已发布成绩" style="flex:1;display:flex;align-items:center;justify-content:center;" />

    <DataTable
      v-else
      :columns="columns"
      :dataSource="list"
      rowKey="assignmentId"
      :loading="loading"
      v-model:current="page.current"
      :clientPagination="true"
      :pageSize="20"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'assignment'">{{ record.assignmentTitle }}</template>
        <template v-if="column.key === 'score'">
          <strong>{{ record.totalScore }}</strong> / {{ record.maxScore }}
        </template>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import request from '../../api/request.js';
import DataTable from '../../components/DataTable.vue';

const list = ref([]);
const loading = ref(false);
const page = reactive({ current: 1, pageSize: 20 });

const columns = [
  { title: '作业', key: 'assignment', width: 200, ellipsis: true },
  { title: '分数', key: 'score', width: 120 },
];

async function fetch() {
  loading.value = true;
  const r = await request.get('/student/scores');
  list.value = r.data || [];
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
.page-title {
  font-size: 28px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
</style>
