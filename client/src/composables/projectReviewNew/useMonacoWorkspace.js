/**
 * useMonacoWorkspace.js —— 由 client/src/views/teacher/ProjectReviewNew.vue 拆分而来（R2-B64 / t4）
 * 职责：Monaco 实例与 model 的建/毁 + 双数据源（学生提交 / 标准答案包）各自的文件树与 tab 状态。
 * 源：:306-343（IDE 状态）、:365-440（initMonaco / getOrCreateModel / switchTab / closeTab / openFile / 树事件）、
 *     :442-490（collectDirKeys / applySource / 两个 watch / findFirstFile）、:667-677（卸载释放）。
 * 行为不变：model URI 前缀与缓存 key、展开状态按源恢复、切换动效重放、卸载释放顺序均逐字保持；
 *          数据源对象（standardFiles / studentFiles）由调用方（useProjectReviewPage）创建后注入，保持同一 reactive 实例。
 */
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import loader from '@monaco-editor/loader';
import { applyMonacoCompat } from '../../infrastructure/monaco/legacyLoaderCompat';
import { useMonacoTheme } from '../useMonacoTheme.js';
import { useMonacoKeyboardA11y } from '../useMonacoKeyboardA11y.js';
import { getLanguage } from '../../domain/fileLang.js';
import { collectDirKeys } from './projectReviewPure.js';

export function useMonacoWorkspace({ standardFiles, studentFiles }) {
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

  // 源 :667-677 —— 卸载释放（顺序逐字保持：keyboardA11y → models → editor）
  onBeforeUnmount(() => {
    keyboardA11y?.dispose();
    Object.values(models).forEach(m => m.dispose());
    models = {};
    editor?.dispose();
  });

  return {
    activeTree, editorContainerRef, fileTreeData, openTabs, activePath, defaultExpandedKeys, fading,
    initMonaco, openFile, switchTab, closeTab, onTreeSelect, onTreeDblclick, applySource,
  };
}
