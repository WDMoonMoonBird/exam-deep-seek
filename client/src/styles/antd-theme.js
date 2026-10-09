/**
 * ant-design-vue 4 主题桥（Wave 0 引入）
 *
 * 目的：让 antd 的主题值来自设计令牌（CSS 变量），而不是散落在 App.vue 里的硬编码。
 * 设计说明：docs/ui-redesign/02-design-tokens.md（§5 映射表）
 *
 * 分阶段约定（重要）：
 *   Wave 0（本次）：**结构与取值都和改造前一致**，只把「硬编码」换成「读令牌 + 同值兜底」，
 *                   真正做到视觉零变化；未在此列出的语义色（success/warning/error）暂不接管，
 *                   因为一旦接管会改变全站图标与状态色，属于 Wave 1 的一次性视觉评审。
 *   Wave 1：把标注 WAVE1 的几行切到新尺度（正文 14px、卡片/弹窗 12px 圆角、标签 6px 圆角、
 *           语义色接管），届时需要逐页对照截图评审。
 */

/** 令牌缺失时的兜底值：与改造前 App.vue 里的硬编码完全一致 */
const FALLBACK = {
  colorPrimary: '#0066cc',
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

export function createAntdTheme() {
  return {
    token: {
      // —— 取值与改造前一致（视觉零变化）——
      borderRadius: 8, // WAVE1 → parseInt(cssVar('--radius-md', '8px'), 10)（同值 8）
      fontSize: 15,    // WAVE1 → 14（--fs-body，正文基准下调，需全站视觉评审）
      colorPrimary: cssVar('--brand-600', FALLBACK.colorPrimary), // #0066cc，同值
      fontFamily: cssVar('--font-sans', FALLBACK.fontSans),       // 渲染等价：原栈首位的 SF Pro Display 在本机并不存在

      // —— WAVE1 待接管（会改变全站语义色，需一次性评审）——
      // colorSuccess: cssVar('--green-600', '#039855'),
      // colorWarning: cssVar('--amber-600', '#dc6803'),
      // colorError:   cssVar('--red-600', '#d92d20'),
      // colorInfo:    cssVar('--brand-600', '#0066cc'),
      // colorTextBase: cssVar('--text-primary', '#141922'),
      // colorBgLayout: cssVar('--bg-canvas', '#f6f7f9'),
      // colorBorder:   cssVar('--border-strong', '#cfd4dc'),
      // colorBorderSecondary: cssVar('--border-default', '#e2e5ea'),
    },
    components: {
      // —— 与改造前一致 ——
      Button: { borderRadius: 8, primaryShadow: 'none' },
      Card: { borderRadiusLG: 18 },   // WAVE1 → --radius-lg (12)
      Modal: { borderRadiusLG: 18 },  // WAVE1 → --radius-xl (16)
      Table: { borderRadiusLG: 18 },  // WAVE1 → --radius-lg (12)
      Tag: { borderRadiusSM: 9999 },  // WAVE1 → --radius-sm (6)
    },
  };
}
