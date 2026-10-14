/**
 * useLoadQuestion.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B4，源行 681-739）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { nextTick } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { useSafeRequest } from '../useSafeRequest.js';
import { safeInitMonaco } from '../monacoGuard.js';   // ★W1-r2（t4）：Monaco 初始化失败就地兜底   // ★W1（t1）：题目编辑链路的取数改走 safeLoad（失败就地提示、不冒泡）
import { findFirstFile } from './zipEntry.js';

export function useLoadQuestion({ form, isTeacher, route, externalTree, fileContents, hasUploaded, studentSubmission, assignmentId, questionId, editorContainerRef, resetModels, initMonaco, openFile, ensureCheckerState }) {
const { safeLoad } = useSafeRequest({ tag: 'project/useLoadQuestion.js' });

// ===== 加载已有题目 =====

async function loadQuestion() {
  try {
    // 教师：编辑/查看实训题
    if (isTeacher.value) {
      // ★W1（t1）：404 + code 1004（非本人 / 不存在的题）在此已是"就地提示 + 返回"，不再让失败冒泡
      const r = await safeLoad(() => request.get(`/teacher/questions/${route.params.id}`), { action: '加载题目' });
      if (r.error) return;
      const q = r.data;
      form.title = q.title || '';
      form.difficulty = q.difficulty || 'medium';
      form.maxScore = q.maxScore || 100;
      form.description = q.material || '';
      form.scoringRubric = q.scoringRubric || '';

      if (q.attachmentUrl) {
        // ★W1（t1）：文件树是附属信息 —— 失败只提示，不影响题目主数据已渲染的内容
        const treeRes = await safeLoad(() => request.get(`/teacher/questions/${route.params.id}/project-files`), { action: '加载标准工程包文件树' });
        if (!treeRes.error && treeRes.data?.tree?.length) {
          externalTree.value = treeRes.data.tree;
          if (treeRes.data?.contents) Object.entries(treeRes.data.contents).forEach(([p, c]) => fileContents.set(p, c));
          hasUploaded.value = true;
          await nextTick(); await new Promise(res => setTimeout(res, 300));
          // ★W1-r2（t4）：编辑器挂了 ≠ 题目加载失败 —— 只提示一次 + 骨架降级
          if (editorContainerRef.value) await safeInitMonaco(initMonaco, { tag: 'project/useLoadQuestion.js 教师' });
          const first = findFirstFile(treeRes.data.tree);
          if (first) openFile(first.path, first.name, first.language);
        }
      }
      // 评分器状态持久化在后端：页面加载即拉取（重进页面无需重新生成）
      await ensureCheckerState();
      return;
    }

    // 学生：GET /student/assignments/:assignmentId/project/:questionId
    // ★W1（t1）：同上 —— 实训题不存在/未布置也只就地提示，页面保持可用
    const r = await safeLoad(() => request.get(`/student/assignments/${assignmentId.value}/project/${questionId.value}`), { action: '加载实训题' });
    if (r.error) return;
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
        // ★W1-r2（t4）：同上（学生侧）
        if (editorContainerRef.value) await safeInitMonaco(initMonaco, { tag: 'project/useLoadQuestion.js 学生' });
        const first = findFirstFile(q.files.tree);
        if (first) openFile(first.path, first.name, first.language);
      }
    }
  } catch {
    message.error('加载失败');
  }
}

  return { loadQuestion };
}

export default useLoadQuestion;
