<script setup>
/**
 * MRing —— 环形进度（契约 §4 · 设计稿 .ring）
 *
 * props:
 *   value / max  进度（默认 0/100）
 *   size         ''(78px) | 'sm'(54px)
 *   tone         ''(success 绿) | 'success' | 'warning' | 'danger'
 *   label        环内下方说明（如「已审」）
 *   display      环内主数字文案；缺省显示整数百分比
 *
 * 用法：<MRing :value="84" label="完成" />
 */
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  size: { type: String, default: '' },
  tone: { type: String, default: '' },
  label: { type: String, default: '' },
  display: { type: [String, Number], default: '' },
});

const percent = computed(() => {
  const max = Number(props.max) > 0 ? Number(props.max) : 100;
  const ratio = ((Number(props.value) || 0) / max) * 100;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(100, Math.max(0, Math.round(ratio * 100) / 100));
});

const ringClass = computed(() => ({
  'ring--sm': props.size === 'sm',
  'ring--success': props.tone === 'success',
  'ring--warning': props.tone === 'warning',
  'ring--danger': props.tone === 'danger',
}));

const shownValue = computed(() => {
  if (props.display !== '' && props.display != null) return props.display;
  return Math.round(percent.value);
});

const ariaLabel = computed(() => {
  const prefix = props.label ? props.label + ' ' : '';
  return prefix + Math.round(percent.value) + '%';
});
</script>

<template>
  <div class="ring" :class="ringClass" :style="{ '--p': percent }" role="img" :aria-label="ariaLabel">
    <div class="ring-in">
      <b>{{ shownValue }}</b>
      <span v-if="label">{{ label }}</span>
    </div>
  </div>
</template>
