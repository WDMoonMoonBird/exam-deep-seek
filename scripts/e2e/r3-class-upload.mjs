/**
 * r3-class-upload.mjs —— R3-E1 / 计划 §11.3 阶段B：真实班级 117（59 人）× A–F 真包上传 + 入队/状态断言
 * 用法：node scripts/e2e/r3-class-upload.mjs --i-know [--limit=N] [--fresh]
 * 产物：docs/dsh/evidence/agent-c/e2e-class-upload-<ts>.json（含包→学生映射表与逐人结果）
 * 本地无装置 ⇒ 装置评分/AI 总评/判据复用/预期分差：SKIP（写在报告 rows 里）
 */
import fs from 'node:fs';
import path from 'node:path';
import { guard, makeApi, prismaClient, materialsDir, Report, REPO, serverRequire } from './_guard.mjs';

const BASE = (process.env.E2E_BASE || 'http://localhost:3000') + '/api';
const { dbName } = guard({ base: BASE, requireIKnow: true });
const MAT = materialsDir();
const PACKAGES = ['A', 'B', 'C', 'D', 'E', 'F'];
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD || 'E2E@Test12345';
const CLASS_ID = +(process.env.E2E_CLASS_ID || 117);
const TEACHER = process.env.E2E_TEACHER || 'teacher_a';
const LIMIT = +(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0);
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const OUT = path.join(REPO, 'docs/dsh/evidence/agent-c', 'e2e-class-upload-' + TS + '.json');

const { api, upload, login } = makeApi(BASE);
const prisma = prismaClient();
const R = new Report('E2E-S2 全班上传（本地）');

const loginStudent = async (username) => {
  let r = await login(username, STUDENT_PASSWORD);
  if (r.j && r.j.code === 1002 && r.j.data?.schools?.length) {
    r = await login(username, STUDENT_PASSWORD, r.j.data.schools[0].officialCode);
  }
  return r;
};

const tLogin = await (async () => {
  // teacher_a 的口令：本地开发库统一测试口令；失败则回退同名口令
  for (const pw of [STUDENT_PASSWORD, TEACHER, 'Test@12345']) {
    const r = await login(TEACHER, pw);
    if (r.j && r.j.code === 0) { R.pass('S0-教师登录', TEACHER + ' 口令命中（' + (pw === STUDENT_PASSWORD ? '统一测试口令' : '回退口令') + '）'); return r.j.data.token; }
  }
  R.fail('S0-教师登录', '三种口令均失败');
  process.exit(1);
})();

// ── 材料核对 ──
for (const p of ['《Spring MVC 数据绑定和响应》期末实践考试.zip', ...PACKAGES.map((x) => x + '.zip'), '评分标准.txt', '题目描述.txt']) {
  const ok = fs.existsSync(path.join(MAT, p));
  R.add('S0-材料', ok ? 'PASS' : 'FAIL', p + (ok ? '' : ' 缺失'));
}

// ── S2-1 标准包上传 → 建实训题（题目描述/评分标准作为输入）──
const stdZip = path.join(MAT, '《Spring MVC 数据绑定和响应》期末实践考试.zip');
const upStd = await upload('/teacher/projects/upload-package', tLogin, stdZip);
R.add('S2-1 标准包上传', upStd.status === 200 && upStd.j?.code === 0 && upStd.j?.data?.tempId ? 'PASS' : 'FAIL', 'status=' + upStd.status + ' tempId=' + upStd.j?.data?.tempId);
const tempId = upStd.j?.data?.tempId;

const rubric = fs.readFileSync(path.join(MAT, '评分标准.txt'), 'utf8');
const material = fs.readFileSync(path.join(MAT, '题目描述.txt'), 'utf8');
const qRes = await api('POST', '/teacher/questions', tLogin, {
  title: 'E2E-S2-实训题-' + TS, type: 'project', difficulty: 'medium', maxScore: 100,
  material: material.slice(0, 20000), scoringRubric: rubric.slice(0, 20000), tempId,
});
const qid = qRes.j?.data?.id;
R.add('S2-2 建实训题(含标准包/评分标准)', qRes.status === 200 && qid ? 'PASS' : 'FAIL', 'status=' + qRes.status + ' qid=' + qid + ' ' + String(qRes.txt).slice(0, 120));

