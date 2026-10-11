/**
 * useCountdown.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B4，源行 602 / 867-933 / 935-962（另含 :319 的 deadlineTimer））。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { computed } from 'vue';
import { Modal } from 'ant-design-vue';
import request from '../../api/request.js';

export function useCountdown({
  route, q, endTime, subQuestions, subStatuses, answers,
  hasObjectiveAnswer, buildObjectiveAnswer,
}) {

const isExpired = computed(() => endTime.value ? Date.now() > new Date(endTime.value).getTime() : false);

let deadlineTimer = null;

// ===================== 截止倒计时调度（P-1 修复） =====================

// setTimeout 的延迟超过 2^31-1 会被 ToInt32 截断/回绕（≈24.86 天）：
// 远期作业会出现「打开即强制提交」或「回绕成正小值而提前提交」。此处统一约定：
//   ① 延迟上限钳制到 MAX_TIMEOUT_MS；
//   ② 回调内按当前时刻重算 remaining（不依赖闭包旧值），未到期则重新武装；
//   ③ 提交前做「与 isExpired 同判据」的即时二次校验，时钟跳变/截断误差都不会误提交；
//   ④ endTime 为空/非法/解析失败（NaN）时不建计时器 —— 安全降级为不强制提交。
const MAX_TIMEOUT_MS = 2147483647; // 2^31-1：浏览器计时器延迟上限（≈24.86 天）

function clearDeadlineTimer() {
  if (deadlineTimer) { clearTimeout(deadlineTimer); deadlineTimer = null; }
}

// 截止时间戳（毫秒）；空值/非法/解析失败一律 NaN，调用方据此不建计时器
function deadlineTimestamp() {
  if (!endTime.value) return NaN;
  const ts = new Date(endTime.value).getTime();
  return Number.isFinite(ts) ? ts : NaN;
}

// 到期二次校验（即时求值）：isExpired 是依赖 endTime 的缓存 computed，在计时器回调里读到的是
// 旧快照（依赖未变化就不会重算）→ 会退化成「每秒空转、永不提交」；这里用与 isExpired 同一判据的即时版本。
function isDeadlineExpired() {
  const ts = deadlineTimestamp();
  return Number.isFinite(ts) && Date.now() > ts;
}

// 武装计时（页面加载与回到前台时的校准入口）；已到期或时间非法时不提交、不建计时器
function armDeadlineTimer() {
  clearDeadlineTimer();
  const ts = deadlineTimestamp();
  if (!Number.isFinite(ts)) return;
  const remaining = ts - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return;
  deadlineTimer = setTimeout(onDeadlineTick, Math.min(remaining, MAX_TIMEOUT_MS));
}

// 到点回调：忽略闭包里的旧值，按当前时刻重算 —— 只有确认到期才强制提交
function onDeadlineTick() {
  deadlineTimer = null;
  const ts = deadlineTimestamp();
  if (!Number.isFinite(ts)) return;              // 时间被改脏：停止调度，不强制提交
  const remaining = ts - Date.now();
  if (remaining > 0) {                           // 钳制分段/时钟回拨：重新武装到真实截止时刻
    deadlineTimer = setTimeout(onDeadlineTick, Math.min(remaining, MAX_TIMEOUT_MS));
    return;
  }
  if (!isDeadlineExpired()) {                    // 到期二次校验未通过（恰好落在边界）→ 稍后再判
    deadlineTimer = setTimeout(onDeadlineTick, 1000);
    return;
  }
  forceSubmitAll();
}

// 回到前台：按当前时刻重新校准（后台节流/休眠可能让计时器晚到或未按时触发）
function recalibrateDeadline() {
  const ts = deadlineTimestamp();
  if (!Number.isFinite(ts)) { clearDeadlineTimer(); return; }
  const remaining = ts - Date.now();
  if (remaining > 0) {
    clearDeadlineTimer();
    deadlineTimer = setTimeout(onDeadlineTick, Math.min(remaining, MAX_TIMEOUT_MS));
    return;
  }
  // 已到期且计时器仍挂起（后台被节流未触发）→ 立即收敛到统一回调
  if (deadlineTimer) { clearTimeout(deadlineTimer); deadlineTimer = null; onDeadlineTick(); }
}

// ===================== 提交全部（截止到点强制提交） =====================

async function forceSubmitAll() {
  const submitted = [];
  const dropped = [];
  for (const sq of subQuestions.value) {
    const key = sq.id;
    const hasAnswer = sq.type === 'objective' ? hasObjectiveAnswer(sq) : (answers[key]?.trim());
    if (hasAnswer && subStatuses[key] !== 'submitted' && subStatuses[key] !== 'published') {
      try {
        const answer = sq.type === 'objective' ? buildObjectiveAnswer(sq) : answers[key];
        await request.post(`/student/assignments/${route.params.id}/submit`, {
          questionId: q.value.id, subQuestionId: key, answer, force: true,
        });
        subStatuses[key] = 'submitted';
        submitted.push(sq);
      } catch {/* ignore */}
    } else if (!hasAnswer) {
      dropped.push(sq);
    }
  }

  Modal.info({
    title: '考试时间已截止',
    content: `作答时间已到，系统已自动提交。\n已提交 ${submitted.length} 道题，${dropped.length} 道未作答的题目已视为弃答。`,
    okText: '知道了',
    onOk: () => {},
  });
}

  return {
    isExpired, clearDeadlineTimer, deadlineTimestamp, isDeadlineExpired,
    armDeadlineTimer, onDeadlineTick, recalibrateDeadline, forceSubmitAll,
  };
}
