/**
 * reviewPure.js —— 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 B1，源行 306-321 / 325 / 445 / 467-490）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动（导出集中在文末）。
 * 注意：本页有四条形态轴（practice/exam × code/objective × narrow × 数据状态族）；
 *      模式真值源唯一（U2 的 data/isPracticeMode），本文件不得自行创建第二份。
 * 纯叶子：零 vue / 零响应式 / 零内部依赖（只 import dompurify），被 U3/U7 import。
 * getItemKey 是源文件里的死代码（方案 §7.3-K1）—— 照旧保留并导出，不得删。
 */
import DOMPurify from 'dompurify';

function itemTypeLabel(type) {
  const map = { choice: '单选', multi_choice: '多选', judge: '判断', fill: '填空' };
  return map[type] || type;
}

function itemTypeColor(type) {
  const map = { choice: 'blue', multi_choice: 'purple', judge: 'orange', fill: 'green' };
  return map[type] || 'default';
}
/** T4-F2 类别收口（动态预置色）：题型徽标里 judge→orange 亮 3.34:1、fill→green 亮 3.37:1、
    multi_choice→purple 暗 3.39:1 均不达 AA → 走全局语义类（style.css，0-2-1 接管三色）；
    choice→blue 亮 5.50 / 暗 4.91 达标，保持预览色。 */
function itemTypeTagClass(type) {
  const map = { judge: 'tag-warning', fill: 'tag-success', multi_choice: 'tag-accent' };
  return map[type] || null;
}

function getItemKey(sqId, itemKey) { return `${sqId}_${itemKey}`; }

function safeSqContent(sq) { return DOMPurify.sanitize((sq || {}).content || ''); }

function isCodeStem(stem) {
  if (!stem) return false;
  return stem.includes('```') || stem.includes('{') || stem.includes('function') || stem.includes('class ') || stem.includes('def ');
}

function subStatusColor(sub) {
  if (sub?.aiFeedback === '请联系老师') return 'red';
  if (sub?.status === 'published') return 'green';
  if (sub?.status === 'reviewed') return 'blue';
  if (sub?.status === 'ai_graded') return 'green';
  return 'default';
}
/** T4-F2 类别收口：提交状态徽标里 green（已发布 / AI 已评分）亮 3.37:1 不达 AA → tag-success；
    red 亮 5.07 / 暗 4.54、blue 亮 5.50 / 暗 4.91 达标，保持预置色。 */
function subStatusTagClass(sub) { return subStatusColor(sub) === 'green' ? 'tag-success' : null; }

function subStatusText(sub) {
  if (sub?.aiFeedback === '请联系老师') return '评分异常';
  if (sub?.status === 'published') return '已发布';
  if (sub?.status === 'reviewed') return '已审核';
  if (sub?.status === 'ai_graded') return 'AI已评分';
  if (sub?.status === 'submitted') return '待评分';
  return sub?.status || '';
}

export { itemTypeLabel, itemTypeColor, itemTypeTagClass, getItemKey, safeSqContent, isCodeStem,
  subStatusColor, subStatusTagClass, subStatusText };
