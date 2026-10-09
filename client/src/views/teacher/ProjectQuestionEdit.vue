<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <a-space>
        <!-- 教师模式：可编辑 / 学生模式：只读 -->
        <a-input v-if="isTeacher" v-model:value="form.title" :placeholder="isEdit?'编辑实训题':'新建实训题'" style="width:260px;font-size:18px;font-weight:700;" />
        <span v-else style="font-size:18px;font-weight:700;">{{ form.title || '实训题' }}</span>
        <a-tag color="orange" size="small" style="margin:0;">BETA</a-tag>

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
        <a-button @click="openDescModal">题目描述</a-button>
        <a-button @click="openRubricModal">评分标准</a-button>
        <a-button v-if="isTeacher && isEdit" @click="showPromptPreview">查看 AI 提示词</a-button>
        <a-button v-if="isTeacher" type="primary" @click="handleSave">保存</a-button>
          <a-button v-else type="primary" :disabled="!hasUploaded || submitting || (isStudent && studentSubmission && studentSubmission.status !== 'draft')" :loading="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : '提交答案' }}
        </a-button>
      </a-space>
    </div>

    <!-- 题目描述模态框 -->
    <a-modal v-model:open="showDescModal" :title="isTeacher ? '题目描述' : '题目描述（只读）'" width="720px" wrap-class-name="desc-modal">
      <RichEditor v-if="isTeacher" v-model="descDraft" placeholder="请输入题目描述，说明项目要实现的功能和目标" />
      <div v-else class="readonly-desc" v-html="safeDescriptionHtml"></div>
      <template #footer>
        <a-button v-if="!isTeacher" @click="showDescModal = false">关闭</a-button>
        <template v-else>
          <a-button @click="showDescModal = false">取消</a-button>
          <a-button type="primary" @click="confirmDesc">确定</a-button>
        </template>
      </template>
    </a-modal>

    <!-- 评分标准模态框 -->
    <a-modal v-model:open="showRubricModal" :title="isTeacher ? '评分标准' : '评分标准（只读）'" width="640px">
      <a-textarea v-if="isTeacher" v-model:value="rubricDraft" :rows="12" placeholder="建议逐条写明必须完成的功能并注明分值，AI 会逐条核对。" />
      <div v-else class="readonly-rubric">{{ form.scoringRubric || '未填写，使用默认标准：功能完整性50% + 代码规范25% + 健壮性25%' }}</div>
      <div v-if="isTeacher" style="margin-top:8px;font-size:12px;color:#999;">不填写则使用默认标准：功能完整性50% + 代码规范25% + 健壮性25%</div>
      <template #footer>
        <a-button v-if="!isTeacher" @click="showRubricModal = false">关闭</a-button>
        <template v-else>
          <a-button @click="showRubricModal = false">取消</a-button>
          <a-button type="primary" @click="confirmRubric">确定</a-button>
        </template>
      </template>
    </a-modal>

    <!-- AI 提示词预览（编辑页模板：有标准包时展示标准包真实内容；开放性题目无标准答案段，学生代码占位） -->
    <a-modal v-model:open="promptModalOpen" title="AI 提示词（与实评一致，学生代码以占位符显示）" :footer="null" width="820px">
      <a-spin :spinning="promptLoading">
        <template v-if="promptPreview">
          <div class="prompt-block">
            <div class="prompt-role-label">System（角色设定）</div>
            <pre class="prompt-pre">{{ promptPreview.system }}</pre>
            <div class="prompt-role-label">User（评分任务，{{ promptUserPartLabel }}）</div>
            <pre class="prompt-pre">{{ promptPreview.user }}</pre>
          </div>
        </template>
        <a-empty v-else-if="!promptLoading" description="暂无数据" :image="false" />
      </a-spin>
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

    <!-- 阶段切换（还原封装前布局）：未上传 = 整页居中圆形按钮；已上传 = 文件树 + Monaco -->
    <Transition name="kind-pick-switch" mode="out-in">
      <!-- 阶段一：整页居中上传入口（圆形按钮 + 提示） -->
      <div v-if="!hasUploaded" key="picker" class="ide-stage">
        <div class="picker-slot">
          <ProjectZipUploader
            :hint="isTeacher ? '点击上传标准工程包' : '点击上传项目文件'"
            v-model:package="form.packageFile"
            @ready="onZipReady"
            @error="(m) => message.error(m)"
          />
        </div>
        <!-- 开放性实训题说明（仅教师视角；学生端不显示） -->
        <p v-if="isTeacher" class="open-project-hint">
          本项可选：不上传标准工程包即为开放性题目 —— AI 将只依据上方评分标准对学生工程做评价式评分，不与参考答案对比。建议在评分标准中逐条写明必须完成的功能及分值。
        </p>
      </div>

      <!-- 阶段二：VSCode 风格 IDE（左文件树 + 右 Monaco） -->
      <div v-else key="editor" class="ide-stage">
        <div class="ide-body">
          <div class="sidebar">
            <ProjectZipUploader
              :tree-data="externalTree"
              @select="onZipSelect"
            />
          </div>
          <div class="editor-area">
            <div class="tab-bar" v-if="openTabs.length">
              <div v-for="tab in openTabs" :key="tab.path" :class="['tab', { active: activePath === tab.path }]" @click="switchTab(tab.path)">
                <span class="tab-name">{{ tab.name }}</span>
                <span class="tab-close" @click.stop="closeTab(tab.path)">×</span>
              </div>
              <div class="tab-bar-fill"></div>
            </div>
            <div class="editor-body">
              <div class="editor-container" ref="editorContainerRef" :class="{ 'pr-fade-in': fading }"></div>
              <div v-if="!openTabs.length" class="editor-empty">
                <FileTextOutlined style="font-size:48px;color:#d9d9d9" />
                <p>从左侧选择文件查看代码</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { reactive, ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { LoadingOutlined, FileTextOutlined } from '@ant-design/icons-vue';
import loader from '@monaco-editor/loader';
import { applyMonacoCompat } from '../../infrastructure/monaco/legacyLoaderCompat';
import RichEditor from '../../components/RichEditor.vue';
import DOMPurify from 'dompurify';
import request from '../../api/request.js';
import { uploadPackage } from '../../api/projects.js';
import { getLanguage } from '../../domain/fileLang.js';
import ProjectZipUploader from '../../components/ProjectZipUploader.vue';

const props = defineProps({ mode: { type: String, default: 'teacher' } });
const isTeacher = computed(() => props.mode === 'teacher');
const isStudent = computed(() => props.mode === 'student');

const router = useRouter();
const route = useRoute();
const isEdit = computed(() => !!route.params.id);
const submitting = ref(false);
const hasUploaded = ref(false);
/** 上传过滤统计（"已过滤依赖，保留 X 个文件"，阶段二展示 + 成功 message） */
const uploadKeptCount = ref(0);
const uploadKeptBytes = ref(0);
const editorContainerRef = ref(null);
const showDescModal = ref(false);
const showRubricModal = ref(false);
// AI 提示词预览（编辑页模板，与实评共用构建函数）
const promptModalOpen = ref(false);
const promptLoading = ref(false);
const promptPreview = ref(null);
/** 开放性题目（无标准工程包）的 user prompt 不含标准答案源码段，标题随之区分（R6） */
const promptUserPartLabel = computed(() => (promptPreview.value?.mode === 'open' ? '开放性题目，无标准答案源码' : '含标准工程源码'));

async function showPromptPreview() {
  const id = route.params.id;
  if (!id) return;
  promptModalOpen.value = true;
  promptLoading.value = true;
  promptPreview.value = null;
  try {
    const r = await request.get('/teacher/questions/' + id + '/project-prompt-preview');
    promptPreview.value = r.data;
  } catch (e) {
    message.error('获取提示词失败：' + (e.response?.data?.message || e.message));
  } finally {
    promptLoading.value = false;
  }
}
// 模态框草稿（确定才写回 form，取消即还原）
const descDraft = ref('');
const rubricDraft = ref('');

function openDescModal() { descDraft.value = form.description; showDescModal.value = true; }
function openRubricModal() { rubricDraft.value = form.scoringRubric; showRubricModal.value = true; }
function confirmDesc() { form.description = descDraft.value; showDescModal.value = false; }
function confirmRubric() { form.scoringRubric = rubricDraft.value; showRubricModal.value = false; }

const activePath = ref('');
const fileContents = new Map();
/** 外部文件树（回看/提交后服务端返回），传给 ProjectZipUploader 显示 */
const externalTree = ref([]);
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

// 学生端只读渲染题目描述：教师 RichEditor 产出的 HTML 可能携带脚本，渲染前必须用 DOMPurify 净化
const safeDescriptionHtml = computed(() => {
  const html = form.description || '';
  if (!html) return '<p style="color:#999">暂无题目描述</p>';
  return DOMPurify.sanitize(html);
});

let monaco = null;
let editor = null;
let models = {};

// 释放所有 Monaco model 缓存，避免重新上传/重新提交后旧 model 内容残留
function resetModels() {
  if (editor && monaco) editor.setModel(null);
  Object.values(models).forEach(m => { try { m.dispose(); } catch { /* ignore */ } });
  models = {};
}

// zip 条目名智能解码：先 UTF-8 严格，失败（Windows GBK 包）回退 GBK
const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });
const GBK_DECODER = new TextDecoder('gbk');

