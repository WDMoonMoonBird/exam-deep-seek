<template>
  <div class="page" :style="rootStyle">
    <header class="page-head">
      <div>
        <h2 class="page-title">{{ title }}</h2>
        <p v-if="description" class="page-desc">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="page-actions">
        <slot name="actions" />
      </div>
    </header>

    <!-- 可选：KPI 行（外壳只负责位置，卡片样式由页面自带） -->
    <slot name="kpi" />

    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue';

/**
 * PageShell —— 页面外壳（Wave 1 骨架组件）
 * 契约见 docs/ui-redesign/09-wave1-brief.md §2；样式逐字取自 Wave 0 试点页
 * views/teacher/Assignments.vue 的 .page / .page-head / .page-title / .page-desc / .page-actions。
 *
 * props：title(string, 必填) / description(string) / maxWidth(string)
 * slots：actions(可选，右上主操作区) / kpi(可选，KPI 行) / 默认插槽 = 页面主体
 */
const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  maxWidth: { type: String, default: 'var(--layout-content-max)' },
});

const rootStyle = computed(() => ({ '--page-max': props.maxWidth }));
</script>

<style scoped>
.page {
  max-width: var(--page-max);
}

/* ===== 页头（与试点页 .page-head 逐字一致） ===== */
.page-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}
.page-title {
  margin: 0 0 4px;
  font-size: var(--fs-title-1);
  line-height: var(--lh-title-1);
  font-weight: 600;
  color: var(--text-strong);
  letter-spacing: var(--tracking-tight);
}
.page-desc {
  margin: 0;
  font-size: var(--fs-body);
  color: var(--text-secondary);
}
.page-actions {
  margin-left: auto;
  display: flex;
  gap: var(--space-2);
}
</style>