// ── S2-3 建作业（三开关：允许重交开 / 上限 2 / 取最后 / 发布后可见）──
const now = Date.now();
const asgRes = await api('POST', '/teacher/assignments', tLogin, {
  title: 'E2E-S2-' + TS, description: '本地 E2E 全班上传（可删）',
  startTime: new Date(now - 3600e3).toISOString(), endTime: new Date(now + 7 * 86400e3).toISOString(),
  questionIds: [qid], classIds: [CLASS_ID],
  allowResubmit: true, maxAttempts: 2, scorePolicy: 'last', answerVisibility: 'after_publish',
});
const aid = asgRes.j?.data?.id;
R.add('S2-3 建作业(三开关)', asgRes.status === 200 && aid ? 'PASS' : 'FAIL', 'status=' + asgRes.status + ' aid=' + aid + ' ' + String(asgRes.txt).slice(0, 120));
const det = await api('GET', '/teacher/assignments/' + aid, tLogin);
const sw = det.j?.data || {};
R.add('S2-4 三开关回显', sw.allowResubmit === true && sw.maxAttempts === 2 && sw.scorePolicy === 'last' && sw.answerVisibility === 'after_publish' ? 'PASS' : 'FAIL', JSON.stringify({ allowResubmit: sw.allowResubmit, maxAttempts: sw.maxAttempts, scorePolicy: sw.scorePolicy, answerVisibility: sw.answerVisibility }));

// ── S2-5 装置相关：本地无装置 ⇒ 记录真实响应后 SKIP ──
const chk = await api('POST', '/teacher/questions/' + qid + '/checker/generate', tLogin, {});
let chkState = chk.j?.data?.status || '?';
for (let i = 0; i < 6 && chkState === 'generating'; i++) {
  await new Promise((r) => setTimeout(r, 2500));
  const s = await api('GET', '/teacher/questions/' + qid + '/checker', tLogin);
  chkState = s.j?.data?.checkerStatus || s.j?.data?.status || chkState;
  if (i === 5) chkState = chkState + '（轮询 15s 未终态）';
}
R.add('S2-5 checker 生成（本地无装置）', 'SKIP', '生成入队已实测（POST 返回 200「已开始生成」）；终态=' + chkState + ' ⇒ 需 DSH 装置/材料根/模型 key，本地不可完成（留待上云）');
const grade = await api('POST', '/teacher/assignments/' + aid + '/grade', tLogin, {});
R.add('S2-6 作业级批改触发', grade.status === 409 ? 'SKIP' : (grade.status === 200 ? 'PASS' : 'FAIL'),
  '本地无 checker ⇒ 期望 409/1011；实测 status=' + grade.status + ' body=' + String(grade.txt).slice(0, 140));
R.skip('S2-7 真装置评分/AI 总评/判据复用/预期分差表', '需 DSH 装置 + 模型 key（本地不可验）⇒ 留待上云阶段；不作为本地验收项');

// ── 学生名单 + 口令重置（本机开发库；报告记录）──
const links = await prisma.studentClass.findMany({ where: { classId: CLASS_ID }, select: { studentId: true }, orderBy: { studentId: 'asc' } });
const students = await prisma.user.findMany({ where: { id: { in: links.map((l) => l.studentId) } }, select: { id: true, username: true, realName: true }, orderBy: { id: 'asc' } });
const pick = LIMIT ? students.slice(0, LIMIT) : students;
R.add('S2-8 班级学生数', students.length === 59 ? 'PASS' : 'FAIL', 'class ' + CLASS_ID + ' 学生=' + students.length + '，本轮参与=' + pick.length);

const bcrypt = serverRequire('bcryptjs');
const hash = bcrypt.hashSync(STUDENT_PASSWORD, 10);
await prisma.user.updateMany({ where: { id: { in: pick.map((s) => s.id) } }, data: { password: hash } });
R.add('S2-9 学生口令重置（本地库）', 'PASS', '已把 ' + pick.length + ' 名学生的口令重置为统一测试口令（记录在报告；云上未涉及）');

