<script setup>
/**
 * DownloadMenu —— 欢迎页「下载客户端」（系统识别 + 平台选择）
 *
 * 视觉完全走设计令牌（tokens.css）：高度 40 = .btn，圆角 --radius-md，描边 --card-bd，
 * 面板 --card-bg/--card-bd/--shadow-xl；深浅色自动生效（原实现写死 #fff/#111827，深色下是白块）。
 * 平台图标：内联 SVG（fill=currentColor），不引第三方图标库。
 */
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { withAppBase } from '../domain/appPath.js';
import { DOWNLOADS, detectPlatform, defaultDownloadFor } from '../domain/downloadTargets.js';

const ICONS = {
  android: 'M615.878882 177.494507l42.303478-61.521169c1.811252-2.619664 1.146103-6.252401-1.473561-8.063653l-1.054005-0.726547c-2.619664-1.821485-6.231935-1.146103-8.043187 1.473561l-43.521213 63.291488c-28.427446-12.361539-60.139705-19.268856-93.601818-19.268856-31.753191 0-61.950957 6.221702-89.232301 17.426905l-41.587164-60.477396c-1.801019-2.619664-5.423523-3.284813-8.043187-1.473561l-1.054005 0.726547c-2.619664 1.811252-3.284813 5.443989-1.483794 8.073886l40.215934 58.461483c-63.23009 30.300097-108.664885 88.075964-117.915573 156.299789l438.20018 0C720.552873 265.017886 676.919097 208.296023 615.878882 177.494507zM418.217057 265.621637c-12.054547 0-21.837354-9.813506-21.837354-21.908986 0-12.095479 9.782807-21.898753 21.837354-21.898753 12.06478 0 21.837354 9.803273 21.837354 21.898753C440.054411 255.80813 430.281837 265.621637 418.217057 265.621637zM606.710059 265.621637c-12.054547 0-21.837354-9.813506-21.837354-21.908986 0-12.095479 9.782807-21.898753 21.837354-21.898753 12.06478 0 21.837354 9.803273 21.837354 21.898753C628.547413 255.80813 618.774839 265.621637 606.710059 265.621637zM260.904195 419.506423l0 179.446975c0 30.760584-19.596314 55.933917-43.562145 55.933917l-9.680477 0c-23.955598 0-43.562145-25.173332-43.562145-55.933917l0-179.446975c0-30.760584 19.606547-55.923684 43.562145-55.923684l9.680477 0C241.307881 363.582739 260.904195 388.745838 260.904195 419.506423zM859.896478 420.570661l0 179.446975c0 30.770817-19.596314 55.933917-43.562145 55.933917l-9.680477 0c-23.955598 0-43.562145-25.163099-43.562145-55.933917l0-179.446975c0-30.760584 19.606547-55.923684 43.562145-55.923684l9.680477 0C840.300164 364.646977 859.896478 389.810077 859.896478 420.570661zM732.934878 360.830045l0 354.074178c0 24.579815-20.046568 44.687782-44.554752 44.687782l-36.746926 0 0 102.320387c0 30.760584-19.606547 55.923684-43.562145 55.923684l-9.680477 0c-23.955598 0-43.562145-25.163099-43.562145-55.923684l0-102.320387-81.864496 0 0 101.143585c0 30.760584-19.596314 55.933917-43.562145 55.933917l-9.680477 0c-23.955598 0-43.562145-25.173332-43.562145-55.933917l0-101.143585-40.062438 0c-24.508183 0-44.554752-20.107967-44.554752-44.687782l0-354.074178L732.934878 360.830045z',
  macos: 'M849.124134 704.896288c-1.040702 3.157923-17.300015 59.872622-57.250912 118.190843-34.577516 50.305733-70.331835 101.018741-126.801964 101.909018-55.532781 0.976234-73.303516-33.134655-136.707568-33.134655-63.323211 0-83.23061 32.244378-135.712915 34.110889-54.254671 2.220574-96.003518-54.951543-130.712017-105.011682-70.934562-102.549607-125.552507-290.600541-52.30118-416.625816 36.040844-63.055105 100.821243-103.135962 171.364903-104.230899 53.160757-1.004887 103.739712 36.012192 136.028093 36.012192 33.171494 0 94.357018-44.791136 158.90615-38.089503 27.02654 1.151219 102.622262 11.298324 151.328567 81.891102-3.832282 2.607384-90.452081 53.724599-89.487104 157.76107C739.079832 663.275355 847.952448 704.467523 849.124134 704.896288M633.69669 230.749408c29.107945-35.506678 48.235584-84.314291 43.202964-132.785236-41.560558 1.630127-92.196819 27.600615-122.291231 62.896492-26.609031 30.794353-50.062186 80.362282-43.521213 128.270409C557.264926 291.935955 604.745311 264.949324 633.69669 230.749408',
  windows: 'M490.666667 128v362.666667H128V128h362.666667z m0 768H128v-362.666667h362.666667V896z m42.666666-768H896v362.666667h-362.666667V128z m362.666667 405.333333V896h-362.666667v-362.666667H896z',
};

