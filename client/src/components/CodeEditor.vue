<template>
  <!--
    role="group" + aria-label：编辑器容器的可访问名称（QA T5-A5 修复的一部分）。
    真正承载键盘焦点的是 Monaco 内部生成的 .native-edit-context（role=textbox），
    它的名字由 create() 的 ariaLabel 选项给出（见下方 editorA11yLabel）。
  -->
  <div
    ref="rootRef"
    class="code-editor-wrap"
    role="group"
    :aria-label="groupA11yLabel"
    @keydown.capture="onKeydownCapture"
  >
    <div ref="editorRef" class="code-editor" :style="height ? { height: height + 'px' } : {}"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import loader from '@monaco-editor/loader';
import { applyMonacoCompat } from '../infrastructure/monaco/legacyLoaderCompat';
import { useMonacoTheme } from '../composables/useMonacoTheme.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'cpp' },
  readOnly: { type: Boolean, default: false },
  height: { type: Number, default: 400 },
  /** 字号 / 字体族：Wave 3 追加的可选接口，默认值与既有硬编码取值一致（不传即与改前完全相同） */
  fontSize: { type: Number, default: 14 },
  fontFamily: { type: String, default: 'MonacoDSH, monospace' },
});

const emit = defineEmits(['update:modelValue']);

const editorRef = ref(null);
const rootRef = ref(null);
let editor = null;
let subscription = null;
let monaco = null;

/* ===========================================================================
 * 键盘可达性（既有缺陷 QA T5-A5，2026-10-10 修复）—— 文档化的逃逸按键
 * ---------------------------------------------------------------------------
 * 缺陷（T5/T7/T8 实证）：Monaco 默认把 Tab 当作缩进键，键盘用户第 8 次 Tab 进入
 * 编辑器后**无法离开**（33 步 / 第二次 60 步仍未逃出），且每次 Tab 静默把 4 个
 * 空格写进答案（实测 0→128 字符）；Escape / Ctrl+M / Shift+Tab 三种逃逸全无效。
 *
 * 本组件的逃逸按键（对外文档口径，共两条）：
 *   ① **Tab**：焦点离开编辑器，落到编辑器之后的下一个可聚焦控件（Shift+Tab 落到前一个；
 *      环回到页面首/尾，保证任何位置都能离开）。
 *      —— 即 Monaco 的 tabFocusMode（「Tab 移动焦点」，VS Code 无障碍模式）语义；
 *         我们把 Tab 的接管放在组件根节点的**捕获阶段**，因此不依赖 Monaco 内部实现
 *         （0.55 的 EditContext、旧内核降级的 0.24 textarea 两种焦点元素都生效）。
 *   ② 缩进替代键（Tab 不再写空格，缩进能力不回退）：
 *      Ctrl+] 增加缩进 / Ctrl+[ 减少缩进（Monaco 默认绑定 editor.action.indentLines /
 *      outdentLines）；macOS 上 Monaco 的 KeyMod.CtrlCmd 为 Command，故为 ⌘] / ⌘[。
 *      误输入统一可用 Ctrl+Z（macOS ⌘Z）撤销。
 *   ③ 焦点在编辑器内时，聚焦元素带 aria-label 说明「焦点在编辑器内 + Tab 逃逸 + 缩进替代键
 *      + 撤销方式」，用户不会误以为在页面导航而实际往答案里写空格。
 *
 * 接管条件（避免影响编辑器内部控件的 Tab 行为，例如 Ctrl+F 查找框）：
 *   仅在 key 为 Tab、无 Ctrl/Alt/Meta 修饰、且 editor.hasTextFocus() 为真（编辑器正文
 *   持有焦点）时接管；否则一律不干预，把按键原样交回 Monaco / 浏览器。
 * =========================================================================== */

/** Monaco 的 KeyMod.CtrlCmd 在本平台对应 Command（macOS）还是 Ctrl（其余） */
const MOD = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? 'Command' : 'Ctrl';

/** 可聚焦候选（与浏览器 tab order 口径一致；tabindex="-1" 的排除在外） */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const groupA11yLabel = computed(() => (props.readOnly ? '只读代码编辑器' : '代码编辑器'));

