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
 * 并发：信号量限制最多 3 个评分任务并行（D6）。
 */

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import {
  gradeProject,
  gradeSubjectiveItems,
  selectImportantFiles,
  getProjectContextMode,
  summarizeRubricItems,
  getConcurrency,
} from './deepseek.js';
import { runRules } from './ruleExecutor.js';
import {
  buildFileTree,
  filterProjectFiles,
  buildFileTreeText,
  extractSkeleton,
  estimateTokens,
  truncateToBudget,
  BUDGET_TOKENS,
} from './projectContextBuilder.js';
import { ABNORMAL_FEEDBACK } from '../constants.js';
import { standardDir, submissionDir } from '../utils/projectPaths.js';
import { parseProjectAnswer, serializeProjectAnswer } from '../utils/projectView.js';
import { MAX_TEXT_BYTES } from '../utils/projectArchive.js';
import { isIgnored } from '../utils/fileTree.js';

// ===================== 并发信号量（D6：并发数读管理端 ai_concurrency，默认 16，热更新） =====================
let activeCount = 0;
let maxConcurrent = 3; // 首次评分前由 refreshConcurrency 从配置刷新（默认 16）
const waiters = [];

/**
 * 刷新并发上限（2026-08-17 并发修复）：读管理端 ai_concurrency 配置（getConfig 自带 1 分钟缓存）。
 * 入队/评分前调用，配置变更 1 分钟内生效；失败保持当前值。
 */
export async function refreshConcurrency() {
  try {
    const v = await getConcurrency();
    if (v !== maxConcurrent) {
      logger.info({ old: maxConcurrent, new: v }, '实训题评分并发配置已更新');
      maxConcurrent = v;
    }
  } catch (err) {
    logger.warn({ err: err.message }, '读取并发配置失败，保持当前值');
  }
}

function acquire() {
  return new Promise((resolve) => {
    if (activeCount < maxConcurrent) {
      activeCount += 1;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });
}

function release() {
  activeCount = Math.max(0, activeCount - 1);
  if (waiters.length && activeCount < maxConcurrent) {
    activeCount += 1;
    const next = waiters.shift();
    next();
  }
}

// ===================== 文件收集（标准包 + 学生版本） =====================

export function readDirFiles(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const walk = (base, rel = '') => {
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isIgnored(entry.name)) continue;
        walk(path.join(base, entry.name), rel + entry.name + '/');
      } else if (entry.isFile()) {
        if (isIgnored(entry.name)) continue;
        const abs = path.join(base, entry.name);
        const relPath = rel + entry.name;
        try {
          const { size } = fs.statSync(abs);
          if (size > MAX_TEXT_BYTES) {
            out.push(`// 文件过大（${relPath}，${(size / 1024 / 1024).toFixed(2)} MB），已跳过评分内容`);
            continue;
          }
          out.push(`// 文件名: ${relPath}\n${fs.readFileSync(abs, 'utf-8')}`);
        } catch {
          // 单个文件读取失败不影响整体
        }
      }
    }
  };
  walk(dir);
  return out;
}

// ===================== 评分上下文构建（2026-08-17 方案 v1.1） =====================

/**
 * 读取单个文件内容（不抛错；失败返回空字符串）。
 */
function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * 按 kept 列表读取文件正文（fold 折叠为占位行），与实评 readDirFiles 的格式保持一致。
 * @param {Array<{path, fold, size}>} kept filterProjectFiles 的 kept 输出（仅文件）
 * @param {string} base 根目录绝对路径
 * @returns {string}
 */
function readKeptFiles(kept, base) {
  return kept
    .filter(f => !f.dir)
    .map(f => (f.fold
      ? "// 文件过大（" + f.path + "，" + (f.size / 1024 / 1024).toFixed(2) + " MB），已跳过评分内容"
      : "// 文件名: " + f.path + "\n" + readFileSafe(path.join(base, f.path))))
    .join('\n\n');
}

/**
 * 构建实训题评分上下文（L0 过滤 + L1 两阶段，任一环节失败安全降级为全量注入）。
 * @param {object} p
 * @param {'off'|'filter'|'two-stage'} p.mode 配置开关（system_config.project_context_mode）
 * @param {string} p.stdDir 标准包目录
 * @param {string} p.stuDir 学生版本目录
 * @param {object} p.question 题目（title/material/scoringRubric）
 * @returns {Promise<{standardFiles: string, studentFiles: string, info: object}>}
 */

