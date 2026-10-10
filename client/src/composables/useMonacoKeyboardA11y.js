// useMonacoKeyboardA11y.js — 自建 Monaco 实例的键盘可达性（Tab 逃逸 + 可访问名称）
//
// 背景（既有缺陷 QA T5-A5）：Monaco 默认把 Tab 当缩进键，键盘用户 Tab 进入编辑器后无法离开，
// 且每次 Tab 会把 4 个空格写进内容。components/CodeEditor.vue 已按统一口径修好（t2 / eedcf8f）；
// 本文件把那套逻辑抽成公共装置，供**不经过 CodeEditor、自行 monaco.editor.create() 的页面**复用：
//   views/teacher/ProjectQuestionEdit.vue、views/teacher/ProjectReviewNew.vue
//
// 对外口径（与 CodeEditor 完全一致，可文档化）：
//   ① Tab       → 焦点离开编辑器，落到编辑器之后第一个可聚焦控件；
//      Shift+Tab → 落到编辑器之前最后一个可聚焦控件（无候选时环回页面首/尾，保证总能离开）。
//      做法：tabFocusMode = true（Monaco「Tab 移动焦点」无障碍模式）+ 在容器上**捕获阶段**接管
//      编辑器正文（editor.hasTextFocus()）的 Tab/Shift+Tab 并显式移动焦点 —— 不依赖 Monaco 内部
//      实现（0.55 的 EditContext 与旧内核降级的 0.24 textarea 都生效），也不影响 Monaco 内部
//      控件（如 Ctrl+F 查找框）自己的 Tab 行为。
//   ② 缩进替代键：Ctrl+] / Ctrl+[（macOS ⌘] / ⌘[，Monaco 默认 editor.action.indentLines /
//      outdentLines），撤销 Ctrl/⌘+Z。只读编辑器下 Monaco 的 writable 前置条件会禁用这些写操作，
//      名称里据此标注「不生效」，不向读屏用户承诺无效按键。
//   ③ 聚焦元素（.native-edit-context，role=textbox）带 aria-label：说清「焦点在编辑器内、
//      Tab 可离开、缩进用什么键」，避免「以为在导航、实际在往内容里写空格」。
import { onBeforeUnmount } from 'vue';

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

/**
 * 聚焦元素（Monaco .native-edit-context）的可访问名称。
 * readOnly 为真时仍点出缩进/撤销键，但明确标注不生效（只读预览页实测：Monaco 侧写操作被禁用）。
 */
export function monacoA11yLabel(readOnly) {
  const name = readOnly ? '只读代码编辑器（焦点在编辑器内）' : '代码编辑器（焦点在编辑器内）';
  const nav = '按 Tab 离开编辑器并继续导航，Shift+Tab 返回上一个控件';
  const keys = `缩进 ${MOD}+]，反缩进 ${MOD}+[，撤销 ${MOD}+Z`;
  if (readOnly) return `${name}：${nav}；内容只读，${keys} 不生效。`;
  return `${name}：${nav}；${keys}。`;
}

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
 * 统计口径：文档顺序（querySelectorAll 顺序）× 可见性过滤；容器自身的元素（Monaco 内部的
 * .native-edit-context、查找框等）不算候选；没有候选时环回到页面首/尾，保证总能离开。
 * 返回 false 表示找不到任何候选（调用方保留 Monaco/浏览器默认行为）。
 */
function focusOutside(boundary, backward) {
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

/**
 * 用法（页面 setup 内调用一次，创建编辑器后 attach）：
 *   const { attach: attachKeyboardA11y } = useMonacoKeyboardA11y();
 *   ...
 *   editor = monaco.editor.create(container, {...});
 *   keyboardA11y = attachKeyboardA11y(editor, container, { readOnly: true });
 *   ...
 *   onBeforeUnmount(() => keyboardA11y?.dispose());   // 兜底：本 composable 也会在卸载时统一释放
 */
export function useMonacoKeyboardA11y() {
  const handles = new Set();

  /** options.readOnly 可传 boolean 或 () => boolean（后者用于运行期切换后 refresh() 刷新名称） */
  function attach(editor, boundary, options = {}) {
    const isReadOnly = () => (typeof options.readOnly === 'function' ? !!options.readOnly() : !!options.readOnly);
    const label = () => monacoA11yLabel(isReadOnly());
    // Tab 交还焦点导航：Monaco 的 Tab/Shift+Tab 缩进绑定因 editorTabMovesFocus 上下文为真而失效；
    // ariaLabel 作用于聚焦元素（.native-edit-context），updateOptions 会触发一次配置刷新写回 DOM
    editor.updateOptions({ tabFocusMode: true, ariaLabel: label() });
    const onKeydown = (e) => {
      if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
      if (!editor.hasTextFocus()) return;            // 焦点在 Monaco 内部控件（查找框等）时不接管
      if (!boundary || !focusOutside(boundary, e.shiftKey)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    boundary.addEventListener('keydown', onKeydown, true);
    const handle = {
      /** 只读态变化后刷新可访问名称（只改名称，不动编辑能力） */
      refresh() { editor.updateOptions({ ariaLabel: label() }); },
      dispose() {
        boundary.removeEventListener('keydown', onKeydown, true);
        handles.delete(handle);
      },
    };
    handles.add(handle);
    return handle;
  }

  function disposeAll() {
    [...handles].forEach((h) => h.dispose());
  }

  // 兜底：页面即使忘记 dispose，监听也不会跨页面残留
  onBeforeUnmount(disposeAll);

  return { attach, disposeAll, monacoA11yLabel };
}

export default useMonacoKeyboardA11y;
