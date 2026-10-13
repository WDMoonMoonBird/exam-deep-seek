<template>
  <a-layout class="layout" data-density="compact">
    <!-- B3-1 ⑤ 跳过导航直达主内容（绝对定位移出视口：不参与布局，Tab 聚焦时出现） -->
    <a class="skip-link" href="#main-content">跳到主内容</a>
    <!-- role=complementary / banner：antd 的 a-layout 渲染为 <section>，HTML-AAM 会把 section 内的
         <aside>/<header> 降级为 generic/sectionheader（CDP 实测）→ 显式补地标，region 违规才消除 -->
    <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible :width="SIDER_WIDTH" :collapsedWidth="sidebarCollapsedWidth" breakpoint="lg" role="complementary" aria-label="侧栏">
      <div class="logo">
        <img src="../../assets/logo.svg" class="logo-img" alt="logo" />
        <span v-show="!collapsed" class="logo-text"><span class="logo-line1">Deadpan</span><span class="logo-line2">判题</span></span>
      </div>
      <a-menu ref="navMenuRef" v-model:selectedKeys="selectedKeys" theme="dark" mode="inline" @click="onMenuClick">
        <!-- 导航分组与顺序：docs/ui-redesign/01-information-architecture.md §2.2
             分组标题不用 a-menu-item-group（其 li/ul 无 role，会打断 menuitem 的 ARIA 父子链）；详见 teacher/Layout.vue 同处注释。 -->
        <div key="g-organization" role="presentation" class="ant-menu-item-group-title">组织</div>
          <a-menu-item key="/admin/schools"><template #icon><BankOutlined /></template><span>学校管理</span></a-menu-item>
          <a-menu-item key="/admin/classes"><template #icon><AppstoreOutlined /></template><span>班级管理</span></a-menu-item>
          <a-menu-item key="/admin/teachers"><template #icon><TeamOutlined /></template><span>教师管理</span></a-menu-item>
          <a-menu-item key="/admin/students"><template #icon><IdcardOutlined /></template><span>学生管理</span></a-menu-item>
        <div key="g-system" role="presentation" class="ant-menu-item-group-title">系统</div>
          <a-menu-item key="/admin/monitor"><template #icon><DashboardOutlined /></template><span>系统监控</span></a-menu-item>
          <a-menu-item key="/admin/grading-runs"><template #icon><HistoryOutlined /></template><span>批改记录</span></a-menu-item>
          <a-menu-item key="/admin/ai-config"><template #icon><RobotOutlined /></template><span>AI 配置</span></a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-header class="topbar app-topbar" role="banner">
        <div class="topbar-left">
          <MenuUnfoldOutlined v-if="collapsed" class="trigger" @click="collapsed = false" />
          <MenuFoldOutlined v-else class="trigger" @click="collapsed = true" />
        </div>
        <ThemeToggle />
        <a-dropdown>
          <div class="user-area">
            <a-avatar size="small" class="user-avatar">{{ user?.realName?.charAt(0) }}</a-avatar>
            <span class="user-meta">
              <span class="user-name">{{ user?.realName || user?.username }}</span>
              <!-- 第二行与第一行重复时不渲染（种子超管 realName 就是「超级管理员」，否则会两行同字） -->
              <span v-if="roleLine !== (user?.realName || user?.username)" class="user-sub">{{ roleLine }}</span>
            </span>
            <CaretDownOutlined class="user-caret" />
          </div>
          <template #overlay>
            <a-menu @click="handleMenu">
              <a-sub-menu key="theme" title="主题">
                <template #icon><BulbOutlined /></template>
                <a-menu-item key="theme-light">浅色{{ themeMode === 'light' ? ' ✓' : '' }}</a-menu-item>
                <a-menu-item key="theme-dark">深色{{ themeMode === 'dark' ? ' ✓' : '' }}</a-menu-item>
                <a-menu-item key="theme-system">跟随系统{{ themeMode === 'system' ? ' ✓' : '' }}</a-menu-item>
              </a-sub-menu>
              <a-menu-item key="logout">退出登录</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-layout-header>
      <a-layout-content class="content" id="main-content" ref="mainRef">
        <!-- B3-1 ⑤ 页面 H1：镜像当前页真实标题（页内标题元素 → 侧栏菜单名兜底），视觉隐藏 -->
        <h1 v-if="pageTitle" class="visually-hidden">{{ pageTitle }}</h1>
        <!-- ★R2-B52：错误边界在 transition 之外 + 去掉 out-in（避免"进入组件解析失败"时卡在 out ⇒ 整块空白） -->
        <ErrorBoundary>
          <!-- ★R2-B54：不再用 <transition> 包路由组件；v-slot 内为 **keyed** ErrorBoundary（页面自身抛错也进边界 UI） -->
          <router-view v-slot="{ Component, route }">
            <ErrorBoundary :reset-key="route.fullPath">
              <component :is="Component" />
            </ErrorBoundary>
          </router-view>
        </ErrorBoundary>
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUpdated, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user.js';
import { BankOutlined, AppstoreOutlined, TeamOutlined, IdcardOutlined, DashboardOutlined, RobotOutlined, BulbOutlined, HistoryOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CaretDownOutlined } from '@ant-design/icons-vue';
import { useConfirm } from '../../composables/useConfirm.js';
import { useTheme } from '../../composables/useTheme.js';
import ThemeToggle from '../../components/ThemeToggle.vue';
import ErrorBoundary from '../../components/ErrorBoundary.vue';   // ★R2-B52：错误边界（绝不白屏）

