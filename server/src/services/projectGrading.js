/**
 * projectGrading.js — 新实训题流程（Submission.type=project）的异步 AI 评分服务
 *
 * 与 legacy 体系B（ProjectSubmission + gradingWorker.scanProjectSubmissions）完全解耦：
 * 本服务只处理写入 Submission 表的实训题提交，状态机为
 *   submitted → ai_graded → reviewed/published（复用既有 SubmissionStatus 枚举）。
 *
 * 铁律：
 *   R5  评分在提交后异步触发，不阻塞提交响应（由调用方 setImmediate 调起）。
 *   R6  评分失败对学生透明（status 回退/保持 submitted，grading.state=failed），
 *       绝不让提交接口崩溃，也绝不回显内部错误。
 *   R7  每次评只针对「某个版本目录」，版本目录不可变，评分结果写入 Submission 行。
 *
 * 并发：信号量限制最多 3 个评分任务并行（D6，已移至 infrastructure/worker/projectGradingConcurrency.js）。
 *
 * B1 拆分（行为不变）：并发信号量 → infrastructure/worker/projectGradingConcurrency.js；
 *   版本目录读取 → infrastructure/storage/project-tree-read.js；上下文构建 / 固定分项 / 预算兜底 →
 *   infrastructure/ai/project-grading-context.js。本文件保留评分核心并再导出上述符号 ⇒ 契约不变。
 */

import crypto from 'node:crypto';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import {
  gradeProject,
  gradeSubjectiveItems,
  getProjectContextMode,
} from '../infrastructure/ai/deepseek/index.js';
import { runRules } from '../infrastructure/rule/index.js';
import { gradeProjectTrustJudge } from '../infrastructure/ai/trust-judge-grader.js';
import { ABNORMAL_FEEDBACK } from '../constants.js';
import { standardDir, submissionDir, hasStandardPackage } from '../utils/projectPaths.js';
import { parseProjectAnswer, serializeProjectAnswer } from '../domain/services/project-view.js';
// ★R3-S5（t30）：breakdown 项统一规范化（补齐 title/status，status 缺失时按 score/maxScore 推导）——
//   原实现只写 { item, score, maxScore, comment, kind }（legacy 形状）⇒ 读取侧按 status 聚合时全落 unknown
import { buildLossBreakdown } from '../domain/services/lossBreakdownItem.js';
import { loadAssignmentSnapshot, resolveSnapshot, snapshotSourceOf } from './assignmentSnapshot.js';
import { textSha256, standardPackSha256 } from '../utils/snapshotHash.js';

import { acquire, release, refreshConcurrency } from '../infrastructure/worker/projectGradingConcurrency.js';
import { ensureRubricItems, buildGradingContext } from '../infrastructure/ai/project-grading-context.js';

// ── B1 兼容再导出：以下符号已搬出本文件，仍从原路径对外提供 ⇒ 接口契约不变 ──
export { refreshConcurrency } from '../infrastructure/worker/projectGradingConcurrency.js';
export { readDirFiles } from '../infrastructure/storage/project-tree-read.js';
export { ensureRubricItems, buildGradingContext, enforceBudget } from '../infrastructure/ai/project-grading-context.js';

/**
 * 检查器评分链路（2026-08-17 方案）：确定性分项由 AI 生成脚本执行（零 token、零波动），
 * 主观分项调 LLM（温度 0）。任一环节失败抛错，由调用方降级为原 LLM 全量评分。
 * @param {object} p
 * @param {object} p.question 题目（checkerScript/scoringRubric/maxScore 等）
 * @param {string} p.stuDir 学生版本目录
 * @param {string} p.standardFiles 标准包源码（L0 过滤后）
 * @param {string} p.studentFiles 学生源码（L0 过滤后）
 * @returns {Promise<{totalScore: number, breakdown: Array, highlights: Array, issues: Array, overallComment: string}>}
 */
