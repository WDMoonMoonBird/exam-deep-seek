/**
 * useQuestionEditPage.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B5，源行 333-337 / 449-450）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * 接线根：.vue 只调用本函数一次；12 个文件之间除本文件 → U1..U11 外没有任何 import 边。
 * router/route/confirm 各只在本文件创建一次，向下注入（不得让 U7/U10 各自 useConfirm()）。
 * ★ 调用序即 5 个 watch 的注册序（357<367<482<699<701），不得交换。
 */
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useConfirm } from '../useConfirm.js';
import { langs, isCodeStem, itemTypeLabel, itemTypeColor, itemTypeTagClass } from './questionPure.js';
import { useQuestionForm } from './useQuestionForm.js';
import { useQuestionSettings } from './useQuestionSettings.js';
import { useSubQuestionList } from './useSubQuestionList.js';
import { useObjectiveItems } from './useObjectiveItems.js';
import { useDraftSync } from './useDraftSync.js';
import { useAiReference } from './useAiReference.js';
import { useExamImport } from './useExamImport.js';
import { usePromptPreview } from './usePromptPreview.js';
import { useSaveQuestion } from './useSaveQuestion.js';
import { useLoadQuestion } from './useLoadQuestion.js';

export function useQuestionEditPage() {
const router = useRouter(); const route = useRoute();
const { confirm } = useConfirm();
const editId = route.params.id || null; const isEdit = !!editId;
const saving = ref(false);
const codeEditorRef = ref(null);

// ★★ 调用序即 watch 注册序，不可交换：U3(357,367) → U4(482) → U9(699) → U7(701)；
//    U5 必须在 U3 之前（U3 需要 objectiveSettings），U3 必须在 U4/U9/U7 之前（watch 序）。
const { form, hasMaterial } = useQuestionForm();
const settings = useQuestionSettings();
const { objectiveSettings, tempSettings, showSettings, resetSettings, applySettings, bindSubQuestions } = settings;
const subs = useSubQuestionList({ form, objectiveSettings });
const { questionKind, sqKind, subQuestions, tabsScrollRef, canScrollLeft, canScrollRight, onTabsScroll, scrollTabs, activeIndex, slideDir, showMaterial, computedMaxScore, sqDisplayLabel, onPickKind, saveDraft, loadSq, switchTo, addSub, removeSub, newSq } = subs;
const { markDraftChanged, clearDraftChanged, hasDraftChanged } = subs;
bindSubQuestions({ subQuestions, saveDraft, loadSq, newSq });            // U3 ↔ U5 真环（plan §2.3-1）
const obj = useObjectiveItems({ form, subQuestions, sqKind, activeIndex, objectiveSettings });
const { previewFocusKey, computedObjSqScore, currentFlatItemType, onAddItem, removeItem, addItemOption, removeOption, toggleMultiAnswer, onFillBlankChange, onItemScoreChange, onEditCardClick } = obj;
const draft = useDraftSync({ form, isEdit, saveDraft, clearDraftChanged, hasDraftChanged });
const { statusText } = draft;
const ai = useAiReference({ form, activeIndex, confirm });
const { genRunning, aiTag, aiGenerateRefs, promptAiGenerate } = ai;
subs.bindShared({ aiTag, previewFocusKey });                          // U3 ↔ U4/U7 真环（plan §2.3-2/3）
const imp = useExamImport({ questionKind, subQuestions, newSq, loadSq, objectiveSettings });
const { showUploadExam, uploadFileList, uploadAnalyzing, uploadResult, uploadError, uploadProgress, resetUpload, handleUploadExam, fillFromParsed } = imp;
const prompt = usePromptPreview({ editId });
const { promptModalOpen, promptLoading, promptPreviewData, promptActiveKeys, showPromptPreview } = prompt;
const save = useSaveQuestion({ form, subQuestions, questionKind, computedMaxScore, objectiveSettings, saveDraft, promptAiGenerate, isEdit, editId, saving, router, confirm });
const { handleCancel, handleSave } = save;
const loader = useLoadQuestion({ isEdit, editId, form, subQuestions, questionKind, objectiveSettings, showMaterial, loadSq, newSq });
// ★W6（t8/F1）：loadError 必须**透出**给页面 —— 此前只解构 load，加载失败态到不了渲染层（死代码），
//   页面于是停在"空白可编辑表单"（总分 0 / 还能点选题型），只有 3 秒 toast。
const { load, loadLoading, loadError } = loader;

// 格式化
function formatCode(){codeEditorRef.value?.format();}

function beforeUnloadHandler(e){saveDraft();if(hasDraftChanged()){e.preventDefault();e.returnValue='有未保存的更改';}}

// ★ 两个 hook 的回调体平移到本文件；注册语句仍只在 .vue（onMounted/onUnmounted 各一次，不得改类型）
function onPageMounted(){load();window.addEventListener('beforeunload',beforeUnloadHandler);}
function onPageUnmounted(){window.removeEventListener('beforeunload',beforeUnloadHandler);saveDraft();}

  return {
    form, hasMaterial, langs, isCodeStem, itemTypeLabel, itemTypeColor, itemTypeTagClass,
    questionKind, sqKind, subQuestions, tabsScrollRef, canScrollLeft, canScrollRight, onTabsScroll, scrollTabs, activeIndex, slideDir, showMaterial,
    computedMaxScore, sqDisplayLabel, onPickKind, addSub, removeSub, switchTo, saveDraft, loadSq,
    computedObjSqScore, currentFlatItemType, previewFocusKey, onAddItem, removeItem, addItemOption, removeOption, toggleMultiAnswer, onFillBlankChange, onItemScoreChange, onEditCardClick,
    showSettings, objectiveSettings, tempSettings, resetSettings, applySettings,
    showUploadExam, uploadFileList, uploadAnalyzing, uploadResult, uploadError, uploadProgress, resetUpload, handleUploadExam,
    aiTag, promptModalOpen, promptLoading, promptPreviewData, promptActiveKeys, showPromptPreview,
    statusText, handleCancel, handleSave, saving, isEdit, codeEditorRef, formatCode,
    router, route, confirm, editId, aiGenerateRefs, genRunning, markDraftChanged, fillFromParsed,
    loadLoading, // ★热修：加载中态（页面渲染骨架，避免编辑器挂载即卸载的竞态）
    loadError,   // ★W6（t8/F1）：加载失败态（QuestionEdit.vue 据此渲染常驻空态；verify-frontend ⑮h 故障② 按"被页面消费"断言）
    onPageMounted, onPageUnmounted,
  };
}

export default useQuestionEditPage;
