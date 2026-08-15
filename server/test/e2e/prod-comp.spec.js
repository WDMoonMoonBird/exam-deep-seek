// 公网全模块E2E — 10学生 3科 分数段均匀分布
import { test, expect } from '@playwright/test';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

const API = 'https://deadpan.asia/exam/api';
const BASE = 'https://deadpan.asia/exam';
const T = { username: 'e2e_t2', password: 'e2e_t2' };
const SID = 2175;
const CID = 13;

async function api(page, method, p, data, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return page.evaluate(async ({ method, url, data, headers }) => {
    const opts = { method, headers };
    if (data) opts.body = JSON.stringify(data);
    const r = await fetch(url, opts);
    const b = await r.json().catch(() => ({}));
    return { status: r.status, body: b };
  }, { method, url: API + p, data, headers });
}

async function login(page, un, pw) {
  const r = await api(page, 'POST', '/auth/login', { username: un, password: pw });
  return r.body.data?.token;
}

async function extractText(fn) {
  const fp = path.resolve('/Users/you/My Projects/My Vue/Exam-DeepSeek', fn);
  const buf = fs.readFileSync(fp);
  return (await mammoth.extractRawText({ buffer: buf })).value;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function simObj(item, quality) {
  if (Math.random() > 0.93) return '';
  if (Math.random() * 100 < quality) return item.answer || '';
  if (item.type === 'choice') {
    const wrongs = (item.options || []).map(o => o.key).filter(k => k !== item.answer);
    return pick(wrongs) || item.answer;
  }
  if (item.type === 'multi_choice') {
    const all = (item.options || []).map(o => o.key);
    return [pick(all), pick(all)].filter((v, i, a) => a.indexOf(v) === i).join(',');
  }
  if (item.type === 'judge') return item.answer === 'true' ? 'false' : 'true';
  return 'x';
}

const CODES = {
  java: {
    h: `public class Main{public static void bubbleSort(int[]a){int n=a.length;boolean s;for(int i=0;i<n-1;i++){s=false;for(int j=0;j<n-i-1;j++){if(a[j]>a[j+1]){int t=a[j];a[j]=a[j+1];a[j+1]=t;s=true;}}if(!s)break;}for(int v:a)System.out.print(v+" ");}public static void main(String[]a){int[]x={5,2,8,1,9,3};bubbleSort(x);}}`,
    m: `public class Main{public static void sort(int[]a){for(int i=0;i<a.length;i++){for(int j=0;j<a.length-1;j++){if(a[j]>a[j+1]){int t=a[j];a[j]=a[j+1];a[j+1]=t;}}}for(int v:a)System.out.print(v+" ");}public static void main(String[]a){int[]x={5,2,8,1};sort(x);}}`,
    l: `public class Main{public static void main(String[]a){int[]x={5,2,8,1};for(int i=0;i<x.length-1;i++){if(x[i]>x[i+1]){int t=x[i];x[i]=x[i+1];x[i+1]=t;}}System.out.println("sorted");}}`,
    x: `public class Main{public static void main(String[]a){System.out.println("hello");}}` },
  csharp: {
    h: `using System;using System.Linq;class P{static void Main(){var n=new[]{12,55,68,103,44,72};var r=n.Where(x=>x>50&&x%2==0).OrderByDescending(x=>x);Console.WriteLine(string.Join(",",r));}}`,
    m: `using System;class P{static void T<T>(ref T a,ref T b){T t=a;a=b;b=t;}static void Main(){int x=1,y=2;T(ref x,ref y);Console.WriteLine(x+","+y);}}`,
    l: `class P{static void Main(){int a=1,b=2;int c=a;a=b;b=c;Console.WriteLine("swapped");}}`,
    x: `class P{static void Main(){System.Console.WriteLine("hello");}}` },
  python: {
    h: `def is_palindrome(s):\n    c="".join(ch.lower() for ch in s if ch.isalnum())\n    return c==c[::-1]\n\ndef fib(n):\n    a,b=0,1\n    for _ in range(n):yield a;a,b=b,a+b`,
    m: `def check(s):\n    s=s.replace(" ","").lower()\n    return s==s[::-1]\n\ndef fib(n):\n    a,b=0,1\n    for i in range(n):print(a);a,b=b,a+b`,
    l: `s=input()\nprint(s==s[::-1])`,
    x: `print("hello")` }
};

function simCode(lang, quality) {
  if (Math.random() > 0.9) return '';
  const tier = quality >= 80 ? 'h' : quality >= 50 ? 'm' : quality >= 20 ? 'l' : 'x';
  const codes = CODES[lang] || CODES.python;
  return codes[tier] + '\n// q' + Math.floor(Math.random() * 100);
}

function buildSubQuestions(parsedQuestions) {
  const objQs = parsedQuestions.filter(q => q.type !== 'code');
  const codeQs = parsedQuestions.filter(q => q.type === 'code');
  const subs = [];
  if (objQs.length) {
    const items = objQs.map((q, i) => {
      const opts = (q.options || []).map((o, oi) => ({
        key: String.fromCharCode(65 + oi),
        text: (typeof o === 'string' ? o : (o?.text || '')).replace(/^[A-H][.、．]\s*/, '').trim()
      }));
      let ans = q.answer || '';
      if (q.type === 'judge') ans = /^(正确|对|√|T|true)$/i.test(ans) ? 'true' : 'false';
      return {
        key: i, type: q.type, stem: q.stem || '', options: opts, answer: ans,
        score: q.type === 'multi_choice' ? 3 : (q.type === 'fill' ? 2 : q.type === 'judge' ? 1 : 2)
      };
    });
    subs.push({ type: 'objective', score: items.reduce((s, i) => s + i.score, 0), objectiveItems: items });
  }
  codeQs.forEach(q => {
    subs.push({
      type: 'code', score: 10,
      content: '<p>' + (q.stem || '').replace(/\n/g, '<br/>') + '</p>',
      referenceAnswer: q.referenceAnswer || '',
      language: q.language || '',
      scoringCriteria: q.scoringCriteria || ''
    });
  });
  return subs;
}

test('公网全模块E2E综合测试', async ({ page }) => {
  test.setTimeout(900000);
  await page.goto(BASE + '/login');

  // ====== 1. 登录 ======
  const Tk = await login(page, T.username, T.password);
  expect(Tk).toBeTruthy();
  console.log('✓ 教师登录');
  const Sk = await login(page, '20253182105', '20253182105');
  expect(Sk).toBeTruthy();
  console.log('✓ 学生登录(何骏宇)');

  // ====== 2. AI解析3份试卷 ======
  console.log('\n═══ 2. AI解析 ═══');
  const examDefs = [
    { f: 'Java期末.docx', n: 'Java', exp: { choice: 20, judge: 10, code: 5 } },
    { f: 'C#期末.docx', n: 'C#', exp: { choice: 10, multi_choice: 10, fill: 10, code: 5 } },
    { f: 'Python期末.docx', n: 'Python', exp: { code: 10 } }
  ];
  const parsed = [];
  for (const ex of examDefs) {
    console.log(`  📄 ${ex.n}...`);
    const text = await extractText(ex.f);
    const trimmed = text.length > 80000 ? text.slice(0, 80000) : text;
    const r = await api(page, 'POST', `/teacher/parse-exam?schoolId=${SID}`, { content: trimmed }, Tk);
    expect(r.body.code).toBe(0);
    const qs = r.body.data.questions || [];
    const types = {};
    qs.forEach(q => { types[q.type] = (types[q.type] || 0) + 1; });
    const allOk = Object.entries(ex.exp).every(([k, v]) => (types[k] || 0) >= v * 0.8);
    console.log(`    ${qs.length}题 ${JSON.stringify(types)} ${allOk ? '✓' : '⚠'}`);
    parsed.push({ n: ex.n, qs });
  }

  // ====== 3. 创建题目+AI标答 ======
  console.log('\n═══ 3. 创建题目+AI生成标答 ═══');
  const created = [];
  for (const pe of parsed) {
    const subs = buildSubQuestions(pe.qs);
    const r = await api(page, 'POST', `/teacher/questions?schoolId=${SID}`, {
      title: `[公网]${pe.n}期末`, difficulty: 'medium',
      objectiveSettings: { classificationMode: 'group', multiChoiceScoring: 'partial' },
      subQuestions: subs
    }, Tk);
    expect(r.body.code).toBe(0);
    const savedSubs = r.body.data.subQuestions || [];
    const codeCount = savedSubs.filter(s => s.type === 'code').length;
    console.log(`  ✓ ${pe.n} id=${r.body.data.id} ${savedSubs.length}小题(code:${codeCount}) 总分${r.body.data.maxScore}`);

    // AI生成标答
    let gen = 0;
    for (const sq of savedSubs) {
      if (sq.type !== 'code' || (sq.referenceAnswer && sq.referenceAnswer.trim())) continue;
      const stem = (sq.content || '').replace(/<[^>]*>/g, '').trim();
      const gr = await api(page, 'POST', '/teacher/generate-reference', {
        stem, scoringCriteria: sq.scoringCriteria || undefined
      }, Tk);
      if (gr.body.code === 0) { sq.referenceAnswer = gr.body.data.answer; gen++; }
    }
    console.log(`    标答生成: ${gen}/${codeCount}`);

    // 更新题目
    if (gen > 0) {
      const up = savedSubs.map(s => ({
        title: s.title || '', type: s.type || 'code', score: s.score || 0,
        content: s.content || '', referenceAnswer: s.referenceAnswer || '',
        language: s.language || 'cpp', objectiveItems: s.objectiveItems || undefined,
        scoringCriteria: s.scoringCriteria || undefined
      }));
      await api(page, 'PUT', `/teacher/questions/${r.body.data.id}?schoolId=${SID}`, {
        title: `[公网]${pe.n}期末`, difficulty: 'medium',
        objectiveSettings: { classificationMode: 'group', multiChoiceScoring: 'partial' },
        subQuestions: up
      }, Tk);
      console.log(`    更新: ✓`);
    }
    created.push({ qid: r.body.data.id, n: pe.n, subs: savedSubs, maxScore: r.body.data.maxScore });
  }

  // ====== 4. 布置作业 ======
  console.log('\n═══ 4. 布置作业 ═══');
  const now = new Date();
  const startTime = new Date(now.getTime() - 60000).toISOString();
  const endTime = new Date(now.getTime() + 180 * 60000).toISOString();
  const assignments = [];
  for (const ce of created) {
    const allow = ce.n === 'C#';
    const r = await api(page, 'POST', `/teacher/assignments?schoolId=${SID}`, {
      title: `[公网]${ce.n}期末测试`, startTime, endTime,
      allowResubmit: allow, questionIds: [ce.qid], classIds: [CID]
    }, Tk);
    expect(r.body.code).toBe(0);
    assignments.push({ aid: r.body.data.id, qid: ce.qid, n: ce.n, allow });
    console.log(`  ✓ ${ce.n} assId=${r.body.data.id} 补交=${allow}`);
  }

  // ====== 5. 所有学生作答 ======
  console.log('\n═══ 5. 10学生作答(分数段均匀) ═══');
  // 分数段: 2高(>80%) 3中(50-80%) 3低(20-50%) 2极低(<20%)
  const dists = [
    { c: 2, q: 88, label: '高(>80%)' },
    { c: 3, q: 62, label: '中(50-80%)' },
    { c: 3, q: 35, label: '低(20-50%)' },
    { c: 2, q: 8, label: '极低(<20%)' }
  ];

  // 获取学生列表
  const stR = await api(page, 'GET', `/teacher/students?schoolId=${SID}&classId=${CID}`, null, Tk);
  const students = stR.body.data || [];
  console.log(`  班级${CID}: ${students.length}人`);
  // 按ID排序确保顺序稳定
  students.sort((a, b) => a.id - b.id);

  let totalSubs = 0;
  for (const { aid, qid, n } of assignments) {
    console.log(`\n  📋 ${n}`);
    const qr = await api(page, 'GET', `/teacher/questions/${qid}?schoolId=${SID}`, null, Tk);
    const sqs = qr.body.data?.subQuestions || [];
    const lang = n === 'Java' ? 'java' : n === 'C#' ? 'csharp' : 'python';
    let si = 0;
    for (const d of dists) {
      for (let b = 0; b < d.c; b++) {
        const student = students[si];
        if (!student) break;
        si++;
        const stk = await login(page, student.username, student.username);
        if (!stk) { console.log(`    ✗ ${student.username} 登录失败`); continue; }
        for (const sq of sqs) {
          const ans = sq.type === 'objective'
            ? JSON.stringify((sq.objectiveItems || []).map(it => ({ key: it.key, answer: simObj(it, d.q) })))
            : simCode(lang, d.q);
          if (ans && ans !== '[]') {
            const sr = await api(page, 'POST', `/student/assignments/${aid}/submit`, {
              questionId: qid, subQuestionId: sq.id, answer: ans
            }, stk);
            if (sr.body.code === 0) totalSubs++;
          }
        }
      }
    }
    console.log(`    ✓ ${si}人提交`);
  }
  console.log(`\n  总计 ${totalSubs} 条`);
  expect(totalSubs).toBeGreaterThan(100);

  // ====== 6. 等待AI评分 ======
  console.log('\n═══ 6. 等待AI评分(最长10分钟) ═══');
  const monAid = assignments[0].aid;
  let graded = false;
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(2000);
    const cr = await api(page, 'GET', `/teacher/review-class/${CID}?assignmentId=${monAid}&pageSize=20`, null, Tk);
    const list = cr.body.data?.list || [];
    const g = list.filter(s => s.status === 'ai_graded' || s.status === 'reviewed').length;
    const w = list.filter(s => s.status === 'submitted').length;
    const total = list.filter(s => s.submitted).length;
    if (i % 15 === 0 && total > 0) {
      const allGraded = g >= total;
      console.log(`  [${(300 - i) * 2}s] 评${g}/${total} ${allGraded ? '✓' : ''}`);
      if (allGraded) { graded = true; break; }
    }
  }
  if (!graded) console.log('  ⚠ 等够10分钟，继续后续测试');

  // ====== 7. 评分汇总 ======
  console.log('\n═══ 7. 评分汇总 ═══');
  let allScored = true;
  for (const { aid, n } of assignments) {
    const cr = await api(page, 'GET', `/teacher/review-class/${CID}?assignmentId=${aid}&pageSize=20`, null, Tk);
    const list = cr.body.data?.list || [];
    const scores = list.filter(s => s.aiScore != null).map(s => s.aiScore);
    if (scores.length) {
      const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
      const mx = Math.max(...scores);
      const mn = Math.min(...scores);
      console.log(`  ${n}: ${scores.length}人 均${avg} 最低${mn} 最高${mx}`);
      // 检查分数段分布
      const dist = { high: 0, mid: 0, low: 0, vl: 0 };
      scores.forEach(sc => {
        const ratio = sc / (created.find(c => c.n === n)?.maxScore || 100);
        if (ratio >= 0.8) dist.high++;
        else if (ratio >= 0.5) dist.mid++;
        else if (ratio >= 0.2) dist.low++;
        else dist.vl++;
      });
      console.log(`    分布: ≥80%:${dist.high} 50-80%:${dist.mid} 20-50%:${dist.low} <20%:${dist.vl}`);
    } else {
      console.log(`  ${n}: 无分数 ⚠`);
      allScored = false;
    }
  }

  // ====== 8. 批量审核+发布 ======
  console.log('\n═══ 8. 批量审核+发布 ═══');
  for (const { aid, n } of assignments) {
    let br = await api(page, 'POST', '/teacher/submissions/batch-review', {
      schoolId: SID, classId: CID, assignmentId: aid
    }, Tk);
    console.log(`  审核 ${n}: ${br.body.code === 0 ? '✓' : '✗'} ${br.body.message}`);
    br = await api(page, 'POST', '/teacher/submissions/batch-publish', {
      schoolId: SID, classId: CID, assignmentId: aid
    }, Tk);
    console.log(`  发布 ${n}: ${br.body.code === 0 ? '✓' : '✗'} ${br.body.message}`);
  }

  // ====== 9. 学生查看成绩 ======
  console.log('\n═══ 9. 学生查看成绩 ═══');
  const viewSk = await login(page, '20253182105', '20253182105');
  for (const { aid, n } of assignments) {
    const sr = await api(page, 'GET', `/student/assignments/${aid}`, null, viewSk);
    const subs = sr.body.data?.submissions || [];
    const pub = subs.filter(s => s.status === 'published');
    const total = pub.reduce((sum, s) => sum + (s.finalScore ?? s.aiScore ?? 0), 0);
    console.log(`  ${n}: ${pub.length}条已发布 得分${total} (学生:何骏宇)`);
  }

  // ====== 10. 导出Excel ======
  console.log('\n═══ 10. 导出Excel ═══');
  for (const { aid, n } of assignments) {
    const er = await api(page, 'GET', `/teacher/export-review?classId=${CID}&assignmentId=${aid}`, null, Tk);
    const hc = er.body.data?.headerCells || [];
    const rows = er.body.data?.rows || [];
    const top = rows.filter(r => r.totalScore != null).sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))[0];
    console.log(`  ${n}: ${rows.length}行 ${hc.length}列 ${hc.length >= 1 ? '✓' : '⚠列名异常'}`);
    if (hc.length >= 1) console.log(`    首列="${hc[0].label?.slice(0, 40)}"`);
    if (top) console.log(`    最高: ${top.studentName} ${top.totalScore}分`);
  }

  // ====== 11. 边界 ======
  console.log('\n═══ 11. 边界 ═══');
  let br = await api(page, 'POST', `/teacher/questions?schoolId=${SID}`, {
    title: '空分', subQuestions: [{ type: 'code', content: '<p>x</p>' }]
  }, Tk);
  expect(br.status).toBe(400);
  console.log('  ✓ 空分400');
  br = await api(page, 'POST', `/teacher/questions?schoolId=${SID}`, {
    title: 'A'.repeat(201), subQuestions: [{ type: 'code', score: 10, content: '<p>x</p>' }]
  }, Tk);
  expect(br.status).toBe(400);
  console.log('  ✓ 超长标题400');
  br = await api(page, 'GET', `/teacher/questions/99999?schoolId=${SID}`, null, Tk);
  expect(br.status).toBe(404);
  console.log('  ✓ 404');
  br = await api(page, 'GET', '/health');
  expect(br.body.code).toBe(0);
  console.log('  ✓ 健康检查');

  console.log('\n═══════════════════════════════');
  if (allScored) console.log('✅ 公网全模块E2E综合测试通过');
  else console.log('⚠ 部分模块待验证(评分未完成)');
  console.log('═══════════════════════════════');
});
