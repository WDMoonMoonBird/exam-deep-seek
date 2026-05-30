<template>
  <div class="page">
    <div class="page-header">
      <h2>学生管理</h2>
      <a-space>
        <a-button type="primary" :disabled="!filterClass || isTeamClass" @click="openAdd">单个新增</a-button>
        <a-button :disabled="!filterClass || isTeamClass" @click="openUploadModal">批量导入</a-button>
      </a-space>
    </div>
    <a-card class="page-card">
      <div class="page-toolbar">
        <a-select v-model:value="filterClass" placeholder="选择班级（必选）" allowClear @change="onClassChange" style="width: 260px;">
          <a-select-option v-for="c in teacherClasses" :key="c.id" :value="c.id">
            {{ c.name }}
            <a-tag v-if="c.isTeamClass" color="purple" size="small" style="margin-left:4px">团队</a-tag>
          </a-select-option>
        </a-select>
        <a-input v-model:value="keyword" placeholder="搜索学生姓名" allowClear style="width: 220px;" />
        <a-tag v-if="isTeamClass" color="purple">团队共享班级 · 只读</a-tag>
      </div>
      <a-table :columns="columns" :dataSource="list" rowKey="id" :loading="loading" :scroll="{ x: 'max-content' }" :pagination="false" v-if="filterClass">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'school'">{{ record.studentClasses?.[0]?.class?.school?.name || '—' }}</template>
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
      </a-table>
      <a-empty v-else description="请先选择班级" />
    </a-card>

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" ok-text="确定" cancel-text="取消">
      <a-form :model="form">
        <a-form-item label="学号"><a-input v-model:value="form.username" :disabled="isEdit" /></a-form-item>
        <a-form-item label="姓名"><a-input v-model:value="form.realName" /></a-form-item>
        <a-form-item label="班级" v-if="!isEdit || true">
          <a-select v-model:value="form.classId" placeholder="选择班级">
            <a-select-option v-for="c in teacherClasses" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="uploadModalOpen" title="批量导入学生" :footer="null" :width="520" :destroyOnClose="true" @cancel="uploadFileList = []">
      <a-alert type="info" show-icon style="margin-bottom:16px;">
        <template #message>
          <div>上传格式要求</div>
        </template>
        <template #description>
          <ul style="margin:4px 0;padding-left:20px;font-size:13px;">
            <li>仅支持 <b>Excel 文件</b>（.xlsx / .xls）</li>
            <li>表头须包含 <b>学号</b> 和 <b>姓名</b> 两列</li>
            <li>学号和姓名均不能为空</li>
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
    </a-modal>

    <a-modal v-model:open="uploadResultOpen" title="导入结果" :footer="null" :width="480" :destroyOnClose="true">
      <div v-if="uploadResult.errors.length === 0" style="text-align:center;padding:24px;">
        <CheckCircleOutlined style="color:#52c41a;font-size:48px;" />
        <p style="font-size:16px;margin-top:12px;">全部导入成功</p>
        <p style="color:var(--ink-muted);">共 {{ uploadResult.success }} 名学生</p>
      </div>
      <div v-else>
        <div style="text-align:center;margin-bottom:16px;">
          <p style="font-size:16px;">
            成功 <span style="color:#52c41a;font-weight:600;">{{ uploadResult.success }}</span> 名，
            失败 <span style="color:#ff4d4f;font-weight:600;">{{ uploadResult.errors.length }}</span> 名
          </p>
        </div>
        <div v-if="uploadResult.errors.length" style="max-height:260px;overflow-y:auto;">
          <div v-for="(e, i) in uploadResult.errors" :key="i"
            style="padding:6px 10px;margin-bottom:4px;background:#fff2f0;border:1px solid #ffccc7;border-radius:4px;font-size:13px;color:#333;">
            <ExclamationCircleOutlined style="color:#ff4d4f;margin-right:6px;" />{{ e }}
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { InboxOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue';
import * as XLSX from 'xlsx';
import request from '../../api/request.js';
const loading = ref(false); const list = ref([]); const teacherClasses = ref([]); const filterClass = ref(undefined); const keyword = ref('');
const visible = ref(false); const modalTitle = ref(''); const isEdit = ref(false); const editId = ref(null);
const isTeamClass = ref(false);
const form = reactive({ username: '', realName: '', classId: undefined });
const columns = [
  { title: '学号', dataIndex: 'username', width: 130, ellipsis: true, sorter: (a, b) => a.username.localeCompare(b.username) },
  { title: '姓名', dataIndex: 'realName', width: 120, ellipsis: true },
  { title: '学校', key: 'school', width: 180, ellipsis: true },
  { title: '班级', key: 'classes', width: 150 },
  { title: '创建时间', dataIndex: 'createdAt', width: 170, ellipsis: true },
  { title: '操作', key: 'action', width: 160 },
];
const uploadModalOpen = ref(false);
const uploadFileList = ref([]);
const uploadResultOpen = ref(false);
const uploadResult = reactive({ success: 0, errors: [] });

let timer = null;
watch(keyword, () => { clearTimeout(timer); timer = setTimeout(fetch, 300); });
function onClassChange(val) {
  isTeamClass.value = !!teacherClasses.value.find(c => c.id === val)?.isTeamClass;
  fetch();
}
async function fetch() { if (!filterClass.value) { list.value = []; return; } loading.value = true; const r = await request.get('/teacher/students', { params: { classId: filterClass.value, keyword: keyword.value || undefined } }); list.value = r.data; loading.value = false; }
async function loadClasses() { const r = await request.get('/teacher/classes'); teacherClasses.value = r.data || []; }
function openAdd() { isEdit.value = false; modalTitle.value = '新增学生'; form.username = ''; form.realName = ''; form.classId = filterClass.value || undefined; visible.value = true; }
function openEdit(row) { isEdit.value = true; modalTitle.value = '编辑学生'; editId.value = row.id; form.username = row.username; form.realName = row.realName; form.classId = row.studentClasses?.[0]?.classId; visible.value = true; }
async function handleOk() {
  if (isEdit.value) {
    await request.put(`/teacher/students/${editId.value}`, { realName: form.realName, classId: form.classId });
    message.success('修改成功');
  } else {
    await request.post('/teacher/students', { username: form.username, realName: form.realName, classId: form.classId });
    message.success('新增成功');
  }
  visible.value = false; fetch();
}
async function del(id) { await request.delete(`/teacher/students/${id}`); message.success('删除成功'); fetch(); }
function openUploadModal() {
  uploadFileList.value = [];
  uploadModalOpen.value = true;
}

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
  const validStudents = [];
  // 检查表头
  const firstRow = rows[0] || {};
  const keys = Object.keys(firstRow);
  const hasUsername = keys.some(k => k === '学号' || k === 'username');
  const hasName = keys.some(k => k === '姓名' || k === 'realName');
  if (!hasUsername) errors.push('缺少表头：学号');
  if (!hasName) errors.push('缺少表头：姓名');
  if (!hasUsername || !hasName) return { validStudents: [], errors };

  const usernameKey = keys.find(k => k === '学号' || k === 'username');
  const nameKey = keys.find(k => k === '姓名' || k === 'realName');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const username = String(row[usernameKey] ?? '').trim();
    const realName = String(row[nameKey] ?? '').trim();
    // 跳过完全空行
    if (!username && !realName) continue;
    const rowNum = i + 2; // Excel 行号（1 表头 + 1-indexed）

    if (!username && !realName) {
      continue;
    } else if (!username) {
      errors.push(`第 ${rowNum} 行：姓名"${realName}"缺少学号`);
    } else if (!realName) {
      errors.push(`第 ${rowNum} 行：学号 ${username} 缺少姓名`);
    } else {
      validStudents.push({ username, realName });
    }
  }

  if (!validStudents.length && !errors.length) {
    errors.push('未解析到任何有效数据');
  }
  return { validStudents, errors };
}

