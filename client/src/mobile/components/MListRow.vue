<script setup>
/**
 * MListRow —— 列表行（契约 §4 · 设计稿 .rowitem/.list）
 *
 * props:
 *   title      主标题
 *   subtitle   副标题（可选）
 *   icon       左侧图标 MIcon 名（可选）
 *   iconTone   ''(品牌) | 'success' | 'warning' | 'neutral'
 *   to         路由（传入则渲染 router-link，自动出 chevron）
 *   clickable  无 to 时是否可点击（渲染 button）
 *   chevron    是否显示右箭头（默认：有 to 时显示）
 *   tag        右侧状态文字（MStatusTag；可选）
 *   tagType    tag 的语义色（默认 neutral）
 *   selected   选中态底色
 * 事件：click
 * 插槽：#left（替换图标）、#right（追加右侧内容）、默认（标题下方追加内容）
 *
 * 用法：
 *   <div class="list">
 *     <MListRow title="Java 程序设计期末考试" subtitle="6 题 · 96 分钟" icon="scores" to="/m/student/scores/1" tag="已出分" tag-type="success" />
 *   </div>
 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import MIcon from './MIcon.vue';
import MStatusTag from './MStatusTag.vue';

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  iconTone: { type: String, default: '' },
  to: { type: String, default: '' },
  clickable: { type: Boolean, default: false },
  chevron: { type: Boolean, default: null },
  tag: { type: String, default: '' },
  tagType: { type: String, default: 'neutral' },
  selected: { type: Boolean, default: false },
});

const emit = defineEmits(['click']);

const rootTag = computed(() => {
  if (props.to) return RouterLink;
  if (props.clickable) return 'button';
  return 'div';
});

const isTappable = computed(() => !!props.to || props.clickable);
const showChevron = computed(() => (props.chevron === null ? !!props.to : props.chevron));
const iconClass = computed(() =>
  props.iconTone ? 'rowicon rowicon--' + props.iconTone : 'rowicon'
);

function onClick(event) {
  emit('click', event);
}
</script>

<template>
  <component
    :is="rootTag"
    class="rowitem"
    :class="{ 'rowitem--tap': isTappable, 'rowitem--selected': selected }"
    :to="to || undefined"
    :type="rootTag === 'button' ? 'button' : undefined"
    @click="onClick"
  >
    <slot name="left">
      <span v-if="icon" :class="iconClass" aria-hidden="true">
        <MIcon :name="icon" />
      </span>
    </slot>
    <span class="row-main">
      <span class="row-title">{{ title }}</span>
      <span v-if="subtitle" class="row-sub">{{ subtitle }}</span>
      <slot />
    </span>
    <span class="row-side">
      <slot name="right">
        <MStatusTag v-if="tag" :type="tagType">{{ tag }}</MStatusTag>
      </slot>
    </span>
    <MIcon v-if="showChevron" name="chevron-right" class="chevron" />
  </component>
</template>