/**
 * 本地 zip 解析（降级/内容预览用）：
 * 1) 解压全部条目（UTF-8 → GBK 智能解码文件名）
 * 2) 填 fileContents：所有文件内容，>1MB 不读内容、用占位字符串（控制内存）
 * 3) 返回全量文件树（教师上传失败时回退展示用）
 * 不再维护前端过滤清单（目录/扩展名黑名单已删除，避免与服务端双清单漂移），过滤以服务端为准
 */
// ===== Monaco =====

function registerExtraLanguages() {
  if (!monaco) return;
  monaco.languages.register({ id: 'scss', extensions: ['.scss'] });
  monaco.languages.register({ id: 'less', extensions: ['.less'] });
}

async function initMonaco() {
  if (monaco) return;
  // 旧浏览器（:where() 不可用即 Chrome < 88，或可选链不可用即 Chrome < 80）：
  // Monaco 0.55+ 产物无法解析，降级 0.24.0（判定与版本口径以 domain/browserCompat.js 为准）
  applyMonacoCompat(loader);
  monaco = await loader.init();
  registerExtraLanguages();
  editor = monaco.editor.create(editorContainerRef.value, {
    value: '', language: 'plaintext', readOnly: true,
    minimap: { enabled: true, maxColumn: 80 }, automaticLayout: true,
    fontSize: 13, fontFamily: 'MonacoDSH, monospace', lineNumbers: 'on', scrollBeyondLastLine: false,
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

// 代码预览切换动效（与教师审核页一致：0.15s 淡入上移，CSS animation 重放，不重建 Monaco 容器）
const fading = ref(true);
watch(activePath, () => {
  fading.value = false;
  nextTick(() => { fading.value = true; });
});

async function handleSave() {
  if (!form.title) return message.warn('请输入题目名称');
  const payload = { title: form.title, difficulty: form.difficulty, maxScore: form.maxScore, type: 'project', material: form.description, scoringRubric: form.scoringRubric };
  try {
    if (isEdit.value) {
      await request.put(`/teacher/questions/${route.params.id}`, payload);
      message.success('保存成功');
    } else {
      // 标准工程包可选：未上传即开放性题目（attachmentUrl 为 null），payload 不携带 tempId
      if (form.tempId) payload.tempId = form.tempId;
      await request.post('/teacher/questions', payload);
      message.success('创建成功');
    }
    router.push('/teacher/questions');
  } catch (e) {
    message.error('保存失败：' + (e.response?.data?.message || e.message));
  }
}

// ===== 上传组件回调（ProjectZipUploader） =====

/** 过滤完成：填充内容预览、教师立刻上传服务端拿 tempId、打开第一个文件 */
async function onZipReady({ tree, fileContents: fc, keptCount, keptBytes }) {
  // 重新选择文件时释放旧 Monaco model
  resetModels();
  fileContents.clear();
  fc.forEach((v, k) => fileContents.set(k, v));
  // 传给阶段二 sidebar 组件显示（外部树优先，picker 自动隐藏）
  externalTree.value = tree;
  // 记录过滤统计（上传/提交成功 message 用）
  uploadKeptCount.value = keptCount;
  uploadKeptBytes.value = keptBytes;
  hasUploaded.value = true;

  if (isTeacher.value && form.packageFile) {
    await teacherUpload(form.packageFile.blob, form.packageFile.name);
  }

  await nextTick();
  await new Promise(r => setTimeout(r, 300));
  if (editorContainerRef.value) await initMonaco();
  const first = findFirstFile(tree);
  if (first) openFile(first.path, first.name, first.language);
}

/** 点击树节点：打开 Monaco tab */
function onZipSelect({ path, name, language }) {
  openFile(path, name, language);
}

/** 教师上传过滤后的包到服务端（拿 tempId；上传动作由页面决定，组件不感知） */
async function teacherUpload(blob, name) {
  try {
    const formData = new FormData();
    formData.append('file', blob, name);
    const r = await uploadPackage(formData);
    form.tempId = r.data?.tempId || '';
    message.success(`上传成功（已过滤依赖），保留 ${uploadKeptCount.value} 个代码文件 ${(uploadKeptBytes.value / 1024).toFixed(0)}KB`);
  } catch (err) {
    form.tempId = '';
    message.error('上传失败：' + (err.response?.data?.message || err.message) + '（可重试上传；也可不上传，直接保存为开放性题目）');
  }
}

function findFirstFile(nodes) {
  for (const n of nodes || []) {
    if (n.type === 'file') return n;
    if (n.children?.length) {
      const f = findFirstFile(n.children);
      if (f) return f;
    }
  }
  return null;
}

// ===== 学生：提交答案 =====

async function handleSubmit() {
  if (!form.packageFile) return message.warn('请先上传项目文件');
  submitting.value = true;
  try {
    const formData = new FormData();
    // 上传前端过滤重打包后的纯代码 zip（依赖已在选择文件时剔除）
    formData.append('file', form.packageFile.blob, form.packageFile.name);

    // 学生端提交（T02）：写库 + 版本化 + 同步返回文件树，不触发 AI 评分（T03 负责）
    const r = await request.post(
      `/student/assignments/${assignmentId.value}/project/${questionId.value}/submit`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    const data = r.data;
    studentSubmission.value = data.submission;
    if (data.files?.tree) {
      // 新版本文件内容填充前先释放旧 model 缓存，避免展示旧内容
      resetModels();
      externalTree.value = data.files.tree;
      fileContents.clear();
      if (data.files.contents) Object.entries(data.files.contents).forEach(([p, c]) => fileContents.set(p, c));
      hasUploaded.value = true;
      await nextTick(); await new Promise(res => setTimeout(res, 300));
      if (editorContainerRef.value) await initMonaco();
      const first = findFirstFile(data.files.tree);
      if (first) openFile(first.path, first.name, first.language);
    }
    message.success(`提交成功（已过滤依赖），保留 ${uploadKeptCount.value} 个代码文件 ${(uploadKeptBytes.value / 1024).toFixed(0)}KB，已生成第 ${data.version ?? '新'} 个版本`);
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
          externalTree.value = treeRes.data.tree;
          if (treeRes.data?.contents) Object.entries(treeRes.data.contents).forEach(([p, c]) => fileContents.set(p, c));
          hasUploaded.value = true;
          await nextTick(); await new Promise(res => setTimeout(res, 300));
          if (editorContainerRef.value) await initMonaco();
          const first = findFirstFile(treeRes.data.tree);
          if (first) openFile(first.path, first.name, first.language);
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
        externalTree.value = q.files.tree;
        if (q.files.contents) Object.entries(q.files.contents).forEach(([p, c]) => fileContents.set(p, c));
        hasUploaded.value = true;
        await nextTick(); await new Promise(res => setTimeout(res, 300));
        if (editorContainerRef.value) await initMonaco();
        const first = findFirstFile(q.files.tree);
        if (first) openFile(first.path, first.name, first.language);
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
.picker-slot { flex:1; display:flex; flex-direction:column; min-height:0; }
/* 开放性实训题说明（仅教师视角）：居中灰字，不挤压上传入口 */
.open-project-hint { flex-shrink:0; margin:0 auto 20px; padding:0 24px; max-width:760px; font-size:13px; line-height:1.8; color:var(--ink-muted); text-align:center; }
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
.editor-body { flex:1; position:relative; display:flex; min-height:0; overflow:hidden; }
  .editor-container { flex:1; overflow:hidden; background:#fff; }
.editor-empty { position:absolute; top:0; right:0; bottom:0; left:0; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#bfbfbf; gap:12px; }
.editor-empty p { margin:0; }

.readonly-desc { padding: 12px; min-height: 200px; font-size: 14px; line-height: 1.8; }
.readonly-rubric { padding: 12px; min-height: 100px; font-size: 14px; line-height: 2; white-space: pre-wrap; }

/* AI 提示词预览 */
.prompt-block { margin-bottom: 12px; }
.prompt-role-label { font-size: 12px; font-weight: 600; color: #666; margin: 8px 0 4px; }
.prompt-pre {
  margin: 0; padding: 10px 12px;
  background: #f6f8fa; border: 1px solid #e8e8e8; border-radius: 6px;
  font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  max-height: 400px; overflow: auto;
}

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

/* ===== 代码预览切换动效（0.15s 淡入上移） ===== */
.pr-fade-in { animation: prFadeIn 0.15s ease; }
@keyframes prFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
</style>
