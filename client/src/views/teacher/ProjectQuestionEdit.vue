<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <a-space>
        <!-- 教师模式：可编辑 / 学生模式：只读 -->
        <a-input v-if="isTeacher" v-model:value="form.title" :placeholder="isEdit?'编辑实训题':'新建实训题'" style="width:260px;font-size:18px;font-weight:700;" />
        <span v-else style="font-size:18px;font-weight:700;">{{ form.title || '实训题' }}</span>

        <a-select v-if="isTeacher" v-model:value="form.difficulty" style="width:100px;">
          <a-select-option value="easy">简单</a-select-option>
          <a-select-option value="medium">中等</a-select-option>
          <a-select-option value="hard">困难</a-select-option>
        </a-select>
        <a-tag v-else :color="form.difficulty==='easy'?'green':form.difficulty==='hard'?'red':'orange'">
          {{ form.difficulty === 'easy' ? '简单' : form.difficulty === 'hard' ? '困难' : '中等' }}
        </a-tag>

        <span style="font-size:14px;color:var(--ink-muted);white-space:nowrap;">满分</span>
        <a-input-number v-if="isTeacher" v-model:value="form.maxScore" :min="1" :step="5" style="width:80px;" />
        <span v-else style="font-weight:700;color:var(--blue);">{{ form.maxScore }} 分</span>
      </a-space>
      <a-space>
        <a-button @click="showDescModal = true">{{ form.description ? (isTeacher ? '题目描述 ✓' : '题目描述') : '题目描述' }}</a-button>
        <a-button @click="showRubricModal = true">{{ form.scoringRubric ? (isTeacher ? '评分标准 ✓' : '评分标准') : '评分标准' }}</a-button>
        <a-button v-if="isTeacher" type="primary" @click="handleSave">保存</a-button>
          <a-button v-else type="primary" :disabled="!hasUploaded || submitting" :loading="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : '提交答案' }}
        </a-button>
      </a-space>
    </div>

    <!-- 题目描述模态框 -->
    <a-modal v-model:open="showDescModal" :title="isTeacher ? '题目描述' : '题目描述（只读）'" :footer="null" width="720px" wrap-class-name="desc-modal">
      <RichEditor v-if="isTeacher" v-model="form.description" placeholder="请输入题目描述，说明项目要实现的功能和目标" />
      <div v-else class="readonly-desc" v-html="form.description || '<p style=color:#999>暂无题目描述</p>'"></div>
    </a-modal>

    <!-- 评分标准模态框 -->
    <a-modal v-model:open="showRubricModal" :title="isTeacher ? '评分标准' : '评分标准（只读）'" :footer="null" width="640px">
      <a-textarea v-if="isTeacher" v-model:value="form.scoringRubric" :rows="12" placeholder="请逐行填写评分项..." />
      <div v-else class="readonly-rubric">{{ form.scoringRubric || '未填写，使用默认标准：功能完整性50% + 代码规范25% + 健壮性25%' }}</div>
      <div v-if="isTeacher" style="margin-top:8px;font-size:12px;color:#999;">不填写则使用默认标准：功能完整性50% + 代码规范25% + 健壮性25%</div>
    </a-modal>

    <!-- 学生端：成绩卡片（实训题专用，R4 成绩唯一开关；未出分时仅显示提交状态） -->
    <div v-if="isStudent && studentSubmission" class="student-score-card" :class="{ pending: !canStudentSeeScoreNow }">
      <div class="ssc-head">
        <span class="ssc-status" :class="studentStatusType">{{ studentStatusText }}</span>
        <span v-if="studentSubmission.submittedAt" class="ssc-time">提交于 {{ formatSubmitTime(studentSubmission.submittedAt) }}</span>
      </div>
      <div class="ssc-body">
        <template v-if="canStudentSeeScoreNow">
          <div class="ssc-score">
            <span class="ssc-score-num">{{ studentSubmission.score ?? '—' }}</span>
            <span class="ssc-score-max">/ {{ form.maxScore }} 分</span>
          </div>
          <div class="ssc-feedback">
            <div class="ssc-feedback-label">教师评语</div>
            <div v-if="studentSubmission.feedback" class="ssc-feedback-text">{{ studentSubmission.feedback }}</div>
            <div v-else class="ssc-feedback-empty">教师未填写评语</div>
          </div>
        </template>
        <div v-else class="ssc-pending-hint">
          <LoadingOutlined v-if="studentSubmission.status === 'submitted'" spin />
          <span>评分完成后将在此显示成绩</span>
        </div>
      </div>
    </div>

    <!-- 阶段切换 -->
    <Transition name="kind-pick-switch" mode="out-in">
      <!-- 阶段一：上传 -->
      <div v-if="!hasUploaded" key="picker" class="kind-picker">
        <button class="kind-add-btn" @click="triggerUpload" :disabled="uploading">
          <LoadingOutlined v-if="uploading" spin />
          <span v-else>+</span>
        </button>
        <p class="kind-hint">{{ uploading ? '正在解析中...' : (isTeacher ? '点击上传标准工程包' : '点击上传项目文件') }}</p>
        <input ref="fileInputRef" type="file" accept=".zip" style="display:none" @change="onFileChange" />
      </div>

      <!-- 阶段二：VSCode 风格 IDE -->
      <div v-else key="editor" class="ide-stage">
        <div class="ide-body">
          <div class="sidebar">
            <div class="sidebar-title">资源管理器</div>
            <div class="file-tree">
              <a-tree
                :tree-data="fileTreeData"
                :field-names="{ children: 'children', title: 'name', key: 'path' }"
                :default-expanded-keys="defaultExpandedKeys"
                :show-icon="true"
                @select="onTreeSelect"
                @dblclick="onTreeDblclick"
              >
                <template #icon="{ type, path }">
                  <FolderOutlined v-if="type === 'directory'" style="color:#dcb67a;font-size:14px;" />
                  <span v-else class="tree-icon fiv-icon" :class="getClassWithColor(path || '')"></span>
                </template>
                <template #title="{ name, type }">
                  <span :class="type==='directory'?'tree-dir':'tree-file'">{{ name }}</span>
                </template>
              </a-tree>
            </div>
          </div>
          <div class="editor-area">
            <div class="tab-bar" v-if="openTabs.length">
              <div v-for="tab in openTabs" :key="tab.path" :class="['tab', { active: activePath === tab.path }]" @click="switchTab(tab.path)">
                <span class="tab-name">{{ tab.name }}</span>
                <span class="tab-close" @click.stop="closeTab(tab.path)">×</span>
              </div>
              <div class="tab-bar-fill"></div>
            </div>
            <div class="editor-container" ref="editorContainerRef"></div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { reactive, ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { FolderOutlined, LoadingOutlined } from '@ant-design/icons-vue';
import JSZip from 'jszip';
import loader from '@monaco-editor/loader';
import { getClassWithColor } from 'file-icons-js';
import 'file-icons-js/css/style.css';
import RichEditor from '../../components/RichEditor.vue';
import request from '../../api/request.js';
import { uploadPackage } from '../../api/projects.js';
import { getLanguage } from '../../utils/fileLang.js';

const props = defineProps({ mode: { type: String, default: 'teacher' } });
const isTeacher = computed(() => props.mode === 'teacher');
const isStudent = computed(() => props.mode === 'student');

const router = useRouter();
const route = useRoute();
const isEdit = computed(() => !!route.params.id);
const uploading = ref(false);
const submitting = ref(false);
const hasUploaded = ref(false);
const fileInputRef = ref(null);
const editorContainerRef = ref(null);
const showDescModal = ref(false);
const showRubricModal = ref(false);

const activePath = ref('');
const fileContents = new Map();
const fileTreeData = ref([]);
const defaultExpandedKeys = ref([]);
const openTabs = ref([]);
const studentSubmission = ref(null);

// 学生端提交的版本/状态信息（来自 toStudentView，已脱敏）
const assignmentId = computed(() => route.params.assignmentId);
const questionId = computed(() => route.params.questionId);

// R4：成绩放行的唯一开关，仅 reviewed / published 才显示分数
const canStudentSeeScoreNow = computed(() => {
  const s = studentSubmission.value?.status;
  return s === 'reviewed' || s === 'published';
});
const studentStatusText = computed(() => {
  const s = studentSubmission.value?.status;
  if (s === 'reviewed') return '已批改';
  if (s === 'published') return '已出分';
  if (s === 'submitted') return '已提交，待评分';
  if (s === 'draft') return '草稿';
  return '未提交';
});
const studentStatusType = computed(() => {
  const s = studentSubmission.value?.status;
  if (s === 'reviewed' || s === 'published') return 'success';
  if (s === 'submitted') return 'info';
  return 'default';
});

/** 成绩卡片：提交时间本地化显示 */
function formatSubmitTime(t) {
  if (!t) return '';
  const d = new Date(t);
  return d.toLocaleString('zh-CN', { hour12: false });
}

const form = reactive({
  title: '',
  difficulty: 'medium',
  maxScore: 100,
  description: '',
  scoringRubric: '',
  packageFile: null,
  tempId: '',
});

let monaco = null;
let editor = null;
let models = {};

// zip 条目名智能解码：先 UTF-8 严格，失败（Windows GBK 包）回退 GBK
const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });
const GBK_DECODER = new TextDecoder('gbk');
function robustZipFileName(bytes) {
  try { return UTF8_STRICT.decode(bytes); } catch { return GBK_DECODER.decode(bytes); }
}

