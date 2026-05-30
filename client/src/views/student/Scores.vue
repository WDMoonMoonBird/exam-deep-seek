<template>
  <div class="page">
    <h2 class="mb32">我的成绩</h2>
    <a-empty v-if="!list.length" description="暂无已发布成绩" />
    <a-card v-else class="page-card">
      <a-table :columns="columns" :dataSource="list" rowKey="assignmentId" :scroll="{ x: 'max-content' }" :pagination="false">
        <template #assignment="{ record }">{{ record.assignmentTitle }}</template>
        <template #score="{ record }">
          <strong>{{ record.totalScore }}</strong> / {{ record.maxScore }}
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '../../api/request.js';
const list = ref([]);
const columns = [
  { title: '作业', slots: { customRender: 'assignment' }, width: 200, ellipsis: true },
  { title: '分数', slots: { customRender: 'score' }, width: 120 },
];
async function fetch() { const r = await request.get('/student/scores'); list.value = r.data || []; }
onMounted(fetch);
</script>

<style scoped>
.page { max-width: 1400px; }
.mb32 { margin-bottom: 32px; font-size: 28px; }
.page-card { border: 1px solid var(--hairline); }
</style>
