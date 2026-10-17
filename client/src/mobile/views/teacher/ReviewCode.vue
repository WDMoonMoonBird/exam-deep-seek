<script setup>
/**
 * 教师代码只读 + 选区 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6、05-page-specs 屏 23、09 §4 降级口径。
 * 数据：
 *   · GET /teacher/submissions/:id           通用题：学生作答 answer + 小题参考答案
 *   · GET /teacher/submissions/:id/project   实训题：studentFiles / standardFiles 文件树与正文
 * 无 Monaco、无新接口；长按/点按行选中后「引用到评语」带 quote 回到审核详情。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MEmpty, MIcon, MSeg, MSkeleton, MStatusTag } from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';

const MAX_TEXT = 200000;
const MAX_LINES = 3000;
const route = useRoute();
const router = useRouter();
const toast = useMobileToast();
const submissionId = computed(() => Number(route.params.submissionId));
const assignmentId = computed(() => {
  const n = Number(route.query.assignmentId);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
});
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherReviewCode.vue', action: '加载代码' });

const submission = ref(null);
const loading = ref(false);
const loadError = ref('');
const project = ref(null);
const projectLoading = ref(false);
const projectError = ref('');
const view = ref('student');
const activeFile = ref('');
const selectedLine = ref(-1);
const fontSize = ref(13);
const wrapLines = ref(false);
const copyNote = ref('');

const isProject = computed(() => !!submission.value && submission.value.question && submission.value.question.type === 'project');
const backTo = computed(() => {
  const query = assignmentId.value ? '?assignmentId=' + assignmentId.value : '';
  return '/m/teacher/review/' + submissionId.value + query;
});

function keysOf(contents) {
  if (!contents || typeof contents !== 'object') return [];
  return Object.keys(contents).filter((key) => typeof contents[key] === 'string').sort();
}

const treeOpen = ref(true);
const expandedDirs = ref({});

/** 当前查看对象（学生/标准）的文件树 + 内容；接口已返回 tree，缺失时按 contents 路径兜底生成 */
function filesOfCurrentView() {
  if (!isProject.value || !project.value) return null;
  return view.value === 'student' ? project.value.studentFiles : project.value.standardFiles;
}

function treeFromContents(contents) {
  const root = [];
  Object.keys(contents || {}).sort().forEach((filePath) => {
    const parts = String(filePath).split('/').filter(Boolean);
    if (!parts.length) return;
    let list = root;
    let current = '';
    parts.forEach((part, index) => {
      current = current ? current + '/' + part : part;
      const isFile = index === parts.length - 1;
      const type = isFile ? 'file' : 'directory';
      let node = list.find((item) => item.name === part && item.type === type);
      if (!node) {
        node = { name: part, type, path: current };
        if (!isFile) node.children = [];
        list.push(node);
      }
      if (!isFile) list = node.children;
    });
  });
  return sortTree(root);
}

function sortTree(nodes) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
  nodes.forEach((node) => { if (node.children) sortTree(node.children); });
  return nodes;
}

const currentTree = computed(() => {
  const files = filesOfCurrentView();
  if (!files) return [];
  const tree = Array.isArray(files.tree) ? files.tree : [];
  return tree.length ? tree : treeFromContents(files.contents);
});
const treeFileCount = computed(() => countFiles(currentTree.value));
const treeRows = computed(() => {
  const rows = [];
  flattenVisibleTree(currentTree.value, 0, rows);
  return rows;
});

function countFiles(nodes) {
  return (nodes || []).reduce((count, node) => {
    if (!node || node.type === 'directory') return count + countFiles(node && node.children);
    return count + 1;
  }, 0);
}

function expandAncestors(filePath, out) {
  const parts = String(filePath || '').split('/').filter(Boolean);
  let current = '';
  parts.slice(0, -1).forEach((part) => {
    current = current ? current + '/' + part : part;
    out[current] = true;
  });
}

function flattenVisibleTree(nodes, depth, out) {
  (nodes || []).forEach((node) => {
    if (!node) return;
    const isDir = node.type === 'directory';
    out.push({ name: node.name, path: node.path || node.name, depth, isDir });
    if (isDir && expandedDirs.value[node.path || node.name]) {
      flattenVisibleTree(node.children, depth + 1, out);
    }
  });
}

function prepareTree() {
  const next = {};
  expandAncestors(activeFile.value, next);
  if (!Object.keys(next).length) {
    const firstDir = (currentTree.value || []).find((node) => node.type === 'directory');
    if (firstDir) next[firstDir.path || firstDir.name] = true;
  }
  expandedDirs.value = next;
  treeOpen.value = true;
}

function toggleDir(path) {
  expandedDirs.value[path] = !expandedDirs.value[path];
}

