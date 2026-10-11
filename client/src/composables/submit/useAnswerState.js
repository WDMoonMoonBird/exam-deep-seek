/**
 * useAnswerState.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B3，源行 297-321 / 330-350 / 421-465 / 670-752）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { ref, reactive } from 'vue';
import { getItemKey, itemTypeLabel } from './answerFormat.js';

export function useAnswerState({ markDirty, isSqReadonly }) {

// ===================== 数据（P1 全部状态：所有权唯一，只在本文件创建一次） =====================

const data = ref(null);
const q = ref({});
const subQuestions = ref([]);
const allowResubmit = ref(false);
const endTime = ref(null);
const showMaterial = ref(true);
const isPracticeMode = ref(false);
const maxAttempts = ref(null);
const currentAttempt = ref(1);
const submittedAttempts = ref(0);
const bestScore = ref(null);

const answers = reactive({});         // sqId → code string
const itemAnswers = reactive({});     // "sqId_itemKey" → { answer, correct }
const multiAnswerBind = reactive({}); // "sqId_itemKey" → string[] (多选复选框)
const subStatuses = reactive({});     // sqId → status
const subScores = reactive({});       // sqId → score
const subFeedbacks = reactive({});    // sqId → string (来自教师或系统反馈)
const editorLangs = reactive({});     // sqId → language string

const submittingAll = ref(false);
let draftTimer = null;
let deadlineTimer = null;

const langs = ['c', 'cpp', 'csharp', 'java', 'python', 'javascript', 'typescript', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql', 'shell', 'r', 'scala', 'perl'];

function getNavLabel(sq, i) {
  const n = `第${i + 1}小题`;
  const settings = q.value.objectiveSettings || {};
  if (sq.type === 'code' || !sq.type) return n;
  if (settings.classificationMode === 'flat') {
    const items = sq.objectiveItems || [];
    const firstType = items[0]?.type;
    return firstType ? `${n} ${itemTypeLabel(firstType)}` : n;
  }
  return n; // group 模式只显示小题号
}

function sqHasScore(sqId) {
  const s = subStatuses[sqId];
  return s === 'published' || (isPracticeMode.value && (s === 'ai_graded' || s === 'reviewed'));
}

function isSqAnswered(sq) {
  if (sq.type === 'objective') {
    return (sq.objectiveItems || []).some(item =>
      (itemAnswers[getItemKey(sq.id, item.key)]?.answer || '').trim()
    );
  }
  return (answers[sq.id] || '').trim().length > 0;
}

// 主观题方块状态：出分后按得分率着色，否则只看是否作答
function getSqResult(sq) {
  const key = sq.id;
  const status = subStatuses[key];
  // 考试已发布 或 练习已评分 → 按得分率着色
  if (status === 'published' || (isPracticeMode.value && (status === 'ai_graded' || status === 'reviewed'))) {
    const ratio = (subScores[key] || 0) / (sq.score || 1);
    if (ratio >= 0.8) return 'correct';
    if (ratio >= 0.4) return 'partial';
    return 'wrong';
  }
  return isSqAnswered(sq) ? 'done' : 'empty';
}

// 客观题小问状态：出分后看对错，未出分看是否作答
function getItemResult(sqId, itemKey) {
  const k = getItemKey(sqId, itemKey);
  const entry = itemAnswers[k];
  if (!entry || !(entry.answer || '').trim()) return 'empty';
  if (entry.correct === true) return 'correct';
  if (entry.correct === false) return 'wrong';
  return 'done';
}

// 客观题卡片 class（出分后显示对错框色）
function oiCardClass(sqId, item) {
  const subStatus = subStatuses[sqId];
  const isScored = subStatus === 'published' || (isPracticeMode.value && (subStatus === 'ai_graded' || subStatus === 'reviewed'));
  if (!isScored) return { 'oi-readonly': isSqReadonly(sqId) };
  const entry = itemAnswers[getItemKey(sqId, item.key)];
  if (!entry || !(entry.answer || '').trim()) return {};
  return {
    'oi-correct': entry.correct === true,
    'oi-wrong': entry.correct === false,
  };
}

// ===================== 多选双向绑定 =====================

function onMultiBindChange(sqId, itemKey) {
  const k = getItemKey(sqId, itemKey);
  itemAnswers[k].answer = (multiAnswerBind[k] || []).join(',');
  markDirty();
}

// ===================== 客观题答案初始化 =====================

function initObjectiveAnswers(sqId, items, existingSubmissions) {
  for (const item of (items || [])) {
    const k = getItemKey(sqId, item.key);
    if (!itemAnswers[k]) {
      itemAnswers[k] = { answer: item.type === 'judge' ? '' : '', correct: undefined };
      if (item.type === 'multi_choice') multiAnswerBind[k] = [];
    }
  }
  (existingSubmissions || []).forEach(s => {
    try {
      const ans = JSON.parse(s.answer || '[]');
      for (const a of (ans || [])) {
        const k = getItemKey(sqId, a.key);
        if (a.key !== undefined && itemAnswers[k]) {
          itemAnswers[k].answer = a.answer || '';
          if (multiAnswerBind[k] !== undefined) {
            multiAnswerBind[k] = String(a.answer || '').split(',').map(s => s.trim()).filter(Boolean);
          }
        }
      }
    } catch { /* ignore */ }
  });
}

