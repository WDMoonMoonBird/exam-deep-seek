/**
 * useCountdown —— 截止时间倒计时（零依赖）
 *
 * 依据：docs/mobile-app/10-v1-implementation-contract.md §4（composables/useCountdown.js(endTime)）
 * 用法：
 *   const { text, expired, remaining, parts } = useCountdown(assignment.deadline);
 *   <span>{{ text }}</span>
 *
 * 入参 endTime 支持 Date / 毫秒时间戳 / ISO 字符串 / null（null 视为已截止，页面自行决定显隐）。
 * 返回值：
 *   remaining  —— 剩余毫秒数（number，>= 0）
 *   expired    —— 是否已到/超过截止时间
 *   parts      —— { days, hours, minutes, seconds }（整数）
 *   text       —— 中文短文案：如「2 天 3 小时」「7 小时 27 分」「9 分 30 秒」「30 秒」「已截止」
 *   start/stop —— 手动控制定时器（默认自动开始，组件卸载自动清理）
 *
 * 注意：每秒刷新一次；不轮询接口、不伪造时间，仅做本地展示。
 */
import { ref, computed, onBeforeUnmount, getCurrentInstance, unref } from 'vue';

const TICK_MS = 1000;

function toTimestamp(value) {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function useCountdown(endTime) {
  const now = ref(Date.now());
  let timer = null;

  const targetTs = computed(() => toTimestamp(unref(endTime)));
  const remaining = computed(() => {
    const target = targetTs.value;
    if (!Number.isFinite(target)) return 0;
    const diff = target - now.value;
    return diff > 0 ? diff : 0;
  });
  const expired = computed(() => !Number.isFinite(targetTs.value) || remaining.value <= 0);
  const parts = computed(() => {
    const total = Math.floor(remaining.value / 1000);
    return {
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
    };
  });
  const text = computed(() => {
    if (expired.value) return '已截止';
    const { days, hours, minutes, seconds } = parts.value;
    if (days > 0) return hours > 0 ? days + ' 天 ' + hours + ' 小时' : days + ' 天';
    if (hours > 0) return minutes > 0 ? hours + ' 小时 ' + minutes + ' 分' : hours + ' 小时';
    if (minutes > 0) return seconds > 0 ? minutes + ' 分 ' + seconds + ' 秒' : minutes + ' 分';
    return seconds + ' 秒';
  });

  function tick() {
    now.value = Date.now();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    tick();
    timer = setInterval(tick, TICK_MS);
  }

  start();

  // 仅在组件 setup 内使用时才自动清理；在组件外调用（如工具函数）不报错
  if (getCurrentInstance()) {
    onBeforeUnmount(stop);
  }

  return { remaining, expired, parts, text, start, stop };
}

export default useCountdown;
