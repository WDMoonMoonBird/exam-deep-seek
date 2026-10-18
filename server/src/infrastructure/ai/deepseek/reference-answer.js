/**
 * reference-answer.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 388-454）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import logger from '../../../utils/logger.js';
import { getBaseUrl, getApiKey, getModel } from './config.js';
import { GEN_ROLE, GEN_RULES } from '../../../domain/services/deepseek/prompts.js';
import { fencedDataBlock } from '../prompt-injection-guard.js';   // ★R3-LLM-FIX：材料/题目/评分标准 = 数据段 ⇒ 随机 nonce 围栏

/**
 * 调用 DeepSeek API 生成参考答案
 * @returns {Promise<string>} 参考答案代码
 */
export async function generateReferenceAnswer({ material, stem, scoringCriteria }) {
  // ★R3-LLM-FIX（P1）：材料/题目/评分标准均为数据段 ⇒ 随机 nonce 围栏（此前内联裸拼）
  const parts = [];
  if (material && material.replace(/<[^>]*>/g, '').trim()) {
    parts.push('## 题目材料\n' + fencedDataBlock('MATERIAL_DATA', material.replace(/<[^>]*>/g, '')));
  }
  parts.push('## 题目\n' + fencedDataBlock('STEM_DATA', (stem || '').replace(/<[^>]*>/g, '')));
  if (scoringCriteria) {
    parts.push('## 评分标准\n' + fencedDataBlock('RUBRIC_DATA', scoringCriteria));
  }
  const userMessage = parts.join('\n\n') + '\n\n请根据以上内容编写参考答案：';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: `${GEN_ROLE}\n\n${GEN_RULES}` },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) {
        const wait = [5, 15][attempt - 1] * 1000;
        logger.warn({ attempt }, `生成参考答案限流，等待 ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);

      const data = await res.json();
      const content = (data.choices?.[0]?.message?.content || '').trim();
      // 移除 AI 可能添加的 markdown 代码块标记（对纯文本答案无影响）
      const code = content.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
      logger.info({ length: code.length }, '参考答案生成完成');
      return code || content;

    } catch (err) {
      if (err.name === 'AbortError') {
        logger.warn({ attempt }, '生成参考答案超时');
      } else {
        logger.warn({ attempt, err: err.message }, '生成参考答案失败');
      }
      if (attempt >= 2) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  throw new Error('参考答案生成全部重试失败');
}
