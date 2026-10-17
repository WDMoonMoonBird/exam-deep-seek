<script setup>
/**
 * 403 · 无权限（/m/403）—— T3 公共/平台
 *
 * 依据：10-v1-implementation-contract.md §3、05-page-specs.md §3.1-5
 *   · 身份卡用 stores/user.js 的真实 localStorage 登录态（不伪造姓名/角色/学校）；
 *   · 引导守卫在超管访问 /m 时带 ?reason=admin 落到本页 ⇒ 展示「移动端暂不提供管理端」；
 *   · 「切换账号 / 退出登录」均为二次确认后才清登录态（契约：危险动作要确认）；
 *   · 本页不伪造 请求编号。
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MIcon, MSheet } from '../../components/index.js';
import { useUserStore } from '../../../stores/user.js';
import { mobileHomePath } from '../../routes.js';
import { withAppBase } from '../../../domain/appPath.js';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const ROLE_LABEL = { student: '学生', teacher: '教师', super_admin: '超级管理员' };
const isAdminBlocked = computed(() => route.query.reason === 'admin');
const loggedIn = computed(() => !!userStore.isLoggedIn && !!userStore.user);
const role = computed(() => (loggedIn.value ? userStore.role : ''));

const identity = computed(() => {
  const user = userStore.user || {};
  if (!loggedIn.value) {
    return { initial: '游', name: '未登录', roleText: '当前为游客访问', tag: '未登录' };
  }
  const school = user.currentSchool && user.currentSchool.name ? user.currentSchool.name : '';
  const roleText = [school, ROLE_LABEL[user.role] || '用户'].filter(Boolean).join(' · ');
  const name = user.realName || user.username || '当前用户';
  return { initial: String(name).slice(0, 1), name, roleText, tag: ROLE_LABEL[user.role] || '已登录' };
});

/** 首页：学生/教师回各自首页；其它角色回官网 */
const homeTarget = computed(() => {
  if (loggedIn.value && (role.value === 'student' || role.value === 'teacher')) {
    return mobileHomePath(role.value);
  }
  return '/m';
});

/** 所需权限：/m 受保护页只有学生端（role=student）与教师端（role=teacher）两类 */
const requiredPermission = computed(() => {
  if (isAdminBlocked.value) return '管理端权限（需在电脑端使用）';
  if (role.value === 'student') return '教师或管理员权限';
  if (role.value === 'teacher') return '学生身份页面';
  return '学生或教师身份';
});

const headline = computed(() => {
  if (isAdminBlocked.value) return '移动端暂不提供管理端';
  if (role.value === 'student') return '此页面需要教师权限';
  if (role.value === 'teacher') return '此页面需要学生权限';
  return '无访问权限';
});

const subText = computed(() => {
  if (isAdminBlocked.value) {
    return '管理端页面暂未在移动端提供，请使用电脑端浏览器访问管理后台。';
  }
  if (role.value === 'student') {
    return '当前账号是学生身份，不能访问教师端页面。如需使用，请切换到教师账号。';
  }
  if (role.value === 'teacher') {
    return '当前账号是教师身份，不能访问学生端页面。如需使用，请切换到学生账号。';
  }
  return '当前账号角色无法访问该页面，请回到自己的首页或更换账号。';
});

/* ---------------------------------------------------------------- 二次确认（切换账号 / 退出登录） */
const confirmOpen = ref(false);
const confirmMode = ref('switch');
const confirmTitle = computed(() => (confirmMode.value === 'logout' ? '退出登录' : '切换账号'));
const confirmText = computed(() =>
  confirmMode.value === 'logout'
    ? '确认退出当前账号？退出后需要重新输入账号与密码才能登录。'
    : '切换账号会退出当前登录，并回到登录页；账号密码不会保存在本机。'
);

function askSwitch(mode) {
  confirmMode.value = mode === 'logout' ? 'logout' : 'switch';
  confirmOpen.value = true;
}

function doLogout() {
  confirmOpen.value = false;
  userStore.logout();
  router.replace('/m/login');
}

function goDesktopAdmin() {
  // 整页跳转桌面端入口：登录态由 localStorage 共享，桌面守卫会把已登录超管导向管理端首页。
  // 这里不写死管理端路由字符串，避免移动端源码出现管理端路径（契约 §9 边界检查）。
  try {
    window.location.assign(withAppBase('/login'));
  } catch {
    /* 非浏览器环境：保留当前页 */
  }
}
</script>

