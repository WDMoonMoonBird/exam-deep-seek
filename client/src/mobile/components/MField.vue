<script setup>
/**
 * MField —— 表单字段容器（契约 §4 · 移动表单统一 .field/.label/.help/.error-text）
 *
 * props:
 *   label    字段名（渲染 <label>，有 forId 时绑定）
 *   forId    关联控件的 id（建议必填，保证点击 label 聚焦控件）
 *   required 是否必填（红色 * 仅视觉，aria-required 由页面放在控件上）
 *   hint     帮助文字
 *   error    错误文字（有值时显示 .error-text 并 role="alert"，优先于 hint）
 * 插槽：默认（input / textarea / 自定义控件）
 *
 * 用法：
 *   <MField label="账号" for-id="login-account" required hint="教师用工号，学生用学号">
 *     <input id="login-account" class="input" v-model="account" autocomplete="username" />
 *   </MField>
 */
import MIcon from './MIcon.vue';

defineProps({
  label: { type: String, default: '' },
  forId: { type: String, default: '' },
  required: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
});
</script>

<template>
  <div class="field" :class="{ 'field--invalid': !!error }">
    <label v-if="label" class="label" :for="forId || undefined">
      {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
    </label>
    <slot />
    <span v-if="error" class="error-text" role="alert">
      <MIcon name="alert" />
      {{ error }}
    </span>
    <span v-else-if="hint" class="help">{{ hint }}</span>
  </div>
</template>
