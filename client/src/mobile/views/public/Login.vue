<script setup>
/**
 * 登录（/m/login）—— T3 公共/平台
 *
 * 依据：docs/mobile-app/10-v1-implementation-contract.md §3 / §6
 *       docs/mobile-app/05-page-specs.md §3.1-2（public-login）
 * 接口：仅 POST /auth/login（契约 §6 白名单第一条；不新增/不假设接口）。
 *
 * v1 分支（全部是现有后端已返回的真实语义）：
 *   · 成功（code 0）→ setAuth(token, user) → 按角色/redirect 跳转；
 *   · 业务码 1002 → 后端返回 data.schools ⇒ 二次择校（D14，纯前端 UI，开关默认 true）；
 *   · 429/限流 → 直接展示后端文案（不编造「还可尝试 N 次」，后端未返回剩余次数）；
 *   · mustChangePassword === true（教师首登强制改密）→ 不写登录态，提示到电脑端改密；
 *   · 超级管理员 → /m/403?reason=admin（移动端不提供管理端）。
 * 记住我：只持久化账号（localStorage m-login-account），绝不保存密码。
 */
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import logoUrl from '../../../assets/学习中.svg';
import { MSheet } from '../../components/index.js';
import request from '../../../api/request.js';
import { AUTH_EXPIRED_MESSAGE } from '../../../api/apiError.js';
import { errorCopyOf } from '../../../composables/errorCopy.js';
import { useUserStore } from '../../../stores/user.js';
import { mobileHomePath } from '../../routes.js';
import { withAppBase } from '../../../domain/appPath.js';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

/* ---------------------------------------------------------------- 记住账号（只记账号） */
const REMEMBER_KEY = 'm-login-account';
function readRemembered() {
  try {
    const saved = localStorage.getItem(REMEMBER_KEY) || '';
    return { account: saved, remember: !!saved };
  } catch {
    return { account: '', remember: false };
  }
}
const remembered = readRemembered();

const account = ref(remembered.account);
const password = ref('');
const rememberMe = ref(remembered.remember);
const showPassword = ref(false);
const loading = ref(false);
const errorMsg = ref('');
const pwdResetNotice = ref('');
const accountEl = ref(null);
const passwordEl = ref(null);

const expiredNotice = computed(() => (route.query.expired ? AUTH_EXPIRED_MESSAGE : ''));

/* ---------------------------------------------------------------- 多学校二次选择（1002） */
const schoolSheetOpen = ref(false);
const schoolOptions = ref([]);
const selectedCode = ref('');
const schoolError = ref('');

function focusField(name) {
  nextTick(() => {
    const el = name === 'account' ? accountEl.value : passwordEl.value;
    if (el && typeof el.focus === 'function') el.focus();
  });
}

function validate() {
  if (!account.value.trim()) {
    errorMsg.value = '请输入账号';
    focusField('account');
    return false;
  }
  if (!password.value) {
    errorMsg.value = '请输入密码';
    focusField('password');
    return false;
  }
  return true;
}

function persistRemember() {
  try {
    if (rememberMe.value) localStorage.setItem(REMEMBER_KEY, account.value.trim());
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* 隐私模式等：记住账号失败不影响登录 */
  }
}

/** 只接受 /m 站内地址，防开放重定向；/m/login 自身不参与回跳 */
function safeRedirect(raw) {
  const target = typeof raw === 'string' ? raw : '';
  if (!target) return '';
  if (target !== '/m' && target.indexOf('/m/') !== 0) return '';
  if (target.indexOf('/m/login') === 0) return '';
  return target;
}

/** 登录成功后的落地页：超管引导到 403（移动端无管理端），未知角色同样回 403 */
function landingFor(user) {
  if (user && user.role === 'super_admin') return { path: '/m/403', query: { reason: 'admin' } };
  if (user && (user.role === 'student' || user.role === 'teacher')) return mobileHomePath(user.role);
  return '/m/403';
}

function onLoginSuccess(data) {
  const token = data && data.token ? String(data.token) : '';
  const user = data && data.user ? data.user : null;
  if (!token || !user) {
    errorMsg.value = '登录失败，请稍后重试';
    return;
  }
  // 教师首登强制改密：后端会拦截其它已认证接口（白名单仅 PUT /auth/password），
  // 移动端 v1 不提供改密页 ⇒ 不写登录态，明确引导到电脑端完成后再回来。
  if (user.mustChangePassword === true) {
    password.value = '';
    pwdResetNotice.value = '该账号首次登录需要先修改初始密码；移动端暂不支持改密，请在电脑端登录后修改，再回到手机登录。';
    return;
  }
  persistRemember();
  userStore.setAuth(token, user);
  const redirect = safeRedirect(route.query.redirect);
  router.replace(redirect || landingFor(user));
}

