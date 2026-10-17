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
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MField, MIcon, MSheet } from '../../components/index.js';
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
    <MobileAppBar title="登录" back back-to="/m" />

    <main class="scroll">
      <!-- 品牌 -->
      <div class="lg-brand">
        <span class="lg-logo" aria-hidden="true"><MIcon name="logo" /></span>
        <div class="lg-name">Deadpan<small>判题</small></div>
        <div class="lg-domain">DEADPAN UNIVERSITY · 校内网</div>
      </div>

      <!-- 欢迎 -->
      <div class="lg-welcome">
        <h2 class="lg-welcome-title">欢迎回来</h2>
        <p>使用工号或学号登录；教师与学生共用同一个入口。</p>
      </div>

      <div class="lg-form">
        <!-- 登录态过期提示（401 由 request.js/main.js 跳回本页并带 expired=1） -->
        <div v-if="expiredNotice" class="banner banner--warning lg-banner" role="alert">
          <MIcon name="alert" />
          <div>{{ expiredNotice }}，请重新输入密码登录。</div>
        </div>

        <!-- 首登强制改密提示 -->
        <div v-if="pwdResetNotice" class="banner banner--warning lg-banner" role="alert">
          <MIcon name="lock" />
          <div>
            <b>需要先修改初始密码</b>
            <p class="lg-banner-p">{{ pwdResetNotice }}</p>
            <div class="lg-notice-actions">
              <button type="button" class="btn btn--sm btn--primary" @click="goDesktopChangePassword">前往电脑端改密</button>
              <button type="button" class="btn btn--sm btn--ghost" @click="pwdResetNotice = ''">我知道了</button>
            </div>
          </div>
        </div>

        <!-- 错误 banner：role=alert 让读屏即时播报；表单可再次提交（重试） -->
        <div v-if="errorMsg" id="login-error" class="banner banner--danger lg-banner" role="alert">
          <MIcon name="alert" />
          <div>
            <b>{{ errorMsg }}</b>
            <p class="lg-banner-p">请检查后重新提交；连续失败请稍后再试，或联系任课教师 / 信息中心。</p>
          </div>
        </div>

        <form novalidate class="lg-form-inner" @submit.prevent="handleLogin">
          <MField label="账号" for-id="login-account" required hint="教师用工号（如 T2026001），学生用学号">
            <div class="input-wrap">
              <span class="input-icon" aria-hidden="true"><MIcon name="user" /></span>
              <input
                id="login-account"
                ref="accountEl"
                v-model="account"
                class="input"
                :class="{ 'input-error': !!errorMsg }"
                type="text"
                name="username"
                autocomplete="username"
                autocapitalize="off"
                spellcheck="false"
                enterkeyhint="next"
                placeholder="工号 / 学号"
                :disabled="loading"
                :aria-invalid="!!errorMsg"
                :aria-describedby="errorMsg ? 'login-error' : undefined"
                @keydown.enter.prevent="focusField('password')"
              />
            </div>
          </MField>

          <MField label="密码" for-id="login-password" required>
            <div class="input-wrap lg-has-eye">
              <span class="input-icon" aria-hidden="true"><MIcon name="lock" /></span>
              <input
                id="login-password"
                ref="passwordEl"
                v-model="password"
                class="input"
                :class="{ 'input-error': !!errorMsg }"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                enterkeyhint="done"
                placeholder="请输入密码"
                :disabled="loading"
                :aria-invalid="!!errorMsg"
                :aria-describedby="errorMsg ? 'login-error' : undefined"
              />
              <span class="input-suffix">
                <button
                  type="button"
                  class="lg-eye"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                >
                  <MIcon name="eye" />
                </button>
              </span>
            </div>
          </MField>

          <!-- 记住我：只记账号，不存密码 -->
          <div class="lg-remember">
            <button
              type="button"
              class="switch"
              :class="{ on: rememberMe }"
              role="switch"
              :aria-checked="rememberMe"
              aria-labelledby="remember-label"
              @click="rememberMe = !rememberMe"
            ></button>
            <div class="lg-remember-main">
              <b id="remember-label">记住账号</b>
              <span>只保存账号，不会保存密码；公共机房请关闭</span>
            </div>
          </div>

          <div class="lg-submit">
            <button type="submit" class="btn btn--primary btn--block btn--lg" :disabled="loading">
              <span v-if="loading" class="spinner" aria-hidden="true"></span>{{ loading ? '登录中…' : '登录' }}
            </button>
          </div>
        </form>

        <div class="lg-doc">
          <RouterLink class="btn btn--ghost" to="/m/doc"><MIcon name="book" />使用文档</RouterLink>
        </div>

        <div class="lg-hint">
          <MIcon name="info" />
          <div>账号由学校统一分配。如无法登录，请联系任课教师或信息中心重置密码。</div>
        </div>
      </div>

      <!-- 底部版权 -->
      <footer class="lg-foot">
        <p>© 2026 Deadpan 大学 · 信息中心</p>
        <p>Deadpan 判题 v2.1.0 · 仅限校内网访问</p>
        <p>登录遇到问题？联系任课教师或系统管理员（信息中心）</p>
      </footer>
    </main>

    <!-- 多学校择校（业务码 1002） -->
    <MSheet
      v-model:open="schoolSheetOpen"
      title="选择学校"
      subtitle="该账号存在于多个学校，请选择目前就读的学校"
      :close-on-mask="!loading"
    >
      <div v-if="schoolError" class="banner banner--danger mb12" role="alert">
        <MIcon name="alert" />
        <div>{{ schoolError }}</div>
      </div>
      <div class="list lg-school-list">
        <button
          v-for="school in schoolOptions"
          :key="school.officialCode || school.name"
          type="button"
          class="rowitem lg-school-row"
          :class="{ 'rowitem--selected': selectedCode === school.officialCode }"
          :aria-pressed="selectedCode === school.officialCode"
          :disabled="loading"
          @click="selectedCode = school.officialCode"
        >
          <span class="radio" :class="{ on: selectedCode === school.officialCode }" aria-hidden="true"></span>
          <span class="row-main">
            <span class="row-title">{{ school.name }}</span>
            <span class="row-sub">院校代码 {{ school.officialCode }}</span>
          </span>
          <MIcon v-if="selectedCode === school.officialCode" name="check" />
        </button>
      </div>
      <template #foot>
        <button type="button" class="btn btn--primary btn--block" :disabled="loading" @click="confirmSchool">
          <span v-if="loading" class="spinner" aria-hidden="true"></span>{{ loading ? '登录中…' : '确认登录' }}
        </button>
        <button type="button" class="btn btn--ghost btn--block" :disabled="loading" @click="cancelSchool">返回重新输入</button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