/**
 * 聚焦元素（Monaco .native-edit-context）的可访问名称：
 * 用户按 Tab 进来后，读屏会念出「焦点在编辑器内 + 怎么离开 + 怎么缩进 + 怎么撤销」。
 */
function editorA11yLabel() {
  const name = props.readOnly ? '只读代码编辑器（焦点在编辑器内）' : '代码编辑器（焦点在编辑器内）';
  const nav = '按 Tab 离开编辑器并继续导航，Shift+Tab 返回上一个控件';
  if (props.readOnly) return `${name}：${nav}。`;
  return `${name}：${nav}；缩进 ${MOD}+]，反缩进 ${MOD}+[，撤销 ${MOD}+Z。`;
}

/** 编辑器主题跟随应用主题：ensureTheme() 在 create 之前按当前令牌定义并返回主题名 */
const { ensureTheme } = useMonacoTheme();

onMounted(async () => {
  // 旧浏览器（:where() 不可用即 Chrome < 88，或可选链不可用即 Chrome < 80）：
  // Monaco 0.55+ 产物无法解析，降级 0.24.0（判定与版本口径以 domain/browserCompat.js 的
  // isLegacyBrowser() 与 infrastructure/monaco/legacyLoaderCompat.js 的 LEGACY_MONACO_VS 为准）
  applyMonacoCompat(loader);
  monaco = await loader.init();
  editor = monaco.editor.create(editorRef.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readOnly,
    theme: ensureTheme(monaco),
    minimap: { enabled: false },
    automaticLayout: true,
    fontSize: props.fontSize,
    fontFamily: props.fontFamily,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    tabSize: 4,
    // Tab 交还焦点导航（Monaco「Tab 移动焦点」无障碍模式）：Monaco 的 Tab/Shift+Tab
    // 缩进绑定因 editorTabMovesFocus 上下文为真而失效，Tab 不再写入 4 个空格。
    // 缩进替代键见文件上方注释：Ctrl+] / Ctrl+[（macOS ⌘] / ⌘[），撤销 Ctrl+Z。
    tabFocusMode: true,
    // 聚焦元素（.native-edit-context，role=textbox）的可访问名称：见 editorA11yLabel()
    ariaLabel: editorA11yLabel(),
  });

  subscription = editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.getValue());
  });
});

onUnmounted(() => {
  subscription?.dispose();
  editor?.dispose();
});

watch(() => props.language, (lang) => {
  if (editor && monaco) {
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang);
  }
});

watch(() => [props.fontSize, props.fontFamily], ([size, family]) => {
  editor?.updateOptions({ fontSize: size, fontFamily: family });
});

// readOnly 只影响可访问名称（「只读代码编辑器」+ 去掉缩进/撤销提示）；
// 是否可编辑仍由 create() 时的 readOnly 决定，与改前一致（不改动既有编辑行为）
watch(() => props.readOnly, () => {
  editor?.updateOptions({ ariaLabel: editorA11yLabel() });
});

watch(() => props.modelValue, (val) => {
  if (editor && val !== editor.getValue()) {
    editor.setValue(val);
  }
});

/** 元素当下是否可被 Tab 命中（可见 + 未禁用 + tabIndex >= 0） */
function isTabbable(el) {
  if (!el || el.disabled) return false;
  if (typeof el.tabIndex === 'number' && el.tabIndex < 0) return false;
  if (!el.getClientRects().length) return false;
  const cs = window.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

/**
 * 把焦点交给编辑器容器之外的下一个（Tab）/ 上一个（Shift+Tab）可聚焦控件。
 * 统计口径：文档顺序（querySelectorAll 顺序）× 可见性过滤，容器自身的元素（Monaco 内部
 * 的 .native-edit-context、查找框等）不算候选；没有候选时环回到页面首/尾，保证总能离开。
 * 返回 false 表示找不到任何候选（调用方保留 Monaco/浏览器默认行为）。
 */
function focusOutsideEditor(backward) {
  const boundary = rootRef.value || editorRef.value;
  if (!boundary) return false;
  const candidates = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => !boundary.contains(el) && isTabbable(el));
  if (!candidates.length) return false;
  let target = null;
  for (const el of candidates) {
    const rel = boundary.compareDocumentPosition(el);
    if (backward) {
      if (rel & Node.DOCUMENT_POSITION_PRECEDING) target = el;
    } else if (rel & Node.DOCUMENT_POSITION_FOLLOWING) {
      target = el;
      break;
    }
  }
  if (!target) target = backward ? candidates[candidates.length - 1] : candidates[0];
  target.focus();
  return true;
}