async function submitLogin(extra) {
  if (loading.value) return;
  if (!validate()) return;
  errorMsg.value = '';
  pwdResetNotice.value = '';
  loading.value = true;
  try {
    const payload = { username: account.value.trim(), password: password.value };
    if (extra && extra.schoolCode) payload.schoolCode = extra.schoolCode;
    // silent：移动端错误统一就地展示，不弹桌面 antd 全局 message
    const res = await request.post('/auth/login', payload, { silent: true });
    // 1002 = 多学校控制流（request.js 只在 HTTP 2xx + code 1002 + data.schools 时 resolve）
    if (res && res.code === 1002) {
      const schools = res.data && Array.isArray(res.data.schools) ? res.data.schools : [];
      if (!schools.length) {
        errorMsg.value = '学校列表加载失败，请稍后重试';
        return;
      }
      schoolOptions.value = schools;
      selectedCode.value = schools[0].officialCode || '';
      schoolError.value = '';
      schoolSheetOpen.value = true;
      return;
    }
    onLoginSuccess(res && res.data);
  } catch (err) {
    // 统一错误文案出口（errorCopy.js）：服务端业务文案优先（如「用户名或密码错误」「登录失败次数过多…」），
    // 否则回落「登录失败，请重试」；原始错误只进 console，绝不把 JS 原文放上屏（verify-frontend ⑨e 口径）。
    errorMsg.value = errorCopyOf(err, { tag: '移动端/Login.vue', action: '登录' });
    // 服务端失败不属于单个字段，但把焦点放回密码框可让键盘用户直接改密重试（读屏由 role=alert 播报）
    focusField('password');
  } finally {
    loading.value = false;
  }
}

function handleLogin() {
  submitLogin();
}

function confirmSchool() {
  if (loading.value) return;
  if (!selectedCode.value) {
    schoolError.value = '请选择学校';
    return;
  }
  schoolSheetOpen.value = false;
  submitLogin({ schoolCode: selectedCode.value });
}

function cancelSchool() {
  if (loading.value) return;
  schoolSheetOpen.value = false;
  schoolOptions.value = [];
  selectedCode.value = '';
  schoolError.value = '';
}

function goDesktopChangePassword() {
  // 整页跳转桌面登录页：当前未写入移动端登录态，桌面登录页可正常展示并提供改密入口
  try {
    window.location.assign(withAppBase('/login'));
  } catch {
    /* 非浏览器环境：保持当前页，用户可自行在电脑端打开 */
  }
}
</script>

<template>
  <MobileLayout bottom="none">
    <main class="lg-page">
      <div class="lg-card">
        <img :src="logoUrl" class="lg-logo" alt="Deadpan 判题" />
        <h1 class="lg-title">Deadpan 判题</h1>
        <p class="lg-desc">请登录以继续</p>

        <p v-if="expiredNotice" class="lg-notice lg-notice--warning" role="alert">{{ expiredNotice }}，请重新输入密码登录。</p>

        <div v-if="pwdResetNotice" class="lg-notice lg-notice--warning" role="alert">
          <b>需要先修改初始密码</b>
          <p>{{ pwdResetNotice }}</p>
          <div class="lg-notice-actions">
            <button type="button" class="lg-linkbtn" @click="goDesktopChangePassword">前往电脑端改密</button>
            <button type="button" class="lg-linkbtn" @click="pwdResetNotice = ''">我知道了</button>
          </div>
        </div>

        <p v-if="errorMsg" id="login-error" class="lg-error" role="alert">{{ errorMsg }}</p>

        <form class="lg-form" novalidate @submit.prevent="handleLogin">
          <label class="sr-only" for="login-account">用户名（工号/学号）</label>
          <input
            id="login-account"
            ref="accountEl"
            v-model="account"
            class="lg-input"
            type="text"
            name="username"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="next"
            placeholder="用户名（工号/学号）"
            :disabled="loading"
            :aria-invalid="!!errorMsg"
            :aria-describedby="errorMsg ? 'login-error' : undefined"
            @keydown.enter.prevent="focusField('password')"
          />

          <div class="lg-pass">
            <label class="sr-only" for="login-password">密码</label>
            <input
              id="login-password"
              ref="passwordEl"
              v-model="password"
              class="lg-input"
              :type="showPassword ? 'text' : 'password'"
              name="password"
              autocomplete="current-password"
              enterkeyhint="done"
              placeholder="密码"
              :disabled="loading"
              :aria-invalid="!!errorMsg"
              :aria-describedby="errorMsg ? 'login-error' : undefined"
            />
            <button
              type="button"
              class="lg-eye"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >{{ showPassword ? '隐藏' : '显示' }}</button>
          </div>

          <label class="lg-remember">
            <input v-model="rememberMe" type="checkbox" />
            <span>记住账号</span>
          </label>

          <button type="submit" class="lg-submit" :disabled="loading">{{ loading ? '登录中…' : '登录' }}</button>
        </form>
      </div>
    </main>

    <!-- 多学校择校（业务码 1002） -->
    <MSheet
      v-model:open="schoolSheetOpen"
      title="选择学校"
      subtitle="该账号存在于多个学校，请选择目前就读的学校"
      :close-on-mask="!loading"
    >
      <div v-if="schoolError" class="lg-error" role="alert">{{ schoolError }}</div>
      <div class="lg-school-list">
        <button
          v-for="school in schoolOptions"
          :key="school.officialCode || school.name"
          type="button"
          class="lg-school-row"
          :class="{ 'lg-school-row--selected': selectedCode === school.officialCode }"
          :aria-pressed="selectedCode === school.officialCode"
          :disabled="loading"
          @click="selectedCode = school.officialCode"
        >
          <span class="lg-radio" :class="{ on: selectedCode === school.officialCode }" aria-hidden="true"></span>
          <span class="lg-school-main">
            <b>{{ school.name }}</b>
            <small>院校代码 {{ school.officialCode }}</small>
          </span>
        </button>
      </div>
      <template #foot>
        <button type="button" class="lg-submit" :disabled="loading" @click="confirmSchool">{{ loading ? '登录中…' : '确认登录' }}</button>
        <button type="button" class="lg-linkbtn lg-linkbtn--block" :disabled="loading" @click="cancelSchool">返回重新输入</button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
