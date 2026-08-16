<template>
  <div class="page">
    <div class="page-header">
      <h2>教师管理</h2>
      <a-button type="primary" @click="openAdd">新增教师</a-button>
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
        <template v-if="column.key === 'schools'">
          <a-tag v-for="ts in record.teacherSchools" :key="ts.schoolId">{{ ts.school?.name }}</a-tag>
        </template>
        <template v-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button type="link" @click="openEdit(record)">编辑</a-button>
            <a-popconfirm title="确定重置该教师密码？" ok-text="确定" cancel-text="取消" @confirm="resetPwd(record.id)">
              <a-button type="link">重置密码</a-button>
            </a-popconfirm>
            <a-popconfirm v-if="record.id !== currentUserId" title="确定删除该教师？删除后其账号将无法登录，历史数据（题目/作业/成绩）保留" ok-text="删除" ok-button-props="{ danger: true }" cancel-text="取消" @confirm="removeTeacher(record)">
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </DataTable>

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" ok-text="确定" cancel-text="取消" width="560">
      <a-form :model="form">
        <a-form-item label="工号"><a-input v-model:value="form.username" :disabled="isEdit" /></a-form-item>
        <a-form-item label="姓名"><a-input v-model:value="form.realName" /></a-form-item>
        <a-form-item label="隶属学校">
          <a-select :value="undefined" showSearch placeholder="搜索学校添加" :options="availableSchoolOptions" :filterOption="filterSchool" @select="addSchool" style="width: 100%;" />
          <div v-if="form.schoolIds.length > 0" class="school-tags">
            <a-tag v-for="sid in form.schoolIds" :key="sid" closable @close="removeSchool(sid)">{{ getSchoolName(sid) }}</a-tag>
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import DataTable from '../../components/DataTable.vue';
import { formatDateTime } from '../../domain/format.js';
const loading = ref(false);
const list = ref([]);
const page = reactive({ current: 1, pageSize: 20 });
const schools = ref([]);
const visible = ref(false);
const modalTitle = ref('');
const isEdit = ref(false);
const editId = ref(null);
const form = reactive({ username: '', realName: '', schoolIds: [] });
const columns = [
  { title: '工号', dataIndex: 'username', width: 130, ellipsis: true },
  { title: '姓名', dataIndex: 'realName', width: 120, ellipsis: true },
  { title: '隶属学校', key: 'schools', width: 200 },
  { title: '创建时间', key: 'createdAt', width: 170, ellipsis: true },
  { title: '操作', key: 'action', width: 100 },
];

const availableSchoolOptions = computed(() =>
  schools.value.filter(s => !form.schoolIds.includes(s.id)).map(s => ({ label: s.name, value: s.id }))
);

function getSchoolName(id) { return schools.value.find(s => s.id === id)?.name || ''; }

async function fetch() {
  loading.value = true;
  const r = await request.get('/admin/teachers');
  list.value = r.data;
  loading.value = false;
}

async function loadSchools() { const r = await request.get('/admin/schools'); schools.value = r.data; }

function filterSchool(input, option) { return option.label?.toLowerCase().includes(input.toLowerCase()); }

function addSchool(value) {
  if (!form.schoolIds.includes(value)) form.schoolIds.push(value);
}

function removeSchool(id) { form.schoolIds = form.schoolIds.filter(s => s !== id); }

function openAdd() {
  isEdit.value = false; modalTitle.value = '新增教师';
  form.username = ''; form.realName = ''; form.schoolIds = [];
  loadSchools(); visible.value = true;
}

function openEdit(row) {
  isEdit.value = true; modalTitle.value = '编辑教师'; editId.value = row.id;
  form.username = row.username; form.realName = row.realName;
  form.schoolIds = (row.teacherSchools || []).map(ts => ts.school?.id).filter(Boolean);
  loadSchools(); visible.value = true;
}

async function handleOk() {
  const data = { realName: form.realName, schoolIds: form.schoolIds };
  if (!isEdit.value) data.username = form.username;
  isEdit.value ? await request.put(`/admin/teachers/${editId.value}`, data) : await request.post('/admin/teachers', data);
  visible.value = false; fetch();
}

async function resetPwd(id) {
  try {
    const r = await request.put(`/admin/teachers/${id}/reset-password`);
    message.success(r.message);
  } catch { message.error('重置失败'); }
}

/** 当前登录管理员 id（与 request.js 的 localStorage 约定一致），用于隐藏自身的删除按钮 */
const currentUserId = (() => {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.id ?? null; } catch { return null; }
})();

async function removeTeacher(row) {
  try {
    await request.delete(`/admin/teachers/${row.id}`);
    message.success(`教师「${row.realName}」已删除`);
    fetch();
  } catch (e) {
    message.error(e.response?.data?.message || '删除失败');
  }
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
.school-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
</style>
