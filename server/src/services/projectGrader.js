/**
 * projectGrader.js —— 三方评分引擎组合入口（P6 拆分后）。
 * 机器校验 → CompileExecutor（infrastructure/execution）；AST 启发式 → AstAnalyzer；
 * 加权计算 → 领域层 weightedTotal；AI 评审保留本文件（TODO P6b：迁移 DeepSeekGateway + SystemConfigRepository）。
 * 对外 API 与拆分前完全一致（gradeMachine / gradeAST / gradeAI / calculateTotal）。
 */

import logger from '../utils/logger.js';
import '../utils/fileTree.js';
import { CompileExecutor } from '../infrastructure/execution/compile-executor.js';
import { AstAnalyzer } from '../infrastructure/execution/ast-analyzer.js';
import { buildFileList } from '../infrastructure/execution/project-file-utils.js';
import { weightedTotal } from '../domain/services/scoring.service.js';
import { DeepSeekGateway } from '../infrastructure/ai/deepseek-gateway.js';
import { SystemConfigRepository } from '../infrastructure/persistence/system-config.repository.js';
import prisma from '../utils/prisma.js';

const compileExecutor = new CompileExecutor({ logger });
const astAnalyzer = new AstAnalyzer({ logger });

/**
 * P0 编译检查（委托 CompileExecutor，行为等价）。
 * @param {string} dir - 提交目录路径
 * @param {object} [config] - 机器校验配置 { checkCompile: true }
 * @returns {Promise<{passed: boolean, score: number, feedback: string, details: object}>}
 */
export async function gradeMachine(dir, config = {}) {
  return compileExecutor.compileCheck(dir, config);
}

/**
 * P0 启发式 AST 分析（委托 AstAnalyzer，行为等价）。
 * @param {string} dir - 提交目录路径
 * @param {string} [language] - 编程语言
 * @returns {Promise<{score: number, feedback: string, stats: object}>}
 */
export async function gradeAST(dir, language = 'java') {
  return astAnalyzer.analyze(dir, language);
}

// ==================== AI 评审 ====================

/**
 * AI 评审 — 调用 DeepSeek API 对比标准工程与学生提交
 * @param {string} standardDir - 标准工程目录
 * @param {string} submissionDir - 学生提交目录
 * @param {string} [promptExtra] - 教师自定义提示词
 * @returns {Promise<{score: number, feedback: string}>}
 */
const projectAiGateway = new DeepSeekGateway({
  configRepo: new SystemConfigRepository({ prisma, logger }),
  logger,
});

export async function gradeAI(standardDir, submissionDir, promptExtra = '') {
  try {
    const standardFiles = buildFileList(standardDir);
    const submissionFiles = buildFileList(submissionDir);
    return projectAiGateway.gradeProject({ standardFiles, submissionFiles, promptExtra });
  } catch (err) {
    logger.error({ err }, 'AI评审异常');
    return { score: 0, feedback: 'AI 评审失败: ' + (err.message || '未知错误') };
  }
}
export const calculateTotal = weightedTotal;