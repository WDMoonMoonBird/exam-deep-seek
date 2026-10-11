/**
 * useProjectQuestionPage.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B4，源行 216-222 / 227 / 741-753）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useEditorWorkspace } from './useEditorWorkspace.js';
import { useQuestionForm } from './useQuestionForm.js';
import { useChecker } from './useChecker.js';
import { useZipUpload } from './useZipUpload.js';
import { useStudentSubmission } from './useStudentSubmission.js';
import { useSaveQuestion } from './useSaveQuestion.js';
import { useLoadQuestion } from './useLoadQuestion.js';

/**
 * 接线根：.vue 只调用本函数一次；跨 composable 的共享状态一律以参数注入（三处真环见 plan §2.3），
 * 本目录 9 个文件之间除 W9 → W1..W8 外没有任何 import 边。
 * ★ W2(useEditorWorkspace) 必须是第一个被调用的：useMonacoKeyboardA11y() 自带 onBeforeUnmount 注册，
 *   须保持源文件 :231 早于 :748 的相对顺序；该 composable 的 attach 只登记实例、不在 await 后注册 hook。
 * ★ 本文件不注册任何生命周期 hook：onMounted/onBeforeUnmount 只在 .vue 各注册一次。
 */
export function useProjectQuestionPage(props) {
const isTeacher = computed(() => props.mode === 'teacher');
const isStudent = computed(() => props.mode === 'student');

const router = useRouter();
const route = useRoute();
const isEdit = computed(() => !!route.params.id);
const submitting = ref(false);

const editorContainerRef = ref(null);

  const editorWs = useEditorWorkspace({ editorContainerRef });
  const {
    activePath, fileContents, externalTree, openTabs, fading,
    resetModels, initMonaco, openFile, switchTab, closeTab,
    disposeKeyboardA11y, disposeModels, disposeEditor,
  } = editorWs;

  const {
    form, difficultyTagClass, safeDescriptionHtml,
    showDescModal, showRubricModal, descDraft, rubricDraft,
    openDescModal, openRubricModal, confirmDesc, confirmRubric,
  } = useQuestionForm();

  const checker = useChecker({ route });
  const {
    FEATURE_CHECKER_ENTRY, checkerOpen, checkerStatus, checkerCanClose, checkerStale,
    onCheckerStatusChange, openCheckerModal, stopCheckerPoll, ensureCheckerState,
    isLoaded: isCheckerLoaded, status: getCheckerStatus,
    promptModalOpen, promptLoading, promptPreview, promptUserPartLabel, showPromptPreview,
  } = checker;

  const {
    hasUploaded, uploadKeptCount, uploadKeptBytes, onZipReady, onZipSelect,
  } = useZipUpload({ form, isTeacher, externalTree, fileContents, editorContainerRef, resetModels, initMonaco, openFile, isCheckerLoaded, getCheckerStatus, checkerStale });

  const {
    studentSubmission, assignmentId, questionId,
    canStudentSeeScoreNow, studentStatusText, studentStatusType, formatSubmitTime, handleSubmit,
  } = useStudentSubmission({ route, form, submitting, editorContainerRef, resetModels, initMonaco, openFile, externalTree, fileContents, hasUploaded, uploadKeptCount, uploadKeptBytes });

  const { handleSave } = useSaveQuestion({ form, isEdit, route, router, checker });
  const { loadQuestion } = useLoadQuestion({ form, isTeacher, route, externalTree, fileContents, hasUploaded, studentSubmission, assignmentId, questionId, editorContainerRef, resetModels, initMonaco, openFile, ensureCheckerState });

/** 原 onMounted@741-746 的回调体：逐字平移（仅 :745 的 loadQuestion 取自上面的解构） */
function onPageMounted() {
  const hasQuestion = isTeacher.value
    ? !!route.params.id
    : !!(route.params.assignmentId && route.params.questionId);
  if (hasQuestion) loadQuestion();
}

/** 原 onBeforeUnmount@748-753 的回调体：4 步顺序 :749→:750→:751→:752 逐字保持，不合并、不换序、不置空 */
function disposePage() {
  disposeKeyboardA11y();
  stopCheckerPoll();
  disposeModels();
  disposeEditor();
}

  return {
    isTeacher, isStudent, isEdit, submitting, editorContainerRef, route,
    activePath, externalTree, openTabs, fading, switchTab, closeTab,
    form, difficultyTagClass, safeDescriptionHtml, showDescModal, showRubricModal,
    descDraft, rubricDraft, openDescModal, openRubricModal, confirmDesc, confirmRubric,
    FEATURE_CHECKER_ENTRY, checkerOpen, checkerStatus, checkerCanClose,
    onCheckerStatusChange, openCheckerModal, ensureCheckerState, stopCheckerPoll,
    promptModalOpen, promptLoading, promptPreview, promptUserPartLabel, showPromptPreview,
    hasUploaded, uploadKeptCount, uploadKeptBytes, onZipReady, onZipSelect,
    studentSubmission, canStudentSeeScoreNow, studentStatusText, studentStatusType,
    formatSubmitTime, handleSubmit, handleSave,
    onPageMounted, disposePage,
  };
}

export default useProjectQuestionPage;
