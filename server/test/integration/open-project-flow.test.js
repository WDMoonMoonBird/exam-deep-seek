/**
 * open-project-flow.test.js — 开放性实训题（无标准工程包）全链路集成用例。
 *
 * 链路（每一步都是真实 HTTP + 真实 DB + 真实磁盘，仅 AI 出网被 mock）：
 *   ① 建题免上传：POST /api/teacher/questions（type=project，**不传 tempId**）→ 创建成功，
 *      DB 中 attachmentUrl 为 null（Wave 1 之前这里会被「请先上传标准工程包」拦下）；
 *   ② 布置作业：无标准包未确认 → 400/1007 软警告且不创建；显式确认 → 创建成功；
 *   ③ 学生提交：POST /api/student/assignments/:aid/project/:qid/submit 上传 zip → 返回文件树；
 *   ④ AI 评分：异步评分链路真实跑通（projectGrading → deepseek.gradeProject），
 *      捕获真实请求体断言 system=OPEN_PROJECT_ROLE、prompt 无「标准答案源码」段，
 *      且与 buildOpenProjectGradePrompt 逐字节一致；
 *   ⑤ 两栏审核：审核数据端点 standardFiles 为空（前端因此回落两栏），studentFiles/AI 评语齐全；
 *   ⑥ 预览一致性：提示词预览端点与实际提示词端点/exact 实评 prompt 逐字节一致（无标准答案段）。
 *
 * 说明：唯一被替换的是全局 fetch（AI 出网），其余全部走真实实现——这是 captain 要求的
 * 「真机证据」：Wave 1 只做了静态确认（源码里没有标准答案段），本用例证明运行期确实没有。
 */
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { loginAsTeacher, loginAsStudent, authReq, getTestData } from './helpers.js';
import prisma from '../../src/utils/prisma.js';
import {
  SUBMISSIONS_ROOT, STANDARDS_ROOT, submissionDir, standardDir,
} from '../../src/utils/projectPaths.js';
import {
  PROJECT_ROLE, OPEN_PROJECT_ROLE, buildOpenProjectGradePrompt,
} from '../../src/services/deepseek.js';

/** 学生提交的单个源文件（单文件保证上下文文本确定，便于逐字节断言） */
const STUDENT_FILE = 'src/main.js';
const STUDENT_CODE = 'function add(a, b) {\n  return a + b;\n}\n';
/** buildGradingContext（L0 过滤）对该单文件生成的上下文文本 */
const EXPECTED_STUDENT_TEXT = '// 文件名: ' + STUDENT_FILE + '\n' + STUDENT_CODE;
/** 预览端点的学生代码占位符（与 projectReviewController 保持一致） */
const PREVIEW_PLACEHOLDER = '【学生提交的工程文件将在此拼接（自动过滤依赖目录）】';
/** 评分 mock 返回的结构化结果 */
const MOCK_AI_RESULT = {
  totalScore: 88,
  breakdown: [{ item: '功能完整性', score: 53, maxScore: 60, comment: '增删改查齐备' }],
  highlights: ['代码结构清晰'],
  issues: ['缺少异常处理'],
  overallComment: '整体完成度较好，建议补充异常处理与边界校验。',
};

const jsonResponse = (body, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

function buildStudentZip() {
  const zip = new AdmZip();
  zip.addFile(STUDENT_FILE, Buffer.from(STUDENT_CODE, 'utf-8'));
  return zip.toBuffer();
}

async function waitFor(fn, { timeout = 30000, interval = 200, label = '条件' } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('等待' + label + '超时');
    await new Promise((r) => setTimeout(r, interval));
  }
}

