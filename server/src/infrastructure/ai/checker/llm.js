/**
 * llm.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 51-52 · 55-56 · 458-460 · 462-525）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import logger from '../../../utils/logger.js';
import { getBaseUrl, getApiKey, getModel } from '../../../services/deepseek.js';

/** LLM 输出 max_tokens（规则 JSON 长输出，非思考模式，2026-08-17 教训 2） */
const LLM_MAX_TOKENS = 16000;

/** 单次 LLM 调用超时（网络挂起保护，2026-08-18） */
const LLM_CALL_TIMEOUT_MS = 180 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 调用 DeepSeek chat/completions（temperature 0.2，max_tokens 16000）。
 * 长输出任务（规则生成/校准）必须用非思考模型：推理模型的 reasoning_content 会挤占
 * max_tokens 配额导致 content 为空（2026-08-17 教训 2）。默认 deepseek-chat，
 * 可用环境变量 DEEPSEEK_RULES_MODEL 覆盖；其余调用方传 model 覆盖（如评分走原模型）。
 * 失败重试 2 次（指数退避），仍失败抛错。
 * @param {string} system
 * @param {string} user
 * @param {{model?: string, maxTokens?: number}} [opts]
 * @returns {Promise<string>} 模型输出文本
 */
async function callLlm(system, user, opts = {}) {
  const baseUrl = await getBaseUrl();
  const apiKey = await getApiKey();
  const model = opts.model || process.env.DEEPSEEK_RULES_MODEL || 'deepseek-chat';
  const maxTokens = opts.maxTokens || LLM_MAX_TOKENS;
  const url = String(baseUrl).replace(/\/+$/, '') + '/chat/completions';
  let lastErr = null;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const hangTimer = setTimeout(() => controller.abort(), LLM_CALL_TIMEOUT_MS);
      let resp;
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            temperature: 0.2,
            max_tokens: maxTokens,
            stream: false,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(hangTimer);
      }
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 200));
      }
      const data = await resp.json();
      const text = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
      if (typeof text !== 'string' || text.trim() === '') {
        const fin = data.choices && data.choices[0] ? data.choices[0].finish_reason : '?';
        logger.warn({ model, finish: fin, usage: data.usage || null }, 'callLlm: 返回空内容');
        throw new Error('LLM 返回空内容');
      }
      logger.info({ model, promptChars: user.length }, 'callLlm: 调用成功');
      return text;
    } catch (err) {
      lastErr = err;
      logger.warn({ attempt, err: String(err && err.message ? err.message : err) }, 'callLlm: 调用失败，准备重试');
      if (attempt < 2) await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr || new Error('LLM 调用失败');
}

export { callLlm };