// ===== Zip 解析 =====

async function parseZip(file) {
  const zip = await JSZip.loadAsync(file, { decodeFileName: robustZipFileName });
  const tree = [];
  const dirMap = { '': { children: tree, name: '/', type: 'directory' } };

  for (const [path, entry] of Object.entries(zip.files)) {
    if (path.startsWith('__MACOSX/') || path.includes('/.')) continue;
    if (entry.dir) {
      const parts = path.replace(/\/$/, '').split('/');
      let parent = dirMap[''];
      for (let i = 0; i < parts.length; i++) {
        const key = parts.slice(0, i + 1).join('/');
        if (!dirMap[key]) {
          const node = { name: parts[i], path: key, type: 'directory', children: [] };
          parent.children.push(node);
          dirMap[key] = node;
        }
        parent = dirMap[key];
      }
    } else {
      const ext = path.split('.').pop()?.toLowerCase();
      const codeExts = ['java','py','js','ts','cpp','c','cs','go','rs','rb','php','swift','kt','html','css','json','xml','yml','yaml','md','txt','vue','jsx','tsx'];
      if (ext && !codeExts.includes(ext)) continue;

      const content = await entry.async('string');
      fileContents.set(path, content);
      const parts = path.split('/');
      const parentPath = parts.slice(0, -1).join('/');
      const parent = dirMap[parentPath] || dirMap[''];
      parent.children.push({ name: parts[parts.length - 1], path, type: 'file', isLeaf: true, language: getLanguage(path) });
    }
  }
  return tree;
}

