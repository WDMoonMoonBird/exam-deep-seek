/**
 * project-grading-context.js — 实训题评分上下文构建（L0 过滤 / L1 两阶段 / 预算兜底 / 固定分项）
 *
 * B1 行为不变拆分：自 services/projectGrading.js 原样搬出（buildGradingContext :155-163/:258-348、
 * ensureRubricItems :165-171/:232-257、enforceBudget :351-363/:363-413），只搬不改。
 * ★落位偏差（相对 A2 清单的 application/ 建议）：本模块直接依赖 fs 读取与 AI 选择器（infrastructure），
 *   而 check-layers 禁止 application → infrastructure，故落 infrastructure/ai/（同层，零违规）。
 *   若改落 application/ 需把读取器/选择器改为依赖注入 ⇒ 会改 buildGradingContext 的导出签名（违反「接口契约不变」）。
 */
import path from 'path';
import logger from '../../utils/logger.js';
import prisma from '../../utils/prisma.js';
import { selectImportantFiles, summarizeRubricItems } from './deepseek/index.js';
import {
  buildFileTree,
  filterProjectFiles,
  buildFileTreeText,
  extractSkeleton,
  estimateTokens,
  truncateToBudget,
  BUDGET_TOKENS,
} from '../../services/projectContextBuilder.js';
import { readDirFiles, readFileSafe, readKeptFiles } from '../storage/project-tree-read.js';

/**
 * 构建实训题评分上下文（L0 过滤 + L1 两阶段，任一环节失败安全降级为全量注入）。
 * @param {object} p
 * @param {'off'|'filter'|'two-stage'} p.mode 配置开关（system_config.project_context_mode）
 * @param {string} p.stdDir 标准包目录
 * @param {string} p.stuDir 学生版本目录
 * @param {object} p.question 题目（title/material/scoringRubric）
 * @returns {Promise<{standardFiles: string, studentFiles: string, info: object}>}
 */
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
        // 强制选中文件总大小 ≤ 60KB（模型软约束之外的硬限制，按原始顺序截断）
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
          // 被 60KB 硬拦的选中文件也要出现在清单（标注超限，模型可点名）
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

    // 预算兜底：双端 + 权重感知 + 骨架化，低权重文件优先牺牲
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
 * 评分标准固定分项（2026-08-17 评分一致性方案）：懒生成 + 并发安全 + 失败降级。
 * 有缓存直接用；无缓存调 AI 提炼一次，写入 DB（UPDATE WHERE rubric_items IS NULL 防并发重复生成）；
 * 提炼失败返回 null（评分降级为模型自由分项，不阻断）。
 * @param {object} question 题目（id/scoringRubric/maxScore/rubricItems）
 * @returns {Promise<Array<{item, maxScore}>|null>}
 */
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

/**
 * 预算兜底：双端 + 权重感知 + 骨架化压缩。
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

  // 权重感知压缩：高权重优先保全文（降序，低权重最后被骨架化/占位）
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
      // 骨架化兜底（低权重文件转为骨架表示）
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

  // 学生 70% 预算、标准包 30%（双端）
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
