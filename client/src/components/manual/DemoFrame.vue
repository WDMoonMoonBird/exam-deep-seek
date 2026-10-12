<template>
  <div class="df" :class="['df--' + chrome, { 'df--plain': plain }]" :style="{ '--df-design': design }">
    <div v-if="chrome === 'window' || chrome === 'modal'" class="df-chrome">
      <span class="df-dot" /><span class="df-dot" /><span class="df-dot" />
      <span class="df-title">{{ title }}</span>
    </div>
    <div v-else-if="title" class="df-head">{{ title }}</div>
    <div class="df-body"><slot /></div>
  </div>
</template>

<script setup>
/**
 * DemoFrame —— 手册演示的「界面外壳」（手册底座，冻结）
 *
 * 作用：给复刻出来的假界面一个真实的外框（浏览器窗口 / 弹窗 / 面板 / 无框），
 *       并用**容器查询**把「设计单位」等比缩放到任意宽度（照搬 DSH 官网做法）：
 *         --u = 容器宽度 / design        →  1u = 设计稿上的 1px
 *       场景里所有尺寸都写 calc(var(--u) * N)，于是在 300px 宽的侧栏和 900px 宽的主区
 *       里都能保持相同的版式比例，且不糊（不是位图缩放）。
 *
 * props
 *   chrome  'window' | 'modal' | 'panel' | 'bare'   外壳形态（默认 panel）
 *   title   String   外壳标题（window/modal 显示为标题栏文字，panel 显示为小标题）
 *   design  Number   设计宽度（设计单位），默认 720
 *   plain   Boolean  去掉外框描边与阴影（用于嵌进已有卡片时）
 */
defineProps({
  chrome: { type: String, default: 'panel' },
  title: { type: String, default: '' },
  design: { type: Number, default: 720 },
  plain: { type: Boolean, default: false },
});
</script>

<style scoped>
.df { container-type: inline-size; --u: calc(100cqw / var(--df-design, 720)); border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--card-bg); overflow: hidden; }
.df--plain { border: 0; border-radius: 0; background: transparent; }
.df-chrome { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 9) calc(var(--u) * 12); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); }
.df-dot { width: calc(var(--u) * 9); height: calc(var(--u) * 9); border-radius: 50%; background: var(--border-strong); flex: none; }
.df-title { margin-left: calc(var(--u) * 6); font-size: calc(var(--u) * 12); color: var(--text-tertiary); }
.df-head { padding: calc(var(--u) * 8) calc(var(--u) * 12); font-size: calc(var(--u) * 13); font-weight: 600; color: var(--text-primary); border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface-2); }
.df-body { padding: calc(var(--u) * 12); }
.df--window .df-body, .df--modal .df-body { padding: calc(var(--u) * 14); }
</style>

<!-- 假界面原子类：**非 scoped**（插槽内容由使用方渲染，scoped 样式够不到），统一 dm- 前缀防外溢。
     所有尺寸都用 calc(var(--u) * N) —— N 是设计稿上的像素值。 -->
