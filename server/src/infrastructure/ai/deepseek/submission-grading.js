/**
 * submission-grading.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 60-157）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import logger from '../../../utils/logger.js';
import { ABNORMAL_FEEDBACK } from '../../../constants.js';
import { schemaScoreFeedback } from '../../../domain/services/deepseek/model-output-schema.js';   // ★M9/H8
import { getBaseUrl, getApiKey, getModel } from './config.js';
import { buildSystemPrompt, DEFAULT_CRITERIA } from '../../../domain/services/deepseek/prompts.js';
import { criteriaDataBlock as buildCriteriaDataBlock, fencedDataBlock } from '../prompt-injection-guard.js';   // ★R3-LLM-INJ/FIX：随机 nonce 围栏

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
  // ★R3-LLM-FIX（R23 同型）：maxScore 先做有限数归一（缺省/0/负数/非数字 ⇒ 100），schema 与 clamp 用**同一变量**
  const limit = Number.isFinite(Number(maxScore)) && Number(maxScore) > 0 ? Number(maxScore) : 100;
  // ★R3-LLM-FIX：材料/小题/参考答案/学生答案 = 数据段 ⇒ 随机 nonce 围栏（此前内联裸拼）
  const parts = [];
  if (material && material.replace(/<[^>]*>/g, '').trim()) {
    parts.push('## 题目材料\n' + fencedDataBlock('MATERIAL_DATA', material));
  }
  parts.push('## ' + (subQuestionTitle || '题目') + '\n' + fencedDataBlock('SUBQUESTION_DATA', subQuestionContent)
    + '\n\n## 参考答案\n' + fencedDataBlock('REFERENCE_ANSWER_DATA', referenceAnswer || '（无）')
    + '\n\n## 学生提交的答案\n' + fencedDataBlock('STUDENT_ANSWER_DATA', studentAnswer || '（空）')
    + '\n\n## 评分要求\n满分：' + limit + ' 分\n请判断题目类型（编程题/理论题/混合题），选择合适的评分标准，根据参考答案对学生答案进行评分。');
  // ★L4：教师自定义标准降为 **user 段数据块**（system 已静态化，不再承载半可信输入）
  parts.push(buildCriteriaDataBlock(scoringCriteria || DEFAULT_CRITERIA));
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
            { role: 'system', content: buildSystemPrompt() },   // ★L4：静态 system
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
      // ★M9/H8：统一 schema 校验（类型 + 区间）。不合法即抛 ⇒ 落进既有重试循环 ⇒ 三次后走既有
      //   return { score: 0, feedback: ABNORMAL_FEEDBACK } 分支；越界分值**在此被拒**（既有 clamp 保留为第二道，未弱化）
      const checked = schemaScoreFeedback(parsed, { maxScore: limit });
      if (!checked) throw new Error('返回格式不包含有效的 JSON');
      const score = Math.max(0, Math.min(limit, Math.round(checked.score)));

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
