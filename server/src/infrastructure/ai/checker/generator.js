/**
 * generator.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 41-42 · 49-50 · 53-54 · 57-58 · 159-167 · 816-831 · 833-1159）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import fs from 'fs';
import prisma from '../../../utils/prisma.js';
import logger from '../../../utils/logger.js';
import { parseCheckerRules, findMisplacedSubjective } from '../../../domain/services/checker/parsers.js';
import { DEFAULT_THRESHOLD, attachNegativeFeedback, appendVersion, markDefectReportItems, buildReport } from '../../../domain/services/checker/meta.js';
import { GENERATE_SYSTEM, buildGenerateUserPrompt, buildCalibrateUserPrompt } from './prompts.js';
import { callLlm } from './llm.js';
import { packageFingerprint, collectProjectPaths, validateRulePaths, enrichDeductionSnippets } from './package-inspect.js';
import { summarizeRubricItems } from '../deepseek/index.js';
import { buildFileTree, filterProjectFiles, buildFileTreeText } from '../../../services/projectContextBuilder.js';
import { standardDir } from '../../../utils/projectPaths.js';
import { runRules, resolveProjectRoot } from '../../rule/index.js';
import { validateNegativeTests } from '../../../services/ruleMutator.js';
import { extractFacts } from '../../../services/factExtractor.js';

/** 自举校准最大轮数（超轮未达标 → 缺陷豁免后达标进 review / 否则 failed；2026-08-18 由 8 轮收紧为 3 轮，配合阈值达标机制已足够） */
const MAX_ROUNDS = 3;

/** 题目满分缺失时的兜底值 */
const DEFAULT_MAX_SCORE = 100;

/** 生成状态超过该时长视为陈旧（服务重启/崩溃中断），允许重新生成 */
const STALE_GENERATION_MS = 15 * 60 * 1000;

/** 校准连续同分 ≥ 该轮数 → 下一轮改为全新生成（§4.2 轻量版，防原地踏步） */
const STUCK_ROUNDS = 3;

