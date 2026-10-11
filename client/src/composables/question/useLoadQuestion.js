/**
 * useLoadQuestion.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B4，源行 703-726）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * loadSq(0,0) 的 dir===0 语义（不触发 saveDraft / 不改 slideDir）逐字保留；旧数据 score==null 的兼容分支未动。
 */
import request from '../../api/request.js';
import { DEFAULT_TYPE_SCORES, updateFillBlanks } from './questionPure.js';

export function useLoadQuestion({ isEdit, editId, form, subQuestions, questionKind, objectiveSettings, showMaterial, loadSq, newSq }) {
// 加载已有题目
async function load(){
  if(!isEdit){return;}
  const r=await request.get(`/teacher/questions/${editId}`);const q=r.data;
  form.title=q.title;form.difficulty=q.difficulty;form.material=q.material||'';
  if(q.objectiveSettings){Object.assign(objectiveSettings,q.objectiveSettings);}
  if(q.material)showMaterial.value=true;
  const sqs=(q.subQuestions||[]).map(sq=>{
    const kind=sq.type==='objective'?'objective':'subjective';
    let items=sq.objectiveItems?.length?[...sq.objectiveItems]:[];
    let score=sq.score;
    // 向后兼容：旧数据 null 分数 → 默认分
    if(kind==='subjective'&&score==null)score=DEFAULT_TYPE_SCORES.code;
    if(kind==='objective'){
      items.forEach(item=>{if(item.score==null||item.score<=0)item.score=DEFAULT_TYPE_SCORES[item.type]??1;if(item.type==='fill')updateFillBlanks(item);});
      if(!score||score<=0)score=items.reduce((s,item)=>s+(item.score||0),0);
    }
    return newSq({id:sq.id,sqKind:kind,title:sq.title||'',score,content:sq.content,referenceAnswer:sq.referenceAnswer,language:sq.language,objectiveItems:items,scoringCriteria:sq.scoringCriteria||''});
  });
  const firstSqKind=sqs[0]?.sqKind||'subjective';
  questionKind.value=firstSqKind;
  subQuestions.value=sqs;
  if(subQuestions.value.length>0)loadSq(0,0);
}

  return { load };
}

export default useLoadQuestion;
