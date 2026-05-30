<template>
  <div class="page">
    <div class="page-header">
      <h2>班级管理</h2>
      <a-button type="primary" @click="openAdd">新增班级</a-button>
    </div>
    <a-card class="page-card">
      <a-table :columns="columns" :dataSource="list" rowKey="id" :loading="loading" :scroll="{ x: 'max-content' }" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            {{ record.name }}
            <a-tag v-if="record.isTeamClass" color="purple" size="small" style="margin-left:4px">团队共享 · {{ record.ownerTeacherName }}</a-tag>
          </template>
          <template v-if="column.key === 'school'">{{ record.school?.name }}</template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a-button type="link" @click="openEdit(record)" :disabled="record.isTeamClass">编辑</a-button>
              <a-popconfirm title="确定删除？" ok-text="确定" cancel-text="取消" @confirm="del(record.id)" :disabled="record.isTeamClass">
                <a-button type="link" danger :disabled="record.isTeamClass">删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" ok-text="确定" cancel-text="取消" :width="1040" wrap-class-name="form-modal">
      <a-form :model="form">
        <a-form-item label="班级名称"><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="指定教学团队">
          <a-select v-model:value="form.teamIds" mode="multiple" placeholder="可选，将班级加入指定团队">
            <a-select-option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}（{{ t.creator?.realName }} 创建）</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
const loading = ref(false); const list = ref([]); const teams = ref([]);
const visible = ref(false); const modalTitle = ref(''); const isEdit = ref(false); const editId = ref(null);
const form = reactive({ name: '', teamIds: [] });
const columns = [
  { title: '班级名称', key: 'name', width: 200, ellipsis: true },
  { title: '所属学校', key: 'school', width: 200, ellipsis: true },
  { title: '创建时间', dataIndex: 'createdAt', width: 170, ellipsis: true },
  { title: '操作', key: 'action', width: 160 },
];
async function fetch() { loading.value = true; const r = await request.get('/teacher/classes'); list.value = r.data; loading.value = false; }
async function loadTeams() { const r = await request.get('/teacher/teams'); teams.value = r.data || []; }
function openAdd() { isEdit.value = false; modalTitle.value = '新增班级'; form.name = ''; form.teamIds = []; loadTeams(); visible.value = true; }
function openEdit(record) { isEdit.value = true; editId.value = record.id; modalTitle.value = '编辑班级'; form.name = record.name; form.teamIds = (record.teamClasses || []).map(tc => tc.teamId); loadTeams(); visible.value = true; }
async function handleOk() {
  const d = { name: form.name, teamIds: form.teamIds };
  isEdit.value ? await request.put(`/teacher/classes/${editId.value}`, d) : await request.post('/teacher/classes', d);
  message.success(isEdit.value ? '修改成功' : '创建成功');
  visible.value = false; fetch();
}
async function del(id) { await request.delete(`/teacher/classes/${id}`); message.success('删除成功'); fetch(); }
onMounted(fetch);
</script>

<style scoped>
.page { max-width: 1400px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.page-header h2 { font-size: 28px; }
.page-card { border: 1px solid var(--hairline); }
</style>
