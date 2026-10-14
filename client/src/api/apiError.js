/**
 * apiError.js —— ★W1（t1）：**API 失败的唯一规范化出口**（零依赖：只吃传入值，可被 node 直接 import 做断言）。
 *
 * 为什么要有它（已复现的真实故障）：
 *   视图里裸用 `await request.*`，失败即抛原始 AxiosError ⇒ 冒泡到 ErrorBoundary ⇒ **整页被错误页替换**：
 *     ① 管理员「新增教师」姓名留空 ⇒ POST /api/admin/teachers 400 ⇒ handleOk 无 try/catch ⇒ 「页面渲染出错…路由：/admin/teachers」且列表消失；
 *     ② 打开非本人 / 不存在的题 ⇒ 404 + code 1004 ⇒ useLoadQuestion 未处理 ⇒ 同样整页替换。
 *   根因之一是「页面拿到的是**未规范化**的原始错误」：形状不稳定（有没有 response？status？业务 code？）、
 *   文案不可读（网络层措辞直冲 UI）。这里把**任何**失败统一成 ApiError{status, code, message, url}：
 *     · status ：HTTP 状态码；无响应（网络断开 / 超时 / 中断）一律 0；
 *     · code   ：业务码（响应体 code 字段，如 1004）；无响应体时退化为 HTTP status；两者都没有时 null；
 *     · message：**面向用户的可读文案**（服务端业务文案优先，否则按状态码给统一口径）；
 *     · url    ：出错的请求地址（诊断用，控制台日志/错误边界「复制诊断信息」都会带上）；
 *     · cause  ：原始错误（原始 AxiosError / Error），排查时经 console.error 看它，**不上屏**；
 *     · response：保留原始响应（兼容既有 errorCopyOf 的 response.data.message 口径与 1007 软警告分支）。
 *
 * 口径（承袭 R2-B55 / R2-B58 既有约定，不另立第二套）：
 *   · 面向用户的文案**固定友好**，**绝不**插入原始 JS 错误原文（err.message / String(err) 之类）；
 *   · 服务端业务文案（response.data.message）优先——那是后端给出的友好提示；
 *   · 原始错误一律进 console（errorCopy.js 的 errorCopyOf / 本模块的 detailOf 负责）。
 *
 * 自检：`node client/scripts/verify-frontend.mjs` 的 ⑮ 段会用**假响应对象**直接跑本模块 + request.js 拦截器
 * （不引入新依赖、不发真实网络），断言 ApiError 四要素与 401 语义；本文件因此必须保持**零 import**。
 */

/** HTTP 状态 → 面向用户的统一文案（服务端没给业务文案时的兜底；不出现网络层原文） */
export const HTTP_MESSAGE = {
  400: '请求参数有误，请检查后重试',
  403: '没有权限执行该操作',
  404: '请求的内容不存在或已被删除',
  405: '该操作不被支持',
  408: '请求超时，请稍后重试',
  409: '数据已被改动，请刷新后重试',
  413: '内容过大，请精简后重试',
  415: '不支持的内容格式',
  422: '提交的内容不符合要求',
  429: '操作过于频繁，请稍后再试',
  500: '服务出错了，请稍后重试',
  502: '服务暂时不可用，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '服务响应超时，请稍后重试',
};

/** 无响应（网络断开 / DNS / 超时 / 被中断）：status=0 */
export const NETWORK_MESSAGE = '网络异常，请检查网络后重试';
export const UNKNOWN_MESSAGE = '请求失败，请重试';
/** ★401 统一语义：清登录态 + 跳登录页 + 只用这一句文案（唯一出口见 request.js handleAuthExpired） */
export const AUTH_EXPIRED_MESSAGE = '登录已过期，请重新登录';

/**
 * 规范化后的 API 错误。页面/组合式函数**只应**收到它（不再收到裸 AxiosError）。
 * 形状固定：status / code / message / url 四要素 + cause / response（兼容与排查用）。
 */
export class ApiError extends Error {
  constructor({ status = 0, code = null, message = UNKNOWN_MESSAGE, url = '', cause = null, response = null, silent = false, uiSafe = null } = {}) {
    super(String(message || UNKNOWN_MESSAGE));
    this.name = 'ApiError';
    /**
     * message 是否**足够具体**可以直接上屏（true=服务端业务文案或已登记的 HTTP 口径）：
     * 为 false 时（未知状态码 → UNKNOWN_MESSAGE 兜底）errorCopyOf 会退回「<操作名>失败，请重试」的动作口径，
     * 比一句泛泛的「请求失败，请重试」对用户更有指向性。
     */
    this.uiSafe = uiSafe === null ? (this.message !== UNKNOWN_MESSAGE) : !!uiSafe;
    /** 鸭子类型标记：跨模块 / 跨包（errorCopy.js 零依赖不 import 本文件）时也能识别"已规范化文案" */
    this.isApiError = true;
    this.status = Number(status) || 0;
    this.code = code === undefined ? null : code;
    this.url = String(url || '');
    /** 请求是否声明了 silent（调用方自行提示）；见 request.js 的静默开关约定 */
    this.silent = !!silent;
    if (cause) this.cause = cause;
    // 兼容既有口径：errorCopyOf 读 response.data.message；useAssignmentForm 读 response.data.code===1007
    if (response) this.response = response;
  }

  /** 单行摘要（控制台 / 诊断信息用；不含堆栈） */
  toString() {
    return '[' + this.status + (this.code === null || this.code === this.status ? '' : '/' + this.code) + '] ' + this.message + (this.url ? ' @ ' + this.url : '');
  }
}

/** 是否已规范化（含跨包传入的鸭子类型对象） */
export function isApiError(value) {
  return !!value && (value instanceof ApiError || value.isApiError === true);
}

