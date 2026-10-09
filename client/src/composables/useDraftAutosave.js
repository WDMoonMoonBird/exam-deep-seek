import { ref, getCurrentInstance, onBeforeUnmount } from 'vue';

/**
 * useDraftAutosave —— 草稿自动保存（Wave 2 构件）
 * 契约：docs/ui-redesign/11-wave2-brief.md §2
 *
 * const { status, lastSavedAt, saveNow, schedule } = useDraftAutosave({
 *   save: async () => { … },    // 实际保存函数（页面提供，内部仍是原有请求）
 *   delay: 1500,                // 输入防抖；各页现有的节拍原样传入（QuestionEdit 2s / TeamEdit 300ms）
 *   interval: 30000,            // 定时兜底（0 = 关闭）
 *   enabled: () => dirty.value, // 保存闸门：返回 false 则跳过本次保存
 * });
 *
 * status: 'idle' | 'saving' | 'saved' | 'error'
 *   —— 页面把它渲染成动作条左侧的状态文本（role="status" aria-live="polite"）
 * lastSavedAt: Date | null —— 最近一次保存成功的时间
 * schedule(): 输入时调用，delay 内的多次调用合并为一次保存
 * saveNow():   立即保存（跳过防抖），返回 Promise<boolean>（true = 保存成功）
 *
 * 组件卸载时清理全部定时器与 visibilitychange 监听。
 */
export function useDraftAutosave(options = {}) {
  const {
    save,
    delay = 1500,
    interval = 0,
    enabled = () => true,
  } = options;

  /** 'idle' | 'saving' | 'saved' | 'error' */
  const status = ref('idle');
  /** Date | null */
  const lastSavedAt = ref(null);

  let debounceTimer = null;
  let intervalTimer = null;
  let inflight = null;
  let disposed = false;

  /** 闸门：enabled 可以是函数（每次保存前求值）或普通值 */
  function isEnabled() {
    if (typeof enabled !== 'function') return !!enabled;
    try {
      return !!enabled();
    } catch (e) {
      return false;
    }
  }

  function runSave() {
    if (disposed) return Promise.resolve(false);
    if (inflight) return inflight;          // 已有保存在进行中：复用同一次，避免并发重复提交
    if (!isEnabled()) return Promise.resolve(false);

    status.value = 'saving';
    inflight = Promise.resolve()
      .then(() => (typeof save === 'function' ? save() : undefined))
      .then(
        () => {
          lastSavedAt.value = new Date();
          status.value = 'saved';
          return true;
        },
        () => {
          // 失败提示交给调用方的请求层（api/request.js 拦截器已统一 toast），这里只落状态供页面展示
          status.value = 'error';
          return false;
        },
      )
      .then((ok) => {
        inflight = null;
        return ok;
      });
    return inflight;
  }

  function clearDebounce() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  /** 输入触发的防抖保存 */
  function schedule() {
    if (disposed) return;
    clearDebounce();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runSave();
    }, Math.max(0, Number(delay) || 0));
  }

  /** 立即保存（保存按钮 / 离开前兜底），返回值可 await */
  function saveNow() {
    clearDebounce();
    return runSave();
  }

  /**
   * 页面隐藏时把「已排队但还没到点」的防抖保存立即落盘（防止关标签丢草稿）。
   * 这不是新增保存时机，只是把已计划的保存提前，因此不受 delay 影响、仍走 enabled 闸门。
   */
  function onVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && debounceTimer !== null) {
      clearDebounce();
      runSave();
    }
  }

  if (Number(interval) > 0) {
    intervalTimer = setInterval(() => {
      if (debounceTimer !== null) return;   // 待执行的防抖马上就要保存，避免同一时刻两次请求
      runSave();
    }, Number(interval));
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  /** 组件卸载：清理定时器与监听（在组件外调用时由调用方自行保证生命周期） */
  function stop() {
    disposed = true;
    clearDebounce();
    if (intervalTimer !== null) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  }

  if (getCurrentInstance()) onBeforeUnmount(stop);

  return { status, lastSavedAt, saveNow, schedule };
}

export default useDraftAutosave;
