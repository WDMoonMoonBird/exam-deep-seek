<template>
  <div class="pr-page" v-if="loaded">
    <!-- 顶栏 -->
    <div class="pr-top">
      <a-button type="link" size="small" @click="$router.back()">← 返回</a-button>
      <h3 class="pr-title">{{ question.title }}</h3>
      <a-tag color="blue" size="small">实训题</a-tag>
      <span class="pr-student">{{ student.realName }} / {{ displayNo }}</span>
      <a-tag :color="statusColor">{{ statusText }}</a-tag>
    </div>

    <!-- 主体：VSCode 风格 IDE（左资源管理器 + 右多 tab 编辑器） -->
    <div class="pr-main">
      <div class="sidebar">
        <div class="sidebar-title">资源管理器</div>

        <!-- 双数据源切换：学生提交 / 标准答案包 -->
        <a-tabs v-model:activeKey="activeTree" size="small" class="pr-tree-tabs">
          <a-tab-pane key="student" tab="学生提交" />
          <a-tab-pane key="standard" tab="标准答案包" />
        </a-tabs>

        <Transition name="pr-fade" mode="out-in">
        <div class="file-tree" :key="activeTree">
          <a-tree
            v-if="fileTreeData.length"
            :tree-data="fileTreeData"
            :field-names="{ children: 'children', title: 'name', key: 'path' }"
            v-model:expandedKeys="defaultExpandedKeys"
            :selected-keys="activePath ? [activePath] : []"
            :show-icon="true"
            @select="onTreeSelect"
            @dblclick="onTreeDblclick"
          >
            <template #icon="{ type, path }">
              <FolderOutlined v-if="type === 'directory'" style="color:#dcb67a;font-size:14px;" />
              <span v-else class="tree-icon fiv-icon" :class="getClassWithColor(path || '')"></span>
            </template>
            <template #title="{ name, type }">
              <span :class="type === 'directory' ? 'tree-dir' : 'tree-file'">{{ name }}</span>
            </template>
          </a-tree>
          <a-empty
            v-else
            :description="activeTree === 'standard' ? '教师未上传标准包' : '无文件'"
            :image="false"
          />
        </div>
        </Transition>
      </div>

      <div class="editor-area">
        <div class="tab-bar" v-if="openTabs.length">
          <div
            v-for="tab in openTabs"
            :key="tab.path"
            :class="['tab', { active: activePath === tab.path }]"
            @click="switchTab(tab.path)"
          >
            <span class="tab-name">{{ tab.name }}</span>
            <span class="tab-close" @click.stop="closeTab(tab.path)">×</span>
          </div>
          <div class="tab-bar-fill"></div>
        </div>

        <div class="editor-body">
          <div class="editor-container" ref="editorContainerRef" :class="{ 'pr-fade-in': fading }"></div>
          <div v-if="!openTabs.length" class="pr-code-empty">
            <FileTextOutlined style="font-size:48px;color:#d9d9d9" />
            <p>从左侧选择文件查看代码</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部评分面板（方案A：AI 评语 + 教师评分/评语 + 审核） -->
    <div class="pr-panel">
      <div class="panel-header" @click="collapsed = !collapsed">
        <span class="panel-arrow" :class="{ open: !collapsed }">▸</span>
        <span class="panel-title">评分面板</span>
        <a-tag v-if="aiScore != null" color="green" size="small">AI {{ aiScore }} 分</a-tag>
        <a-tag v-if="gradingState === 'failed'" color="red" size="small">评分异常</a-tag>
        <a-tag v-if="status === 'reviewed'" color="blue" size="small">已审核</a-tag>
        <a-tag v-if="status === 'published'" color="green" size="small">已发布</a-tag>
        <span class="panel-toggle">{{ collapsed ? '展开' : '收起' }}</span>
      </div>

      <Transition name="panel-slide">
      <div class="panel-body" v-if="!collapsed">
        <!-- 左：AI 区（只读） -->
        <div class="ai-section">
          <div class="ai-head">
            <span class="ai-score-label">AI 评分</span>
            <span class="ai-score-num">{{ aiScore ?? '—' }}<span v-if="maxScore && aiScore != null"> / {{ maxScore }}</span></span>
            <a-tag v-if="gradingState === 'failed'" color="red">评分异常</a-tag>
            <a-tag v-else-if="status === 'submitted' && !aiResult" color="orange">评分中</a-tag>
            <a-button v-if="gradingState === 'failed'" size="small" danger :loading="regrading" @click.stop="onRegrade">重试评分</a-button>
          </div>

          <div v-if="aiResult" class="ai-block">
            <a-collapse v-if="aiResult.breakdown?.length" ghost size="small" class="ai-collapse">
              <a-collapse-panel :header="'分项明细（' + aiResult.breakdown.length + ' 项）'" key="breakdown">
                <div v-for="(b, i) in aiResult.breakdown" :key="i" class="bd-row">
                  <span class="bd-name">{{ b.item }}</span>
                  <span class="bd-score">{{ b.score }} / {{ b.maxScore }}</span>
                  <span class="bd-comment">{{ b.comment }}</span>
                </div>
              </a-collapse-panel>
            </a-collapse>

            <div v-if="aiResult.highlights?.length" class="hl-list">
              <div v-for="(h, i) in aiResult.highlights" :key="'h' + i" class="hl-item good">✓ {{ h }}</div>
            </div>
            <div v-if="aiResult.issues?.length" class="hl-list">
              <div v-for="(p, i) in aiResult.issues" :key="'p' + i" class="hl-item issue">△ {{ p }}</div>
            </div>

            <div v-if="aiResult.overallComment" class="ai-comment">
              <div class="ai-comment-text">{{ aiResult.overallComment }}</div>
              <a-button size="small" type="link" @click="quoteAiComment">引用到教师评语</a-button>
            </div>
          </div>

          <div v-else class="ai-empty">
            <a-empty
              :description="gradingState === 'failed' ? 'AI 评分异常，可点击上方「重试评分」' : '暂无 AI 评语（评分中或尚未完成，可人工评分）'"
              :image="false"
            />
          </div>
        </div>

        <!-- 右：教师区 -->
        <div class="teacher-section">
          <div class="t-row">
            <span class="t-label">最终分数</span>
            <a-input-number v-model:value="finalScore" :min="0" :max="maxScore" :step="1" style="width:110px" :disabled="locked" />
            <span class="t-max">满分 {{ maxScore }}</span>
          </div>
          <div class="t-row t-feedback">
            <span class="t-label">教师评语</span>
            <a-textarea
              v-model:value="teacherFeedback"
              :rows="3"
              placeholder="审核后对学生可见；AI 评语不会自动下发，可点左侧「引用到教师评语」"
              :disabled="locked"
            />
          </div>
          <div class="t-actions">
            <span class="t-hint">{{ locked ? '成绩已发布，不可修改' : (status === 'reviewed' ? '已审核，可修改后重新提交' : '审核通过后学生即可看到分数与评语') }}</span>
            <a-button type="primary" :loading="saving" :disabled="locked" @click="onApprove">{{ status === 'reviewed' ? '更新审核' : '审核通过' }}</a-button>
          </div>
        </div>
      </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { FileTextOutlined, FolderOutlined } from '@ant-design/icons-vue';
