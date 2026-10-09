<script setup>
/**
 * ThemeToggle —— 顶栏常驻主题切换按钮（Wave 5 · t38）
 *
 * 为什么自绘 SVG：@ant-design/icons-vue 7.0.1 没有 sun/moon 图标（只有 Bulb 系列），
 * 按任务书允许的做法自绘内联 SVG，颜色走 currentColor（由 .theme-toggle 的令牌色决定）。
 * 行为：点击调用 useTheme().toggle() —— 在 light/dark 之间切换并写成**显式模式**
 * （system 下点一下即变为显式 light/dark，并写入 localStorage['ui-theme']）。
 * 下拉菜单里的「浅色/深色/跟随系统」三项保留，负责显式选择 system；两处共用同一份
 * 模块级单例状态，故菜单里的当前项标记会跟着按钮同步。
 * 可访问性：原生 <button>（Tab 可聚焦、Enter/Space 触发），aria-label 同时说明
 * 「当前状态 + 点击后的动作 + 是否跟随系统」。
 */
import { computed } from 'vue';
import { useTheme } from '../composables/useTheme.js';

const { mode, resolved, toggle } = useTheme();
const isDark = computed(() => resolved.value === 'dark');
const ariaLabel = computed(() => {
  const cur = isDark.value ? '深色' : '浅色';
  const next = isDark.value ? '浅色' : '深色';
  const sys = mode.value === 'system' ? '，当前跟随系统' : '';
  return '切换主题：当前' + cur + '主题' + sys + '，点击切换为' + next + '主题';
});
</script>

<template>
  <a-tooltip title="切换主题" placement="bottom">
    <button type="button" class="theme-toggle" :aria-label="ariaLabel" @click="toggle()">
      <svg v-if="isDark" class="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
      </svg>
      <svg v-else class="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M20 14.6A8.6 8.6 0 1 1 9.4 4a6.9 6.9 0 0 0 10.6 10.6z" />
      </svg>
    </button>
  </a-tooltip>
</template>

<style scoped>
.theme-toggle {
  /* 顶栏是 justify-content: space-between：auto 外边距把按钮挤到右侧、紧邻用户区 */
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--layout-topbar-h);
  height: var(--layout-topbar-h);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--fs-title-2);
  cursor: pointer;
  transition: var(--transition-control);
}
.theme-toggle:hover { color: var(--text-primary); }
.theme-toggle:focus { outline: 2px solid var(--border-focus); outline-offset: -2px; }
.theme-toggle-icon { width: 1em; height: 1em; display: block; }
</style>