// 比对客观题每个小问的正确性
function markObjectiveCorrect(sq, sub) {
  const items = sq.objectiveItems || [];
  let answers = [];
  try { answers = JSON.parse(sub.answer || '[]'); } catch {}
  for (const item of items) {
    const a = answers.find(x => x.key === item.key) || {};
    const sAns = (a.answer || '').trim();
    if (!sAns) continue;
    const k = getItemKey(sq.id, item.key);
    if (!itemAnswers[k]) continue;
    if (item.type === 'choice') {
      itemAnswers[k].correct = sAns === String(item.answer || '').trim();
    } else if (item.type === 'multi_choice') {
      const sSet = new Set(sAns.split(',').map(s => s.trim()).filter(Boolean));
      const aSet = new Set((Array.isArray(item.answer) ? item.answer : String(item.answer).split(',')).map(s => s.trim()));
      itemAnswers[k].correct = sSet.size === aSet.size && [...sSet].every(s => aSet.has(s));
    } else if (item.type === 'judge') {
      itemAnswers[k].correct = sAns === String(item.answer || '').trim();
    } else if (item.type === 'fill') {
      const ra = String(item.answer || '').split(',').map(s => s.trim());
      const sa = String(sAns).split(',').map(s => s.trim());
      itemAnswers[k].correct = ra.every((r, bi) => String(sa[bi] || '').toLowerCase() === r.toLowerCase());
    }
  }
}

function buildObjectiveAnswer(sq) {
  const arr = [];
  for (const item of (sq.objectiveItems || [])) {
    const k = getItemKey(sq.id, item.key);
    arr.push({ key: item.key, answer: itemAnswers[k]?.answer || '' });
  }
  return JSON.stringify(arr);
}

// 客观题是否有部分小问答了、部分没答
function hasPartialOmissions(sq) {
  const items = sq.objectiveItems || [];
  if (!items.length) return false;
  const answered = items.filter(item =>
    (itemAnswers[getItemKey(sq.id, item.key)]?.answer || '').trim()
  ).length;
  return answered > 0 && answered < items.length;
}

function hasObjectiveAnswer(sq) {
  for (const item of (sq.objectiveItems || [])) {
    if ((itemAnswers[getItemKey(sq.id, item.key)]?.answer || '').trim()) return true;
  }
  return false;
}

  return {
    data, q, subQuestions, allowResubmit, endTime, showMaterial, isPracticeMode,
    maxAttempts, currentAttempt, submittedAttempts, bestScore, submittingAll, langs,
    answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, editorLangs,
    getNavLabel, sqHasScore, isSqAnswered, getSqResult, getItemResult, oiCardClass,
    onMultiBindChange, initObjectiveAnswers, markObjectiveCorrect,
    buildObjectiveAnswer, hasPartialOmissions, hasObjectiveAnswer,
  };
}
