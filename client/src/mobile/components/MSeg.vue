<script setup>
/**
 * MSeg —— 分段控件（契约 §4 · 设计稿 .seg，用于「全部/待交/已交」等 2-4 档切换）
 *
 * props:
 *   modelValue 当前值（v-model）
 *   options    数组：['全部', '待交'] 或 [{ label, value, count, disabled }]
 *   size       ''(34px) | 'sm'(30px)
 *   label      无障碍组名（默认「分段切换」）
 * 事件：update:modelValue
 *
 * 用法：
 *   <MSeg v-model="filter" :options="[{label:'全部',value:''},{label:'待交',value:'pending',count:2}]" />
 */
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  options: { type: Array, default: () => [] },
  size: { type: String, default: '' },
  label: { type: String, default: '分段切换' },
});

const emit = defineEmits(['update:modelValue']);

const items = computed(() =>
  (props.options || []).map((option) => {
    if (typeof option === 'object' && option !== null) {
      return {
        label: String(option.label == null ? option.value : option.label),
        value: option.value,
        count: option.count,
        disabled: !!option.disabled,
      };
    }
    return { label: String(option), value: option, count: null, disabled: false };
  })
);

function select(item) {
  if (item.disabled) return;
  emit('update:modelValue', item.value);
}
</script>

<template>
  <div class="seg" :class="{ 'seg--sm': size === 'sm' }" role="group" :aria-label="label">
    <button
      v-for="(item, index) in items"
      :key="index"
      type="button"
      :class="{ active: item.value === modelValue }"
      :aria-pressed="item.value === modelValue"
      :disabled="item.disabled"
      @click="select(item)"
    >
      {{ item.label }}
      <span v-if="item.count != null" class="count">{{ item.count }}</span>
    </button>
  </div>
</template>
