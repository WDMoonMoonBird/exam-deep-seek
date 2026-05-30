<template>
  <div class="page">
    <div class="page-header">
      <h2>题库管理</h2>
      <a-button type="primary" @click="$router.push('/teacher/questions/new')">新增题目</a-button>
    </div>
    <a-card class="page-card">
      <a-table :columns="columns" :dataSource="list" rowKey="id" :loading="loading" :scroll="{ x: 'max-content' }" :pagination="pagination" @change="onTableChange">
        <template #difficulty="{ text }"><a-tag :color="text==='easy'?'green':text==='medium'?'orange':'red'">{{ text }}</a-tag></template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" @click="$router.push(`/teacher/questions/${record.id}/edit`)">编辑</a-button>
            <a-popconfirm title="确定删除？" ok-text="确定" cancel-text="取消" @confirm="del(record.id)">
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';

const loading = ref(false); const list = ref([]);
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });

const columns = [
  { title: '标题', dataIndex: 'title', width: 250, ellipsis: true },{ title: '小题数', dataIndex: '_count.subQuestions', width: 70 },
  { title: '难度', dataIndex: 'difficulty', slots: { customRender: 'difficulty' }, width: 70 },
  { title: '满分', dataIndex: 'maxScore', width: 70 },{ title: '创建时间', dataIndex: 'createdAt', width: 170 },
  { title: '操作', slots: { customRender: 'action' }, width: 160 },
];

async function fetch() { loading.value = true; const r = await request.get('/teacher/questions', { params: { page: pagination.current, pageSize: pagination.pageSize } }); list.value = r.data.list; pagination.total = r.data.total; loading.value = false; }
function onTableChange(p) { pagination.current = p.current; fetch(); }
async function del(id) { await request.delete(`/teacher/questions/${id}`); message.success('删除成功'); fetch(); }
onMounted(fetch);
</script>

<style scoped>
.page { max-width: 1400px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.page-header h2 { font-size: 28px; }
.page-card { border: 1px solid var(--hairline); }
</style>