<template>
  <MobileLayout bottom="none">
    <MobileAppBar title="无访问权限" :back="!isAdminBlocked" :back-to="homeTarget">
      <template #right>
        <RouterLink class="iconbtn" to="/m/doc" aria-label="查看使用文档"><MIcon name="info" /></RouterLink>
      </template>
    </MobileAppBar>

    <main class="scroll err-scroll">
      <section class="err-hero err-hero--warning">
        <span class="err-halo" aria-hidden="true"></span>
        <span class="err-icon" aria-hidden="true"><MIcon name="lock" /></span>
        <div class="err-code">403</div>
        <h2 class="err-title">{{ headline }}</h2>
        <p class="err-sub">{{ subText }}</p>
      </section>

      <div class="err-body">
        <div class="card err-card">
          <div class="err-id">
            <span class="avatar err-avatar" aria-hidden="true">{{ identity.initial }}</span>
            <div class="err-id-main">
              <div class="err-id-name">{{ identity.name }}</div>
              <div class="err-id-role">{{ identity.roleText }}</div>
            </div>
            <span class="tag tag--neutral"><i class="dot"></i>{{ identity.tag }}</span>
          </div>
          <div class="err-ctx">
            <div class="err-row">
              <div class="err-row-main">
                <span class="err-k">当前角色</span>
                <span class="err-v">{{ loggedIn ? (ROLE_LABEL[role] || '未知角色') : '未登录' }}</span>
              </div>
            </div>
            <div class="err-row">
              <div class="err-row-main">
                <span class="err-k">所需权限</span>
                <span class="err-v">{{ requiredPermission }}</span>
              </div>
            </div>
            <div v-if="loggedIn" class="err-row">
              <div class="err-row-main">
                <span class="err-k">登录账号</span>
                <span class="err-v mono">{{ userStore.user && userStore.user.username }}</span>
              </div>
            </div>
            <div v-if="isAdminBlocked" class="err-row">
              <div class="err-row-main">
                <span class="err-k">电脑端入口</span>
                <span class="err-v">请在电脑浏览器打开管理后台</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 超管：回桌面 / 退出 -->
        <template v-if="isAdminBlocked">
          <div class="err-actions">
            <div class="btn-row">
              <button type="button" class="btn btn--primary" @click="goDesktopAdmin">
                <MIcon name="external" />前往电脑端管理后台
              </button>
            </div>
            <div class="err-switch">
              <button v-if="loggedIn" type="button" class="btn btn--ghost" @click="askSwitch('logout')">退出登录</button>
              <RouterLink v-else class="btn btn--ghost" to="/m/login">前往登录</RouterLink>
            </div>
          </div>
        </template>
        <!-- 普通角色：回首页 / 切换账号 -->
        <template v-else>
          <div class="err-actions">
            <div class="btn-row">
              <RouterLink class="btn btn--primary" :to="homeTarget">{{ loggedIn ? '回到我的首页' : '回到首页' }}</RouterLink>
            </div>
            <div class="err-switch">
              <button v-if="loggedIn" type="button" class="btn btn--ghost" @click="askSwitch('switch')">切换账号</button>
              <RouterLink v-else class="btn btn--ghost" to="/m/login">前往登录</RouterLink>
            </div>
          </div>
        </template>

        <p class="err-note">如果确认账号权限有误，请联系任课教师或信息中心调整。</p>
      </div>

      <footer class="err-foot">
        Deadpan 判题 v2.1.0 · 权限校验失败（403）<br />
        你的登录状态仍然保留，不会被自动退出。
      </footer>
    </main>

    <!-- 切换账号 / 退出登录 二次确认 -->
    <MSheet v-model:open="confirmOpen" :title="confirmTitle" :close-on-mask="true">
      <p class="err-confirm-text">{{ confirmText }}</p>
      <template #foot>
        <button type="button" class="btn btn--danger btn--block" @click="doLogout">确认{{ confirmMode === 'logout' ? '退出' : '切换' }}</button>
        <button type="button" class="btn btn--ghost btn--block" @click="confirmOpen = false">取消</button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
