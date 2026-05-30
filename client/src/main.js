import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App.vue';
import router from './router';
import './style.css';

dayjs.locale('zh-cn');

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(Antd);
app.mount('#app');
