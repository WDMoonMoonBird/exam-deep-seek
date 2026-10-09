<template>
  <PageShell
    title="学生管理"
    description="按班级维护学生名单；支持单个新增与 Excel 批量导入（缺学号或姓名的行会标为待补全）。"
  >
    <template #actions>
      <a-button type="primary" :disabled="!filterClass || isTeamClass" @click="openAdd">单个新增</a-button>
      <a-button :disabled="!filterClass || isTeamClass" @click="openUploadModal">批量导入</a-button>
    </template>

    <!-- TODO(P1-7): 接口支持服务端分页后切换（/teacher/students 目前全量返回，沿用前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="id"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      :empty-title="emptyTitle"
      :empty-desc="emptyDesc"
      :empty-action-text="emptyActionText"
      @page-change="onPageChange"
      @empty-action="onEmptyAction"
    >
      <template #toolbar>
        <a-select v-model:value="filterClass" placeholder="选择班级（必选）" allowClear @change="onClassChange" class="w-260">
          <a-select-option v-for="c in teacherClasses" :key="c.id" :value="c.id">
            {{ c.name }}
            <StatusTag v-if="c.isTeamClass" tone="accent" text="团队" />
          </a-select-option>
        </a-select>
        <span v-if="selectedClassCount !== null" class="count-hint">
          本班人数：<b class="count-strong">{{ selectedClassCount }}</b>
        </span>
        <a-input v-model:value="keyword" placeholder="搜索学生姓名" allowClear class="w-220" :disabled="!filterClass" />
        <StatusTag v-if="isTeamClass" tone="accent" text="团队共享班级 · 只读" />
      </template>

      <template #toolbar-right>
        <span class="muted">共 {{ list.length }} 名学生</span>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'username'">
          <span class="tnum">{{ record._displaySid }}</span>
          <StatusTag v-if="record._incomplete" tone="warning" text="⚠ 待补全" />
        </template>
        <template v-else-if="column.key === 'school'">{{ record.studentClasses?.[0]?.class?.school?.name || '—' }}</template>
        <template v-else-if="column.key === 'classes'">
          <StatusTag v-for="c in record.studentClasses" :key="c.classId" tone="neutral" :text="c.class?.name" />
        </template>
        <template v-else-if="column.key === 'createdAt'">
          <span class="tnum">{{ formatDateTime(record.createdAt) }}</span>
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="row-actions">
            <a-button type="link" @click="openEdit(record)" :disabled="isTeamClass">编辑</a-button>
            <a-popconfirm title="确认删除该学生？" description="删除后该学生的班级关联与全部提交记录将被移除，不可撤销。" ok-text="删除学生" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="del(record.id)" :disabled="isTeamClass">
              <a-button type="link" danger :disabled="isTeamClass">删除</a-button>
            </a-popconfirm>
          </div>
        </template>
      </template>
    </ListPage>

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" :ok-text="isEdit ? '保存修改' : '新增学生'" cancel-text="取消" :width="480">
      <a-form :model="form">
        <a-form-item label="学号">
          <a-input v-model:value="form.username" :disabled="isEdit && !form._canEditUsername" />
        </a-form-item>
        <a-form-item label="姓名"><a-input v-model:value="form.realName" /></a-form-item>
        <a-form-item label="班级">
          <a-select v-model:value="form.classId" placeholder="选择班级">
            <a-select-option v-for="c in teacherClasses" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="isEdit" label="重置密码">
          <a-popconfirm title="确认将该学生密码重置为学号？" description="重置后旧密码立即失效。" ok-text="重置为学号" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="resetPassword">
            <a-button :disabled="form._incomplete" type="dashed" danger>重置为学号</a-button>
          </a-popconfirm>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="uploadModalOpen"
      title="批量导入学生"
      :footer="null" :width="640" :destroyOnClose="true"
      :maskClosable="!uploading" :closable="!uploading"
      @cancel="uploadFileList = []"
    >
      <a-spin :spinning="uploading" tip="正在导入中，请稍候…">
        <a-alert type="info" show-icon class="mb-4">
          <template #message><div>上传格式要求</div></template>
          <template #description>
            <ul class="fmt-list">
              <li>仅支持 <b>Excel 文件</b>（.xlsx / .xls）</li>
              <li>表头须包含 <b>学号</b> 和 <b>姓名</b> 两列</li>
              <li>学号和姓名尽量填写完整；<b>缺学号</b>或<b>缺姓名</b>的行也会导入，但标记为待补全（暂不可登录）</li>
            </ul>
          </template>
        </a-alert>
        <div class="tpl-row">
          <span class="tpl-hint">可先下载模板，按格式填写后上传：</span>
          <a-button size="small" @click="downloadTemplate">下载模板</a-button>
        </div>
        <a-upload-dragger
          v-model:fileList="uploadFileList"
          :beforeUpload="handleUploadFile"
          accept=".xlsx,.xls"
          :maxCount="1"
        >
          <p class="ant-upload-drag-icon"><inbox-outlined class="upload-icon" /></p>
          <p class="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p class="ant-upload-hint">仅支持 Excel 格式（.xlsx / .xls）</p>
        </a-upload-dragger>
      </a-spin>
    </a-modal>

    <a-modal v-model:open="uploadResultOpen" title="导入结果" :footer="null" :width="640" :destroyOnClose="true">
      <!-- 全部成功、无警告 -->
      <div v-if="uploadResult.errors.length === 0 && uploadResult.warnings.length === 0" class="result-center">
        <CheckCircleOutlined class="icon-success" />
        <p class="result-title mt-3">全部导入成功</p>
        <p class="muted">共 {{ uploadResult.success }} 名学生</p>
      </div>
      <!-- 有警告或错误 -->
      <div v-else>
        <div class="result-head">
          <p class="result-title">
            成功 <span class="tone-success">{{ uploadResult.success }}</span> 名
            <template v-if="uploadResult.incomplete">（含 <span class="tone-warning">{{ uploadResult.incomplete }}</span> 名待补全）</template>
            <template v-if="uploadResult.errors.length">，失败 <span class="tone-danger">{{ uploadResult.errors.length }}</span> 条</template>
          </p>
        </div>
        <!-- 警告：缺字段但仍导入 -->
        <div v-if="uploadResult.warnings.length" class="result-list warn-list">
          <div v-for="(w, i) in uploadResult.warnings" :key="'w'+i" class="warn-item">
            <ExclamationCircleOutlined class="icon-warning" />{{ w }}
          </div>
        </div>
        <!-- 错误 -->
        <div v-if="uploadResult.errors.length" class="result-list">
          <div v-for="(e, i) in uploadResult.errors" :key="'e'+i" class="err-item">
            <ExclamationCircleOutlined class="icon-danger" />{{ e }}
          </div>
        </div>
      </div>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, watch, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { InboxOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue';
import * as XLSX from 'xlsx';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { formatDateTime } from '../../domain/format.js';
import { useConfirm } from '../../composables/useConfirm.js';

/** 命令式确认框（Wave 2 构件 useConfirm）：替代原 antd 命令式调用，行为等价 */
const { confirm } = useConfirm();

const page = reactive({ current: 1, pageSize: 20 });
const loading = ref(false);
const list = ref([]);
const teacherClasses = ref([]);
const filterClass = ref(undefined);
const keyword = ref('');
const visible = ref(false);
const modalTitle = ref('');
const isEdit = ref(false);
const editId = ref(null);
const isTeamClass = ref(false);
const form = reactive({ username: '', realName: '', classId: undefined, _canEditUsername: false, _incomplete: false });

const selectedClassCount = computed(() => {
  if (!filterClass.value) return null;
  const c = teacherClasses.value.find(c => c.id === filterClass.value);
  return c?._count?.studentClasses ?? null;
});

const columns = [
  { title: '学号', key: 'username', width: 150, ellipsis: true },
  { title: '姓名', dataIndex: 'realName', width: 120, ellipsis: true },
  { title: '学校', key: 'school', width: 180, ellipsis: true, responsive: ['xl'] },
  { title: '班级', key: 'classes', width: 150 },
  { title: '创建时间', key: 'createdAt', width: 170, ellipsis: true, responsive: ['xl'] },
  { title: '操作', key: 'action', width: 160, align: 'right' },
];

/** 前端切片：接口全量返回（见上方 TODO(P1-7)） */
const pagedList = computed(() => list.value.slice((page.current - 1) * page.pageSize, page.current * page.pageSize));

/** 空态三态文案：未选班级 / 无搜索结果 / 班级无学生 */
const emptyTitle = computed(() => {
  if (!filterClass.value) return '请先选择班级';
  if (keyword.value) return '没有匹配的学生';
  return '这个班还没有学生';
});
const emptyDesc = computed(() => {
  if (!filterClass.value) return '选择班级后即可查看该班学生名单。';
  if (keyword.value) return '换个关键词，或清空搜索查看全部学生。';
  return '可以单个新增，也可以用 Excel 模板批量导入。';
});
const emptyActionText = computed(() => {
  if (!filterClass.value) return '';
  if (keyword.value) return '清空搜索';
  return '单个新增';
});

const uploadModalOpen = ref(false);
const uploadFileList = ref([]);
const uploading = ref(false);
const uploadResultOpen = ref(false);
const uploadResult = reactive({ success: 0, incomplete: 0, warnings: [], errors: [] });

let timer = null;
watch(keyword, () => { clearTimeout(timer); timer = setTimeout(fetch, 300); });

function onClassChange(val) {
  isTeamClass.value = !!teacherClasses.value.find(c => c.id === val)?.isTeamClass;
  fetch();
}

function enrichStudent(s) {
  const sid = (s.username || '').split('@')[0];
  s._displaySid = sid;
  s._incomplete = sid.startsWith('tmp_') || s.realName === '(待补全)';
  return s;
}

async function fetch() {
  if (!filterClass.value) { list.value = []; return; }
  loading.value = true;
  const r = await request.get('/teacher/students', { params: { classId: filterClass.value, keyword: keyword.value || undefined } });
  list.value = (r.data || []).map(enrichStudent);
  loading.value = false;
}

async function loadClasses() { const r = await request.get('/teacher/classes'); teacherClasses.value = r.data || []; }

function openAdd() {
  isEdit.value = false; modalTitle.value = '新增学生';
  form.username = ''; form.realName = ''; form.classId = filterClass.value || undefined;
  form._canEditUsername = true; form._incomplete = false;
  visible.value = true;
}

function openEdit(row) {
  isEdit.value = true; modalTitle.value = '编辑学生'; editId.value = row.id;
  form.username = row._displaySid; form.realName = row.realName;
  form.classId = row.studentClasses?.[0]?.classId;
  // 只有缺学号（tmp_）的学生才允许编辑学号；仅缺姓名的学生学号不可改
  form._canEditUsername = row._displaySid.startsWith('tmp_');
  form._incomplete = !!row._incomplete;
  visible.value = true;
}

async function handleOk() {
  const d = { realName: form.realName, classId: form.classId };
  if (isEdit.value) {
    // 补全学号：二次确认，保存后不可再修改
    if (form._canEditUsername) {
      d.newUsername = form.username;
      confirm({
        title: '确认修改学号',
        content: `保存后学号将变为「${form.username}」，且不可再次修改。`,
        okText: '保存新学号',
        cancelText: '取消',
        danger: true,   // 学号补齐后不可再次修改（不可逆）
        onOk: async () => {
          try {
            await request.put(`/teacher/students/${editId.value}`, d);
            message.success('修改成功');
            visible.value = false; await Promise.all([fetch(), loadClasses()]);
          } catch {}
        },
      });
      return;
    }
    await request.put(`/teacher/students/${editId.value}`, d);
    message.success('修改成功');
  } else {
    await request.post('/teacher/students', { username: form.username, realName: form.realName, classId: form.classId });
    message.success('新增成功');
  }
  visible.value = false; await Promise.all([fetch(), loadClasses()]);
}

async function resetPassword() {
  try {
    await request.put(`/teacher/students/${editId.value}/reset-password`);
    message.success(`密码已重置为学号`);
  } catch {}
}

async function del(id) { await request.delete(`/teacher/students/${id}`); message.success('删除成功'); await Promise.all([fetch(), loadClasses()]); }

function openUploadModal() { uploadFileList.value = []; uploadModalOpen.value = true; }

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { '学号': '202519001', '姓名': '张三' },
    { '学号': '202519002', '姓名': '李四' },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, '学生名单');
  XLSX.writeFile(wb, '学生导入模板.xlsx');
}

