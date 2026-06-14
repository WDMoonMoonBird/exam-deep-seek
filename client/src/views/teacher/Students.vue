<template>
  <div class="page">
    <div class="page-header">
      <h2>学生管理</h2>
      <a-space>
        <a-button type="primary" :disabled="!filterClass || isTeamClass" @click="openAdd">单个新增</a-button>
        <a-button :disabled="!filterClass || isTeamClass" @click="openUploadModal">批量导入</a-button>
      </a-space>
    </div>

    <div class="page-toolbar">
      <a-select v-model:value="filterClass" placeholder="选择班级（必选）" allowClear @change="onClassChange" style="width: 260px;">
        <a-select-option v-for="c in teacherClasses" :key="c.id" :value="c.id">
          {{ c.name }}
          <a-tag v-if="c.isTeamClass" color="purple" size="small" style="margin-left:4px">团队</a-tag>
        </a-select-option>
      </a-select>
      <span v-if="selectedClassCount !== null" style="font-size:13px;color:var(--ink-muted);">
        本班人数：<b style="color:var(--ink-base);">{{ selectedClassCount }}</b>
      </span>
      <a-input v-model:value="keyword" placeholder="搜索学生姓名" allowClear style="width: 220px;" :disabled="!filterClass" />
      <a-tag v-if="isTeamClass" color="purple">团队共享班级 · 只读</a-tag>
    </div>

    <template v-if="filterClass">
      <DataTable
        :columns="columns"
        :dataSource="list"
        rowKey="id"
        :loading="loading"
        v-model:current="page.current"
        :clientPagination="true"
        :pageSize="20"
        :scrollOffset="50"
      >

        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'username'">
            <span>{{ record._displaySid }}</span>
            <a-tag v-if="record._incomplete" color="orange" size="small" style="margin-left:4px">⚠ 待补全</a-tag>
          </template>
          <template v-if="column.key === 'school'">{{ record.studentClasses?.[0]?.class?.school?.name || '—' }}</template>
          <template v-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</template>
          <template v-if="column.key === 'classes'">
            <a-tag v-for="c in record.studentClasses" :key="c.classId">{{ c.class?.name }}</a-tag>
          </template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a-button type="link" @click="openEdit(record)" :disabled="isTeamClass">编辑</a-button>
              <a-popconfirm title="确定删除该学生？" ok-text="确定" cancel-text="取消" @confirm="del(record.id)" :disabled="isTeamClass">
                <a-button type="link" danger :disabled="isTeamClass">删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </DataTable>
    </template>

    <a-empty v-else description="请先选择班级" style="flex:1;display:flex;align-items:center;justify-content:center;" />

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" ok-text="确定" cancel-text="取消">
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
          <a-popconfirm title="确认将该学生密码重置为学号？" ok-text="确定" cancel-text="取消" @confirm="resetPassword">
            <a-button :disabled="form._incomplete" type="dashed" danger>重置为学号</a-button>
          </a-popconfirm>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="uploadModalOpen"
      title="批量导入学生"
      :footer="null" :width="520" :destroyOnClose="true"
      :maskClosable="!uploading" :closable="!uploading"
      @cancel="uploadFileList = []"
    >
      <a-spin :spinning="uploading" tip="正在导入中，请稍候…">
        <a-alert type="info" show-icon style="margin-bottom:16px;">
          <template #message><div>上传格式要求</div></template>
          <template #description>
            <ul style="margin:4px 0;padding-left:20px;font-size:13px;">
              <li>仅支持 <b>Excel 文件</b>（.xlsx / .xls）</li>
              <li>表头须包含 <b>学号</b> 和 <b>姓名</b> 两列</li>
              <li>学号和姓名尽量填写完整；<b>缺学号</b>或<b>缺姓名</b>的行也会导入，但标记为待补全（暂不可登录）</li>
            </ul>
          </template>
        </a-alert>
        <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;">
          <span style="font-size:13px;color:var(--ink-muted);">可先下载模板，按格式填写后上传：</span>
          <a-button size="small" @click="downloadTemplate">下载模板</a-button>
        </div>
        <a-upload-dragger
          v-model:fileList="uploadFileList"
          :beforeUpload="handleUploadFile"
          accept=".xlsx,.xls"
          :maxCount="1"
        >
          <p class="ant-upload-drag-icon"><inbox-outlined style="color:var(--blue);font-size:48px;" /></p>
          <p class="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p class="ant-upload-hint">仅支持 Excel 格式（.xlsx / .xls）</p>
        </a-upload-dragger>
      </a-spin>
    </a-modal>

    <a-modal v-model:open="uploadResultOpen" title="导入结果" :footer="null" :width="520" :destroyOnClose="true">
      <!-- 全部成功、无警告 -->
      <div v-if="uploadResult.errors.length === 0 && uploadResult.warnings.length === 0" style="text-align:center;padding:24px;">
        <CheckCircleOutlined style="color:#52c41a;font-size:48px;" />
        <p style="font-size:16px;margin-top:12px;">全部导入成功</p>
        <p style="color:var(--ink-muted);">共 {{ uploadResult.success }} 名学生</p>
      </div>
      <!-- 有警告或错误 -->
      <div v-else>
        <div style="text-align:center;margin-bottom:16px;">
          <p style="font-size:16px;">
            成功 <span style="color:#52c41a;font-weight:600;">{{ uploadResult.success }}</span> 名
            <template v-if="uploadResult.incomplete">（含 <span style="color:#fa8c16;font-weight:600;">{{ uploadResult.incomplete }}</span> 名待补全）</template>
            <template v-if="uploadResult.errors.length">，失败 <span style="color:#ff4d4f;font-weight:600;">{{ uploadResult.errors.length }}</span> 条</template>
          </p>
        </div>
        <!-- 警告：缺字段但仍导入 -->
        <div v-if="uploadResult.warnings.length" style="max-height:200px;overflow-y:auto;margin-bottom:12px;">
          <div v-for="(w, i) in uploadResult.warnings" :key="'w'+i"
            style="padding:6px 10px;margin-bottom:4px;background:#fff7e6;border:1px solid #ffd591;border-radius:4px;font-size:13px;color:#333;">
            <ExclamationCircleOutlined style="color:#fa8c16;margin-right:6px;" />{{ w }}
          </div>
        </div>
        <!-- 错误 -->
        <div v-if="uploadResult.errors.length" style="max-height:200px;overflow-y:auto;">
          <div v-for="(e, i) in uploadResult.errors" :key="'e'+i"
            style="padding:6px 10px;margin-bottom:4px;background:#fff2f0;border:1px solid #ffccc7;border-radius:4px;font-size:13px;color:#333;">
            <ExclamationCircleOutlined style="color:#ff4d4f;margin-right:6px;" />{{ e }}
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed, onMounted } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { InboxOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue';
import * as XLSX from 'xlsx';
import request from '../../api/request.js';
import DataTable from '../../components/DataTable.vue';
import { formatDateTime } from '../../utils/format.js';

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
  { title: '学校', key: 'school', width: 180, ellipsis: true },
  { title: '班级', key: 'classes', width: 150 },
  { title: '创建时间', key: 'createdAt', width: 170, ellipsis: true },
  { title: '操作', key: 'action', width: 160 },
];

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
      return new Promise((resolve) => {
        Modal.confirm({
          title: '确认修改学号',
          content: `保存后学号将变为「${form.username}」，不可再次修改。确定吗？`,
          okText: '确定保存',
          cancelText: '取消',
          onOk: async () => {
            try {
              await request.put(`/teacher/students/${editId.value}`, d);
              message.success('修改成功');
              visible.value = false; await Promise.all([fetch(), loadClasses()]);
            } catch {}
            resolve();
          },
          onCancel: () => resolve(),
        });
      });
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

onMounted(() => { loadClasses(); fetch(); });
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
.page-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}
</style>
