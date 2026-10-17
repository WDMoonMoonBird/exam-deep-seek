<script setup>
/**
 * MProgress —— 线性进度条（契约 §4）
 *
 * props:
 *   value 当前值（默认 0）
 *   max   最大值（默认 100）
 *   tone  ''(品牌蓝) | 'success' | 'warning' | 'danger'
 *   size  '' | 'sm' | 'lg'
 *   label 无障碍名称（默认「进度」）
 * 无障碍：role="progressbar" + aria-valuemin/max/now。
 *
 * 用法：<MProgress :value="4" :max="6" label="作答进度" />
 */
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  tone: { type: String, default: '' },
  size: { type: String, default: '' },
  label: { type: String, default: '进度' },
});

const percent = computed(() => {
  const max = Number(props.max) > 0 ? Number(props.max) : 100;
  const value = Number(props.value) || 0;
  const ratio = (value / max) * 100;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(100, Math.max(0, Math.round(ratio * 100) / 100));
});

const barClass = computed(() => ({
  'bar--sm': props.size === 'sm',
  'bar--lg': props.size === 'lg',
  'bar--success': props.tone === 'success',
  'bar--warning': props.tone === 'warning',
  'bar--danger': props.tone === 'danger',
}));

const now = computed(() => Math.min(Number(props.max) || 100, Math.max(0, Number(props.value) || 0)));
</script>

<template>
  <div
    class="bar"
    :class="barClass"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="now"
  >
    <i :style="{ width: percent + '%' }"></i>
  </div>
</template>
