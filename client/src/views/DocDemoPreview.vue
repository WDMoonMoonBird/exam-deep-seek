<template>
  <div class="ddp">
    <h1 class="ddp-h1">手册交互演示 · 预览（自动发现）</h1>
    <p class="ddp-lead">
      本页把 components/manual/sections/ 下的所有演示组件按 meta.order 列出，用于逐个验收：
      播放/暂停/重播是否正常、有无控制台报错、手机端是否可用。新增演示文件会自动出现在这里。
    </p>
    <p v-if="!demos.length" class="ddp-empty">还没有任何演示组件。</p>
    <article v-for="d in demos" :id="'demo-' + d.anchor" :key="d.key" class="ddp-item">
      <h2 class="ddp-h2">{{ d.title }}</h2>
      <component :is="d.comp" />
    </article>
  </div>
</template>

<script setup>
/**
 * 手册演示预览页（公开路由 /doc/demos）
 *
 * 机制：import.meta.glob 自动发现 components/manual/sections/*.vue；
 *       每个演示在 <script> 块里用 export const meta = { order, title, anchor } 登记。
 *       于是「新增演示 = 新增一个文件」，不需要在任何地方注册（多人并行不会抢同一个文件）。
 */
import { computed } from 'vue';

const modules = import.meta.glob('../components/manual/sections/*.vue', { eager: true });
const demos = computed(() =>
  Object.entries(modules)
    .map(([key, mod]) => ({ key, comp: mod.default, meta: mod.meta || {} }))
    .filter((d) => d.comp)
    .map((d) => ({
      key: d.key,
      comp: d.comp,
      title: d.meta.title || d.key.split('/').pop().replace('.vue', ''),
      anchor: d.meta.anchor || '',
      order: d.meta.order == null ? 999 : d.meta.order,
    }))
    .sort((a, b) => a.order - b.order),
);
</script>

<style scoped>
.ddp { max-width: 900px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-10); }
.ddp-h1 { font-size: var(--fs-title-1); color: var(--text-strong); margin: 0 0 var(--space-2); }
.ddp-lead { color: var(--text-secondary); font-size: var(--fs-body-sm); line-height: 1.7; margin: 0 0 var(--space-6); }
.ddp-empty { color: var(--text-tertiary); }
.ddp-item { margin-bottom: var(--space-8); }
.ddp-h2 { font-size: var(--fs-title-3); color: var(--text-strong); margin: 0 0 var(--space-3); }
</style>
