import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App.vue';
import router from './router';
import './style.css';
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