/**
 * 评分标准固定分项（2026-08-17 评分一致性方案）：懒生成 + 并发安全 + 失败降级。
 * 有缓存直接用；无缓存调 AI 提炼一次，写入 DB（UPDATE WHERE rubric_items IS NULL 防并发重复生成）；
 * 提炼失败返回 null（评分降级为模型自由分项，不阻断）。
 * @param {object} question 题目（id/scoringRubric/maxScore/rubricItems）
 * @returns {Promise<Array<{item, maxScore}>|null>}
 */

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
export async function ensureRubricItems(question) {
  if (Array.isArray(question?.rubricItems) && question.rubricItems.length > 0) {
    return question.rubricItems;
  }
  try {
    const items = await summarizeRubricItems(question?.scoringRubric || '', question?.maxScore || 100);
    if (!items || items.length === 0) return null;
    // 并发安全：仅当仍为空时写入（其他并发任务可能已写入）；
    // Prisma JSON 字段判空须用 DbNull（rubricItems: null 字面量会被拒）
    const cur = await prisma.question.findUnique({
      where: { id: question.id },
      select: { rubricItems: true },
    });
    if (!Array.isArray(cur?.rubricItems) || cur.rubricItems.length === 0) {
      await prisma.question.update({
        where: { id: question.id },
        data: { rubricItems: items },
      });
    }
    logger.info({ questionId: question.id, items: items.length }, '评分标准固定分项已生成并缓存');
    return items;
  } catch (err) {
    logger.warn({ err: err.message, questionId: question?.id }, '评分标准分项提炼失败，降级模型自由分项');
    return null;
  }
}
export async function buildGradingContext({ mode, stdDir, stuDir, question }) {
  const fallback = () => ({
    standardFiles: readDirFiles(stdDir).join('\n\n'),
    studentFiles: readDirFiles(stuDir).join('\n\n'),
    info: { mode: 'off', note: '降级全量' },
  });

  if (mode !== 'filter' && mode !== 'two-stage') return fallback();

  try {
    const stuTree = buildFileTree(stuDir);
    if (!stuTree.length) return fallback();
    const stdTree = buildFileTree(stdDir);

    const stuFiltered = filterProjectFiles(stuTree, stuDir).kept;
    const stdFiltered = filterProjectFiles(stdTree, stdDir).kept;

    let standardText = readKeptFiles(stdFiltered, stdDir);
    let studentText = readKeptFiles(stuFiltered, stuDir);
    let pickedCount = 0;

    if (mode === 'two-stage' && studentText) {
      try {
        const treeText = buildFileTreeText(stuFiltered, { withSizes: true });
        const picked = await selectImportantFiles({
          title: question.title || '未命名项目',
          fileTreeText: treeText,
          scoringRubric: question.scoringRubric || '',
        });
        const pickedPaths = new Set(picked.files);
        // 学生包根目录名可能是学号/工程名，模型返回路径不带该前缀 → 后缀匹配兜底
        const matchesPicked = (f) => pickedPaths.has(f.path)
          || [...pickedPaths].some(p => p && f.path.endsWith('/' + p) || f.path === p);
        const matchedList = stuFiltered.filter(f => !f.dir && matchesPicked(f));
        // BUG-004：强制选中文件总大小 ≤ 60KB（模型软约束之外的硬限制，按原始顺序截断）
        const pickedList = [];
        let pickedBytes = 0;
        for (const f of matchedList) {
          if (pickedBytes + f.size > 60 * 1024) break;
          pickedList.push(f);
          pickedBytes += f.size;
        }
        if (pickedList.length > 0) {
          pickedCount = pickedList.length;
          const pickedText = readKeptFiles(pickedList, stuDir);
          // 未选中文件以清单附在末尾（骨架行），模型可点名补看
          const restSkeleton = stuFiltered
            .filter(f => !f.dir && !matchesPicked(f))
            .slice(0, 300)
            .map(f => "// " + f.path + "（" + (f.size / 1024).toFixed(1) + "KB，未提供内容；如评分确需可说明理由）")
            .join('\n');
          // BUG-R2-B：被 60KB 硬拦的选中文件也要出现在清单（标注超限，模型可点名）
          const blockedSkeleton = matchedList
            .filter(f => !pickedList.includes(f))
            .map(f => "// " + f.path + "（" + (f.size / 1024).toFixed(1) + "KB，超60KB上限未提供；如评分确需可说明理由）")
            .join('\n');
          studentText = pickedText + '\n\n/* 未提供内容的文件清单 */\n' + restSkeleton
            + (blockedSkeleton ? '\n' + blockedSkeleton : '');
        }
      } catch (err) {
        logger.warn({ err: err.message, questionId: question.id }, '文件选择失败，降级为 L0 过滤注入');
      }
    }

    // 预算兜底（BUG-003/DSGN-001/DSGN-007）：双端 + 权重感知 + 骨架化，低权重文件优先牺牲
    const budgetResult = enforceBudget({
      standardText,
      studentText,
      stdFiltered,
      stuFiltered,
      stdBase: stdDir,
      stuBase: stuDir,
    });
    standardText = budgetResult.standardText;
    studentText = budgetResult.studentText;
    if (budgetResult.truncated) {
      logger.warn({ totalTokens: budgetResult.totalTokens }, '评分上下文超预算，已按权重压缩（骨架化/截断）');
    }

    if (!studentText.trim()) return fallback();

    return {
      standardFiles: standardText || '(无标准工程文件)',
      studentFiles: studentText,
      info: { mode, pickedCount },
    };
  } catch (err) {
    logger.warn({ err: err.message }, '上下文构建异常，降级全量注入');
    return fallback();
  }
}