function validateStudents(rows) {
  const errors = [];
  const warnings = [];
  const validStudents = [];
  let incompleteCount = 0;

  const firstRow = rows[0] || {};
  const keys = Object.keys(firstRow);
  const hasUsername = keys.some(k => k === '学号' || k === 'username');
  const hasName = keys.some(k => k === '姓名' || k === 'realName');
  if (!hasUsername) errors.push('缺少表头：学号');
  if (!hasName) errors.push('缺少表头：姓名');
  if (!hasUsername || !hasName) return { validStudents, warnings, errors, incompleteCount: 0 };

  const usernameKey = keys.find(k => k === '学号' || k === 'username');
  const nameKey = keys.find(k => k === '姓名' || k === 'realName');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const username = String(row[usernameKey] ?? '').trim();
    const realName = String(row[nameKey] ?? '').trim();
    if (!username && !realName) continue;
    const rowNum = i + 2;
    if (!username) {
      warnings.push(`第 ${rowNum} 行：姓名"${realName}"缺少学号，已生成临时学号，请在编辑中补全`);
      validStudents.push({ username: '', realName });
      incompleteCount++;
    } else if (!realName) {
      warnings.push(`第 ${rowNum} 行：学号 ${username} 缺少姓名，请编辑补全`);
      validStudents.push({ username, realName: '' });
      incompleteCount++;
    } else {
      validStudents.push({ username, realName });
    }
  }

  if (!validStudents.length && !errors.length) errors.push('未解析到任何有效数据');
  return { validStudents, warnings, errors, incompleteCount };
}

