/**
 * useAiReference.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B3，源行 430-432 / 700-701 / 747-766 / 768-780）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * aiTag 跨 U3/U7 共享：唯一创建点在本文件。watch@701 必须晚于 U9 的 watch@699 注册（同源 form.referenceAnswer）。
 */
import { ref, watch, h } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { _sanHtml } from './questionPure.js';

export function useAiReference({ form, activeIndex, confirm }) {
// AI 生成参考答案
const genRunning = ref(false);
const aiTag = ref('');  // 当前小题的 AI 标记

async function aiGenerateRefs(missing){
  genRunning.value=true;
  let done=0;
  try{
    for(const {sq,i} of missing){
      try{
        const r=await request.post('/teacher/generate-reference',{
          material:form.material||undefined,
          stem:(sq.content||'').replace(/<[^>]*>/g,''),
          scoringCriteria:sq.scoringCriteria||undefined,
        },{timeout:120000});
        const code=r.data.answer||'';
        sq.referenceAnswer=code;sq.isAiGenerated=true;
        if(i===activeIndex.value){form.referenceAnswer=code;aiTag.value='AI 生成，请审核';}
        done++;
      }catch(e){console.error('[AI生成] 第'+(i+1)+'小题失败:',e);}
    }
  }finally{genRunning.value=false;}
  if(done>0)message.success(`AI 已为 ${done} 道题生成参考答案，请审核后保存`);
}

function promptAiGenerate(missing){
  let rows='';
  missing.forEach(({sq,i})=>{rows+=`<tr><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">第${i+1}小题</td><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">${(sq.content||'').replace(/<[^>]*>/g,'').slice(0,50)}</td><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);color:var(--status-danger-fg);">未设置</td></tr>`;});
  const tableHtml=`<table style="width:100%;border-collapse:collapse;font-size:var(--fs-body-sm);"><thead><tr style="background:var(--bg-surface-2);"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">小题</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">题干</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">参考答案</th></tr></thead><tbody>${rows}</tbody></table>`;
  confirm({
    title:`${missing.length} 道主观题未设参考答案`,
    content:()=>h('div',{innerHTML:_sanHtml(`<p style="margin-bottom:8px;color:var(--text-secondary);">以下主观题尚未编写参考答案：</p>${tableHtml}<p style="margin-top:8px;color:var(--status-warning-fg);font-size:var(--fs-body-sm);">可由 AI 根据题目内容和评分标准自动生成参考答案，生成后请核对修改。</p>`)}),
    okText:'AI 生成参考答案',
    cancelText:'暂不生成',
    width:640,
    onOk:async()=>{await aiGenerateRefs(missing);},
  });
}

// aiTag 的所有权在本文件：U3 以 bindShared 承接同一 ref 实例（只读写 .value，不得第二次 ref('')）
// AI 标记：手动编辑参考答案时自动清除
watch(()=>form.referenceAnswer,(newVal,oldVal)=>{if(aiTag.value&&!genRunning.value&&newVal!==oldVal)aiTag.value='';});

  return { genRunning, aiTag, aiGenerateRefs, promptAiGenerate };
}

export default useAiReference;
