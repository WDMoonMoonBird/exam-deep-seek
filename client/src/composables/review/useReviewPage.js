/**
 * useReviewPage.js —— 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 B4，源行 248-257 / 615-627（2 个 hook 回调体））。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动（导出集中在文末）。
 * 注意：本页有四条形态轴（practice/exam × code/objective × narrow × 数据状态族）；
 *      模式真值源唯一（U2 的 data/isPracticeMode），本文件不得自行创建第二份。
 * 接线根（.vue 的唯一 import 入口）：U1..U6 在 setup 同步阶段各调用一次，跨单元以参数注入。
 * route/confirm 只在本文件创建一次并向下注入（不得让 U5/U6 各自 useRoute()/useConfirm()）；
 * 不得新增 useRouter()（模板 :5 的 $router 是全局属性）；两个 hook 的注册语句仍只在 .vue。
 * 调用序即副作用序：U2(fetch 的所有者) → U3 → U4 → U5 → U6；onMounted 内 fetch() 必须先于 matchMedia。
 */
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useConfirm } from '../useConfirm.js';
import { itemTypeLabel, itemTypeColor, itemTypeTagClass, getItemKey, safeSqContent, isCodeStem, subStatusColor, subStatusTagClass, subStatusText } from './reviewPure.js';
import { useReviewData } from './useReviewData.js';
import { useReviewNav } from './useReviewNav.js';
import { useObjectiveCompare } from './useObjectiveCompare.js';
import { useReviewAiPrompt } from './useReviewAiPrompt.js';
import { useReviewActions } from './useReviewActions.js';

export function useReviewPage() {

const route = useRoute();
const { confirm } = useConfirm();

/** Workbench 壳：<1200px 时右栏评分面板抽屉化（纯布局，不改任何交互与请求） */
const narrow = ref(false);
const panelOpen = ref(false);
/** 右栏评分面板折叠（≥1200px 生效；宽度方向过渡，终值 384 → 44） */
const collapsed = ref(false);
let shellMq = null;
function onShellMq(e) { narrow.value = e.matches; if (!e.matches) panelOpen.value = false; }

// 数据基座（U2）：模式真值源唯一；导航（U3）依赖 q/getSub；客观题（U4）依赖 subQuestions/getSub；
// AI 提示词（U5）依赖 getSub；审核动作（U6）依赖 6 个数据位 + confirm。
const {
  pageStatus, data, studentName, studentNo, schoolName, q, subQuestions, showMaterial,
  subMap, reviewScores, reviewFeedbacks, regrading, reviewingAll, publishingAll,
  materialText, safeMaterial, totalAiScore, isPracticeMode, displayStudentNo, getSub, fetch,
} = useReviewData({ route });
const {
  contentRef, activeAnchor, collapsedSqs, toggleCollapse, getNavLabel,
  sqResultColor, sqBoxClass, scrollTo, activateAnchor,
} = useReviewNav({ q, getSub });
const {
  parsedAnswers, getStudentItem, isItemAnswered, isItemCorrect,
  getItemStudentStr, getItemRefStr, itemResultColor,
} = useObjectiveCompare({ subQuestions, getSub });
const { promptModalOpen, promptLoading, promptData, promptSubTitle, showPrompt } = useReviewAiPrompt({ getSub });
const {
  editorRefs, setEditorRef, formatCode, useAiFeedback, regrade, reviewAll, publishAll,
} = useReviewActions({ subMap, reviewScores, reviewFeedbacks, regrading, reviewingAll, publishingAll, confirm });

// 两个 hook 的回调体平移到本文件（内层语句逐字）；注册语句仍只在 .vue，各恰好一次，不得改类型/不得加条件。
function onPageMounted() {
  fetch();
  shellMq = window.matchMedia('(max-width: 1199px)');
  narrow.value = shellMq.matches;
  if (shellMq.addEventListener) shellMq.addEventListener('change', onShellMq);
  else shellMq.addListener(onShellMq);
}
function onPageUnmounted() {
  if (!shellMq) return;
  if (shellMq.removeEventListener) shellMq.removeEventListener('change', onShellMq);
  else shellMq.removeListener(onShellMq);
}

  return {
    route, confirm, narrow, panelOpen, collapsed,
    pageStatus, data, studentName, studentNo, schoolName, q, subQuestions, showMaterial,
    subMap, reviewScores, reviewFeedbacks, regrading, reviewingAll, publishingAll,
    materialText, safeMaterial, totalAiScore, isPracticeMode, displayStudentNo, getSub, fetch,
    contentRef, activeAnchor, collapsedSqs, toggleCollapse, getNavLabel, sqResultColor, sqBoxClass, scrollTo, activateAnchor,
    parsedAnswers, getStudentItem, isItemAnswered, isItemCorrect, getItemStudentStr, getItemRefStr, itemResultColor,
    promptModalOpen, promptLoading, promptData, promptSubTitle, showPrompt,
    editorRefs, setEditorRef, formatCode, useAiFeedback, regrade, reviewAll, publishAll,
    itemTypeLabel, itemTypeColor, itemTypeTagClass, getItemKey, safeSqContent, isCodeStem,
    subStatusColor, subStatusTagClass, subStatusText,
    onPageMounted, onPageUnmounted,
  };
}

export default useReviewPage;
