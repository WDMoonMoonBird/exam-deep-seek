/**
 * useEditorWorkspace.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B2，源行 228-231 / 374-378 / 432-442 / 455-521）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { ref, watch, nextTick } from 'vue';
import loader from '@monaco-editor/loader';
import { applyMonacoCompat } from '../../infrastructure/monaco/legacyLoaderCompat';
import { useMonacoTheme } from '../useMonacoTheme.js';
import { useMonacoKeyboardA11y } from '../useMonacoKeyboardA11y.js';
import { getLanguage } from '../../domain/fileLang.js';

export function useEditorWorkspace({ editorContainerRef }) {

/** 编辑器主题跟随应用主题：ensureTheme() 在 create 之前按当前令牌定义并返回主题名 */
const { ensureTheme } = useMonacoTheme();
/** 键盘可达性（QA T5-A5 同类缺陷补齐）：Tab/Shift+Tab 可离开编辑器 + 聚焦元素可读名称 */
const { attach: attachKeyboardA11y } = useMonacoKeyboardA11y();

const activePath = ref('');
const fileContents = new Map();
/** 外部文件树（回看/提交后服务端返回），传给 ProjectZipUploader 显示 */
const externalTree = ref([]);
const openTabs = ref([]);

let monaco = null;
let editor = null;
let models = {};
let keyboardA11y = null;

// 释放所有 Monaco model 缓存，避免重新上传/重新提交后旧 model 内容残留
function resetModels() {
  if (editor && monaco) editor.setModel(null);
  Object.values(models).forEach(m => { try { m.dispose(); } catch { /* ignore */ } });
  models = {};
}

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
  // Monaco 运行时本地化（R-1，说明见 components/CodeEditor.vue 同段注释）：vs/ 指向本站资产；
  // 放在 applyMonacoCompat 之前 → 旧内核仍切既有兼容版路径。
  loader.config({ paths: { vs: import.meta.env.BASE_URL + 'monaco/vs' } });
  applyMonacoCompat(loader);
  monaco = await loader.init();
  registerExtraLanguages();
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

/** 释放键盘可达性监听（源 :749，由 .vue 的 onBeforeUnmount 按原顺序集中调用；本文件不注册任何 hook） */
function disposeKeyboardA11y() {
  keyboardA11y?.dispose();
}

/** 释放全部 Monaco model 缓存（源 :751，顺序与源 onBeforeUnmount 一致） */
function disposeModels() {
  Object.values(models).forEach(m => m.dispose());
}

/** 释放编辑器实例（源 :752；源实现不做置空，此处同样不置空） */
function disposeEditor() {
  editor?.dispose();
}

  return {
    activePath, fileContents, externalTree, openTabs, fading,
    resetModels, initMonaco, openFile, switchTab, closeTab,
    disposeKeyboardA11y, disposeModels, disposeEditor,
  };
}

export default useEditorWorkspace;
