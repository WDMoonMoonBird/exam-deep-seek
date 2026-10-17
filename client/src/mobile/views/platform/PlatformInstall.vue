<script setup>
/**
 * 安装到主屏（/m/platform/install）—— T3 公共/平台
 *
 * 依据：10-v1-implementation-contract.md §3、09-v1-scope-and-deferred-backlog.md §2.1
 *       docs/mobile-app/05-page-specs.md §3.5-35
 *   · 纯前端能力检测（UA / display-mode / beforeinstallprompt），不请求任何接口；
 *   · v1 未实现 manifest / Service Worker / 原生包（M4 以后）⇒ **不承诺「离线可用」「一键安装」**：
 *       - 只有浏览器真的触发 beforeinstallprompt 时才显示「一键安装」按钮；
 *       - 收益文案只写当前真实成立的三点（更快打开 / 全屏 / 同一登录态）；
 *       - 离线与原生安装包明确标注「后续版本提供」。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import MobileActionBar from '../../layout/MobileActionBar.vue';
import { MIcon } from '../../components/index.js';
import { useUserStore } from '../../../stores/user.js';
import { mobileHomePath } from '../../routes.js';
import { useMobileToast } from '../../composables/useMobileToast.js';

const toast = useMobileToast();
const userStore = useUserStore();

const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isWeChat = /MicroMessenger/i.test(ua);

const platform = computed(() => {
  if (isWeChat) return 'wechat';
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'other';
});
const platformLabel = computed(() => {
  if (platform.value === 'wechat') return '微信内置浏览器';
  if (platform.value === 'ios') return 'iOS · Safari';
  if (platform.value === 'android') return 'Android · Chrome';
  return '桌面或其他浏览器';
});

function detectStandalone() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    return window.navigator.standalone === true;
  } catch {
    return false;
  }
}
const installed = ref(detectStandalone());

/* beforeinstallprompt 只在浏览器认为「可安装」时才会触发（v1 没有 manifest，通常不会出现） */
const installPrompt = ref(null);
function onBeforeInstallPrompt(event) {
  event.preventDefault();
  installPrompt.value = event;
}
function onAppInstalled() {
  installPrompt.value = null;
  installed.value = true;
  toast.show('已添加到主屏幕');
}
onMounted(() => {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
});
onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.removeEventListener('appinstalled', onAppInstalled);
});

async function promptInstall() {
  const event = installPrompt.value;
  if (!event) return;
  try {
    event.prompt();
    await event.userChoice;
  } catch {
    /* 用户取消 / 浏览器拒绝：保持手动指引 */
  } finally {
    installPrompt.value = null;
  }
}

/* ---------------------------------------------------------------- 复制本站链接（无离线/免登录承诺） */
const shareUrl = computed(() => {
  try {
    return typeof window !== 'undefined' && window.location ? window.location.href : '';
  } catch {
    return '';
  }
});
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
async function copyLink() {
  try {
    await copyText(shareUrl.value);
    toast.show('已复制本站链接');
  } catch {
    toast.show('复制失败，请长按地址栏手动复制');
  }
}

const loggedIn = computed(
  () => userStore.isLoggedIn && (userStore.role === 'student' || userStore.role === 'teacher')
);
const enterTarget = computed(() => (loggedIn.value ? mobileHomePath(userStore.role) : '/m/login'));
const primaryLabel = computed(() => (installed.value || loggedIn.value ? '进入移动端' : '已安装，去登录'));
</script>

