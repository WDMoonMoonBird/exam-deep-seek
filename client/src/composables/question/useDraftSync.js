/**
 * useDraftSync.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B3，源行 692 / 694 / 696-699）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * draftChanged 是 U3 的非响应式 let，本文件只经 clearDraftChanged()/hasDraftChanged() 读写（两行受登记改写）。
 */
import { computed, watch } from 'vue';
import { useDraftAutosave } from '../useDraftAutosave.js';

export function useDraftSync({ form, isEdit, saveDraft, clearDraftChanged, hasDraftChanged }) {
  // ★ useDraftAutosave 必须在 setup 同步阶段调用恰好一次：其内部 useDraftAutosave.js:134 依赖
  //   getCurrentInstance() 注册 onBeforeUnmount(stop)；放到 onMounted/异步分支会静默失去清理。
  // ★ delay: 2000 是本仓注释写明的对外节拍（useDraftAutosave.js:7-21），逐字未改。
const draftSaver = useDraftAutosave({
  save: async () => { saveDraft(); clearDraftChanged(); },
  delay: 2000,
  enabled: () => hasDraftChanged(),
});

/** 动作条状态文本（role="status" aria-live="polite" 由模板提供） */
const statusText = computed(() => ({ idle: '', saving: '保存中…', saved: '已保存', error: '保存失败' }[draftSaver.status.value] || ''));
watch(()=>[form.content,form.referenceAnswer,form.objectiveItems,form.sqScore,form.scoringCriteria],()=>{if(isEdit)draftSaver.schedule();},{deep:true});

  return { draftSaver, statusText };
}

export default useDraftSync;
