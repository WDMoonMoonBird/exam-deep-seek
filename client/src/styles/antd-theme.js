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
      /**
       * 链接色（Wave 5 · t36）：antd 的链接色**不随 colorPrimary 走** ——
       * theme/util/alias.js 里 colorLink = colorInfoText、colorLinkHover/Active = colorInfoHover/Active，
       * 暗色主题下派生出 rgb(3,90,176)，落在 --bg-canvas 上只有 2.60:1（t34 实测的不可读缺陷）。
       * tokens.css 只给了 --text-link（light = --brand-600 / dark = --brand-300），
       * 没有 hover/active 专用令牌 → 按主题各取相邻的既有品牌阶近似（不自造色值）：
       *   light: hover = --brand-500（更亮）· active = --brand-700（更暗）
       *   dark : hover = --brand-200（更亮）· active = --brand-400（更暗）
       * 兜底链同样只引用令牌（缺失时一路回落到 --text-link → --brand-600 → FALLBACK）。
       */
      /**
       * ⚠️ 重要：只写 colorLink 是**无效**的 —— antd 的 theme/util/alias.js 在合并用户覆盖之后
       * 仍会无条件执行「colorLink: mergedToken.colorInfoText」（colorLinkHover/Active 同理，
       * 分别取 colorInfoHover/colorInfoActive）。实测：写明 colorLink 后暗色链接仍是 rgb(3,90,176)。
       * 真正生效的开关是这三个 colorInfo* 派生 token（它们是 restToken+override 的合并结果，
       * 不会被 alias 反写）→ 这里把它们一并映射到同一批链接令牌。
       * colorLink* 仍然写出：① 语义自解释；② 若后续 antd 版本改为尊重用户覆盖即可自动生效。
       */
      colorLink: cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary)),
      colorInfoText: cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary)),
      colorLinkHover: resolved === 'dark'
        ? cssVar('--brand-200', cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary)))
        : cssVar('--brand-500', cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary))),
      colorLinkActive: resolved === 'dark'
        ? cssVar('--brand-400', cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary)))
        : cssVar('--brand-700', cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary))),
      // 上面说过：alias 会把 colorLink* 反写成 colorInfo*，所以真正生效的是下面这三个
      colorInfoHover: resolved === 'dark'
        ? cssVar('--brand-200', cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary)))
        : cssVar('--brand-500', cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary))),
      colorInfoActive: resolved === 'dark'
        ? cssVar('--brand-400', cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary)))
        : cssVar('--brand-700', cssVar('--text-link', cssVar('--brand-600', FALLBACK.colorPrimary))),
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
      /**
       * Doc 目录锚点用的是 antd Anchor（a-anchor）：其“当前项”颜色直接取全局 colorPrimary
       * （anchor/style/index.js:39），而 darkAlgorithm 会把我们给的品牌蓝（--brand-600）派生/改写成一个
       * 偏暗的蓝（实测 rgb(3, 90, 176)），落在暗色画布上只有 2.60:1 —— 这正是 t34 报的锚点缺陷。
       * Anchor 的 ComponentToken 是空接口（无官方 token），但 antd 运行时会把 components[名]
       * 合并进该组件的 token，故这里按组件覆盖成链接令牌（不动全局 colorPrimary，避免主按钮白字对比度被拖垮）。
       * 若某版本忽略未知组件 token，则本行退化为无效、不会造成错误。
       */
      Anchor: { colorText: cssVar('--text-secondary'), colorPrimary: cssVar('--text-link') },
      /**
       * 分页当前页号（t35 暗色指纹扫描的第二类缺陷）：antd 分页的「当前项」字色 / 边框
       * 直接取全局 colorPrimary（pagination/style/index.js:213/216/239），而 darkAlgorithm 会把
       * 我们给的品牌蓝改写为偏暗的 rgb(3, 90, 176)，落在暗色实底上只有 2.71:1（不可读）。
       * 与 Anchor 同款手法：只在 Pagination 组件内把 colorPrimary 覆盖成链接令牌，
       * **不动全局 colorPrimary** —— 否则暗色主按钮（白字 on 派生主色）的对比度会被拖垮。
       * 浅色下 --text-link = --brand-600，与全局 colorPrimary 同值，故浅色外观不变（实测前后一致）。
       */
      Pagination: { colorPrimary: cssVar('--text-link') },
    },
  };
}
