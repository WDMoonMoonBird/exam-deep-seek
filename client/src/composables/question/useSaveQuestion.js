/**
 * useSaveQuestion.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B4，源行 728-745 / 782-791 / 793-848）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * handleSave 的 5 条提前 return 与文案是用户可见契约，逐字未改；confirm 由接线根注入（不得各自 useConfirm）。
 */
import { h } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { safeSubmit } from '../useSafeRequest.js';   // ★W1（t1）：提交失败就地提示、不冒泡（不再让保存失败把整页打崩）
import { _sanHtml, itemTypeLabel } from './questionPure.js';

export function useSaveQuestion({ form, subQuestions, questionKind, computedMaxScore, objectiveSettings, saveDraft, promptAiGenerate, isEdit, editId, saving, router, confirm }) {
// 保存
function handleCancel(){router.push('/teacher/questions');}
function buildScoreSummary(){
  const sqs=subQuestions.value;const total=sqs.reduce((s,sq)=>s+(sq.score||0),0);
  const withZero=sqs.filter(sq=>!sq.score||sq.score<=0);
  let rows='';
  sqs.forEach((sq,i)=>{
    const label=sq.sqKind==='subjective'?'编程题':sq.objectiveItems?.length&&objectiveSettings.classificationMode==='flat'?(itemTypeLabel(sq.objectiveItems[0].type)||'客观题'):'客观题';
    const scoreLabel=sq.score&&sq.score>0?`${sq.score} 分`:`<span style="color:var(--status-danger-fg);">未设置</span>`;
    rows+=`<tr><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">第${i+1}题</td><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">${label}</td><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">${scoreLabel}</td></tr>`;
  });
  const html=`<table style="width:100%;border-collapse:collapse;font-size:var(--fs-body-sm);">
    <thead><tr style="background:var(--bg-surface-2);"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">小题</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">题型</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">设定分值</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:12px;font-size:var(--fs-body-sm);color:var(--text-secondary);">大题总分：<b>${computedMaxScore.value}</b> 分</p>`;
  return {html,total,withZero};
}

function collectSubjectiveIssues(){
  const emptyContent=[], missingRef=[];
  subQuestions.value.forEach((sq,i)=>{
    if(sq.sqKind!=='subjective')return;
    const c=(sq.content||'').replace(/<[^>]*>/g,'').trim();
    if(!c)emptyContent.push(i);
    else if(!(sq.referenceAnswer||'').trim())missingRef.push({sq,i});
  });
  return {emptyContent,missingRef};
}

async function handleSave(){
  saveDraft();
  if(!form.title.trim())return message.warn('请输入题目标题');
  if(!subQuestions.value.length)return message.warn('请至少添加一道小题');

  const {emptyContent,missingRef}=collectSubjectiveIssues();
  if(emptyContent.length>0){
    const names=emptyContent.map(i=>`第${i+1}题`).join('、');
    return message.warn(`${names} 主观题尚未填写题目内容`);
  }
  if(missingRef.length>0){
    promptAiGenerate(missingRef);
    return;
  }

  // 检查各小题分值
  const unscored=[];
  subQuestions.value.forEach((sq,i)=>{
    let effective=sq.score||0;
    if(sq.sqKind==='objective'&&sq.objectiveItems?.length){
      effective=sq.objectiveItems.reduce((s,item)=>s+(item.score||0),0);
    }
    if(!effective||effective<=0)unscored.push({i,kind:sq.sqKind});
  });
  if(unscored.length>0){
    const names=unscored.map(u=>{const sq=subQuestions.value[u.i];const t=sq.sqKind==='subjective'?'编程题':sq.objectiveItems?.length&&objectiveSettings.classificationMode==='flat'?(itemTypeLabel(sq.objectiveItems[0].type)||'客观题'):'客观题';return`第${u.i+1}小题（${t}）`;}).join('、');
    return message.warn(`${names} 尚未设置分值。客观题请检查各小问分值，主观题请填入分值。`);
  }

  const {html}=buildScoreSummary();
  confirm({
    title:'确认保存',
    content:()=>h('div',{innerHTML:_sanHtml(`<p style="margin-bottom:8px;color:var(--text-secondary);">请确认各小题分值是否正确：</p>${html}<p style="margin-top:8px;color:var(--text-secondary);font-size:var(--fs-body-sm);">所有小题已设定分值，确认无误可保存。</p>`)}),
    okText:'确认保存',
    cancelText:'返回修改',
    width:640,
    onOk:doSave,
  });
}
async function doSave(){
  saving.value=true;
  try{
    subQuestions.value.forEach(sq=>{if(sq.sqKind==='objective'&&sq.objectiveItems?.length){sq.score=sq.objectiveItems.reduce((s,i)=>s+(i.score||0),0);}});
    const totalScore=subQuestions.value.reduce((s,sq)=>s+(sq.score||0),0);
    const p={title:form.title,difficulty:form.difficulty,maxScore:totalScore,material:form.material||undefined,
      objectiveSettings:{questionKind:questionKind.value,classificationMode:objectiveSettings.classificationMode,multiChoiceScoring:objectiveSettings.multiChoiceScoring},
      subQuestions:subQuestions.value.map(sq=>({
        title:sq.title||'',type:sq.sqKind==='objective'?'objective':'code',
        score:sq.score,content:sq.content,referenceAnswer:sq.referenceAnswer||'',language:sq.language||'cpp',
        objectiveItems:sq.objectiveItems?.length?sq.objectiveItems:undefined,
        scoringCriteria:sq.scoringCriteria||undefined,
      })),};
    // ★W1（t1）：safeSubmit 不抛 ⇒ 失败就地提示且**不跳页**（表单与草稿原样保留，可直接改完重试）
    const r=await safeSubmit(
      () => (isEdit?request.put(`/teacher/questions/${editId}`,p):request.post('/teacher/questions',p)),
      { action: isEdit?'保存':'创建' },
    );
    if(r.error){return;}
    message.success(isEdit?'保存成功':'创建成功');
    router.push('/teacher/questions');
  }finally{saving.value=false;}
}

  return { handleCancel, buildScoreSummary, collectSubjectiveIssues, handleSave, doSave };
}

export default useSaveQuestion;
