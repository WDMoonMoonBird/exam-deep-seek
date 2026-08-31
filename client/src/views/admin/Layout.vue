<template>
  <a-layout class="layout">
    <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible :width="160" :collapsedWidth="sidebarCollapsedWidth" breakpoint="lg">
      <div class="logo">
        <img src="../../assets/logo.svg" class="logo-img" alt="logo" />
        <span v-show="!collapsed" class="logo-text"><span class="logo-line1">Deadpan</span><span class="logo-line2">判题</span></span>
      </div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline" @click="onMenuClick">
        <a-menu-item key="/admin/schools"><template #icon><BankOutlined /></template><span>学校管理</span></a-menu-item>
        <a-menu-item key="/admin/classes"><template #icon><AppstoreOutlined /></template><span>班级管理</span></a-menu-item>
        <a-menu-item key="/admin/teachers"><template #icon><TeamOutlined /></template><span>教师管理</span></a-menu-item>
        <a-menu-item key="/admin/students"><template #icon><IdcardOutlined /></template><span>学生管理</span></a-menu-item>
        <a-menu-item key="/admin/monitor"><template #icon><DashboardOutlined /></template><span>系统监控</span></a-menu-item>
        <a-menu-item key="/admin/ai-config"><template #icon><RobotOutlined /></template><span>AI 配置</span></a-menu-item>
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
import { Modal } from 'ant-design-vue';

const router = useRouter(); const route = useRoute(); const userStore = useUserStore();
const user = userStore.user;
const collapsed = ref(false);
const sidebarCollapsedWidth = ref(window.innerWidth < 992 ? 0 : 80);
window.addEventListener('resize', () => { sidebarCollapsedWidth.value = window.innerWidth < 992 ? 0 : 80; });
const selectedKeys = ref([route.path]);
watch(() => route.path, (p) => { selectedKeys.value = [p]; });
function onMenuClick ({ key }) {
  router.push(key);
  if (window.innerWidth < 992) collapsed.value = true;
}

function handleMenu({ key }) {
  if (key === 'logout') {
    Modal.confirm({ title: '确定退出登录？', content: '退出后需重新输入用户名和密码', okText: '确定', cancelText: '取消', onOk: () => { userStore.logout(); router.push('/login'); } });
  }
}
</script>

<style scoped>
.layout { height: 100vh; overflow: hidden; }
.layout :deep(.ant-layout) { overflow: hidden; position: relative; }
.layout :deep(.ant-layout-sider) { overflow-y: auto; }
.logo { display: flex; align-items: center; gap: 10px; height: 64px; padding: 0 24px; overflow: hidden; white-space: nowrap; }
.logo-img { width: 32px; height: 32px; flex-shrink: 0; }
.logo-text { color: #fff; font-family: var(--font-display); font-weight: 600; letter-spacing: -0.28px; display: flex; flex-direction: column; line-height: 1.2; }
.logo-line1 { font-size: 14px; opacity: 0.85; }
.logo-line2 { font-size: 18px; }
.topbar { background: rgba(255, 255, 255, 0.92); padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 52px; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.15); position: absolute; top: 0; left: 0; right: 0; z-index: 10; transform: translate3d(0, 0, 0); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); }
@supports not (backdrop-filter: blur(1px)) {
  .topbar { -webkit-backdrop-filter: none; backdrop-filter: none; }
}
.topbar-left { display: flex; align-items: center; }
.trigger { font-size: 18px; line-height: 52px; padding: 0 12px; cursor: pointer; transition: color 0.3s; }
.trigger:hover { color: var(--blue); }
.user-area { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 8px; border-radius: var(--radius-sm); }
.user-avatar { background: var(--blue); flex-shrink: 0; }
.user-name { font-size: 14px; color: var(--ink); }
.user-caret { font-size: 10px; color: var(--ink-muted); }
.content { padding: 80px 48px 40px; background: var(--canvas-parchment); overflow-y: auto; height: 100%; }

@media (max-width: 768px) {
  .topbar { padding: 0 12px; }
  .content { padding: 72px 12px 24px; }
  .user-name { display: none; }
  .ant-table { font-size: 13px; }
}
</style>
