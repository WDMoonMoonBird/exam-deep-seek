/**
 * useProjectReviewGrading.js —— 由 client/src/views/teacher/ProjectReviewNew.vue 拆分而来（R2-B64 / t4）
 * 职责：评分面板动作 —— 人工评分提交（onApprove）、AI 提示词查看（showPrompt）、重新评分（onRegrade）、
 *       引用 AI 评语（quoteAiComment）。
 * 源：:492-564（quoteAiComment / onApprove / promptModal* / showPrompt / onRegrade）。
 * 行为不变：接口路径与请求体（saveProjectReview / POST …/project/prompt / regradeProjectSubmission）、
 *          成功/失败文案、errorCopyOf 口径、按钮 loading 复位时机、防连点逻辑逐字保持。
 *          状态（submission/aiResult/finalScore/teacherFeedback/regrading/gradingState）由 useProjectReviewPage 注入共享。
 */
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { saveProjectReview, regradeProjectSubmission } from '../../api/projects.js';
import request from '../../api/request.js';
import { errorCopyOf } from '../errorCopy.js';

export function useProjectReviewGrading({ submissionId, submission, aiResult, finalScore, teacherFeedback, regrading, gradingState, startPolling }) {
  const saving = ref(false);
  // ===== AI 提示词查看（该次评分的实际提示词，含学生源码） =====
  const promptModalOpen = ref(false);
  const promptLoading = ref(false);
  const promptData = ref(null);

  /** 一键引用 AI 评语到教师评语框（可删改后再审核） */
  function quoteAiComment() {
    const text = aiResult.value?.overallComment;
    if (!text) return;
    teacherFeedback.value = teacherFeedback.value
      ? teacherFeedback.value + '\n\n【AI 评语】' + text
      : text;
    message.success('已引用 AI 评语，可编辑后审核');
  }

  /** 审核通过（R4：放分唯一开关，状态 reviewed 后学生端才可见分数） */
  async function onApprove() {
    if (finalScore.value == null) {
      message.warning('请填写最终分数');
      return;
    }
    saving.value = true;
    try {
      await saveProjectReview(submissionId.value, {
        finalScore: finalScore.value,
        teacherFeedback: teacherFeedback.value,
      });
      submission.value = {
        ...submission.value,
        status: 'reviewed',
        finalScore: finalScore.value,
        teacherFeedback: teacherFeedback.value,
      };
      message.success('审核通过，学生已可见成绩');
    } catch (e) {
      message.error(errorCopyOf(e, { tag: 'ProjectReviewNew.vue 保存人工评分', action: '保存' }));
    } finally {
      saving.value = false;
    }
  }

  async function showPrompt() {
    promptModalOpen.value = true;
    promptLoading.value = true;
    promptData.value = null;
    try {
      const r = await request.get('/teacher/submissions/' + submissionId.value + '/project/prompt');
      promptData.value = r.data;
    } catch (e) {
      message.error(errorCopyOf(e, { tag: 'ProjectReviewNew.vue 获取提示词', action: '获取提示词' }));
    } finally {
      promptLoading.value = false;
    }
  }

  /** 重新评分（与编程题对齐）：任意状态可触发；
   * 请求期间（含后台评分期间）按钮保持 loading 防连点，评分完成后恢复，可无限次点击 */
  async function onRegrade() {
    if (regrading.value) return; // 防连点
    regrading.value = true;
    try {
      await regradeProjectSubmission(submissionId.value);
      gradingState.value = 'pending';
      message.success('已重新触发评分，完成后自动刷新');
      startPolling();
    } catch (e) {
      regrading.value = false; // 接口失败立即恢复
      message.error(errorCopyOf(e, { tag: 'ProjectReviewNew.vue 重新评分', action: '重评' }));
    }
    // 成功时保持 loading，直到轮询到评分完成/失败/超时才恢复
  }

  return { saving, promptModalOpen, promptLoading, promptData, quoteAiComment, onApprove, showPrompt, onRegrade };
}
