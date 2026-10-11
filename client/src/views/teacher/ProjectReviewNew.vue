<template>
  <div class="pr-page wb-shell" v-if="loaded" :class="{ 'wb-drawer-open': panelOpen }">
    <!-- 顶栏：返回条 + 对象名 + 状态徽标（Workbench 壳） -->
    <div class="pr-top wb-top">
      <a-button type="link" size="small" @click="$router.back()">← 返回</a-button>
      <!-- B3-1 ⑤：标题层级与 Layout 的 h1 衔接（h1 → h2 → 页内 h3）：由 h3 提升为 h2，避免 axe heading-order；
         该类的字号/字重/margin 均已在 CSS 显式声明，标签变化不产生任何视觉差异。 -->
      <h2 class="pr-title">{{ question.title }}</h2>
      <StatusTag tone="brand" text="实训题" />
      <StatusTag tone="warning" text="BETA" />
      <span class="pr-student">{{ student.realName }} / {{ displayNo }}</span>
      <StatusTag :tone="statusTone" :text="statusText" dot />
    </div>

    <!-- 主体：VSCode 风格 IDE（左资源管理器 + 右多 tab 编辑器） -->
    <div class="pr-main wb-body">
      <div class="sidebar wb-left">
        <div class="sidebar-title">资源管理器</div>

        <!-- 双数据源切换：学生提交 / 标准答案包（开放性题目无标准包时不渲染后者，默认停留学生提交） -->
        <a-tabs v-model:activeKey="activeTree" size="small" class="pr-tree-tabs">
          <a-tab-pane key="student" tab="学生提交" />
          <a-tab-pane v-if="hasStandardFiles" key="standard" tab="标准答案包" />
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
              <FolderOutlined v-if="type === 'directory'" style="color:var(--status-warning-fg);font-size:var(--fs-body);" />
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

      <div class="editor-area wb-mid">
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
            <FileTextOutlined style="font-size:48px;color:var(--border-strong)" />
            <p>从左侧选择文件查看代码</p>
          </div>
        </div>
      </div>
      <!-- 右侧评分面板（Workbench 壳：≥1200px 常驻右栏；<1200px 抽屉化） -->
      <aside class="wb-right pr-panel" :class="{ 'is-collapsed': collapsed, open: panelOpen }" aria-label="评分面板">
      <div
        class="panel-header"
        role="button"
        tabindex="0"
        :aria-expanded="collapsed ? 'false' : 'true'"
        aria-controls="pr-score-panel"
        @mousedown.prevent
        @click="collapsed = !collapsed"
        @keydown.enter.prevent="collapsed = !collapsed"
        @keydown.space.prevent="collapsed = !collapsed"
      >
        <span class="panel-arrow" :class="{ open: !collapsed }">▸</span>
        <span class="panel-title">评分面板</span>
        <!-- T4-F2 类别收口：antd green 预置色亮 3.37:1 不达 AA → 走令牌语义类；
             red 实测亮 5.07 / 暗 4.54、blue 亮 5.50 / 暗 4.91 均达标，保持预置色不动。 -->
        <a-tag v-if="aiScore != null" class="tag-success" size="small">AI {{ aiScore }} 分</a-tag>
        <a-tag v-if="gradingState === 'failed'" color="red" size="small">评分异常</a-tag>
        <a-tag v-if="status === 'reviewed'" color="blue" size="small">已审核</a-tag>
        <a-tag v-if="status === 'published'" class="tag-success" size="small">已发布</a-tag>
        <span class="panel-toggle">{{ collapsed ? '展开' : '收起' }}</span>
      </div>

      <Transition name="panel-slide">
      <div class="panel-body" v-show="!collapsed" id="pr-score-panel">
        <!-- 左：AI 区（只读） -->
        <div class="ai-section">
          <div class="ai-head">
            <span class="ai-score-label">AI 评分</span>
            <span class="ai-score-num">{{ aiScore ?? '—' }}<span v-if="maxScore && aiScore != null"> / {{ maxScore }}</span></span>
            <a-tag v-if="gradingState === 'failed'" color="red">评分异常</a-tag>
            <a-tag v-else-if="status === 'submitted' && !aiResult" class="tag-warning">评分中</a-tag>
            <a-popconfirm
              v-if="gradingState === 'failed'"
              title="将重新调用 AI 评分，完成后自动刷新"
              ok-text="重试"
              cancel-text="取消"
              @confirm="onRegrade"
            >
              <a-button size="small" danger :loading="regrading">重试评分</a-button>
            </a-popconfirm>
            <a-popconfirm
              v-else
              title="将重新调用 AI 评分并覆盖 AI 分（最终分保留），完成后自动刷新"
              ok-text="重新评分"
              cancel-text="取消"
              @confirm="onRegrade"
            >
              <a-button size="small" :loading="regrading">重新评分</a-button>
            </a-popconfirm>
            <a-button size="small" style="margin-left:auto;" @click="showPrompt">查看提示词</a-button>
          </div>

          <div v-if="aiResult" class="ai-block">
            <a-collapse v-if="aiResult.breakdown?.length" ghost size="small" class="ai-collapse">
              <a-collapse-panel :header="'评分标准（' + aiResult.breakdown.length + ' 项）'" key="breakdown">
                <div v-for="(b, i) in aiResult.breakdown" :key="i" class="bd-row">
                  <span class="bd-name">{{ b.item }}</span>
                  <a-tag v-if="b.kind === 'checker'" color="blue" size="small" style="font-size:10px;">检查</a-tag>
                  <!-- 合并带回了分支的 antd 预置橙（亮色 3.34:1 不达 AA）→ 改用我方语义类 .tag-warning（亮 5.20 / 暗 9.45）；blue 实测 5.50/4.91 达标故保留原样 -->
                  <a-tag v-else-if="b.kind === 'ai'" class="tag-warning" size="small" style="font-size:10px;">主观</a-tag>
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
      </aside>
    </div>

    <button v-if="narrow" type="button" class="wb-drawer-toggle" @click="panelOpen = !panelOpen">
      {{ panelOpen ? '收起评分面板' : '评分面板' }}
    </button>
  </div>

  <!-- AI 提示词（该次评分的实际提示词，含学生工程源码） -->
  <a-modal v-model:open="promptModalOpen" title="AI 提示词（与实评一致，含学生工程源码）" :footer="null" :width="820">
    <a-spin :spinning="promptLoading">
      <template v-if="promptData">
        <div class="prompt-block">
          <div class="prompt-role-label">System（角色设定）</div>
          <pre class="prompt-pre">{{ promptData.system }}</pre>
          <div class="prompt-role-label">User（评分任务，含标准工程与学生提交源码）</div>
          <pre class="prompt-pre">{{ promptData.user }}</pre>
        </div>
      </template>
      <a-empty v-else-if="!promptLoading" description="暂无数据" :image="false" />
    </a-spin>
  </a-modal>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { FileTextOutlined, FolderOutlined } from '@ant-design/icons-vue';
