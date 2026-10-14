<template>
  <!-- ★R2-B52：错误边界（位于 Layout 的 <transition> **之外**）—— 渲染/懒加载失败时显示可见错误与重试，绝不白屏 -->
  <template v-if="!state">
    <slot />
  </template>
  <div v-else class="eb-wrap" role="alert" aria-live="assertive">
    <!-- ★R2-B54：界面**只显示固定友好文案**（原始 err.message 只进 console / 诊断块，绝不当正文） -->
    <a-result status="warning" :title="state.title" :sub-title="friendlyText">
      <template #extra>
        <a-button type="primary" @click="onRetry">重试</a-button>
        <a-button @click="onReload">刷新页面</a-button>
        <a-button @click="onBack">返回上一页</a-button>
        <a-button @click="onHome">回首页</a-button>
        <a-button @click="onCopy">复制诊断信息</a-button>
        <span class="eb-route">路由：{{ state.route }}</span>
        <span v-if="state.component" class="eb-route">组件：{{ state.component }}</span>
      </template>
    </a-result>
    <!-- ★W1（t1）：错误页不再"只告知不诊断" —— 展开即得**可直接复制的字符串堆栈**（路由 + 组件 + 错误消息 + 原始堆栈） -->
    <a-collapse v-model:activeKey="diagPanels" class="eb-diag" :bordered="false">
      <a-collapse-panel key="diag" header="诊断信息（可复制给排查人员）">
        <pre class="eb-diag-pre">{{ state.diagnostics }}</pre>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup>
import { ref, watch, computed, onErrorCaptured } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { boundaryState, clearChunkReloadMark, componentNameOf, isChunkLoadError } from './errorRecovery.js';

const props = defineProps({
  /** 复位信号（默认取当前路由 fullPath）：路由变化 ⇒ 自动清空错误态 ⇒ 后续导航仍可正常渲染（症状核心） */
  resetKey: { type: String, default: '' },
});

const route = useRoute();
const router = useRouter();
const state = ref(null);
const diagPanels = ref([]);
const resetOf = () => props.resetKey || (route && route.fullPath) || '';

/** ★R2-B54：面向用户的固定文案（chunk 类与其它渲染错误各一句；原始错误只在 console / 诊断块） */
const friendlyText = computed(() => (state.value && state.value.chunk
  ? '页面资源加载失败（可能是应用刚更新、缓存过期）。可点「重试」或刷新页面。'
  : '页面渲染出错，请点「重试」；若仍失败请刷新页面，或返回上一页继续其它操作。'));

onErrorCaptured((err, instance, info) => {
  // ★W1：把组件名与 info 一并收进错误态 ⇒ 诊断信息里能直接看到"哪个页面的哪个组件炸了"
  state.value = boundaryState(err, resetOf(), { component: componentNameOf(instance), info });
  // eslint-disable-next-line no-console
  console.error('[R2-B52] ErrorBoundary captured', { route: resetOf(), component: componentNameOf(instance), info, chunk: isChunkLoadError(err), err });
  // ★W1：同时在控制台打印**可直接复制的字符串堆栈**（无需展开界面即可整段复制）
  // eslint-disable-next-line no-console
  console.error(state.value.diagnostics);
  return false;   // 已处理：不再向上抛（避免弹两次）
});

// ★路由变化（点菜单/返回）⇒ 清空错误态：这就是"之后点任何菜单都空白"的根治点
watch(resetOf, () => { state.value = null; });

function onRetry() {
  clearChunkReloadMark(resetOf());   // 清掉防循环标记：允许再次尝试自愈
  diagPanels.value = [];
  state.value = null;                // 先复位再重新渲染；若仍失败会再次进入错误 UI（不会白屏）
}
function onReload() {
  clearChunkReloadMark(resetOf());
  if (typeof window !== 'undefined') window.location.reload();
}

/** ★W1：返回上一页 —— 历史栈为空（直接输 URL 进来）时退化为回首页，保证**永远有一条出路** */
function onBack() {
  try {
    if (typeof window !== 'undefined' && window.history && window.history.length > 1) { router.back(); return; }
  } catch { /* 退化为回首页 */ }
  onHome();
}

/** ★W1：回首页（'/' 是公开路由，登录与否都能进 ⇒ 不会被卡在错误页） */
function onHome() {
  try { router.push('/'); } catch {
    try { if (typeof window !== 'undefined' && window.location) window.location.href = '/'; } catch { /* ignore */ }
  }
}

/**
 * 复制诊断信息：优先 Clipboard API；不可用（非 https / 旧内核 / 无权限）时退回「隐藏 textarea + execCommand」，
 * 两者都失败才提示手动复制（下方折叠面板里的文本可直接选中）。
 */
async function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 落到兜底路径 */ }
  try {
    if (typeof document === 'undefined') return false;
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', 'readonly');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    document.body.removeChild(box);
    return !!ok;
  } catch { return false; }
}

async function onCopy() {
  const text = (state.value && state.value.diagnostics) || '';
  const ok = await copyText(text);
  if (ok) message.success('诊断信息已复制，可直接粘贴给排查人员');
  else message.warning('复制失败：请展开下方「诊断信息」，手动选中文本复制');
}
</script>

<style scoped>
.eb-wrap { padding: 24px 8px; }
.eb-route { margin-left: 10px; color: var(--text-tertiary); font-size: var(--fs-caption); }
.eb-diag { max-width: 860px; margin: 0 auto; }
.eb-diag-pre {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  border-radius: 6px;
  background: var(--fill-quaternary, rgba(0, 0, 0, 0.04));
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
</style>
