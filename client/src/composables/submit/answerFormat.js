/**
 * answerFormat.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B1，源行 342-345 / 352-366 / 404-409 / 411-417 / 419 / 497 / 499-503 / 664-667）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

export function itemTypeLabel(type) {
  const map = { choice: '单选', multi_choice: '多选', judge: '判断', fill: '填空' };
  return map[type] || type;
}

export function formatItemAnswer(item) {
  if (!item) return '';
  if (item.type === 'choice' || item.type === 'judge') {
    if (item.type === 'judge') return item.answer === 'true' ? '正确' : '错误';
    const opt = (item.options || []).find(o => o.key === item.answer);
    return opt ? `${item.answer}. ${opt.text}` : item.answer;
  } else if (item.type === 'multi_choice') {
    const keys = (Array.isArray(item.answer) ? item.answer : String(item.answer || '').split(',')).map(s => s.trim());
    return keys.map(k => {
      const opt = (item.options || []).find(o => o.key === k);
      return opt ? `${k}. ${opt.text}` : k;
    }).join('；');
  }
  return item.answer || '';
}

export function itemTypeColor(type) {
  // 题型徽标：antd 预置色在某一主题下不达 AA（judge orange 亮 3.34、fill green 亮 3.37、multi_choice purple 暗 3.39）
  // → 这三类走 B2-2 的语义类（见 itemTypeClass）；choice 的 blue 实测亮 5.50 / 暗 4.91 已达标，维持预置色。
  const map = { choice: 'blue' };
  return map[type] || 'default';
}

export // 与 style.css 的 .tag-* 语义类配套：只对「预置色不达标」的三类返回类名（0-2-1 接管三色，不动盒模型）
function itemTypeClass(type) {
  if (type === 'judge') return 'tag-warning';
  if (type === 'fill') return 'tag-success';
  if (type === 'multi_choice') return 'tag-accent';
  return '';
}

export function getItemKey(sqId, itemKey) { return `${sqId}_${itemKey}`; }

export const BOX_RESULT_TEXT = { correct: '正确', wrong: '错误', partial: '部分正确', done: '已作答', empty: '未作答' };

export /** 方块的可读名称（aria-label）：「第 N 小题 [第 M 问]，状态」 */
function boxLabel(sqIndex, itemKey, result) {
  const base = itemKey == null ? `第 ${sqIndex + 1} 小题` : `第 ${sqIndex + 1} 小题 第 ${itemKey + 1} 问`;
  return `${base}，${BOX_RESULT_TEXT[result] || '未作答'}`;
}

export function isCodeStem(stem) {
  if (!stem) return false;
  return stem.includes('```') || stem.includes('{') || stem.includes('function') || stem.includes('class ') || stem.includes('def ');
}
