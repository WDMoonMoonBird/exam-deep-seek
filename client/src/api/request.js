import axios from 'axios';
import { message } from 'ant-design-vue';
import {
  ApiError, AUTH_EXPIRED_MESSAGE, apiErrorFromEnvelope, isBusinessEnvelope, markNotified, normalizeApiError,
} from './apiError.js';
import { withAppBase } from '../domain/appPath.js';   // ★W8（t10/F1）：站内地址一律 base 感知（禁裸根）

/**
 * 全站唯一 axios 实例 + ★W1（t1）**失败规范化**：任何失败都变成 ApiError{status,code,message,url}，
 * 页面/组合式函数不再拿到裸 AxiosError（形状与文案口径见 apiError.js）。
 *
 * 旧行为的三个洞（本次一并堵上）：
 *   ① 错误直接以 AxiosError 原样 reject ⇒ 文案不可读、形状不稳定；
 *   ② 失败仅由拦截器 message.error 提示 ⇒ 调用方 await 失败即抛，冒泡到 ErrorBoundary ⇒ 整页被替换；
 *   ③ 业务码 ≠ 0 的信封响应"提示后仍 resolve" ⇒ 失败被当成成功（页面读到 undefined.data）。
 * 现约定：
 *   · 失败**一律 reject(ApiError)**（含业务码 ≠ 0 的信封），调用方用 useSafeRequest 的 safeLoad/safeSubmit
 *     或 try/catch 就地处理 —— 详见 client/src/composables/useSafeRequest.js 与 verify-frontend ⑮ 静态门禁；
 *   · 401 统一语义（唯一出口 handleAuthExpired）：清登录态 + 跳登录页 + 一句统一文案，**不重复提示**；
 *   · 静默开关（silent: true）语义不变：只 reject、不弹全局提示，由调用方自行处理；
 *   · 1007 软警告（布置作业确认框）仍走**白名单例外**：那是正常业务分支，不额外弹"报错"。
 *
 * ★本文件可被 node 直接 import（不依赖 DOM）：`import.meta.env` 在 node 下退化为 {}，
 *   verify-frontend ⑮ 因此能直接取拦截器 handlers 跑断言（假响应对象，不发真实网络）。
 */
const ENV = import.meta.env || {};

