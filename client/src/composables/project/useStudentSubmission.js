/**
 * useStudentSubmission.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B3，源行 379 / 381-408 / 643-679）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { errorCopyOf } from '../errorCopy.js';   // ★R2-B55：UI 文案统一出口（固定友好 + 原始错误只进 console）
import { ref, computed, nextTick } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { formatDateTimeSec } from '../../domain/format.js';
import { findFirstFile } from './zipEntry.js';

export function useStudentSubmission({ route, form, submitting, editorContainerRef, resetModels, initMonaco, openFile, externalTree, fileContents, hasUploaded, uploadKeptCount, uploadKeptBytes }) {

const studentSubmission = ref(null);

// 学生端提交的版本/状态信息（来自 toStudentView，已脱敏）
const assignmentId = computed(() => route.params.assignmentId);
const questionId = computed(() => route.params.questionId);

// R4：成绩放行的唯一开关，仅 reviewed / published 才显示分数
const canStudentSeeScoreNow = computed(() => {
  const s = studentSubmission.value?.status;
  return s === 'reviewed' || s === 'published';
});
const studentStatusText = computed(() => {
  const s = studentSubmission.value?.status;
  if (s === 'reviewed') return '已批改';
  if (s === 'published') return '已出分';
  if (s === 'submitted') return '已提交，待评分';
  if (s === 'draft') return '草稿';
  return '未提交';
});
const studentStatusType = computed(() => {
  const s = studentSubmission.value?.status;
  if (s === 'reviewed' || s === 'published') return 'success';
  if (s === 'submitted') return 'info';
  return 'default';
});

/** 成绩卡片：提交时间（需秒级精度 → 复用 domain 的带秒变体） */
function formatSubmitTime(t) {
  return formatDateTimeSec(t);
}

// ===== 学生：提交答案 =====

async function handleSubmit() {
  if (!form.packageFile) return message.warn('请先上传项目文件');
  submitting.value = true;
  try {
    const formData = new FormData();
    // 上传前端过滤重打包后的纯代码 zip（依赖已在选择文件时剔除）
    formData.append('file', form.packageFile.blob, form.packageFile.name);

    // 学生端提交（T02）：写库 + 版本化 + 同步返回文件树，不触发 AI 评分（T03 负责）
    const r = await request.post(
      `/student/assignments/${assignmentId.value}/project/${questionId.value}/submit`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    const data = r.data;
    studentSubmission.value = data.submission;
    if (data.files?.tree) {
      // 新版本文件内容填充前先释放旧 model 缓存，避免展示旧内容
      resetModels();
      externalTree.value = data.files.tree;
      fileContents.clear();
      if (data.files.contents) Object.entries(data.files.contents).forEach(([p, c]) => fileContents.set(p, c));
      hasUploaded.value = true;
      await nextTick(); await new Promise(res => setTimeout(res, 300));
      if (editorContainerRef.value) await initMonaco();
      const first = findFirstFile(data.files.tree);
      if (first) openFile(first.path, first.name, first.language);
    }
    message.success(`提交成功（已过滤依赖），保留 ${uploadKeptCount.value} 个代码文件 ${(uploadKeptBytes.value / 1024).toFixed(0)}KB，已生成第 ${data.version ?? '新'} 个版本`);
    submitting.value = false;
  } catch (e) {
    message.error(errorCopyOf(e, { tag: 'useStudentSubmission.js 提交', action: '提交' }));
    submitting.value = false;
  }
}

  return {
    studentSubmission, assignmentId, questionId,
    canStudentSeeScoreNow, studentStatusText, studentStatusType, formatSubmitTime, handleSubmit,
  };
}

export default useStudentSubmission;