import loader from '@monaco-editor/loader';
import { applyMonacoCompat } from '../../infrastructure/monaco/legacyLoaderCompat';
import { useMonacoTheme } from '../../composables/useMonacoTheme.js';
import { useMonacoKeyboardA11y } from '../../composables/useMonacoKeyboardA11y.js';
import { getClassWithColor } from 'file-icons-js';
import 'file-icons-js/css/style.css';
import { getProjectReview, saveProjectReview, regradeProjectSubmission } from '../../api/projects.js';
import request from '../../api/request.js';
import { getLanguage } from '../../domain/fileLang.js';
import StatusTag from '../../components/StatusTag.vue';

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

/** Workbench 壳：<1200px 时右栏评分面板抽屉化（纯布局，不改任何交互与请求） */
const narrow = ref(false);
const panelOpen = ref(false);
let shellMq = null;
function onShellMq(e) { narrow.value = e.matches; if (!e.matches) panelOpen.value = false; }

/** a-tag 配色 → StatusTag tone（与 statusColor 一一对应，状态判断未改） */
const STATUS_TONE = { blue: 'brand', green: 'success', orange: 'warning', red: 'danger', default: 'neutral' };
const statusTone = computed(() => STATUS_TONE[statusColor.value] || 'neutral');
const saving = ref(false);
const regrading = ref(false);
const status = computed(() => submission.value.status || '');
const locked = computed(() => status.value === 'published');
const standardFiles = reactive({ tree: [], contents: {} });
const studentFiles = reactive({ tree: [], contents: {} });
/** 有无标准答案包（tree 与 contents 均空 = 开放性题目）：无包不渲染「标准答案包」tab，不改变有包时的三栏布局 */
const hasStandardFiles = computed(() => (standardFiles.tree?.length || 0) > 0
  || Object.keys(standardFiles.contents || {}).length > 0);