/** 平台图标：有内置路径用 1024 视图，未知系统回退到通用下载箭头 */
const PlatformIcon = (props) => {
  const d = ICONS[props.id];
  if (d) return h('svg', { viewBox: '0 0 1024 1024', class: 'dl-ico', 'aria-hidden': 'true' }, [h('path', { d, fill: 'currentColor' })]);
  return h('svg', { viewBox: '0 0 24 24', class: 'dl-ico', 'aria-hidden': 'true' }, [
    h('path', { d: 'M12 3v10m0 0 4.2-4.2M12 13 7.8 8.8M5 18.5h14', fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ]);
};
PlatformIcon.props = { id: { type: String, default: '' } };

const props = defineProps({ size: { type: String, default: 'md' } });
const items = DOWNLOADS;
const rootRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});
const open = ref(false);
const currentPlatform = ref('unknown');

const defaultItem = computed(() => defaultDownloadFor(currentPlatform.value, items));
const mainLabel = computed(() => (defaultItem.value ? '下载 ' + defaultItem.value.label + ' 版' : '下载客户端'));
/* 窄屏（≤640）放不下「 版」：保留平台名，去掉后缀，保证不截断 */
const slimLabel = computed(() => (defaultItem.value ? '下载 ' + defaultItem.value.label : '下载客户端'));

function hrefFor(item) { return withAppBase('/download/' + item.file); }

/** 面板 fixed + Teleport 到 body，避免被 .hero 的 overflow:hidden 裁切 */
function positionPanel() {
  const root = rootRef.value;
  if (!root || typeof window === 'undefined') return;
  const rect = root.getBoundingClientRect();
  const width = Math.min(300, Math.max(220, window.innerWidth - 32));
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
  const panelHeight = 250;
  const below = window.innerHeight - rect.bottom;
  const top = below < panelHeight && rect.top > panelHeight
    ? Math.max(8, rect.top - panelHeight - 10)
    : rect.bottom + 8;
  panelStyle.value = { top: top + 'px', left: left + 'px', width: width + 'px' };
}

function toggle() { open.value = !open.value; }
function close() { open.value = false; }

function onDocPointerdown(event) {
  if (!open.value) return;
  const root = rootRef.value;
  const panel = panelRef.value;
  if (root && root.contains(event.target)) return;
  if (panel && panel.contains(event.target)) return;
  close();
}
function onDocKeydown(event) { if (event.key === 'Escape') close(); }
function onViewportChange() { if (open.value) positionPanel(); }

watch(open, (isOpen) => { if (isOpen) nextTick(positionPanel); });

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
  <div ref="rootRef" class="dl" :class="{ 'dl--lg': props.size === 'lg' }">
    <a v-if="defaultItem" class="dl-main" :href="hrefFor(defaultItem)" :download="defaultItem.file" :aria-label="mainLabel" :title="mainLabel" @click="close">
      <PlatformIcon :id="defaultItem.id" />
      <span class="dl-label">{{ mainLabel }}</span>
      <span class="dl-label-slim">{{ slimLabel }}</span>
    </a>
    <button v-else type="button" class="dl-main" :aria-expanded="open" aria-haspopup="menu" aria-controls="dl-panel" :aria-label="mainLabel" :title="mainLabel" @click="toggle">
      <PlatformIcon id="" />
      <span class="dl-label">{{ mainLabel }}</span>
      <span class="dl-label-slim">{{ slimLabel }}</span>
    </button>
    <button
      type="button"
      class="dl-caret"
      aria-label="选择其他平台的安装包"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-controls="dl-panel"
      @click="toggle"
    >
      <svg class="dl-chevron" :class="{ 'is-open': open }" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </div>

  <Teleport to="body">
    <Transition name="dl-pop">
      <div v-if="open" id="dl-panel" ref="panelRef" class="dl-panel" :style="panelStyle" role="menu" aria-label="选择安装包">
        <p class="dl-panel-title">选择适合你的版本</p>
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
          <span class="dl-badge"><PlatformIcon :id="item.id" /></span>
          <span class="dl-copy">
            <strong>{{ item.title }}</strong>
            <small>{{ item.note }} · v{{ item.version }}</small>
          </span>
          <span v-if="item.id === currentPlatform" class="dl-recommend">推荐</span>
          <svg v-else class="dl-go" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>
        <p class="dl-panel-note">macOS 为 Apple 芯片版；Windows 为 64 位安装包。</p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dl { position: relative; display: inline-flex; align-items: stretch; flex: none; height: 40px; overflow: hidden;
  border: 1px solid var(--card-bd); border-radius: var(--radius-md); background: var(--card-bg);
  color: var(--text-primary); vertical-align: middle; }
