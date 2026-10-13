<template>
  <!-- ★R2-B52：错误边界（位于 Layout 的 <transition> **之外**）—— 渲染/懒加载失败时显示可见错误与重试，绝不白屏 -->
  <template v-if="!state">
    <slot />
  </template>
  <div v-else class="eb-wrap" role="alert" aria-live="assertive">
    <!-- ★R2-B54：界面**只显示固定友好文案**（原始 err.message 只进 console，绝不上屏） -->
    <a-result status="warning" :title="state.title" :sub-title="friendlyText">
      <template #extra>
        <a-button type="primary" @click="onRetry">重试</a-button>
        <a-button @click="onReload">刷新页面</a-button>
        <span class="eb-route">路由：{{ state.route }}</span>
      </template>
    </a-result>
  </div>
</template>

<script setup>
import { ref, watch, computed, onErrorCaptured } from 'vue';
import { useRoute } from 'vue-router';
import { boundaryState, clearChunkReloadMark, isChunkLoadError } from './errorRecovery.js';

const props = defineProps({
  /** 复位信号（默认取当前路由 fullPath）：路由变化 ⇒ 自动清空错误态 ⇒ 后续导航仍可正常渲染（症状核心） */
  resetKey: { type: String, default: '' },
});

const route = useRoute();
const state = ref(null);
const resetOf = () => props.resetKey || (route && route.fullPath) || '';

/** ★R2-B54：面向用户的固定文案（chunk 类与其它渲染错误各一句；原始错误只在 console） */
const friendlyText = computed(() => (state.value && state.value.chunk
  ? '页面资源加载失败（可能是应用刚更新、缓存过期）。可点「重试」或刷新页面。'
  : '页面渲染出错，请点「重试」；若仍失败请刷新页面。'));

onErrorCaptured((err) => {
  state.value = boundaryState(err, resetOf());
  // eslint-disable-next-line no-console
  console.error('[R2-B52] ErrorBoundary captured', { route: resetOf(), chunk: isChunkLoadError(err), err });
  return false;   // 已处理：不再向上抛（避免弹两次）
});

// ★路由变化（点菜单/返回）⇒ 清空错误态：这就是"之后点任何菜单都空白"的根治点
watch(resetOf, () => { state.value = null; });

function onRetry() {
  clearChunkReloadMark(resetOf());   // 清掉防循环标记：允许再次尝试自愈
  state.value = null;                // 先复位再重新渲染；若仍失败会再次进入错误 UI（不会白屏）
}
function onReload() {
  clearChunkReloadMark(resetOf());
  if (typeof window !== 'undefined') window.location.reload();
}
</script>

<style scoped>
.eb-wrap { padding: 24px 8px; }
.eb-route { margin-left: 10px; color: var(--text-tertiary); font-size: var(--fs-caption); }
</style>
