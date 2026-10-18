<template>
  <PageShell
    title="学生管理"
    description="按班级维护学生名单；支持单个新增与 Excel 批量导入（缺学号或姓名的行会标为待补全）。"
  >
    <template #actions>
      <a-button type="primary" :disabled="!filterClass || isTeamClass" @click="openAdd">单个新增</a-button>
      <a-button :disabled="!filterClass || isTeamClass" @click="openUploadModal">批量导入</a-button>
    </template>

    <!-- ★R2-B47（U-2）：/teacher/students 已支持服务端分页（page/pageSize ⇒ {list,total,page,pageSize}），
         本页改为服务端分页；不传参数时接口仍返回全量数组（向后兼容其它调用方） -->
    <a-alert
      v-if="loadError"
      type="error" show-icon :message="'加载失败：' + loadError"
      description="可点击右侧「重试」重新拉取。"
      style="margin-bottom:12px;"
    >
      <template #action><a-button size="small" @click="fetch">重试</a-button></template>
    </a-alert>

    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :total="total"
      :loading="loading"
      row-key="id"
      :current="page.current"
      :page-size="page.pageSize"
      :empty-title="emptyTitle"
      :empty-desc="emptyDesc"
      :empty-action-text="emptyActionText"
      @page-change="onPageChange"
      @empty-action="onEmptyAction"
    >
      <template #toolbar>
        <!-- T5-A2：工具栏筛选没有可见 label，placeholder 不算可访问名称；且 antd 会把 aria-label 渲染到
             外层 .ant-select div（落不到 role=combobox 的 input 上）→ 用「视觉隐藏 label + for/id 关联」给出真实语义 -->
        <label for="tch-students-class-filter" class="visually-hidden">按班级筛选</label>
        <a-select id="tch-students-class-filter" v-model:value="filterClass" placeholder="选择班级（必选）" allowClear @change="onClassChange" class="w-260">
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
          <span class="stu-sid">
            <span class="lp-mono">{{ record._displaySid }}</span>
            <StatusTag v-if="record._incomplete" tone="warning" text="⚠ 待补全" dot />
          </span>
        </template>
        <!-- 姓名列只写了 dataIndex（没有 key）→ 分支必须用 column.dataIndex 判断（同金标页「满分」列）；
             主行 = 姓名，次行 = 班级名（原独立的「班级」列已并入此行，不再单独成列） -->
        <template v-else-if="column.dataIndex === 'realName'">
          <span class="lp-name">
            <a-avatar :size="24" class="lp-avatar" aria-hidden="true">{{ avatarChar(record) }}</a-avatar>
            <span class="lp-stack">
              <b>{{ record.realName }}</b>
              <span>{{ classText(record) }}</span>
            </span>
          </span>
        </template>
        <template v-else-if="column.key === 'school'">
          <span class="stu-school">{{ record.studentClasses?.[0]?.class?.school?.name || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'createdAt'">{{ formatDate(record.createdAt) }}</template>
        <template v-else-if="column.key === 'action'">
          <div class="lp-actions">
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
        <a-form-item label="学号" html-for="tch-student-username">
          <a-input id="tch-student-username" v-model:value="form.username" :disabled="isEdit && !form._canEditUsername" />
        </a-form-item>
        <a-form-item label="姓名" html-for="tch-student-realname">
          <a-input id="tch-student-realname" v-model:value="form.realName" />
        </a-form-item>
        <a-form-item label="班级" html-for="tch-student-class">
          <a-select id="tch-student-class" v-model:value="form.classId" placeholder="选择班级">
            <a-select-option v-for="c in teacherClasses" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="isEdit" label="重置密码">
          <!-- ★H6（W2-P2d）：口令已改为服务端随机生成并**一次性回传** ⇒ 文案不得再声称口令等于学号（旧语义会误导教师） -->
          <a-popconfirm title="确认重置该学生的登录口令？" description="重置后旧口令立即失效；系统将生成一次性随机口令，并在结果提示中显示一次。" ok-text="重置口令" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="resetPassword">
            <a-button :disabled="form._incomplete" type="dashed" danger>重置口令</a-button>
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
      <!-- ★R3-R14（R18）：学生初始口令 = 学号（用户裁定 D9 的临时状态，后端**不**强制首登改密）——
           文案必须如实：不能写「一次性随机口令/必须修改」（H6 学生侧已按用户裁定回退）。 -->
      <div v-if="uploadResult.credentials.length" class="result-list cred-list">
        <p class="result-title mt-3">
          初始口令（<span class="tone-warning">{{ uploadResult.credentials.length }}</span> 名）——
          <b>初始口令即为学号，请转交本人</b>；学生首次登录后可自行修改（系统不强制首登改密）。
        </p>
        <div v-for="(c, i) in uploadResult.credentials" :key="'c'+i" class="cred-item">
          <span class="lp-mono">{{ c.username }}</span>
          <b class="lp-mono">{{ c.initialPassword }}</b>
        </div>
      </div>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, watch, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';

/**
 * ★R2-B54：面向用户的错误文案**固定友好**；原始错误只进 console（带组件信息），**绝不进 UI 字符串**。
 * 形态固定（无入参依赖除 err 外）⇒ verify-frontend ⑨e 会**抽取本函数体执行**做断言（父组件/挂载态无关）。
 */
function friendlyLoadError(err) {
  // eslint-disable-next-line no-console
  console.error('[R2-B54] Students.vue 数据加载失败（原始错误只进 console，不进 UI）', err);
  return '数据加载失败，请重试';
}
import { InboxOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue';
import * as XLSX from 'xlsx';
import request from '../../api/request.js';
import { useSafeRequest } from '../../composables/useSafeRequest.js';   // ★W1（t1）：失败就地提示、不冒泡
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { formatDate } from '../../domain/format.js';
import { useConfirm } from '../../composables/useConfirm.js';

const { safeLoad, safeSubmit } = useSafeRequest({ tag: 'teacher/Students.vue' });

/** 命令式确认框（Wave 2 构件 useConfirm）：替代原 antd 命令式调用，行为等价 */
const { confirm } = useConfirm();

const page = reactive({ current: 1, pageSize: 20 });
const total = ref(0);          // ★R2-B47（U-2）：服务端 total（不再用 list.length 近似）
const loadError = ref('');     // ★R2-B47（U-1）：错态（可读原因 + 重试入口）
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

// 列表样式 v2：姓名列两行式（姓名 + 班级名）并「删除独立的班级列」；学校/创建时间列窄屏隐藏（xl）
const columns = [
  { title: '学号', key: 'username', width: 150, ellipsis: true },
  // 姓名列宽度 1fr：不设 width —— 固定表格布局下由它吃掉其余列之外的剩余宽度
  { title: '姓名', dataIndex: 'realName' },
  { title: '学校', key: 'school', width: 200, ellipsis: true, responsive: ['xl'] },
  // 创建时间固定单行 formatDate（不做日期 + 时间两行）
  { title: '创建时间', key: 'createdAt', width: 120, responsive: ['xl'] },
  { title: '操作', key: 'action', width: 120, align: 'right' },
];

/** 姓名列次行（班级名）：1~2 个直接并列；超过 2 个显示前 2 个 + 「+N」 */
function classText(record) {
  const names = (record.studentClasses || []).map(sc => sc.class?.name).filter(Boolean);
  if (!names.length) return '—';
  return names.length > 2 ? `${names.slice(0, 2).join('、')} +${names.length - 2}` : names.join('、');
}

/** 姓名列头像首字：取姓名首字；姓名待补全（"(待补全)"）时退化为学号首字 */
function avatarChar(record) {
  const name = record.realName || '';
  const base = (name && !name.startsWith('(')) ? name : (record._displaySid || '?');
  return base.charAt(0);
}

/** 前端切片：接口全量返回（见上方 TODO(P1-7)） */
/** ★R2-B47（U-2）：服务端已分页 ⇒ 不再前端切片（保留 computed 名以免动模板其余部分） */
const pagedList = computed(() => list.value);

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
/**
 * ★H6（W2-P2d）+ ★R3-R14（R18）：成功提示**统一读服务端 message**（一次性口令由服务端在 message 内回传）；
 * 当响应携带一次性口令（data.initialPassword）时追加"仅显示一次"提醒 —— 客户端**不得自造口令文案**。
 * ⚠️R3-R14：学生建号/重置口令 = **学号**（用户裁定 D9 临时状态，后端不置 mustChangePassword、不强制改密）；
 *   学生链路服务端不返回 data.initialPassword ⇒ 本分支只对教师/管理员链路（真实随机临时口令）生效。
 */
function successToast(res, fallback) {
  const text = (res && res.message) || fallback;
  const oneTime = !!(res && res.data && res.data.initialPassword);
  if (oneTime) message.success(text + '（该口令仅显示一次，请立即转交本人）', 8);
  else message.success(text);
}

const uploadResultOpen = ref(false);
const uploadResult = reactive({ success: 0, incomplete: 0, warnings: [], errors: [], credentials: [] });

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
  if (!filterClass.value) { list.value = []; total.value = 0; return; }
  loading.value = true;
  loadError.value = '';
  try {
    // ★R2-B47（U-2）：改走**服务端分页**（page/pageSize ⇒ 返回 { list, total, page, pageSize }）
    const r = await request.get('/teacher/students', {
      params: {
        classId: filterClass.value,
        keyword: keyword.value || undefined,
        page: page.current,
        pageSize: page.pageSize,
      },
    });
    const d = r.data;
    const rows = Array.isArray(d) ? d : (d && d.list) || [];     // 老形状（全量数组）兼容
    list.value = rows.map(enrichStudent);
    total.value = Array.isArray(d) ? rows.length : Number((d && d.total) || 0);
  } catch (e) {
    // ★U-1：失败 ⇒ 清空 + 错态，绝不停在 loading/空白；★R2-B54：UI 只放**固定友好文案**，原始错误进 console
    list.value = [];
    total.value = 0;
    loadError.value = friendlyLoadError(e);
  } finally {
    loading.value = false;     // ★任何路径必复位
  }
}

async function loadClasses() {
  const r = await safeLoad(() => request.get('/teacher/classes'), { action: '加载班级列表' });
  if (!r.error) teacherClasses.value = r.data || [];
}

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
  // ★W1（t1）④：提交前必填校验（姓名 / 学号 / 班级）—— 从源头避免 400（旧实现留空直接 POST）
  if (!String(form.realName || '').trim()) return message.warn('请输入姓名');
  if (!isEdit.value && !String(form.username || '').trim()) return message.warn('请输入学号');
  if (!form.classId) return message.warn('请选择班级');
  const d = { realName: String(form.realName).trim(), classId: form.classId };
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
          // ★W1：safeSubmit 不抛 ⇒ 失败已就地提示，弹窗不关、列表不丢
          const r = await safeSubmit(() => request.put(`/teacher/students/${editId.value}`, d), { action: '修改' });
          if (r.error) return;
          // ★H6（W2-P2d）：改学号会重设口令 ⇒ 口令在响应的 message 内（仅此一次）
          successToast(r.res, '修改成功');
          visible.value = false; await Promise.all([fetch(), loadClasses()]);
        },
      });
      return;
    }
    const r = await safeSubmit(() => request.put(`/teacher/students/${editId.value}`, d), { action: '修改' });
    if (r.error) return;
    successToast(r.res, '修改成功');
  } else {
    const r = await safeSubmit(
      () => request.post('/teacher/students', { username: String(form.username).trim(), realName: String(form.realName).trim(), classId: form.classId }),
      { action: '新增' },
    );
    if (r.error) return;
    // ★H6（W2-P2d）：新增学生返回一次性随机口令（在 message 内）⇒ 必须回显，否则无人知晓口令
    successToast(r.res, '新增成功');
  }
  visible.value = false; await Promise.all([fetch(), loadClasses()]);
}