const router = useRouter(); const route = useRoute(); const userStore = useUserStore();
const { confirm } = useConfirm();
const { mode: themeMode, setMode } = useTheme();
const user = userStore.user;
/* 顶栏用户菜单第二行「身份」：管理员分超管与普通管理员（取自登录用户信息里的 role） */
const roleLine = computed(() => (user?.role === 'super_admin' ? '超级管理员' : '管理员'));
const collapsed = ref(false);

/* ===== B3-1 ⑤ 无障碍骨架：页面 H1（page-has-heading-one 改前每页 1 命中）=====
 * 不自造标题：优先镜像主内容区里的页内标题元素（PageShell .page-title），取不到时退化为
 * 侧栏菜单中当前路由那一条的名称（真实标题，非通用词）。隐藏用全局 .visually-hidden（不参与布局）。 */
const mainRef = ref(null);
const pageTitle = ref('');
const MENU_TITLES = {
  '/admin/schools': '学校管理', '/admin/classes': '班级管理', '/admin/teachers': '教师管理',
  '/admin/students': '学生管理', '/admin/monitor': '系统监控', '/admin/ai-config': 'AI 配置',
};
function syncPageTitle() {
  // a-layout-content 是 antd 组件：模板 ref 拿到组件实例，$el 才是它渲染的 <main> 元素
  const root = (mainRef.value && mainRef.value.$el) || mainRef.value;
  if (!root || typeof root.querySelector !== 'function') return;
  const el = root.querySelector('.page-title, h1:not(.visually-hidden), h2:not(.visually-hidden)');
  let t = el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  if (!t) {
    const seg = '/' + route.path.split('/').filter(Boolean).slice(0, 2).join('/');
    t = MENU_TITLES[seg] || '';
  }
  pageTitle.value = t.slice(0, 60);
}
onMounted(() => { syncPageTitle(); });
onUpdated(syncPageTitle);
watch(() => route.path, () => nextTick(syncPageTitle));

/** 侧栏宽度取自令牌：232 / 折叠 64（docs/ui-redesign/03-components.md §3.4） */
const SIDER_WIDTH = 'var(--layout-sider-w)';
const SIDER_COLLAPSED_WIDTH = 'var(--layout-sider-w-collapsed)';
/** <992px 时侧栏完全收起（保持原有响应式行为，宽度仍由令牌决定） */
const sidebarCollapsedWidth = ref(window.innerWidth < 992 ? 0 : SIDER_COLLAPSED_WIDTH);
window.addEventListener('resize', () => { sidebarCollapsedWidth.value = window.innerWidth < 992 ? 0 : SIDER_COLLAPSED_WIDTH; });
const selectedKeys = ref([route.path]);
watch(() => route.path, (p) => { selectedKeys.value = [p]; });

