/**
 * submission-grading.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 60-157）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import logger from '../../../utils/logger.js';
import { ABNORMAL_FEEDBACK } from '../../../constants.js';
import { getBaseUrl, getApiKey, getModel } from './config.js';
import { buildSystemPrompt } from '../../../domain/services/deepseek/prompts.js';

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

## 学生提交的答案
${studentAnswer}

## 评分要求
满分：${maxScore} 分
请判断题目类型（编程题/理论题/混合题），选择合适的评分标准，根据参考答案对学生答案进行评分。`);
  const userMessage = parts.join('\n\n');

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
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
          // V4-Flash 推理模型，max_tokens 含思考 token，2000 偏紧 → 4000
          max_tokens: 4000,
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
