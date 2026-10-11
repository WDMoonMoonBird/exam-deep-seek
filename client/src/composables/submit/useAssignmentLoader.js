/**
 * useAssignmentLoader.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B4，源行 1033-1108 / 1109-1168）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import request from '../../api/request.js';

export function useAssignmentLoader({
  route, data, allowResubmit, endTime, isPracticeMode, maxAttempts, q, subQuestions,
  answers, editorLangs, subStatuses, subScores, subFeedbacks, bestScore,
  submittedAttempts, currentAttempt,
  initObjectiveAnswers, markObjectiveCorrect, armDeadlineTimer,
}) {

// ===================== 数据加载 =====================

/** 数据加载器。注意：函数名不得叫 fetch —— 同模块内的函数声明会遮蔽全局 fetch，
 *  曾导致 onBeforeUnload 的 keepalive 落盘实际发出 GET 列表请求（V3）。 */
async function loadAssignment() {
  const r = await request.get(`/student/assignments/${route.params.id}`);
  data.value = r.data;
  const ass = r.data.assignment;
  if (ass) {
    allowResubmit.value = !!ass.allowResubmit;
    endTime.value = ass.endTime;
    isPracticeMode.value = ass.mode === 'practice';
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
    // 已发布 或 练习模式已评分 → 显示分数
    const isScored = s.status === 'published' || (isPracticeMode.value && (s.status === 'ai_graded' || s.status === 'reviewed'));
    if (isScored) {
      subScores[key] = s.finalScore ?? s.aiScore;
      if (sq?.type === 'code' || !sq?.type) {
        subFeedbacks[key] = s.teacherFeedback || s.aiFeedback || '';
      }
      if (sq?.type === 'objective') {
        markObjectiveCorrect(sq, s);
      }
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

  // 练习模式：如果有正在评分中的提交，开启轮询
  if (isPracticeMode.value) {
    const hasGrading = (r.data.submissions || []).some(s => s.status === 'submitted');
    if (hasGrading) startPolling();
  }
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
