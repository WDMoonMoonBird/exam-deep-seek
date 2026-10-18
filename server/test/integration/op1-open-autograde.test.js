/**
 * op1-open-autograde.test.js — OP-1 / C1：开放性实训题（无标准工程包）截止后**自动评价式评分**全链路。
 *
 * 覆盖（真实 DB=exam_system_test + 真实磁盘，仅 AI 出网被 mock）：
 *   ① 分类纯函数：open / standard / skip:standard_snapshot_missing（哨兵 sha256:absent 不得当真实哈希）；
 *   ② deadline scanner：无标准包开放题被选中并建 `__AUTO_OPEN__` job；有标准包+快照题仍建 `__AUTO_BUILD__`
 *      （不误伤）；有标准包无快照题 skip 且不建 job；旧 SQL 默认仍看不到开放题（行为不变）；
 *   ③ 幂等：已建 job 的作业第二次扫描不重复建 job；
 *   ④ materials exporter：开放题导出成功、不报 standard_package_missing、无标准工程包.zip、manifest mode=open；
 *      标准题对照仍写标准 zip 且不标 open；
 *   ⑤ 执行器：只评 status='submitted'、逐份 gradeOne、单份失败继续、标准题误入开放 job 拒评；
 *   ⑥ run-once 早分支：`__AUTO_OPEN__` 在物料/尺子/装置之前短路（无 runRoot/无 checker/无 content_key），
 *      终态映射 done / needs_rerun（异常、部分失败）；
 *   ⑦ 真实评分回写：run-once → OPEN_PROJECT_ROLE 评价式评分（无标准答案段）→ ai_score/ai_feedback/status=ai_graded；
 *   ⑧ 幂等/不重复烧钱：已完成后再建 job ⇒ 无可评提交 ⇒ needs_rerun + open_grade_no_success，零新增 AI 调用；
 *   ⑨ 失败可见：学生无可读文件 ⇒ job needs_rerun + open_grade_partial（不伪造 done/假分）；
 *   ⑩ 管理员 read-model：GET /api/admin/grading-runs 可见该 job，run_kind=open / checker_label=开放题自动评价 /
 *      checker_id 不回显哨兵 / content_key=null；标准题 job 仍为 build（不误标 open）。
 *
 * 约束：不改 src；不依赖真实模型；不写生产库（setup.js 的 assertSafeToWipe 已强制 exam_system_test）。
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../../src/utils/prisma.js';
import { getTestData, loginAsAdmin, authReq } from './helpers.js';
import { AUTO_OPEN_CHECKER, isAutoOpenChecker } from '../../src/infrastructure/dsh/worker/autoOpen.js';
import { AUTO_BUILD_CHECKER } from '../../src/infrastructure/dsh/worker/autoBuild.js';
import {
  classifyDueAssignment, findDueAssignments, resolveDueAssignmentModes, scanDueAssignments,
} from '../../src/infrastructure/dsh/worker/dueAssignmentScanner.js';
import { evaluateOpenProjectAssignment } from '../../src/infrastructure/dsh/worker/openProjectEvaluation.js';
import { runOnce } from '../../src/infrastructure/dsh/worker/run-once.js';
import { JOB_STATUS } from '../../src/infrastructure/dsh/worker/claim.js';
import { DEVICE_NAMES, EXPORT_MANIFEST_NAME, exportMaterials } from '../../src/infrastructure/dsh/materials/materialsExporter.js';
import { STANDARDS_ROOT, SUBMISSIONS_ROOT, standardDir, submissionDir } from '../../src/utils/projectPaths.js';
import { STANDARD_HASH_ABSENT } from '../../src/utils/snapshotHash.js';
import { OPEN_PROJECT_ROLE } from '../../src/infrastructure/ai/deepseek/index.js';

/** 评分 mock 返回的结构化结果（与既有 open-project-flow 夹具同形） */
const MOCK_AI_RESULT = {
  totalScore: 88,
  breakdown: [{ item: '功能完整性', score: 53, maxScore: 60, comment: '增删改查齐备' }],
  highlights: ['代码结构清晰'],
  issues: ['缺少异常处理'],
  overallComment: '整体完成度较好，建议补充异常处理与边界校验。',
};
const STUDENT_CODE = 'function add(a, b) {\n  return a + b;\n}\n';
const quietLog = { info() {}, warn() {}, error() {}, log() {} };

