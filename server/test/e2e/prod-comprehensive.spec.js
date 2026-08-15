// 公网全模块E2E: 所有学生提交，分数段均匀分布
import { test, expect } from '@playwright/test';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

const API='https://deadpan.asia/exam/api';const BASE='https://deadpan.asia/exam';
const T={username:'e2e_t2',password:'e2e_t2'};const SID=2175;const CID=13;

async function api(page,m,p,d,tk){const h={'Content-Type':'application/json'};if(tk)h.Authorization='Bearer '+tk;return page.evaluate(async({method,url,data,headers})=>{const o={method,headers};if(data)o.body=JSON.stringify(data);const r=await fetch(url,o);const b=await r.json().catch(()=>({}));return{status:r.status,body:b}};,{method:m,url:API+p,data:d,headers:h})}
async function login(page,un,pw){const r=await api(page,'POST','/auth/login',{username:un,password:pw});return r.body.data?.token}
async function extractText(fn){const b=fs.readFileSync(path.resolve('/Users/you/My Projects/My Vue/Exam-DeepSeek',fn));return(await mammoth.extractRawText({buffer:b})).value}
function p(a){return a[Math.floor(Math.random()*a.length)]}

// 客观题模拟
function simObj(item,q){if(Math.random()>.93)return'';if(Math.random()*100<q)return item.answer||'';if(item.type==='choice'){const w=(item.options||[]).map(o=>o.key).filter(k=>k!==item.answer);return p(w)||item.answer}if(item.type==='multi_choice'){const a=(item.options||[]).map(o=>o.key);return[p(a),p(a)].filter((v,i,ar)=>ar.indexOf(v)===i).join(',')}if(item.type==='judge')return item.answer==='true'?'false':'true';return'x'}

// 主观题代码模板（按语言、分数段）
const CODE={
java:{h:'public class Main{public static void bubbleSort(int[]a){int n=a.length;boolean s;for(int i=0;i<n-1;i++){s=false;for(int j=0;j<n-i-1;j++){if(a[j]>a[j+1]){int t=a[j];a[j]=a[j+1];a[j+1]=t;s=true;}}if(!s)break;}for(int v:a)System.out.print(v+" ");}public static void main(String[]a){int[]x={5,2,8,1,9,3};bubbleSort(x);}}',
  m:'public class Main{public static void sort(int[]a){for(int i=0;i<a.length;i++){for(int j=0;j<a.length-1;j++){if(a[j]>a[j+1]){int t=a[j];a[j]=a[j+1];a[j+1]=t;}}}for(int v:a)System.out.print(v+" ");}public static void main(String[]a){int[]x={5,2,8,1};sort(x);}}',
  l:'public class Main{public static void main(String[]a){int[]x={5,2,8,1};for(int i=0;i<x.length-1;i++){if(x[i]>x[i+1]){int t=x[i];x[i]=x[i+1];x[i+1]=t;}}System.out.println("sorted");}}',
  x:'public class Main{public static void main(String[]a){System.out.println("hello world");}}'},
csharp:{h:'using System;using System.Linq;class P{static void Main(){var n=new[]{12,55,68,103,44,72};var r=n.Where(x=>x>50&&x%2==0).OrderByDescending(x=>x);Console.WriteLine(string.Join(",",r));}}',
  m:'using System;class P{static void T<T>(ref T a,ref T b){T t=a;a=b;b=t;}static void Main(){int x=1,y=2;T(ref x,ref y);Console.WriteLine(x+","+y);}}',
  l:'class P{static void Main(){int a=1,b=2;int c=a;a=b;b=c;Console.WriteLine("swapped");}}',
  x:'class P{static void Main(){System.Console.WriteLine("hello csharp");}}'},
python:{h:'def is_palindrome(s):\n    c="".join(ch.lower() for ch in s if ch.isalnum())\n    return c==c[::-1]\n\ndef fib(n):\n    a,b=0,1\n    for _ in range(n):yield a;a,b=b,a+b',
  m:'def check(s):\n    s=s.replace(" ","").lower()\n    return s==s[::-1]\n\ndef fib(n):\n    a,b=0,1\n    for i in range(n):print(a);a,b=b,a+b',
  l:'s=input()\nprint(s==s[::-1])',
  x:'print("hello python")'}};
