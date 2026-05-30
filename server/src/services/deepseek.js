import logger from '../utils/logger.js';
import { ABNORMAL_FEEDBACK, DEFAULT_MAX_SCORE } from '../constants.js';

const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

const DEFAULT_CRITERIA = `评分标准：
1. 代码正确性（60%）：代码是否能正确解决问题，逻辑是否正确
2. 代码效率（20%）：时间复杂度和空间复杂度是否合理
3. 代码可读性（20%）：命名规范、注释、代码结构`;

const ROLE = '你是一名高校计算机专业教师。你需要根据题目要求、参考答案和学生提交的代码，给出公正的评分和具体的改进意见。';

const OUTPUT_FORMAT = '请严格按以下 JSON 格式返回，不要包含任何其他文字：\n{"score": 85, "feedback": "具体的评价和改进意见..."}';

function buildSystemPrompt(scoringCriteria) {
  const criteria = scoringCriteria || DEFAULT_CRITERIA;
  return `${ROLE}\n\n${criteria}\n\n${OUTPUT_FORMAT}`;
}

/**
 * 调用 DeepSeek API 评分
 * @param {object} params
 * @param {string} params.material - 大题材料（可选）
 * @param {string} params.subQuestionTitle - 小题标题
 * @param {string} params.subQuestionContent - 小题题目内容
 * @param {string} params.referenceAnswer - 参考答案
 * @param {string} params.studentAnswer - 学生答案
 * @param {number} params.maxScore - 满分
 * @param {string} params.scoringCriteria - 自定义评分标准（可选）
 * @returns {Promise<{score: number, feedback: string}>}
 */
export async function gradeSubmission({ material, subQuestionTitle, subQuestionContent, referenceAnswer, studentAnswer, maxScore, scoringCriteria }) {
  const parts = [];
  if (material && material.replace(/<[^>]*>/g, '').trim()) {
    parts.push(`## 题目材料\n${material}`);
  }
  parts.push(`## ${subQuestionTitle || '题目'}
${subQuestionContent}

## 参考答案
${referenceAnswer}

## 学生提交的代码
${studentAnswer}

## 评分要求
满分：${maxScore} 分
请根据题目要求和参考答案对学生的代码进行评分。`);
  const userMessage = parts.join('\n\n');

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: buildSystemPrompt(scoringCriteria) },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) {
        const wait = [5, 15, 30][attempt - 1] * 1000;
        logger.warn({ attempt }, `DeepSeek API 限流，等待 ${wait / 1000}s 后重试`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        throw new Error(`DeepSeek API 返回 ${res.status}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';

      // 尝试解析 JSON
      const jsonMatch = content.match(/\{[\s\S]*"score"[\s\S]*"feedback"[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('返回格式不包含有效的 JSON');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.max(0, Math.min(maxScore, parseInt(parsed.score) || 0));

      return { score, feedback: parsed.feedback || '无评语' };
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') {
        logger.warn({ attempt }, 'DeepSeek API 超时，重试中');
      } else {
        logger.warn({ attempt, err: err.message }, 'DeepSeek API 调用失败，重试中');
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
    }
  }

  logger.error({ err: lastError }, 'DeepSeek 评分全部重试失败，返回兜底分数');
  return { score: 0, feedback: ABNORMAL_FEEDBACK };
}
