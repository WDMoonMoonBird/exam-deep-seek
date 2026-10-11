<template>
  <div class="page" :style="rootStyle">
    <header class="page-head" :class="{ 'page-head--compact': compact }">
      <div>
        <!-- compact 下标题只做视觉隐藏，不删元素：Layout 的隐藏 H1 镜像按 .page-title 抓当前页标题
             （见 teacher/Layout.vue 顶部 a11y 注释），页内标题语义也要保留 -->
        <h2 class="page-title" :class="{ 'visually-hidden': compact }">{{ title }}</h2>
        <p v-if="description && !compact" class="page-desc">{{ description }}</p>
      </div>
      <!-- 可选：返回条。放在标题之后、操作区之前，compact 下与 .page-actions 同行
           （.page-actions 自带 margin-left:auto，于是整行是「返回 …… 操作按钮组」） -->
      <div v-if="$slots.back" class="page-head-back">
        <slot name="back" />
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
 * props：title(string, 必填) / description(string) / maxWidth(string) / compact(boolean, 默认 false)
 * slots：actions(可选，右上主操作区) / back(可选，页头返回条) / kpi(可选，KPI 行) / 默认插槽 = 页面主体
 */
const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  maxWidth: { type: String, default: 'var(--layout-content-max)' },
  /**
   * compact：压掉页头的纵向占位（标题视觉隐藏、不渲染说明、行距收紧、返回条并入本行）。
   * 供题库单题编辑这类「工具型」页面使用；默认 false，历史取值逐字不变。
   */
  compact: { type: Boolean, default: false },
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
/* compact 变体：单行页头（返回条 + 操作区），标题已视觉隐藏、说明不渲染 → 行高按 32px 按钮算 */
.page-head--compact {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
/* 返回条容器：值只服务于 #back 插槽，未传该插槽的页面（默认路径）不渲染、取值无影响 */
.page-head-back {
  display: flex;
  align-items: center;
}
/* compact：视觉隐藏的标题仍包在一个 0 宽 div 里，它占掉一个 gap(8px) → 返回条会比下方卡片右缩 8px；
   这里回拉一个 gap，使「← 返回题库管理」与卡片左缘对齐（实测 x=288 → 280，与 .fp-body 同列）。 */
.page-head--compact .page-head-back {
  margin-left: calc(-1 * var(--space-2));
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