async function resetPassword() {
  try {
    const r = await request.put(`/teacher/students/${editId.value}/reset-password`);
    // ★H6（W2-P2d）：口令在响应 message 内（随机一次性）；本地**不再自造**任何口令文案
    const oneTime = !!(r && r.data && r.data.initialPassword);
    message.success(oneTime ? r.message + '（该口令仅显示一次，请立即转交本人）' : ((r && r.message) || '密码已重置'), 8);
  } catch {}
}

async function del(id) {
  const r = await safeSubmit(() => request.delete(`/teacher/students/${id}`), { action: '删除' });
  if (r.error) return;
  message.success('删除成功');
  await Promise.all([fetch(), loadClasses()]);
}

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
  uploadResult.credentials = [];
  uploading.value = true;

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      uploadResult.errors.push('文件格式不支持，仅支持 .xlsx / .xls 格式');
      uploadModalOpen.value = false;
      uploadResultOpen.value = true;
      return false;
    }

    // ★P2-XLSX（2026-10-18）：xlsx@0.18.5 无修复版本 ⇒ 先限制文件大小与行列，长期换解析库/服务端隔离
    const MAX_XLSX_FILE_BYTES = 8 * 1024 * 1024;
    const MAX_XLSX_ROWS = 5000;
    const MAX_XLSX_COLS = 100;
    if (file.size && file.size > MAX_XLSX_FILE_BYTES) {
      uploadResult.errors.push('Excel 文件过大（上限 8MB）');
      uploadModalOpen.value = false;
      uploadResultOpen.value = true;
      return false;
    }
    // 解析 Excel
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const ref = ws && ws['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      const rows = range.e.r - range.s.r + 1;
      const cols = range.e.c - range.s.c + 1;
      if (rows > MAX_XLSX_ROWS || cols > MAX_XLSX_COLS) {
        uploadResult.errors.push(`Excel 行/列超限（上限 ${MAX_XLSX_ROWS} 行 / ${MAX_XLSX_COLS} 列）`);
        uploadModalOpen.value = false;
        uploadResultOpen.value = true;
        return false;
      }
    }
    const raw = XLSX.utils.sheet_to_json(ws);
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
    // ★H6（W2-P2d）：**新建**账号的一次性口令（服务端 data.credentials）—— 教师必须能看到，否则新生无人知晓口令
    uploadResult.credentials = Array.isArray(r.data?.credentials) ? r.data.credentials : [];
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

/** ★R2-B47（U-2）：服务端分页 ⇒ 翻页要重新请求（不再前端切片） */
function onPageChange(p, size) {
  page.current = p;
  if (size && size !== page.pageSize) { page.pageSize = size; page.current = 1; }
  fetch();
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
/* 姓名列：24px 中性头像 + 两行式（姓名 / 班级名）。头像纯装饰（aria-hidden），姓名与班级仍是真实文本。
   头像与排版复用全局 .lp-name / .lp-avatar（列表样式 v2 底座） */
/* 学号列：等宽学号 + 待补全标记；列窄到放不下时标记换行（不裁切成半个标签） */
.stu-sid {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}
/* 学校列：单行省略 */
.stu-school {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: var(--text-brand);
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