const request = axios.create({
  baseURL: ENV.VITE_API_BASE_URL || '/api',
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
 *      由调用方 try/catch 或 safe* 自行处理；401 跳登录、Authorization 与 schoolId 注入等既有行为不变。
 * 用途：侧栏徽标这类「辅助信息」请求 —— 失败不能打断用户。
 */
function isSilent(config) {
  return config?.silent === true;
}

/**
 * 全局错误提示器（★自检注入点）：默认走 antd message，且**提示本身失败不得反过来影响业务**。
 * verify-frontend ⑮ 会在 node 下（无 document）替换它——antd 的 message 在无 DOM 环境会异步抛错，
 * 那是"提示环境"的问题，与错误处理逻辑无关，故留这个显式接缝让门禁能确定性地断言"提示了几次"。
 */
let errorNotifier = (text) => {
  try { message.error(text); } catch { /* 无 DOM / antd 异常：忽略 */ }
};

export function setErrorNotifier(fn) {
  if (typeof fn === 'function') errorNotifier = fn;
}

function toastError(text) {
  try { errorNotifier(text); } catch { /* 提示失败不得反过来影响业务 */ }
}

/** 业务码非 0 时构造 ApiError（保留 response，兼容 1007 分支与 errorCopyOf 口径） */
function businessError(res) {
  return apiErrorFromEnvelope(res, res && res.config);
}

/**
 * 布置作业 Q9 软警告（HTTP 400 + code=1007 + data.requiresConfirmation）是**正常业务分支**：
 * 页面（Assignments.vue / useAssignmentForm.js）会据此弹确认框，文案本身就含「以下题目未上传标准工程包…」；
 * 若这里再弹一次 message.error，同一件事会以「报错」形式出现，误导教师以为布置失败。
 * 因此只对「精确可确认分支」静默，其余错误（1001/1002/1003/1004/500/网络错误…）一律照旧提示——
 * 这不是关闭错误提示，而是一个白名单例外。
 */
function isConfirmableWarning(err) {
  const body = err?.response?.data;
  // 判定只看"业务分支是谁"（code=1007 + requiresConfirmation），不绑死传输形态：
  // 该软警告既可能以 HTTP 400 回来，也可能以 200 信封回来——两者都应由页面确认框承接，而不是弹"报错"。
  return !!body && body.code === 1007 && body.data?.requiresConfirmation === true;
}

/**
 * ★W1-r2（t4）：**控制流码**白名单 —— 与 isConfirmableWarning 同级，把"控制流"与"错误"分开。
 *
 * 为什么必须单独判：同一个 `code: 1002` 在本仓有**四种语义、横跨四种 HTTP 状态**：
 *   · HTTP 200 + code 1002 + data.schools ⇒ **登录控制流**（该学号存在多个学校，请选校）—— 唯一必须 resolve 的一支
 *     （server：controllers/authController.js 返回 {code:1002,data:{schools}}；前端消费点：views/Login.vue 的 if (res.code === 1002)）
 *   · HTTP 401 + code 1002 ⇒ 未登录 / Token 过期 / 用户不存在 / 密码已变更 ⇒ **必须**走 handleAuthExpired
 *   · HTTP 404 + code 1002 ⇒ 运行记录不存在；HTTP 429 + code 1002 ⇒ 原密码错误次数过多
 * ⇒ 因此**不能**按 code 做白名单（会把 401/404/429 的语义一起吞掉）。判据必须三条件同时成立：
 *     ① HTTP 2xx（控制流只可能是成功响应）；② code 命中控制流码集合；③ 该控制流所需的载荷齐备（data.schools 非空数组）。
 *   命中 ⇒ **照旧 resolve**（把信封原样交给调用方自行分支），且**不弹任何错误提示**。
 *   其余（含 401/404/429 + 1002）一律照旧 reject —— 401 仍由 handleAuthExpired 统一处置。
 * 登记（与 ⑮ 注释同款口径）：本函数是"控制流 ⇒ resolve"的唯一出口；新增控制流码必须同时在此登记 +
 *   在 client/scripts/verify-frontend.mjs 的 ⑮c4 补回放断言（200 ⇒ RESOLVED，401/404/429 ⇒ REJECTED）。
 */
const CONTROL_FLOW_ENVELOPES = [
  {
    code: 1002,
    /** 载荷齐备判定：多学校登录必须真的带着可选学校列表 */
    hasPayload: (data) => Array.isArray(data && data.schools) && data.schools.length > 0,
    why: '多学校学生登录：需先选校（Login.vue 1002 分支）',
  },
];

function isControlFlowEnvelope(res) {
  const status = Number((res && res.status) || 0);
  if (!(status >= 200 && status < 300)) return false;      // ① 只有成功响应才是控制流（401/404/429 一律排除）
  const body = res && res.data;
  if (!isBusinessEnvelope(body)) return false;
  return CONTROL_FLOW_ENVELOPES.some((entry) => entry.code === body.code && entry.hasPayload(body.data));   // ② + ③
}

/** 自检/排查用：控制流码清单（verify-frontend ⑮c4 按此做回放断言） */
export function controlFlowCodes() {
  return CONTROL_FLOW_ENVELOPES.map((e) => ({ code: e.code, why: e.why }));
}

/**
 * ★401 统一语义（唯一出口；自检注入点见 setAuthRedirect）：清登录态 + 跳登录页 + 一句统一文案。
 *
 * ★W8（t10/F1/F2）：跳登录有两条路径，二者都不许用裸根地址，且都要让统一文案**真的可见**：
 *   · 主路径（应用内）：main.js 用 setAuthRedirect 注入 `router.push({ path: '/login', query: { expired: '1' } })`
 *     —— 留在 SPA 里，antd message 不会被整页跳转销毁（F2 的直接原因就是旧实现的 location 整页跳转），
 *     登录页再据 ?expired=1 常驻展示同一句文案（双保险）。
 *   · 兜底路径（router 不可用时）：本文件的默认实现 —— 必须 **base 感知**（withAppBase ⇒ '/exam/login'），
 *     否则在 /exam/ 部署下会请求站点根 /login ⇒ 生产 nginx 无此 location ⇒ 用户被踢到默认 404（F1）；
 *     同样带上 ?expired=1，让登录页承接提示（整页跳转会丢掉 toast，这条参数就是那一路的保险）。
 */
let authExpiredHandled = false;
let redirectToLogin = () => {
  try {
    const target = withAppBase('/login') + '?expired=1';
    if (typeof window !== 'undefined' && window.location) window.location.assign(target);
  } catch { /* 非浏览器环境（自检）忽略 */ }
};

export function setAuthRedirect(fn) {
  if (typeof fn === 'function') redirectToLogin = fn;
}

/** 自检用：复位"已处置"标记（真实运行时一次会话内只处置一次，防并发 401 刷屏） */
export function resetAuthExpired() {
  authExpiredHandled = false;
}

/**
 * 401：登录态已失效 —— 语义只有一种，处置只有一处。
 * 并发多个请求同时 401 ⇒ 只清一次、只提示一次、只跳一次（不再 N 个 toast 叠在一起）。
 */
export function handleAuthExpired() {
  if (authExpiredHandled) return false;
  authExpiredHandled = true;
  try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch { /* ignore */ }
  toastError(AUTH_EXPIRED_MESSAGE);
  try { redirectToLogin(); } catch { /* 跳转失败不得再抛 */ }
  return true;
}

/**
 * ★R3-R5（P1，2026-10-18）：**403 + code 1005 = 「必须先修改初始密码」的全局控制流**（不是错误）。
 *
 *   背景：后端闸门（server/src/middleware/auth.js:62）对非学生账号在 mustChangePassword=true 时
 *   拒绝除 PUT /api/auth/password 外的所有已认证请求（HTTP 403 + code 1005）；登录响应已带
 *   user.mustChangePassword（authController.js:181）。修复前桌面端零消费 ⇒ 进业务页后每条接口都弹
 *   一条通用错误、且没有统一引导入口。
 *
 *   与 401 的差异（**不能合并**）：
 *     · 1005 **不清 token** —— 改密接口本身仍需要登录态，清了 token 就永远进不了改密页（死循环）；
 *     · 1005 **不弹通用错误 toast** —— 由改密页给出明确文案，避免每次数据请求刷屏；
 *     · 与 401 一样**并发去重**（只跳一次），并留自检注入点（setPasswordChangeRedirect）供 node
 *       环境下的门禁断言（verify-frontend ⑮ 同款接缝）。
 *
 *   跳转目标 '/change-password?required=1'：本文件兜底实现必须 **base 感知**（withAppBase ⇒ '/exam/...'）；
 *   主路径由 main.js 用 router.replace 注入（SPA 内导航、不整页刷新）。
 */
let passwordChangeHandled = false;
let redirectToChangePassword = () => {
  try {
    const target = withAppBase('/change-password') + '?required=1';
    if (typeof window !== 'undefined' && window.location) window.location.assign(target);
  } catch { /* 非浏览器环境（自检）忽略 */ }
};

export function setPasswordChangeRedirect(fn) {
  if (typeof fn === 'function') redirectToChangePassword = fn;
}

/** 自检/改密成功后复位「已处置」标记（防一次会话内永久去重而漏掉后续重置场景） */
export function resetPasswordChangeHandled() {
  passwordChangeHandled = false;
}

/** 403/1005 唯一出口：去重 + 跳强制改密页；不清 token、不弹通用错误。 */
export function handleMustChangePassword() {
  if (passwordChangeHandled) return false;
  passwordChangeHandled = true;
  try { redirectToChangePassword(); } catch { /* 跳转失败不得再抛 */ }
  return true;
}

request.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (isBusinessEnvelope(body) && body.code !== 0) {
      // ★W1-r2：先判**控制流码**（HTTP 2xx + code 1002 + data.schools）⇒ 照旧 resolve、不提示，把信封交给调用方
      //   （回归背景：t1 把"信封一律 reject"写死 ⇒ Login.vue 的选校分支不可达 ⇒ 多学校学生无法登录）
      if (isControlFlowEnvelope(res)) return body;
      // ★R3-R5：业务信封形态的 1005（后端若改送 HTTP 2xx）同样按强制改密控制流处置：不弹通用错误、reject 给调用方
      if (body.code === 1005) {
        const gated = businessError(res);
        handleMustChangePassword();
        markNotified(gated);
        return Promise.reject(gated);
      }
      // ★业务码 ≠ 0 = 失败：一律 reject(ApiError)；静默请求不提示（调用方处理）；
      // 1007 软警告（需确认）与 HTTP 400 分支共用同一白名单 ⇒ 不弹"报错"，由页面确认框承接。
      const fail = businessError(res);
      if (!isSilent(res.config) && !isConfirmableWarning(fail)) { toastError(fail.message); markNotified(fail); }
      return Promise.reject(fail);
    }
    return body;
  },
  (err) => {
    const fail = normalizeApiError(err, err && err.config);   // ★页面从此拿到的是 ApiError，不是裸 AxiosError
    if (fail.status === 401) {
      handleAuthExpired();                                    // 401 已统一提示 + 跳转 ⇒ 不再走下面的通用提示
      // ★W8（t10）：必须登记"这次失败已提示过" —— handleAuthExpired 弹的就是统一文案；不登记的话，
      //   页面里的 safeLoad/safeSubmit 会拿同一个 ApiError 再弹一次同名提示（真浏览器实测到 2 条重复）。
      markNotified(fail);
      return Promise.reject(fail);
    }
    // ★R3-R5：403 + 1005 = 强制改密闸门（见文件上方 handleMustChangePassword 注释）。
    //   **不清 token、不弹通用错误**，只做一次去重跳转；改密页承接文案与表单。
    if (fail.status === 403 && fail.code === 1005) {
      handleMustChangePassword();
      markNotified(fail);
      return Promise.reject(fail);
    }
    if (!fail.silent && !isConfirmableWarning(fail)) {
      toastError(fail.message);
      markNotified(fail);                                     // 登记：safe* 不会对同一次失败重复提示
    }
    return Promise.reject(fail);
  }
);

export { ApiError };
export default request;
