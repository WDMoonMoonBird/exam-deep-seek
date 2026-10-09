<template>
  <a-layout class="layout" data-density="compact">
    <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible :width="SIDER_WIDTH" :collapsedWidth="sidebarCollapsedWidth" breakpoint="lg">
      <div class="logo">
        <img src="../../assets/logo.svg" class="logo-img" alt="logo" />
        <span v-show="!collapsed" class="logo-text"><span class="logo-line1">Deadpan</span><span class="logo-line2">判题</span></span>
      </div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline" @click="onMenuClick">
        <!-- 导航分组与顺序：docs/ui-redesign/01-information-architecture.md §2.2 -->
        <a-menu-item-group key="organization" title="组织">
          <a-menu-item key="/admin/schools"><template #icon><BankOutlined /></template><span>学校管理</span></a-menu-item>
          <a-menu-item key="/admin/classes"><template #icon><AppstoreOutlined /></template><span>班级管理</span></a-menu-item>
          <a-menu-item key="/admin/teachers"><template #icon><TeamOutlined /></template><span>教师管理</span></a-menu-item>
          <a-menu-item key="/admin/students"><template #icon><IdcardOutlined /></template><span>学生管理</span></a-menu-item>
        </a-menu-item-group>
        <a-menu-item-group key="system" title="系统">
          <a-menu-item key="/admin/monitor"><template #icon><DashboardOutlined /></template><span>系统监控</span></a-menu-item>
          <a-menu-item key="/admin/ai-config"><template #icon><RobotOutlined /></template><span>AI 配置</span></a-menu-item>
        </a-menu-item-group>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-header class="topbar app-topbar">
        <div class="topbar-left">
          <MenuUnfoldOutlined v-if="collapsed" class="trigger" @click="collapsed = false" />
          <MenuFoldOutlined v-else class="trigger" @click="collapsed = true" />
        </div>
        <a-dropdown>
          <div class="user-area">
            <a-avatar size="small" class="user-avatar">{{ user?.realName?.charAt(0) }}</a-avatar>
            <span class="user-name">{{ user?.realName }}</span>
            <CaretDownOutlined class="user-caret" />
          </div>
          <template #overlay>
            <a-menu @click="handleMenu">
              <a-menu-item key="logout">退出登录</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-layout-header>
      <a-layout-content class="content">
        <router-view v-slot="{ Component }">
          <transition name="tab-fade" mode="out-in"><component :is="Component" /></transition>
        </router-view>
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user.js';
import { BankOutlined, AppstoreOutlined, TeamOutlined, IdcardOutlined, DashboardOutlined, RobotOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CaretDownOutlined } from '@ant-design/icons-vue';
import { useConfirm } from '../../composables/useConfirm.js';

const router = useRouter(); const route = useRoute(); const userStore = useUserStore();
const { confirm } = useConfirm();
const user = userStore.user;
const collapsed = ref(false);

/** 侧栏宽度取自令牌：232 / 折叠 64（docs/ui-redesign/03-components.md §3.4） */
const SIDER_WIDTH = 'var(--layout-sider-w)';
const SIDER_COLLAPSED_WIDTH = 'var(--layout-sider-w-collapsed)';
/** <992px 时侧栏完全收起（保持原有响应式行为，宽度仍由令牌决定） */
const sidebarCollapsedWidth = ref(window.innerWidth < 992 ? 0 : SIDER_COLLAPSED_WIDTH);
window.addEventListener('resize', () => { sidebarCollapsedWidth.value = window.innerWidth < 992 ? 0 : SIDER_COLLAPSED_WIDTH; });
const selectedKeys = ref([route.path]);
watch(() => route.path, (p) => { selectedKeys.value = [p]; });
function onMenuClick ({ key }) {
  router.push(key);
  if (window.innerWidth < 992) collapsed.value = true;
}

function handleMenu({ key }) {
  if (key === 'logout') {
    confirm({
      title: '确定退出登录？',
      content: '退出后需重新输入用户名和密码',
      okText: '退出登录',
      cancelText: '取消',
      onOk: () => { userStore.logout(); router.push('/login'); },
    });
  }
}
</script>

<style scoped>
.layout { height: 100vh; overflow: hidden; }
.layout :deep(.ant-layout) { overflow: hidden; position: relative; }
.layout :deep(.ant-layout-sider) { overflow-y: auto; }
.logo { display: flex; align-items: center; gap: var(--space-2); height: var(--layout-topbar-h); padding: 0 var(--space-6); overflow: hidden; white-space: nowrap; }
.logo-img { width: 32px; height: 32px; flex-shrink: 0; }
.logo-text { color: var(--text-inverse); font-family: var(--font-display); font-weight: var(--fw-semibold); letter-spacing: var(--tracking-tight); display: flex; flex-direction: column; line-height: 1.2; }
.logo-line1 { font-size: var(--fs-body); opacity: 0.85; }
.logo-line2 { font-size: var(--fs-title-2); }
.topbar { background: var(--topbar-bg); border-bottom: 1px solid var(--topbar-bd); padding: 0 var(--space-6); display: flex; align-items: center; justify-content: space-between; height: var(--layout-topbar-h); position: absolute; top: 0; left: 0; right: 0; z-index: var(--z-topbar); transform: translate3d(0, 0, 0); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); }
@supports not (backdrop-filter: blur(1px)) {
  .topbar { -webkit-backdrop-filter: none; backdrop-filter: none; }
}
.topbar-left { display: flex; align-items: center; }
.trigger { font-size: var(--fs-title-2); line-height: var(--layout-topbar-h); padding: 0 var(--space-3); cursor: pointer; transition: var(--transition-control); }
.trigger:hover { color: var(--text-link); }
.user-area { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; padding: var(--space-1) var(--space-2); border-radius: var(--radius-md); }
.user-avatar { background: var(--brand-600); flex-shrink: 0; }
.user-name { font-size: var(--fs-body); color: var(--text-primary); }
.user-caret { font-size: var(--fs-caption); color: var(--text-tertiary); }
.content { padding: calc(var(--layout-topbar-h) + var(--space-6)) var(--space-12) var(--space-10); background: var(--bg-canvas); overflow-y: auto; height: 100%; }

@media (max-width: 768px) {
  .topbar { padding: 0 var(--space-3); }
  .content { padding: calc(var(--layout-topbar-h) + var(--space-4)) var(--space-3) var(--space-6); }
  .user-name { display: none; }
}
</style>