async function gradeWithChecker({ question, stuDir, standardFiles, studentFiles }) {
  // 1) 确定性检查：规则驱动执行器（2026-08-17 规则驱动方案：计分由确定性代码强制，不会溢出）
  let rules;
  try {
    rules = typeof question.checkerScript === 'string'
      ? JSON.parse(question.checkerScript)
      : question.checkerScript;
  } catch {
    throw new Error('评分规则解析失败');
  }
  if (!rules || !Array.isArray(rules.objective_items)) throw new Error('评分规则格式非法');
  const checkerRes = await runRules(rules, stuDir);
  const checkerItems = (checkerRes.items || []).map(it => ({
    item: String(it.item || '').slice(0, 50),
    maxScore: Number(it.max_score) || 0,
    score: Number(it.score) || 0,
    comment: String(it.evidence || '').slice(0, 60),
    kind: 'checker',
  }));

  // 2) 主观分项 LLM 评分（失败不降级：确定性结果保留，主观项按 0 分并记录）
  const subjectiveList = Array.isArray(checkerRes.subjective) ? checkerRes.subjective : [];
  let subjectiveItems = [];
  if (subjectiveList.length > 0) {
    try {
      const sr = await gradeSubjectiveItems({
        title: question.title || '未命名项目',
        scoringRubric: question.scoringRubric || '',
        standardFiles,
        studentFiles,
        subjectiveItems: subjectiveList,
        checkerEvidence: JSON.stringify(checkerItems.map(i => ({ item: i.item, score: i.score, evidence: i.comment }))),
      });
      subjectiveItems = (sr.items || []).map(it => ({ ...it, kind: 'ai' }));
    } catch (err) {
      logger.warn({ err: err.message, submissionId: question.id }, '主观分项评分失败，按 0 分处理（确定性结果保留）');
      subjectiveItems = subjectiveList.map(it => ({ item: it.item, maxScore: it.max_score, score: 0, comment: '主观评分失败', kind: 'ai' }));
    }
  }

  const breakdown = [...checkerItems, ...subjectiveItems];
  // 按分项汇总（clamp 到题目满分；脚本自身 totalScore 可能溢出，以分项为准）
  const totalScore = Math.min(
    Number(question.maxScore) || 100,
    Math.max(0, breakdown.reduce((s, b) => s + (b.score || 0), 0)),
  );
  logger.info({ items: breakdown.length, checker: checkerItems.length, ai: subjectiveItems.length }, '检查器评分完成');
  return { totalScore, breakdown, highlights: [], issues: [], overallComment: '' };
}
// ===================== 评分核心 =====================

/**
 * 提交后异步入队评分（R5：fire-and-forget）。
 * 仅接收 submissionId，自行查库取出 questionId/studentId/当前版本号，
 * 通过 setImmediate 让出事件循环，保证 submit 响应不被 AI 调用阻塞。
 * 任何异常都被吞掉并记录日志，绝不让 submit 接口崩溃（R6）。
 *
 * @param {number} submissionId
 */
export function enqueueProjectGrade(submissionId) {
  setImmediate(() => {
    (async () => {
      try {
        await refreshConcurrency(); // 2026-08-17 并发修复：入队前刷新并发上限（配置变更热生效）
        const sub = await prisma.submission.findUnique({
          where: { id: submissionId },
          select: { questionId: true, studentId: true, answer: true, status: true },
        });
        if (!sub) return;
        const env = parseProjectAnswer(sub.answer);
        // 仅对刚提交/未评分触发；教师重评（grading 记录 prevStatus）时任意状态都放行
        if (sub.status !== 'submitted' && !env.grading?.prevStatus) return;
        const version = env.currentVersion;
        if (!version || version < 1) return;
        await gradeProjectSubmission({ submissionId, questionId: sub.questionId, studentId: sub.studentId, version });
      } catch (err) {
        logger.error({ err, submissionId }, '实训题评分入队失败');
      }
    })();
  });
}

/**
 * 对一条实训题提交做 AI 评分并写回。
 * @param {object} ctx
 * @param {number} ctx.submissionId  Submission 行 id
 * @param {number} ctx.questionId
 * @param {number} ctx.studentId
 * @param {number} ctx.version       已落盘的学生版本号
 */
