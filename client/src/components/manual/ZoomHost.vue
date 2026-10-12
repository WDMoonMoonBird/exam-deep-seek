<template>
  <div class="zh">
    <p class="zh-tip">
      这是<strong>真弹窗</strong>：遮罩铺满整个页面，<kbd>ESC</kbd> 或点遮罩可关闭。
      下面每个演示都能<strong>点步骤条跳步</strong> —— 想看哪一步就直接点。
    </p>
    <slot />
  </div>
</template>

<script setup>
/**
 * ZoomHost —— 「放大演示」弹窗的内层容器
 *
 * 唯一职责：provide('manualNav', true)，让 ManualStep 显示可点步骤条。
 * 为什么用 provide 而不是给 8 个 section 加 prop：section 是各 agent 各写一份的文件，
 * 加 prop 要改 8 个文件、且容易漏；provide/inject 只在放大场景生效，
 * 内联在正文里的演示（provide 不到）保持原样，一行都不用改。
 * 注意：antd 的 a-modal 把内容 Teleport 到 body，但**逻辑组件树不变**，所以 inject 依然拿得到。
 */
import { provide } from 'vue';

provide('manualNav', true);
</script>

<style scoped>
.zh-tip { margin: 0 0 var(--space-3); color: var(--text-secondary); font-size: var(--fs-body-sm); line-height: 1.7; }
.zh-tip strong { color: var(--text-strong); }
.zh-tip kbd {
  padding: 1px 5px; border: 1px solid var(--border-default); border-bottom-width: 2px;
  border-radius: var(--radius-sm); background: var(--bg-surface-2); font-family: var(--font-mono, ui-monospace); font-size: var(--fs-caption);
}
</style>
