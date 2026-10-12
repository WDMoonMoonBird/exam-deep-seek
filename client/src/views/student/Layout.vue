<template>
  <a-layout class="layout" data-density="comfortable">
    <!-- B3-1 ⑤ 跳过导航直达主内容（绝对定位移出视口：不参与布局，Tab 聚焦时出现） -->
    <a class="skip-link" href="#main-content">跳到主内容</a>
    <!-- role=complementary / banner：见 teacher/Layout.vue 同处注释（section 内的 aside/header 会被降级） -->
    <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible :width="SIDER_WIDTH" :collapsedWidth="sidebarCollapsedWidth" breakpoint="lg" role="complementary" aria-label="侧栏">
      <div class="logo">
        <img src="../../assets/logo.svg" class="logo-img" alt="logo" />
        <span v-show="!collapsed" class="logo-text"><span class="logo-line1">Deadpan</span><span class="logo-line2">判题</span></span>
      </div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline" @click="onMenuClick">
        <a-menu-item key="/student/assignments"><template #icon><ReadOutlined /></template><span>作业列表</span></a-menu-item>
        <a-menu-item key="/student/scores"><template #icon><TrophyOutlined /></template><span>查看成绩</span></a-menu-item>
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
              <!-- 第二行与第一行重复时不渲染（见 teacher/Layout.vue 同处说明） -->
              <span v-if="roleLine !== (user?.realName || user?.username)" class="user-sub">{{ roleLine }}</span>
            </span>
            <CaretDownOutlined class="user-caret" />
          </div>
          <template #overlay>
            <a-menu @click="handleMenu">
              <a-menu-item key="profile"><UserOutlined /> 我的信息</a-menu-item>
              <a-sub-menu key="theme" title="主题">
                <template #icon><BulbOutlined /></template>
                <a-menu-item key="theme-light">浅色{{ themeMode === 'light' ? ' ✓' : '' }}</a-menu-item>
                <a-menu-item key="theme-dark">深色{{ themeMode === 'dark' ? ' ✓' : '' }}</a-menu-item>
                <a-menu-item key="theme-system">跟随系统{{ themeMode === 'system' ? ' ✓' : '' }}</a-menu-item>
              </a-sub-menu>
              <a-menu-item key="logout"><PoweroffOutlined /> 退出登录</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-layout-header>
      <a-layout-content class="content" id="main-content" ref="mainRef">
        <!-- B3-1 ⑤ 页面 H1：镜像当前页真实标题（页内标题元素 → 侧栏菜单名兜底），视觉隐藏 -->
        <h1 v-if="pageTitle" class="visually-hidden">{{ pageTitle }}</h1>
        <router-view v-slot="{ Component }">
          <transition name="tab-fade" mode="out-in"><component :is="Component" /></transition>
        </router-view>
      </a-layout-content>
    </a-layout>

    <!-- 我的信息（列表样式 v2 同期改造）：520 宽 + 标题（补上 a11y 缺失的可访问名）；
         名片区只放姓名 + 角色徽标（学校/班级在下方的资料区，长校名不再挤破名片）；
         多班级用 chip 列表，不再重复 N 行「班级」标签。 -->
    <a-modal v-model:open="showProfile" :width="520" :footer="null" :destroyOnClose="true" title="我的信息" @cancel="resetPwdForm">
      <ProfileCard
        v-model:open="pwdOpen"
        :name="user?.realName || user?.username || ''"
        role="student"
        id-label="学号"
        :id-value="user?.username || ''"
        :classes="classNames"
        :school="schoolName"
        hint="建议每学期更换一次"
      >
        <a-form layout="vertical" :model="pwdForm" size="small" class="pwd-form">
          <a-form-item label="原密码"><a-input-password v-model:value="pwdForm.oldPassword" /></a-form-item>
          <a-form-item label="新密码"><a-input-password v-model:value="pwdForm.newPassword" /></a-form-item>
          <a-form-item label="确认新密码"><a-input-password v-model:value="pwdForm.confirmPassword" /></a-form-item>
          <a-button type="primary" :loading="changingPwd" block @click="changePassword">确认修改</a-button>
        </a-form>
      </ProfileCard>
    </a-modal>
  </a-layout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUpdated, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user.js';
import { message } from 'ant-design-vue';
import { useConfirm } from '../../composables/useConfirm.js';
import { useTheme } from '../../composables/useTheme.js';
import ThemeToggle from '../../components/ThemeToggle.vue';
import ProfileCard from '../../components/ProfileCard.vue';
import request from '../../api/request.js';
import { ReadOutlined, TrophyOutlined, UserOutlined, BulbOutlined, PoweroffOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CaretDownOutlined } from '@ant-design/icons-vue';

