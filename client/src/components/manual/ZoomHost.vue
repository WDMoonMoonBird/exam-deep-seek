<template>
  <slot />
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
 * 本组件**不渲染任何文字**：提示放在弹窗里、缩放区之外，否则会被 2× 的舞台一起拉宽裁切。
 */
import { provide } from 'vue';

provide('manualNav', true);
</script>