function simCode(lang,q){if(Math.random()>.9)return'';const t=q>=80?'h':q>=50?'m':q>=20?'l':'x';return CODE[lang]?.[t]||CODE.python[t]}
function simCodeMulti(lang,idx,q){
  // 每题给不同的仿代码
  const stems=['bubble_sort_impl','singleton_impl','thread_sum_impl','student_sys_impl','file_word_count_impl'];
  const s=stems[idx%5];return simCode(lang,q)+'\n// question_'+s;
}

function buildSubQuestions(parsedQs){
  const objQs=parsedQs.filter(q=>q.type!=='code');const codeQs=parsedQs.filter(q=>q.type==='code');
  const subs=[];
  if(objQs.length){const items=objQs.map((q,i)=>{const opts=(q.options||[]).map((o,oi)=>({key:String.fromCharCode(65+oi),text:(typeof o==='string'?o:(o?.text||'')).replace(/^[A-H][.、．]\\s*/,'').trim()}));let a=q.answer||'';if(q.type==='judge')a=/^(正确|对|√|T|true)$/i.test(a)?'true':'false';return{key:i,type:q.type,stem:q.stem||'',options:opts,answer:a,score:q.type==='multi_choice'?3:(q.type==='fill'?2:q.type==='judge'?1:2)}});subs.push({type:'objective',score:items.reduce((s,i)=>s+i.score,0),objectiveItems:items})}
  codeQs.forEach(q=>subs.push({type:'code',score:10,content:'<p>'+(q.stem||'').replace(/\n/g,'<br/>')+'</p>',referenceAnswer:q.referenceAnswer||'',language:q.language||'',scoringCriteria:q.scoringCriteria||''}));
  return subs;
}

