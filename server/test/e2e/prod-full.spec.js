// 公网全流程 — AI解析三份试卷 + AI生成标答 + 布置作业 + 评分
import { test, expect } from '@playwright/test';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

const API = 'https://deadpan.asia/exam/api';
const BASE = 'https://deadpan.asia/exam';
const T = { username: 'e2e_t2', password: 'e2e_t2' };
const S = { username: '20253182105', password: '20253182105' };
const SID = 2175; const CID = 13;

async function api(page, method, urlPath, data, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return page.evaluate(async ({ method, url, data, headers }) => {
    const opts = { method, headers };
    if (data) opts.body = JSON.stringify(data);
    const r = await fetch(url, opts);
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  }, { method, url: API + urlPath, data, headers });
}

async function extractText(filename) {
  const fp = path.resolve('/Users/you/My Projects/My Vue/Exam-DeepSeek', filename);
  const buf = fs.readFileSync(fp);
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

function buildSubQuestions(parsedQs) {
  const objQs = parsedQs.filter(q => q.type !== 'code');
  const codeQs = parsedQs.filter(q => q.type === 'code');
  const subs = [];
  if (objQs.length) {
    const items = objQs.map((q, i) => {
      const opts = (q.options || []).map((o, oi) => ({
        key: String.fromCharCode(65 + oi),
        text: (typeof o === 'string' ? o : (o?.text || '')).replace(/^[A-H][.、．]\s*/, '').trim(),
      }));
      let ans = q.answer || '';
      if (q.type === 'judge') ans = /^(正确|对|√|T|true)$/i.test(ans) ? 'true' : 'false';
      return { key: i, type: q.type, stem: q.stem || '', options: opts, answer: ans,
        score: q.type === 'multi_choice' ? 3 : (q.type === 'fill' ? 2 : q.type === 'judge' ? 1 : 2) };
    });
    subs.push({ type: 'objective', score: items.reduce((s, i) => s + i.score, 0), objectiveItems: items });
  }
  codeQs.forEach(q => {
    subs.push({ type: 'code', score: 10, content: '<p>' + (q.stem || '').replace(/\n/g, '<br/>') + '</p>',
      referenceAnswer: q.referenceAnswer || '', language: q.language || '', scoringCriteria: q.scoringCriteria || '' });
  });
  return subs;
}

function p(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function simObj(item, quality) {
  if (Math.random() > 0.93) return '';
  if (Math.random() * 100 < quality) return item.answer || '';
  if (item.type === 'choice') { const w = (item.options || []).map(o => o.key).filter(k => k !== item.answer); return p(w) || item.answer; }
  if (item.type === 'multi_choice') { const a = (item.options || []).map(o => o.key); return [p(a), p(a)].filter((v, i, ar) => ar.indexOf(v) === i).join(','); }
  if (item.type === 'judge') return item.answer === 'true' ? 'false' : 'true';
  return 'x';
}
const CODES = {
  java: { h: 'public class A{public static void sort(int[]a){int n=a.length;boolean s;for(int i=0;i<n-1;i++){s=false;for(int j=0;j<n-i-1;j++){if(a[j]>a[j+1]){int t=a[j];a[j]=a[j+1];a[j+1]=t;s=true;}}if(!s)break;}}public static void main(String[]a){int[]x={5,2,8,1};sort(x);for(int v:x)System.out.print(v+" ");}}', m: 'public class A{public static void sort(int[]a){for(int i=0;i<a.length;i++){for(int j=0;j<a.length-1;j++){if(a[j]>a[j+1]){int t=a[j];a[j]=a[j+1];a[j+1]=t;}}}}public static void main(String[]a){int[]x={5,2,8,1};sort(x);for(int v:x)System.out.print(v+" ");}}', l: 'public class A{public static void main(String[]a){int[]x={5,2,8,1};for(int i=0;i<x.length;i++){if(x[i]>x[i+1]){int t=x[i];}}System.out.println("done");}}', x: 'public class A{public static void main(String[]a){System.out.println("hello");}}' },
  csharp: { h: 'using System;using System.Linq;class P{static void Main(){var n=new[]{12,55,68,44};var r=n.Where(x=>x>50&&x%2==0).OrderByDescending(x=>x);Console.WriteLine(string.Join(",",r));}}', m: 'using System;class P{static void T<T>(ref T a,ref T b){T t=a;a=b;b=t;}static void Main(){int x=1,y=2;T(ref x,ref y);Console.WriteLine(x+","+y);}}', l: 'class P{static void Main(){int a=1,b=2;int c=a;a=b;b=c;Console.WriteLine(a);}}', x: 'class P{static void Main(){System.Console.WriteLine("ok");}}' },
  python: { h: 'def is_palindrome(s):\n    cleaned="".join(c.lower() for c in s if c.isalnum())\n    return cleaned==cleaned[::-1]\n\ndef fib(n):\n    a,b=0,1\n    for _ in range(n):yield a;a,b=b,a+b', m: 'def check(s):\n    s=s.replace(" ","").lower()\n    return s==s[::-1]\n\ndef fib(n):\n    a,b=0,1\n    for i in range(n):print(a);a,b=b,a+b', l: 's=input()\nprint(s==s[::-1])\na,b=0,1\nfor i in range(10):print(a);a=a+b', x: 'print("hello")' },
};
function simCode(lang, quality) {
  if (Math.random() > 0.9) return '';
  const tier = quality >= 80 ? 'h' : quality >= 50 ? 'm' : quality >= 20 ? 'l' : 'x';
  return (CODES[lang] || CODES.python)[tier];
}

test('公网全流程测试', async ({ page }) => {
  test.setTimeout(600000);
  await page.goto(BASE + '/login');

  // ==== 登录 ====
  let r = await api(page, 'POST', '/auth/login', T);
  expect(r.body.code).toBe(0);
  const Tk = r.body.data.token;
  console.log('✓ 教师: ' + r.body.data.user.realName);

  r = await api(page, 'POST', '/auth/login', S);
  expect(r.body.code).toBe(0);
  const Sk = r.body.data.token;
  console.log('✓ 学生: ' + r.body.data.user.realName);

  // ==== AI解析三份试卷 ====
  const exams = [
    { file: 'Java期末.docx', name: 'Java', expected: { choice: 20, judge: 10, code: 5 } },
    { file: 'C#期末.docx', name: 'C#', expected: { choice: 10, multi_choice: 10, fill: 10, code: 5 } },
    { file: 'Python期末.docx', name: 'Python', expected: { code: 10 } },
  ];
  const parsedData = [];

  for (const exam of exams) {
    console.log(`\n📄 AI解析 ${exam.name}...`);
    const text = await extractText(exam.file);
    const trimmed = text.length > 80000 ? text.slice(0, 80000) : text;
    r = await api(page, 'POST', `/teacher/parse-exam?schoolId=${SID}`, { content: trimmed }, Tk);
    expect(r.body.code).toBe(0);
    const qs = r.body.data?.questions || [];
    const types = {}; qs.forEach(q => { types[q.type] = (types[q.type] || 0) + 1; });
    console.log(`  ${qs.length}题 ${JSON.stringify(types)}`);
    for (const [t, n] of Object.entries(exam.expected)) {
      const got = types[t] || 0;
      console.log(`    ${t}: ${got}/${n} ${got >= n * 0.8 ? '✓' : '⚠'}`);
    }
    const codeQs = qs.filter(q => q.type === 'code');
    const noRef = codeQs.filter(q => !(q.referenceAnswer || '').trim()).length;
    console.log(`  主观无标答: ${noRef}/${codeQs.length} (将触发AI生成)`);
    parsedData.push({ name: exam.name, qs });
  }

  // ==== 创建题目 ====
  console.log('\n══════ 创建题目 ══════');
  const created = [];
  for (const pd of parsedData) {
    const subs = buildSubQuestions(pd.qs);
    r = await api(page, 'POST', `/teacher/questions?schoolId=${SID}`, {
      title: `[公网]${pd.name}程序设计期末`,
      difficulty: 'medium',
      objectiveSettings: { classificationMode: 'group', multiChoiceScoring: 'partial' },
      subQuestions: subs,
    }, Tk);
    expect(r.body.code).toBe(0);
    const savedSubs = r.body.data.subQuestions || [];
    const missing = savedSubs.filter(s => s.type === 'code' && !(s.referenceAnswer || '').trim());
    console.log(`  ✓ ${pd.name} id=${r.body.data.id} 总分=${r.body.data.maxScore} 缺标答=${missing.length}/${savedSubs.filter(s=>s.type==='code').length}`);
    created.push({ qid: r.body.data.id, name: pd.name, subs: savedSubs, maxScore: r.body.data.maxScore });
  }

  // ==== AI生成参考答案 ====
  console.log('\n══════ AI生成参考答案 ══════');
  for (const ce of created) {
    let generated = 0;
    for (const sq of ce.subs) {
      if (sq.type !== 'code' || (sq.referenceAnswer && sq.referenceAnswer.trim())) continue;
      const stem = (sq.content || '').replace(/<[^>]*>/g, '').trim();
      r = await api(page, 'POST', '/teacher/generate-reference', { stem, scoringCriteria: sq.scoringCriteria || undefined }, Tk);
      if (r.body.code === 0) {
        sq.referenceAnswer = r.body.data.answer;
        generated++;
        const isCode = (r.body.data.answer || '').match(/(\{|def |class |public |using |import )/);
        console.log(`    sq${sq.id}: ${(r.body.data.answer||'').length}字 ${isCode ? '✓代码' : '⚠文字'}`);
      } else { console.log(`    sq${sq.id}: ✗ ${r.body.message}`); }
    }
    console.log(`  ${ce.name}: ${generated}/${ce.subs.filter(s => s.type === 'code').length} 生成成功`);
    // 存回
    if (generated > 0) {
      const up = ce.subs.map(s => ({ title: s.title || '', type: s.type || 'code', score: s.score || 0, content: s.content || '', referenceAnswer: s.referenceAnswer || '', language: s.language || 'cpp', objectiveItems: s.objectiveItems || undefined, scoringCriteria: s.scoringCriteria || undefined }));
      r = await api(page, 'PUT', `/teacher/questions/${ce.qid}?schoolId=${SID}`, { title: `[公网]${ce.name}程序设计期末`, difficulty: 'medium', objectiveSettings: { classificationMode: 'group', multiChoiceScoring: 'partial' }, subQuestions: up }, Tk);
      console.log(`  更新: ${r.body.code === 0 ? '✓' : '✗'}`);
    }
  }

  // ==== 布置作业 ====
  console.log('\n══════ 布置作业 ══════');
  const now = new Date();
  const startTime = new Date(now - 60000).toISOString();
  const endTime = new Date(now.getTime() + 120 * 60000).toISOString();
  const assignments = [];
  for (const ce of created) {
    r = await api(page, 'POST', `/teacher/assignments?schoolId=${SID}`, {
      title: `[公网]${ce.name}期末测试`, startTime, endTime,
      allowResubmit: ce.name === 'C#',
      questionIds: [ce.qid], classIds: [CID],
    }, Tk);
    expect(r.body.code).toBe(0);
    assignments.push({ assId: r.body.data.id, qid: ce.qid, name: ce.name, allowResubmit: ce.name === 'C#' });
    console.log(`  ✓ ${ce.name} assId=${r.body.data.id} 补交=${ce.name === 'C#'}`);
  }

  // ==== 模拟作答 ====
  console.log('\n══════ 模拟作答 ══════');
  r = await api(page, 'GET', `/teacher/students?schoolId=${SID}&classId=${CID}`, null, Tk);
  const students = r.body.data || [];
  console.log(`  班级${CID}: ${students.length}人`);
  if (!students.length) { console.log('⚠ 无学生'); return; }

  const dists = [{ c: 3, q: 85 }, { c: 5, q: 60 }, { c: 2, q: 30 }];
  for (const { assId, qid, name } of assignments) {
    const qr = await api(page, 'GET', `/teacher/questions/${qid}?schoolId=${SID}`, null, Tk);
    const sqs = qr.body.data?.subQuestions || [];
    const lang = name.toLowerCase().includes('java') ? 'java' : name.toLowerCase().includes('c#') ? 'csharp' : 'python';
    let si = 0, ok = 0;
    for (const d of dists) {
      for (let b = 0; b < d.c; b++) {
        const st = students[si++]; if (!st) break;
        for (const sq of sqs) {
          const ans = sq.type === 'objective'
            ? JSON.stringify((sq.objectiveItems || []).map(it => ({ key: it.key, answer: simObj(it, d.q) })))
            : simCode(lang, d.q);
          if (ans && ans !== '[]') {
            r = await api(page, 'POST', `/student/assignments/${assId}/submit`, { questionId: qid, subQuestionId: sq.id, answer: ans }, Sk);
            if (r.body.code === 0) ok++;
          }
        }
      }
    }
    console.log(`  ✓ ${name}: ${si}人 ${ok}条`);
  }

  // ==== 等待评分 ====
  console.log('\n══════ 等待评分 (90s) ══════');
  const monAssId = assignments[0].assId;
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(2000);
    r = await api(page, 'GET', `/teacher/review-class/${CID}?assignmentId=${monAssId}&pageSize=20`, null, Tk);
    const list = r.body.data?.list || [];
    const graded = list.filter(s => s.status === 'ai_graded' || s.status === 'reviewed').length;
    const pending = list.filter(s => s.status === 'submitted').length;
    if (i % 5 === 0 && (graded + pending > 0)) console.log(`  [${(45 - i) * 2}s]评${graded}/${graded + pending}`);
    if (graded > 0 && pending === 0) { console.log(`  ✓ 全部评完`); break; }
    if (i === 44) console.log(`  ⚠ 部分未评完 评${graded}待评${pending}`);
  }

  // ==== 汇总 ====
  console.log('\n══════ 评分汇总 ══════');
  for (const { assId, name } of assignments) {
    r = await api(page, 'GET', `/teacher/review-class/${CID}?assignmentId=${assId}&pageSize=20`, null, Tk);
    const list = r.body.data?.list || [];
    const sc = list.filter(s => s.aiScore != null).map(s => s.aiScore);
    if (sc.length) console.log(`  ${name}: 均${(sc.reduce((a,b)=>a+b,0)/sc.length).toFixed(1)} min${Math.min(...sc)} max${Math.max(...sc)} (${sc.length}人)`);
  }

  // ==== 导出 ====
  console.log('\n══════ 导出 ══════');
  for (const { assId, name } of assignments) {
    r = await api(page, 'GET', `/teacher/export-review?classId=${CID}&assignmentId=${assId}`, null, Tk);
    const hc = r.body.data?.headerCells || [];
    console.log(`  ${name}: ${r.status === 200 ? '✓' : '✗'} ${r.body.data?.rows?.length || 0}行 ${hc.length}列 首列="${hc[0]?.label?.slice(0,30)||''}"`);
  }

  console.log('\n✅ 公网全流程测试完成');
}, 600000);
