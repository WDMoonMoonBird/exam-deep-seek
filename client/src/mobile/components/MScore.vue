<script setup>
/**
 * MScore —— 分数展示（契约 §4 · v1 数据规则见契约 §7）
 *
 * props:
 *   value  分数（number / string；null 或 '' 显示 --）
 *   total  满分（可选）；hero 尺寸时显示为 / total
 *   size   'md'(默认，score-chip) | 'hero'(score-hero 大字)
 *   tone   'auto'(默认) | 'excellent' | 'good' | 'pass' | 'fail' | 'plain'
 *   tag    可选的文字标签（如「已发布」），注意：v1 不显示 A/B/C 等级，此处仅限中性状态词
 *   tagType 标签语义色（默认 success）
 *
 * 说明：tone=auto 时仅按分数比例取色（颜色是辅助，不新增任何数据）；
 * 分数是否展示由页面根据契约 §7（仅 published 才出分）判断，本组件不请求数据。
 *
 * 用法：<MScore :value="92" :total="100" size="hero" tag="已发布" />
 */
import { computed } from 'vue';
import MStatusTag from './MStatusTag.vue';

const props = defineProps({
  value: { type: [Number, String], default: null },
  total: { type: [Number, String], default: null },
  size: { type: String, default: 'md' },
  tone: { type: String, default: 'auto' },
  tag: { type: String, default: '' },
  tagType: { type: String, default: 'success' },
});

const hasValue = computed(() => props.value !== null && props.value !== '' && props.value !== undefined);
const hasTotal = computed(() => props.total !== null && props.total !== '' && props.total !== undefined);
const display = computed(() => (hasValue.value ? props.value : '--'));

const toneClass = computed(() => {
  if (props.tone !== 'auto') return props.tone === 'plain' ? '' : 'score-chip--' + props.tone;
  const num = Number(props.value);
  const total = Number(props.total);
  if (!Number.isFinite(num) || !Number.isFinite(total) || total <= 0) return '';
  const ratio = (num / total) * 100;
  if (ratio >= 90) return 'score-chip--excellent';
  if (ratio >= 80) return 'score-chip--good';
  if (ratio >= 60) return 'score-chip--pass';
  return 'score-chip--fail';
});
</script>

<template>
  <span v-if="size === 'hero'" class="score-hero">
    <b>{{ display }}</b>
    <span v-if="hasTotal" class="total">/ {{ total }}</span>
    <MStatusTag v-if="tag" :type="tagType" class="m-score-tag">{{ tag }}</MStatusTag>
  </span>
  <span v-else class="score-chip" :class="toneClass">{{ display }}</span>
</template>