export async function gradeProjectSubmission({ submissionId, questionId, studentId, version }) {
  await acquire();
  const start = Date.now();
  try {
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { question: { select: { id: true, title: true, material: true, scoringRubric: true, maxScore: true, type: true, attachmentUrl: true, rubricItems: true, checkerScript: true, checkerStatus: true, checkerMeta: true } } },
    });
    // ★OP-1（D1）：所有出口返回结构化结果（{ok:true,aiScore} / {ok:false,reason}），
    //   供「开放题自动评价」执行器区分成功/失败（既有调用方忽略返回值 ⇒ 行为兼容）。
    if (!sub) {
      logger.warn({ submissionId }, '实训题评分：提交记录不存在，跳过');
      return { ok: false, reason: 'submission_not_found' };
    }
    if (sub.question?.type !== 'project') {
      logger.warn({ submissionId, type: sub.question?.type }, '实训题评分：非 project 类型，跳过');
      return { ok: false, reason: 'not_project' };
    }
    // 幂等保护：非 pending 评分任务跳过；
    // 教师重评（regrade 置 grading.state=pending 且记录 prevStatus）时，即使 reviewed/published 也继续评分
    const gradingEnv = parseProjectAnswer(sub.answer).grading || {};
    if (gradingEnv.state !== 'pending' && (sub.status === 'reviewed' || sub.status === 'published')) {
      logger.info({ submissionId, status: sub.status }, '实训题评分：已审核/发布且无重评任务，跳过');
      return { ok: false, reason: 'idempotent_skip' };
    }

    const stdDir = standardDir(questionId);
    const stuDir = submissionDir(questionId, studentId, version);

    // 开放性实训题：有无标准工程包是唯一信号（不新增数据库字段）。
    // attachmentUrl 为 null 即教师建题时未上传标准包；兼容历史数据：标准包目录仍有文件时
    // 按标准题处理，不误判为开放性题目。判据统一到 utils/projectPaths.js 的
    // hasStandardPackage()（与 Q9 布置作业软警告、提示词预览共用同一实现）。
    const gradeMode = hasStandardPackage(questionId, sub.question?.attachmentUrl) ? 'standard' : 'open';

    // 上下文管理方案：L0 过滤 + L1 两阶段（配置开关，失败自动降级）
    const contextMode = await getProjectContextMode();
    const ctx = await buildGradingContext({
      mode: contextMode,
      stdDir,
      stuDir,
      question: sub.question,
    });
    const { standardFiles, studentFiles } = ctx;

    if (!studentFiles) {
      logger.warn({ submissionId, stuDir }, '实训题评分：学生版本无可读文件，标记失败');
      await markFailed(submissionId, '学生提交无可读源文件');
      return { ok: false, reason: 'no_readable_files' };
    }
    if (ctx.info.mode !== 'off') {
      logger.info({ submissionId, mode: ctx.info.mode, pickedCount: ctx.info.pickedCount || 0 }, '实训题评分：上下文构建完成');
    }
    logger.info({ submissionId, gradeMode }, '实训题评分：评分模式确定');

    // W2（R2-B2）：评分标准读路径 snapshot ?? live。
    // 已发布作业读快照（rubric 冻结，rubricItems 一并冻结）；无快照的历史作业回落题目活值 —— 行为不变。
    const snapRow = await loadAssignmentSnapshot(prisma, sub.assignmentId, questionId);
    const std = resolveSnapshot(snapRow, sub.question);
    logger.info({ submissionId, from_snapshot: std.fromSnapshot, snapshot_origin: std.origin }, '实训题评分：评分标准来源');

    // 评分标准固定分项（快照有则直接用；否则懒生成 + 缓存；失败降级为模型自由分项）
    const fixedItems = std.rubricItems ?? await ensureRubricItems(sub.question);

    // 2026-08-17 检查器方案：脚本就绪时走确定性链路（硬性分项零波动），失败降级原链路
    const checkerReady = sub.question.checkerStatus === 'ready' && !!sub.question.checkerScript;

    // GRADING_MODE 开关（feat/trustjudge-scoring）：trustjudge → TrustJudge sidecar
    //（sidecar 故障自动降级 legacy）；默认 legacy
    const gradingMode = process.env.GRADING_MODE === 'trustjudge' ? 'trustjudge' : 'legacy';
    // 评分后端公共入参（legacy deepseek.gradeProject 与 trustjudge sidecar 共用）：
    //   mode/fixedItems 由规则驱动评分链路引入（open 模式语义 + 固定分项对齐）。
    const gradeArgs = {
      title: sub.question.title || '未命名项目',
      description: std.material || '',
      scoringRubric: std.rubric || '',
      standardFiles,
      studentFiles,
      // open：无标准包 → 评价式评分（prompt 不含「标准答案源码」段，system 用评审专家角色）
      mode: gradeMode,
      fixedItems,
      // ★R3-LLM-FIX（R23）：题目实际满分（可 >100）→ project schema 上限；缺省/非法由 gradeProject 归一为 100
      maxScore: Number(sub.question.maxScore) > 0 ? Number(sub.question.maxScore) : 100,
    };

    // 【M6 · 方案 b：显式让位】sidecar 不支持 open 语义与固定分项 —— 三条静态边界见
    // KNOWN_ISSUES.md「P2 已知限制」第 14 条（GradeRequest 仅 6 字段且 extra=ignore →
    // 额外字段被静默丢弃；build_messages 无条件输出 Reference 段；items 由 rubric 正则推导）。
    // 命中时不让 mode/fixedItems 在跨语言边界上被静默丢弃，而是明确改走已支持这两项能力的
    // legacy gradeProject：一处判断，能力不丢，也不再有「传了=生效」的静默分歧。
    const sidecarGap = gradeMode === 'open' || (Array.isArray(fixedItems) && fixedItems.length > 0);
    const useTrustJudge = gradingMode === 'trustjudge' && !sidecarGap;
    /** 仅当「本会选 sidecar 但因缺口让位」时记一条可检索的 info 日志 */
    const logSidecarDelegate = () => {
      if (gradingMode === 'trustjudge' && sidecarGap) {
        logger.info(
          {
            submissionId,
            gradingMode,
            delegateTo: 'legacy',
            reason: gradeMode === 'open' ? 'sidecar 不支持 open 语义' : 'sidecar 不支持固定分项',
            mode: gradeMode,
            fixedItemCount: Array.isArray(fixedItems) ? fixedItems.length : 0,
          },
          'sidecar 不支持 open/fixedItems 语义，本次改走 legacy gradeProject',
        );
      }
    };

    let result;
    try {
      if (checkerReady) {
        // 检查器就绪 → 确定性链路优先（规则执行，零 token/零波动）；
        // GRADING_MODE 只决定「LLM 后端」（legacy deepseek / trustjudge sidecar），不覆盖检查器
        logger.info({ submissionId }, '实训题评分：使用确定性检查脚本');
        result = await gradeWithChecker({
          question: sub.question,
          stuDir,
          standardFiles,
          studentFiles,
        });
      } else if (useTrustJudge) {
        result = await gradeProjectTrustJudge(gradeArgs);
      } else {
        logSidecarDelegate();
        result = await gradeProject(gradeArgs);
      }
    } catch (aiErr) {
      if (checkerReady) {
        // 检查器失败 → 降级原 LLM 链路（本次评分不中断）；降级同样遵循 GRADING_MODE 的后端选择
        logger.warn({ err: aiErr.message, submissionId }, '检查器评分失败，降级 LLM 全量评分');
        try {
          if (useTrustJudge) {
            result = await gradeProjectTrustJudge(gradeArgs);
          } else {
            logSidecarDelegate();
            result = await gradeProject(gradeArgs);
          }
        } catch (err2) {
          logger.error({ err: err2, submissionId }, '实训题评分：AI 调用失败，标记失败');
          await markFailed(submissionId, 'AI 评分服务异常');
          // ★OP-2（D1-2）：失败路径也透传本次真实模型调用用量（含 checker 降级前/后的调用）
          return { ok: false, reason: 'ai_failed', llmUsage: (err2 && err2.llm_usage) || (aiErr && aiErr.llm_usage) || null };
        }
      } else {
        logger.error({ err: aiErr, submissionId, gradingMode }, '实训题评分：AI 调用失败，标记失败');
        await markFailed(submissionId, 'AI 评分服务异常');
        return { ok: false, reason: 'ai_failed', llmUsage: (aiErr && aiErr.llm_usage) || null };
      }
    }

    // gradeProject 返回 { totalScore, breakdown[], highlights[], issues[], overallComment }
    const aiScore = Math.max(0, Math.min(sub.question.maxScore || 100, Math.round(Number(result.totalScore) || 0)));
    // 解析层强制输出约束（与提示词约束一致，超限截断，违规不落库）
    // ★R3-S5（t30 / 修法 A）：写入端补齐 title（≤80）与 status（显式优先；缺失时按 score/maxScore 推导：
    //   满分=hit / 0 分=miss / 部分得分或不可判定=null）—— 原实现只写 {item,score,maxScore,comment,kind}，
    //   读取侧按 status 聚合时整项落 unknown、失分项分布失真。其余字段与截断长度与改动前逐字一致
    //   （item ≤50、comment ≤60、score/maxScore 非数字⇒0；kind 由本处追加，保持落库形状不变）。
    const clampBreakdown = (b) => ({ ...buildLossBreakdown([b], { commentLimit: 60 })[0], kind: b.kind });
    const aiFeedback = JSON.stringify({
      // 检查器链路（规则驱动）：明细全量保留；原 LLM 链路：固定分项按分项数，降级 8 项上限
      breakdown: (Array.isArray(result.breakdown) ? result.breakdown : [])
        .slice(0, checkerReady ? undefined : (Array.isArray(fixedItems) && fixedItems.length > 0 ? fixedItems.length : 8))
        .map(clampBreakdown),
      highlights: (Array.isArray(result.highlights) ? result.highlights : []).slice(0, 5).map(s => String(s).slice(0, 100)),
      issues: (Array.isArray(result.issues) ? result.issues : []).slice(0, 5).map(s => String(s).slice(0, 100)),
      overallComment: String(result.overallComment || '').slice(0, 300),
    });

    await updateEnvelopeGrading(submissionId, (env) => {
      // 2026-08-18 冻结版本（Team C）：评分完成时锁定本次规则版本，改规则不影响历史成绩归属
      env.grading = {
        ...env.grading,
        state: 'done',
        version,
        finishedAt: new Date().toISOString(),
        error: null,
        ruleVersionHash: computeRuleVersionHash(sub.question),
        // W3（R2-B2）：本次评分依据的评分标准/标准包哈希（口径 = scripts/dsh-checker/validate.py），
        // 重评时与当前值比对 → stale（标准已变）并需教师确认；历史成绩不因比对而重算。
        rubricHash: textSha256(std.rubric),
        // ★W3-D3（t59 · A 方案）：standardHash 改为**忠实记录"本次评分实际读取的包目录哈希"**（活值）。
        //   为什么：标准包**文件**本就不随发布冻结（评分/复核读的都是当前文件 ⇒ 见 DEPLOY-CHECKLIST D8），
        //   原实现却优先记发布快照的冻结值 ⇒ "记的"与"读的"脱节 ⇒ 换包后重评**静默漏报**（t58 已登记为已知限制）。
        //   ⚠ 改的是 **submissions.answer 信封字段**，不是发布快照列 AssignmentQuestion.standard_hash
        //     （后者是 DSH 复用/ruler/run-meta 的冻结锚点，语义不得改动）。
        standardHash: standardPackSha256(sub.question.id),
        // A 之后的**来源标记**（读取侧据此与发布快照口径的历史行区分；缺省=历史行）
        standardHashSource: 'live',
        // snapshotOrigin 自 A 起仅描述 rubric/material 的来源（standardHash 与快照无关）
        // t59 完成 t58 计划的"单一真源切换"：来源标签与读取侧同源（snapshotSourceOf）
        snapshotOrigin: snapshotSourceOf(std),
      };
      return env;
    });

    // 首次评分 submitted → ai_graded；教师重评恢复 prevStatus（reviewed/published 等不被降级）
    const resumeStatus = gradingEnv.prevStatus || 'ai_graded';
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        aiScore,
        aiFeedback,
        status: resumeStatus === 'submitted' ? 'ai_graded' : resumeStatus,
        bestScore: Math.max(sub.bestScore ?? 0, aiScore),
      },
    });

    logger.info(
      { submissionId, aiScore, gradingMode, elapsed: `${Date.now() - start}ms` },
      '实训题 AI 评分完成',
    );
    // ★OP-2（D1-2）：透传 legacy gradeProject 采集的本次调用用量（open 题 usage 汇总的输入）
    return { ok: true, aiScore, llmUsage: result.llm_usage || null };
  } catch (err) {
    logger.error({ err, submissionId }, '实训题评分异常，标记失败');
    await markFailed(submissionId, '评分流程异常').catch(() => {});
    return { ok: false, reason: 'exception', llmUsage: (err && err.llm_usage) || null };
  } finally {
    release();
  }
}

