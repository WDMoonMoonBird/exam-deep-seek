/**
 * useExamImport.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B4，源行 418-424 / 539-606 / 653-688）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * fillFromParsed 会反向改写 questionKind / subQuestions（跨形态副作用），调用序在两形态下都必须发生。
 * handleUploadExam 的 SSE reader 不可取消是既有行为（未加 AbortController）。
 */
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { DEFAULT_TYPE_SCORES, normalizeItem, detectCodeLang } from './questionPure.js';
import { errorCopyOf } from '../errorCopy.js';   // ★W1-r2（t4）：SSE 通道不走 axios 拦截器 ⇒ 文案在此手动对齐统一口径

// ★P2-XLSX（2026-10-18）：xlsx@0.18.5 无修复版本（原型污染/ReDoS）⇒ 前端先做输入上限缓解。
//   长期方案：服务端隔离解析或替换为 exceljs；上限值为经验值，可按业务调整。
const MAX_XLSX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_XLSX_ROWS = 5000;
const MAX_XLSX_COLS = 100;

export function useExamImport({ questionKind, subQuestions, newSq, loadSq, objectiveSettings }) {
// 上传
const showUploadExam = ref(false);
const uploadFileList = ref([]);
const uploadAnalyzing = ref(false);
const uploadResult = ref(0);
const uploadError = ref('');
const uploadProgress = ref(0);

// 上传试卷
function resetUpload(){uploadFileList.value=[];uploadAnalyzing.value=false;uploadResult.value=0;uploadError.value='';uploadProgress.value=0;}
async function handleUploadExam(file){
  console.log('[上传试卷] 文件:', file.name, '大小:', (file.size/1024).toFixed(1), 'KB');
  uploadAnalyzing.value=true;uploadResult.value=0;uploadError.value='';uploadProgress.value=0;
  try{
    const ext=file.name.split('.').pop().toLowerCase();let text='';
    console.log('[上传试卷] 扩展名:', ext);
    if(ext==='docx'){
      console.log('[上传试卷] 使用 mammoth 解析 .docx...');
      const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
      text=r.value;
      console.log('[上传试卷] mammoth 解析完成，字符数:', text.length);
    }
    else if(ext==='xlsx'){
      // ★P2-XLSX：先在解析前限制文件大小，避免恶意/超大文件直接进入 SheetJS
      if (file.size && file.size > MAX_XLSX_FILE_BYTES) {
        uploadError.value = 'Excel 文件过大（上限 8MB）';
        uploadAnalyzing.value = false;
        return false;
      }
      console.log('[上传试卷] 使用 xlsx 解析...');
      const wb=XLSX.read(await file.arrayBuffer());
      for(const sn of wb.SheetNames){
        const ws=wb.Sheets[sn];
        const ref=ws && ws['!ref'];
        if (ref) {
          const range=XLSX.utils.decode_range(ref);
          const rows=range.e.r-range.s.r+1;
          const cols=range.e.c-range.s.c+1;
          if (rows>MAX_XLSX_ROWS || cols>MAX_XLSX_COLS) {
            uploadError.value = `Excel 行/列超限（上限 ${MAX_XLSX_ROWS} 行 / ${MAX_XLSX_COLS} 列）`;
            uploadAnalyzing.value = false;
            return false;
          }
        }
        text+=XLSX.utils.sheet_to_csv(ws)+'\n';
      }
      console.log('[上传试卷] xlsx 解析完成，字符数:', text.length);
    }
    else{uploadError.value='不支持的文件格式';uploadAnalyzing.value=false;return false;}
    if(!text.trim()){uploadError.value='文件内容为空';uploadAnalyzing.value=false;return false;}
    // 流式 SSE 解析 — 永不超时
    const token = (() => { try { return localStorage.getItem('token') || ''; } catch { return ''; } })();
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    const resp = await fetch(`${baseUrl}/teacher/parse-exam-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: text }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let questions = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.phase === 'streaming' || evt.phase === 'token') {
            uploadProgress.value = evt.contentLength || 0;
          } else if (evt.phase === 'done') {
            questions = evt.questions || [];
            uploadResult.value = questions.length;
          } else if (evt.phase === 'error') {
            throw new Error(evt.message);
          }
        } catch (e) { if (e.message && !e.message.includes('JSON')) throw e; }
      }
    }

    console.log('[上传试卷] 解析出题目数:', questions.length);
    if(questions.length>0){
      fillFromParsed(questions);
      showUploadExam.value=false;resetUpload();
    }
  }catch(e){
    // ★W1-r2（t4）：原始错误只进 console；上屏用固定友好文案（本通道是 fetch+SSE，不走 request 拦截器，
    //   服务端文案无法按 data.message 口径识别 ⇒ 统一走 errorCopyOf 的固定口径）
    console.error('[上传试卷] 错误:', e);
    uploadError.value = errorCopyOf(e, { tag: 'useExamImport.js 解析试卷', action: '解析' });
  }
  finally{uploadAnalyzing.value=false;}
  return false;
}

function fillFromParsed(qs){
  const hasCode=qs.some(q=>q.type==='code');
  const hasObj=qs.some(q=>q.type!=='code');

  if(!questionKind.value){
    if(hasCode&&!hasObj)questionKind.value='subjective';
    else if(!hasCode&&hasObj)questionKind.value='objective';
    else questionKind.value='subjective';
  }

  subQuestions.value=[];

  if(objectiveSettings.classificationMode==='flat'){
    let currentGroup=null, currentItems=[];
    const flushGroup=()=>{if(currentGroup&&currentItems.length){const items=currentItems.map(normalizeItem).map((item,i)=>({...item,key:i}));subQuestions.value.push(newSq({sqKind:'objective',score:items.reduce((s,i)=>s+(i.score||0),0),objectiveItems:items}));}};
    qs.forEach(q=>{
      if(q.type==='code'){
        flushGroup();currentGroup=null;currentItems=[];
        subQuestions.value.push(newSq({sqKind:'subjective',score:DEFAULT_TYPE_SCORES.code,content:`<p>${(q.stem||'').replace(/\n/g,'<br/>')}</p>`,referenceAnswer:q.referenceAnswer||'',scoringCriteria:q.scoringCriteria||'',language:q.language||detectCodeLang(q.referenceAnswer||'',q.stem||'')}));
      }else{
        if(currentGroup!==q.type){flushGroup();currentGroup=q.type;currentItems=[q];}
        else{currentItems.push(q);}
      }
    });
    flushGroup();
  }else{
    const objSqs=qs.filter(q=>q.type!=='code');
    const codeSqs=qs.filter(q=>q.type==='code');
    if(objSqs.length){const items=objSqs.map(normalizeItem).map((item,i)=>({...item,key:i}));subQuestions.value.push(newSq({sqKind:'objective',score:items.reduce((s,i)=>s+(i.score||0),0),objectiveItems:items}));}
    codeSqs.forEach(q=>{subQuestions.value.push(newSq({sqKind:'subjective',score:DEFAULT_TYPE_SCORES.code,content:`<p>${(q.stem||'').replace(/\n/g,'<br/>')}</p>`,referenceAnswer:q.referenceAnswer||'',scoringCriteria:q.scoringCriteria||'',language:q.language||detectCodeLang(q.referenceAnswer||'',q.stem||'')}));});
  }

  if(!subQuestions.value.length)subQuestions.value=[newSq()];
  loadSq(0,0);
  message.success(`已填充 ${qs.length} 道题目，请核对修改`);
}

  return { showUploadExam, uploadFileList, uploadAnalyzing, uploadResult, uploadError, uploadProgress, resetUpload, handleUploadExam, fillFromParsed };
}

export default useExamImport;
