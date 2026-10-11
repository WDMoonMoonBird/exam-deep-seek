/**
 * useObjectiveCompare.js —— 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 B3，源行 327-400 / 412-415）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动（导出集中在文末）。
 * 注意：本页有四条形态轴（practice/exam × code/objective × narrow × 数据状态族）；
 *      模式真值源唯一（U2 的 data/isPracticeMode），本文件不得自行创建第二份。
 * 客观题作答/判定/展示（形态轴 2 专属：sq.type === objective 时模板才走这条路径）。
 * parsedAnswers 是 computed，本单元无条件实例化（不得按形态条件创建，方案 §1.5-A2）。
 */
import { computed } from 'vue';

export function useObjectiveCompare({ subQuestions, getSub }) {

// 解析学生客观题答案
const parsedAnswers = computed(() => {
  const map = {};
  for (const sq of subQuestions.value) {
    if (sq.type !== 'objective') continue;
    const sub = getSub(sq.id);
    if (!sub?.answer) continue;
    try { map[sq.id] = JSON.parse(sub.answer); } catch { map[sq.id] = []; }
  }
  return map;
});

function getStudentItem(sqId, itemKey) {
  const items = parsedAnswers.value[sqId] || [];
  return items.find(a => a.key === itemKey) || null;
}

function isItemAnswered(sqId, item) {
  const a = getStudentItem(sqId, item.key);
  return a && (a.answer || '').trim().length > 0;
}

function isItemCorrect(sqId, item) {
  const a = getStudentItem(sqId, item.key);
  if (!a || !(a.answer || '').trim()) return false;
  if (item.type === 'choice') {
    return String(a.answer).trim() === String(item.answer).trim();
  } else if (item.type === 'multi_choice') {
    const sSet = new Set(String(a.answer).split(',').map(s => s.trim()).filter(Boolean));
    const aSet = new Set((Array.isArray(item.answer) ? item.answer : String(item.answer).split(',')).map(s => s.trim()));
    return sSet.size === aSet.size && [...sSet].every(s => aSet.has(s));
  } else if (item.type === 'judge') {
    return String(a.answer).trim() === String(item.answer).trim();
  } else if (item.type === 'fill') {
    const ra = String(item.answer || '').split(',').map(s => s.trim());
    const sa = String(a.answer || '').split(',').map(s => s.trim());
    return ra.every((r, bi) => String(sa[bi] || '').toLowerCase() === r.toLowerCase());
  }
  return false;
}

function getItemStudentStr(sqId, item) {
  const a = getStudentItem(sqId, item.key);
  if (!a || !(a.answer || '').trim()) return '（未作答）';
  if (item.type === 'choice') {
    const o = (item.options || []).find(opt => opt.key === a.answer);
    return o ? `${a.answer}. ${o.text}` : a.answer;
  } else if (item.type === 'multi_choice') {
    const keys = String(a.answer).split(',').map(s => s.trim()).filter(Boolean);
    return keys.map(k => {
      const o = (item.options || []).find(opt => opt.key === k);
      return o ? `${k}. ${o.text}` : k;
    }).join(', ') || '（未作答）';
  } else if (item.type === 'judge') {
    return a.answer === 'true' ? '正确' : a.answer === 'false' ? '错误' : a.answer;
  }
  return a.answer || '';
}

function getItemRefStr(item) {
  if (item.type === 'choice') {
    const o = (item.options || []).find(opt => opt.key === item.answer);
    return o ? `${item.answer}. ${o.text}` : item.answer;
  } else if (item.type === 'multi_choice') {
    const keys = (Array.isArray(item.answer) ? item.answer : String(item.answer).split(',')).map(s => s.trim());
    return keys.map(k => {
      const o = (item.options || []).find(opt => opt.key === k);
      return o ? `${k}. ${o.text}` : k;
    }).join(', ');
  } else if (item.type === 'judge') {
    return item.answer === 'true' ? '正确' : item.answer === 'false' ? '错误' : item.answer;
  }
  return item.answer || '';
}

function itemResultColor(sqId, item) {
  if (!isItemAnswered(sqId, item)) return 'empty';
  return isItemCorrect(sqId, item) ? 'correct' : 'wrong';
}

  return {
    parsedAnswers, getStudentItem, isItemAnswered, isItemCorrect,
    getItemStudentStr, getItemRefStr, itemResultColor,
  };
}

export default useObjectiveCompare;