/* ============ 异常页共用视觉语言：只用令牌 ============ */
.err-scroll { display: flex; flex-direction: column; }
.err-scroll > * { flex-shrink: 0; }
.err-hero { position: relative; overflow: hidden; padding: 20px var(--m-gutter) 6px; text-align: center; }
.err-halo { position: absolute; left: 50%; top: -48px; width: 236px; height: 236px; margin-left: -118px; border-radius: 50%; pointer-events: none; }
.err-icon { position: relative; display: flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 50%; margin: 0 auto; }
.err-icon .icon { width: 25px; height: 25px; }
.err-code { position: relative; margin-top: 8px; font-size: calc(var(--fs-display-1) * 2); line-height: 1; font-weight: 700; letter-spacing: -0.045em; font-variant-numeric: tabular-nums; }
.err-title { position: relative; margin-top: 10px; font-size: var(--m-fs-title-1); line-height: var(--m-lh-title-1); font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.err-sub { position: relative; margin: 7px auto 0; max-width: 300px; font-size: var(--m-fs-body-sm); line-height: 1.65; color: var(--text-secondary); }
.err-body { padding: 18px var(--m-gutter) 0; }
.err-card { padding: 0 var(--m-card-pad); }
.err-id { display: flex; align-items: center; padding: 14px 0 12px; border-bottom: 1px solid var(--border-subtle); }
.err-avatar { width: 40px; height: 40px; font-size: var(--m-fs-body); }
.err-id-main { flex: 1; min-width: 0; margin-left: 10px; }
.err-id-name { font-size: var(--m-fs-body); font-weight: var(--m-fw-semibold); color: var(--text-primary); }
.err-id-role { margin-top: 1px; font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.err-ctx { padding: 2px 0 6px; }
.err-row { display: flex; align-items: center; padding: 10px 0; }
.err-row + .err-row { border-top: 1px solid var(--border-subtle); }
.err-row-main { flex: 1; min-width: 0; }
.err-k { display: block; font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.err-v { display: block; margin-top: 2px; font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-medium); color: var(--text-primary); word-break: break-all; }
.err-v.mono { font-size: 12.5px; font-weight: 400; color: var(--text-secondary); }
.err-copy { flex: none; margin-left: 8px; margin-right: -10px; color: var(--text-tertiary); }
.err-actions { margin-top: 18px; }
.err-actions .btn-row .btn { height: var(--m-btn-h); }
.err-switch { display: flex; justify-content: center; margin-top: 6px; }
.err-switch .btn { height: var(--m-touch-min); font-size: var(--m-fs-body-sm); }
.err-note { margin-top: 14px; padding: 0 8px; text-align: center; font-size: var(--m-fs-caption); line-height: 1.6; color: var(--text-tertiary); }
.err-foot { margin-top: auto; padding: 22px var(--m-gutter) 4px; border-top: 1px solid var(--border-subtle); text-align: center; font-size: 11.5px; line-height: 1.7; color: var(--text-tertiary); }
.err-foot a, .err-foot .err-link { color: var(--text-link); font-weight: var(--m-fw-medium); display: inline-flex; align-items: center; min-height: var(--m-touch-min); padding: 0 6px; }
.err-hero--info .err-halo { background: radial-gradient(circle, var(--status-info-bg), transparent 68%); }
.err-hero--info .err-icon { background: var(--status-info-bg); color: var(--status-info-fg); }
.err-hero--info .err-code { color: var(--text-brand); }
.err-hero--warning .err-halo { background: radial-gradient(circle, var(--status-warning-bg), transparent 68%); }
.err-hero--warning .err-icon { background: var(--status-warning-bg); color: var(--status-warning-fg); }
.err-hero--warning .err-code { color: var(--status-warning-fg); }
.err-hero--danger .err-halo { background: radial-gradient(circle, var(--status-danger-bg), transparent 68%); }
.err-hero--danger .err-icon { background: var(--status-danger-bg); color: var(--status-danger-fg); }
.err-hero--danger .err-code { color: var(--status-danger-fg); }
.err-confirm-text { font-size: var(--m-fs-body); line-height: 1.65; color: var(--text-secondary); }
.err-admin-url { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: var(--bg-sunken); font-family: var(--font-mono); font-size: 12.5px; color: var(--text-secondary); word-break: break-all; }
</style>