<template>
  <MobileLayout bottom="actionbar">
    <MobileAppBar title="安装到主屏" back back-to="/m" />
    <main class="scroll">
      <!-- 品牌 -->
      <div class="pi-hero">
        <span class="pi-logo" aria-hidden="true"><MIcon name="logo" /></span>
        <div class="pi-name">DEADPAN 判题</div>
        <h2 class="pi-title">把 Deadpan 装到桌面</h2>
        <p class="pi-sub">像 App 一样打开：从桌面图标直达，少一层浏览器地址栏。</p>
      </div>

      <!-- 已安装 / 微信 / 当前平台提示（真实能力检测） -->
      <div v-if="installed" class="banner banner--success pi-platform" role="status">
        <MIcon name="check-circle" />
        <div><b>已在独立窗口打开</b>：当前设备已从主屏幕启动，可继续使用原有登录态。</div>
      </div>
      <div v-else-if="platform === 'wechat'" class="banner banner--warning pi-platform" role="alert">
        <MIcon name="alert" />
        <div>
          <b>微信内置浏览器无法添加到主屏幕</b>：请点右上角「…」选择「在浏览器打开」，再按下方指引操作。
          <button type="button" class="pi-inline-btn" @click="copyLink">复制链接</button>
        </div>
      </div>
      <div v-else class="banner banner--info pi-platform">
        <MIcon name="info" />
        <div><b>当前识别为 {{ platformLabel }}</b>：按下方对应指引添加到主屏幕。</div>
      </div>

      <!-- 安装收益（只写 v1 真实成立的能力） -->
      <div class="pi-benefits">
        <div class="pi-benefit">
          <span class="pi-benefit-ico" aria-hidden="true"><MIcon name="zap" /></span>
          <b>打开更快</b>
          <span>桌面图标直达，跳过手动输入网址</span>
        </div>
        <div class="pi-benefit">
          <span class="pi-benefit-ico" aria-hidden="true"><MIcon name="grid" /></span>
          <b>全屏体验</b>
          <span>从主屏幕启动时隐藏部分浏览器工具栏</span>
        </div>
        <div class="pi-benefit">
          <span class="pi-benefit-ico" aria-hidden="true"><MIcon name="check-circle" /></span>
          <b>同一账号</b>
          <span>与浏览器共用登录态，无需重新登录</span>
        </div>
      </div>

      <!-- 浏览器支持一键安装时才显示（v1 无 manifest，通常不出现） -->
      <div v-if="installPrompt" class="page mt16">
        <button type="button" class="btn btn--primary btn--block" @click="promptInstall">
          <MIcon name="download" />一键安装到主屏幕
        </button>
      </div>

      <!-- 手动指引 -->
      <div class="pi-guides">
        <div class="pi-guides-title">添加到主屏幕</div>

        <article class="card pi-guide" :class="{ 'pi-guide--current': platform === 'android' }">
          <div class="pi-guide-head">
            <span class="pi-mark pi-mark--android" aria-hidden="true"><MIcon name="grid" /></span>
            <div class="pi-guide-main">
              <h3>Android · Chrome</h3>
              <p>菜单 → 安装应用 / 添加到主屏幕</p>
            </div>
            <span v-if="platform === 'android'" class="tag tag--success"><i class="dot"></i>当前平台</span>
          </div>
          <ol class="pi-steps">
            <li class="pi-step">
              <span class="pi-step-ico" aria-hidden="true"><MIcon name="link" /></span>
              <div class="pi-step-main"><b>用 Chrome 打开本页</b><span class="s">在地址栏输入校内网地址，或从消息里的链接打开。</span></div>
            </li>
            <li class="pi-step">
              <span class="pi-step-ico" aria-hidden="true"><MIcon name="more" /></span>
              <div class="pi-step-main"><b>点右上角「⋮」菜单</b>，选择「安装应用」或「添加到主屏幕」<span class="s">不同浏览器文案可能不同，本质都是创建桌面快捷方式。</span></div>
            </li>
            <li class="pi-step">
              <span class="pi-step-ico" aria-hidden="true"><MIcon name="download" /></span>
              <div class="pi-step-main"><b>按提示确认</b>，桌面出现 Deadpan 图标<span class="s">打开后仍使用同一个账号登录。</span></div>
            </li>
          </ol>
        </article>

        <article class="card pi-guide" :class="{ 'pi-guide--current': platform === 'ios' }">
          <div class="pi-guide-head">
            <span class="pi-mark" aria-hidden="true"><MIcon name="share" /></span>
            <div class="pi-guide-main">
              <h3>iOS · Safari</h3>
              <p>分享 → 添加到主屏幕</p>
            </div>
            <span v-if="platform === 'ios'" class="tag tag--success"><i class="dot"></i>当前平台</span>
          </div>
          <ol class="pi-steps">
            <li class="pi-step">
              <span class="pi-step-ico" aria-hidden="true"><MIcon name="link" /></span>
              <div class="pi-step-main"><b>用 Safari 打开本页</b><span class="s">微信 / QQ 内置浏览器不支持「添加到主屏幕」。</span></div>
            </li>
            <li class="pi-step">
              <span class="pi-step-ico" aria-hidden="true"><MIcon name="share" /></span>
              <div class="pi-step-main"><b>点底部工具栏的「分享」按钮</b><span class="s">若工具栏已收起，向上轻扫屏幕底部即可展开。</span></div>
            </li>
            <li class="pi-step">
              <span class="pi-step-ico" aria-hidden="true"><MIcon name="plus" /></span>
              <div class="pi-step-main"><b>选择「添加到主屏幕」，点右上角「添加」</b><span class="s">iOS 不提供「安装应用」入口，这是官方支持的方式。</span></div>
            </li>
          </ol>
        </article>

        <div class="card card--tint pi-note">
          <p><b>关于后续能力</b>：离线缓存与 Android 原生安装包计划在后续版本提供，本版本仅支持把网页添加到主屏幕。</p>
          <button type="button" class="btn btn--sm btn--secondary pi-copy" @click="copyLink">
            <MIcon name="copy" />复制本站链接
          </button>
        </div>
      </div>

      <p class="pi-foot">Deadpan 判题 v2.1.0 · 仅限校内网访问<br />遇到问题请联系信息中心</p>
    </main>

    <MobileActionBar>
      <RouterLink class="btn btn--secondary" to="/m">稍后再装</RouterLink>
      <RouterLink class="btn btn--primary" :to="enterTarget">{{ primaryLabel }}</RouterLink>
    </MobileActionBar>
  </MobileLayout>
