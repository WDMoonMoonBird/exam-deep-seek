<script setup>
/**
 * DownloadMenu —— 欢迎页下载按钮（系统识别 + 平台下拉）
 *
 * 默认按钮下载当前系统安装包；右侧箭头展开 macOS / Windows / Android 三个选项。
 * URL 统一走站点 base（生产 /exam/download/...），不写死域名/IP。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { withAppBase } from '../domain/appPath.js';
import { DOWNLOADS, detectPlatform, defaultDownloadFor } from '../domain/downloadTargets.js';

const items = DOWNLOADS;
const rootRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});
const open = ref(false);
const currentPlatform = ref('unknown');

const defaultItem = computed(() => defaultDownloadFor(currentPlatform.value, items));
const mainLabel = computed(() => (defaultItem.value ? '下载 ' + defaultItem.value.label + ' 版' : '下载客户端'));

function hrefFor(item) {
  return withAppBase('/download/' + item.file);
}

/** 面板 fixed + Teleport 到 body，避免被 .hero 的 overflow:hidden 裁切 */
function positionPanel() {
  const root = rootRef.value;
  if (!root || typeof window === 'undefined') return;
  const rect = root.getBoundingClientRect();
  const width = Math.min(300, Math.max(220, window.innerWidth - 32));
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
  const panelHeight = 260;
  const below = window.innerHeight - rect.bottom;
  const top = below < panelHeight && rect.top > panelHeight
    ? Math.max(8, rect.top - panelHeight - 10)
    : rect.bottom + 10;
  panelStyle.value = { top: top + 'px', left: left + 'px', width: width + 'px' };
}

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function onDocPointerdown(event) {
  if (!open.value) return;
  const root = rootRef.value;
  const panel = panelRef.value;
  if (root && root.contains(event.target)) return;
  if (panel && panel.contains(event.target)) return;
  close();
}

function onDocKeydown(event) {
  if (event.key === 'Escape') close();
}

function onViewportChange() {
  if (open.value) positionPanel();
}

watch(open, (isOpen) => {
  if (isOpen) nextTick(positionPanel);
});

onMounted(() => {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  currentPlatform.value = detectPlatform({
    userAgent: nav ? nav.userAgent : '',
    platform: nav ? nav.platform : '',
    userAgentDataPlatform: nav && nav.userAgentData ? nav.userAgentData.platform : '',
  });
  document.addEventListener('pointerdown', onDocPointerdown);
  document.addEventListener('keydown', onDocKeydown);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerdown);
  document.removeEventListener('keydown', onDocKeydown);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
});
</script>

<template>
  <div ref="rootRef" class="dl-menu">
    <div class="dl-split">
      <a
        v-if="defaultItem"
        class="dl-main"
        :href="hrefFor(defaultItem)"
        :download="defaultItem.file"
        @click="close"
      >
        <svg class="dl-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v10m0 0 4.2-4.2M12 13 7.8 8.8M5 18.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{{ mainLabel }}</span>
      </a>
      <button v-else type="button" class="dl-main" :aria-expanded="open" aria-haspopup="menu" aria-controls="download-platform-menu" @click="toggle">
        <svg class="dl-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v10m0 0 4.2-4.2M12 13 7.8 8.8M5 18.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{{ mainLabel }}</span>
      </button>
      <button
        type="button"
        class="dl-caret"
        aria-label="选择其他平台的安装包"
        aria-haspopup="menu"
        :aria-expanded="open"
        aria-controls="download-platform-menu"
        @click="toggle"
      >
        <svg class="dl-chevron" :class="{ 'is-open': open }" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <Transition name="dl-pop">
        <div v-if="open" id="download-platform-menu" ref="panelRef" class="dl-panel" :style="panelStyle" role="menu" aria-label="选择安装包">
        <p class="dl-panel-title">选择适合你的安装包</p>
        <a
          v-for="item in items"
          :key="item.id"
          class="dl-item"
          :class="{ 'is-current': item.id === currentPlatform }"
          role="menuitem"
          :href="hrefFor(item)"
          :download="item.file"
          @click="close"
        >
          <span class="dl-badge" aria-hidden="true">{{ item.kind }}</span>
          <span class="dl-copy">
            <strong>{{ item.title }}</strong>
            <small>{{ item.note }}</small>
          </span>
          <span v-if="item.id === currentPlatform" class="dl-current">推荐</span>
        </a>
          <p class="dl-panel-note">macOS 为 Apple 芯片版；Windows 为 64 位安装包。</p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dl-menu { position: relative; display: inline-flex; }
.dl-split { display: inline-flex; align-items: stretch; overflow: hidden; background: #fff; color: #111827;
  border: 1px solid rgba(17, 24, 39, .12); border-radius: 999px; box-shadow: 0 8px 24px rgba(17, 24, 39, .12); }
.dl-main { display: inline-flex; align-items: center; gap: 9px; min-height: 46px; padding: 0 18px;
  border: 0; background: transparent; color: inherit; font: inherit; font-size: 14px; font-weight: 650;
  text-decoration: none; cursor: pointer; white-space: nowrap; }
.dl-main:hover { background: #f3f4f6; }
.dl-main:active { background: #e9ebef; }
.dl-icon { width: 18px; height: 18px; flex: none; }
.dl-caret { width: 44px; display: grid; place-items: center; border: 0; border-left: 1px solid #e5e7eb;
  background: #f7f8fa; color: inherit; cursor: pointer; }
.dl-caret:hover { background: #eef0f4; }
.dl-chevron { width: 18px; height: 18px; transition: transform .18s ease; }
.dl-chevron.is-open { transform: rotate(180deg); }
.dl-panel { position: fixed; top: 0; left: 0; z-index: 1000; width: 300px; padding: 8px;
  background: #fff; color: #111827; border: 1px solid rgba(17, 24, 39, .1); border-radius: 16px;
  box-shadow: 0 18px 50px rgba(17, 24, 39, .18); }
.dl-panel-title { margin: 6px 10px 8px; font-size: 12px; font-weight: 650; letter-spacing: .02em; color: #6b7280; }
.dl-item { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; color: inherit; text-decoration: none; }
.dl-item:hover, .dl-item:focus-visible { background: #f3f4f6; outline: none; }
.dl-item.is-current { background: #eef4ff; }
.dl-badge { display: grid; place-items: center; width: 38px; height: 38px; flex: none; border-radius: 10px;
  background: #f0f2f5; color: #4b5563; font-size: 9px; font-weight: 750; letter-spacing: .04em; }
.dl-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dl-copy strong { font-size: 13px; font-weight: 650; line-height: 1.3; }
.dl-copy small { font-size: 11.5px; color: #6b7280; line-height: 1.35; }
.dl-current { margin-left: auto; flex: none; padding: 2px 7px; border-radius: 999px; background: #dbeafe;
  color: #1d4ed8; font-size: 10px; font-weight: 650; }
.dl-panel-note { margin: 8px 10px 4px; font-size: 11px; line-height: 1.5; color: #9ca3af; }
.dl-pop-enter-active, .dl-pop-leave-active { transition: opacity .16s ease, transform .16s ease; }
.dl-pop-enter-from, .dl-pop-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 640px) {
  .dl-menu { width: 100%; }
  .dl-split { width: 100%; }
  .dl-main { flex: 1; justify-content: center; padding: 0 12px; min-height: 42px; }
}

@media (prefers-reduced-motion: reduce) {
  .dl-chevron, .dl-pop-enter-active, .dl-pop-leave-active { transition: none; }
}
</style>