const referenceText = computed(() => {
  if (!submission.value) return '';
  const sq = submission.value.subQuestion;
  if (sq && sq.referenceAnswer) return String(sq.referenceAnswer);
  const subs = (submission.value.question && submission.value.question.subQuestions) || [];
  const first = subs[0];
  return first && first.referenceAnswer ? String(first.referenceAnswer) : '';
});

const currentText = computed(() => {
  if (isProject.value) {
    const source = view.value === 'student'
      ? (project.value && project.value.studentFiles && project.value.studentFiles.contents)
      : (project.value && project.value.standardFiles && project.value.standardFiles.contents);
    if (!source || !activeFile.value) return '';
    return typeof source[activeFile.value] === 'string' ? source[activeFile.value] : '';
  }
  if (view.value === 'student') {
    return (submission.value && submission.value.answer) || '';
  }
  return referenceText.value;
});

const truncated = computed(() => currentText.value.length > MAX_TEXT);
const rawText = computed(() => (truncated.value ? currentText.value.slice(0, MAX_TEXT) : currentText.value));
const lines = computed(() => {
  if (!rawText.value) return [];
  const arr = rawText.value.split(/\r?\n/);
  return arr.length > MAX_LINES ? arr.slice(0, MAX_LINES) : arr;
});
const tooLarge = computed(() => truncated.value || rawText.value.split(/\r?\n/).length > MAX_LINES);
const emptyText = computed(() => !rawText.value.trim());
const selectedText = computed(() => {
  if (selectedLine.value < 0 || selectedLine.value >= lines.value.length) return '';
  return lines.value[selectedLine.value];
});

const viewOptions = computed(() => {
  if (isProject.value) {
    return [
      { label: '学生提交', value: 'student' },
      { label: '标准答案', value: 'standard' },
    ];
  }
  return [
    { label: '学生作答', value: 'student' },
    { label: '参考答案', value: 'standard' },
  ];
});

function currentFileMissing() {
  if (!isProject.value) return false;
  const source = view.value === 'student'
    ? (project.value && project.value.studentFiles && project.value.studentFiles.contents)
    : (project.value && project.value.standardFiles && project.value.standardFiles.contents);
  return !source || !source[activeFile.value];
}

function pickFirstFile() {
  if (!isProject.value) return;
  const source = view.value === 'student'
    ? (project.value && project.value.studentFiles && project.value.studentFiles.contents)
    : (project.value && project.value.standardFiles && project.value.standardFiles.contents);
  const keys = keysOf(source);
  if (keys.indexOf(activeFile.value) < 0) activeFile.value = keys.length ? keys[0] : '';
  selectedLine.value = -1;
}

function switchView(value) {
  view.value = value;
  pickFirstFile();
  prepareTree();
}

function onFileSelect(name) {
  activeFile.value = name;
  selectedLine.value = -1;
}

async function loadDetail() {
  loading.value = true;
  loadError.value = '';
  const r = await safeLoad(() => request.get('/teacher/submissions/' + submissionId.value));
  loading.value = false;
  if (r.error) {
    loadError.value = r.message || '提交详情加载失败';
    return;
  }
  submission.value = r.data || null;
  if (isProject.value) {
    await loadProject();
  } else {
    view.value = 'student';
  }
}

async function loadProject() {
  projectLoading.value = true;
  projectError.value = '';
  const r = await safeLoad(
    () => request.get('/teacher/submissions/' + submissionId.value + '/project'),
    { action: '加载实训题文件' }
  );
  projectLoading.value = false;
  if (r.error) {
    projectError.value = r.message || '工程包加载失败';
    return;
  }
  project.value = r.data || null;
  pickFirstFile();
  prepareTree();
}

function onCodeClick(event) {
  const target = event.target && event.target.closest ? event.target.closest('[data-line]') : null;
  if (!target) return;
  const index = Number(target.getAttribute('data-line'));
  if (!Number.isInteger(index) || index < 0) return;
  selectedLine.value = index;
}

function adjustFont(delta) {
  const next = fontSize.value + delta;
  if (next < 12 || next > 16) return;
  fontSize.value = next;
}

async function copyText(text) {
  if (!text) return false;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch { /* 回退旧接口 */ }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch { ok = false; }
  }
  return ok;
}

async function copyAll() {
  if (!lines.value.length) return;
  const ok = await copyText(rawText.value);
  copyNote.value = ok ? '已复制当前文件内容' : '复制失败，请长按选中文本复制';
  toast.show(copyNote.value);
}

async function copySelected() {
  if (!selectedText.value) return;
  const ok = await copyText(selectedText.value);
  toast.show(ok ? '已复制第 ' + (selectedLine.value + 1) + ' 行' : '复制失败，请手动选中');
}