/** 捕获阶段接管 Tab：见文件上方「键盘可达性」注释（Tab = 离开编辑器，缩进用 Ctrl+]/Ctrl+[） */
function onKeydownCapture(e) {
  if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
  if (!editor || !editor.hasTextFocus()) return;
  if (!focusOutsideEditor(e.shiftKey)) return;
  e.preventDefault();
  e.stopPropagation();
}

function format() {
  if (!editor) return;
  const wasReadOnly = props.readOnly;
  if (wasReadOnly) editor.updateOptions({ readOnly: false });

  try {
    const lang = editor.getModel()?.getLanguageId();
    // Prettier 支持的语言
    if (['javascript', 'typescript', 'json', 'css', 'html', 'markdown'].includes(lang)) {
      editor.getAction('editor.action.formatDocument')?.run();
      return;
    }
    // C 系语言：简单括号缩进格式化
    if (['c', 'cpp', 'csharp', 'java'].includes(lang)) {
      const code = editor.getValue();
      editor.setValue(braceFormat(code));
      return;
    }
    // 其他语言：全选后 reindent（Monaco 0.55 的 action id 全小写：editor.action.reindentselectedlines）
    editor.setSelection(editor.getModel().getFullModelRange());
    const beforeReindent = editor.getValue();
    editor.trigger('format', 'editor.action.reindentselectedlines');
    // Monaco 的 basic-languages 里只有 5 种语言带 indentationRules（python 不在其中）→ 上面可能是空操作。
    // python 兜底：按「行尾 : 进一级，elif/else/except/finally 先退一级」重排前导空白，
    // 使「格式化」按钮对 python 题目真的生效（详见下方 pythonFormat 注释与限制）。
    if (lang === 'python' && editor.getValue() === beforeReindent) {
      const fixed = pythonFormat(beforeReindent);
      if (fixed !== beforeReindent) editor.setValue(fixed);
    }
  } finally {
    if (wasReadOnly) editor.updateOptions({ readOnly: true });
  }
}

/**
 * python 最小缩进整理（仅作为 format() 的兜底）：
 *   · 行尾为 ':' 的行使其后一级缩进；elif/else/except/finally 先退一级再按规则处理；
 *   · 空行去掉行尾空白；其余内容（除前导空白）保持原样，不改写语句本身；
 *   · **含三引号字符串（``` / """）时直接返回原文**，避免把字符串内部内容改掉。
 * 局限（已知）：不处理续行对齐与括号内手工对齐美化——只保证缩进层级正确。
 */
function pythonFormat(code) {
  if (/"""|'''/.test(code)) return code;
  const tab = '    ';
  let level = 0;
  const lines = code.split('\n').map((line) => {
    const text = line.trim();
    if (!text) return '';
    if (/^(elif\b|else\b|except\b|finally\b)/.test(text)) level = Math.max(0, level - 1);
    const out = tab.repeat(level) + text;
    if (/:\s*(#.*)?$/.test(text)) level += 1;
    return out;
  });
  return lines.join('\n');
}

function braceFormat(code) {
  let out = '';
  let indent = 0;
  const tab = '    ';
  const tokens = code.split(/([{};])/);
  for (const t of tokens) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (trimmed === '}') indent = Math.max(0, indent - 1);
    if (trimmed !== '{' && trimmed !== '}' && trimmed !== ';') {
      out += tab.repeat(indent) + trimmed + '\n';
    }
    if (trimmed === '{') { out = out.trimEnd() + ' {\n'; indent++; }
    if (trimmed === '}') { out += tab.repeat(indent) + '}\n'; }
    if (trimmed === ';') { out = out.trimEnd() + ';\n'; }
  }
  return out.trim();
}

defineExpose({ format });
</script>

<style scoped>
.code-editor-wrap {
  padding: 8px 0 0;
  height: 100%;
  display: flex;
}
.code-editor {
  width: 100%;
  height: 100%;
  border: none;
  overflow: hidden;
}
</style>
