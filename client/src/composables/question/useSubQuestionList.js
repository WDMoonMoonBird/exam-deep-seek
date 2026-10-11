/**
 * useSubQuestionList.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B2，源行 345-359 / 364-367 / 372-385 / 428 / 436-437 / 442-447 / 452-470 / 690-691）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * ★ 形态单一真值源：questionKind / sqKind 只在本文件创建，任何其它单元不得再 ref()。
 * ★ 两个非响应式 let：sqKeyCounter（只服务 newSq）、draftChanged（只经三个访问器外泄）。
 */
import { ref, computed, watch, nextTick } from 'vue';
import { DEFAULT_TYPE_SCORES, newItem, itemTypeLabel } from './questionPure.js';

export function useSubQuestionList({ form, objectiveSettings }) {
  // ★ 晚绑定（plan §2.3-2/3）：aiTag 由 U7 创建、previewFocusKey 由 U4 创建；
  //   二者必须晚于本单元创建（watch 注册序 357 < 367 < 482 < 699 < 701），故此处以闭包 let 承接，
  //   由接线根在 U4/U7 创建后立即调用 bindShared 注入 —— 同一 ref 实例，禁止第二次 ref()。
  let aiTag, previewFocusKey;
  function bindShared(deps){ ({ aiTag, previewFocusKey } = deps); }

// 题目类型：null=未选, 'subjective'=主观题, 'objective'=客观题
const questionKind = ref(null);
// 当前小题类型
const sqKind = ref('subjective');

const subQuestions = ref([]);
const tabsScrollRef = ref(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function onTabsScroll(){const el=tabsScrollRef.value;if(el){canScrollLeft.value=el.scrollLeft>4;canScrollRight.value=el.scrollLeft+el.clientWidth<el.scrollWidth-4;}}
function scrollTabs(dir){const el=tabsScrollRef.value;if(el){el.scrollBy({left:el.clientWidth*0.6*dir,behavior:'smooth'});}}
watch(subQuestions,()=>nextTick(()=>onTabsScroll()),{deep:true});
const activeIndex = ref(0); const slideDir = ref(1); const showMaterial = ref(false);
let sqKeyCounter = 0;

// 总分 = Σ 小题分值
const computedMaxScore = computed(()=>subQuestions.value.reduce((s,sq)=>s+(sq.score||0),0));
// 实时同步当前小题分值到 subQuestions，保证 computedMaxScore 刷新
watch(()=>form.sqScore,(v)=>{const sq=subQuestions.value[activeIndex.value];if(sq&&sqKind.value==='subjective'&&v!=null){sq.score=v;}});

// 小题 tab 显示标签（用于 tab 栏）
function sqTypeName(sq){
  if(sq.sqKind==='subjective')return'';
  if(objectiveSettings.classificationMode==='flat'){
    const items=sq.objectiveItems||[];
    return items.length?(itemTypeLabel(items[0].type)||''):'';
  }
  return''; // group 模式也不显示
}
function sqDisplayLabel(sq,i){
  const n=`第${i+1}小题`;
  const tn=sqTypeName(sq);
  return tn?`${n} ${tn}`:n;
}

// 脏标记（普通 let，非响应式）：对外只经下面三个访问器，避免出现第二份真值（plan §2.1-e）
let draftChanged = false;

// 工厂
function newSq(d={}){const kind=d.sqKind||'subjective';const base={_key:++sqKeyCounter,sqKind:kind,score:kind==='subjective'?DEFAULT_TYPE_SCORES.code:null,content:'',referenceAnswer:'',language:'cpp',objectiveItems:[],scoringCriteria:''};return{...base,...d};}

// 初始选类型
function onPickKind({key}){
  questionKind.value=key;
  subQuestions.value=[newSq({sqKind:key})];
  loadSq(0,0);
}

// 小题切换
function saveDraft(){const sq=subQuestions.value[activeIndex.value];if(sq){sq.sqKind=sqKind.value;sq.title=form.sqTitle;sq.score=form.sqScore;sq.content=form.content;sq.referenceAnswer=form.referenceAnswer;sq.language=form.language;sq.objectiveItems=form.objectiveItems;sq.scoringCriteria=form.scoringCriteria;sq.isAiGenerated=!!aiTag.value;markDraftChanged();}}
function loadSq(index,dir){
  if(dir!==0)saveDraft();if(dir==null)dir=index>activeIndex.value?1:-1;if(dir!==0)slideDir.value=dir;activeIndex.value=index;
  const sq=subQuestions.value[index];if(sq){sqKind.value=sq.sqKind||'subjective';form.sqTitle=sq.title||'';form.sqScore=sq.score??null;form.content=sq.content||'';form.referenceAnswer=sq.referenceAnswer||'';form.language=sq.language||'cpp';form.objectiveItems=sq.objectiveItems?.length?[...sq.objectiveItems]:[];form.scoringCriteria=sq.scoringCriteria||'';aiTag.value=sq.isAiGenerated?'AI 生成，请审核':'';previewFocusKey.value=-1;}
}
function switchTo(index){if(index===activeIndex.value)return;loadSq(index);}
function addSub({key}){saveDraft();
  let sq;
  if(objectiveSettings.classificationMode==='flat'&&key!=='subjective'){
    // flat 模式：创建客观题小题，预置一个空小问以标记类型
    sq=newSq({sqKind:'objective',objectiveItems:[newItem(key,0)]});
    sq.score=DEFAULT_TYPE_SCORES[key]??1;
  }else{
    sq=newSq({sqKind:key==='subjective'?'subjective':'objective'});
  }
  subQuestions.value.push(sq);loadSq(subQuestions.value.length-1);
}
function removeSub(index){if(subQuestions.value.length<=1)return;const was=activeIndex.value;subQuestions.value.splice(index,1);loadSq(index<was?was-1:Math.min(was,subQuestions.value.length-1));}

// 草稿：saveDraft 是本地「左栏表单 → 当前小题」同步（不发请求），原 2s 防抖节拍不变，改用 useDraftAutosave
function markDraftChanged(){draftChanged=true;}

function clearDraftChanged(){draftChanged=false;}
function hasDraftChanged(){return draftChanged;}

  return { questionKind, sqKind, subQuestions, tabsScrollRef, canScrollLeft, canScrollRight,
    onTabsScroll, scrollTabs, activeIndex, slideDir, showMaterial, computedMaxScore, sqTypeName, sqDisplayLabel,
    onPickKind, saveDraft, loadSq, switchTo, addSub, removeSub, newSq,
    markDraftChanged, clearDraftChanged, hasDraftChanged, bindShared };
}

export default useSubQuestionList;