/**
 * 预算兜底（BUG-003/DSGN-001/DSGN-007）：双端 + 权重感知 + 骨架化压缩。
 * 低权重文件优先被骨架化/占位，高权重文件保持全文；学生与标准包共用预算（7:3）。
 * @param {object} p
 * @param {string} p.standardText 标准包全文
 * @param {string} p.studentText 学生正文
 * @param {Array} p.stdFiltered 标准包 kept 列表
 * @param {Array} p.stuFiltered 学生 kept 列表
 * @param {string} p.stdBase 标准包根目录
 * @param {string} p.stuBase 学生根目录
 * @returns {{standardText: string, studentText: string, truncated: boolean, totalTokens: number}}
 */
export function enforceBudget({ standardText, studentText, stdFiltered, stuFiltered, stdBase, stuBase }) {
  const budget = BUDGET_TOKENS;
  if (estimateTokens(studentText) + estimateTokens(standardText) <= budget) {
    return { standardText, studentText, truncated: false, totalTokens: estimateTokens(studentText) + estimateTokens(standardText) };
  }

  // 权重感知压缩：高权重优先保全文（BUG-R2-C：降序，低权重最后被骨架化/占位）
  const compress = (kept, base, capTokens) => {
    const files = kept.filter(f => !f.dir).sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
    const parts = [];
    let acc = 0;
    for (const f of files) {
      if (f.fold) {
        const line = '// 文件过大（' + f.path + '，已跳过评分内容）';
        parts.push(line); acc += estimateTokens(line);
        continue;
      }
      const content = readFileSafe(path.join(base, f.path));
      const full = '// 文件名: ' + f.path + '\n' + content;
      const fullT = estimateTokens(full);
      if (acc + fullT <= capTokens) { parts.push(full); acc += fullT; continue; }
      // 骨架化兜底（DSGN-001：方案承诺的骨架链路）
      const skel = extractSkeleton(content, f.ext);
      const skelLine = '// 文件名: ' + f.path + '（骨架）\n' + skel;
      const skelT = estimateTokens(skelLine);
      if (acc + skelT <= capTokens) { parts.push(skelLine); acc += skelT; }
      else {
        const line = '// ' + f.path + '（预算限制未提供内容）';
        parts.push(line); acc += estimateTokens(line);
      }
    }
    return { text: parts.join('\n\n'), tokens: acc };
  };

  // 学生 70% 预算、标准包 30%（双端，BUG-003）
  const stu = compress(stuFiltered || [], stuBase, Math.floor(budget * 0.7));
  const std = compress(stdFiltered || [], stdBase, Math.floor(budget * 0.3));
  let out = {
    standardText: std.text || standardText,
    studentText: stu.text || studentText,
    truncated: true,
    totalTokens: stu.tokens + std.tokens,
  };
  // 最终仍超 → 字符截断（学生侧）
  if (out.totalTokens > budget) {
    const t = truncateToBudget(out.studentText, Math.floor(budget * 0.8) - std.tokens);
    out.studentText = t.text;
    out.totalTokens = estimateTokens(t.text) + std.tokens;
  }
  return out;
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
      include: { question: { select: { id: true, title: true, material: true, scoringRubric: true, maxScore: true, type: true, rubricItems: true, checkerScript: true, checkerStatus: true, checkerMeta: true } } },
    });
    if (!sub) {
      logger.warn({ submissionId }, '实训题评分：提交记录不存在，跳过');
      return;
    }
    if (sub.question?.type !== 'project') {
      logger.warn({ submissionId, type: sub.question?.type }, '实训题评分：非 project 类型，跳过');
      return;
    }
    // 幂等保护：非 pending 评分任务跳过；
    // 教师重评（regrade 置 grading.state=pending 且记录 prevStatus）时，即使 reviewed/published 也继续评分
    const gradingEnv = parseProjectAnswer(sub.answer).grading || {};
    if (gradingEnv.state !== 'pending' && (sub.status === 'reviewed' || sub.status === 'published')) {
      logger.info({ submissionId, status: sub.status }, '实训题评分：已审核/发布且无重评任务，跳过');
      return;
    }

    const stdDir = standardDir(questionId);
    const stuDir = submissionDir(questionId, studentId, version);

    // 2026-08-17 上下文管理方案 v1.1：L0 过滤 + L1 两阶段（配置开关，失败自动降级）
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
      return;
    }
    if (ctx.info.mode !== 'off') {
      logger.info({ submissionId, mode: ctx.info.mode, pickedCount: ctx.info.pickedCount || 0 }, '实训题评分：上下文构建完成');
    }

    // 评分标准固定分项（懒生成 + 缓存；失败降级为模型自由分项）
    const fixedItems = await ensureRubricItems(sub.question);

    // 2026-08-17 检查器方案：脚本就绪时走确定性链路（硬性分项零波动），失败降级原链路
    const checkerReady = sub.question.checkerStatus === 'ready' && !!sub.question.checkerScript;

    let result;
    try {
      if (checkerReady) {
        logger.info({ submissionId }, '实训题评分：使用确定性检查脚本');
        result = await gradeWithChecker({
          question: sub.question,
          stuDir,
          standardFiles,
          studentFiles,
        });
      } else {
        result = await gradeProject({
          title: sub.question.title || '未命名项目',
          description: sub.question.material || '',
          scoringRubric: sub.question.scoringRubric || '',
          standardFiles,
          studentFiles,
          fixedItems,
        });
      }
    } catch (aiErr) {
      if (checkerReady) {
        // 检查器失败 → 降级原 LLM 链路（本次评分不中断）
        logger.warn({ err: aiErr.message, submissionId }, '检查器评分失败，降级 LLM 全量评分');
        try {
          result = await gradeProject({
            title: sub.question.title || '未命名项目',
            description: sub.question.material || '',
            scoringRubric: sub.question.scoringRubric || '',
            standardFiles,
            studentFiles,
            fixedItems,
          });
        } catch (err2) {
          logger.error({ err: err2, submissionId }, '实训题评分：AI 调用失败，标记失败');
          await markFailed(submissionId, 'AI 评分服务异常');
          return;
        }
      } else {
        logger.error({ err: aiErr, submissionId }, '实训题评分：AI 调用失败，标记失败');
        await markFailed(submissionId, 'AI 评分服务异常');
        return;
      }
    }

    // gradeProject 返回 { totalScore, breakdown[], highlights[], issues[], overallComment }
    const aiScore = Math.max(0, Math.min(sub.question.maxScore || 100, Math.round(Number(result.totalScore) || 0)));
    // BUG-008：解析层强制输出约束（与提示词约束一致，超限截断，违规不落库）
    const clampBreakdown = (b) => ({
      item: String(b.item || '').slice(0, 50),
      score: Number(b.score) || 0,
      maxScore: Number(b.maxScore) || 0,
      comment: String(b.comment || '').slice(0, 60),
      kind: b.kind, // 检查器链路标记 'checker'/'ai'；原链路无该字段
    });
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
      { submissionId, aiScore, elapsed: `${Date.now() - start}ms` },
      '实训题 AI 评分完成',
    );
  } catch (err) {
    logger.error({ err, submissionId }, '实训题评分异常，标记失败');
    await markFailed(submissionId, '评分流程异常').catch(() => {});
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
    } catch (e) { /* 读取失败走默认 submitted */ }
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
