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
import { resolveScoreToSave, scoreIssue } from './projectReviewPure.js';

export function useProjectReviewGrading({ submissionId, submission, aiResult, finalScore, teacherFeedback, regrading, gradingState, startPolling, maxScore }) {
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

  /**
   * 审核通过 / 保存评分（US-A1 / US-A2 / G1 / G2 / G4）：
   *   - 只改评语不改分：清空分值输入 ⇒ 回落该提交已保存的最终分（分值不变），评语照常保存；
   *   - 非法分值前端拦截（数字/整数/0≤分≤满分），给出可读文案，不发请求（不会出现后端 NaN→500）；
   *   - 已发布提交不再锁死：保存后学生端立即生效（后端 G3 由 D5/t12 对齐状态语义）。
   */
  async function onApprove() {
    const resolved = resolveScoreToSave({ input: finalScore.value, saved: submission.value.finalScore });
    const issue = scoreIssue({ score: resolved.score, maxScore: maxScore ? maxScore.value : undefined });
    if (issue) {
      message.warning(issue);
      return;
    }
    saving.value = true;
    try {
      await saveProjectReview(submissionId.value, {
        finalScore: resolved.score,
        teacherFeedback: teacherFeedback.value,
      });
      finalScore.value = resolved.score;                 // 只改评语时，输入框回填为已保存的分值
      const prevStatus = submission.value.status;
      submission.value = {
        ...submission.value,
        // 已发布的提交改分后仍保持 published（US-A2 AC2：学生端无需重新发布即可见）
        status: prevStatus === 'published' ? 'published' : 'reviewed',
        finalScore: resolved.score,
        teacherFeedback: teacherFeedback.value,
      };
      message.success(resolved.source === 'saved' ? '评语已保存（分数保持不变）' : '审核通过，学生已可见成绩');
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