test('公网全模块E2E综合测试',async({page})=>{test.setTimeout(900000);
  await page.goto(BASE+'/login');
  const Tk=await login(page,T.username,T.password);
  expect(Tk).toBeTruthy();
  console.log('✓ 教师登录');

  // ====== 阶段1: AI解析3份试卷 ======
  console.log('\n═══ 1. AI解析试卷 ═══');
  const examDefs=[{f:'Java期末.docx',n:'Java',e:{choice:20,judge:10,code:5}},{f:'C#期末.docx',n:'C#',e:{choice:10,multi_choice:10,fill:10,code:5}},{f:'Python期末.docx',n:'Python',e:{code:10}}];
  const parsedExams=[];
  for(const ex of examDefs){console.log(`  📄 ${ex.n}...`);const t=await extractText(ex.f);const r=await api(page,'POST',`/teacher/parse-exam?schoolId=${SID}`,{content:t.length>80000?t.slice(0,80000):t},Tk);expect(r.body.code).toBe(0);const qs=r.body.data.questions||[];const ty={};qs.forEach(q=>{ty[q.type]=(ty[q.type]||0)+1});const ok=Object.entries(ex.e).every(([k,v])=>(ty[k]||0)>=v*0.8);console.log(`    ${qs.length}题 ${JSON.stringify(ty)} ${ok?'✓':'⚠'}`);parsedExams.push({n:ex.n,qs})}

  // ====== 阶段2: 创建题目+AI生成标答 ======
  console.log('\n═══ 2. 创建题目+AI生成参考答案 ═══');
  const created=[];
  for(const pe of parsedExams){const subs=buildSubQuestions(pe.qs);const r=await api(page,'POST',`/teacher/questions?schoolId=${SID}`,{title:`[公网]${pe.n}期末`,difficulty:'medium',objectiveSettings:{classificationMode:'group',multiChoiceScoring:'partial'},subQuestions:subs},Tk);expect(r.body.code).toBe(0);const savedSubs=r.body.data.subQuestions||[];console.log(`  ✓ ${pe.n} id=${r.body.data.id} ${savedSubs.length}小题 总分${r.body.data.maxScore}`);

    // AI生成缺的标答
    let gen=0;for(const sq of savedSubs){if(sq.type!=='code'||(sq.referenceAnswer&&sq.referenceAnswer.trim()))continue;const stem=(sq.content||'').replace(/<[^>]*>/g,'').trim();const gr=await api(page,'POST','/teacher/generate-reference',{stem,scoringCriteria:sq.scoringCriteria||undefined},Tk);if(gr.body.code===0){sq.referenceAnswer=gr.body.data.answer;gen++}}
    console.log(`    AI标答: ${gen}/${savedSubs.filter(s=>s.type==='code').length}`);

    if(gen>0){const up=savedSubs.map(s=>({title:s.title||'',type:s.type||'code',score:s.score||0,content:s.content||'',referenceAnswer:s.referenceAnswer||'',language:s.language||'cpp',objectiveItems:s.objectiveItems||undefined,scoringCriteria:s.scoringCriteria||undefined}));await api(page,'PUT',`/teacher/questions/${r.body.data.id}?schoolId=${SID}`,{title:`[公网]${pe.n}期末`,difficulty:'medium',objectiveSettings:{classificationMode:'group',multiChoiceScoring:'partial'},subQuestions:up},Tk)}
    created.push({qid:r.body.data.id,n:pe.n,subs:savedSubs,ms:r.body.data.maxScore})}

  // ====== 阶段3: 布置作业 ======
  console.log('\n═══ 3. 布置作业 ═══');
  const now=new Date();const st=new Date(now-6e4).toISOString();const et=new Date(now.getTime()+180*6e4).toISOString();
  const ass=[];
  for(const ce of created){const r=await api(page,'POST',`/teacher/assignments?schoolId=${SID}`,{title:`[公网]${ce.n}期末测试`,startTime:st,endTime:et,allowResubmit:ce.n==='C#',questionIds:[ce.qid],classIds:[CID]},Tk);expect(r.body.code).toBe(0);ass.push({aid:r.body.data.id,qid:ce.qid,n:ce.n,allow:ce.n==='C#'});console.log(`  ✓ ${ce.n} assId=${r.body.data.id} 补交=${ce.n==='C#'}`)}

  // ====== 阶段4: 所有10名学生作答 ======
  console.log('\n═══ 4. 学生作答(10人×3科×各分数段) ═══');
  const dists=[{c:2,q:88,l:'高(>80%)'},{c:3,q:62,l:'中(50-80%)'},{c:3,q:35,l:'低(20-50%)'},{c:2,q:8,l:'极低(<20%)'}];
  let totalSubs=0;
  for(const{a:aid,qid,n}=ass){console.log(`\n  📋 ${n} (作业${aid})`);
    const qr=await api(page,'GET',`/teacher/questions/${qid}?schoolId=${SID}`,null,Tk);const sqs=qr.body.data?.subQuestions||[];
    const lang=n==='Java'?'java':n==='C#'?'csharp':'python';
    let si=0;for(const d of dists){for(let b=0;b<d.c;b++){const stId=4+si;si++;if(stId>13)break;
      const stA=await api(page,'GET',`/teacher/students?schoolId=${SID}&classId=${CID}`,null,Tk);const sts=stA.body.data||[];
      const st=sts.find(s=>s.id===stId);if(!st)continue;
      const Sk=await login(page,st.username,st.username);if(!Sk){console.log(`    ✗ ${st.username} 登录失败`);continue}
      for(const sq of sqs){const ans=sq.type==='objective'?JSON.stringify((sq.objectiveItems||[]).map(it=>({key:it.key,answer:simObj(it,d.q)}))):simCodeMulti(lang,si-1,d.q);if(ans&&ans!=='[]'){const r=await api(page,'POST',`/student/assignments/${aid}/submit`,{questionId:qid,subQuestionId:sq.id,answer:ans},Sk);if(r.body.code===0)totalSubs++}}}}
    console.log(`    ✓ ${Math.min(si,10)}人提交`)}
  console.log(`\n  总计 ${totalSubs} 条提交`);

  // ====== 阶段5: 等待AI评分 ======
  console.log('\n═══ 5. 等待AI评分 (最长10分钟) ═══');
  const watchAid=ass[0].aid;
  for(let i=0;i<300;i++){await page.waitForTimeout(2000);
    const sr=await api(page,'GET',`/teacher/review-class/${CID}?assignmentId=${watchAid}&pageSize=20`,null,Tk);
    const l=sr.body.data?.list||[];const g=l.filter(s=>s.status==='ai_graded'||s.status==='reviewed').length;
    const w=l.filter(s=>s.status==='submitted').length;const total=l.filter(s=>s.submitted||s.status!=='draft').length;
    if(i%15===0&&total>0){console.log(`  [${(300-i)*2}s] ${ass[0].n}:评${g}/${total}`);const gs=sr=>api(page,'GET',`/teacher/review-class/${CID}?assignmentId=${sr}&pageSize=20`,null,Tk);}
    if(g>=total&&g>0){console.log(`  ✓ 全部评完`);break}}

  // 等待所有作业
  let allGraded=true;
  for(const a of ass){const sr=await api(page,'GET',`/teacher/review-class/${CID}?assignmentId=${a.aid}&pageSize=20`,null,Tk);const l=sr.body.data?.list||[];const g=l.filter(s=>s.status==='ai_graded'||s.status==='reviewed').length;const t=l.filter(s=>s.submitted||s.status==='draft').filter(s=>s.submitted).length;if(g<t){allGraded=false;console.log(`  ${a.n}: 评${g}/${t}`)}}
  if(!allGraded)console.log('  ⚠ 部分未评完(继续后续测试)');

  // ====== 阶段6: 评分汇总 ======
  console.log('\n═══ 6. 评分汇总 ═══');
  for(const a of ass){const sr=await api(page,'GET',`/teacher/review-class/${CID}?assignmentId=${a.aid}&pageSize=20`,null,Tk);
    const l=sr.body.data?.list||[];const sc=l.filter(s=>s.aiScore!=null).map(s=>s.aiScore);
    if(sc.length){const avg=(sc.reduce((a,b)=>a+b,0)/sc.length).toFixed(1);console.log(`  ${a.n}: ${sc.length}人 均${avg} 最低${Math.min(...sc)} 最高${Math.max(...sc)} (满分${created.find(c=>c.n===a.n)?.ms||'?'})`)}else console.log(`  ${a.n}: 无分数`)}

  // ====== 阶段7: 批量审核发布 ======
  console.log('\n═══ 7. 批量审核+发布 ═══');
  for(const a of ass){let r=await api(page,'POST','/teacher/submissions/batch-review',{schoolId:SID,classId:CID,assignmentId:a.aid},Tk);console.log(`  审核 ${a.n}: ${r.body.code===0?'✓':'✗'} ${r.body.message}`);
    r=await api(page,'POST','/teacher/submissions/batch-publish',{schoolId:SID,classId:CID,assignmentId:a.aid},Tk);console.log(`  发布 ${a.n}: ${r.body.code===0?'✓':'✗'} ${r.body.message}`)}

  // ====== 阶段8: 学生查看成绩 ======
  console.log('\n═══ 8. 学生查看已发布成绩 ═══');
  const Sk=await login(page,'20253182105','20253182105');
  for(const a of ass){const sr=await api(page,'GET',`/student/assignments/${a.aid}`,null,Sk);
    const subs=sr.body.data?.submissions||[];const pub=subs.filter(s=>s.status==='published').length;
    const score=subs.filter(s=>s.status==='published').reduce((sum,s)=>sum+(s.finalScore??s.aiScore??0),0);
    console.log(`  ${a.n}: ${pub}/${subs.length}已发布 得分${score} (学生:何骏宇)`);}

  // ====== 阶段9: 导出Excel ======
  console.log('\n═══ 9. 导出Excel ═══');
  for(const a of ass){const er=await api(page,'GET',`/teacher/export-review?classId=${CID}&assignmentId=${a.aid}`,null,Tk);
    const hc=er.body.data?.headerCells||[];const rs=er.body.data?.rows||[];console.log(`  ${a.n}: ✓ ${rs.length}行 ${hc.length}列 ${hc.length>0?'✓列名正常':'⚠0列(可能deploy未生效)'}`);if(hc.length){console.log(`    首列: ${hc[0].label?.slice(0,40)}`);const top=rs.filter(r=>r.totalScore!=null).sort((a,b)=>(b.totalScore||0)-(a.totalScore||0))[0];if(top)console.log(`    最高: ${top.studentName} ${top.totalScore}分`)}}

  // ====== 阶段10: 过期&边界 ======
  console.log('\n═══ 10. 边界校验 ═══');
  let r=await api(page,'POST',`/teacher/questions?schoolId=${SID}`,{title:'空分',subQuestions:[{type:'code',content:'<p>x</p>'}]},Tk);expect(r.status).toBe(400);console.log('  ✓ 空分400');
  r=await api(page,'POST',`/teacher/questions?schoolId=${SID}`,{title:'A'.repeat(201),subQuestions:[{type:'code',score:10,content:'<p>x</p>'}]},Tk);expect(r.status).toBe(400);console.log('  ✓ 超长标题400');
  r=await api(page,'GET',`/teacher/questions/99999?schoolId=${SID}`,null,Tk);expect(r.status).toBe(404);console.log('  ✓ 404');
  r=await api(page,'GET','/health');expect(r.body.code).toBe(0);console.log('  ✓ 健康检查');

  console.log('\n══════════════════════════════════');
  console.log('✅ 公网全模块E2E综合测试完成');
  console.log('══════════════════════════════════');
},{timeout:900000});
