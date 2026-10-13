/**
 * useReviewActions.js —— 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 B4，源行 515-593）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动（导出集中在文末）。
 * ★R3-D9（t17 / F-C4-2）：本页**不再有「模式」真值源**（isPracticeMode 已删除）——
 *      控件显隐与行为差异一律由三开关与提交状态表达，不看 assignment.mode。
 * 审核动作 + 编辑器实例持有：editorRefs 是全文件唯一的非响应式外部实例容器，
 * 必须单实例（复制成两份 ⇒ formatCode 因 ed?.format 的可选链而静默 no-op，L0/L1/build 三类判据全盲）。
 * 既有行为照旧：setEditorRef 的 if (el) 守卫让条目永不删除（方案 §7.3-K4，不得加 delete）。
 */
import { message } from 'ant-design-vue';
import request from '../../api/request.js';

export function useReviewActions({ subMap, reviewScores, reviewFeedbacks, regrading, reviewingAll, publishingAll, confirm }) {

// ===================== 审核操作 =====================
// 格式化代码
const editorRefs = {};
function setEditorRef(sqId, el) {
  if (el) editorRefs[sqId] = el;
}
function formatCode(sqId) {
  const ed = editorRefs[sqId];
  if (ed?.format) ed.format();
}

function useAiFeedback(sqId) {
  const sub = subMap.value[sqId];
  if (!sub?.aiFeedback) return message.warn('暂无 AI 评语');
  reviewFeedbacks[sqId] = sub.aiFeedback;
}

async function regrade(sq) {
  const sub = subMap.value[sq.id];
  if (!sub) return;
  regrading[sq.id] = true;
  try {
    const r = await request.post(`/teacher/submissions/${sub.id}/regrade`);
    sub.aiScore = r.data.aiScore;
    sub.aiFeedback = r.data.aiFeedback;
    sub.status = 'ai_graded';
    reviewScores[sq.id] = r.data.aiScore;
    message.success('重新评分完成');
  } catch { message.error('重新评分失败'); }
  finally { regrading[sq.id] = false; }
}

async function reviewAll() {
  const subs = Object.values(subMap.value);
  if (!subs.length) return message.warn('无提交记录');

  reviewingAll.value = true;
  try {
    const tasks = subs.map(s => {
      const key = s.subQuestionId || s.questionId;
      return request.put(`/teacher/submissions/${s.id}/review`, {
        finalScore: reviewScores[key],
        teacherFeedback: reviewFeedbacks[key] || s.aiFeedback || '',
      }).then(() => {
        s.status = 'reviewed';
        s.finalScore = reviewScores[key];
        return true;
      });
    });
    const results = await Promise.allSettled(tasks);
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const fail = results.filter(r => r.status === 'rejected').length;
    if (fail === 0) message.success(`全部 ${ok} 题审核已保存`);
    else message.warning(`${ok} 题成功，${fail} 题失败`);
  } finally { reviewingAll.value = false; }
}

function publishAll() {
  const subs = Object.values(subMap.value);
  if (!subs.length) return message.warn('无提交记录');

  confirm({
    title: '确认发布成绩？',
    content: '发布后学生将能看到分数和评语。发布后仍可修改分数，修改后重新发布即可。',
    okText: '发布成绩',
    cancelText: '取消',
    danger: true,
    onOk: async () => {
      const ids = subs.map(s => s.id);
      publishingAll.value = true;
      try {
        await request.put('/teacher/submissions/publish', { submissionIds: ids });
        subs.forEach(s => { s.status = 'published'; });
        message.success('全部已发布');
      } catch { message.error('发布失败'); }
      finally { publishingAll.value = false; }
    },
  });
}

  return {
    editorRefs, setEditorRef, formatCode, useAiFeedback, regrade, reviewAll, publishAll,
  };
}

export default useReviewActions;
