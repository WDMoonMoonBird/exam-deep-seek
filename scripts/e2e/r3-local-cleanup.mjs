/**
 * r3-local-cleanup.mjs —— R3-E1/E2：本地 dev 库 E2E-* 作业（含其提交/关联行/题目）与磁盘版本目录清理。
 *
 * ★R3-S1（t26）安全重构（按 E2 复核 §2 的 5 条最小修法）：
 *   ① 范围收敛：作业集合**只**认标题前缀 `E2E-`（删除原 LEGACY_IDS 按 id 选择的通道）；
 *      题目集合 = `title LIKE 'E2E-%'` **且** 无任何非 E2E 作业引用（assignment_questions / submissions 双向查）；
 *   ② 前置断言：执行前做「共享题体检」，命中任一被真实作业引用的题目 ⇒ **立即中止 + 打印命中项 + 零写入**；
 *   ③ 整体回滚：全部 DB 删除包在一个 `prisma.$transaction` 内（先删依赖行：submissions →
 *      assignment_questions → assignment_classes → assignments → sub_questions → questions），
 *      遇 FK RESTRICT 自动整体回滚，不留半清理状态；
 *   ④ 每次执行前**重新计算**计划（不信任任何缓存），dry-run 结果写入文件（默认 /tmp/r3-local-cleanup-dryrun.json）；
 *   ⑤ 默认不可执行：必须同时满足 `--execute` + `--i-know` + 本次计划预检通过，否则非 0 退出且零写入。
 *
 * 用法：node scripts/e2e/r3-local-cleanup.mjs [--execute] [--i-know] [--plan-file=<path>]
 * 退出码：0=dry-run 正常结束（可能带「执行将中止」警示）｜2=守卫拒绝（非 localhost）｜3=前置断言命中/缺确认
 *        ｜4=执行后复核不一致｜5=事务失败（已整体回滚）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { guard, prismaClient, REPO } from './_guard.mjs';

const EXECUTE = process.argv.includes('--execute');
const planFileArg = (process.argv.find((a) => a.startsWith('--plan-file=')) || '').split('=')[1];
const PLAN_FILE = planFileArg || '/tmp/r3-local-cleanup-dryrun.json';
const DISK_ROOTS = ['server/uploads/project-submissions', 'server/uploads/project-questions', 'server/uploads/projects'];
const E2E_PREFIX = 'E2E-';

const BASE = (process.env.E2E_BASE || 'http://localhost:3000') + '/api';
// ⑤：dry-run 只读不需要确认；--execute 必须带 --i-know（缺确认 ⇒ 守卫 exit 2/3，零写入）
const GUARD = guard({ base: BASE, requireIKnow: EXECUTE });
const prisma = prismaClient();

/** 计算计划（纯读；execute 时在事务内以同一函数重算，防计划与执行之间漂移） */
async function computePlan(db) {
  const asgs = await db.assignment.findMany({
    where: { title: { startsWith: E2E_PREFIX } },          // ① 唯一入口：前缀，无 id 通道
    select: { id: true, title: true, teacherId: true, deletedAt: true, _count: { select: { submissions: true } } },
    orderBy: { id: 'asc' },
  });
  const aids = asgs.map((a) => a.id);
  const badTitle = asgs.filter((a) => !a.title.startsWith(E2E_PREFIX));
  const links = aids.length
    ? await db.assignmentQuestion.findMany({ where: { assignmentId: { in: aids } }, select: { questionId: true } })
    : [];
  const derivedQids = [...new Set(links.map((l) => l.questionId))];
  const questions = [];
  for (const qid of derivedQids) {
    const q = await db.question.findUnique({ where: { id: qid }, select: { id: true, title: true, type: true, deletedAt: true } });
    if (!q) { questions.push({ id: qid, title: '(已不存在)', safe: true, reason: '题目行已缺失（无需删除）' }); continue; }
    const extRefs = await db.assignmentQuestion.findMany({
      where: { questionId: qid, assignmentId: { notIn: aids.length ? aids : [-1] } },
      select: { assignmentId: true, assignment: { select: { title: true } } },
    });
    const extSubs = await db.submission.count({ where: { questionId: qid, assignmentId: { notIn: aids.length ? aids : [-1] } } });
    const prefixOk = q.title.startsWith(E2E_PREFIX);
    const sharedOk = extRefs.length === 0 && extSubs === 0;
    questions.push({
      id: q.id, title: q.title, type: q.type, deletedAt: q.deletedAt,
      safe: prefixOk && sharedOk,
      reason: !prefixOk
        ? ('非 E2E 前缀' + (extRefs.length ? '，且被 ' + extRefs.length + ' 个非 E2E 作业引用' : ''))
        : (!sharedOk ? '被非 E2E 作业引用' : ''),
      externalRefs: extRefs.map((r) => ({ assignmentId: r.assignmentId, title: r.assignment?.title || '' })),
      externalSubs: extSubs,
    });
  }
  const deletableQids = questions.filter((q) => q.safe).map((q) => q.id);
  const blockedQids = questions.filter((q) => !q.safe).map((q) => q.id);
  const subs = aids.length ? await db.submission.count({ where: { assignmentId: { in: aids } } }) : 0;
  // 磁盘目录只按「可删题目」键（共享题的目录属于真实作业 ⇒ 绝不触碰）
  const disks = [];
  for (const root of DISK_ROOTS) {
    const abs = path.join(REPO, root);
    if (!fs.existsSync(abs)) continue;
    for (const d of fs.readdirSync(abs)) {
      if (!deletableQids.includes(+d)) continue;
      const p = path.join(abs, d);
      const size = fs.existsSync(p) ? execSync('du -sh ' + JSON.stringify(p)).toString().split('\t')[0] : '?';
      disks.push({ root, dir: d, path: p, size });
    }
  }
  return { asgs, aids, badTitle, questions, deletableQids, blockedQids, subs, disks };
}

