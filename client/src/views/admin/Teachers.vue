<template>
  <PageShell
    title="教师管理"
    description="维护教师账号、隶属学校；重置密码与删除请谨慎操作。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <a-button type="primary" @click="openAdd">新增教师</a-button>
    </template>

    <!-- TODO(P1-7): 接口支持服务端分页后切换（/admin/teachers 目前全量返回，暂由前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="id"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      empty-title="还没有教师"
      empty-desc="新增教师后，教师即可登录并管理自己名下的班级。"
      empty-action-text="新增教师"
      @page-change="onPageChange"
      @empty-action="openAdd"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'schools'">
          <template v-for="ts in record.teacherSchools" :key="ts.schoolId">
            <StatusTag v-if="ts.school" tone="neutral" :text="ts.school.name" />
          </template>
          <span v-if="!record.teacherSchools?.length" class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</template>
        <template v-else-if="column.key === 'action'">
          <div class="row-actions">
            <a-button type="link" @click="openEdit(record)">编辑</a-button>
            <a-popconfirm :title="`确认重置「${record.realName}」的密码？`" description="重置后密码将变为该教师工号，旧密码立即失效。" ok-text="重置密码" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="resetPwd(record.id)">
              <a-button type="link">重置密码</a-button>
            </a-popconfirm>
            <a-popconfirm v-if="record.id !== currentUserId" title="确定删除该教师？删除后其账号将无法登录，历史数据（题目/作业/成绩）保留" ok-text="删除教师" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="removeTeacher(record)">
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </div>
        </template>
      </template>
    </ListPage>

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" :ok-text="isEdit ? '保存修改' : '新增教师'" cancel-text="取消" :width="640">
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
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
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
  { title: '隶属学校', key: 'schools', width: 200, responsive: ['xl'] },
  { title: '创建时间', key: 'createdAt', width: 170, ellipsis: true, responsive: ['xl'] },
  { title: '操作', key: 'action', width: 100, align: 'right' },
];

const availableSchoolOptions = computed(() =>
  schools.value.filter(s => !form.schoolIds.includes(s.id)).map(s => ({ label: s.name, value: s.id }))
);

function getSchoolName(id) { return schools.value.find(s => s.id === id)?.name || ''; }

/** /admin/teachers 目前全量返回 → 保持前端切片分页（见模板 TODO(P1-7)） */
const pagedList = computed(() => {
  const start = (page.current - 1) * page.pageSize;
  return list.value.slice(start, start + page.pageSize);
});

function onPageChange(p) {
  page.current = p;
}

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
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
.row-actions {
  display: flex;
  gap: var(--space-1);
  justify-content: flex-end;
}
.school-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-3);
}
</style>
