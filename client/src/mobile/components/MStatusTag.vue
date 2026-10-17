<script setup>
/**
 * MStatusTag —— 语义状态标签（契约 §4）
 *
 * props:
 *   type  neutral | success | warning | danger | info | accent | solid（默认 neutral）
 *   size  ''(23px) | 'lg'(27px)
 *   dot   是否显示圆点（状态不只靠颜色，建议同时有文字）
 *   icon  可选 MIcon 名
 *   text  文本（也可用默认插槽）
 *
 * 用法：<MStatusTag type="warning" dot>待审核</MStatusTag>
 */
import MIcon from './MIcon.vue';

defineProps({
  type: { type: String, default: 'neutral' },
  size: { type: String, default: '' },
  dot: { type: Boolean, default: false },
  icon: { type: String, default: '' },
  text: { type: String, default: '' },
});
</script>

<template>
  <span class="tag" :class="['tag--' + type, size === 'lg' ? 'tag--lg' : '']">
    <i v-if="dot" class="dot" aria-hidden="true"></i>
    <MIcon v-if="icon" :name="icon" />
    <slot>{{ text }}</slot>
  </span>
</template>