.dl-main { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; padding: 0 var(--space-4);
  border: 0; background: transparent; color: inherit; font-family: inherit; font-size: var(--fs-body);
  font-weight: var(--fw-medium); text-decoration: none; cursor: pointer; white-space: nowrap;
  transition: background-color var(--duration-fast) var(--ease-out); }
.dl-main:hover { background: var(--bg-hover); }
.dl-main:active { background: var(--bg-active); }
.dl-main:focus-visible { outline: none; box-shadow: var(--ring-focus); }
.dl-label { overflow: hidden; text-overflow: ellipsis; }
.dl-label-slim { display: none; }
.dl-ico { width: 17px; height: 17px; flex: none; color: var(--text-secondary); }
.dl-caret { width: 34px; flex: none; display: grid; place-items: center; border: 0;
  border-left: 1px solid var(--border-subtle); background: var(--bg-surface-2); color: var(--text-secondary);
  cursor: pointer; transition: background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out); }
.dl-caret:hover { background: var(--bg-hover); color: var(--text-primary); }
.dl-caret:focus-visible { outline: none; box-shadow: inset var(--ring-focus); }
.dl--lg { height: 46px; }
.dl--lg .dl-main { padding: 0 var(--space-6); font-size: var(--fs-body-lg); }
.dl--lg .dl-ico { width: 18px; height: 18px; }
.dl--lg .dl-caret { width: 40px; }
.dl-chevron { width: 16px; height: 16px; transition: transform var(--duration-fast) var(--ease-out); }
.dl-chevron.is-open { transform: rotate(180deg); }
.dl-panel { position: fixed; z-index: 1100; padding: 6px; background: var(--card-bg); color: var(--text-primary);
  border: 1px solid var(--card-bd); border-radius: var(--card-radius); box-shadow: var(--shadow-xl); }
.dl-panel-title { margin: 6px 10px 8px; font-size: var(--fs-caption); font-weight: var(--fw-medium);
  letter-spacing: 0.02em; color: var(--text-tertiary); }
.dl-item { display: flex; align-items: center; gap: var(--space-3); padding: 8px 10px; border-radius: var(--radius-md);
  color: inherit; text-decoration: none; transition: background-color var(--duration-fast) var(--ease-out); }
.dl-item:hover, .dl-item:focus-visible { background: var(--bg-surface-2); outline: none; }
.dl-item.is-current { background: var(--brand-50); }
.dl-badge { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border-radius: var(--radius-md);
  background: var(--bg-surface-2); color: var(--text-secondary); }
.dl-badge .dl-ico { width: 20px; height: 20px; }
.dl-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dl-copy strong { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); line-height: 1.35; color: var(--text-strong); }
.dl-copy small { font-size: var(--fs-caption); color: var(--text-tertiary); line-height: 1.35; }
.dl-recommend { margin-left: auto; flex: none; padding: 2px 8px; border-radius: 999px; background: var(--brand-50);
  color: var(--brand-700); font-size: 11px; font-weight: var(--fw-medium); }
.dl-go { margin-left: auto; width: 16px; height: 16px; flex: none; color: var(--text-tertiary); }
.dl-panel-note { margin: 8px 10px 4px; font-size: 11.5px; line-height: 1.5; color: var(--text-tertiary); }
.dl-pop-enter-active, .dl-pop-leave-active { transition: opacity var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out); }
.dl-pop-enter-from, .dl-pop-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 640px) {
  .dl, .dl--lg { flex: 1 1 0; min-width: 0; height: 40px; }
  .dl--lg .dl-main { padding: 0 var(--space-2); font-size: var(--fs-body-sm); }
  .dl-main { flex: 1; justify-content: center; padding: 0 var(--space-2); }
  .dl-label { display: none; }
  .dl-label-slim { display: inline; }
  .dl-caret { width: 30px; }
  .dl-ico { width: 16px; height: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .dl-chevron, .dl-main, .dl-caret, .dl-item, .dl-pop-enter-active, .dl-pop-leave-active { transition: none; }
}
</style>
