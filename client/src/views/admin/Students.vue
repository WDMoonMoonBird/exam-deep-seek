<template>
  <div class="page">
    <div class="page-header">
      <h2>学生管理</h2>
      <a-button type="primary" @click="openAdd">新增学生</a-button>
    </div>
    <a-card class="page-card">
      <a-table :columns="columns" :dataSource="list" rowKey="id" :loading="loading" :scroll="{ x: 'max-content' }" :pagination="false">
        <template #classes="{ record }">
          <a-tag v-for="c in record.studentClasses" :key="c.classId">{{ c.class?.name }}</a-tag>
        </template>
      </a-table>
    </a-card>

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

const loading = ref(false); const list = ref([]); const classes = ref([]); const visible = ref(false);
const form = reactive({ username: '', realName: '', classIds: [] });

const columns = [
  { title: '学号', dataIndex: 'username', width: 130, ellipsis: true },
  { title: '姓名', dataIndex: 'realName', width: 120, ellipsis: true },
  { title: '班级', slots: { customRender: 'classes' }, width: 180 },
  { title: '创建时间', dataIndex: 'createdAt', width: 170, ellipsis: true },
];

async function fetch() { loading.value = true; const r = await request.get('/admin/students'); list.value = r.data; loading.value = false; }
async function openAdd() { form.username = ''; form.realName = ''; form.classIds = []; const r = await request.get('/admin/classes'); classes.value = r.data; visible.value = true; }
async function handleOk() { await request.post('/admin/students', { ...form }); visible.value = false; fetch(); }
onMounted(fetch);
</script>

<style scoped>
.page { max-width: 1400px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.page-header h2 { font-size: 28px; }
.page-card { border: 1px solid var(--hairline); }
</style>