// ===== IDE 状态（复用 ProjectQuestionEdit.vue） =====

const activeTree = ref('student'); // 'student' | 'standard'
const editorContainerRef = ref(null);
/** 编辑器主题跟随应用主题：ensureTheme() 在 create 之前按当前令牌定义并返回主题名 */
const { ensureTheme } = useMonacoTheme();
/** 键盘可达性（QA T5-A5 同类缺陷补齐）：Tab/Shift+Tab 可离开编辑器 + 聚焦元素可读名称 */
const { attach: attachKeyboardA11y } = useMonacoKeyboardA11y();
// 双数据源各自的 IDE 状态（切换源不丢选中/打开的文件）
// 必须 reactive：computed setter 写普通对象不会触发响应
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
let keyboardA11y = null;

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
  // 旧浏览器（:where() 不可用即 Chrome < 88，或可选链不可用即 Chrome < 80）：
  // Monaco 0.55+ 产物无法解析，降级 0.24.0（判定与版本口径以 domain/browserCompat.js 为准）
  // Monaco 运行时本地化（R-1，说明见 components/CodeEditor.vue 同段注释）：vs/ 指向本站资产；
  // 放在 applyMonacoCompat 之前 → 旧内核仍切既有兼容版路径。
  loader.config({ paths: { vs: import.meta.env.BASE_URL + 'monaco/vs' } });
  applyMonacoCompat(loader);
  monaco = await loader.init();
  editor = monaco.editor.create(editorContainerRef.value, {
    value: '', language: 'plaintext', readOnly: true,
    theme: ensureTheme(monaco),
    minimap: { enabled: true, maxColumn: 80 }, automaticLayout: true,
    fontSize: 13, fontFamily: 'MonacoDSH, monospace', lineNumbers: 'on', scrollBeyondLastLine: false,
    tabSize: 4, renderWhitespace: 'selection', smoothScrolling: true, cursorBlinking: 'smooth',
  });
  // 键盘逃逸（Tab / Shift+Tab）+ 聚焦元素可读名称；本实例是只读代码预览，缩进等写操作
  // 由 Monaco 的 writable 前置条件禁用（名称里已注明「内容只读 / 缩进不生效」）
  keyboardA11y = attachKeyboardA11y(editor, editorContainerRef.value, { readOnly: true });
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

/** 切换数据源：重灌树与内容缓存；保留各源 openTabs/选中状态，切回即恢复 */
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

/** 一键引用 AI 评语到教师评语框（可删改后再审核） */
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

// ===== AI 提示词查看（该次评分的实际提示词，含学生源码） =====
const promptModalOpen = ref(false);
const promptLoading = ref(false);
const promptData = ref(null);

async function showPrompt() {
  promptModalOpen.value = true;
  promptLoading.value = true;
  promptData.value = null;
  try {
    const r = await request.get('/teacher/submissions/' + submissionId + '/project/prompt');
    promptData.value = r.data;
  } catch (e) {
    message.error('获取提示词失败：' + (e.response?.data?.message || e.message));
  } finally {
    promptLoading.value = false;
  }
}

/** 重新评分（与编程题对齐）：任意状态可触发；
 * 请求期间（含后台评分期间）按钮保持 loading 防连点，评分完成后恢复，可无限次点击 */
async function onRegrade() {
  if (regrading.value) return; // 防连点
  regrading.value = true;
  try {
    await regradeProjectSubmission(submissionId);
    gradingState.value = 'pending';
    message.success('已重新触发评分，完成后自动刷新');
    startPolling();
  } catch (e) {
    regrading.value = false; // 接口失败立即恢复
    message.error('重评失败：' + (e.response?.data?.message || e.message));
  }
  // 成功时保持 loading，直到轮询到评分完成/失败/超时才恢复
}

// ===== 重评轮询：评分完成后自动刷新，无需手动刷新 =====

let pollTimer = null;
let pollCount = 0;
const POLL_INTERVAL = 5000; // 5s
const POLL_MAX = 72;        // 最长 6 分钟

