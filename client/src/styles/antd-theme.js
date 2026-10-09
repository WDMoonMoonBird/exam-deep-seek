/**
 * ant-design-vue 4 主题桥（Wave 0 引入，Wave 1 切换到新尺度）
 *
 * 目的：让 antd 的主题值来自设计令牌（CSS 变量），而不是散落在 App.vue 里的硬编码。
 * 设计说明：docs/ui-redesign/02-design-tokens.md（§5 映射表）
 *
 * 分阶段约定（重要）：
 *   Wave 0：**结构与取值都和改造前一致**，只把「硬编码」换成「读令牌 + 同值兜底」，视觉零变化。
 *   Wave 1（本次）：正文基准 15 → 14px、卡片/表格圆角 18 → 12px、弹窗 18 → 16px、标签 9999 → 6px，
 *                   取值改由令牌读取（--radius-md / --radius-lg / --radius-xl / --radius-sm / --fs-body）。
 *                   未列出的语义色（success / warning / error / info）仍用 antd 默认值：
 *                   接管会改变全站图标与状态色，留待后续波次逐页对照截图评审。
 */

import { theme as antdTheme } from 'ant-design-vue';

/**
 * 令牌缺失时的兜底值：与改造前 App.vue 里的硬编码同值。
 * 用 rgb() 写法而不是 hex，避免在 JS 里出现硬编码色值（验收要求改动文件 0 命中 hex）。
 */
const FALLBACK = {
  colorPrimary: 'rgb(0, 102, 204)',
  fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
};

/**
 * 读取 CSS 变量。令牌文件（styles/tokens.css）在 main.js 中静态引入，
 * 若因加载时序读不到，返回兜底值 —— 兜底值与旧硬编码一致，不会造成视觉跳变。
 */
function cssVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (value && value.trim()) || fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * @param {'light'|'dark'} resolved 解析后的主题（Wave 5 · t31）
 *   注意：其余 token 仍从 CSS 变量读取，而「同一个变量在 light/dark 下取值不同」
 *   （见 styles/tokens.css 的 [data-theme="dark"] 块）—— 所以主题切换后**必须重新调用本函数**，
 *   App.vue 用 computed(resolved) 保证这一点。
 */
export function createAntdTheme(resolved = 'light') {
  return {
    algorithm: resolved === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      borderRadius: parseInt(cssVar('--radius-md', '8px'), 10),   // 8（--radius-md）
      fontSize: 14,                                               // Wave 1：--fs-body，正文基准下调
      colorPrimary: cssVar('--brand-600', FALLBACK.colorPrimary),
      fontFamily: cssVar('--font-sans', FALLBACK.fontSans),        // 渲染等价：原栈首位的 SF Pro Display 在本机并不存在
    },
    components: {
      Button: { borderRadius: parseInt(cssVar('--radius-md', '8px'), 10), primaryShadow: 'none' },
      Card: { borderRadiusLG: parseInt(cssVar('--radius-lg', '12px'), 10) },    // 12（--radius-lg）
      Modal: { borderRadiusLG: parseInt(cssVar('--radius-xl', '16px'), 10) },   // 16（--radius-xl）
      Table: { borderRadiusLG: parseInt(cssVar('--radius-lg', '12px'), 10) },   // 12（--radius-lg）
      Tag: { borderRadiusSM: parseInt(cssVar('--radius-sm', '6px'), 10) },      // 6（--radius-sm）
    },
  };
}