/**
 * T7-O2（QA §3.4「侧栏键盘不可达」）：antd 把菜单项渲染成 li[role=menuitem][tabindex=-1]，
 * 而 ul.ant-menu 默认不可聚焦 → 实测 Tab 循环完全跳过侧栏（轨迹见 b2-contrast/raw/before.json 的 T7O2）。
 * 最小修复：① 菜单容器给一个 Tab 停靠点 + 可读名称；② 容器获得焦点后方向键在菜单项间移动焦点
 * （Enter/Space 激活仍由菜单项自身处理，实测可导航到目标路由）。
 * 不改 DOM 结构、不改 ARIA 角色，菜单项维持 roving tabindex=-1（与 role=menu 模式一致）。
 * 为何用 ref 写属性：tabindex 是 antd Menu 的具名 prop（es/menu/src/Menu.js:42）且组件内部未使用，
 * 写在模板里会被这个 prop 吸收、透传不到 ul。 */
const navMenuRef = ref(null);
onMounted(() => {
  const el = navMenuRef.value && navMenuRef.value.$el;
  if (!el || !el.setAttribute) return;
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', '主导航菜单');
  el.addEventListener('keydown', onMenuKeydown);
});
function onMenuKeydown(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.prototype.slice.call((e.currentTarget || e.target).querySelectorAll('.ant-menu-item:not(.ant-menu-item-disabled)'));
  if (!items.length) return;
  e.preventDefault();
  const cur = items.indexOf(document.activeElement);
  const step = e.key === 'ArrowDown' ? 1 : -1;
  const next = cur < 0 ? (step > 0 ? 0 : items.length - 1) : (cur + step + items.length) % items.length;
  items[next].focus();
}
function onMenuClick ({ key }) {
  router.push(key);
  if (window.innerWidth < 992) collapsed.value = true;
}

function handleMenu({ key }) {
  if (key === 'theme-light') { setMode('light'); return; }
  if (key === 'theme-dark') { setMode('dark'); return; }
  if (key === 'theme-system') { setMode('system'); return; }
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
.logo-text { color: var(--sider-fg-strong); /* 跟随侧栏令牌：浅色主题下侧栏为白面，--text-inverse（白）不可见 */ font-family: var(--font-display); font-weight: var(--fw-semibold); letter-spacing: var(--tracking-tight); display: flex; flex-direction: column; line-height: 1.2; }
.logo-line1 { font-size: var(--fs-body); opacity: 0.85; }
.logo-line2 { font-size: var(--fs-title-2); }
.topbar { background: var(--topbar-bg); border-bottom: 1px solid var(--topbar-bd); color: var(--text-primary); padding: 0 var(--space-6); display: flex; align-items: center; justify-content: space-between; height: var(--layout-topbar-h); position: absolute; top: 0; left: 0; right: 0; z-index: var(--z-topbar); transform: translate3d(0, 0, 0); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); }
@supports not (backdrop-filter: blur(1px)) {
  .topbar { -webkit-backdrop-filter: none; backdrop-filter: none; }
}
.topbar-left { display: flex; align-items: center; }
.trigger { color: var(--text-primary); font-size: var(--fs-title-2); line-height: var(--layout-topbar-h); padding: 0 var(--space-3); cursor: pointer; transition: var(--transition-control); }
.trigger:hover { color: var(--text-link); }
.user-area { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; padding: var(--space-1) var(--space-2); border-radius: var(--radius-md); }
.user-avatar { background: var(--brand-600); flex-shrink: 0; }
.user-meta { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.25; min-width: 0; }
.user-name { font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--text-primary); white-space: nowrap; }
.user-sub { font-size: var(--fs-caption); color: var(--text-tertiary); white-space: nowrap; }
.user-caret { font-size: var(--fs-caption); color: var(--text-tertiary); }
.content { padding: calc(var(--layout-topbar-h) + var(--space-6)) var(--space-12) var(--space-10); background: var(--bg-canvas); overflow-y: auto; height: 100%; }

@media (max-width: 768px) {
  .topbar { padding: 0 var(--space-3); }
  .content { padding: calc(var(--layout-topbar-h) + var(--space-4)) var(--space-3) var(--space-6); }
  /* 窄屏只留头像 + 箭头：姓名与身份整块隐藏 */
  .user-meta { display: none; }
}
</style>