const router = useRouter(); const route = useRoute(); const userStore = useUserStore();
const { confirm } = useConfirm();
const { mode: themeMode, setMode } = useTheme();
const user = userStore.user;
const collapsed = ref(false);

/* ===== B3-1 ⑤ 无障碍骨架：页面 H1（page-has-heading-one 改前每页 1 命中）=====
 * 优先镜像主内容区里的页内标题元素（.page-title / 作答页 .sp-title），取不到时退化为侧栏菜单名（真实标题）。 */
const mainRef = ref(null);
const pageTitle = ref('');
const MENU_TITLES = { '/student/assignments': '作业列表', '/student/scores': '查看成绩' };
function syncPageTitle() {
  // a-layout-content 是 antd 组件：模板 ref 拿到组件实例，$el 才是它渲染的 <main> 元素
  const root = (mainRef.value && mainRef.value.$el) || mainRef.value;
  if (!root || typeof root.querySelector !== 'function') return;
  const el = root.querySelector('.page-title, .sp-title, h1:not(.visually-hidden), h2:not(.visually-hidden)');
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
watch(() => route.path, (p) => {
  if (p.startsWith('/student/assignments')) selectedKeys.value = ['/student/assignments'];
  else if (p.startsWith('/student/scores')) selectedKeys.value = ['/student/scores'];
  else selectedKeys.value = [p];
  collapsed.value = p.includes('/student/assignments/');
});
function onMenuClick ({ key }) {
  router.push(key);
  if (window.innerWidth < 992) collapsed.value = true;
}

const showProfile = ref(false);
const profile = reactive({ classes: null });
const schoolName = ref('');

const displayUsername = computed(() => {
  const u = user?.username || '';
  const at = u.lastIndexOf('@');
  return at > 0 ? u.substring(0, at) : u;
});

/* 顶栏用户菜单第二行「身份 · 单位」：姓名独占第一行，原来挤在第一行的学校/学号挪到这里。
   学校名要等 /student/profile 返回，未到手时退回显示学号，避免第二行空白。 */
const roleLine = computed(() => '学生' + (schoolName.value ? ` · ${schoolName.value}` : (displayUsername.value ? ` · ${displayUsername.value}` : '')));

async function loadSchoolName() {
  try {
    const r = await request.get('/student/profile');
    const classes = r.data?.classes || [];
    if (classes.length) schoolName.value = classes[0].schoolName || '';
  } catch {}
}

onMounted(() => { loadSchoolName(); });
const pwdOpen = ref(false);   // 「修改密码」分区是否展开（原折叠面板 activeKey 的替代）
/** 名片资料区用：多班级 → 名称数组（学校复用页面已有的 schoolName ref，来源同 /student/profile，未新增字段） */
const classNames = computed(() => (profile.classes || []).map((c) => c.className));
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const changingPwd = ref(false);

function resetPwdForm() {
  pwdOpen.value = false;
  pwdForm.oldPassword = '';
  pwdForm.newPassword = '';
  pwdForm.confirmPassword = '';
}
async function changePassword() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) return message.warn('请填写密码');
  if (pwdForm.newPassword !== pwdForm.confirmPassword) return message.warn('两次新密码不一致');
  changingPwd.value = true;
  try {
    await request.put('/auth/password', { oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword });
    message.success('密码修改成功');
    resetPwdForm();
  } catch (e) {
    message.error(e?.response?.data?.message || '修改失败');
  } finally { changingPwd.value = false; }
}

async function openProfile() {
  showProfile.value = true;
  if (!profile.classes) {
    try {
      const r = await request.get('/student/profile');
      profile.classes = r.data.classes || [];
    } catch { /* ignore */ }
  }
}

function handleMenu({ key }) {
  if (key === 'profile') { openProfile(); return; }
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

/* 我的信息：排版全部在 components/ProfileCard.vue，这里只给安全区里的表单留一点上间距 */
.pwd-form { padding-top: var(--space-3); }

@media (max-width: 768px) {
  .topbar { padding: 0 var(--space-3); }
  .content { padding: calc(var(--layout-topbar-h) + var(--space-4)) var(--space-3) var(--space-6); }
  /* 窄屏只留头像 + 箭头：姓名与身份·单位整块隐藏 */
  .user-meta { display: none; }
}
</style>
