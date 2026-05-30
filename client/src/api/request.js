import axios from 'axios';
import { message } from 'ant-design-vue';

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
});

request.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.role === 'teacher' && user?.currentSchool?.id) {
      config.params = { ...config.params, schoolId: user.currentSchool.id };
    }
  } catch { /* localStorage 不可用 */ }
  return config;
});

request.interceptors.response.use(
  (res) => {
    if (res.data.code !== 0) {
      message.error(res.data.message || '请求失败');
    }
    return res.data;
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    message.error(err.response?.data?.message || '网络错误');
    return Promise.reject(err);
  }
);

export default request;
