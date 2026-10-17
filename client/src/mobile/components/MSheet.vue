<script setup>
/**
 * MSheet —— 底部抽屉（契约 §4：v-model:open + title）
 *
 * props:
 *   open        是否打开（v-model:open）
 *   title       标题
 *   subtitle    副标题 / 说明
 *   showClose   是否显示右上角关闭按钮（默认 true）
 *   closeOnMask 点击遮罩是否关闭（默认 true）
 * 事件：update:open / close
 * 插槽：默认（主体）、#foot（底部按钮区）
 *
 * 用法：
 *   <MSheet v-model:open="sheetOpen" title="答题卡" subtitle="共 6 题">
 *     …内容…
 *     <template #foot>
 *       <button type="button" class="btn btn--primary btn--block" @click="sheetOpen = false">继续作答</button>
 *     </template>
 *   </MSheet>
 *
 * 无障碍：role="dialog" aria-modal="true"；打开时聚焦面板、Esc 关闭、关闭后焦点归还；
 * 关闭态用 visibility 隐藏（不影响过渡动画）避免键盘焦点落在屏幕外。
 */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import MIcon from './MIcon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  showClose: { type: Boolean, default: true },
  closeOnMask: { type: Boolean, default: true },
});

const emit = defineEmits(['update:open', 'close']);

const everOpened = ref(props.open);
const sheetEl = ref(null);
let lastFocused = null;

function onKeydown(event) {
  if (event.key === 'Escape' && props.open) {
    event.stopPropagation();
    close();
  }
}

function bindKeys() {
  if (typeof document === 'undefined') return;
  document.addEventListener('keydown', onKeydown, true);
}

function unbindKeys() {
  if (typeof document === 'undefined') return;
  document.removeEventListener('keydown', onKeydown, true);
}

watch(
  () => props.open,
  (next) => {
    if (next) {
      everOpened.value = true;
      lastFocused = typeof document !== 'undefined' ? document.activeElement : null;
      bindKeys();
      nextTick(() => {
        if (sheetEl.value && typeof sheetEl.value.focus === 'function') sheetEl.value.focus();
      });
    } else {
      unbindKeys();
      if (lastFocused && typeof lastFocused.focus === 'function') {
        try { lastFocused.focus(); } catch { /* 焦点归还失败不影响关闭 */ }
      }
      lastFocused = null;
    }
  },
  { immediate: true }
);

onBeforeUnmount(unbindKeys);

function close() {
  emit('update:open', false);
  emit('close');
}

function onMaskClick() {
  if (props.closeOnMask) close();
}
</script>

<template>
  <div v-if="everOpened" class="m-sheet-root">
    <div class="mask" :class="{ open: open }" aria-hidden="true" @click="onMaskClick"></div>
    <section
      ref="sheetEl"
      class="sheet"
      :class="{ open: open }"
      role="dialog"
      aria-modal="true"
      :aria-label="title || '底部面板'"
      :aria-hidden="open ? undefined : 'true'"
      tabindex="-1"
    >
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <div>
          <div class="sheet-title">{{ title }}</div>
          <div v-if="subtitle" class="sheet-sub">{{ subtitle }}</div>
        </div>
        <button v-if="showClose" type="button" class="sheet-close" aria-label="关闭" @click="close">
          <MIcon name="close" />
        </button>
      </div>
      <div class="sheet-body">
        <slot />
      </div>
      <div v-if="$slots.foot" class="sheet-foot">
        <slot name="foot" />
      </div>
    </section>
  </div>
</template>
