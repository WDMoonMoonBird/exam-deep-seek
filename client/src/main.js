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

dayjs.locale('zh-cn');

// 旧浏览器标记：首帧前就位，供 legacy-patch.css 的 html.legacy 前缀规则匹配（无 FOUC）
if (isLegacyBrowser()) {
  document.documentElement.classList.add('legacy');
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(Antd);
app.mount('#app');