function startPolling() {
  stopPolling();
  pollCount = 0;
  pollTimer = setInterval(async () => {
    pollCount += 1;
    if (pollCount > POLL_MAX) {
      stopPolling();
      regrading.value = false; // 超时恢复按钮
      message.warning('重新评分等待超时，请手动刷新查看');
      return;
    }
    try {
      const r = await getProjectReview(submissionId);
      const gs = r.data.submission?.grading?.state || 'none';
      if (gs !== 'pending') {
        stopPolling();
        applyReviewData(r.data);
        regrading.value = false; // 评分完成，恢复按钮（可再次点击）
        if (gs === 'failed') {
          message.error('重新评分失败：' + (r.data.submission?.grading?.error || '未知错误'));
        } else {
          message.success('重新评分完成');
        }
      }
    } catch { /* 单次轮询失败忽略，下轮继续 */ }
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** 应用审核数据（fetchData 与重评轮询共用；不重建 Monaco） */
function applyReviewData(d) {
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
  // 无标准包（开放性题目）：不逗留在已隐藏的「标准答案包」数据源，回落到学生提交
  if (!hasStandardFiles.value && activeTree.value === 'standard') activeTree.value = 'student';
  studentFiles.tree = d.studentFiles?.tree || [];
  studentFiles.contents = d.studentFiles?.contents || {};
  loaded.value = true;
}

async function fetchData() {
  try {
    const r = await getProjectReview(submissionId);
    applyReviewData(r.data);

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

onMounted(() => {
  fetchData();
  shellMq = window.matchMedia('(max-width: 1199px)');
  narrow.value = shellMq.matches;
  if (shellMq.addEventListener) shellMq.addEventListener('change', onShellMq);
  else shellMq.addListener(onShellMq);
});

onBeforeUnmount(() => {
  if (shellMq) {
    if (shellMq.removeEventListener) shellMq.removeEventListener('change', onShellMq);
    else shellMq.removeListener(onShellMq);
  }
  stopPolling();
  keyboardA11y?.dispose();
  Object.values(models).forEach(m => m.dispose());
  models = {};
  editor?.dispose();
});
</script>

<style scoped>
.pr-page { display:flex; flex-direction:column; height:calc(100vh - 52px); margin:-28px -48px -40px; background:var(--bg-surface); }
.pr-top { display:flex; align-items:center; gap:12px; padding:10px 20px; background:var(--bg-surface); border-bottom:1px solid var(--border-subtle); flex-shrink:0; }
.pr-title { font-size:var(--fs-title-2); font-weight:700; margin:0; }
.pr-student { font-size:var(--fs-body-sm); color:var(--text-tertiary); flex:1; }

/* IDE 主体（形态取自 ProjectQuestionEdit.vue 的 .ide-body） */
.pr-main { flex:1; display:flex; min-height:0; overflow:hidden; border-top:1px solid var(--border-strong); }

.sidebar { width:260px; flex-shrink:0; background:var(--bg-sunken); border-right:1px solid var(--border-strong); display:flex; flex-direction:column; overflow:hidden; }
.sidebar-title { padding:10px 12px; font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); letter-spacing:.5px; flex-shrink:0; }

/* 数据源切换：只用 tab 头，内容区由下方统一的文件树承载 */
.pr-tree-tabs { flex-shrink:0; }
.pr-tree-tabs :deep(.ant-tabs-nav) { margin:0; padding:0 8px; }
.pr-tree-tabs :deep(.ant-tabs-content-holder) { display:none; }

.file-tree { flex:1; overflow:auto; padding:4px 0; }
.file-tree :deep(.ant-tree) { background:transparent; font-size:var(--fs-body-sm); }
.file-tree :deep(.ant-tree-treenode) { padding:1px 0; white-space:nowrap; }
.file-tree :deep(.ant-tree-node-content-wrapper) { padding:0 6px 0 2px; overflow:hidden; text-overflow:ellipsis; }
.file-tree :deep(.ant-tree-node-content-wrapper:hover) { background:var(--bg-hover); }
.file-tree :deep(.ant-tree-node-content-wrapper.ant-tree-node-selected) { background:var(--bg-active); }
.tree-icon { font-size:var(--fs-body); width:16px; text-align:center; display:inline-block; flex-shrink:0; }
.tree-dir { font-weight:500; }
.tree-file { font-weight:400; }

.editor-area { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
.tab-bar { display:flex; background:var(--bg-sunken); flex-shrink:0; min-height:35px; height:35px; align-items:flex-end; overflow-x:auto; overflow-y:hidden; }
.tab { display:flex; align-items:center; padding:7px 12px; font-size:var(--fs-caption); cursor:pointer; border-right:1px solid var(--border-strong); background:var(--bg-sunken); white-space:nowrap; min-width:80px; max-width:160px; flex-shrink:0; }
.tab.active { background:var(--bg-surface); border-bottom:2px solid var(--bg-surface); margin-bottom:-2px; }
.tab:hover:not(.active) { background:var(--border-strong); }
.tab-name { flex:1; overflow:hidden; text-overflow:ellipsis; font-size:var(--fs-caption); }
.tab-close { margin-left:6px; font-size:var(--fs-body); color:var(--text-tertiary); line-height:1; }
.tab-close:hover { color:var(--text-primary); }
.tab-bar-fill { flex:1; background:var(--bg-sunken); border-bottom:2px solid var(--bg-sunken); height:35px; }

/* editor-container 常驻挂载，空态以浮层覆盖，保证 Monaco 容器 ref 始终可用 */
.editor-body { flex:1; position:relative; display:flex; min-height:0; overflow:hidden; }
.editor-container { flex:1; overflow:hidden; background:var(--bg-surface); }
.pr-code-empty { position:absolute; top:0; right:0; bottom:0; left:0; background:var(--bg-surface); display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-disabled); gap:12px; }
.pr-code-empty p { margin:0; }

/* ===== 底部评分面板（方案A） ===== */
.pr-panel { flex-shrink:0; background:var(--bg-surface-2); border-top:1px solid var(--border-strong); display:flex; flex-direction:column; }
.panel-header { display:flex; align-items:center; gap:8px; padding:7px 16px; cursor:pointer; user-select:none; font-size:var(--fs-body-sm); color:var(--text-secondary); border-bottom:1px solid var(--border-subtle); }
.panel-header:hover { background:var(--bg-sunken); }
.panel-arrow { font-size:10px; color:var(--text-tertiary); transition:transform var(--duration-base) ease; }
.panel-arrow.open { transform:rotate(90deg); }
.panel-title { font-weight:600; color:var(--text-primary); }
.panel-toggle { margin-left:auto; font-size:var(--fs-caption); color:var(--text-tertiary); }
.panel-body { display:flex; height:250px; overflow:hidden; }

/* 面板折叠/展开原生过渡（max-height 匹配 250px 面板高） */
.panel-slide-enter-active, .panel-slide-leave-active { transition: max-height var(--duration-slow) ease, opacity var(--duration-slow) ease; }
.panel-slide-enter-from, .panel-slide-leave-to { max-height:0; opacity:0; }
.panel-slide-enter-to, .panel-slide-leave-from { max-height:250px; opacity:1; }
.ai-section { flex:1; overflow:auto; padding:12px 16px; border-right:1px solid var(--border-subtle); }
.teacher-section { width:460px; flex-shrink:0; padding:12px 16px; display:flex; flex-direction:column; gap:10px; overflow:auto; }

.ai-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
/* AI 提示词预览 */
.prompt-block { margin-bottom: 12px; }
.prompt-role-label { font-size:var(--fs-caption); font-weight: 600; color: var(--text-secondary); margin: 8px 0 4px; }
.prompt-pre {
  margin: 0; padding: 10px 12px;
  background: var(--bg-sunken); border: 1px solid var(--border-default); border-radius:var(--radius-sm);
  font-size:var(--fs-caption); line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  max-height: 400px; overflow: auto;
}
.ai-score-label { font-size:var(--fs-caption); color:var(--text-tertiary); }
.ai-score-num { font-size:var(--fs-title-1); font-weight:700; color:var(--text-brand); }
.ai-collapse { margin-bottom:6px; }
.ai-collapse :deep(.ant-collapse-item > .ant-collapse-header) { padding:4px 0; font-size:var(--fs-body-sm); color:var(--text-secondary); }
.bd-row { display:flex; gap:10px; font-size:var(--fs-caption); padding:3px 0; border-bottom:1px dashed var(--border-subtle); }
.bd-name { flex:1; color:var(--text-primary); }
.bd-score { color:var(--text-brand); font-weight:600; white-space:nowrap; }
.bd-comment { flex:2; color:var(--text-secondary); }
.hl-list { margin:4px 0; }
.hl-item { font-size:12.5px; padding:2px 0; color:var(--text-primary); }
.hl-item.good { color:var(--status-success-fg); }
.hl-item.issue { color:var(--status-warning-fg); }
.ai-comment { margin-top:8px; padding:8px 10px; background:var(--bg-surface-2); border-radius:var(--radius-sm); border-left:3px solid var(--brand-600); }
.ai-comment-text { font-size:12.5px; line-height:1.7; color:var(--text-primary); white-space:pre-wrap; }
.ai-empty { margin-top:12px; }

.t-row { display:flex; align-items:center; gap:8px; }
.t-label { font-size:var(--fs-body-sm); color:var(--text-secondary); width:56px; flex-shrink:0; }
.t-max { font-size:var(--fs-caption); color:var(--text-tertiary); }
.t-feedback { align-items:flex-start; }
.t-actions { display:flex; align-items:center; gap:10px; margin-top:auto; padding-top:8px; }
.t-hint { flex:1; font-size:var(--fs-caption); color:var(--text-tertiary); }

/* ===== 数据源/内容切换动效（0.15s 淡入上移） ===== */
.pr-fade-enter-active { transition: opacity var(--duration-fast) ease, transform var(--duration-fast) ease; }
.pr-fade-leave-active { transition: opacity var(--duration-instant) ease; }
.pr-fade-enter-from { opacity: 0; transform: translateY(6px); }
.pr-fade-leave-to { opacity: 0; }
.pr-fade-in { animation: prFadeIn var(--duration-fast) ease; }
@keyframes prFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
/* ===== Workbench 壳（Wave 3 / 05-page-specs T3）：≥1200px 三栏，<1200px 右栏抽屉 ===== */
.wb-shell { position: relative; }
.wb-body { align-items: stretch; }
.wb-left { flex: 0 0 260px; }
.wb-mid { flex: 1 1 auto; min-width: 0; }
.wb-right {
  flex: 0 0 384px; width: 384px; min-width: 0;
  transition: flex-basis var(--duration-base) var(--ease-out), width var(--duration-base) var(--ease-out);
  background: var(--bg-surface);
  border-top: none; border-left: 1px solid var(--border-default);
  overflow: hidden;
}
/* 折叠：右栏收成 44px 竖条把空间让给查看器（等价于原来「折叠把高度让给查看器」） */
.wb-right.is-collapsed { flex: 0 0 44px; width: 44px; }
.wb-right.is-collapsed .panel-header { flex-direction: column; align-items: center; padding: 10px 6px; }
.wb-right.is-collapsed .panel-header .ant-tag,
.wb-right.is-collapsed .panel-header .panel-title,
.wb-right.is-collapsed .panel-header .panel-toggle { display: none; }
/* 折叠/展开：Vue Transition（.panel-slide-*）+ 列宽过渡，时长与缓动走令牌 */
.panel-slide-enter-active, .panel-slide-leave-active { transition: opacity var(--duration-base) var(--ease-out); }
.panel-slide-enter-from, .panel-slide-leave-to { opacity: 0; }
.panel-header:focus { outline: none; box-shadow: var(--ring-focus); }
/* 384px 栏宽内竖排（纯布局，不改任何交互与请求） */
.wb-right .panel-body { flex: 1; min-height: 0; height: auto; flex-direction: column; overflow-y: auto; }
.wb-right .ai-section { flex: 0 0 auto; width: 100%; border-right: none; border-bottom: 1px solid var(--border-subtle); }
.wb-right .teacher-section { flex: 1 0 auto; width: 100%; }
.wb-drawer-toggle { display: none; }
@media (max-width: 1199px) {
  .wb-right {
    position: fixed; top: var(--layout-topbar-h); right: 0; bottom: 0;
    flex: none; width: 384px; max-width: 92vw; z-index: var(--z-drawer);
    transform: translateX(100%);
    transition: transform var(--duration-base) var(--ease-out);
    box-shadow: var(--shadow-lg);
  }
  .wb-right.open { transform: translateX(0); }
  .wb-right.is-collapsed { flex: none; width: 384px; }
  .wb-right.is-collapsed .panel-header { flex-direction: row; align-items: center; padding: 7px 16px; }
  .wb-right.is-collapsed .panel-header .ant-tag,
  .wb-right.is-collapsed .panel-header .panel-title,
  .wb-right.is-collapsed .panel-header .panel-toggle { display: inline-flex; }
  .wb-drawer-toggle {
    display: inline-flex; align-items: center; gap: var(--space-1);
    position: fixed; right: var(--space-4); bottom: var(--space-4); z-index: var(--z-sticky);
    height: var(--control-h-lg); padding: 0 var(--space-4);
    background: var(--btn-primary-bg); color: var(--btn-primary-fg);
    border: none; border-radius: var(--radius-pill); cursor: pointer;
    font-size: var(--fs-body); box-shadow: var(--shadow-md);
  }
}
</style>
