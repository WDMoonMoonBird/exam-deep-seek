import { createApp } from 'vue';
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
import { message } from 'ant-design-vue';

dayjs.locale('zh-cn');

// 旧浏览器标记：首帧前就位，供 legacy-patch.css 的 html.legacy 前缀规则匹配（无 FOUC）
if (isLegacyBrowser()) {
  document.documentElement.classList.add('legacy');
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(Antd);

// ★R2-B52：必须在 mount 之前安装 —— ①懒加载 chunk 失败 ⇒ 整页 reload 一次（sessionStorage 防循环）
//   ②app.config.errorHandler + window.unhandledrejection ⇒ 可见提示（message）且 console 带路由信息（不静默）
installErrorRecovery({
  app,
  router,
  notify: (text) => { try { message.error(text, 5); } catch { /* 提示失败不得反过来影响渲染 */ } },
});

app.mount('#app');