async function handleUploadFile(file) {
  uploadResult.success = 0;
  uploadResult.incomplete = 0;
  uploadResult.warnings = [];
  uploadResult.errors = [];
  uploading.value = true;

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      uploadResult.errors.push('文件格式不支持，仅支持 .xlsx / .xls 格式');
      uploadModalOpen.value = false;
      uploadResultOpen.value = true;
      return false;
    }

    // 解析 Excel
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!raw.length) {
      uploadResult.errors.push('文件为空或未包含有效数据');
      uploadModalOpen.value = false;
      uploadResultOpen.value = true;
      return false;
    }

    const { validStudents, warnings, errors, incompleteCount } = validateStudents(raw);

    // 有致命错误（如表头缺失）或没有任何有效数据
    if (!validStudents.length) {
      uploadResult.errors = errors;
      uploadModalOpen.value = false;
      uploadResultOpen.value = true;
      return false;
    }

    // 发送到后端
    const r = await request.post('/teacher/students/batch', { classId: filterClass.value, students: validStudents });
    uploadResult.success = r.data?.success ?? validStudents.length;
    uploadResult.incomplete = incompleteCount;
    uploadResult.warnings = warnings;
    if (r.data?.errors?.length) {
      uploadResult.errors = r.data.errors.map(e => `学号 ${e.username}：${e.reason}`);
    }

    uploadModalOpen.value = false;
    uploadResultOpen.value = true;
    await Promise.all([fetch(), loadClasses()]);
  } catch (e) {
    uploadModalOpen.value = false;
    uploadResult.errors.push(e?.response?.data?.message || '导入失败，请检查文件格式');
    uploadResultOpen.value = true;
  } finally {
    uploading.value = false;
  }
  return false;
}

