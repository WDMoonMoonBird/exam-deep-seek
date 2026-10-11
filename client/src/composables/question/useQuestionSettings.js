/**
 * useQuestionSettings.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B2，源行 409-410 / 412-416 / 494-537）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * 本单元不注册任何 watch（实测），故 U12 的调用序对 5 个 watch 的注册序无影响。
 */
import { ref, reactive } from 'vue';
import { SETTINGS_KEY } from './questionPure.js';

export function useQuestionSettings() {
  // ★ 晚绑定（plan §2.3-1）：U3（useSubQuestionList）在本单元之后创建（U3 需要本单元的 objectiveSettings），
  //   故 applySettings 用到的 4 个名字以闭包 let 承接，由接线根在 U3 创建后立即调用 bindSubQuestions 注入。
  //   合法性：applySettings 只在用户点「确定」时被调用，setup 期从不执行。
  let subQuestions, saveDraft, loadSq, newSq;
  function bindSubQuestions(deps){ ({ subQuestions, saveDraft, loadSq, newSq } = deps); }

// 设置
const showSettings = ref(false);

function loadSettings(){try{const r=localStorage.getItem(SETTINGS_KEY);return r?{classificationMode:'group',multiChoiceScoring:'all_or_nothing',...JSON.parse(r)}:{classificationMode:'group',multiChoiceScoring:'all_or_nothing'};}catch{return{classificationMode:'group',multiChoiceScoring:'all_or_nothing'};}}
function saveSettings(s){localStorage.setItem(SETTINGS_KEY,JSON.stringify({classificationMode:s.classificationMode,multiChoiceScoring:s.multiChoiceScoring}));}
const defaultSettings = loadSettings();
const objectiveSettings = reactive({ classificationMode: defaultSettings.classificationMode, multiChoiceScoring: defaultSettings.multiChoiceScoring });
const tempSettings = reactive({ classificationMode: defaultSettings.classificationMode, multiChoiceScoring: defaultSettings.multiChoiceScoring });

// 设置
function resetSettings(){tempSettings.classificationMode=objectiveSettings.classificationMode;tempSettings.multiChoiceScoring=objectiveSettings.multiChoiceScoring;}
function applySettings(){
  const oldMode=objectiveSettings.classificationMode;
  const newMode=tempSettings.classificationMode;
  const msc=tempSettings.multiChoiceScoring;

  // 模式切换：重构 subQuestions
  if(oldMode!==newMode&&subQuestions.value.length){
    saveDraft();
    if(newMode==='flat'){
      // group→flat: 将客观题 items 按类型拆分为多个小题
      const newSubs=[];
      subQuestions.value.forEach(sq=>{
        if(sq.sqKind==='subjective'){newSubs.push(sq);return;}
        const items=sq.objectiveItems||[];
        if(!items.length){newSubs.push(sq);return;}
        const groups={};
        items.forEach(item=>{(groups[item.type]||(groups[item.type]=[])).push(item);});
        Object.entries(groups).forEach(([type,groupItems])=>{
          newSubs.push(newSq({sqKind:'objective',objectiveItems:groupItems.map((item,i)=>({...item,key:i})),score:groupItems.reduce((s,i)=>s+(i.score||0),0)}));
        });
      });
      subQuestions.value=newSubs;
    }else{
      // flat→group: 合并所有客观题小题为一个
      const allItems=[];const newSubs=[];
      subQuestions.value.forEach(sq=>{
        if(sq.sqKind==='subjective'){newSubs.push(sq);return;}
        allItems.push(...(sq.objectiveItems||[]).map((item,i)=>({...item,key:i+allItems.length})));
      });
      if(allItems.length){
        newSubs.unshift(newSq({sqKind:'objective',objectiveItems:allItems,score:allItems.reduce((s,i)=>s+(i.score||0),0)}));
      }
      subQuestions.value=newSubs;
    }
    loadSq(0,0);
  }

  objectiveSettings.classificationMode=newMode;
  objectiveSettings.multiChoiceScoring=msc;
  saveSettings({classificationMode:newMode,multiChoiceScoring:msc});
  showSettings.value=false;
}

  return { showSettings, loadSettings, saveSettings, defaultSettings, objectiveSettings, tempSettings, resetSettings, applySettings, bindSubQuestions };
}

export default useQuestionSettings;
