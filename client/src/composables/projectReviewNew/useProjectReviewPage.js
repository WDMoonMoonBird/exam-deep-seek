/**
 * useProjectReviewPage.js —— 由 client/src/views/teacher/ProjectReviewNew.vue 拆分而来（R2-B64 / t4）
 * 接线根：数据状态 + 取数（fetchData）+ 重评轮询（startPolling/stopPolling）+ 数据落位（applyReviewData），
 * 并创建 useMonacoWorkspace（双数据源对象由本文件创建后注入 ⇒ 全程同一 reactive 实例）。
 * 源：:251-304（路由参数/详情状态/派生量）、:566-657（轮询与取数）、:659-660 与 :672（生命周期）。
 * 行为不变：接口路径、返回体取用、loading 复位、错误文案（errorCopyOf）与路由重入处理逐字保持。
 */
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { getProjectReview } from '../../api/projects.js';
import { errorCopyOf } from '../errorCopy.js';
import { useMonacoWorkspace } from './useMonacoWorkspace.js';
import { STATUS_TONE, statusColorOf, statusTextOf, displayNoOf, findFirstFile } from './projectReviewPure.js';

export function useProjectReviewPage() {
  const route = useRoute();
  /** ★R2-B47：路由参数在**请求时**读取（computed ⇒ 重入/换 id 不会再用旧值；防呆 ⑥c） */
  const submissionId = computed(() => +route.params.submissionId);
  const loadingDetail = ref(false);
  const loadError = ref('');

  const loaded = ref(false);
  const submission = ref({});
  const question = ref({});
  const student = ref({});
  const version = ref(0);
  const aiResult = ref(null);
  const aiScore = computed(() => submission.value.aiScore ?? null);
  const maxScore = ref(100);
  const gradingState = ref('none');
  const gradingError = ref('');
  const finalScore = ref(null);
  const teacherFeedback = ref('');

  const status = computed(() => submission.value.status || '');
  const locked = computed(() => status.value === 'published');
  /** a-tag 配色 → StatusTag tone（与 statusColor 一一对应，状态判断未改） */
  const statusTone = computed(() => STATUS_TONE[statusColorOf(status.value)] || 'neutral');
  const statusText = computed(() => statusTextOf(status.value));
  const displayNo = computed(() => displayNoOf(student.value));

  // saving 定义在 useProjectReviewGrading（人工评分提交中），模板绑的那一个来自它
  const regrading = ref(false);       // 重评请求中（轮询完成/超时后复位）
  const standardFiles = reactive({ tree: [], contents: {} });
  const studentFiles = reactive({ tree: [], contents: {} });
  /** 有无标准答案包（tree 与 contents 均空 = 开放性题目）：无包不渲染「标准答案包」tab，不改变有包时的三栏布局 */
  const hasStandardFiles = computed(() => (standardFiles.tree?.length || 0) > 0
    || Object.keys(standardFiles.contents || {}).length > 0);

  const {
    activeTree, editorContainerRef, fileTreeData, openTabs, activePath, defaultExpandedKeys, fading,
    initMonaco, openFile, switchTab, closeTab, onTreeSelect, onTreeDblclick, applySource,
  } = useMonacoWorkspace({ standardFiles, studentFiles });

  // ===== 重评轮询：评分完成后自动刷新，无需手动刷新 =====

  let pollTimer = null;
  let pollCount = 0;
  const POLL_INTERVAL = 5000; // 5s
  const POLL_MAX = 72;        // 最长 6 分钟

  function startPolling() {
    stopPolling();
    pollCount = 0;
    pollTimer = setInterval(async () => {
      pollCount += 1;
      if (pollCount > POLL_MAX) {
        stopPolling();
        regrading.value = false; // 超时恢复按钮
        message.warning('重新评分等待超时，请手动刷新查看');
        return;
      }
      try {
        const r = await getProjectReview(submissionId.value);
        const gs = r.data.submission?.grading?.state || 'none';
        if (gs !== 'pending') {
          stopPolling();
          applyReviewData(r.data);
          regrading.value = false; // 评分完成，恢复按钮（可再次点击）
          if (gs === 'failed') {
            message.error('重新评分失败：' + (r.data.submission?.grading?.error || '未知错误'));
          } else {
            message.success('重新评分完成');
          }
        }
      } catch { /* 单次轮询失败忽略，下轮继续 */ }
    }, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /** 应用审核数据（fetchData 与重评轮询共用；不重建 Monaco） */
  function applyReviewData(d) {
    submission.value = d.submission || {};
    question.value = d.question || {};
    student.value = d.student || {};
    version.value = d.version || 0;
    maxScore.value = d.question?.maxScore ?? 100;
    aiResult.value = d.aiResult || null;
    gradingState.value = d.submission?.grading?.state || 'none';
    gradingError.value = d.submission?.grading?.error || '';
    finalScore.value = d.submission?.finalScore ?? d.submission?.aiScore ?? null;
    teacherFeedback.value = d.submission?.teacherFeedback || '';
    standardFiles.tree = d.standardFiles?.tree || [];
    standardFiles.contents = d.standardFiles?.contents || {};
    // 无标准包（开放性题目）：不逗留在已隐藏的「标准答案包」数据源，回落到学生提交
    if (!hasStandardFiles.value && activeTree.value === 'standard') activeTree.value = 'student';
    studentFiles.tree = d.studentFiles?.tree || [];
    studentFiles.contents = d.studentFiles?.contents || {};
    loaded.value = true;
  }

  /** ★R2-B47（U-1）：路由参数变化（同组件复用/换提交）⇒ 重建数据 */
  watch(() => route.params.submissionId, () => { loaded.value = false; fetchData(); });

  async function fetchData() {
    loadingDetail.value = true;
    loadError.value = '';
    try {
      const r = await getProjectReview(submissionId.value);
      applyReviewData(r.data);

      // 默认数据源 = 学生提交（activeTree 初值 'student'）
      applySource(activeTree.value);

      // 等 DOM 就绪再挂 Monaco
      await nextTick();
      await new Promise(res => setTimeout(res, 300));
      if (editorContainerRef.value) await initMonaco();

      // 第一眼看到学生答案：自动打开第一个文件
      const first = findFirstFile(studentFiles.tree);
      if (first) openFile(first.path, first.name);
    } catch (e) {
      // ★R2-B47（U-1）：错态可读 + 重试入口（不再只有一条 message 后停在空白）
      loadError.value = errorCopyOf(e, { tag: 'ProjectReviewNew.vue 加载复审数据', action: '加载' });
      message.error('加载失败：' + loadError.value);
    } finally {
      loadingDetail.value = false;     // ★任何路径必复位 loading（防呆 ⑥a）
    }
  }

  // 源 :659-660（原与 shellMq 同处一个 onMounted；shellMq 已迁入 useReviewLayout，二者互不依赖）
  onMounted(() => { fetchData(); });
  // 源 :672
  onBeforeUnmount(() => { stopPolling(); });

  return {
    submissionId, submission, question, student, version, aiResult, aiScore, maxScore,
    status, statusTone, statusText, displayNo, locked, loaded, loadError, loadingDetail,
    gradingState, gradingError, finalScore, teacherFeedback, regrading,
    standardFiles, studentFiles, hasStandardFiles, fetchData, startPolling, stopPolling,
    activeTree, editorContainerRef, fileTreeData, openTabs, activePath, defaultExpandedKeys, fading,
    initMonaco, openFile, switchTab, closeTab, onTreeSelect, onTreeDblclick, applySource,
  };
}
