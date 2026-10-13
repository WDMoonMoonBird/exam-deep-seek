/**
 * useReviewAiPrompt.js —— 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 B3，源行 492-513）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动（导出集中在文末）。
 * ★R3-D9（t17 / F-C4-2）：本页**不再有「模式」真值源**（isPracticeMode 已删除）——
 *      控件显隐与行为差异一律由三开关与提交状态表达，不看 assignment.mode。
 * AI 提示词查看：4 个 ref + 1 个 async 请求；promptSubTitle 的拼接含全角括号，逐字保留。
 */
import { errorCopyOf } from '../errorCopy.js';   // ★R2-B55：UI 文案统一出口（固定友好 + 原始错误只进 console）
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';

export function useReviewAiPrompt({ getSub }) {

// ===================== AI 提示词查看 =====================
const promptModalOpen = ref(false);
const promptLoading = ref(false);
const promptData = ref(null);
const promptSubTitle = ref('');

async function showPrompt(sq) {
  const sub = getSub(sq.id);
  if (!sub) return;
  promptSubTitle.value = (sq.title || '') + '（' + sub.id + '）';
  promptModalOpen.value = true;
  promptLoading.value = true;
  promptData.value = null;
  try {
    const r = await request.get('/teacher/submissions/' + sub.id + '/prompt');
    promptData.value = r.data;
  } catch (e) {
    message.error(errorCopyOf(e, { tag: 'useReviewAiPrompt.js 获取提示词', action: '获取提示词' }));
  } finally {
    promptLoading.value = false;
  }
}

  return { promptModalOpen, promptLoading, promptData, promptSubTitle, showPrompt };
}

export default useReviewAiPrompt;