function fingerprint(plan, db) {
  return Promise.all(plan.questions.filter((q) => !q.safe).map(async (q) => ({
    id: q.id,
    exists: !!(await db.question.findUnique({ where: { id: q.id }, select: { id: true } })),
    externalRefs: await db.assignmentQuestion.count({ where: { questionId: q.id, assignmentId: { notIn: plan.aids.length ? plan.aids : [-1] } } }),
    externalSubs: await db.submission.count({ where: { questionId: q.id, assignmentId: { notIn: plan.aids.length ? plan.aids : [-1] } } }),
  })));
}

function printPlan(plan) {
  console.log('[cleanup] 模式=' + (EXECUTE ? '执行删除（事务）' : 'dry-run（只列不删）'));
  console.log('[cleanup] ① 命中作业 ' + plan.asgs.length + ' 条（标题前缀 ' + E2E_PREFIX + '）｜其中提交 ' + plan.subs + ' 条');
  for (const a of plan.asgs) console.log('  · aid=' + a.id + ' ' + a.title + ' 教师=' + a.teacherId + ' 提交=' + a._count.submissions + (a.deletedAt ? '（已软删）' : ''));
  console.log('[cleanup] ② 作业关联题目 ' + plan.questions.length + ' 个 ⇒ 可删 ' + plan.deletableQids.length + ' 个：' + JSON.stringify(plan.deletableQids));
  for (const q of plan.questions) {
    if (q.safe) console.log('  · 可删 qid=' + q.id + ' ' + q.title + ' (' + q.type + ')');
    else console.log('  ⛔ 不可删 qid=' + q.id + ' ' + q.title + ' ⚠ ' + q.reason + ' ｜外部引用作业=' + JSON.stringify(q.externalRefs) + ' 外部提交=' + q.externalSubs);
  }
  console.log('[cleanup] ③ 可清理磁盘目录 ' + plan.disks.length + ' 个：' + JSON.stringify(plan.disks.map((d) => d.root.replace('server/uploads/', '') + '/' + d.dir + '(' + d.size + ')')));
  console.log('[cleanup] 预检状态=' + (plan.blockedQids.length === 0 ? '通过（可执行）' : '将中止：命中 ' + plan.blockedQids.length + ' 个被真实作业引用的题目'));
}