import loader from '@monaco-editor/loader';
import { getClassWithColor } from 'file-icons-js';
import 'file-icons-js/css/style.css';
import { getProjectReview, saveProjectReview, regradeProjectSubmission } from '../../api/projects.js';
import { getLanguage } from '../../domain/fileLang.js';

const route = useRoute();
const submissionId = +route.params.submissionId;

const loaded = ref(false);
const submission = ref({});
const question = ref({});
const student = ref({});
const version = ref(0);
const aiResult = ref(null);
const aiScore = computed(() => submission.value.aiScore ?? null);
const maxScore = ref(100);
const gradingState = ref('none');
const gradingError = ref('');
const finalScore = ref(null);
const teacherFeedback = ref('');
const collapsed = ref(false);
const saving = ref(false);
const regrading = ref(false);
const status = computed(() => submission.value.status || '');
const locked = computed(() => status.value === 'published');
const standardFiles = reactive({ tree: [], contents: {} });
const studentFiles = reactive({ tree: [], contents: {} });

// ===== IDE 状态（复用 ProjectQuestionEdit.vue） =====

const activeTree = ref('student'); // 'student' | 'standard'
const editorContainerRef = ref(null);
// 双数据源各自的 IDE 状态（2026-08-16 交互优化：切换源不丢选中/打开的文件）
// 必须 reactive：computed setter 写普通对象不会触发响应（ui-guard 复核发现）
const sourceState = reactive({
  student: { openTabs: [], activePath: '', expandedKeys: [] },
  standard: { openTabs: [], activePath: '', expandedKeys: [] },
});
// 内容缓存按源隔离（键含源前缀，与 Monaco model 隔离方式一致）
const fileContents = { student: new Map(), standard: new Map() };
const fileTreeData = ref([]);
// 当前源状态代理：模板与逻辑读写当前源，互不干扰
const curState = computed(() => sourceState[activeTree.value]);
const openTabs = computed({
  get: () => curState.value.openTabs,
  set: (v) => { curState.value.openTabs = v; },
});
const activePath = computed({
  get: () => curState.value.activePath,
  set: (v) => { curState.value.activePath = v; },
});
const defaultExpandedKeys = computed({
  get: () => curState.value.expandedKeys,
  set: (v) => { curState.value.expandedKeys = v; },
});
// 内容切换动效（CSS animation 重放：先移除类再添加，不重建 Monaco 容器）
const fading = ref(true);

