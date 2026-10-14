/**
 * useSafeRequest.js —— ★W1（t1）：**前端请求的安全调用约定**（safeLoad / safeSubmit）。
 *
 * 约定（本仓唯一口径，静态门禁 verify-frontend ⑮ 按此判定）：
 *   · safeLoad(() => request.get(url, cfg), opts)   —— 读取：列表/详情/下拉数据
 *   · safeSubmit(() => request.post(url, body), opts)—— 提交：新增/编辑/删除/批量操作
 *   两者**永不抛出**（失败就地提示 + 返回 error），因此**不会**冒泡到 ErrorBoundary ⇒ 不可能再"整页被错误页替换"。
 *
 * 返回值固定四要素 + 附加项：
 *   { ok, data, error, loading, message, res }
 *     · ok      ：boolean，成功 true；
 *     · data    ：成功 ⇒ 响应体 data（axios 已解包一层；字符串/裸值原样）；失败 ⇒ opts.fallback（默认 null）；
 *     · error   ：失败 ⇒ 规范化后的 ApiError（见 api/apiError.js）；成功 ⇒ null；
 *     · loading ：结算时刻的加载态（恒 false；配合 useSafeRequest 返回的 loading ref 使用）；
 *     · message ：失败时的**面向用户文案**（errorCopyOf 口径：服务端业务文案优先）；成功为 ''；
 *     · res     ：成功 ⇒ 原始响应体（需要 message/code 等额外字段时用）。
 *
 * 提示策略（★不重复提示）：HTTP 失败已由 request.js 拦截器提示过一次；这里用 apiError 的 WeakSet 登记
 * 判断「同一次失败是否已被提示」——已提示就不再弹第二个 toast；未提示（静默请求 / 非请求异常）才补一次。
 * 需要完全静默时传 { notify: false }，只想行内展示时读返回的 message 渲染空态/提示条。
 *
 * 用法：
 *   const { data, error, loading, message, safeLoad } = useSafeRequest({ tag: 'Teachers.vue fetch', action: '加载' });
 *   const r = await safeLoad(() => request.get('/admin/teachers'));
 *   if (r.error) return;          // 失败已就地提示，页面保持可用（列表不消失、路由不崩）
 *   list.value = r.data;
 */
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { errorCopyOf } from './errorCopy.js';
import { markNotified, normalizeApiError, shouldNotify } from '../api/apiError.js';

const DEFAULT_TAG = '未标注位置';

/** 调用注入的回调且**永不让它抛出**（提示/回滚钩子失败不得反过来影响业务） */
function safeCall(fn, arg) {
  try { return typeof fn === 'function' ? fn(arg) : undefined; } catch { return undefined; }
}

/** 成功提示（safeSubmit 传 successText 时用）：无 DOM 环境下失败也静默 */
function toastSuccess(text) {
  try { message.success(text); } catch { /* ignore */ }
}

/** 解包一层：axios 拦截器已返回响应体 {code,message,data} ⇒ 取 data；其它（字符串/数组/裸值）原样返回 */
function unwrap(res) {
  if (res && typeof res === 'object' && !Array.isArray(res) && Object.prototype.hasOwnProperty.call(res, 'data')) return res.data;
  return res;
}

/**
 * 纯逻辑核心（可注入 notify/log，便于 node 下自检）。useSafeRequest 与下面导出的
 * 无状态 safeLoad/safeSubmit 都基于它。
 */
export function createSafeRunner(options = {}) {
  const { tag = DEFAULT_TAG, action = '', log = console, win = null, notify = null, loading = null } = options;
  const notifyError = (text) => {
    if (typeof notify === 'function') { safeCall(notify, text); return; }
    try { message.error(text); } catch { /* 提示失败不影响业务 */ }
  };

  async function run(fn, opts = {}) {
    const o = opts || {};
    if (loading) loading.value = true;
    try {
      const res = await fn();
      if (o.successText) toastSuccess(o.successText);
      return { ok: true, data: unwrap(res), error: null, message: '', loading: false, res };
    } catch (raw) {
      const fail = normalizeApiError(raw, raw && raw.config);
      // 文案口径复用 errorCopy.js（服务端业务文案优先 + 原始错误只进 console）
      const text = errorCopyOf(fail, { tag: o.tag || tag, action: o.action || action, log, win, suffix: o.suffix || '' });
      if (o.notify !== false && shouldNotify(fail)) { notifyError(text); markNotified(fail); }
      safeCall(o.onError, fail);
      return { ok: false, data: o.fallback === undefined ? null : o.fallback, error: fail, message: text, loading: false, res: null };
    } finally {
      if (loading) loading.value = false;
    }
  }

  return {
    /** 读取：失败就地提示并返回 error，**不抛出** */
    safeLoad: (fn, opts) => run(fn, opts),
    /** 提交：失败就地提示并返回 error，**不抛出**；可传 successText 做成功提示 */
    safeSubmit: (fn, opts) => run(fn, opts),
  };
}

/**
 * 组合式用法：返回 { data, error, loading, message, safeLoad, safeSubmit, reset }。
 * loading / data / error / message 都是 ref，可直接绑定模板。
 */
export function useSafeRequest(options = {}) {
  const data = ref(null);
  const error = ref(null);
  const loading = ref(false);
  const messageText = ref('');
  const runner = createSafeRunner({ ...options, loading });

  function apply(result) {
    data.value = result.data;
    error.value = result.error;
    messageText.value = result.message;
    return result;
  }

  const safeLoad = (fn, opts) => runner.safeLoad(fn, opts).then(apply);
  const safeSubmit = (fn, opts) => runner.safeSubmit(fn, opts).then(apply);

  /** 复位（切换编辑对象 / 关闭弹窗时清空上一次的错误与数据） */
  function reset() {
    data.value = null;
    error.value = null;
    messageText.value = '';
    loading.value = false;
  }

  return { data, error, loading, message: messageText, safeLoad, safeSubmit, reset };
}

/** 无状态版本（不持有 ref）：适合一次性调用或非 setup 上下文 */
export const safeLoad = (fn, opts = {}) => createSafeRunner(opts).safeLoad(fn, opts);
export const safeSubmit = (fn, opts = {}) => createSafeRunner(opts).safeSubmit(fn, opts);

export default useSafeRequest;
