<template>
  <span :class="['tag', 'tag-' + tone]">
    <i v-if="dot" class="tag-dot"></i>{{ text }}
  </span>
</template>

<script setup>
/**
 * StatusTag —— 状态标签（Wave 1 骨架组件）
 * 契约见 docs/ui-redesign/09-wave1-brief.md §2；样式逐字取自 Wave 0 试点页
 * views/teacher/Assignments.vue 的 .tag / .tag-dot / .tag-*。
 *
 * props：tone(neutral|brand|success|warning|danger|accent，默认 neutral) / text(string, 必填) / dot(boolean, 默认 false)
 * 输出：<span class="tag tag-{tone}">[<i class="tag-dot">]<text></span>
 */
defineProps({
  tone: {
    type: String,
    default: 'neutral',
    // 取值白名单：neutral | brand | success | warning | danger | accent
    validator: (value) => ['neutral', 'brand', 'success', 'warning', 'danger', 'accent'].includes(value),
  },
  text: { type: String, required: true },
  dot: { type: Boolean, default: false },
});
</script>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: var(--tag-h);
  padding: 0 var(--tag-pad-x);
  margin-right: 4px;
  border-radius: var(--tag-radius);
  font-size: var(--tag-fs);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}
.tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* 六个状态色板（全部走 --status-* 三元组，与试点页取值一致） */
.tag-neutral {
  background: var(--status-neutral-bg);
  color: var(--status-neutral-fg);
}
.tag-brand {
  background: var(--status-info-bg);
  color: var(--status-info-fg);
}
.tag-success {
  background: var(--status-success-bg);
  color: var(--status-success-fg);
}
.tag-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning-fg);
}
.tag-danger {
  background: var(--status-danger-bg);
  color: var(--status-danger-fg);
}
.tag-accent {
  background: var(--status-accent-bg);
  color: var(--status-accent-fg);
}
</style>