async function execute(plan) {
  const aids = plan.aids;
  const fpBefore = await fingerprint(plan, prisma);
  if (aids.length) {
    await prisma.$transaction(async (tx) => {
      // ③④：事务内用同一选择器重算 + 重断言（防「计划后、执行前」的数据漂移）
      const fresh = await computePlan(tx);
      if (fresh.badTitle.length || fresh.blockedQids.length) {
        const err = new Error('PRE_FLIGHT_ABORT');
        err.hits = { badTitle: fresh.badTitle.map((a) => a.id), blockedQids: fresh.blockedQids };
        throw err;
      }
      await tx.submission.deleteMany({ where: { assignmentId: { in: aids } } });
      await tx.assignmentQuestion.deleteMany({ where: { assignmentId: { in: aids } } });
      await tx.assignmentClass.deleteMany({ where: { assignmentId: { in: aids } } });
      const dasg = await tx.assignment.deleteMany({ where: { id: { in: aids } } });
      const dsub = await tx.subQuestion.deleteMany({ where: { questionId: { in: fresh.deletableQids } } });
      const dq = await tx.question.deleteMany({ where: { id: { in: fresh.deletableQids } } });
      plan.stats = { assignments: dasg.count, subQuestions: dsub.count, questions: dq.count };
    }, { timeout: 180000 });
  }
  let removedDirs = 0;
  for (const d of plan.disks) { fs.rmSync(d.path, { recursive: true, force: true }); removedDirs++; }
  const leftA = await prisma.assignment.count({ where: { title: { startsWith: E2E_PREFIX } } });
  const leftQ = await prisma.question.count({ where: { title: { startsWith: E2E_PREFIX } } });
  const fpAfter = await fingerprint(plan, prisma);
  const sameFp = JSON.stringify(fpBefore) === JSON.stringify(fpAfter);
  console.log('[cleanup] 已删除：submissions=' + plan.subs + ' assignments=' + (plan.stats?.assignments ?? 0)
    + ' subQuestions=' + (plan.stats?.subQuestions ?? 0) + ' questions=' + (plan.stats?.questions ?? 0) + ' 磁盘目录=' + removedDirs);
  console.log('[cleanup] 复核：剩余 E2E- 作业=' + leftA + ' 剩余 E2E- 题目=' + leftQ + ' 保护集指纹不变=' + sameFp
    + (leftA === 0 && leftQ === 0 && sameFp ? ' ⇒ 0 命中 ✓' : ' ⇒ 仍有残留 ✗'));
  return leftA === 0 && leftQ === 0 && sameFp;
}

const plan = await computePlan(prisma);
printPlan(plan);
const fp = await fingerprint(plan, prisma);
fs.writeFileSync(PLAN_FILE, JSON.stringify({
  generatedAt: new Date().toISOString(), mode: EXECUTE ? 'execute' : 'dry-run', base: BASE, db: GUARD.dbName, approvedDev: GUARD.approvedDev,
  counts: { assignments: plan.asgs.length, submissions: plan.subs, derivedQuestions: plan.questions.length, deletableQuestions: plan.deletableQids.length, blockedQuestions: plan.blockedQids.length, disks: plan.disks.length },
  assignments: plan.asgs.map((a) => ({ id: a.id, title: a.title, submissions: a._count.submissions })),
  deletableQids: plan.deletableQids,
  blocked: plan.questions.filter((q) => !q.safe),
  disks: plan.disks.map((d) => ({ root: d.root, dir: d.dir, size: d.size })),
  protectedFingerprint: fp,
}, null, 2));
console.log('[cleanup] dry-run 计划已写入 ' + PLAN_FILE + '（每次运行都重新计算，不缓存）');

if (!EXECUTE) {
  console.log('\n[cleanup] dry-run 结束：未删除任何数据。');
  console.log('[cleanup] 执行删除的条件（三者缺一即非 0 退出且零写入）：--execute + --i-know + 预检状态=通过');
  if (plan.blockedQids.length) console.log('[cleanup] ⚠ 当前预检状态=将中止 ⇒ 即便加 --execute --i-know 也会中止并打印命中项（' + JSON.stringify(plan.blockedQids) + '）');
  await prisma.$disconnect();
} else {
  if (plan.blockedQids.length) {
    console.error('[cleanup] ⛔ 前置断言命中：以下题目被非 E2E（真实）作业引用，拒绝执行任何删除');
    for (const q of plan.questions.filter((x) => !x.safe)) console.error('  · qid=' + q.id + ' ' + q.title + ' ⚠ ' + q.reason + ' 引用作业=' + JSON.stringify(q.externalRefs) + ' 外部提交=' + q.externalSubs);
    console.error('[cleanup] 已中止，零写入。请先排除这些题目（例如从作业中解绑/改由人工确认）后重跑。');
    await prisma.$disconnect();
    process.exit(3);
  }
  try {
    const ok = await execute(plan);
    await prisma.$disconnect();
    if (!ok) process.exit(4);
  } catch (err) {
    console.error('[cleanup] ⛔ 执行失败，事务已整体回滚（未留半清理状态）：' + (err?.message || err));
    if (err?.hits) console.error('[cleanup] 事务内前置断言命中：' + JSON.stringify(err.hits));
    await prisma.$disconnect();
    process.exit(err?.message === 'PRE_FLIGHT_ABORT' ? 3 : 5);
  }
}
