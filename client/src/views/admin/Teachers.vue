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
        <!-- 工号列只写了 dataIndex（没有 key）→ 分支必须用 column.dataIndex 判断（同金标页「满分」列） -->
        <template v-if="column.dataIndex === 'username'">
          <span class="lp-mono">{{ record.username }}</span>
        </template>
        <!-- 姓名列同样只有 dataIndex → 单行「24px 中性头像 + 姓名」；头像纯装饰（aria-hidden），姓名仍是真实文本 -->
        <template v-else-if="column.dataIndex === 'realName'">
          <span class="lp-name">
            <a-avatar :size="24" class="lp-avatar" aria-hidden="true">{{ avatarChar(record) }}</a-avatar>
            <span class="lp-stack"><b>{{ record.realName }}</b></span>
          </span>
        </template>
        <!-- 隶属学校：最多 2 个具名 chip，其余折叠为「+N」（长列表不再把行高撑成多行） -->
        <template v-else-if="column.key === 'schools'">
          <template v-for="(name, i) in schoolChips(record)" :key="i + '-' + name">
            <StatusTag tone="neutral" :text="name" />
          </template>
          <span v-if="!schoolChips(record).length" class="muted">—</span>
        </template>
        <!-- 创建时间：固定单行 formatDate（不做日期 + 时间两行） -->
        <template v-else-if="column.key === 'createdAt'">{{ formatDate(record.createdAt) }}</template>
        <template v-else-if="column.key === 'action'">
          <div class="lp-actions">
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

    <!-- ★W1（t1）④：字段级校验提示（validate-status/help）+ 提交中屏蔽重复点击 -->
    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" :ok-text="isEdit ? '保存修改' : '新增教师'" cancel-text="取消" :width="640" :ok-button-props="{ loading: submitting }">
      <a-form :model="form">
        <a-form-item label="工号" html-for="admin-teacher-username" :validate-status="formErrors.username ? 'error' : ''" :help="formErrors.username">
          <a-input id="admin-teacher-username" v-model:value="form.username" :disabled="isEdit" placeholder="教师登录用的工号，必填" />
        </a-form-item>
        <a-form-item label="姓名" html-for="admin-teacher-realname" :validate-status="formErrors.realName ? 'error' : ''" :help="formErrors.realName">
          <a-input id="admin-teacher-realname" v-model:value="form.realName" placeholder="真实姓名，必填" />
        </a-form-item>
        <a-form-item label="隶属学校" html-for="admin-teacher-schools" :validate-status="formErrors.schoolIds ? 'error' : ''" :help="formErrors.schoolIds">
          <a-select id="admin-teacher-schools" :value="undefined" showSearch placeholder="搜索学校添加（至少一所）" :options="availableSchoolOptions" :filterOption="filterSchool" @select="addSchool" style="width: 100%;" />
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
// ★W1（t1）：所有请求走 safeLoad / safeSubmit —— 失败就地提示、**不冒泡**（旧的 handleOk 裸 await 会让 400 把整页替换成错误页）
import { useSafeRequest } from '../../composables/useSafeRequest.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { formatDate } from '../../domain/format.js';
const { safeLoad, safeSubmit } = useSafeRequest({ tag: 'Teachers.vue' });
const loading = ref(false);
const submitting = ref(false);
const list = ref([]);
const page = reactive({ current: 1, pageSize: 20 });
const schools = ref([]);
const visible = ref(false);
const modalTitle = ref('');
const isEdit = ref(false);
const editId = ref(null);
const form = reactive({ username: '', realName: '', schoolIds: [] });
// ★W1（t1）④：提交前**字段级**校验（工号必填 / 姓名必填 / 至少一所学校）—— 曾经的故障就是姓名留空直接 POST ⇒ 400 ⇒ 整页被错误页替换
const formErrors = reactive({ username: '', realName: '', schoolIds: '' });