// ===== Monaco =====

function registerExtraLanguages() {
  if (!monaco) return;
  monaco.languages.register({ id: 'scss', extensions: ['.scss'] });
  monaco.languages.register({ id: 'less', extensions: ['.less'] });
}

async function initMonaco() {
  if (monaco) return;
  monaco = await loader.init();
  registerExtraLanguages();
  editor = monaco.editor.create(editorContainerRef.value, {
    value: '', language: 'plaintext', readOnly: true,
    minimap: { enabled: true, maxColumn: 80 }, automaticLayout: true,
    fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false,
    tabSize: 4, renderWhitespace: 'selection', smoothScrolling: true, cursorBlinking: 'smooth',
  });
}

function getOrCreateModel(path, language) {
  if (!monaco) return null;
  if (models[path]) return models[path];
  const uri = monaco.Uri.parse(`file:///${path}`);
  const existing = monaco.editor.getModel(uri);
  if (existing) { models[path] = existing; return existing; }
  const newModel = monaco.editor.createModel(fileContents.get(path) || '', language || 'plaintext', uri);
  models[path] = newModel;
  return newModel;
}

function switchTab(path) {
  if (!editor || !monaco) return;
  activePath.value = path;
  const model = getOrCreateModel(path, getLanguage(path));
  if (model) editor.setModel(model);
}