/** 状态码 → 统一文案（401 有专门的统一语义，不在此表内） */
export function httpMessageOf(status) {
  const s = Number(status) || 0;
  if (s === 401) return AUTH_EXPIRED_MESSAGE;
  if (HTTP_MESSAGE[s]) return HTTP_MESSAGE[s];
  if (s >= 500) return HTTP_MESSAGE[500];
  if (s >= 400) return UNKNOWN_MESSAGE;
  return UNKNOWN_MESSAGE;
}

/** 业务响应体形状：对象且带 code 字段（字符串响应（如 responseType:'text'）不算业务信封） */
export function isBusinessEnvelope(payload) {
  return !!payload && typeof payload === 'object' && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'code');
}

/** 取服务端业务文案（唯一允许上屏的"服务器原文"），无则空串 */
function serverCopy(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const text = typeof payload.message === 'string' ? payload.message.trim() : '';
  return text;
}

/**
 * HTTP 状态兜底文案：401 统一语义；其余按状态码给统一口径。
 * （服务端给了业务文案时**优先**用服务端文案，见 normalizeApiError。）
 */
export function apiErrorCopy(status, fallback = '') {
  const s = Number(status) || 0;
  if (s === 401) return AUTH_EXPIRED_MESSAGE;
  if (s === 0) return fallback || NETWORK_MESSAGE;
  return httpMessageOf(s);
}

/**
 * ★W1-r2（t4）：**5xx 一律使用 HTTP 口径文案**，服务端原文只留在 response/cause 里（进 console / 诊断信息）。
 * 背景：server 端 500 曾把 err.message 拼进响应（如「服务器错误: xxx is not a function」），
 *   若照旧"服务端文案优先上屏"，内部实现细节会直接送到用户眼前（errorCopy 的 5xx 兜底是第二道防线，这里是第一道）。
 */
function curatedMessage(status, body) {
  if (Number(status) >= 500) return httpMessageOf(status);
  return serverCopy(body) || httpMessageOf(status);
}

/** 从"HTTP 200 但业务码 ≠ 0"的信封响应构造 ApiError（request.js 成功分支用） */
export function apiErrorFromEnvelope(res, config = null) {
  const body = (res && res.data) || {};
  const status = Number((res && res.status) || 200) || 200;
  const code = body.code === undefined ? status : body.code;
  return new ApiError({
    status,
    code,
    message: curatedMessage(status, body),
    url: (config && config.url) || (res && res.config && res.config.url) || '',
    cause: null,
    response: res || null,
    silent: !!(config && config.silent),
  });
}

/** 是否为"传输层失败"（无响应：断网 / DNS / 超时 / 被中断）；普通 JS 异常**不算**，避免把代码 bug 说成网络问题 */
export function isTransportFailure(raw) {
  if (!raw) return false;
  if (raw.isAxiosError === true) return true;
  if (raw.request || raw.config) return true;
  return ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_CANCELED'].includes(raw.code);
}

/**
 * ★唯一入口：把**任何**失败（axios 错误 / 业务码错误 / 原生 Error / 未知值）规范化成 ApiError。
 * 幂等：已是 ApiError 时原样返回。
 * 文案优先级：服务端业务文案 ⇒ HTTP 状态可读文案 ⇒（传输层）网络文案 ⇒（普通 JS 异常）通用兜底。
 * 最后一档走 UNKNOWN_MESSAGE ⇒ uiSafe=false ⇒ errorCopyOf 会退回「<操作名>失败，请重试」的动作口径。
 */
export function normalizeApiError(raw, config = null) {
  if (isApiError(raw)) return raw;
  const cfg = config || (raw && raw.config) || null;
  const res = (raw && raw.response) || null;
  const status = Number((res && res.status) || (raw && raw.status) || 0) || 0;
  const body = res && res.data;
  const code = isBusinessEnvelope(body) ? body.code : (status || null);
  const message = status
    ? curatedMessage(status, body)
    : (isTransportFailure(raw) ? NETWORK_MESSAGE : UNKNOWN_MESSAGE);
  return new ApiError({
    status,
    code,
    message,
    url: (cfg && cfg.url) || '',
    cause: raw || null,
    response: res,
    silent: !!(cfg && cfg.silent),
  });
}

/** 原始错误详情（只进 console / 诊断信息，不上屏）；无堆栈时退回单行文本 */
export function detailOf(raw) {
  if (!raw) return '(无原始错误)';
  try {
    if (raw.stack) return String(raw.stack);
    if (raw.message) return String(raw.message);
    return String(raw);
  } catch { return '(原始错误不可读)'; }
}

/**
 * 已提示登记（★防重复提示）：拦截器与 useSafeRequest 共用**同一份** WeakSet ——
 * 同一个 ApiError 实例只提示一次（HTTP 失败由拦截器提示，safe* 只在没人提示过时才补一次），
 * 避免"一次失败弹两个 toast"。
 */
const notified = new WeakSet();

export function markNotified(err) {
  try { if (err && typeof err === 'object') notified.add(err); } catch { /* ignore */ }
  return err;
}

export function isNotified(err) {
  try { return !!err && typeof err === 'object' && notified.has(err); } catch { return false; }
}

/** 是否仍需要提示（拦截器已提示过 ⇒ false） */
export function shouldNotify(err) {
  return !isNotified(err);
}

export default {
  HTTP_MESSAGE, NETWORK_MESSAGE, UNKNOWN_MESSAGE, AUTH_EXPIRED_MESSAGE,
  ApiError, isApiError, httpMessageOf, isBusinessEnvelope, apiErrorCopy,
  apiErrorFromEnvelope, normalizeApiError, detailOf, markNotified, isNotified, shouldNotify,
};
