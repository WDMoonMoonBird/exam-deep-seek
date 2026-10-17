<script setup>
/**
 * MobileActionBar —— 底部固定动作条（契约 §4）
 *
 * props:
 *   column  纵向排列（默认横向；横向时第一个按钮会 flex:1）
 *   hint    按钮上方的说明文字（如「提交后不可修改」）
 *   label   动作组 aria-label（默认「页面操作」）
 * 插槽：默认（放 .btn 按钮）
 *
 * 用法：
 *   <MobileActionBar>
 *     <button type="button" class="btn btn--secondary">答题卡</button>
 *     <button type="button" class="btn btn--primary">继续作答</button>
 *   </MobileActionBar>
 * 注意：页面根 MobileLayout 需同时设置 bottom="actionbar"，滚动区才会预留底部空间。
 */
defineProps({
  column: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  label: { type: String, default: '页面操作' },
});
</script>

<template>
  <div class="actionbar" :class="{ 'actionbar--col': column }" role="group" :aria-label="label">
    <p v-if="hint" class="actionbar-hint">{{ hint }}</p>
    <slot />
  </div>
</template>
