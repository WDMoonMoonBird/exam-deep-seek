<script setup>
/**
 * MEmpty —— 空态（契约 §4 · 所有列表/页面 empty 态统一用它）
 *
 * props: icon（MIcon 名，默认 inbox）/ title / description
 * 插槽：默认（放 .btn 等操作按钮）
 *
 * 用法：
 *   <MEmpty title="暂无作业" description="老师布置后会显示在这里">
 *     <button type="button" class="btn btn--secondary" @click="reload">刷新</button>
 *   </MEmpty>
 */
import MIcon from './MIcon.vue';

defineProps({
  icon: { type: String, default: 'inbox' },
  title: { type: String, default: '暂无内容' },
  description: { type: String, default: '' },
});
</script>

<template>
  <div class="empty">
    <div class="empty-icon" aria-hidden="true">
      <MIcon :name="icon" />
    </div>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