</template>

<style scoped>
/* ============ 安装引导页样式：只用令牌 ============ */
.pi-hero { display: flex; flex-direction: column; align-items: center; padding: 18px var(--m-gutter) 0; text-align: center; }
.pi-logo { width: 64px; height: 64px; border-radius: 19px; background: var(--brand-600); color: var(--text-on-brand);
  display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-md); }
.pi-logo .icon { width: 33px; height: 33px; stroke-width: 1.9; }
.pi-name { margin-top: 10px; font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-semibold); color: var(--text-tertiary); letter-spacing: var(--m-tracking-wide); }
.pi-title { margin-top: 4px; font-size: var(--m-fs-title-1); line-height: 1.3; font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.pi-sub { margin-top: 7px; max-width: 300px; font-size: var(--m-fs-body-sm); line-height: 1.6; color: var(--text-secondary); }

.pi-platform { margin: 14px var(--m-gutter) 0; }
.pi-inline-btn { display: inline-flex; align-items: center; min-height: var(--m-touch-min); margin-left: 4px; padding: 0 6px;
  color: inherit; font-weight: var(--m-fw-semibold); text-decoration: underline; }

.pi-benefits { display: grid; grid-template-columns: repeat(3, 1fr); grid-gap: 10px; gap: 10px; margin: 18px var(--m-gutter) 0; }
.pi-benefit { padding: 13px 11px; background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: 14px; }
.pi-benefit-ico { width: 32px; height: 32px; border-radius: 10px; background: var(--bg-selected); color: var(--text-brand); display: flex; align-items: center; justify-content: center; }
.pi-benefit-ico .icon { width: 17px; height: 17px; }
.pi-benefit b { display: block; margin-top: 9px; font-size: 13px; font-weight: var(--m-fw-semibold); color: var(--text-primary); }
.pi-benefit span { display: block; margin-top: 2px; font-size: 11px; line-height: 1.45; color: var(--text-tertiary); }

.pi-guides { margin: 16px var(--m-gutter) 0; }
.pi-guides-title { margin: 0 2px 8px; font-size: var(--m-fs-caption); font-weight: var(--m-fw-semibold); letter-spacing: 0.06em; color: var(--text-tertiary); }
.pi-guide { padding: 15px var(--m-card-pad); }
.pi-guide + .pi-guide { margin-top: 10px; }
.pi-guide--current { border-color: var(--status-info-bd); box-shadow: 0 0 0 1px var(--status-info-bd); }
.pi-guide-head { display: flex; align-items: center; }
.pi-mark { width: 36px; height: 36px; border-radius: 11px; background: var(--bg-sunken); color: var(--text-primary);
  display: flex; align-items: center; justify-content: center; flex: none; }
.pi-mark .icon { width: 19px; height: 19px; }
.pi-mark--android { background: var(--status-success-bg); color: var(--status-success-fg); }
.pi-guide-main { flex: 1; min-width: 0; margin-left: 11px; }
.pi-guide-main h3 { font-size: var(--m-fs-title-3); font-weight: var(--m-fw-semibold); color: var(--text-primary); }
.pi-guide-main p { margin-top: 1px; font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.pi-steps { margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
.pi-step { display: flex; align-items: flex-start; }
.pi-step + .pi-step { margin-top: 12px; }
.pi-step-ico { width: 28px; height: 28px; border-radius: 9px; background: var(--bg-surface-2); color: var(--text-secondary);
  display: flex; align-items: center; justify-content: center; flex: none; margin-right: 10px; }
.pi-step-ico .icon { width: 15px; height: 15px; }
.pi-step-main { flex: 1; min-width: 0; font-size: var(--m-fs-body-sm); line-height: 1.55; color: var(--text-secondary); }
.pi-step-main b { color: var(--text-primary); font-weight: var(--m-fw-semibold); }
.pi-step-main .s { display: block; margin-top: 1px; font-size: 11.5px; color: var(--text-tertiary); }

.pi-note { margin-top: 10px; padding: 13px 14px; }
.pi-note p { font-size: var(--m-fs-body-sm); line-height: 1.6; color: var(--text-secondary); }
.pi-copy { margin-top: 10px; }
.pi-foot { margin-top: 16px; padding: 0 var(--m-gutter); text-align: center; font-size: 11px; line-height: 1.7; color: var(--text-tertiary); }
</style>
