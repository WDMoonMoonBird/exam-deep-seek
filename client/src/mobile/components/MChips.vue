<script setup>
/**
 * MChips —— 横向筛选胶囊（契约 §4 · 设计稿 .chips/.chip）
 *
 * props:
 *   modelValue 选中值；multiple 时是数组（v-model）
 *   options    ['全部', '客观题'] 或 [{ label, value, count, disabled }]
 *   multiple   多选（默认 false）
 *   wrap       换行展示（默认横向滚动）
 *   label      无障碍组名（默认「筛选」）
 * 事件：update:modelValue
 *
 * 用法：
 *   <MChips v-model="type" :options="['全部', {label:'单选题', value:'single'}]" />
 *   <MChips v-model="types" multiple :options="typeOptions" />
 */
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean, Array], default: '' },
  options: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  wrap: { type: Boolean, default: false },
  label: { type: String, default: '筛选' },
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

const selectedList = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

function isActive(item) {
  if (props.multiple) return selectedList.value.indexOf(item.value) >= 0;
  return item.value === props.modelValue;
}

function select(item) {
  if (item.disabled) return;
  if (!props.multiple) {
    emit('update:modelValue', item.value);
    return;
  }
  const next = selectedList.value.slice();
  const at = next.indexOf(item.value);
  if (at >= 0) next.splice(at, 1);
  else next.push(item.value);
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="chips" :class="{ 'chips--wrap': wrap }" role="group" :aria-label="label">
    <button
      v-for="(item, index) in items"
      :key="index"
      type="button"
      class="chip"
      :class="{ active: isActive(item) }"
      :aria-pressed="isActive(item)"
      :disabled="item.disabled"
      @click="select(item)"
    >
      {{ item.label }}
      <span v-if="item.count != null" class="count">{{ item.count }}</span>
    </button>
  </div>
</template>
