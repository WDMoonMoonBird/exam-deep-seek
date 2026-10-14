/**
 * useAssignmentLoader.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B4，源行 1033-1108 / 1109-1168）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import request from '../../api/request.js';
import { useSafeRequest } from '../useSafeRequest.js';   // ★W1（t1）：失败就地提示、不冒泡

export function useAssignmentLoader({
  route, data, allowResubmit, endTime, maxAttempts, scorePolicy, answerVisibility, q, subQuestions,
  answers, editorLangs, subStatuses, subScores, subFeedbacks, bestScore,
  submittedAttempts, currentAttempt,
  initObjectiveAnswers, markObjectiveCorrect, armDeadlineTimer,
}) {
const { safeLoad } = useSafeRequest({ tag: 'useAssignmentLoader.js' });

// ===================== 数据加载 =====================

/** 数据加载器。注意：函数名不得叫 fetch —— 同模块内的函数声明会遮蔽全局 fetch，
 *  曾导致 onBeforeUnload 的 keepalive 落盘实际发出 GET 列表请求（V3）。 */
async function loadAssignment() {
  // ★W1（t1）：作业不存在/已关闭（404/403）只就地提示并保留空态，不再把整页替换成错误页
  const r = await safeLoad(() => request.get(`/student/assignments/${route.params.id}`), { action: '加载作业' });
  if (r.error) return;
  data.value = r.data;
  const ass = r.data.assignment;
  if (ass) {
    allowResubmit.value = !!ass.allowResubmit;
    endTime.value = ass.endTime;
    // R3-D1：三开关（②计分口径 / ③答案可见性 -> 未配置时与后端默认一致：取最后 / 发布后可见）
    scorePolicy.value = ass.scorePolicy === 'best' ? 'best' : 'last';
    answerVisibility.value = ass.answerVisibility === 'immediate' ? 'immediate' : 'after_publish';
    maxAttempts.value = ass.maxAttempts || null;
  }
  const aq = ass?.assignmentQuestions?.[0];
  if (!aq) return;
  q.value = aq.question || {};
  subQuestions.value = q.value.subQuestions || [];

  (subQuestions.value || []).forEach(sq => {
    if (!answers[sq.id]) answers[sq.id] = '';
    editorLangs[sq.id] = sq.language || 'cpp';
  });

  // 恢复已有提交
  (r.data.submissions || []).forEach(s => {
    const key = s.subQuestionId || s.questionId;
    const sq = subQuestions.value.find(sq => sq.id === key);
    if (sq?.type === 'objective') {
      initObjectiveAnswers(sq.id, sq.objectiveItems || [], [s]);
    } else {
      answers[key] = s.answer || '';
    }
    subStatuses[key] = s.status;
    // 分数/评语/对错：一律以**后端下发的字段**为准（后端按「已发布 / 开关 / 历史 practice」规则裁剪），
    // 前端不再依据 mode 判断 —— 开关驱动（US-B5 前端部分）。
    if (s.finalScore != null || s.bestScore != null) {
      subScores[key] = s.finalScore ?? s.bestScore;
    }
    if (s.teacherFeedback) subFeedbacks[key] = s.teacherFeedback;
    // 标准答案已随本次响应下发（可见性开关放行）⇒ 客观题可就地判定对错（与后端同源，不额外泄漏）
    if (sq?.type === 'objective' && (sq.objectiveItems || []).some(it => it.answer != null)) {
      markObjectiveCorrect(sq, s);
    }
  });

  // 初始化未提交小题
  subQuestions.value.forEach(sq => {
    if (sq.type === 'objective') {
      const existing = (r.data.submissions || []).filter(s => (s.subQuestionId || s.questionId) === sq.id);
      initObjectiveAnswers(sq.id, sq.objectiveItems || [], existing);
    }
    if (!answers[sq.id]) answers[sq.id] = '';
  });

  // 截止时间强制提交（延迟钳制 + 回调内重算 + 到期二次校验，见 armDeadlineTimer）
  armDeadlineTimer();

  // 统计已提交次数和最高分
  let best = null;
  let maxAttemptCount = 0;
  (r.data.submissions || []).forEach(s => {
    if (s.bestScore != null && (best == null || s.bestScore > best)) best = s.bestScore;
    if (s.attemptCount > maxAttemptCount) maxAttemptCount = s.attemptCount;
  });
  bestScore.value = best;
  submittedAttempts.value = maxAttemptCount;
  currentAttempt.value = maxAttemptCount + 1;

  // 有正在评分中的提交 ⇒ 开启轮询（开关驱动，不再限定练习模式）
  if ((r.data.submissions || []).some(s => s.status === 'submitted')) startPolling();
}

// ===================== 评分轮询 =====================

let pollTimer = null;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollStatus, 2000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollStatus() {
  try {
    const r = await request.get(`/student/assignments/${route.params.id}`);
    const subs = r.data.submissions || [];
    let anyGrading = false;
    let anyTransitioned = false;
    for (const s of subs) {
      const key = s.subQuestionId || s.questionId;
      const sq = subQuestions.value.find(sq => sq.id === key);
      const prevStatus = subStatuses[key];
      subStatuses[key] = s.status;
      if (s.status === 'submitted') {
        anyGrading = true;
      } else if (s.status === 'ai_graded' || s.status === 'reviewed') {
        if (prevStatus !== s.status) {
          anyTransitioned = true;
          subScores[key] = s.finalScore ?? s.aiScore;
          if (sq?.type === 'code' || !sq?.type) {
            subFeedbacks[key] = s.teacherFeedback || s.aiFeedback || '';
          }
          if (sq?.type === 'objective') {
            markObjectiveCorrect(sq, s);
          }
          if (s.bestScore != null && (bestScore.value == null || s.bestScore > bestScore.value)) {
            bestScore.value = s.bestScore;
          }
        }
      }
    }
    // 评分完成时刷新题目数据以获取参考答案（API 出分后才返回）
    if (!anyGrading && anyTransitioned) {
      const aq = r.data.assignment?.assignmentQuestions?.[0];
      if (aq) {
        const freshSubs = aq.question?.subQuestions || [];
        for (const freshSq of freshSubs) {
          const existing = subQuestions.value.find(sq => sq.id === freshSq.id);
          if (existing) {
            existing.referenceAnswer = freshSq.referenceAnswer;
            if (freshSq.objectiveItems) {
              existing.objectiveItems = freshSq.objectiveItems;
            }
          }
        }
      }
    }
    if (!anyGrading) stopPolling();
  } catch { stopPolling(); }
}

  return { loadAssignment, startPolling, stopPolling, pollStatus };
}
