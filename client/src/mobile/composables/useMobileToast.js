/**
 * useMobileToast —— 移动端轻量 Toast（零依赖，不引入任何 UI 库）
 *
 * 依据：docs/mobile-app/10-v1-implementation-contract.md §4（composables/useMobileToast.js(show)）
 * 视觉：复用设计稿 .toast 类（client/src/mobile/styles/mobile.css），挂在最近的 .m-screen 内，
 *       以便继承 --m-* 移动令牌 / 浅深主题变量；无 .m-screen 时退回 body（例如极端挂载场景）。
 *
 * 用法：
 *   const toast = useMobileToast();
 *   toast.show('已保存');
 *   toast.show('提交失败，请重试', { duration: 3200 });
 *   toast.hide();
 *
 * 无障碍：单例节点 role="status" aria-live="polite"，文案变化由读屏播报。
 */
const DEFAULT_DURATION = 2400;
const MAX_TEXT_LENGTH = 140;

let toastEl = null;
let hideTimer = null;

function getScreenEl() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.m-screen');
}

function ensureToastEl() {
  if (typeof document === 'undefined') return null;
  const parent = getScreenEl() || document.body;
  if (!parent) return null;
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.setAttribute('aria-atomic', 'true');
  }
  // 路由切换后旧 .m-screen 已卸载：把单例节点挂到当前 .m-screen，避免提示不可见
  if (toastEl.parentNode !== parent) parent.appendChild(toastEl);
  return toastEl;
}

/** 隐藏当前 Toast（重复调用安全） */
function hide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (toastEl) toastEl.classList.remove('show');
}

/**
 * 显示一条短暂提示。
 * @param {string} text 文案（空串直接忽略）
 * @param {{duration?: number}} [options]
 */
function show(text, options) {
  const message = String(text == null ? '' : text).trim();
  if (!message) return;
  const el = ensureToastEl();
  if (!el) return;
  const opts = options || {};
  const duration = Number(opts.duration) > 0 ? Number(opts.duration) : DEFAULT_DURATION;
  hide();
  el.textContent = message.length > MAX_TEXT_LENGTH ? message.slice(0, MAX_TEXT_LENGTH) + '…' : message;
  // 先移除再强制 reflow，保证连续调用时入场过渡仍会重放
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (toastEl) toastEl.classList.remove('show');
  }, duration);
}

export function useMobileToast() {
  return { show, hide };
}

export { show as showMobileToast, hide as hideMobileToast };
export default useMobileToast;
