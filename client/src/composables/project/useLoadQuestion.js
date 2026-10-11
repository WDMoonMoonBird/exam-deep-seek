/**
 * useLoadQuestion.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B4，源行 681-739）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { nextTick } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { findFirstFile } from './zipEntry.js';

export function useLoadQuestion({ form, isTeacher, route, externalTree, fileContents, hasUploaded, studentSubmission, assignmentId, questionId, editorContainerRef, resetModels, initMonaco, openFile, ensureCheckerState }) {

// ===== 加载已有题目 =====

async function loadQuestion() {
  try {
    // 教师：编辑/查看实训题
    if (isTeacher.value) {
      const r = await request.get(`/teacher/questions/${route.params.id}`);
      const q = r.data;
      form.title = q.title || '';
      form.difficulty = q.difficulty || 'medium';
      form.maxScore = q.maxScore || 100;
      form.description = q.material || '';
      form.scoringRubric = q.scoringRubric || '';

      if (q.attachmentUrl) {
        const treeRes = await request.get(`/teacher/questions/${route.params.id}/project-files`);
        if (treeRes.data?.tree?.length) {
          externalTree.value = treeRes.data.tree;
          if (treeRes.data?.contents) Object.entries(treeRes.data.contents).forEach(([p, c]) => fileContents.set(p, c));
          hasUploaded.value = true;
          await nextTick(); await new Promise(res => setTimeout(res, 300));
          if (editorContainerRef.value) await initMonaco();
          const first = findFirstFile(treeRes.data.tree);
          if (first) openFile(first.path, first.name, first.language);
        }
      }
      // 评分器状态持久化在后端：页面加载即拉取（重进页面无需重新生成）
      await ensureCheckerState();
      return;
    }

    // 学生：GET /student/assignments/:assignmentId/project/:questionId
    const r = await request.get(`/student/assignments/${assignmentId.value}/project/${questionId.value}`);
    const q = r.data;
    const question = q.question || {};
    form.title = question.title || '';
    form.difficulty = question.difficulty || 'medium';
    form.maxScore = question.maxScore || 100;
    form.description = question.material || '';
    form.scoringRubric = question.scoringRubric || '';

    fileContents.clear();
    const sub = q.submission;
    if (sub) {
      studentSubmission.value = sub;
      if (q.files?.tree?.length) {
        externalTree.value = q.files.tree;
        if (q.files.contents) Object.entries(q.files.contents).forEach(([p, c]) => fileContents.set(p, c));
        hasUploaded.value = true;
        await nextTick(); await new Promise(res => setTimeout(res, 300));
        if (editorContainerRef.value) await initMonaco();
        const first = findFirstFile(q.files.tree);
        if (first) openFile(first.path, first.name, first.language);
      }
    }
  } catch (e) {
    message.error('加载失败');
  }
}

  return { loadQuestion };
}

export default useLoadQuestion;
