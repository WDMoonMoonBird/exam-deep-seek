<template>
  <a-layout class="layout" data-density="comfortable">
    <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible :width="SIDER_WIDTH" :collapsedWidth="sidebarCollapsedWidth" breakpoint="lg">
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
      <a-layout-header class="topbar app-topbar">
        <div class="topbar-left">
          <MenuUnfoldOutlined v-if="collapsed" class="trigger" @click="collapsed = false" />
          <MenuFoldOutlined v-else class="trigger" @click="collapsed = true" />
        </div>
        <a-dropdown>
          <div class="user-area">
            <a-avatar size="small" class="user-avatar">{{ user?.realName?.charAt(0) }}</a-avatar>
            <span class="user-name">{{ user?.realName }}<span class="user-info"> · {{ displayUsername }}{{ schoolName ? ' @ ' + schoolName : '' }}</span></span>
            <CaretDownOutlined class="user-caret" />
          </div>
          <template #overlay>
            <a-menu @click="handleMenu">
              <a-menu-item key="profile"><UserOutlined /> 我的信息</a-menu-item>
              <a-menu-item key="logout"><PoweroffOutlined /> 退出登录</a-menu-item>
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

    <a-modal v-model:open="showProfile" :width="420" :footer="null" :destroyOnClose="true" @cancel="resetPwdForm">
      <div class="profile-card">
        <a-avatar :size="56" class="profile-avatar">{{ user?.realName?.charAt(0) }}</a-avatar>
        <div class="profile-row"><span class="profile-label">姓名</span><span>{{ user?.realName }}</span></div>
        <div class="profile-row"><span class="profile-label">学号</span><span>{{ user?.username }}</span></div>
        <template v-if="profile.classes">
          <div class="profile-row" v-for="(c, i) in profile.classes" :key="i">
            <span class="profile-label">班级</span><span>{{ c.className }}</span>
          </div>
          <div class="profile-row"><span class="profile-label">学校</span><span>{{ profile.classes[0]?.schoolName }}</span></div>
        </template>
        <a-divider />
        <a-collapse v-model:activeKey="pwdActiveKey" :bordered="false" style="background:transparent;">
          <a-collapse-panel key="pwd" header="修改密码">
            <a-form layout="vertical" :model="pwdForm" size="small">
              <a-form-item label="原密码"><a-input-password v-model:value="pwdForm.oldPassword" /></a-form-item>
              <a-form-item label="新密码"><a-input-password v-model:value="pwdForm.newPassword" /></a-form-item>
              <a-form-item label="确认新密码"><a-input-password v-model:value="pwdForm.confirmPassword" /></a-form-item>
              <a-button type="primary" :loading="changingPwd" block @click="changePassword">确认修改</a-button>
            </a-form>
          </a-collapse-panel>
        </a-collapse>
      </div>
    </a-modal>
  </a-layout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user.js';
import { Modal, message } from 'ant-design-vue';
import request from '../../api/request.js';
import { ReadOutlined, TrophyOutlined, UserOutlined, PoweroffOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CaretDownOutlined } from '@ant-design/icons-vue';

const router = useRouter(); const route = useRoute(); const userStore = useUserStore();
const user = userStore.user;
const collapsed = ref(false);

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

async function loadSchoolName() {
  try {
    const r = await request.get('/student/profile');
    const classes = r.data?.classes || [];
    if (classes.length) schoolName.value = classes[0].schoolName || '';
  } catch {}
}

onMounted(() => { loadSchoolName(); });
const pwdActiveKey = ref([]);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const changingPwd = ref(false);

function resetPwdForm() {
  pwdActiveKey.value = [];
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
  if (key === 'logout') {
    Modal.confirm({ title: '确定退出登录？', content: '退出后需重新输入用户名和密码', okText: '确定', cancelText: '取消', onOk: () => { userStore.logout(); router.push('/login'); } });
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
.user-info { color: var(--text-tertiary); }
.user-caret { font-size: var(--fs-caption); color: var(--text-tertiary); }
.content { padding: calc(var(--layout-topbar-h) + var(--space-6)) var(--space-12) var(--space-10); background: var(--bg-canvas); overflow-y: auto; height: 100%; }

.profile-card { text-align: center; }
.profile-avatar { background: var(--brand-600); font-size: var(--fs-display-2); margin-bottom: var(--space-4); }
.profile-row { display: flex; justify-content: space-between; padding: var(--space-2) 0; font-size: var(--fs-body); }
.profile-label { color: var(--text-tertiary); }
.profile-card :deep(.ant-collapse-header) { text-align: left; color: var(--text-link); font-size: var(--fs-body); }

@media (max-width: 768px) {
  .topbar { padding: 0 var(--space-3); }
  .content { padding: calc(var(--layout-topbar-h) + var(--space-4)) var(--space-3) var(--space-6); }
  .user-info { display: none; }
}
</style>