const jsonResponse = (body, status = 200) => ({
  status, ok: status >= 200 && status < 300, json: async () => body,
});

/** 项目题答案信封（parseProjectAnswer 口径） */
const projectAnswer = (version = 1) => JSON.stringify({
  kind: 'project',
  currentVersion: version,
  history: [{ version, files: [{ name: 'main.js', size: Buffer.byteLength(STUDENT_CODE) }], at: new Date().toISOString() }],
  grading: { state: 'none', version: 0, attempts: 0, error: null, prevStatus: null, ruleVersionHash: null },
});

const dirInside = (root, child) => path.join(root, String(child));

describe('OP-1 开放题自动评分（C1 全链路）', () => {
  const originalFetch = global.fetch;
  const aiCalls = [];
  const tmpDirs = [];
  const myAssignmentIds = new Set();
  const myQuestionIds = new Set();
  let td;
  let qOpen; let aOpen;
  let qStd; let aStd;
  let qStdNoSnap; let aStdNoSnap;
  let qReal; let aReal;
  let qStdDisk; let aStdDisk;
  let aOpenStudentIds;

  /** 正式评分调用判定（与 open-project-flow 一致：按 prompt 特征过滤，不按下标） */
  const gradeCalls = () => aiCalls.filter((c) => String(c.user || '').startsWith('【项目题目】'));

  const createProjectQuestion = async ({ title, attachmentUrl = null }) => {
    const q = await prisma.question.create({
      data: {
        teacherId: td.teacherId, title, maxScore: 100, difficulty: 'medium', type: 'project',
        material: '实现一个待办事项管理程序，支持增删改查（C1 开放题自动评分夹具）',
        scoringRubric: '功能完整性 60 分：增删改查全部可用；代码规范 20 分；健壮性 20 分',
        attachmentUrl,
      },
      select: { id: true },
    });
    myQuestionIds.add(q.id);
    return q.id;
  };

  const createAssignment = async ({ qid, title, endTime, standardHash = null }) => {
    const a = await prisma.assignment.create({
      data: {
        teacherId: td.teacherId, title,
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endTime,
        assignmentQuestions: { create: { questionId: qid, sortOrder: 1, standardHash } },
        assignmentClasses: { create: { classId: td.classId } },
      },
      select: { id: true },
    });
    myAssignmentIds.add(a.id);
    return a.id;
  };

  const createSubmission = async ({ assignmentId, studentId, questionId, status = 'submitted' }) => {
    const s = await prisma.submission.create({
      data: { assignmentId, studentId, questionId, status, submittedAt: new Date(), answer: projectAnswer(1) },
      select: { id: true },
    });
    return s.id;
  };

  /** 真实磁盘写入学生版本源文件（真实评分链路读盘；afterAll 统一清理） */
  const writeStudentSource = (qid, sid, version = 1, code = STUDENT_CODE) => {
    const dir = submissionDir(qid, sid, version);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'main.js'), code);
    return dir;
  };

  /** 扫描 + 清理「非本套件夹具」被顺带创建的 job（扫描是全局的；只删本次新建的他人行，恢复 DB 原状） */
  const scanAndCleanupForeign = async () => {
    const maxBefore = Number((await prisma.gradingJob.aggregate({ _max: { id: true } }))._max.id || 0);
    const res = await scanDueAssignments({ prisma, lookbackDays: 7, limit: 100, log: quietLog });
    const foreign = await prisma.gradingJob.findMany({
      where: { id: { gt: maxBefore }, assignmentId: { notIn: [...myAssignmentIds] } },
      select: { id: true },
    });
    if (foreign.length) {
      await prisma.gradingJob.deleteMany({ where: { id: { in: foreign.map((f) => f.id) } } });
    }
    return res;
  };

  beforeAll(async () => {
    td = getTestData();
    if (!td || !td.teacherId) throw new Error('测试夹具未 seed（global.__testData 缺失）');
    aOpenStudentIds = td.studentIds.slice(0, 2);

    // AI 出网 mock：全部模型调用走本地假响应；L1 选文件调用返回空清单（走 L0 文本）
    global.fetch = async (url, init = {}) => {
      let body = {};
      try { body = JSON.parse(init.body || '{}'); } catch { body = {}; }
      const messages = body.messages || [];
      const system = (messages[0] && messages[0].content) || '';
      const user = (messages[1] && messages[1].content) || '';
      if (String(user).includes('请选出正式评分时')) {
        return jsonResponse({ choices: [{ message: { content: '{"files":[],"reason":"test"}' }, finish_reason: 'stop' }] });
      }
      aiCalls.push({ url: String(url), system, user, body });
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(MOCK_AI_RESULT) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    };

    const PAST = new Date(Date.now() - 60 * 60 * 1000);
    const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 开放题（无标准包、无标准目录）
    qOpen = await createProjectQuestion({ title: 'C1开放题_' + Date.now() });
    aOpen = await createAssignment({ qid: qOpen, title: 'C1开放作业_scanner', endTime: PAST, standardHash: null });
    for (const sid of aOpenStudentIds) await createSubmission({ assignmentId: aOpen, studentId: sid, questionId: qOpen });

    // 标准题：attachmentUrl 非空 + 发布快照有效 ⇒ 应走既有 __AUTO_BUILD__（不误伤）
    qStd = await createProjectQuestion({ title: 'C1标准题_' + Date.now(), attachmentUrl: 'project-questions/stub/standard.zip' });
    aStd = await createAssignment({ qid: qStd, title: 'C1标准作业_scanner', endTime: PAST, standardHash: 'sha256:' + 'a'.repeat(64) });
    await createSubmission({ assignmentId: aStd, studentId: aOpenStudentIds[0], questionId: qStd });

    // 标准题：有包但无发布快照 ⇒ 既有语义 skip:standard_snapshot_missing（不建 job）
    qStdNoSnap = await createProjectQuestion({ title: 'C1标准题无快照_' + Date.now(), attachmentUrl: 'project-questions/stub/standard.zip' });
    aStdNoSnap = await createAssignment({ qid: qStdNoSnap, title: 'C1标准作业_无快照', endTime: PAST, standardHash: null });
    await createSubmission({ assignmentId: aStdNoSnap, studentId: aOpenStudentIds[0], questionId: qStdNoSnap });

    // 真实评分链路夹具（先未来截止，避免 ② 的扫描把它一起入队；⑦ 内再改到期并自然扫描入队）
    qReal = await createProjectQuestion({ title: 'C1真实链路开放题_' + Date.now() });
    aReal = await createAssignment({ qid: qReal, title: 'C1开放作业_真实链路', endTime: FUTURE, standardHash: null });
    for (const sid of aOpenStudentIds) {
      await createSubmission({ assignmentId: aReal, studentId: sid, questionId: qReal });
      writeStudentSource(qReal, sid);
    }
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    try {
      const aids = [...myAssignmentIds];
      if (aids.length) {
        await prisma.gradingJob.deleteMany({ where: { assignmentId: { in: aids } } });
        await prisma.gradingJobRun.deleteMany({ where: { assignmentId: { in: aids } } }).catch(() => {});
        await prisma.submission.deleteMany({ where: { assignmentId: { in: aids } } });
        await prisma.assignmentClass.deleteMany({ where: { assignmentId: { in: aids } } });
        await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: aids } } });
        await prisma.assignment.deleteMany({ where: { id: { in: aids } } });
      }
      if (myQuestionIds.size) await prisma.question.deleteMany({ where: { id: { in: [...myQuestionIds] } } });
      for (const qid of myQuestionIds) {
        for (const [root, dir] of [
          [SUBMISSIONS_ROOT, dirInside(SUBMISSIONS_ROOT, qid)],
          [STANDARDS_ROOT, dirInside(STANDARDS_ROOT, qid)],
        ]) {
          if (dir.startsWith(root + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    } finally {
      for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('① 分类纯函数：open / standard / skip:standard_snapshot_missing（哨兵非真实哈希）', () => {
    expect(classifyDueAssignment({ hasStdPackage: false, standardHash: null })).toBe('open');
    expect(classifyDueAssignment({ hasStdPackage: false, standardHash: 'sha256:deadbeef' })).toBe('open');
    expect(classifyDueAssignment({ hasStdPackage: true, standardHash: 'sha256:' + 'a'.repeat(64) })).toBe('standard');
    expect(classifyDueAssignment({ hasStdPackage: true, standardHash: null })).toBe('skip:standard_snapshot_missing');
    expect(classifyDueAssignment({ hasStdPackage: true, standardHash: '   ' })).toBe('skip:standard_snapshot_missing');
    expect(classifyDueAssignment({ hasStdPackage: true, standardHash: STANDARD_HASH_ABSENT })).toBe('skip:standard_snapshot_missing');
    expect(isAutoOpenChecker(AUTO_OPEN_CHECKER)).toBe(true);
    expect(JSON.parse(projectAnswer(1)).currentVersion).toBe(1);
  });

  it('② resolveDueAssignmentModes：真实 DB 分类 open/standard/skip（开放题不再被 SQL 层漏掉）', async () => {
    const legacyDue = await findDueAssignments({ prisma, lookbackDays: 7, limit: 100, includeOpenProjects: false });
    expect(legacyDue.ok).toBe(true);
    expect(legacyDue.rows.map((r) => r.assignmentId)).not.toContain(aOpen); // 旧口径（standard_hash 非空）看不到开放题

    const openDue = await findDueAssignments({ prisma, lookbackDays: 7, limit: 100, includeOpenProjects: true });
    const dueIds = openDue.rows.map((r) => r.assignmentId);
    expect(dueIds).toEqual(expect.arrayContaining([aOpen, aStd, aStdNoSnap]));

    const modes = await resolveDueAssignmentModes({
      prisma,
      rows: [{ assignmentId: aOpen }, { assignmentId: aStd }, { assignmentId: aStdNoSnap }],
    });
    expect(modes.ok).toBe(true);
    expect(modes.modes.get(aOpen)).toBe('open');
    expect(modes.modes.get(aStd)).toBe('standard');
    expect(modes.modes.get(aStdNoSnap)).toBe('skip:standard_snapshot_missing');
  });

  it('③ deadline scanner：开放题建 __AUTO_OPEN__ job；标准题建 __AUTO_BUILD__；无快照 skip 不建 job', async () => {
    const res = await scanAndCleanupForeign();
    expect(res.ok).toBe(true);

    const openJob = await prisma.gradingJob.findFirst({ where: { assignmentId: aOpen }, orderBy: { id: 'desc' } });
    expect(openJob).toBeTruthy();
    expect(openJob.checkerId).toBe(AUTO_OPEN_CHECKER);
    expect(openJob.status).toBe('pending');
    expect(openJob.contentKey).toBeNull();

    const stdJob = await prisma.gradingJob.findFirst({ where: { assignmentId: aStd } });
    expect(stdJob).toBeTruthy();
    expect(stdJob.checkerId).toBe(AUTO_BUILD_CHECKER);

    const missingJob = await prisma.gradingJob.findFirst({ where: { assignmentId: aStdNoSnap } });
    expect(missingJob).toBeNull();
    expect(res.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ assignmentId: aStdNoSnap, reason: 'standard_snapshot_missing' }),
    ]));
  });

  it('④ 幂等：已建 job 的作业不重复建 job（每作业自动流程一次；deps 不重复烧钱）', async () => {
    const before = await prisma.gradingJob.count({ where: { assignmentId: aOpen } });
    await scanAndCleanupForeign();
    const after = await prisma.gradingJob.count({ where: { assignmentId: aOpen } });
    expect(before).toBe(1);
    expect(after).toBe(1);

    const due = await findDueAssignments({ prisma, lookbackDays: 7, limit: 100, includeOpenProjects: true });
    expect(due.rows.map((r) => r.assignmentId)).not.toContain(aOpen);
  });

  it('⑤ materials exporter：开放题无标准包成功导出且不报 standard_package_missing；标准题对照不误标 open', async () => {
    const uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c1-op1-up-'));
    const outOpen = fs.mkdtempSync(path.join(os.tmpdir(), 'c1-op1-out-open-'));
    const outStd = fs.mkdtempSync(path.join(os.tmpdir(), 'c1-op1-out-std-'));
    tmpDirs.push(uploadsRoot, outOpen, outStd);

    // 重定位上传根下写两份学生源文件（避免触碰真实 uploads）
    for (const sid of aOpenStudentIds) {
      const dir = path.join(uploadsRoot, 'project-submissions', String(qOpen), String(sid), '1');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'main.js'), STUDENT_CODE);
    }
    const openRes = await exportMaterials({ prisma, assignmentId: aOpen, outDir: outOpen, uploadsRoot });
    expect(openRes.ok).toBe(true);
    expect(openRes.open).toBe(true);
    expect(String(openRes.reason || '')).not.toContain('standard_package_missing');
    expect(fs.existsSync(path.join(outOpen, DEVICE_NAMES.standard))).toBe(false);
    expect(fs.existsSync(path.join(outOpen, DEVICE_NAMES.rubric))).toBe(true);
    expect(fs.existsSync(path.join(outOpen, DEVICE_NAMES.assignment))).toBe(true);
    expect(openRes.n).toBe(2);
    const openManifest = JSON.parse(fs.readFileSync(path.join(outOpen, EXPORT_MANIFEST_NAME), 'utf8'));
    expect(openManifest.mode).toBe('open');
    expect(openManifest.standard).toBeNull();
    expect(openManifest.skipped).toEqual([]);

    // 标准题对照组：真实标准目录存在 + attachmentUrl 非空 ⇒ open=false 且写标准 zip（形状不退化）
    qStdDisk = await createProjectQuestion({ title: 'C1标准题_磁盘对照_' + Date.now() });
    const stdDir = standardDir(qStdDisk);
    fs.mkdirSync(stdDir, { recursive: true });
    fs.writeFileSync(path.join(stdDir, 'Main.java'), 'public class Main {}\n');
    aStdDisk = await createAssignment({ qid: qStdDisk, title: 'C1标准作业_导出对照', endTime: new Date(Date.now() + 24 * 60 * 60 * 1000), standardHash: 'sha256:' + 'b'.repeat(64) });
    const stdRes = await exportMaterials({ prisma, assignmentId: aStdDisk, outDir: outStd });
    expect(stdRes.ok).toBe(true);
    expect(stdRes.open).toBe(false);
    expect(fs.existsSync(path.join(outStd, DEVICE_NAMES.standard))).toBe(true);
    const stdManifest = JSON.parse(fs.readFileSync(path.join(outStd, EXPORT_MANIFEST_NAME), 'utf8'));
    expect(stdManifest.mode).toBeUndefined();
    expect(stdManifest.standard.file).toBe(DEVICE_NAMES.standard);
  });

  it('⑥ 执行器：逐份评分（只取 submitted）且单份失败继续、计数如实', async () => {
    const submitted = await prisma.submission.findMany({
      where: { assignmentId: aOpen, questionId: qOpen, status: 'submitted' }, select: { id: true }, orderBy: { id: 'asc' },
    });
    expect(submitted).toHaveLength(2);
    const calls = [];
    const allOk = await evaluateOpenProjectAssignment({
      prisma, job: { id: 900001, assignmentId: aOpen }, log: quietLog,
      gradeOne: async ({ submissionId, studentId, version }) => {
        calls.push({ submissionId, studentId, version });
        return { ok: true, aiScore: 88 };
      },
    });
    expect(allOk.graded).toBe(2);
    expect(allOk.failed).toBe(0);
    expect(allOk.reason).toBeNull();
    expect(calls.map((c) => c.submissionId).sort((x, y) => x - y)).toEqual(submitted.map((s) => s.id));
    expect(calls.every((c) => c.version === 1 && c.studentId > 0)).toBe(true);

    const partial = await evaluateOpenProjectAssignment({
      prisma, job: { id: 900002, assignmentId: aOpen }, log: quietLog,
      gradeOne: async ({ submissionId }) => (submissionId === submitted[0].id
        ? { ok: false, reason: 'ai_failed' }
        : { ok: true, aiScore: 70 }),
    });
    expect(partial.graded).toBe(1);
    expect(partial.failed).toBe(1);
    expect(partial.reason).toBe('open_grade_partial');
    expect(partial.failures[0]).toEqual({ submissionId: submitted[0].id, reason: 'ai_failed' });
  });

  it('⑥b 执行器：标准包题误入开放 job ⇒ 拒评（不把标准题当开放题评）', async () => {
    let gradeCalled = false;
    const res = await evaluateOpenProjectAssignment({
      prisma, job: { id: 900003, assignmentId: aStd }, log: quietLog,
      gradeOne: async () => { gradeCalled = true; return { ok: true, aiScore: 1 }; },
    });
    expect(res.graded).toBe(0);
    expect(res.reason).toBe('open_job_on_standard_assignment');
    expect(gradeCalled).toBe(false);
    // 该作业确实有标准包（判据来源）
    const q = await prisma.question.findUnique({ where: { id: qStd }, select: { attachmentUrl: true } });
    expect(q.attachmentUrl).toBeTruthy();
  });

  it('⑦ run-once 早分支：__AUTO_OPEN__ 不导物料/不造尺/不跑装置，done 记账正确', async () => {
    const job = await prisma.gradingJob.findFirst({
      where: { assignmentId: aOpen, status: 'pending' }, orderBy: { id: 'desc' },
    });
    expect(job).toBeTruthy();
    const evaluatorArgs = [];
    const res = await runOnce({
      prisma, jobId: job.id,
      deps: {
        evaluateOpenProject: async (args) => {
          evaluatorArgs.push(args);
          return { graded: 2, failed: 0, skipped: 0, failures: [], reason: null };
        },
      },
    });
    expect(res.consumed).toBe(true);
    expect(res.status).toBe(JOB_STATUS.done);
    expect(res.written).toBe(2);
    expect(res.runRoot).toBeUndefined();              // 装置链路根本没启动（无 runRoot）
    expect(evaluatorArgs).toHaveLength(1);
    expect(evaluatorArgs[0].job.id).toBe(job.id);

    const row = await prisma.gradingJob.findUnique({ where: { id: job.id } });
    expect(row.status).toBe('done');
    expect(row.writtenCount).toBe(2);
    expect(row.contentKey).toBeNull();
    expect(await prisma.gradingChecker.count({ where: { assignmentId: aOpen } })).toBe(0);
    expect(await prisma.assignmentQuestionRuler.count({ where: { assignmentId: aOpen } })).toBe(0);
    expect(await prisma.gradingJobRun.count({ where: { jobId: job.id } })).toBe(0);
  });

  it('⑧ 真实链路：run-once → OPEN_PROJECT_ROLE 评价（无标准答案段）→ 回写 ai_score/ai_feedback/ai_graded', async () => {
    // 让夹具到期，复用真实 deadline 扫描自动建 open job（不手工造 job）
    await prisma.assignment.update({ where: { id: aReal }, data: { endTime: new Date(Date.now() - 60 * 1000) } });
    const scanRes = await scanAndCleanupForeign();
    expect(scanRes.ok).toBe(true);
    const job = await prisma.gradingJob.findFirst({ where: { assignmentId: aReal }, orderBy: { id: 'desc' } });
    expect(job).toBeTruthy();
    expect(job.checkerId).toBe(AUTO_OPEN_CHECKER);

    const aiBefore = aiCalls.length;
    const res = await runOnce({ prisma, jobId: job.id });
    expect(res.consumed).toBe(true);
    expect(res.status).toBe(JOB_STATUS.done);

    // 评分 prompt：必须走 OPEN_PROJECT_ROLE 且无「标准答案源码」段（评价式，不拼标准答案）
    const calls = gradeCalls();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const newCalls = aiCalls.slice(aiBefore).filter((c) => String(c.user || '').startsWith('【项目题目】'));
    expect(newCalls.length).toBeGreaterThanOrEqual(2);
    for (const c of newCalls) {
      expect(c.system).toBe(OPEN_PROJECT_ROLE);
      expect(c.user).not.toContain('标准答案源码');
    }

    // 回写：学生提交 ai_score/ai_feedback/status + 版本信封 grading.state=done
    const subs = await prisma.submission.findMany({ where: { assignmentId: aReal } });
    expect(subs).toHaveLength(2);
    for (const s of subs) {
      expect(s.status).toBe('ai_graded');
      expect(s.aiScore).toBe(88);
      expect(String(s.aiFeedback || '')).toContain('整体完成度');
      const env = JSON.parse(s.answer);
      expect(env.grading.state).toBe('done');
      expect(env.grading.error).toBeNull();
    }
    const row = await prisma.gradingJob.findUnique({ where: { id: job.id } });
    expect(row.status).toBe('done');
    expect(row.writtenCount).toBe(2);
    expect(row.contentKey).toBeNull();
    // 不造尺/不跑装置
    expect(await prisma.gradingChecker.count({ where: { assignmentId: aReal } })).toBe(0);
  });

  it('⑨ 幂等/不重复烧钱：已完成后再建 open job ⇒ 无可评提交 ⇒ needs_rerun + 零新增 AI 调用', async () => {
    const aiBefore = aiCalls.length;
    const job2 = await prisma.gradingJob.create({
      data: { assignmentId: aReal, checkerId: AUTO_OPEN_CHECKER, status: 'pending' },
      select: { id: true },
    });
    const res = await runOnce({ prisma, jobId: job2.id });
    expect(res.consumed).toBe(true);
    expect(res.status).toBe(JOB_STATUS.needsRerun);
    const row = await prisma.gradingJob.findUnique({ where: { id: job2.id } });
    expect(row.status).toBe('needs_rerun');
    expect(String(row.lastError || '')).toContain('open_grade_no_success');
    expect(aiCalls.length).toBe(aiBefore);            // 未重复调用模型
    const subs = await prisma.submission.findMany({ where: { assignmentId: aReal } });
    expect(subs.every((s) => s.status === 'ai_graded' && s.aiScore === 88)).toBe(true);
  });

  it('⑩ 失败可见：学生无可读文件 ⇒ job needs_rerun + open_grade_partial（不伪造 done/假分）', async () => {
    const q = await createProjectQuestion({ title: 'C1失败可见开放题_' + Date.now() });
    const a = await createAssignment({ qid: q, title: 'C1失败可见作业', endTime: new Date(Date.now() - 60 * 1000), standardHash: null });
    const sid = td.studentIds[0];
    await createSubmission({ assignmentId: a, studentId: sid, questionId: q });
    await scanAndCleanupForeign();
    const job = await prisma.gradingJob.findFirst({ where: { assignmentId: a }, orderBy: { id: 'desc' } });
    expect(job).toBeTruthy();
    expect(job.checkerId).toBe(AUTO_OPEN_CHECKER);

    const aiBefore = aiCalls.length;
    const res = await runOnce({ prisma, jobId: job.id });
    expect(res.consumed).toBe(true);
    expect(res.status).toBe(JOB_STATUS.needsRerun);   // 0 成功绝不 done
    const row = await prisma.gradingJob.findUnique({ where: { id: job.id } });
    expect(row.status).toBe('needs_rerun');
    expect(String(row.lastError || '')).toContain('open_grade_partial:failed=1');
    expect(aiCalls.length).toBe(aiBefore);            // 无学生文件 ⇒ 未烧模型
    const sub = await prisma.submission.findFirst({ where: { assignmentId: a } });
    expect(sub.status).toBe('submitted');             // 失败还原 submitted ⇒ 可重试
    expect(sub.aiScore).toBe(0);                      // markFailed 口径（非伪造分数）
    expect(JSON.parse(sub.answer).grading.state).toBe('failed');
  });

  it('⑪ 管理员 read-model：GET /api/admin/grading-runs 可见 open job（run_kind/label/哨兵不回显）', async () => {
    const token = await loginAsAdmin();
    const req = authReq(token);
    const res = await req.get('/api/admin/grading-runs?assignmentId=' + aReal);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const items = (res.body.data && res.body.data.items) || [];
    const realJob = await prisma.gradingJob.findFirst({ where: { assignmentId: aReal, status: 'done' }, orderBy: { id: 'desc' } });
    const item = items.find((x) => Number(x.job_id) === Number(realJob.id));
    expect(item).toBeTruthy();
    expect(item.run_kind).toBe('open');
    expect(item.checker_label).toBe('开放题自动评价');
    expect(item.checker_id).toBeNull();               // 哨兵不当真实 checker 展示
    expect(item.content_key).toBeNull();
    expect(item.status).toBe('done');

    // 标准题 job（__AUTO_BUILD__）不得被误标 open
    const stdJob = await prisma.gradingJob.findFirst({ where: { assignmentId: aStd } });
    if (stdJob) {
      const stdRes = await req.get('/api/admin/grading-runs?assignmentId=' + aStd);
      const stdItems = (stdRes.body.data && stdRes.body.data.items) || [];
      const stdItem = stdItems.find((x) => Number(x.job_id) === Number(stdJob.id));
      if (stdItem) expect(stdItem.run_kind).toBe('build');
    }
  });
});
