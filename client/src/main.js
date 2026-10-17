import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App.vue';
import router from './router';
import './style.css';
// 设计令牌（Wave 0 引入）：必须在 style.css 之后，保证同名令牌以令牌文件为准
import './styles/tokens.css';
// 全局覆盖层：只放必须作用于 teleport 元素（Modal/Drawer）的规则，禁止 !important
import './styles/overrides.css';
import { isLegacyBrowser } from './domain/browserCompat';
import { installErrorRecovery } from './components/errorRecovery.js';   // ★R2-B52：chunk 失败自愈 + 全局错误可见
import { installVersionWatcher } from './composables/appVersion.js';   // ★R2-B59：入口版本探测（有新版本 ⇒ 提示刷新）
import { message } from 'ant-design-vue';
import { setAuthRedirect } from './api/request.js';   // ★W8（t10/F1/F2）：401 的跳登录改成 SPA 内导航

dayjs.locale('zh-cn');

// 旧浏览器标记：首帧前就位，供 legacy-patch.css 的 html.legacy 前缀规则匹配（无 FOUC）
if (isLegacyBrowser()) {
  document.documentElement.classList.add('legacy');
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(Antd);

// ★W8（t10/F1/F2）：登录态过期（401）时**留在 SPA 内**跳登录 ——
//   · 目标路径由 vue-router 按 createWebHistory('/exam/') 自动加 base（旧实现写死裸根 '/login'，
//     在 /exam/ 部署下请求站点根 ⇒ 生产 nginx 无该 location ⇒ 用户被踢到默认 404）；
//   · 不经整页跳转 ⇒「登录已过期，请重新登录」的提示不会被销毁（F2）；登录页再按 ?expired=1 常驻展示同一句。
//   · 极端情况（router 不可用）由 request.js 的 base 感知兜底实现接手（同样带 ?expired=1）。
setAuthRedirect(() => {
  try {
    // ★T0（mobile v1）：401 时若当前在 /m 移动端，必须跳移动登录页（/m/login），
    //   否则移动用户会被踢到桌面 /login（移动端未注册该页的移动体验、且违背契约 §3 守卫口径）。
    //   桌面路径行为保持原样：/login?expired=1。
    const current = router.currentRoute.value;
    const currentPath = current && typeof current.path === 'string' ? current.path : '';
    const inMobile = currentPath === '/m' || currentPath.indexOf('/m/') === 0;
    if (inMobile) {
      const redirect = currentPath === '/m/login' ? '' : current.fullPath;
      const query = redirect ? { expired: '1', redirect } : { expired: '1' };
      const navMobile = router.push({ path: '/m/login', query });
      if (navMobile && typeof navMobile.catch === 'function') navMobile.catch(() => { /* 已在该路由 / 导航被取消：忽略 */ });
      return;
    }
    const nav = router.push({ path: '/login', query: { expired: '1' } });
    if (nav && typeof nav.catch === 'function') nav.catch(() => { /* 已在该路由 / 导航被取消：忽略 */ });
  } catch { /* 忽略：交由 request.js 的兜底跳转 */ }
});

// ★R2-B52：必须在 mount 之前安装 —— ①懒加载 chunk 失败 ⇒ 整页 reload 一次（sessionStorage 防循环）
//   ②app.config.errorHandler + window.unhandledrejection ⇒ 可见提示（message）且 console 带路由信息（不静默）
installErrorRecovery({
  app,
  router,
  notify: (text) => { try { message.error(text, 5); } catch { /* 提示失败不得反过来影响渲染 */ } },
});

app.mount('#app');

// ★R2-B59：入口版本探测 —— **mount 之后**安装（渲染永不被网络探测阻塞）。
//   发现线上入口哈希与本地不同 ⇒ 非打断式提示「有新版本，点击刷新」；失败/离线/坏 HTML 一律静默；
//   同一版本只提示一次；请求去抖 60s、轮询 5 分钟（参数见 composables/appVersion.js）。
installVersionWatcher({
  notify: () => {
    try {
      message.info({
        content: h('span', [h('span', '有新版本，'), h('a', { onClick: () => window.location.reload(), style: 'margin-left:4px' }, '点击刷新')]),
        duration: 0,
      });
    } catch { /* 提示失败不得反过来影响渲染 */ }
  },
});