// ===================== 内部辅助 =====================

async function markFailed(submissionId, error) {
  try {
    // 教师重评失败时恢复 prevStatus，不把 reviewed/published 降级（学生可见成绩不受影响）
    let resumeStatus = 'submitted';
    try {
      const cur = await prisma.submission.findUnique({ where: { id: submissionId }, select: { answer: true } });
      resumeStatus = parseProjectAnswer(cur?.answer).grading?.prevStatus || 'submitted';
    } catch { /* 读取失败走默认 submitted */ }
    await updateEnvelopeGrading(submissionId, (env) => {
      env.grading = { ...env.grading, state: 'failed', finishedAt: new Date().toISOString(), error: String(error || 'unknown') };
      return env;
    });
    // 保持 submitted / 恢复 prevStatus，不向学生暴露失败细节（R6）
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: resumeStatus,
        aiScore: 0,
        aiFeedback: ABNORMAL_FEEDBACK,
      },
    });
  } catch (e) {
    logger.error({ err: e, submissionId }, '标记实训题评分失败记录时出错');
  }
}

/**
 * 冻结版本 hash（2026-08-18 Team C）：评分时锁定本次使用的规则版本。
 * 优先级：题目 checkerMeta.activeVersionId（格式 'vN'，与 checkerService versions 数组标签一致）
 *   → 无版本号但有规则 JSON → 规则 JSON 的 sha1 前 12 位
 *   → 无规则（LLM 直评遗留/旧记录）→ null
 * 纯函数（导出供单测）；不改变既有评分逻辑与字段。
 * @param {object|null} question 题目（含 checkerMeta/checkerScript）
 * @returns {string|null}
 */
export function computeRuleVersionHash(question) {
  const meta = question && question.checkerMeta && typeof question.checkerMeta === 'object'
    ? question.checkerMeta
    : null;
  const activeVersionId = meta && meta.activeVersionId !== null && meta.activeVersionId !== undefined
    ? meta.activeVersionId
    : null;
  if (activeVersionId !== null) return 'v' + activeVersionId;
  const script = question && typeof question.checkerScript === 'string' ? question.checkerScript : null;
  if (script && script.trim()) {
    return crypto.createHash('sha1').update(script).digest('hex').slice(0, 12);
  }
  return null;
}

async function updateEnvelopeGrading(submissionId, mutator) {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { answer: true },
  });
  const env = parseProjectAnswer(sub?.answer);
  const next = mutator(env);
  await prisma.submission.update({
    where: { id: submissionId },
    data: { answer: serializeProjectAnswer(next) },
  });
}
