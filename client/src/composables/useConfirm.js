import { Modal } from 'ant-design-vue';

/**
 * useConfirm —— 命令式确认框（Wave 2 构件）
 * 契约：docs/ui-redesign/11-wave2-brief.md §2（T12/T14/T15 照此使用）
 *
 * const { confirm } = useConfirm();
 * confirm({
 *   title: '确认按开放性题目布置',
 *   content: '……必须写清影响范围（N 名学生 / 不可撤销）……',
 *   okText: '确认布置',      // 文案规范：动词短语，禁止「确定」
 *   cancelText: '取消',
 *   danger: false,          // true → ok 按钮用危险色令牌 --red-600（危险操作必填 true）
 *   onOk: async () => { … }, // 支持 async；抛错则保持弹窗打开
 * });
 *
 * 行为与 antd Modal.confirm 等价（由 antd 的 _util/ActionButton 保障）：
 *  - onOk 返回 Promise → ok 按钮自动 loading，resolve 后关闭；
 *  - onOk 抛错 / reject → loading 复位、弹窗保持打开（错误提示由调用方的 request 层统一 toast）。
 * 返回值即 antd 的 confirm 句柄（含 destroy()），与原生用法一致。
 */

/**
 * onOk 失败时 antd 会在内部 `return Promise.reject(e)`（antd-vue 的 _util/ActionButton.js），
 * 这个派生 Promise 无人接管 → 浏览器会报 "Uncaught (in promise)"。
 * 用一层 thenable 代理：把 antd 拿到的派生 Promise 标记为已处理。
 * 行为（loading 复位 + 弹窗保持打开）完全不变，只是不再往控制台丢未处理拒绝。
 */
function silenceDerivedRejection(promise) {
  return {
    then(onFulfilled, onRejected) {
      const derived = promise.then(onFulfilled, onRejected);
      if (derived && typeof derived.catch === 'function') derived.catch(() => {});
      return derived;
    },
  };
}

export function useConfirm() {
  function confirm(options = {}) {
    const { title, content, okText = '确定', cancelText = '取消', danger = false, onOk } = options;

    return Modal.confirm({
      title,
      content,
      okText,
      cancelText,
      okButtonProps: danger
        // 主题尚未接管 colorError（见 styles/antd-theme.js 的波次约定：语义色留待后续波次），
        // 因此危险色直接绑令牌，不写死色值。
        ? { danger: true, style: { backgroundColor: 'var(--red-600)', borderColor: 'var(--red-600)' } }
        : {},
      // ⚠️ 这里不能声明形参：antd 用 actionFn.length 区分「旧式 (close) => {} 回调」
      // 与「返回 Promise 的新式回调」，一旦声明形参就绕过了 loading / 保持打开 逻辑。
      onOk() {
        const ret = typeof onOk === 'function' ? onOk() : undefined;
        return ret && typeof ret.then === 'function' ? silenceDerivedRejection(Promise.resolve(ret)) : ret;
      },
    });
  }

  return { confirm };
}

export default useConfirm;