let monaco = null;
let editor = null;
let models = {};

// ===== 顶栏展示 =====

const statusColor = computed(() => {
  const s = submission.value.status;
  if (s === 'published') return 'green';
  if (s === 'reviewed') return 'blue';
  if (s === 'ai_graded') return 'green';
  if (s === 'submitted') return 'orange';
  return 'default';
});
const statusText = computed(() => {
  const s = submission.value.status;
  return { submitted: '待评分', ai_graded: 'AI 已评分', reviewed: '已审核', published: '已发布' }[s] || s || '未知';
});
const displayNo = computed(() => {
  const no = student.value.username || '';
  const at = no.lastIndexOf('@');
  return at > 0 ? no.substring(0, at) : no;
});

// ===== Monaco =====

async function initMonaco() {
  if (monaco) return;
  monaco = await loader.init();
  editor = monaco.editor.create(editorContainerRef.value, {
    value: '', language: 'plaintext', readOnly: true,
    minimap: { enabled: true, maxColumn: 80 }, automaticLayout: true,
    fontSize: 13, fontFamily: 'MonacoDSH, monospace', lineNumbers: 'on', scrollBeyondLastLine: false,
    tabSize: 4, renderWhitespace: 'selection', smoothScrolling: true, cursorBlinking: 'smooth',
  });
}

/**
 * 按「数据源 + 相对路径」隔离 model：
 * 学生提交与标准答案包可能存在同名相对路径，URI 与缓存 key 均加源前缀，避免互相串味。
 */
