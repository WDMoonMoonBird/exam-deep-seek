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

/**
 * 布置作业 Q9 软警告（HTTP 400 + code=1007 + data.requiresConfirmation）是**正常业务分支**：
 * 页面（Assignments.vue）会据此弹确认框，文案本身就含「以下题目未上传标准工程包…」；
 * 若这里再弹一次 message.error，同一件事会以「报错」形式出现，误导教师以为布置失败。
 * 因此只对「精确可确认分支」静默，其余错误（1001/1002/1003/1004/500/网络错误…）一律照旧提示——
 * 这不是关闭错误提示，而是一个白名单例外。
 */
function isConfirmableWarning(err) {
  const body = err?.response?.data;
  return err?.response?.status === 400 && body?.code === 1007 && body?.data?.requiresConfirmation === true;
}

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
    if (!isConfirmableWarning(err)) {
      message.error(err.response?.data?.message || '网络错误');
    }
    return Promise.reject(err);
  }
);

export default request;