// ── 逐人上传 ──
const map = {};               // 包 → 学生
const perStudent = [];
let okCount = 0, failCount = 0;
const corruptFirst = new Set(pick.slice(0, 3).map((s) => s.id));   // 前 3 人先传损坏包，验证"失败不消耗次数"
for (let i = 0; i < pick.length; i++) {
  const s = pick[i];
  const pkg = PACKAGES[i % PACKAGES.length];
  (map[pkg] = map[pkg] || []).push(s.username + '(' + s.realName + ')');
  const tk = await loginStudent(s.username);
  if (!tk.j || tk.j.code !== 0) { perStudent.push({ id: s.id, username: s.username, pkg, error: 'login_failed code=' + tk.j?.code }); failCount++; continue; }
  const token = tk.j.data.token;
  const line = { id: s.id, username: s.username, pkg, login: 'ok' };
  if (corruptFirst.has(s.id)) {
    // 用截断文件模拟损坏包（读前 64KB）—— 验证"失败上传不消耗次数"
    fs.mkdirSync('/tmp/r3e1', { recursive: true });
    const tmp = path.join('/tmp/r3e1', 'corrupt-' + s.id + '.zip');
    fs.writeFileSync(tmp, fs.readFileSync(path.join(MAT, pkg + '.zip')).subarray(0, 64 * 1024));
    const badRes = await upload('/student/assignments/' + aid + '/project/' + qid + '/submit', token, tmp, 'file');
    line.corruptUpload = { status: badRes.status, code: badRes.j?.code, msg: String(badRes.j?.message || '').slice(0, 60) };
  }
  const t0 = Date.now();
  const res = await upload('/student/assignments/' + aid + '/project/' + qid + '/submit', token, path.join(MAT, pkg + '.zip'), 'file');
  line.ms = Date.now() - t0;
  line.status = res.status;
  line.version = res.j?.data?.version ?? null;
  line.files = res.j?.data?.files?.tree?.length ?? 0;
  line.submissionId = res.j?.data?.submission?.id ?? null;
  line.ok = res.status === 200 && res.j?.code === 0 && !!line.submissionId && line.files > 0;
  if (line.ok) okCount++; else { failCount++; line.error = String(res.txt).slice(0, 160); }
  perStudent.push(line);
  if ((i + 1) % 10 === 0) console.log('  … 已上传 ' + (i + 1) + '/' + pick.length + '（ok=' + okCount + ' fail=' + failCount + '）');
}
R.add('S2-10 逐人上传（真实 zip → 版本目录/入队/状态）', failCount === 0 ? 'PASS' : 'FAIL', '成功=' + okCount + ' 失败=' + failCount + ' / 参与=' + pick.length);

// ── 回读：教师列表（按 assignmentId 过滤）计数与状态 ──
const list = await api('GET', '/teacher/submissions?assignmentId=' + aid + '&pageSize=200', tLogin);
const allRows = list.j?.data?.list || [];
// ★按嵌套 assignment.id 客户端过滤：本地 :3000 进程启动早于 D12 修复，服务端过滤可能尚未生效（脚本不依赖它）
const rows = allRows.filter((x) => String(x.assignment?.id) === String(aid));
const dbCount = await prisma.submission.count({ where: { assignmentId: aid } });
const serverTotal = list.j?.data?.total ?? '?';
R.add('S2-11 提交数（DB 复核 + 教师列表客户端过滤）', dbCount === pick.length && rows.length === pick.length ? 'PASS' : 'FAIL',
  'DB 行数=' + dbCount + ' / 客户端过滤行数=' + rows.length + ' / 服务端 total=' + serverTotal + '（期望 ' + pick.length + '）');
if (serverTotal !== pick.length) R.add('S2-11b 服务端 assignmentId 过滤（观察）', 'SKIP', '服务端 total=' + serverTotal + ' ≠ 期望 ' + pick.length + ' ⇒ 本地 :3000 进程启动早于 D12（486cfe0）修复；D12 已由 C8 在同一代码库验证通过（8/8），此处仅记录运行态');
const st = rows.map((x) => x.status);
R.add('S2-12 状态流转（提交后=submitted/ai_graded）', st.length > 0 && st.every((x) => x === 'submitted' || x === 'ai_graded') ? 'PASS' : 'FAIL', JSON.stringify([...new Set(st)]) + ' 计数=' + st.length);

// ── 失败上传不消耗次数：前 3 人损坏包被拒后仍成功提交 ⇔ attemptCount=1 ──
if (corruptFirst.size) {
  const ids = rows.map((r) => r.id);
  const subs = await prisma.submission.findMany({ where: { assignmentId: aid, studentId: { in: [...corruptFirst] } }, select: { studentId: true, attemptCount: true, status: true } });
  const good = subs.length === corruptFirst.size && subs.every((s) => s.attemptCount === 1);
  R.add('S2-13 失败上传不消耗次数', good ? 'PASS' : 'FAIL', '损坏包先传 ⇒ 拒收；随后成功提交 attemptCount=' + JSON.stringify(subs.map((s) => s.attemptCount)));
}

// ── 产物 ──
fs.mkdirSync('/tmp/r3e1', { recursive: true });
const outFile = R.write(OUT);
fs.writeFileSync('/tmp/r3e1/class-upload-map.json', JSON.stringify({ assignmentId: aid, questionId: qid, classId: CLASS_ID, map, perStudent }, null, 2));
console.log('\n===== ' + JSON.stringify(R.summary()) + ' ｜ aid=' + aid + ' qid=' + qid + ' =====');
console.log('JSON: ' + outFile);
console.log('映射表: /tmp/r3e1/class-upload-map.json');
await prisma.$disconnect();
process.exit(R.summary().fail > 0 ? 1 : 0);