function getOrCreateModel(path, language) {
  if (!monaco) return null;
  const cacheKey = `${activeTree.value}:${path}`;
  if (models[cacheKey]) return models[cacheKey];
  const uri = monaco.Uri.parse(`file:///${activeTree.value}/${path}`);
  const existing = monaco.editor.getModel(uri);
  if (existing) { models[cacheKey] = existing; return existing; }
  const newModel = monaco.editor.createModel((fileContents[activeTree.value]?.get(path)) || '', language || 'plaintext', uri);
  models[cacheKey] = newModel;
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

// ===== 数据源装载 =====

/** 收集全部目录节点 path，用于「全展开」（切源后仍生效） */
function collectDirKeys(nodes, acc = []) {
  for (const n of nodes || []) {
    if (n.type === 'directory') acc.push(n.path);
    if (n.children?.length) collectDirKeys(n.children, acc);
  }
  return acc;
}

/** 切换数据源：重灌树与内容缓存；保留各源 openTabs/选中状态，切回即恢复（2026-08-16 交互优化） */
function applySource(key) {
  const source = key === 'standard' ? standardFiles : studentFiles;
  // 只重建当前源的内容缓存，另一源不受影响
  fileContents[key] = new Map(Object.entries(source.contents || {}));
  fileTreeData.value = source.tree || [];
  // 展开目录按源恢复：首访（无记录）才全展开兜底，之后保留用户折叠状态
  const st = sourceState[key];
  if (!st.expandedKeys || st.expandedKeys.length === 0) {
    st.expandedKeys = collectDirKeys(source.tree || []);
  }
  defaultExpandedKeys.value = st.expandedKeys;
  // 恢复该源上次打开的文件（内容缓存已就位；Monaco 未就绪时安全跳过）
  if (st.activePath) {
    nextTick(() => switchTab(st.activePath));
  } else if (editor) {
    editor.setModel(null);
  }
}

watch(activeTree, (key) => { applySource(key); });

// 编辑器内容切换动效：切换文件/切源时重放淡入（不重建 Monaco DOM）
watch([activePath, activeTree], () => {
  fading.value = false;
  nextTick(() => { fading.value = true; });
});

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

// ===== 评分面板交互 =====

/** Q6 定案：一键引用 AI 评语到教师评语框（可删改后再审核） */
function quoteAiComment() {
  const text = aiResult.value?.overallComment;
  if (!text) return;
  teacherFeedback.value = teacherFeedback.value
    ? teacherFeedback.value + '\n\n【AI 评语】' + text
    : text;
  message.success('已引用 AI 评语，可编辑后审核');
}

/** 审核通过（R4：放分唯一开关，状态 reviewed 后学生端才可见分数） */
async function onApprove() {
  if (finalScore.value == null) {
    message.warning('请填写最终分数');
    return;
  }
  saving.value = true;
  try {
    await saveProjectReview(submissionId, {
      finalScore: finalScore.value,
      teacherFeedback: teacherFeedback.value,
    });
    submission.value = {
      ...submission.value,
      status: 'reviewed',
      finalScore: finalScore.value,
      teacherFeedback: teacherFeedback.value,
    };
    message.success('审核通过，学生已可见成绩');
  } catch (e) {
    message.error('保存失败：' + (e.response?.data?.message || e.message));
  } finally {
    saving.value = false;
  }
}

/** Q1 定案：评分异常时教师一键重评 */
async function onRegrade() {
  regrading.value = true;
  try {
    await regradeProjectSubmission(submissionId);
    gradingState.value = 'pending';
    message.success('已重新触发评分，稍后刷新查看结果');
  } catch (e) {
    message.error('重评失败：' + (e.response?.data?.message || e.message));
  } finally {
    regrading.value = false;
  }
}

async function fetchData() {
  try {
    const r = await getProjectReview(submissionId);
    const d = r.data;
    submission.value = d.submission || {};
    question.value = d.question || {};
    student.value = d.student || {};
    version.value = d.version || 0;
    maxScore.value = d.question?.maxScore ?? 100;
    aiResult.value = d.aiResult || null;
    gradingState.value = d.submission?.grading?.state || 'none';
    gradingError.value = d.submission?.grading?.error || '';
    finalScore.value = d.submission?.finalScore ?? d.submission?.aiScore ?? null;
    teacherFeedback.value = d.submission?.teacherFeedback || '';
    standardFiles.tree = d.standardFiles?.tree || [];
    standardFiles.contents = d.standardFiles?.contents || {};
    studentFiles.tree = d.studentFiles?.tree || [];
    studentFiles.contents = d.studentFiles?.contents || {};
    loaded.value = true;

    // 默认数据源 = 学生提交（activeTree 初值 'student'）
    applySource(activeTree.value);

    // 等 DOM 就绪再挂 Monaco
    await nextTick();
    await new Promise(res => setTimeout(res, 300));
    if (editorContainerRef.value) await initMonaco();

    // 第一眼看到学生答案：自动打开第一个文件
    const first = findFirstFile(studentFiles.tree);
    if (first) openFile(first.path, first.name);
  } catch (e) {
    message.error('加载失败：' + (e.response?.data?.message || e.message));
  }
}

onMounted(fetchData);

onBeforeUnmount(() => {
  Object.values(models).forEach(m => m.dispose());
  models = {};
  editor?.dispose();
});
</script>

<style scoped>
.pr-page { display:flex; flex-direction:column; height:calc(100vh - 52px); margin:-28px -48px -40px; background:#fff; }
.pr-top { display:flex; align-items:center; gap:12px; padding:10px 20px; background:#fff; border-bottom:1px solid #eee; flex-shrink:0; }
.pr-title { font-size:18px; font-weight:700; margin:0; }
.pr-student { font-size:13px; color:#888; flex:1; }

/* IDE 主体（形态取自 ProjectQuestionEdit.vue 的 .ide-body） */
.pr-main { flex:1; display:flex; min-height:0; overflow:hidden; border-top:1px solid #e0e0e0; }

.sidebar { width:260px; flex-shrink:0; background:#f3f3f3; border-right:1px solid #e0e0e0; display:flex; flex-direction:column; overflow:hidden; }
.sidebar-title { padding:10px 12px; font-size:11px; font-weight:600; text-transform:uppercase; color:#666; letter-spacing:.5px; flex-shrink:0; }

/* 数据源切换：只用 tab 头，内容区由下方统一的文件树承载 */
.pr-tree-tabs { flex-shrink:0; }
.pr-tree-tabs :deep(.ant-tabs-nav) { margin:0; padding:0 8px; }
.pr-tree-tabs :deep(.ant-tabs-content-holder) { display:none; }

.file-tree { flex:1; overflow:auto; padding:4px 0; }
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

/* editor-container 常驻挂载，空态以浮层覆盖，保证 Monaco 容器 ref 始终可用 */
.editor-body { flex:1; position:relative; display:flex; min-height:0; overflow:hidden; }
.editor-container { flex:1; overflow:hidden; background:#fff; }
.pr-code-empty { position:absolute; inset:0; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#bfbfbf; gap:12px; }
.pr-code-empty p { margin:0; }

/* ===== 底部评分面板（方案A） ===== */
.pr-panel { flex-shrink:0; background:#fbfbfb; border-top:1px solid #e0e0e0; display:flex; flex-direction:column; }
.panel-header { display:flex; align-items:center; gap:8px; padding:7px 16px; cursor:pointer; user-select:none; font-size:13px; color:#555; border-bottom:1px solid #f0f0f0; }
.panel-header:hover { background:#f4f4f4; }
.panel-arrow { font-size:10px; color:#999; transition:transform .2s ease; }
.panel-arrow.open { transform:rotate(90deg); }
.panel-title { font-weight:600; color:#333; }
.panel-toggle { margin-left:auto; font-size:12px; color:#aaa; }
.panel-body { display:flex; height:250px; overflow:hidden; }

/* 面板折叠/展开原生过渡（max-height 匹配 250px 面板高） */
.panel-slide-enter-active, .panel-slide-leave-active { transition: max-height .28s ease, opacity .28s ease; }
.panel-slide-enter-from, .panel-slide-leave-to { max-height:0; opacity:0; }
.panel-slide-enter-to, .panel-slide-leave-from { max-height:250px; opacity:1; }
.ai-section { flex:1; overflow:auto; padding:12px 16px; border-right:1px solid #f0f0f0; }
.teacher-section { width:460px; flex-shrink:0; padding:12px 16px; display:flex; flex-direction:column; gap:10px; overflow:auto; }

.ai-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.ai-score-label { font-size:12px; color:#888; }
.ai-score-num { font-size:22px; font-weight:700; color:#1677ff; }
.ai-collapse { margin-bottom:6px; }
.ai-collapse :deep(.ant-collapse-header) { padding:4px 0 !important; font-size:13px; color:#555; }
.bd-row { display:flex; gap:10px; font-size:12px; padding:3px 0; border-bottom:1px dashed #f0f0f0; }
.bd-name { flex:1; color:#333; }
.bd-score { color:#1677ff; font-weight:600; white-space:nowrap; }
.bd-comment { flex:2; color:#777; }
.hl-list { margin:4px 0; }
.hl-item { font-size:12.5px; padding:2px 0; color:#444; }
.hl-item.good { color:#389e0d; }
.hl-item.issue { color:#d46b08; }
.ai-comment { margin-top:8px; padding:8px 10px; background:#f5f7fa; border-radius:6px; border-left:3px solid #1677ff; }
.ai-comment-text { font-size:12.5px; line-height:1.7; color:#444; white-space:pre-wrap; }
.ai-empty { margin-top:12px; }

.t-row { display:flex; align-items:center; gap:8px; }
.t-label { font-size:13px; color:#555; width:56px; flex-shrink:0; }
.t-max { font-size:12px; color:#999; }
.t-feedback { align-items:flex-start; }
.t-actions { display:flex; align-items:center; gap:10px; margin-top:auto; padding-top:8px; }
.t-hint { flex:1; font-size:12px; color:#999; }

/* ===== 数据源/内容切换动效（2026-08-16 交互优化，0.15s 淡入上移） ===== */
.pr-fade-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.pr-fade-leave-active { transition: opacity 0.1s ease; }
.pr-fade-enter-from { opacity: 0; transform: translateY(6px); }
.pr-fade-leave-to { opacity: 0; }
.pr-fade-in { animation: prFadeIn 0.15s ease; }
@keyframes prFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
</style>
