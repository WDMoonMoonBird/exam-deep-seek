import { ref, computed, watch } from 'vue';

/**
 * useTheme —— 主题状态（Wave 5 · t31）
 * 契约：docs/ui-redesign/20-wave5-brief.md §2.1
 *
 * mode:     'light' | 'dark' | 'system'（默认 system，持久化到 localStorage['ui-theme']）
 * resolved: 'light' | 'dark'（system 时跟随 matchMedia('(prefers-color-scheme: dark)')，并监听其变化）
 * 应用：document.documentElement.dataset.theme = resolved（+ 同步 color-scheme，
 *       让原生控件/滚动条跟着变），watch 用 flush:'sync' 保证「属性已更新」先于
 *       依赖它的 antd 主题重算（否则会读到上一套 CSS 变量）。
 *
 * 模块级单例：所有调用方共享同一份状态，任意入口切换，全局即时生效。
 * Chrome 69 兼容：只用 localStorage / matchMedia(+addListener 回退) / dataset，无新语法。
 */

const STORAGE_KEY = 'ui-theme';
const MODES = ['light', 'dark', 'system'];

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return MODES.indexOf(v) >= 0 ? v : 'system';
  } catch (e) { return 'system'; }
}

function prefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
}

/** 把解析后的主题写到 <html>：data-theme 驱动 tokens.css 的变量表，color-scheme 驱动原生控件 */
function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.setAttribute('data-theme', theme);
  try { el.style.colorScheme = theme; } catch (e) { /* 旧内核忽略 */ }
}

const mode = ref(readStored());
const systemDark = ref(prefersDark());
const resolved = computed(() => (mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value));

// 立即应用一次（index.html 的首帧脚本已预置同值，这里是 Vue 侧的权威来源）
watch(resolved, (t) => applyTheme(t), { immediate: true, flush: 'sync' });

// system 模式跟随系统：监听 matchMedia 变化（addEventListener 不可用时回退 addListener，Chrome 69 走回退）
(function bindSystemWatcher() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  try {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => { systemDark.value = !!e.matches; };
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
    else if (typeof mql.addListener === 'function') mql.addListener(onChange);
  } catch (e) { /* 能力不可用时保持初始值 */ }
})();

/** 设置模式并持久化；非法值回落 'system' */
function setMode(next) {
  const v = MODES.indexOf(next) >= 0 ? next : 'system';
  mode.value = v;
  try { localStorage.setItem(STORAGE_KEY, v); } catch (e) { /* 隐私模式等：仅本次会话生效 */ }
}

/** 在 light/dark 之间切换（把当前 resolved 取反并写死为显式模式，脱开 system） */
function toggle() {
  setMode(resolved.value === 'dark' ? 'light' : 'dark');
}

export function useTheme() {
  return { mode, resolved, setMode, toggle };
}

export default useTheme;
