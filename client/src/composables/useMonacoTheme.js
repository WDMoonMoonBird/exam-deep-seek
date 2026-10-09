import { watch } from 'vue';
import { useTheme } from './useTheme.js';

/**
 * useMonacoTheme —— Monaco 主题跟随应用主题（Wave 5 · t37）
 *
 * 背景知识：三处 monaco.editor.create() 原先都不传 theme，Monaco 永远用内置 'vs'（浅色），
 * 于是暗色主题下外壳全暗、代码区仍是白底。
 *
 * 做法（遵守「令牌是唯一真源」，本文件不出现任何硬编码色值）：
 *   ① 运行时从 document.documentElement 读令牌，defineTheme 出两套主题：
 *        app-light  base 'vs'      —— 亮色界面同面：--bg-surface / --text-primary
 *        app-dark   base 'vs-dark' —— 代码面令牌：--code-bg / --code-fg
 *   ② 每次主题切换都**重新 defineTheme 再 setTheme**：令牌值随主题变化，必须重读；
 *      setTheme 是 Monaco 的全局主题，已创建的实例会立刻重绘（无需重建实例）。
 *   ③ 令牌读不到时**不写这个键**，交给 base 主题的默认值（避免把色值写死在代码里）。
 *
 * 为什么亮色不用 --code-bg：该对令牌是「代码面恒定深色」（tokens.css 在浅色块与暗色块声明同值：
 * 深色底 + 72% 白字），亮色若套用会把亮色编辑器整块变深色，与「亮色视觉不变」冲突。
 * 故亮色走界面同面令牌（--bg-surface / --text-primary，取值与 vs 默认的纯白/近黑视觉一致），
 * 暗色走代码面令牌（编辑器底色严格等于 --code-bg，正文严格等于 --code-fg）。
 */

const THEME_LIGHT = 'app-light';
const THEME_DARK = 'app-dark';

/** 读 :root 上的令牌值；读不到返回空串（表示"不设置该键"） */
function readToken(name) {
  if (typeof document === 'undefined') return '';
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v ? v.trim() : '';
  } catch (e) {
    return '';
  }
}

/** 依次尝试多个令牌名，返回第一个非空值 */
function pickToken(names) {
  for (let i = 0; i < names.length; i++) {
    const v = readToken(names[i]);
    if (v) return v;
  }
  return '';
}

/** 解析令牌色值（#rgb / #rrggbb / rgb() / rgba()）为 { r, g, b, a }；解析失败返回 null */
function parseColor(value) {
  if (!value) return null;
  const s = String(value).trim();
  const fn = s.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const p = fn[1].split(',').map((x) => parseFloat(x));
    if (p.length < 3 || p.some((n) => !isFinite(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const hx = s.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hx) {
    let h = hx[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  return null;
}

/**
 * 转成 Monaco 主题能接受的颜色字面量：
 *  ① Monaco 的 theme colors 只认自己的格式（十六进制 #rrggbb），传 rgb()/rgba() 会抛
 *     "Illegal value for token color"，编辑器直接建不出来（实测 rgb(...) 也被拒）；
 *  ② 令牌里的半透明值（--code-fg 是 72% 白、暗色 --border-default 是 12% 白）按底色合成成不透明，
 *     否则同样会被拒。合成/量化全部来自运行时读到的令牌，代码里不写死任何色值。
 */
function toMonacoColor(value, base) {
  const c = parseColor(value);
  if (!c) return '';
  let r = c.r;
  let g = c.g;
  let b = c.b;
  if (c.a < 1) {
    const bg = parseColor(base) || { r: 0, g: 0, b: 0, a: 1 };
    r = r * c.a + bg.r * (1 - c.a);
    g = g * c.a + bg.g * (1 - c.a);
    b = b * c.a + bg.b * (1 - c.a);
  }
  const hx = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(g) + hx(b);
}

/** 按令牌拼 colors；缺令牌或解析不了的颜色直接不下发（交给 base 主题默认值） */
function buildColors(bgTokens, fgTokens) {
  const colors = {};
  const bg = toMonacoColor(pickToken(bgTokens), '');
  const fg = toMonacoColor(pickToken(fgTokens), bg);
  const bd = toMonacoColor(readToken('--border-default'), bg);
  if (bg) colors['editor.background'] = bg;
  if (fg) colors['editor.foreground'] = fg;
  if (bd) colors['editorWidget.border'] = bd;
  return colors;
}

/** 重新定义两套主题（每次切换主题都要重定义：令牌值随主题不同） */
function defineTokenThemes(monaco) {
  if (!monaco || !monaco.editor || typeof monaco.editor.defineTheme !== 'function') return;
  monaco.editor.defineTheme(THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: buildColors(['--bg-surface'], ['--text-primary']),
  });
  monaco.editor.defineTheme(THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: buildColors(['--code-bg', '--bg-surface'], ['--code-fg', '--text-primary']),
  });
}

const { resolved } = useTheme();

function currentThemeName() {
  return resolved.value === 'dark' ? THEME_DARK : THEME_LIGHT;
}

/** 最近一次 init 过的 monaco 命名空间（loader.init() 全局只有一个，无需维护列表） */
let lastMonaco = null;

// 主题切换：重定义 + 全局 setTheme，已创建的实例立刻跟随（不刷新、不重建）
watch(resolved, () => {
  if (!lastMonaco) return;
  defineTokenThemes(lastMonaco);
  lastMonaco.editor.setTheme(currentThemeName());
}, { flush: 'post' });

/**
 * 供使用方在 monaco.editor.create() **之前**调用：
 * 按当前令牌定义两套主题，并返回当前应使用的主题名（直接传给 create 的 theme 选项）。
 */
export function useMonacoTheme() {
  function ensureTheme(monaco) {
    lastMonaco = monaco;
    defineTokenThemes(monaco);
    return currentThemeName();
  }
  return { ensureTheme, themeName: currentThemeName, resolved };
}

export default useMonacoTheme;
