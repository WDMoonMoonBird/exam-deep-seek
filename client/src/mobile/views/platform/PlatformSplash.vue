<script setup>
/**
 * 启动屏视觉样例（/m/platform/splash）—— T3 公共/平台
 *
 * 依据：10-v1-implementation-contract.md §3（平台与状态 3 屏之一）
 *       docs/mobile-app/05-page-specs.md §3.5-36
 *   · 真实冷启动由 Android 壳内的原生启动屏 / 浏览器首屏完成，本页只呈现设计视觉并保留路由；
 *   · 纯静态：无接口、不伪造状态栏/手势条；底部提供明确出口，不把用户困在样例页；
 *   · 「检查更新」进度为视觉样例（真实版本探测由 composables/appVersion.js 在主应用入口执行）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import MobileLayout from '../../layout/MobileLayout.vue';
import { MIcon } from '../../components/index.js';
import { useUserStore } from '../../../stores/user.js';
import { mobileHomePath } from '../../routes.js';

const userStore = useUserStore();

const progress = ref(8);
let timer = null;
onMounted(() => {
  // 视觉样例：进入页面后把进度推进到 62%，与设计稿一致
  timer = setTimeout(() => {
    progress.value = 62;
    timer = null;
  }, 60);
});
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  timer = null;
});

const loggedIn = computed(
  () => userStore.isLoggedIn && (userStore.role === 'student' || userStore.role === 'teacher')
);
const enterTarget = computed(() => (loggedIn.value ? mobileHomePath(userStore.role) : '/m'));
</script>

<template>
  <MobileLayout bottom="none">
    <div class="sp-page">
      <span class="sp-glow" aria-hidden="true"></span>

      <div class="sp-main">
        <span class="sp-logo" aria-hidden="true"><MIcon name="logo" /></span>
        <h1 class="sp-name">Deadpan <em>判题</em></h1>
        <p class="sp-slogan">教学评测，随时可用</p>
        <span class="sp-ver"><i class="sp-ver-dot" aria-hidden="true"></i>v2.1.0 · 构建 20261017</span>
      </div>

      <div class="sp-bottom">
        <div class="sp-loading" role="status" aria-live="polite">
          <span>正在检查更新…</span>
          <span class="sp-pct tnum">{{ progress }}%</span>
        </div>
        <div class="sp-progress" role="progressbar" aria-label="检查更新进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progress">
          <i :style="{ width: progress + '%' }"></i>
        </div>
        <p class="sp-hint">Web 端冷启动由浏览器完成 · 本页为设计视觉样例</p>
        <RouterLink class="sp-enter" :to="enterTarget">进入移动端<MIcon name="arrow-right" /></RouterLink>
        <p class="sp-org">Deadpan 大学 · 信息中心 · 仅限校内网</p>
      </div>
    </div>
  </MobileLayout>
</template>

<style scoped>
/* ============ 启动屏样例样式：深色品牌面恒定为深色，只用令牌 ============ */
.sp-page { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center;
  padding: 84px var(--m-gutter) calc(26px + var(--m-safe-bottom)); overflow: hidden; background: var(--gray-950); }
.sp-glow { position: absolute; left: 50%; top: -190px; width: 520px; height: 520px; margin-left: -260px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle at center, var(--brand-800) 0%, transparent 62%); opacity: .75; }
.sp-main { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; margin: auto 0; }
.sp-logo { width: 88px; height: 88px; border-radius: 27px; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(158deg, var(--brand-500) 0%, var(--brand-700) 100%);
  box-shadow: 0 24px 64px -16px var(--brand-800); }
.sp-logo .icon { width: 46px; height: 46px; stroke-width: 1.9; color: var(--gray-0); }
.sp-name { margin-top: 24px; font-size: calc(var(--fs-display-1) - 2px); line-height: 1.2; font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--gray-0); }
.sp-name em { font-style: normal; color: var(--brand-300); }
.sp-slogan { margin-top: 8px; font-size: var(--m-fs-body); letter-spacing: 0.14em; color: var(--gray-300); }
.sp-ver { margin-top: 18px; display: inline-flex; align-items: center; height: 26px; padding: 0 12px; border-radius: var(--m-radius-chip);
  background: var(--gray-800); color: var(--gray-300); font-size: 11.5px; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.sp-ver-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green-200); margin-right: 6px; }

.sp-bottom { position: relative; width: 100%; max-width: 300px; }
.sp-loading { display: flex; align-items: baseline; justify-content: space-between; }
.sp-loading span:first-child { font-size: var(--m-fs-body-sm); color: var(--gray-300); }
.sp-pct { font-size: var(--m-fs-caption); color: var(--gray-400); font-variant-numeric: tabular-nums; }
.sp-progress { height: 4px; margin-top: 9px; border-radius: 999px; background: var(--gray-800); overflow: hidden; }
.sp-progress i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--brand-500), var(--brand-300));
  transition: width var(--m-duration-page) var(--m-ease-out); }
.sp-hint { margin-top: 12px; text-align: center; font-size: 11.5px; line-height: 1.6; color: var(--gray-400); }
.sp-enter { display: inline-flex; align-items: center; justify-content: center; min-height: var(--m-touch-min); margin-top: 12px; padding: 0 16px;
  border-radius: var(--m-radius-btn); border: 1px solid var(--gray-800); color: var(--gray-100);
  font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-semibold); }
.sp-enter .icon { width: 16px; height: 16px; margin-left: 4px; }
.sp-org { margin-top: 6px; text-align: center; font-size: 11px; color: var(--gray-450); letter-spacing: 0.02em; }

@media (max-height: 700px) {
  .sp-page { padding-top: 60px; }
  .sp-logo { width: 76px; height: 76px; border-radius: 23px; }
  .sp-logo .icon { width: 40px; height: 40px; }
  .sp-name { margin-top: 18px; }
}
</style>
