<script setup>
/**
 * MSearchBar —— 搜索框（契约 §4 · 设计稿 .searchbar）
 *
 * props:
 *   modelValue 关键词（v-model）
 *   placeholder 占位（默认「搜索」）
 *   label      无障碍名称（默认「搜索」）
 * 事件：update:modelValue、search（回车时）
 *
 * 用法：<MSearchBar v-model="keyword" placeholder="搜索作业" @search="doSearch" />
 */
import MIcon from './MIcon.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '搜索' },
  label: { type: String, default: '搜索' },
});

const emit = defineEmits(['update:modelValue', 'search']);

function onInput(event) {
  emit('update:modelValue', event.target.value);
}

function onSubmit() {
  emit('search', props.modelValue);
}

function clear() {
  emit('update:modelValue', '');
  emit('search', '');
}
</script>

<template>
  <div class="searchbar" role="search">
    <MIcon name="search" />
    <input
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="label"
      enterkeyhint="search"
      @input="onInput"
      @keyup.enter="onSubmit"
    />
    <button v-if="modelValue" type="button" class="m-search-clear" aria-label="清空搜索" @click="clear">
      <MIcon name="x-circle" size="sm" />
    </button>
  </div>
</template>