/* ============ 登录页页内样式：只用令牌 ============ */
.lg-brand { display: flex; flex-direction: column; align-items: center; padding: 18px var(--m-gutter) 0; text-align: center; }
.lg-logo { width: 58px; height: 58px; border-radius: 17px; display: flex; align-items: center; justify-content: center;
  background: var(--brand-600); color: var(--text-on-brand); box-shadow: var(--shadow-md); }
.lg-logo .icon { width: 30px; height: 30px; stroke-width: 1.9; }
.lg-name { margin-top: 12px; font-size: var(--m-fs-title-2); font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.lg-name small { margin-left: 5px; font-size: var(--m-fs-caption); font-weight: 500; color: var(--text-tertiary); }
.lg-domain { margin-top: 4px; font-size: var(--m-fs-caption); color: var(--text-tertiary); letter-spacing: var(--m-tracking-wide); }

.lg-welcome { padding: 22px var(--m-gutter) 0; }
.lg-welcome-title { font-size: var(--m-fs-display); line-height: var(--m-lh-display); font-weight: 700; letter-spacing: var(--m-tracking-tight); }
.lg-welcome p { margin-top: 5px; font-size: var(--m-fs-body-sm); line-height: 1.55; color: var(--text-secondary); }

.lg-form { padding: 18px var(--m-gutter) 0; }
.lg-banner { margin-bottom: 16px; }
.lg-banner-p { margin-top: 4px; font-size: var(--m-fs-body-sm); line-height: 1.55; }
.lg-notice-actions { display: flex; flex-wrap: wrap; margin-top: 10px; }
.lg-notice-actions .btn + .btn { margin-left: 8px; }
.lg-form-inner { display: block; }
.lg-has-eye .input { padding-right: 50px; }
.lg-eye { width: var(--m-touch-min); height: var(--m-touch-min); display: flex; align-items: center; justify-content: center;
  border-radius: 10px; color: var(--text-tertiary); }
.lg-eye:active { background: var(--m-pressed); }
.lg-eye .icon { width: 20px; height: 20px; }
.lg-remember { display: flex; align-items: center; margin-top: 18px; }
.lg-remember-main { flex: 1; min-width: 0; margin-left: 10px; }
.lg-remember-main b { display: block; font-size: var(--m-fs-body); font-weight: var(--m-fw-medium); color: var(--text-primary); }
.lg-remember-main span { display: block; margin-top: 1px; font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.lg-submit { margin-top: 22px; }
.lg-submit .btn { height: var(--m-btn-h); }
.lg-doc { display: flex; justify-content: center; margin-top: 14px; }
.lg-doc .btn { height: var(--m-touch-min); padding: 0 12px; font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-medium); }
.lg-hint { display: flex; align-items: flex-start; margin-top: 16px; padding: 12px 14px; border-radius: var(--m-radius-card-sm);
  background: var(--bg-surface-2); border: 1px dashed var(--border-default); font-size: var(--m-fs-caption); line-height: 1.6; color: var(--text-tertiary); }
.lg-hint .icon { width: 15px; height: 15px; margin-right: 7px; flex: none; margin-top: 1px; }

.lg-foot { margin: 26px var(--m-gutter) 0; padding-top: 16px; border-top: 1px solid var(--border-subtle); text-align: center; }
.lg-foot p { font-size: 11.5px; line-height: 1.7; color: var(--text-tertiary); }
.lg-foot p:nth-child(2) { font-variant-numeric: tabular-nums; }

.lg-school-list { margin-top: 4px; }
.lg-school-row { width: 100%; text-align: left; }
.lg-school-row .radio { margin-right: 12px; }
.lg-school-row .row-main { display: flex; flex-direction: column; }
.lg-school-row .row-title { font-size: var(--m-fs-body); }
.lg-school-row .row-sub { font-size: var(--m-fs-caption); }
.lg-school-row .icon { flex: none; margin-left: 10px; color: var(--text-brand); }
</style>
