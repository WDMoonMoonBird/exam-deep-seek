<script setup>
/**
 * 500 · 服务异常（/m/500）—— T3 公共/平台
 *
 * 依据：10-v1-implementation-contract.md §3 / §7.10（requestTraceId=false）
 *       docs/mobile-app/05-page-specs.md §3.1-6
 *   · 不伪造 请求编号 / 错误编号（D13 延期，mobileFeatures.requestTraceId = false）；
 *   · 只展示真实上下文：当前路由地址、页面渲染时间；
 *   · 保留登录态；重试 = 重新加载当前页（不产生重复提交）。
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MIcon } from '../../components/index.js';
import { useUserStore } from '../../../stores/user.js';
import { mobileHomePath } from '../../routes.js';
import { useMobileToast } from '../../composables/useMobileToast.js';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const toast = useMobileToast();

const ROLE_LABEL = { student: '学生', teacher: '教师', super_admin: '超级管理员' };

const loggedIn = computed(() => !!userStore.isLoggedIn && !!userStore.user);
const identity = computed(() => {
  const user = userStore.user || {};
  if (!loggedIn.value) {
    return { initial: '游', name: '未登录', roleText: '当前为游客访问', tag: '未登录', tagTone: 'neutral' };
  }
  const school = user.currentSchool && user.currentSchool.name ? user.currentSchool.name : '';
  const roleText = [school, ROLE_LABEL[user.role] || '用户', user.username].filter(Boolean).join(' · ');
  const name = user.realName || user.username || '当前用户';
  return { initial: String(name).slice(0, 1), name, roleText, tag: '登录正常', tagTone: 'success' };
});

const currentPath = computed(() => route.fullPath || '/m');
const occurredAt = ref(formatTime(new Date()));
const retrying = ref(false);

function formatTime(date) {
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function copyText(text) {
  return new Promise((resolve, reject) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(resolve).catch(reject);
      return;
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(area);
      if (ok) resolve();
      else reject(new Error('copy failed'));
    } catch (err) {
      reject(err);
    }
  });
}

async function copyPath() {
  try {
    await copyText(currentPath.value);
    toast.show('已复制当前地址');
  } catch {
    toast.show('复制失败，请长按地址手动复制');
  }
}

function retry() {
  if (retrying.value) return;
  retrying.value = true;
  // 路由级错误页没有可重放的失败请求：重新加载当前页是最真实的「重试」；
  // 留一帧让按钮的 loading 态可见（同时防连点）。
  setTimeout(() => {
    try {
      window.location.reload();
    } catch {
      router.replace('/m');
    }
  }, 80);
}

function goHome() {
  if (loggedIn.value && (userStore.role === 'student' || userStore.role === 'teacher')) {
    router.push(mobileHomePath(userStore.role));
  } else {
    router.push('/m');
  }
}
</script>

<template>
  <MobileLayout bottom="none">
    <MobileAppBar title="服务异常" back back-to="/m">
      <template #right>
        <RouterLink class="iconbtn" to="/m/doc" aria-label="查看使用文档"><MIcon name="info" /></RouterLink>
      </template>
    </MobileAppBar>

    <main class="scroll err-scroll">
      <section class="err-hero err-hero--danger">
        <span class="err-halo" aria-hidden="true"></span>
        <span class="err-icon" aria-hidden="true"><MIcon name="alert" /></span>
        <div class="err-code">500</div>
        <h2 class="err-title">服务暂时不可用</h2>
        <p class="err-sub">服务器开了个小差，请稍后重试；必要时可联系管理员排查。</p>
      </section>

      <div class="err-body">
        <div class="card err-card">
          <div class="err-id">
            <span class="avatar err-avatar" aria-hidden="true">{{ identity.initial }}</span>
            <div class="err-id-main">
              <div class="err-id-name">{{ identity.name }}</div>
              <div class="err-id-role">{{ identity.roleText }}</div>
            </div>
            <span class="tag" :class="'tag--' + identity.tagTone"><i class="dot"></i>{{ identity.tag }}</span>
          </div>
          <div class="err-ctx">
            <div class="err-row">
              <div class="err-row-main">
                <span class="err-k">当前地址</span>
                <span class="err-v mono">{{ currentPath }}</span>
              </div>
              <button type="button" class="iconbtn err-copy" aria-label="复制当前地址" @click="copyPath">
                <MIcon name="copy" />
              </button>
            </div>
            <div class="err-row">
              <div class="err-row-main">
                <span class="err-k">发生时间</span>
                <span class="err-v">{{ occurredAt }}</span>
              </div>
            </div>
            <div class="err-row">
              <div class="err-row-main">
                <span class="err-k">错误信息</span>
                <span class="err-v">服务异常（HTTP 500）· 当前版本不展示请求编号</span>
              </div>
            </div>
          </div>
        </div>

        <div class="err-actions btn-row">
          <button type="button" class="btn btn--primary" :disabled="retrying" @click="retry">
            <span v-if="retrying" class="spinner" aria-hidden="true"></span><MIcon v-else name="refresh" />{{ retrying ? '重新加载中…' : '重新加载' }}
          </button>
          <button type="button" class="btn btn--secondary" @click="goHome">返回首页</button>
        </div>
        <p class="err-note">若持续出现请联系管理员（信息中心）。</p>
      </div>

      <footer class="err-foot">
        Deadpan 判题 v2.1.0 · 服务异常（500）<br />
        本页不展示伪造的请求编号；排查时请把「当前地址 + 发生时间」提供给管理员。
      </footer>
    </main>
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
.err-note { margin-top: 14px; padding: 0 8px; text-align: center; font-size: var(--m-fs-caption); line-height: 1.6; color: var(--text-tertiary); }
.err-retry { display: flex; align-items: center; justify-content: center; margin-top: 14px; font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.err-retry .spinner { width: 13px; height: 13px; border-width: 1.5px; margin-right: 6px; color: var(--text-tertiary); }
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
</style>