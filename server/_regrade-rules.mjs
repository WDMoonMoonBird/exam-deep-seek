import prisma from './src/utils/prisma.js';
import { parseProjectAnswer, serializeProjectAnswer } from './src/domain/services/project-view.js';
import { enqueueProjectGrade, refreshConcurrency } from './src/services/projectGrading.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) 清理孤儿 pending
const subs = await prisma.submission.findMany({ where: { assignmentId: 311 }, select: { id: true, status: true, answer: true, student: { select: { username: true } } }, orderBy: { student: { username: 'asc' } } });
console.log('提交数:', subs.length);
for (const sub of subs) {
  const env = parseProjectAnswer(sub.answer);
  if (env.grading?.state === 'pending') {
    env.grading = { state: 'failed', version: env.currentVersion, startedAt: null, finishedAt: null, error: '孤儿清理', prevStatus: null };
    await prisma.submission.update({ where: { id: sub.id }, data: { answer: serializeProjectAnswer(env) } });
  }
}
console.log('孤儿清理完成');

// 2) 刷新并发（管理端 ai_concurrency=64）
await refreshConcurrency();
console.log('并发已刷新');

// 3) 全部入队
for (const sub of subs) {
  const env = parseProjectAnswer(sub.answer);
  env.grading = { state: 'pending', version: env.currentVersion, startedAt: null, finishedAt: null, error: null, prevStatus: sub.status };
  await prisma.submission.update({ where: { id: sub.id }, data: { aiScore: null, aiFeedback: null, answer: serializeProjectAnswer(env) } });
  enqueueProjectGrade(sub.id);
}
console.log('59 个已入队（规则驱动 + 并发 64）');

// 4) 轮询等待全部完成（进程保持存活）
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 20 * 60 * 1000) {
  const rows = await prisma.submission.findMany({ where: { assignmentId: 311 }, select: { aiScore: true, answer: true, aiFeedback: true, student: { select: { username: true } } } });
  let done = 0, failed = 0, pending = 0;
  for (const s of rows) {
    let st = 'none';
    try { const env = JSON.parse(s.answer); st = env.grading?.state || 'none'; } catch {}
    if (st === 'done') done++; else if (st === 'failed') failed++; else pending++;
  }
  const summary = done + '/59 完成 | 失败:' + failed + ' | 排队:' + pending + ' | ' + Math.round((Date.now() - t0) / 1000) + 's';
  if (summary !== last) { console.log('[' + new Date().toLocaleTimeString() + ']', summary); last = summary; }
  if (pending === 0 && done + failed === 59) {
    console.log('==== 全部落定 ====');
    // 按包分组汇总（学号序 i%3）
    const ZIPS = ['1.zip', '2.zip', '3.zip'];
    const groups = { '1.zip': [], '2.zip': [], '3.zip': [] };
    rows.forEach((s, i) => { groups[ZIPS[i % 3]].push(s.aiScore); });
    for (const z of ZIPS) {
      const sc = groups[z].filter(x => x !== null && x !== undefined);
      if (sc.length) console.log(z + ':', '平均', (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1), '范围', Math.min(...sc), '~', Math.max(...sc), '| 分布:', JSON.stringify(sc.sort((a, b) => a - b)));
    }
    // 同代码一致性：李芳02 vs 谢娜23
    const lf = rows.find(s => s.student.username === '202600002');
    const xn = rows.find(s => s.student.username === '202600023');
    console.log('同代码对比: 李芳02=' + lf?.aiScore + ' 谢娜23=' + xn?.aiScore + (lf?.aiScore === xn?.aiScore ? ' ✅ 一致' : ' ❌ 不一致'));
    process.exit(0);
  }
  await sleep(10000);
}
console.log('超时');
process.exit(1);