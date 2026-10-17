<script setup>
/**
 * MSkeleton —— 骨架屏（契约 §4 · loading 态统一用它，禁止用假数据占位）
 *
 * props:
 *   variant 'card'(默认) | 'line' | 'text'
 *   count   重复个数（默认 3）
 * 无障碍：容器 aria-hidden，加载状态请由页面用 role="status" 文案或 aria-busy 表达。
 *
 * 用法：<MSkeleton variant="card" :count="3" />
 */
defineProps({
  variant: { type: String, default: 'card' },
  count: { type: Number, default: 3 },
});
</script>

<template>
  <div class="m-skeleton" aria-hidden="true">
    <template v-if="variant === 'card'">
      <div v-for="n in count" :key="n" class="sk-card">
        <div class="sk sk-line" style="width: 46%"></div>
        <div class="sk sk-line"></div>
        <div class="sk sk-line sk-line--sm"></div>
      </div>
    </template>
    <template v-else-if="variant === 'line'">
      <div v-for="n in count" :key="n" class="sk sk-line"></div>
    </template>
    <template v-else>
      <div v-for="n in count" :key="n" class="sk sk-line sk-line--sm"></div>
    </template>
  </div>
</template>