/** 前端切片页码（ListPage 只抛出页码，不内置请求） */
function onPageChange(p) {
  page.current = p;
}

/** 空态按钮：未选班级 → 无按钮；有搜索词 → 清空搜索；否则 → 新增学生 */
function onEmptyAction() {
  if (!filterClass.value) return;
  if (keyword.value) { keyword.value = ''; return; }
  openAdd();
}

onMounted(() => { loadClasses(); fetch(); });
</script>

<style scoped>
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
.tnum {
  font-variant-numeric: tabular-nums;
}
.row-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.w-260 {
  width: 260px;
}
.w-220 {
  width: 220px;
}
.count-hint {
  font-size: var(--fs-body-sm);
  color: var(--text-tertiary);
}
.count-strong {
  color: var(--text-primary);
}
.mb-4 {
  margin-bottom: var(--space-4);
}
.fmt-list {
  margin: var(--space-1) 0;
  padding-left: 20px;
  font-size: var(--fs-body-sm);
}
.tpl-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.tpl-hint {
  font-size: var(--fs-body-sm);
  color: var(--text-tertiary);
}
.upload-icon {
  color: var(--brand-600);
  font-size: 48px;
}
.result-center {
  padding: var(--space-6);
  text-align: center;
}
.result-head {
  margin-bottom: var(--space-4);
  text-align: center;
}
.result-title {
  font-size: var(--fs-title-3);
}
.mt-3 {
  margin-top: var(--space-3);
}
.result-list {
  max-height: 200px;
  overflow-y: auto;
}
.warn-list {
  margin-bottom: var(--space-3);
}
.warn-item {
  padding: 6px 10px;
  margin-bottom: 4px;
  background: var(--status-warning-bg);
  border: 1px solid var(--status-warning-bd);
  border-radius: var(--radius-xs);
  font-size: var(--fs-body-sm);
  color: var(--text-primary);
}
.err-item {
  padding: 6px 10px;
  margin-bottom: 4px;
  background: var(--status-danger-bg);
  border: 1px solid var(--status-danger-bd);
  border-radius: var(--radius-xs);
  font-size: var(--fs-body-sm);
  color: var(--text-primary);
}
.icon-success {
  color: var(--status-success-fg);
  font-size: 48px;
}
.icon-warning {
  margin-right: 6px;
  color: var(--status-warning-fg);
}
.icon-danger {
  margin-right: 6px;
  color: var(--status-danger-fg);
}
.tone-success {
  color: var(--status-success-fg);
  font-weight: 600;
}
.tone-warning {
  color: var(--status-warning-fg);
  font-weight: 600;
}
.tone-danger {
  color: var(--status-danger-fg);
  font-weight: 600;
}
</style>