async function handleUploadFile(file) {
  uploadResult.success = 0;
  uploadResult.errors = [];
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      uploadModalOpen.value = false;
      uploadResult.errors.push('文件格式不支持，仅支持 .xlsx / .xls 格式');
      uploadResultOpen.value = true;
      return false;
    }

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!raw.length) {
      uploadModalOpen.value = false;
      uploadResult.errors.push('文件为空或未包含有效数据');
      uploadResultOpen.value = true;
      return false;
    }

    const { validStudents, errors } = validateStudents(raw);

    if (errors.length) {
      uploadModalOpen.value = false;
      uploadResult.errors = errors;
      uploadResultOpen.value = true;
      if (!validStudents.length) return false;
    }

    if (validStudents.length) {
      const r = await request.post('/teacher/students/batch', {
        classId: filterClass.value,
        students: validStudents,
      });
      uploadResult.success = r.data?.success ?? validStudents.length;
      // 合并后端返回的错误
      if (r.data?.errors?.length) {
        uploadResult.errors.push(...r.data.errors.map(e => `学号 ${e.username}：${e.reason}`));
      }
      uploadModalOpen.value = false;
      uploadResultOpen.value = true;
      fetch();
    }
  } catch (e) {
    uploadModalOpen.value = false;
    uploadResult.errors.push(e?.response?.data?.message || '导入失败，请检查文件格式');
    uploadResultOpen.value = true;
  }
  return false;
}
onMounted(() => { loadClasses(); fetch(); });
</script>

<style scoped>
.page { max-width: 1400px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.page-header h2 { font-size: 28px; }
.page-toolbar { margin-bottom: 20px; display: flex; gap: 12px; align-items: center; }
.page-card { border: 1px solid var(--hairline); }
</style>