function closeTab(path) {
  openTabs.value = openTabs.value.filter(t => t.path !== path);
  if (activePath.value === path) {
    if (openTabs.value.length) switchTab(openTabs.value[openTabs.value.length - 1].path);
    else { activePath.value = ''; if (editor) editor.setModel(null); }
  }
}

function openFile(path, name, language) {
  if (!openTabs.value.find(t => t.path === path)) openTabs.value.push({ path, name, language });
  switchTab(path);
}

// ===== 文件处理 =====

async function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  uploading.value = true;
  try {
    const tree = await parseZip(file);
    fileTreeData.value = tree;
    defaultExpandedKeys.value = [];
    form.packageFile = file;

    // 教师模式：上传到服务端
    if (isTeacher.value) {
      const formData = new FormData();
      formData.append('file', file);
      uploadPackage(formData).then(r => { form.tempId = r.data?.tempId || ''; }).catch(() => {});
    }

    hasUploaded.value = true;
    message.success('文件解析成功');
    await nextTick();
    await new Promise(r => setTimeout(r, 300));
    if (editorContainerRef.value) await initMonaco();
  } catch (e) {
    message.error('解析失败：' + (e.message || '未知错误'));
  }
  uploading.value = false;
  e.target.value = '';
}

function triggerUpload() { fileInputRef.value?.click(); }

function onTreeSelect(keys) {
  if (!keys.length) return;
  const find = (nodes) => {
    for (const n of nodes) {
      if (n.path === keys[0] && n.type === 'file') return n;
      if (n.children) { const r = find(n.children); if (r) return r; }
    }
    return null;
  };
  const node = find(fileTreeData.value);
  if (node && node.type === 'file') openFile(node.path, node.name, node.language);
}

function onTreeDblclick(keys) {
  if (!keys.length) return;
  if (!openTabs.value.find(t => t.path === keys[0])) onTreeSelect(keys);
}

// ===== 教师：保存 =====

async function handleSave() {
  if (!form.title) return message.warn('请输入题目名称');
  const payload = { title: form.title, difficulty: form.difficulty, maxScore: form.maxScore, type: 'project', material: form.description, scoringRubric: form.scoringRubric };
  try {
    if (isEdit.value) {
      await request.put(`/teacher/questions/${route.params.id}`, payload);
      message.success('保存成功');
    } else {
      if (!form.tempId) return message.warn('请先上传标准工程包');
      payload.tempId = form.tempId;
      await request.post('/teacher/questions', payload);
      message.success('创建成功');
    }
    router.push('/teacher/questions');
  } catch (e) {
    message.error('保存失败：' + (e.response?.data?.message || e.message));
  }
}

// ===== 学生：提交答案 =====

