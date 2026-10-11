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
  } catch { return 'system'; }
}

function prefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

/** 把解析后的主题写到 <html>：data-theme 驱动 tokens.css 的变量表，color-scheme 驱动原生控件 */
function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.setAttribute('data-theme', theme);
  try { el.style.colorScheme = theme; } catch { /* 旧内核忽略 */ }
}

/* ===== 主题切换过渡（Wave 5 · t41）=====
   只在「用户主动切换」时给 <html> 临时加 .theme-transition（style.css 里那条作用域规则才因此生效），
   过渡结束后移除；初始化应用主题（下方 watch 的 immediate 那一次）不加类 —— 这是「首帧不触发过渡」的关键。
   为什么收尾不用定时器：
     ① 时长必须由 --duration-* 表达，reduce 偏好下 tokens.css 才会把它降级成 1ms；
     ② 收尾监听 body 自身的 transitionend：body 的 color/background-color 都来自令牌、时长等于
        --duration-base（220ms），比多数组件自身过渡更长，因此不会过早移除类去打断别的元素；
     ③ 万一某次一条过渡都没发生（事件不来），类会在下一次切换前被防御性复位，不会长期滞留。 */
const TRANSITION_CLASS = 'theme-transition';
let transitionBound = false;
let bodyTransitionArmed = false;   // body 自身的主题过渡是否已经起跑（用来忽略「加类之前就在跑」的过渡）

function endThemeTransition() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove(TRANSITION_CLASS);
  document.removeEventListener('transitionrun', onThemeTransitionRun, true);
  document.removeEventListener('transitionend', onThemeTransitionEnd, true);
  transitionBound = false;
  bodyTransitionArmed = false;
}

function onThemeTransitionRun(e) {
  if (e && e.target === document.body) bodyTransitionArmed = true;
}

/**
 * 收尾时机 = body 自身那条主题过渡（color / background-color，时长 = --duration-base）结束。
 * 为什么锚在 body：① 它的颜色全部来自令牌，主题一换必然过渡，时长就等于 --duration-base（约 220ms，
 * 落在要求的 200–300ms 内）；② 它比多数组件自身过渡长，先摘类会打断别人；
 * ③ 用 armed 标记忽略「加类之前就在跑」的历史过渡（实测若不忽略会提前 ~110ms 摘类）。
 * 全程事件驱动，不用定时器；reduce 偏好下时长被降级成 1ms，事件随之提前，收尾自然跟着变快。
 * 只认 transitionend、**不认 transitioncancel**：实测主题切换瞬间 antd 会注入暗色样式，
 * body 的颜色目标值随之再变一次 → 第一条过渡被 cancel（elapsed 仅 19ms）后立即重启，
 * 若在 cancel 时就摘类，重启的那条就没有时长了（表现为 body 瞬间跳色）。
 */
function onThemeTransitionEnd(e) {
  if (!e || e.target !== document.body || !bodyTransitionArmed) return;
  endThemeTransition();
}

function startThemeTransition() {
  if (typeof document === 'undefined') return;
  if (transitionBound) endThemeTransition();      // 防御性复位（上一次若没收到事件，也不会长期滞留）
  bodyTransitionArmed = false;
  document.documentElement.classList.add(TRANSITION_CLASS);
  transitionBound = true;
  document.addEventListener('transitionrun', onThemeTransitionRun, true);
  document.addEventListener('transitionend', onThemeTransitionEnd, true);
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
  } catch { /* 能力不可用时保持初始值 */ }
})();

/** 设置模式并持久化；非法值回落 'system' */
function setMode(next) {
  const v = MODES.indexOf(next) >= 0 ? next : 'system';
  // 顺序不能反：先把过渡类挂上，data-theme 变更才会被浏览器当作「从旧值过渡到新值」
  const nextResolved = v === 'system' ? (systemDark.value ? 'dark' : 'light') : v;
  if (nextResolved !== resolved.value) startThemeTransition();
  mode.value = v;
  try { localStorage.setItem(STORAGE_KEY, v); } catch { /* 隐私模式等：仅本次会话生效 */ }
}

/** 在 light/dark 之间切换（把当前 resolved 取反并写死为显式模式，脱开 system） */
function toggle() {
  setMode(resolved.value === 'dark' ? 'light' : 'dark');
}

export function useTheme() {
  return { mode, resolved, setMode, toggle };
}

export default useTheme;
