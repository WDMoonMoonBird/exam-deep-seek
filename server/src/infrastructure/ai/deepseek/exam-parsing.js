/**
 * exam-parsing.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 233-373）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import logger from '../../../utils/logger.js';
import { getBaseUrl, getApiKey, getModel } from './config.js';
import { PARSE_ROLE, PARSE_RULES } from '../../../domain/services/deepseek/prompts.js';

/**
 * 调用 DeepSeek API 解析试卷
 * @param {string} paperText - 试卷文本内容
 * @returns {Promise<{questions: Array}>}
 */
export async function parseExamPaper(paperText) {
  const userMessage = `现在开始提取以下试卷内容：\n---\n${paperText}\n---`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log('[parseExamPaper] 第', attempt, '次尝试，字符数:', paperText.length);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: `${PARSE_ROLE}\n\n${PARSE_RULES}` },
            { role: 'user', content: userMessage },
          ],
          temperature: 0,
          max_tokens: 16000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log('[parseExamPaper] 原始响应长度:', content.length, '前300字符:', content.slice(0, 300));
      const jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
      if (!jsonMatch) { console.error('[parseExamPaper] JSON匹配失败，完整响应:', content); throw new Error('返回格式不包含有效的 JSON'); }

      const parsed = JSON.parse(jsonMatch[0]);
      const questions = parsed.questions || [];
      console.log('[parseExamPaper] 解析成功，题目数:', questions.length);
      questions.forEach((q,i)=>{console.log(`[parseExamPaper]   ${i+1}. type=${q.type} stem前30字="${(q.stem||'').slice(0,30)}"`);});
      logger.info({ count: questions.length }, '试卷解析完成');
      return { questions };

    } catch (err) {
      if (err.name === 'AbortError') {
        logger.warn({ attempt }, '试卷解析超时');
      } else {
        logger.warn({ attempt, err: err.message }, '试卷解析失败，重试中');
      }
      if (attempt >= 2) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  throw new Error('试卷解析全部重试失败');
}

/**
 * 流式解析试卷 — SSE 逐 token 推送，永不超时
 * @param {string} paperText
 * @param {function} onProgress - (progressData) => void
 * @returns {Promise<{questions: Array}>}
 */
export async function parseExamPaperStream(paperText, onProgress) {
  const userMessage = `现在开始提取以下试卷内容：\n---\n${paperText}\n---`;
  const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);

  onProgress({ phase: 'connecting' });

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: `${PARSE_ROLE}\n\n${PARSE_RULES}` },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 16000,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 200)}`);
  }

  onProgress({ phase: 'streaming' });

  let content = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content += delta;
          onProgress({ phase: 'token', contentLength: content.length });
        }
      } catch { /* skip unparseable chunks */ }
    }
  }

  onProgress({ phase: 'parsing', contentLength: content.length });
  console.log('[parseExamPaperStream] 流式接收完成，长度:', content.length);

  const jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[parseExamPaperStream] JSON匹配失败，完整响应:', content);
    throw new Error('返回格式不包含有效的 JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const questions = parsed.questions || [];
  console.log('[parseExamPaperStream] 解析成功，题目数:', questions.length);
  logger.info({ count: questions.length }, '试卷流式解析完成');
  return { questions };
}
