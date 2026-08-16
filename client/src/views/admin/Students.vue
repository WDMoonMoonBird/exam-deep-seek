<template>
  <div class="page">
    <div class="page-header">
      <h2>学生管理</h2>
      <a-button type="primary" @click="openAdd">新增学生</a-button>
    </div>

    <DataTable
      :columns="columns"
      :dataSource="list"
      rowKey="id"
      :loading="loading"
      v-model:current="page.current"
      :clientPagination="true"
      :pageSize="20"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</template>
        <template v-if="column.key === 'classes'">
          <a-tag v-for="c in record.studentClasses" :key="c.classId">{{ c.class?.name }}</a-tag>
        </template>
      </template>
    </DataTable>

    <a-modal title="新增学生" :open="visible" @ok="handleOk" @cancel="visible = false" ok-text="确定" cancel-text="取消">
      <a-form :model="form">
        <a-form-item label="学号"><a-input v-model:value="form.username" /></a-form-item>
        <a-form-item label="姓名"><a-input v-model:value="form.realName" /></a-form-item>
        <a-form-item label="班级">
          <a-select v-model:value="form.classIds" mode="multiple" placeholder="选择班级">
            <a-select-option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import request from '../../api/request.js';
import DataTable from '../../components/DataTable.vue';
import { formatDateTime } from '../../domain/format.js';
const loading = ref(false);
const list = ref([]);
const page = reactive({ current: 1, pageSize: 20 });
const classes = ref([]);
const visible = ref(false);
const form = reactive({ username: '', realName: '', classIds: [] });

const columns = [
  { title: '学号', dataIndex: 'username', width: 130, ellipsis: true },
  { title: '姓名', dataIndex: 'realName', width: 120, ellipsis: true },
  { title: '班级', key: 'classes', width: 180 },
  { title: '创建时间', key: 'createdAt', width: 170, ellipsis: true },
];

async function fetch() {
  loading.value = true;
  const r = await request.get('/admin/students');
  list.value = r.data;
  loading.value = false;
}

async function openAdd() {
  form.username = ''; form.realName = ''; form.classIds = [];
  const r = await request.get('/admin/classes');
  classes.value = r.data;
  visible.value = true;
}

async function handleOk() {
  await request.post('/admin/students', { ...form });
  visible.value = false; fetch();
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
