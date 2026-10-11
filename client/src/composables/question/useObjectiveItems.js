/**
 * useObjectiveItems.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B3，源行 368-371 / 426-427 / 472-475 / 477-482 / 484-486）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * objectiveSettings 是 A 方案 U4 依赖清单漏列项（currentFlatItemType 读它），由接线根注入。
 */
import { ref, computed, watch, nextTick } from 'vue';
import { newItem, updateFillBlanks } from './questionPure.js';

export function useObjectiveItems({ form, subQuestions, sqKind, activeIndex, objectiveSettings }) {
// 客观题小题分值 = Σ 小问分值
const computedObjSqScore = computed(()=>form.objectiveItems.reduce((s,i)=>s+(i.score||0),0));
// flat 模式下当前小题的 item 类型：从 items 中取第一个的类型
const currentFlatItemType = computed(()=>{if(objectiveSettings.classificationMode!=='flat')return null;const first=form.objectiveItems[0];return first?.type||null;});

// 预览
const previewFocusKey = ref(-1);

// 客观题 items
function syncObjSqScore(){const sq=subQuestions.value[activeIndex.value];if(sq&&sqKind.value==='objective'){const total=form.objectiveItems.reduce((s,i)=>s+(i.score||0),0);sq.score=form.sqScore=Math.round(total*100)/100;}}
function onAddItem({key}){const nk=form.objectiveItems.length?Math.max(...form.objectiveItems.map(i=>i.key))+1:0;const item=newItem(key,nk);form.objectiveItems.push(item);if(key==='fill')updateFillBlanks(item);syncObjSqScore();nextTick(()=>{scrollPreviewTo(nk);document.querySelector('.obj-item-card:last-child')?.scrollIntoView({behavior:'smooth',block:'center'});});}
function removeItem(idx){form.objectiveItems.splice(idx,1);form.objectiveItems.forEach((item,i)=>{item.key=i;});syncObjSqScore();}
function addItemOption(item){item.options.push({key:String.fromCharCode(65+item.options.length),text:''});}
function removeOption(item,idx){item.options.splice(idx,1);item.options.forEach((o,i)=>{o.key=String.fromCharCode(65+i);});if(item.type==='choice'&&!item.options.find(o=>o.key===item.answer))item.answer=item.options[0]?.key||'';}
function toggleMultiAnswer(item,key){const a=(item.answer||'').split(',').map(s=>s.trim()).filter(Boolean);const i=a.indexOf(key);i>=0?a.splice(i,1):a.push(key);item.answer=a.join(',');}
function onFillBlankChange(item){item.answer=item._blankParts.map(b=>b.answer).join(',');syncObjSqScore();}
function onItemScoreChange(){syncObjSqScore();}
watch(()=>form.objectiveItems.map(i=>i.score),()=>{if(sqKind.value==='objective')syncObjSqScore();},{deep:true});

// 预览联动
function onEditCardClick(key,e){e.currentTarget?.scrollIntoView?.({behavior:'smooth',block:'center'});scrollPreviewTo(key);}
function scrollPreviewTo(key){previewFocusKey.value=key;nextTick(()=>{const el=document.getElementById('preview-'+key);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});});}

  return { previewFocusKey, computedObjSqScore, currentFlatItemType, syncObjSqScore,
    onAddItem, removeItem, addItemOption, removeOption, toggleMultiAnswer,
    onFillBlankChange, onItemScoreChange, onEditCardClick, scrollPreviewTo };
}

export default useObjectiveItems;
