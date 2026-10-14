/**
 * r3-local-cleanup.mjs —— R3-E1：本地 dev 库 E2E-* 作业/题目 + 磁盘版本目录清理（默认 dry-run）
 * 用法：node scripts/e2e/r3-local-cleanup.mjs [--execute] [--i-know]
 * 口径：按 title LIKE 'E2E-%' + 计划 §13.3 的显式 id 清单精确删除；删除后检索必须命中 0；云上零涉及
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { guard, prismaClient, REPO } from './_guard.mjs';

const BASE = (process.env.E2E_BASE || 'http://localhost:3000') + '/api';
guard({ base: BASE, requireIKnow: true });
const EXECUTE = process.argv.includes('--execute');
const LEGACY_IDS = [319, 320, 321, 322, 323, 324, 325, 326, 327];   // 计划 §13.3 的历史清单
const prisma = prismaClient();

const asgs = await prisma.assignment.findMany({
  where: { OR: [{ title: { startsWith: 'E2E-' } }, { id: { in: LEGACY_IDS } }] },
  select: { id: true, title: true, teacherId: true, deletedAt: true, assignmentQuestions: { select: { questionId: true } }, _count: { select: { submissions: true } } },
  orderBy: { id: 'asc' },
});
const qids = [...new Set(asgs.flatMap((a) => a.assignmentQuestions.map((q) => q.questionId)))];
console.log('[cleanup] 模式=' + (EXECUTE ? '执行删除' : 'dry-run（只列不删）'));
console.log('[cleanup] 命中作业 ' + asgs.length + ' 条 / 关联题目 ' + qids.length + ' 个');
for (const a of asgs) console.log('  · id=' + a.id + ' ' + a.title + ' 教师=' + a.teacherId + ' 提交=' + a._count.submissions + (a.deletedAt ? '（已软删）' : ''));

const e2eQs = await prisma.question.findMany({ where: { OR: [{ title: { startsWith: 'E2E-' } }, { id: { in: qids } }] }, select: { id: true, title: true, type: true, deletedAt: true }, orderBy: { id: 'asc' } });
console.log('[cleanup] 命中题目 ' + e2eQs.length + ' 个（含 E2E- 前缀与作业关联题）');
for (const q of e2eQs) console.log('  · qid=' + q.id + ' ' + q.title + ' (' + q.type + ')' + (q.deletedAt ? '（已软删）' : ''));

// 磁盘目录
const roots = ['server/uploads/project-submissions', 'server/uploads/project-questions', 'server/uploads/projects'];
const disks = [];
for (const r of roots) { const abs = path.join(REPO, r); if (fs.existsSync(abs)) { for (const d of fs.readdirSync(abs)) { if (qids.includes(+d)) { const p = path.join(abs, d); const sz = fs.existsSync(p) ? execSync('du -sh "' + p + '"').toString().split('\t')[0] : '?'; disks.push({ root: r, dir: d, path: p, size: sz }); } } } }
console.log('[cleanup] 关联磁盘目录 ' + disks.length + ' 个：' + JSON.stringify(disks.map((d) => d.dir + '(' + d.size + ')')));

if (!EXECUTE) {
  console.log('\n[cleanup] dry-run 结束：未删除任何数据。执行删除请加 --execute（会先打印再删，并做 0 命中校验）。');
} else {
  const aids = asgs.map((a) => a.id);
  const subs = await prisma.submission.deleteMany({ where: { assignmentId: { in: aids } } });
  await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: aids } } });
  await prisma.assignmentClass.deleteMany({ where: { assignmentId: { in: aids } } });
  const dasg = await prisma.assignment.deleteMany({ where: { id: { in: aids } } });
  const dsub = await prisma.subQuestion.deleteMany({ where: { questionId: { in: e2eQs.map((q) => q.id) } } });
  const dq = await prisma.question.deleteMany({ where: { id: { in: e2eQs.map((q) => q.id) } } });
  let removedDirs = 0;
  for (const d of disks) { fs.rmSync(d.path, { recursive: true, force: true }); removedDirs++; }
  const left = await prisma.assignment.count({ where: { OR: [{ title: { startsWith: 'E2E-' } }, { id: { in: LEGACY_IDS } }] } });
  const leftQ = await prisma.question.count({ where: { title: { startsWith: 'E2E-' } } });
  console.log('[cleanup] 已删除：submissions=' + subs.count + ' assignments=' + dasg.count + ' subQuestions=' + dsub.count + ' questions=' + dq.count + ' 磁盘目录=' + removedDirs);
  console.log('[cleanup] 复核：剩余 E2E- 作业=' + left + ' 剩余 E2E- 题目=' + leftQ + (left === 0 && leftQ === 0 ? ' ⇒ 0 命中 ✓' : ' ⇒ 仍有残留 ✗'));
}
await prisma.$disconnect();
