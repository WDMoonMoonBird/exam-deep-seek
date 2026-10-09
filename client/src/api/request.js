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
 * 静默开关（Wave 2 t13 / R-1）：单个请求可传 `{ silent: true }` 关闭全局错误提示
 *   request.get('/teacher/pending-summary', { silent: true })
 * 语义：失败（HTTP 错误 / 网络错误 / 业务码非 0）**只 reject，不弹全局 message**，
 *      由调用方 try/catch 自行处理；401 跳登录、Authorization 与 schoolId 注入等既有行为不变。
 * 用途：侧栏徽标这类「辅助信息」请求 —— 失败不能打断用户。
 */
function isSilent(config) {
  return config?.silent === true;
}

/** 业务码非 0 时构造与 axios 错误同形状的 Error：err.response.data 仍能取到响应体 */
function businessError(res) {
  const err = new Error(res?.data?.message || '请求失败');
  err.code = res?.data?.code;
  err.data = res?.data?.data;
  err.response = res;
  return err;
}

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
      // 静默请求：不弹提示，但仍 reject（调用方 try/catch 统一处理）
      if (isSilent(res.config)) return Promise.reject(businessError(res));
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
    if (!isSilent(err.config) && !isConfirmableWarning(err)) {
      message.error(err.response?.data?.message || '网络错误');
    }
    return Promise.reject(err);
  }
);

export default request;