/* 简化后的移动登录：与桌面登录同构，只保留品牌、账号、密码、记住账号、登录 */
.lg-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px var(--m-gutter);
  box-sizing: border-box;
}
.lg-card { width: 100%; max-width: 380px; text-align: center; }
.lg-logo { width: 56px; height: 56px; margin-bottom: 16px; display: inline-block; }
.lg-title { margin: 0; font-size: 28px; line-height: 1.25; font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.lg-desc { margin: 8px 0 30px; font-size: 15px; line-height: 1.5; color: var(--text-tertiary); }

.lg-form { text-align: left; }
.lg-input {
  width: 100%;
  height: 48px;
  box-sizing: border-box;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 16px;
  font-family: inherit;
  outline: none;
}
.lg-input::placeholder { color: var(--text-tertiary); }
.lg-input:focus { border-color: var(--brand-600); box-shadow: 0 0 0 2px var(--brand-100, rgba(22, 119, 255, 0.16)); }
.lg-input:disabled { opacity: 0.65; }
.lg-pass { position: relative; margin-top: 12px; }
.lg-pass .lg-input { padding-right: 62px; }
.lg-eye {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 54px;
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-brand);
  font-size: 14px;
  font-family: inherit;
}
.lg-eye:active { background: var(--m-pressed); }

.lg-remember { display: flex; align-items: center; gap: 8px; margin-top: 16px; font-size: 14px; line-height: 1.4; color: var(--text-secondary); cursor: pointer; user-select: none; }
.lg-remember input { width: 18px; height: 18px; margin: 0; accent-color: var(--brand-600); }

.lg-submit {
  width: 100%;
  height: 50px;
  margin-top: 20px;
  border: 0;
  border-radius: 10px;
  background: var(--brand-600);
  color: var(--text-on-brand);
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
}
.lg-submit:disabled { opacity: 0.65; }
.lg-linkbtn { border: 0; background: transparent; color: var(--text-brand); font-size: 14px; font-family: inherit; padding: 6px 0; margin-right: 14px; }
.lg-linkbtn--block { display: block; width: 100%; text-align: center; margin: 4px 0 0; }

.lg-error { margin: 0 0 12px; color: var(--status-danger-fg); font-size: 14px; line-height: 1.5; text-align: left; }
.lg-notice { margin: 0 0 16px; padding: 10px 12px; border-radius: 8px; text-align: left; font-size: 14px; line-height: 1.55; }
.lg-notice--warning { background: var(--status-warning-bg); color: var(--status-warning-fg); }
.lg-notice p { margin: 4px 0 0; }
.lg-notice-actions { display: flex; flex-wrap: wrap; margin-top: 8px; }

.lg-school-list { margin-top: 4px; }
.lg-school-row { display: flex; align-items: center; width: 100%; padding: 12px 0; border: 0; border-bottom: 1px solid var(--border-subtle); background: transparent; color: var(--text-primary); text-align: left; font-family: inherit; }
.lg-school-row:last-child { border-bottom: 0; }
.lg-school-row--selected { color: var(--text-brand); }
.lg-radio { width: 18px; height: 18px; flex: none; margin-right: 12px; border: 1.5px solid var(--border-strong); border-radius: 50%; box-sizing: border-box; }
.lg-radio.on { border: 5px solid var(--brand-600); }
.lg-school-main { display: flex; flex-direction: column; min-width: 0; }
.lg-school-main b { font-size: 15px; font-weight: 500; }
.lg-school-main small { margin-top: 2px; font-size: 12px; color: var(--text-tertiary); }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