/** RichEditor 的 material 是 HTML：转纯文本（供提示词与输入快照使用） */
function stripHtml(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * 将题目标记为 failed 并落库（meta.error 说明失败原因）。
 * @param {number} id 题目 id
 * @param {object} meta 运行期 meta（引用）
 * @param {string} error 失败说明
 * @returns {Promise<{status: string, error: string}>}
 */
async function markFailed(id, meta, error) {
  meta.error = error;
  await prisma.question.update({
    where: { id },
    data: { checkerStatus: 'failed', checkerMeta: meta },
  });
  logger.error({ questionId: id, error }, 'checkerService: 评分规则生成失败（failed）');
  return { status: 'failed', error };
}

/**
 * AI 生成 JSON 评分规则 + 自举校准（核心入口，规则驱动）。
 * 流程：置 generating → 第 1 轮 LLM 生成规则 JSON → parseCheckerRules →
 * runRules(规则, 标准包) 执行 → 满分则 ready；达标（≥阈值）则 review（交教师确认，
 * 含体检报告与版本快照）；未达标则构造校准反馈让 LLM 修正参数（round+1）→ 重跑；
 * ≤ MAX_ROUNDS 轮；多轮取最优规则。超轮后最优仍达标 → review，否则 failed。
 * LLM 调用失败重试 2 次；仍失败 → failed+error。已在 generating/calibrating 时幂等返回。
 * 规则存储：questions.checkerScript 字段存规则 JSON 文本（字段名不变，前端兼容）。
 * @param {number|string} questionId 题目 id
 * @returns {Promise<{status: string, rounds?: number, totalScore?: number, error?: string}|null>}
 */
export async function generateChecker(questionId) {
  const id = +questionId;
  const question = await prisma.question.findUnique({
    where: { id },
    select: {
      id: true, maxScore: true, scoringRubric: true, checkerStatus: true,
      rubricItems: true, material: true,
    },
  });
  if (!question) {
    logger.warn({ questionId: id }, 'checkerService: 题目不存在，无法生成评分规则');
    return null;
  }
  // 幂等：generating/calibrating 且 15 分钟内活跃 → 直接返回；陈旧状态（服务重启中断等）允许重新生成
  if (question.checkerStatus === 'generating' || question.checkerStatus === 'calibrating') {
    const started = Number((question.checkerMeta && question.checkerMeta.startedAt) || 0);
    if (Date.now() - started < STALE_GENERATION_MS) {
      logger.info({ questionId: id }, 'checkerService: 已在生成中，幂等返回');
      return { status: 'generating' };
    }
    logger.warn({ questionId: id, started }, 'checkerService: 检测到陈旧生成状态，允许重新生成');
  }
  const maxScore = Math.max(0, Number(question.maxScore) || DEFAULT_MAX_SCORE);
  const rubric = (question.scoringRubric || '').trim() || '默认评分标准：功能完整性 / 代码规范性 / 健壮性';

  const meta = {
    rounds: 0, rules: null, items: [], subjective: [], log: [], error: null,
    report: null, versions: [], inputsSnapshot: null, threshold: DEFAULT_THRESHOLD, activeVersionId: null,
    startedAt: Date.now(),
  };
  await prisma.question.update({
    where: { id },
    data: { checkerStatus: 'generating', checkerMeta: meta },
  });
  logger.info({ questionId: id, maxScore }, 'checkerService: 开始生成评分规则（自举校准）');

  const rootDir = standardDir(id);
  if (!fs.existsSync(rootDir)) {
    logger.warn({ questionId: id, rootDir }, 'checkerService: 标准工程包目录不存在');
    return markFailed(id, meta, '标准工程包目录不存在：' + rootDir + '。可能标准包本身有瑕疵，请人工确认。');
  }
  // 输入快照：保存守卫用（评分标准/满分/描述/标准包任一变更 → 提示重新生成）
  meta.inputsSnapshot = {
    rubric: (question.scoringRubric || '').trim(),
    maxScore,
    description: stripHtml(question.material),
    packageFingerprint: packageFingerprint(rootDir),
  };
  await prisma.question.update({
    where: { id },
    data: { checkerMeta: meta },
  });

  // 分项必须来自题干+评分标准：优先用 rubricItems 固定分项，无则提炼一次并落库缓存
  // （BUG-B-03 修复：提炼结果含 automation_level 三分类，必须写回 rubricItems，
  //   否则每次生成重复提炼（成本+方差）且分类不可复查；评分标准变更时由前端清空重建）
  let fixedItems = Array.isArray(question.rubricItems) && question.rubricItems.length > 0 ? question.rubricItems : null;
  if (!fixedItems) {
    try { fixedItems = await summarizeRubricItems(rubric, maxScore); } catch { fixedItems = null; }
    if (Array.isArray(fixedItems) && fixedItems.length > 0) {
      try {
        await prisma.question.update({ where: { id }, data: { rubricItems: fixedItems } });
      } catch (err) {
        logger.warn({ questionId: id, err: String(err && err.message ? err.message : err) }, 'checkerService: rubricItems 缓存写回失败（不影响生成）');
      }
    }
  }

  // 工程根（规则路径以此解析）与标准包文件树（第 1 轮生成与校准反馈共用的事实依据）
  // 2026-08-18 L1 修正：树文本基于 projectRoot 生成，模型看到的路径 = 规则执行解析的路径，
  // 避免标准包外层目录前缀（如 demo2/）导致模型路径引用与执行不一致。
  const projectRoot = resolveProjectRoot(rootDir);
  const stdTree = buildFileTree(projectRoot);
  const stdTreeText = buildFileTreeText(filterProjectFiles(stdTree, projectRoot).kept, { withSizes: false });
  // P0-1：标准包语言检测（决定 prompt 注入的 fact 字段清单；失败/未知回退 JS 兼容旧题）
  let stdLanguage = 'javascript';
  try {
    const stdFacts = extractFacts(rootDir);
    if (stdFacts && (stdFacts.language === 'java' || stdFacts.language === 'python')) stdLanguage = stdFacts.language;
  } catch (err) {
    logger.warn({ questionId: id, err: String(err && err.message ? err.message : err) }, 'checkerService: 标准包语言检测失败，回退 JS fact 清单');
  }
  // L1：路径白名单（一次性构建，每轮校验）
  const projectPaths = collectProjectPaths(projectRoot);

  let bestRules = null;
  let bestScore = -1;
  let bestDefectIds = new Set();
  // 上一轮有效规则：供校准提示让模型基于它修正参数（改 rule_type/params/max_score，不是重写代码）
  let lastRules = null;
  // 上一轮反馈：运行成功 → { result, deductions }；解析/运行失败 → { error }
  let lastFeedback = null;
  // 卡死检测：连续同分 ≥ STUCK_ROUNDS → 下一轮全新生成（防原地踏步）
  let lastTotalScore = null;
  let stuckCount = 0;

  // 单轮执行：解析 → 结构检查 → L1 路径白名单 → runRules；失败抛错（错误信息即校准反馈）
  // 2026-08-18：解析失败时给出针对性提示（缺 subjective_items / 缺 objective_items），替代模糊的总和错误
  const evaluateRound = async (output) => {
    const rules = parseCheckerRules(output);
    if (!rules) {
      const raw = typeof output === 'string' ? output : '';
      const hasMax = /"max_score"\s*:/.test(raw);
      const hasObj = /"objective_items"\s*:/.test(raw);
      const hasSub = /"subjective_items"\s*:/.test(raw);
      if (hasMax && hasObj && !hasSub) {
        throw new Error('规则解析失败：缺少 subjective_items 数组（无主观项时必须输出空数组 []）');
      }
      if (hasMax && !hasObj) {
        throw new Error('规则解析失败：缺少 objective_items 数组');
      }
      throw new Error('规则解析失败：模型输出不是合法评分规则 JSON（请严格按【规则格式】输出：max_score + objective_items/subjective_items 数组）');
    }
    if (rules.objective_items.length === 0 && rules.subjective_items.length === 0) {
      throw new Error('规则解析失败：objective_items 与 subjective_items 全部无效。每项必须包含：item（规则中文描述，不是 name）、rule_type（白名单内）、params（对象）、max_score（正整数）；请按【规则格式】重新输出。');
    }
    // Team B 三分类校验：subjective 分类的固定分项不得被生成为 objective 规则
    // （复用现有校准错误通道：抛错 → 下一轮校准反馈，错误信息指明具体分项名）
    const misplaced = findMisplacedSubjective(rules, fixedItems);
    if (misplaced.length > 0) {
      throw new Error('规则校准校验失败：「主观」分类分项被错误生成为客观规则（objective_items），'
        + '请将这些分项移除并原样放入 subjective_items：' + misplaced.join('、'));
    }
    // L1 路径白名单校验（§4.1 标准包缺陷候选机制，2026-08-18）：
    // 规则引用标准包不存在的文件 → 不判死整轮；标记为缺陷候选（评分标准要求但标准包未实现），
    // 保留在规则中（学生仍按此评分），从校准得分中豁免（标准包自身缺陷，交教师确认/转主观）。
    const pathErrors = validateRulePaths(rules, projectPaths);
    const missingPathIds = new Set(pathErrors.map((e) => e.id));
    // 执行器契约：runRules(rules, rootDir) → { totalScore, items, subjective, groupSummary }
    const result = await runRules(rules, rootDir);
    const totalScore = Number(result && result.totalScore) || 0;
    return { rules, result, totalScore, missingPathIds };
  };

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    meta.rounds = round;
    const fresh = round === 1 || stuckCount >= STUCK_ROUNDS;
    if (fresh) stuckCount = 0;
    const promptForRound = fresh
      ? buildGenerateUserPrompt(rubric, maxScore, fixedItems, stdTreeText, stripHtml(question.material), stdLanguage)
      : buildCalibrateUserPrompt(lastFeedback, stdTreeText, fixedItems, lastRules);
    logger.info({ questionId: id, round, fresh: fresh && round > 1 }, 'checkerService: 第 ' + round + ' 轮生成规则');
    if (fresh && round > 1) logger.info({ questionId: id, round }, 'checkerService: 卡死 ≥' + STUCK_ROUNDS + ' 轮，改为全新生成');

    let output = null;
    let outcome = null; // { rules, result, totalScore } | null（失败）
    let lastErrMsg = '';
    // 每轮同 prompt 最多尝试 2 次：模型偶发格式崩坏时同 prompt 重试，不污染校准反馈（2026-08-18）
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        output = await callLlm(GENERATE_SYSTEM, promptForRound);
      } catch (err) {
        logger.error({ questionId: id, err: err.message }, 'checkerService: LLM 调用失败，终止生成');
        return markFailed(id, meta, 'LLM 调用失败：' + err.message);
      }
      try {
        outcome = await evaluateRound(output);
        break;
      } catch (err) {
        lastErrMsg = String(err && err.message ? err.message : err);
        logger.warn({ questionId: id, round, attempt, err: lastErrMsg.slice(0, 200) }, 'checkerService: 本轮尝试失败');
      }
    }

    if (!outcome) {
      // ★R3-LLM-OUT（L5）：**不再把模型输出片段写入 DB**（checkerMeta.log 会被前端读取/导出）——
      //   仅保留可诊断的长度元数据；错误类别仍由 lastErrMsg 表达。
      const outputLength = output ? String(output).length : 0;
      meta.log.push({ round, totalScore: null, detail: '本轮规则检查失败：' + lastErrMsg.slice(0, 300), modelOutputLength: outputLength });
      lastFeedback = { error: lastErrMsg };
      await prisma.question.update({ where: { id }, data: { checkerMeta: meta } });
      logger.warn({ questionId: id, round, err: lastErrMsg }, 'checkerService: 本轮规则检查失败');
      continue;
    }

    const { rules, result, totalScore, missingPathIds } = outcome;
    // 缺陷候选项（标准包未实现但评分标准要求）：从校准得分中豁免（§4.1 标准包 ≠ 满分答案）
    const defectItems = rules.objective_items.filter((i) => missingPathIds.has(i.id));
    const defectSum = defectItems.reduce((s, i) => s + i.max_score, 0);
    const calibScore = totalScore + defectSum;
    // 真实失分（非缺陷候选）：文件存在但规则未匹配/未满足 → 应通过校准修正
    const realDeductionSum = (Array.isArray(result.items) ? result.items : [])
      .filter((it) => it.score < it.max_score && !missingPathIds.has(it.id))
      .reduce((s, it) => s + (it.max_score - it.score), 0);
    // 负例验证（Team A）：对标准包上通过的规则派生确定性缺陷变体，判定目标规则必失分（防过拟合）。
    // 入参为**解压根目录 rootDir（未解析）**（BUG-A-03：传已解析的 projectRoot 会导致嵌套工程
    // 二次下钻、规则路径全部失配、covered=0）；异常 catch 后跳过，绝不因负例验证失败而终止生成流程；
    // weak 规则不阻塞达标判定，但进入修复反馈。
    let neg = { covered: 0, skipped: [], weakRules: [], variantsRun: 0 };
    const passedRules = (Array.isArray(result.items) ? result.items : []).filter((it) => it.score === it.max_score);
    if (passedRules.length > 0) {
      try {
        neg = await validateNegativeTests(rules, rootDir, { concurrency: 4 });
      } catch (err) {
        logger.warn(
          { questionId: id, err: String(err && err.message ? err.message : err) },
          'checkerService: 负例验证异常，跳过（不影响生成流程）',
        );
        neg = {
          covered: 0,
          skipped: [{ id: '*', reason: '负例验证异常：' + String(err && err.message ? err.message : err).slice(0, 200) }],
          weakRules: [],
          variantsRun: 0,
        };
      }
    }
    const negDetail = neg.weakRules.length > 0
      ? '；负例验证：' + neg.weakRules.length + ' 条弱规则（覆盖 ' + neg.covered + '，跳过 ' + neg.skipped.length + '）'
      : (neg.covered > 0 || neg.skipped.length > 0
          ? '；负例验证：覆盖 ' + neg.covered + '，跳过 ' + neg.skipped.length
          : '');
    meta.log.push({
      round,
      totalScore,
      detail: 'totalScore=' + totalScore + ' / ' + rules.max_score
        + '（objective ' + (Array.isArray(result.items) ? result.items.length : 0)
        + ' 项，subjective ' + (Array.isArray(result.subjective) ? result.subjective.length : 0) + ' 项'
        + (defectItems.length ? '；缺陷候选 ' + defectItems.length + ' 项（豁免 ' + defectSum + ' 分）' : '') + '）'
        + negDetail,
    });
    if (calibScore > bestScore) {
      bestScore = calibScore;
      bestRules = rules;
      bestDefectIds = new Set(missingPathIds);
    }
    // 卡死检测
    if (lastTotalScore !== null && totalScore === lastTotalScore) stuckCount += 1;
    else stuckCount = 0;
    lastTotalScore = totalScore;
    // 规则存储：checkerScript 字段存规则 JSON 文本（字段名不变，前端兼容）
    const rulesText = JSON.stringify(rules);
    await prisma.question.update({ where: { id }, data: { checkerScript: rulesText, checkerMeta: { ...meta } } });
    // 第 1 轮之后进入校准态（前端轮询展示"校准中"）
    if (round === 1) {
      await prisma.question.update({ where: { id }, data: { checkerStatus: 'calibrating' } });
    }
    // 满分/达标判定：校准得分达标（calibScore = totalScore + 缺陷候选豁免分）且真实失分为 0
    // （真实失分 = 规则参数问题，应继续校准修正；缺陷候选豁免仅用于防标准包缺陷卡死）
    const subSumCheck = (rules.subjective_items || []).reduce((s, x) => s + (Number(x.max_score) || 0), 0);
    const threshold = meta.threshold || DEFAULT_THRESHOLD;
    if (calibScore >= rules.max_score - subSumCheck && realDeductionSum === 0) {
      meta.rules = rules;
      meta.items = Array.isArray(result.items) ? result.items : [];
      meta.subjective = Array.isArray(result.subjective) ? result.subjective : [];
      buildReport(meta, rules, result.items, rules.max_score);
      markDefectReportItems(meta, missingPathIds);
      appendVersion(meta, rulesText, 'active', '校准满分就绪（校准得分 ' + calibScore + '/' + rules.max_score + ' 分' + (defectItems.length ? '，含 ' + defectItems.length + ' 项缺陷候选豁免' : '') + '）');
      await prisma.question.update({
        where: { id },
        data: { checkerStatus: 'ready', checkerScript: rulesText, checkerMeta: { ...meta, error: null } },
      });
      logger.info(
        { questionId: id, round, totalScore, calibScore, defectCount: defectItems.length },
        'checkerService: 生成通过，评分规则就绪（ready）',
      );
      return { status: 'ready', rounds: round, totalScore };
    }
    // 置信度阈值达标（如 ≥90/100）：标准包缺陷豁免后达标且无真实失分 → review（2026-08-18 §4.1）
    if (calibScore >= threshold && realDeductionSum === 0) {
      meta.rules = rules;
      meta.items = Array.isArray(result.items) ? result.items : [];
      meta.subjective = Array.isArray(result.subjective) ? result.subjective : [];
      buildReport(meta, rules, result.items, rules.max_score);
      markDefectReportItems(meta, missingPathIds);
      appendVersion(meta, rulesText, 'draft', '校准达标（校准得分 ' + calibScore + '/' + rules.max_score + ' 分，阈值 ≥' + threshold + '，含 ' + defectItems.length + ' 项缺陷候选豁免），待教师确认');
      await prisma.question.update({
        where: { id },
        data: { checkerStatus: 'review', checkerScript: rulesText, checkerMeta: { ...meta, error: null } },
      });
      logger.info(
        { questionId: id, round, totalScore, calibScore, defectCount: defectItems.length },
        'checkerService: 校准达标进入 review，等待教师确认',
      );
      return { status: 'review', rounds: round, totalScore };
    }
    // 未达标：记录本轮规则与扣分项（附文件片段，L2，缺陷候选除外），下一轮让模型修正规则参数
    lastRules = rules;
    // 负例验证接线：weakRules（区分度不足）随反馈进入下一轮校准 prompt（若本轮无通过规则则为空数组）
    lastFeedback = attachNegativeFeedback({
      result,
      defectItems: defectItems.map((i) => i.item + '（' + i.max_score + ' 分）'),
      deductions: enrichDeductionSnippets(
        projectRoot,
        rules.objective_items,
        (Array.isArray(result.items) ? result.items : [])
          .filter((it) => it.score < it.max_score && !missingPathIds.has(it.id)),
      ),
    }, neg.weakRules);
  }
  // 多轮未满分：若最优规则的校准得分（含缺陷候选豁免）达到阈值 → review（教师确认/处理失分项）；否则 failed
  const threshold = meta.threshold || DEFAULT_THRESHOLD;
  if (bestRules && bestScore >= threshold) {
    meta.rules = bestRules;
    const bestText = JSON.stringify(bestRules);
    try {
      const bestResult = await runRules(bestRules, rootDir);
      meta.items = Array.isArray(bestResult.items) ? bestResult.items : [];
      buildReport(meta, bestRules, bestResult.items, bestRules.max_score);
      markDefectReportItems(meta, bestDefectIds);
    } catch {
      meta.report = null;
    }
    appendVersion(meta, bestText, 'draft', '多轮最优规则达标（校准得分 ' + bestScore + '/' + maxScore + ' 分，阈值 ≥' + threshold + '），待教师确认');
    await prisma.question.update({
      where: { id },
      data: { checkerStatus: 'review', checkerScript: bestText, checkerMeta: { ...meta, error: null } },
    });
    logger.info({ questionId: id, bestScore }, 'checkerService: 多轮最优规则达标进入 review');
    return { status: 'review', rounds: MAX_ROUNDS, totalScore: bestScore };
  }
  // 保留最优规则（供人工查看/继续），标记 failed
  if (bestRules) {
    meta.rules = bestRules;
    await prisma.question.update({ where: { id }, data: { checkerScript: JSON.stringify(bestRules), checkerMeta: { ...meta } } });
  }
  const reason = '生成 ' + MAX_ROUNDS + ' 轮后标准包最高得分 ' + bestScore + '/' + maxScore + ' 分，低于就绪阈值（≥' + threshold + '）。可能标准包本身有瑕疵或检查规则过严，请人工确认。';
  return markFailed(id, meta, reason);
}