function goUnsupported() {
  const query = { submissionId: String(submissionId.value) };
  if (assignmentId.value) query.assignmentId = assignmentId.value;
  router.push({ path: '/m/teacher/code/unsupported', query });
}

function quoteSelected() {
  if (!selectedText.value) {
    toast.show('请先点按一行代码选中');
    return;
  }
  const quote = '第 ' + (selectedLine.value + 1) + ' 行：' + selectedText.value.trim();
  const query = { quote };
  if (assignmentId.value) query.assignmentId = assignmentId.value;
  router.push({ path: '/m/teacher/review/' + submissionId.value, query });
}

onMounted(loadDetail);
</script>

<template>
  <MobileLayout role="" active="" bottom="actionbar">
    <MobileAppBar title="代码只读" back :back-to="backTo">
      <template #right>
        <MStatusTag v-if="isProject" type="accent">实训题</MStatusTag>
        <MStatusTag v-else type="info">编程题</MStatusTag>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <div v-if="loading" class="page mt8"><MSkeleton variant="card" :count="1" /></div>
      <div v-else-if="loadError" class="page mt8">
        <div class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ loadError }}<button type="button" class="banner-link" @click="loadDetail">重试</button></div>
        </div>
        <button type="button" class="btn btn--secondary btn--block mt16" @click="router.push(backTo)">返回审核详情</button>
      </div>

      <template v-else-if="submission">
        <div class="page mt8">
          <div class="seg-wrap">
            <MSeg v-model="view" :options="viewOptions" label="查看对象" @update:model-value="switchView" />
          </div>

          <div v-if="isProject && projectError" class="banner banner--danger mt12" role="alert">
            <MIcon name="alert" /><div>{{ projectError }}<button type="button" class="banner-link" @click="loadProject">重试</button></div>
          </div>

          <template v-if="!isProject || project">
            <div v-if="isProject && treeFileCount" class="file-tree-panel">
              <button type="button" class="file-tree-head" :aria-expanded="treeOpen" aria-label="文件目录" @click="treeOpen = !treeOpen">
                <MIcon name="folder" />
                <span>文件目录</span>
                <small>{{ treeFileCount }} 个文件</small>
                <MIcon name="chevron-right" class="tree-head-chev" :class="{ open: treeOpen }" />
              </button>
              <Transition name="m-collapse">
                <div v-if="treeOpen" class="file-tree-body" role="group" aria-label="工程文件树">
                  <button
                    v-for="row in treeRows"
                    :key="row.path"
                    type="button"
                    class="tree-row"
                    :class="{ 'is-dir': row.isDir, active: !row.isDir && activeFile === row.path }"
                    :style="{ paddingLeft: (10 + row.depth * 14) + 'px' }"
                    :aria-expanded="row.isDir ? !!expandedDirs[row.path] : undefined"
                    @click="row.isDir ? toggleDir(row.path) : onFileSelect(row.path)"
                  >
                    <MIcon :name="row.isDir ? 'folder' : 'file'" class="tree-ico" />
                    <span class="tree-name">{{ row.name }}</span>
                    <MIcon v-if="row.isDir" name="chevron-right" class="tree-chev" :class="{ open: !!expandedDirs[row.path] }" />
                  </button>
                </div>
              </Transition>
            </div>

            <div v-if="tooLarge" class="banner banner--warning mt12">
              <MIcon name="alert" /><div>文件较大，已截断显示前 {{ lines.length }} 行；完整内容请在电脑端查看。</div>
            </div>

            <MEmpty
              v-if="(isProject && !treeFileCount) || (isProject && currentFileMissing() && !projectLoading)"
              icon="folder"
              :title="view === 'standard' ? '没有标准答案文件' : '没有可展示的文件'"
              description="该实训题可能未上传标准工程包，或提交不含文本文件"
            />
            <MEmpty
              v-else-if="emptyText"
              icon="code"
              :title="view === 'standard' ? '没有参考答案' : '学生没有提交内容'"
              description="切换查看对象，或返回审核详情继续评分"
            />

            <template v-else>
              <div class="code-toolbar">
                <div class="row g8">
                  <button type="button" class="tool" aria-label="减小字号" @click="adjustFont(-1)">Aa−</button>
                  <button type="button" class="tool" aria-label="增大字号" @click="adjustFont(1)">Aa+</button>
                  <button type="button" class="tool" :aria-pressed="wrapLines" aria-label="切换自动换行" @click="wrapLines = !wrapLines">换行</button>
                  <button type="button" class="tool" aria-label="复制当前文件内容" @click="copyAll">复制</button>
                </div>
                <span class="tool-hint">{{ fontSize }}px</span>
              </div>

              <div class="code-wrap" :class="{ 'wrap-on': wrapLines }" :style="{ '--m-fs-code': fontSize + 'px' }">
                <div class="codebox">
                  <div class="codebar">
                    <div class="file">
                      <MIcon name="file" />
                      <span>{{ isProject ? (activeFile || '未选择文件') : (view === 'student' ? '学生作答' : '参考答案') }}</span>
                    </div>
                    <span>{{ lines.length }} 行</span>
                  </div>
                  <div
                    class="codebody"
                    role="group"
                    aria-label="只读代码，点按行可选中"
                    @click="onCodeClick"
                  >
                    <div
                      v-for="(line, index) in lines"
                      :key="index"
                      class="codeline"
                      :class="{ hl: selectedLine === index }"
                      :data-line="index"
                    >
                      <span class="ln" aria-hidden="true">{{ index + 1 }}</span>
                      <span class="code-text">{{ line || ' ' }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <p class="select-hint" role="status">
                <template v-if="selectedLine >= 0">已选中第 {{ selectedLine + 1 }} 行 · 可引用到教师评语</template>
                <template v-else>点按代码行选中，可复制或引用到评语；长行可左右滑动查看。</template>
              </p>

              <div class="quote-row">
                <button type="button" class="btn btn--sm btn--ghost" :disabled="selectedLine < 0" @click="copySelected">复制选中行</button>
              </div>

              <p class="readonly-tip mt12"><MIcon name="info" />手机端不提供代码编辑；如需修改标准答案，请在电脑端操作。</p>
              <button type="button" class="btn btn--sm btn--ghost btn--block mt8" @click="goUnsupported">查看电脑端编辑说明</button>
            </template>
          </template>
        </div>
      </template>
    </main>

    <div class="actionbar">
      <button type="button" class="btn btn--secondary" @click="router.push(backTo)">返回审核</button>
      <button type="button" class="btn btn--primary" :disabled="selectedLine < 0" @click="quoteSelected">引用选中行</button>
    </div>
  </MobileLayout>
</template>

<style scoped>
.seg-wrap { padding-top: 4px; }
.file-tree-panel { margin-top: 12px; border: 1px solid var(--border-default); border-radius: var(--m-radius-card-sm); background: var(--bg-surface); overflow: hidden; }
.file-tree-head { width: 100%; min-height: 44px; display: flex; align-items: center; padding: 0 12px; color: var(--text-secondary); font-size: 13px; font-weight: 500; text-align: left; }
.file-tree-head .icon { width: 17px; height: 17px; margin-right: 6px; color: var(--text-tertiary); }
.file-tree-head small { margin-left: auto; color: var(--text-tertiary); font-size: 12px; font-weight: 400; }
.tree-head-chev { width: 16px !important; height: 16px !important; margin-left: 4px; color: var(--text-tertiary) !important; transition: transform var(--m-duration-fast); }
.tree-head-chev.open { transform: rotate(90deg); }
.file-tree-body { max-height: 250px; overflow: auto; border-top: 1px solid var(--border-subtle); padding: 4px 0; }
.tree-row { display: flex; align-items: center; width: 100%; min-height: 40px; padding-right: 10px; text-align: left; color: var(--text-primary); font-size: 13px; }
.tree-row.is-dir { color: var(--text-secondary); }
.tree-row.active { background: var(--bg-active); color: var(--text-brand); }
.tree-ico { width: 16px !important; height: 16px !important; flex: none; margin-right: 6px; color: var(--text-tertiary) !important; }
.tree-row.is-dir .tree-ico { color: var(--status-warning-fg) !important; }
.tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-chev { width: 14px !important; height: 14px !important; flex: none; margin-left: 4px; color: var(--text-tertiary) !important; transition: transform var(--m-duration-fast); }
.tree-chev.open { transform: rotate(90deg); }
.code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}
.code-toolbar .tool {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12.5px;
}
.code-toolbar .tool::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 44px; transform: translateY(-50%); }
.tool-hint { font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.code-wrap { margin-top: 10px; }
.code-wrap .codebody { max-height: none; }
.code-wrap.wrap-on .codebody { overflow-x: hidden; }
.code-wrap.wrap-on .codeline { min-width: 0; white-space: pre-wrap; word-break: break-all; }
.code-wrap.wrap-on .code-text { white-space: pre-wrap; word-break: break-all; }
.code-text { white-space: pre; }
.codeline { cursor: pointer; }
.codeline:active { background: rgba(77, 155, 245, 0.1); }
.select-hint { margin-top: 10px; font-size: 12px; color: var(--text-tertiary); line-height: 1.5; }
.quote-row { display: flex; margin-top: 10px; }
</style>