async function handleSubmit() {
  if (!form.packageFile) return message.warn('请先上传项目文件');
  submitting.value = true;
  try {
    const formData = new FormData();
    formData.append('file', form.packageFile);

    // 学生端提交（T02）：写库 + 版本化 + 同步返回文件树，不触发 AI 评分（T03 负责）
    const r = await request.post(
      `/student/assignments/${assignmentId.value}/project/${questionId.value}/submit`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    const data = r.data;
    studentSubmission.value = data.submission;
    if (data.files?.tree) {
      fileTreeData.value = data.files.tree;
      fileContents.clear();
      if (data.files.contents) Object.entries(data.files.contents).forEach(([p, c]) => fileContents.set(p, c));
      hasUploaded.value = true;
      await nextTick(); await new Promise(res => setTimeout(res, 300));
      if (editorContainerRef.value) await initMonaco();
    }
    message.success(`提交成功，已生成第 ${data.version ?? '新'} 个版本`);
    submitting.value = false;
  } catch (e) {
    message.error('提交失败：' + (e.response?.data?.message || e.message));
    submitting.value = false;
  }
}

// ===== 加载已有题目 =====

async function loadQuestion() {
  try {
    // 教师：编辑/查看实训题
    if (isTeacher.value) {
      const r = await request.get(`/teacher/questions/${route.params.id}`);
      const q = r.data;
      form.title = q.title || '';
      form.difficulty = q.difficulty || 'medium';
      form.maxScore = q.maxScore || 100;
      form.description = q.material || '';
      form.scoringRubric = q.scoringRubric || '';

      if (q.attachmentUrl) {
        const treeRes = await request.get(`/teacher/questions/${route.params.id}/project-files`);
        if (treeRes.data?.tree?.length) {
          fileTreeData.value = treeRes.data.tree;
          if (treeRes.data?.contents) Object.entries(treeRes.data.contents).forEach(([p, c]) => fileContents.set(p, c));
          hasUploaded.value = true;
          await nextTick(); await new Promise(res => setTimeout(res, 300));
          if (editorContainerRef.value) await initMonaco();
        }
      }
      return;
    }

    // 学生：GET /student/assignments/:assignmentId/project/:questionId
    const r = await request.get(`/student/assignments/${assignmentId.value}/project/${questionId.value}`);
    const q = r.data;
    const question = q.question || {};
    form.title = question.title || '';
    form.difficulty = question.difficulty || 'medium';
    form.maxScore = question.maxScore || 100;
    form.description = question.material || '';
    form.scoringRubric = question.scoringRubric || '';

    fileContents.clear();
    const sub = q.submission;
    if (sub) {
      studentSubmission.value = sub;
      if (q.files?.tree?.length) {
        fileTreeData.value = q.files.tree;
        if (q.files.contents) Object.entries(q.files.contents).forEach(([p, c]) => fileContents.set(p, c));
        hasUploaded.value = true;
        await nextTick(); await new Promise(res => setTimeout(res, 300));
        if (editorContainerRef.value) await initMonaco();
      }
    }
  } catch (e) {
    message.error('加载失败');
  }
}

onMounted(() => {
  const hasQuestion = isTeacher.value
    ? !!route.params.id
    : !!(route.params.assignmentId && route.params.questionId);
  if (hasQuestion) loadQuestion();
});

onBeforeUnmount(() => {
  Object.values(models).forEach(m => m.dispose());
  editor?.dispose();
});
</script>

<style scoped>
.page { max-width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; }
.page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-shrink:0; }
.page-header h2 { font-size:28px; margin:0; }

.kind-pick-switch-enter-active,.kind-pick-switch-leave-active { transition: all .25s ease; }
.kind-pick-switch-enter-from,.kind-pick-switch-leave-to { opacity:0; transform:scale(.9); }