describe('开放性实训题全链路（建题无包 → 布置确认 → 提交 → 评价式评分 → 两栏审核）', () => {
  const originalFetch = global.fetch;
  let teacherToken;
  let studentToken;
  let teacherReq;
  let studentReq;
  let td;
  let qid;
  let assignmentId;
  let submissionId;
  /**
   * 被 mock 的全部 AI 出网调用（含正式评分与辅助调用），按发生顺序记录。
   * 为什么不能按下标取「那次评分调用」：评分链路不只发 1 次 AI 调用——
   * 2026-08-17 起 gradeProjectSubmission 会先调 ensureRubricItems → summarizeRubricItems
   * 做「评分标准固定分项」提炼（user prompt 以「【评分标准原文】」开头，解析失败还会重试），
   * 之后才发正式评分调用。合入该功能后本用例曾把提炼调用当成评分调用（按下标取 [0]）而误红（④⑦）。
   */
  const aiCalls = [];
  /**
   * 正式评分调用判定：按 prompt 特征过滤，不按调用顺序/下标。
   * 评分 prompt 由 buildProjectGradePrompt / buildOpenProjectGradePrompt 构建，恒以「【项目题目】」开头；
   * 与分项提炼（「【评分标准原文】」）、L1 文件选择（「请选出正式评分时」）等辅助调用特征不同。
   * @param {string} user 该次 AI 调用的 user prompt
   * @returns {boolean} 是否为正式评分调用
   */
  const isGradingCall = (user) => String(user).startsWith('【项目题目】');
  /**
   * 本次链路捕获到的正式评分调用（过滤后）。
   * 注意：过滤不会让断言变宽松——若评分调用缺失/未被记录，这里为空数组，
   * 长度断言与逐字节断言都会失败（见 ④/⑦，反证见验收记录）。
   * @returns {Array<{url:string, system:string, user:string, body:object}>}
   */
  const gradeCalls = () => aiCalls.filter((c) => isGradingCall(c.user));
  const baseTitle = '开放链路_' + Date.now();

  const assignPayload = () => ({
    title: baseTitle + '_作业',
    description: '开放性实训作业',
    startTime: new Date(Date.now() - 86400000).toISOString(),
    endTime: new Date(Date.now() + 86400000).toISOString(),
    questionIds: [qid],
    classIds: [td.classId],
  });

  beforeAll(async () => {
    teacherToken = await loginAsTeacher();
    studentToken = await loginAsStudent('test_stu_01');
    teacherReq = authReq(teacherToken);
    studentReq = authReq(studentToken);
    td = getTestData();

    // ③ 前置：拦截 AI 出网（真实评分链路，仅网络被替换）
    global.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      const system = body.messages?.[0]?.content || '';
      const user = body.messages?.[1]?.content || '';
      // L1 两阶段文件选择（配置开关开启时才会出现）：返回空清单，走 L0 文本
      if (user.includes('请选出正式评分时')) {
        return jsonResponse({ choices: [{ message: { content: '{"files":[],"reason":"test"}' }, finish_reason: 'stop' }] });
      }
      // 记录全部调用；「评分调用」在断言处以 prompt 特征过滤（见 gradeCalls()），不按下标
      aiCalls.push({ url, system, user, body });
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(MOCK_AI_RESULT) }, finish_reason: 'stop' }],
      });
    };
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    if (submissionId) await prisma.submission.deleteMany({ where: { id: submissionId } });
    if (qid) await prisma.submission.deleteMany({ where: { questionId: qid } });
    if (assignmentId) {
      await prisma.assignmentClass.deleteMany({ where: { assignmentId } });
      await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
      await prisma.assignment.delete({ where: { id: assignmentId } }).catch(() => {});
    }
    if (qid) {
      await prisma.question.delete({ where: { id: qid } }).catch(() => {});
      // 只清理本套件创建/使用过的目录：先确认目标确实位于对应 uploads 根之内
      for (const [root, dir] of [
        [SUBMISSIONS_ROOT, path.join(SUBMISSIONS_ROOT, String(qid))],
        [STANDARDS_ROOT, path.join(STANDARDS_ROOT, String(qid))],
      ]) {
        if (dir.startsWith(root + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('① 建题免上传：type=project 不传 tempId → 创建成功且 DB attachmentUrl 为 null', async () => {
    const res = await teacherReq.post('/api/teacher/questions', {
      title: baseTitle + '_题',
      type: 'project',
      maxScore: 100,
      difficulty: 'medium',
      material: '实现一个待办事项管理程序，支持增删改查',
      scoringRubric: '功能完整性 60 分：增删改查全部可用；代码规范 20 分；健壮性 20 分',
      // 关键：不传 tempId（即不上传标准工程包）
    });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message || '').not.toContain('标准工程包');
    qid = res.body.data.id;
    expect(typeof qid).toBe('number');

    const row = await prisma.question.findUnique({ where: { id: qid } });
    expect(row.type).toBe('project');
    expect(row.attachmentUrl).toBeNull();
    // 磁盘上确实没有标准包目录（判据三方一致的物理前提）
    expect(fs.existsSync(standardDir(qid))).toBe(false);
  });

  it('② 布置作业：未确认 → 400/1007 且不创建；确认 → 创建成功', async () => {
    const warn = await teacherReq.post('/api/teacher/assignments', assignPayload());
    expect(warn.status).toBe(400);
    expect(warn.body.code).toBe(1007);
    expect(warn.body.data.requiresConfirmation).toBe(true);
    expect(warn.body.data.warnings[0].questionId).toBe(qid);
    expect(warn.body.message).toContain('确认按开放性题目布置');
    const cnt = await prisma.assignment.count({ where: { title: assignPayload().title } });
    expect(cnt).toBe(0);

    const ok = await teacherReq.post('/api/teacher/assignments', {
      ...assignPayload(),
      confirmWithoutStandardPackage: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.code).toBe(0);
    assignmentId = ok.body.data.id;
    expect(typeof assignmentId).toBe('number');
  });

  it('③ 学生提交 zip → 提交成功并返回文件树（评分异步进行）', async () => {
    const res = await studentReq
      .post('/api/student/assignments/' + assignmentId + '/project/' + qid + '/submit')
      .attach('file', buildStudentZip(), 'project.zip');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.files.tree.length).toBeGreaterThan(0);
    submissionId = res.body.data.submission.id;
    expect(typeof submissionId).toBe('number');
  });

  it('④ 评价式评分：实评 prompt 无标准答案段、system 为 OPEN_PROJECT_ROLE、逐字节等于开放性构建函数', async () => {
    // 等待异步评分落库（enqueueProjectGrade 走 setImmediate，轮询到 ai_graded）
    const done = await waitFor(async () => {
      const r = await prisma.submission.findUnique({ where: { id: submissionId } });
      return r.status === 'ai_graded' ? r : null;
    }, { label: 'ai_graded 状态' });

    expect(done.aiScore).toBe(MOCK_AI_RESULT.totalScore);
    const feedback = JSON.parse(done.aiFeedback);
    expect(feedback.overallComment).toBe(MOCK_AI_RESULT.overallComment);
    expect(feedback.breakdown[0].item).toBe('功能完整性');

    // 真实捕获的评分请求体：按 prompt 特征过滤后应恰有 1 次正式评分
    // （分项提炼等辅助调用不在此列；若评分调用缺失，本断言即红）
    expect(gradeCalls()).toHaveLength(1);
    const call = gradeCalls()[0];
    expect(call.system).toBe(OPEN_PROJECT_ROLE);
    expect(call.system).not.toBe(PROJECT_ROLE);
    expect(call.user).not.toContain('标准答案源码');
    expect(call.user).not.toContain('=== 标准答案');
    // 与开放性构建函数逐字节一致（题目/要求/评分标准/学生源码/JSON 结构全部对得上）
    expect(call.user).toBe(buildOpenProjectGradePrompt({
      title: baseTitle + '_题',
      description: '实现一个待办事项管理程序，支持增删改查',
      scoringRubric: '功能完整性 60 分：增删改查全部可用；代码规范 20 分；健壮性 20 分',
      studentFiles: EXPECTED_STUDENT_TEXT,
    }));
  });

  it('⑤ 两栏审核：standardFiles 为空（前端回落两栏）+ studentFiles/AI 评语齐全', async () => {
    const res = await teacherReq.get('/api/teacher/project-submission/' + submissionId);
    expect(res.body.code).toBe(0);
    const d = res.body.data;
    // 无标准包 → 审核页不渲染「标准答案包」tab，默认学生提交（两栏）
    expect(d.standardFiles.tree).toEqual([]);
    expect(d.standardFiles.contents).toEqual({});
    expect(d.studentFiles.tree.length).toBeGreaterThan(0);
    expect(Object.keys(d.studentFiles.contents)).toContain(STUDENT_FILE);
    expect(d.studentFiles.contents[STUDENT_FILE]).toContain('function add');
    expect(d.version).toBe(1);
    // AI 结构化评语（总分在 submission.aiScore，明细在 aiResult）
    expect(d.submission.aiScore).toBe(MOCK_AI_RESULT.totalScore);
    expect(d.aiResult.overallComment).toBe(MOCK_AI_RESULT.overallComment);
    expect(d.aiResult.breakdown[0]).toEqual(MOCK_AI_RESULT.breakdown[0]);
    expect(d.aiResult.highlights).toEqual(MOCK_AI_RESULT.highlights);
    expect(d.aiResult.issues).toEqual(MOCK_AI_RESULT.issues);
    expect(d.question.scoringRubric).toContain('功能完整性 60 分');
  });

  it('⑥ 提示词预览端点：mode=open、角色为评审专家、与开放性构建函数逐字节一致', async () => {
    const res = await teacherReq.get('/api/teacher/questions/' + qid + '/project-prompt-preview');
    expect(res.body.code).toBe(0);
    expect(res.body.data.type).toBe('project');
    expect(res.body.data.mode).toBe('open');
    expect(res.body.data.system).toBe(OPEN_PROJECT_ROLE);
    expect(res.body.data.user).not.toContain('标准答案源码');
    expect(res.body.data.user).toBe(buildOpenProjectGradePrompt({
      title: baseTitle + '_题',
      description: '实现一个待办事项管理程序，支持增删改查',
      scoringRubric: '功能完整性 60 分：增删改查全部可用；代码规范 20 分；健壮性 20 分',
      studentFiles: PREVIEW_PLACEHOLDER,
    }));
  });

  it('⑦ 实际提示词端点 = 实评 prompt（所见即所用，逐字节一致）', async () => {
    const res = await teacherReq.get('/api/teacher/submissions/' + submissionId + '/project/prompt');
    expect(res.body.code).toBe(0);
    expect(res.body.data.mode).toBe('open');
    expect(res.body.data.system).toBe(OPEN_PROJECT_ROLE);
    expect(res.body.data.user).not.toContain('标准答案源码');
    // 与 ④ 捕获的真实评分 prompt 完全一致（同样按特征过滤取评分调用，不按下标）
    expect(res.body.data.user).toBe(gradeCalls()[0].user);
    // 与预览端点同构：仅学生源码段不同（占位符 vs 真实文件）
    expect(res.body.data.user).toBe(buildOpenProjectGradePrompt({
      title: baseTitle + '_题',
      description: '实现一个待办事项管理程序，支持增删改查',
      scoringRubric: '功能完整性 60 分：增删改查全部可用；代码规范 20 分；健壮性 20 分',
      studentFiles: EXPECTED_STUDENT_TEXT,
    }));
    expect(res.body.data.user).toContain(EXPECTED_STUDENT_TEXT);
  });

  it('⑧ 提交落盘目录在 project-submissions 下（学生版本隔离，标准包目录始终不存在）', async () => {
    const dir = submissionDir(qid, td.studentIds[0], 1);
    expect(dir.startsWith(SUBMISSIONS_ROOT + path.sep)).toBe(true);
    expect(fs.existsSync(path.join(dir, STUDENT_FILE))).toBe(true);
    expect(fs.existsSync(standardDir(qid))).toBe(false);
  });

  it('⑨ 非 project 题不受影响：编程题建题/预览走原有链路（回归对照）', async () => {
    const q = await teacherReq.post('/api/teacher/questions', {
      title: baseTitle + '_编程题',
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: [{
        title: '题1', content: '<p>写个加法</p>', referenceAnswer: 'a+b', score: 100, language: 'javascript',
      }],
    });
    expect(q.body.code).toBe(0);
    const cid = q.body.data.id;
    const preview = await teacherReq.get('/api/teacher/questions/' + cid + '/prompt-preview');
    expect(preview.body.code).toBe(0);
    expect(preview.body.data.type).toBe('code');
    // 编程题提示词仍含参考答案（未受开放性改动影响）
    expect(preview.body.data.subs[0].user).toContain('参考答案');
    await prisma.subQuestion.deleteMany({ where: { questionId: cid } });
    await prisma.question.delete({ where: { id: cid } });
  });
});