<style>
.dm-row { display: flex; align-items: center; gap: calc(var(--u) * 8); }
.dm-col { display: flex; flex-direction: column; gap: calc(var(--u) * 8); }
.dm-surface { border: 1px solid var(--border-default); border-radius: calc(var(--u) * 10); background: var(--card-bg); overflow: hidden; }
.dm-block-head { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 8) calc(var(--u) * 10); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); font-size: calc(var(--u) * 12); font-weight: 600; color: var(--text-primary); }
.dm-block-head span { font-weight: 400; color: var(--text-tertiary); }
.dm-pad { padding: calc(var(--u) * 10); }
.dm-title { font-size: calc(var(--u) * 13); font-weight: 600; color: var(--text-strong); }
.dm-sub { font-size: calc(var(--u) * 11.5); color: var(--text-tertiary); }
.dm-btn { display: inline-flex; align-items: center; gap: calc(var(--u) * 5); height: calc(var(--u) * 26); padding: 0 calc(var(--u) * 10); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 7); background: var(--card-bg); color: var(--text-primary); font-size: calc(var(--u) * 12); white-space: nowrap; }
.dm-btn.is-primary { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
.dm-btn.is-link { border: 0; background: transparent; color: var(--text-brand); padding: 0 calc(var(--u) * 4); }
.dm-input { display: flex; align-items: center; height: calc(var(--u) * 26); padding: 0 calc(var(--u) * 8); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 7); background: var(--card-bg); color: var(--text-primary); font-size: calc(var(--u) * 12); }
.dm-input.is-ph { color: var(--text-tertiary); }
.dm-tag { display: inline-flex; align-items: center; height: calc(var(--u) * 18); padding: 0 calc(var(--u) * 6); border-radius: calc(var(--u) * 5); font-size: calc(var(--u) * 11); border: 1px solid transparent; white-space: nowrap; }
.dm-tag.is-info { background: var(--status-info-bg); border-color: var(--status-info-bd); color: var(--status-info-fg); }
.dm-tag.is-accent { background: var(--status-accent-bg, var(--bg-selected)); border-color: var(--status-accent-bd, var(--border-default)); color: var(--status-accent-fg, var(--text-brand)); }
.dm-tag.is-mute { background: var(--bg-hover); border-color: var(--border-subtle); color: var(--text-secondary); }
.dm-check { width: calc(var(--u) * 13); height: calc(var(--u) * 13); border: 1px solid var(--border-strong); border-radius: calc(var(--u) * 4); flex: none; display: grid; place-items: center; font-size: calc(var(--u) * 9); color: transparent; }
.dm-check.is-on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
.dm-table-row { display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 8) calc(var(--u) * 10); border-bottom: 1px solid var(--border-subtle); font-size: calc(var(--u) * 12); color: var(--text-primary); }
.dm-table-row:last-child { border-bottom: 0; }
.dm-table-row.is-on { background: var(--bg-selected); }
/* 「点这里」高亮：给当前步骤的目标加一圈品牌描边 + 柔光（比截图上的红框更自然） */
.dm-target { position: relative; transition: box-shadow var(--duration-base) var(--ease-out), border-color var(--duration-base) var(--ease-out); }
/* 注意：--ring-focus 的值是**整条 box-shadow**（0 0 0 3px rgba(...)），不是颜色；
   这里要按 --u 缩放环宽，所以直接写颜色值（与 --ring-focus 里的 rgba 一致）。 */
.dm-target.is-hot { box-shadow: 0 0 0 calc(var(--u) * 3) rgba(31, 122, 224, 0.28); border-color: var(--brand-600) !important; }
/* 光标：在目标位置上画一个"点击"指示（纯装饰，动画层本来就 aria-hidden） */
.dm-cursor { position: absolute; right: calc(var(--u) * -5); bottom: calc(var(--u) * -5); width: calc(var(--u) * 13); height: calc(var(--u) * 13); border-radius: 50%; border: calc(var(--u) * 2) solid var(--brand-600); background: rgba(0, 102, 204, 0.14); opacity: 0; pointer-events: none; }
.dm-cursor.is-on { animation: dm-click-pulse 900ms var(--ease-out) infinite; }
@keyframes dm-click-pulse { 0% { opacity: 0; transform: scale(0.6); } 40% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.6); } }
.dm-fade-enter-active, .dm-fade-leave-active { transition: opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out); }
.dm-fade-enter-from, .dm-fade-leave-to { opacity: 0; transform: translateY(calc(var(--u) * 6)); }
.dm-toast { display: inline-flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 6) calc(var(--u) * 10); border-radius: calc(var(--u) * 7); background: var(--card-bg); border: 1px solid var(--border-default); box-shadow: var(--shadow-md, 0 4px 12px rgba(16, 24, 40, 0.12)); font-size: calc(var(--u) * 12); color: var(--text-primary); }
</style>