.kind-picker { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; }
.kind-add-btn { width:56px; height:56px; border-radius:50%; border:2px dashed #d9d9d9; background:#fafafa; font-size:24px; color:#999; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s; }
.kind-add-btn:hover { border-color:#1677ff; color:#1677ff; background:#e6f4ff; }
.kind-add-btn:disabled { cursor:not-allowed; opacity:.8; animation:upload-pulse 1.2s ease-in-out infinite; }
@keyframes upload-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
.kind-hint { font-size:13px; color:var(--ink-muted); transition:color .2s; }

/* 学生端成绩卡片（实训题专用） */
.student-score-card { margin-bottom:12px; flex-shrink:0; border:1px solid #e8e8e8; border-radius:8px; background:#fff; overflow:hidden; }
.student-score-card.pending { border-color:#f0f0f0; }
.ssc-head { display:flex; align-items:center; gap:10px; padding:8px 14px; background:#fafafa; border-bottom:1px solid #f0f0f0; }
.ssc-status { font-weight:600; font-size:13px; }
.ssc-status.success { color:#52c41a; }
.ssc-status.info { color:#1677ff; }
.ssc-status.default { color:#999; }
.ssc-time { margin-left:auto; font-size:12px; color:#999; }
.ssc-body { display:flex; align-items:flex-start; padding:14px 16px; gap:20px; }
.ssc-score { display:flex; align-items:baseline; gap:4px; padding-right:20px; border-right:1px solid #f0f0f0; min-width:110px; }
.ssc-score-num { font-size:32px; font-weight:700; color:#1677ff; line-height:1; }
.ssc-score-max { font-size:13px; color:#999; }
.ssc-feedback { flex:1; min-width:0; }
.ssc-feedback-label { font-size:12px; color:#888; margin-bottom:4px; }
.ssc-feedback-text { font-size:13px; line-height:1.7; color:#333; white-space:pre-wrap; }
.ssc-feedback-empty { font-size:13px; color:#bbb; }
.ssc-pending-hint { display:flex; align-items:center; gap:8px; font-size:13px; color:#999; padding:6px 0; }

.ide-stage { flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0; }
.ide-body { flex:1; display:flex; overflow:hidden; min-height:0; border:1px solid #e0e0e0; border-radius:4px; }

.sidebar { width:260px; flex-shrink:0; background:#f3f3f3; border-right:1px solid #e0e0e0; display:flex; flex-direction:column; overflow:hidden; }
.sidebar-title { padding:10px 12px; font-size:11px; font-weight:600; text-transform:uppercase; color:#666; letter-spacing:.5px; flex-shrink:0; }
.file-tree { flex:1; overflow-y:auto; padding:4px 0; }
.file-tree :deep(.ant-tree) { background:transparent; font-size:13px; }
.file-tree :deep(.ant-tree-treenode) { padding:1px 0; white-space:nowrap; }
.file-tree :deep(.ant-tree-node-content-wrapper) { padding:0 6px 0 2px; overflow:hidden; text-overflow:ellipsis; }
.file-tree :deep(.ant-tree-node-content-wrapper:hover) { background:#e4e6f1; }
.file-tree :deep(.ant-tree-node-selected) { background:#d6d9e8!important; }
.tree-icon { font-size:14px; width:16px; text-align:center; display:inline-block; flex-shrink:0; }
.tree-dir { font-weight:500; }
.tree-file { font-weight:400; }

.editor-area { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
.tab-bar { display:flex; background:#ececec; flex-shrink:0; min-height:35px; height:35px; align-items:flex-end; overflow-x:auto; overflow-y:hidden; }
.tab { display:flex; align-items:center; padding:7px 12px; font-size:12px; cursor:pointer; border-right:1px solid #ddd; background:#ececec; white-space:nowrap; min-width:80px; max-width:160px; flex-shrink:0; }
.tab.active { background:#fff; border-bottom:2px solid #fff; margin-bottom:-2px; }
.tab:hover:not(.active) { background:#e0e0e0; }
.tab-name { flex:1; overflow:hidden; text-overflow:ellipsis; font-size:12px; }
.tab-close { margin-left:6px; font-size:14px; color:#999; line-height:1; }
.tab-close:hover { color:#333; }
.tab-bar-fill { flex:1; background:#ececec; border-bottom:2px solid #ececec; height:35px; }
.editor-container { flex:1; overflow:hidden; background:#fff; }

.readonly-desc { padding: 12px; min-height: 200px; font-size: 14px; line-height: 1.8; }
.readonly-rubric { padding: 12px; min-height: 100px; font-size: 14px; line-height: 2; white-space: pre-wrap; }

.grade-result { padding: 8px 0; }
.grade-total { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 16px; }
.grade-total span { color: #1677ff; }
.grade-breakdown { margin-bottom: 12px; }
.grade-item { padding: 10px 12px; background: #fafafa; border-radius: 6px; margin-bottom: 8px; }
.grade-item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.grade-item-name { font-weight: 600; font-size: 14px; }
.grade-item-score { color: #1677ff; font-weight: 700; font-size: 14px; }
.grade-item-comment { font-size: 13px; color: #666; }
.grade-highlights { font-size: 13px; color: #52c41a; margin-bottom: 8px; }
.grade-issues { font-size: 13px; color: #ff4d4f; margin-bottom: 8px; }
.grade-overall { font-size: 13px; color: #333; padding: 10px; background: #f6ffed; border-radius: 6px; margin-top: 8px; }
</style>

<style>
.desc-modal .ProseMirror { min-height:420px; }
</style>
