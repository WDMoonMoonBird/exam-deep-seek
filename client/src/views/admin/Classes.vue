<template>
  <div class="page">
    <div class="page-header">
      <h2>班级管理</h2>
      <a-button type="primary" @click="openAdd">新增班级</a-button>
    </div>
    <a-card class="page-card">
      <a-table :columns="columns" :dataSource="list" rowKey="id" :loading="loading" :scroll="{ x: 'max-content' }" :pagination="false">
        <template #school="{ record }">{{ record.school?.name }}</template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" @click="openEdit(record)">编辑</a-button>
            <a-popconfirm title="确定删除？" ok-text="确定" cancel-text="取消" @confirm="del(record.id)">
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" ok-text="确定" cancel-text="取消" :width="1040" wrap-class-name="form-modal">
      <a-form :model="form">
        <a-form-item label="班级名称"><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="所属学校">
          <a-select v-model:value="form.schoolId" placeholder="选择学校">
            <a-select-option v-for="s in schools" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="指定教师">
          <a-select v-model:value="form.teacherIds" mode="multiple" placeholder="可多选">
            <a-select-option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.realName }}（{{ t.username }}）</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import request from '../../api/request.js';

const loading = ref(false); const list = ref([]); const schools = ref([]); const teachers = ref([]);
const visible = ref(false); const modalTitle = ref(''); const isEdit = ref(false); const editId = ref(null);
const form = reactive({ name: '', schoolId: undefined, teacherIds: [] });

const columns = [
  { title: '班级名称', dataIndex: 'name', width: 180, ellipsis: true },
  { title: '所属学校', slots: { customRender: 'school' }, width: 200, ellipsis: true },
  { title: '创建时间', dataIndex: 'createdAt', width: 170, ellipsis: true },
  { title: '操作', slots: { customRender: 'action' }, width: 160 },
];

async function fetch() { loading.value = true; const r = await request.get('/admin/classes'); list.value = r.data; loading.value = false; }
async function loadOptions() { const [s, t] = await Promise.all([request.get('/admin/schools'), request.get('/admin/teachers')]); schools.value = s.data; teachers.value = t.data; }
function openAdd() { isEdit.value = false; modalTitle.value = '新增班级'; form.name = ''; form.schoolId = undefined; form.teacherIds = []; loadOptions(); visible.value = true; }
async function handleOk() {
  const d = { name: form.name, schoolId: form.schoolId, teacherIds: form.teacherIds };
  isEdit.value ? await request.put(`/admin/classes/${editId.value}`, d) : await request.post('/admin/classes', d);
  visible.value = false; fetch();
}
async function del(id) { await request.delete(`/admin/classes/${id}`); fetch(); }
onMounted(fetch);
</script>

<style scoped>
.page { max-width: 1400px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.page-header h2 { font-size: 28px; }
.page-card { border: 1px solid var(--hairline); }
</style>