/** 逐字段校验（只做前端可判定的必填/空白）；返回是否全部通过 */
function validateForm() {
  formErrors.username = !isEdit.value && !String(form.username || '').trim() ? '请填写工号（教师登录账号）' : '';
  formErrors.realName = !String(form.realName || '').trim() ? '请填写姓名' : '';
  formErrors.schoolIds = form.schoolIds.length === 0 ? '请至少选择一所学校' : '';
  return !formErrors.username && !formErrors.realName && !formErrors.schoolIds;
}
// 列表样式 v2：工号等宽、姓名列（24px 中性头像 + 单行姓名）吃掉剩余宽度、创建时间单行 formatDate
const columns = [
  { title: '工号', dataIndex: 'username', width: 140, ellipsis: true },
  // 姓名列宽度 1fr：固定表格布局下由它吃掉其余列之外的剩余宽度
  { title: '姓名', dataIndex: 'realName', width: '1fr' },
  { title: '隶属学校', key: 'schools', width: 260, responsive: ['xl'] },
  { title: '创建时间', key: 'createdAt', width: 120, responsive: ['xl'] },
  { title: '操作', key: 'action', width: 100, align: 'right' },
];

/** 隶属学校 chip：最多 2 个具名 chip，其余折叠为「+N」（数据源与原 v-for 同一份，只改展示条数） */
function schoolChips(record) {
  const names = (record.teacherSchools || []).map(ts => ts.school?.name).filter(Boolean);
  return names.length > 2 ? [...names.slice(0, 2), `+${names.length - 2}`] : names;
}

/** 姓名头像首字（纯装饰，与姓名同源；空姓名退化为「?」） */
function avatarChar(record) {
  return (record.realName || '?').charAt(0);
}

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
  try {
    // safeLoad 永不抛出：失败已就地提示 ⇒ 列表保持原样（绝不整页崩）
    const r = await safeLoad(() => request.get('/admin/teachers'), { action: '加载教师列表' });
    if (!r.error) list.value = r.data || [];
  } finally {
    loading.value = false;
  }
}

async function loadSchools() {
  const r = await safeLoad(() => request.get('/admin/schools'), { action: '加载学校列表' });
  if (!r.error) schools.value = r.data || [];
}

function filterSchool(input, option) { return option.label?.toLowerCase().includes(input.toLowerCase()); }

function addSchool(value) {
  if (!form.schoolIds.includes(value)) form.schoolIds.push(value);
}

function removeSchool(id) { form.schoolIds = form.schoolIds.filter(s => s !== id); }

function clearFormErrors() { formErrors.username = ''; formErrors.realName = ''; formErrors.schoolIds = ''; }

function openAdd() {
  isEdit.value = false; modalTitle.value = '新增教师';
  form.username = ''; form.realName = ''; form.schoolIds = [];
  clearFormErrors();
  loadSchools(); visible.value = true;
}

function openEdit(row) {
  isEdit.value = true; modalTitle.value = '编辑教师'; editId.value = row.id;
  form.username = row.username; form.realName = row.realName;
  form.schoolIds = (row.teacherSchools || []).map(ts => ts.school?.id).filter(Boolean);
  clearFormErrors();
  loadSchools(); visible.value = true;
}

async function handleOk() {
  // ① 提交前校验：不通过就地给字段级提示，**不发请求**（从源头避免 400）
  if (!validateForm()) {
    message.warning('请先补全表单中标红的必填项');
    return;
  }
  const data = { realName: String(form.realName).trim(), schoolIds: form.schoolIds.slice() };
  if (!isEdit.value) data.username = String(form.username).trim();
  submitting.value = true;
  // ② 提交走 safeSubmit：失败就地提示、弹窗不关、列表不消失、路由不崩
  const r = await safeSubmit(
    () => (isEdit.value ? request.put(`/admin/teachers/${editId.value}`, data) : request.post('/admin/teachers', data)),
    { action: isEdit.value ? '保存' : '新增' },
  );
  submitting.value = false;
  if (r.error) return;
  message.success(isEdit.value ? '已保存修改' : '教师已新增');
  visible.value = false;
  fetch();
}

async function resetPwd(id) {
  const r = await safeSubmit(() => request.put(`/admin/teachers/${id}/reset-password`), { action: '重置密码' });
  if (r.error) return;
  message.success((r.res && r.res.message) || '密码已重置');
}

/** 当前登录管理员 id（与 request.js 的 localStorage 约定一致），用于隐藏自身的删除按钮 */
const currentUserId = (() => {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.id ?? null; } catch { return null; }
})();

async function removeTeacher(row) {
  const r = await safeSubmit(() => request.delete(`/admin/teachers/${row.id}`), { action: '删除' });
  if (r.error) return;
  message.success(`教师「${row.realName}」已删除`);
  fetch();
}

onMounted(fetch);
</script>

<style scoped>
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
/* 姓名列：24px 中性头像 + 单行姓名（头像与排版复用全局 .lp-name / .lp-avatar / .lp-stack） */
.school-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-3);
}
</style>
