/**
 * file-selection.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 752-848）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import logger from '../../../utils/logger.js';
import { getBaseUrl, getApiKey, getModel } from './config.js';
import { SELECT_ROLE } from '../../../domain/services/deepseek/prompts.js';
import { extractFilesJson } from '../../../domain/services/deepseek/json-extract.js';

/**
 * L1 第一轮：根据文件树选择评分需要细看的文件（轻量调用，1~3KB 输入）。
 * @param {object} p
 * @param {string} p.title 项目标题
 * @param {string} p.fileTreeText 文件树文本（含大小/权重）
 * @param {string} [p.scoringRubric] 评分标准
 * @param {number} [p.maxFiles=20] 最多选择文件数
 * @param {number} [p.maxTotalBytes=61440] 选中文件总大小上限（60KB）
 * @returns {Promise<{files: string[], reason: string}>}
 * @throws 选择失败时抛出（调用方应降级为全量注入）
 */

export async function selectImportantFiles({ title, fileTreeText, scoringRubric, maxFiles = 20, maxTotalBytes = 60 * 1024 }) {
  const userMessage = `【项目标题】${title || '未命名项目'}
【评分标准】
${scoringRubric || '默认：功能完整性50% + 代码规范性25% + 健壮性25%'}

【学生工程文件树】（含文件大小与权重，权重越高越核心）
${fileTreeText}

请选出正式评分时【必须查看完整源码】的最多 ${maxFiles} 个文件，要求：
- 选中文件总大小不超过 ${Math.round(maxTotalBytes / 1024)}KB
- 优先：入口文件、核心业务模块、权重高、被其他文件引用的模块
- 排除：纯配置、资源、测试、文档、构建产物
- 必须返回文件树中的准确路径（path 字段）

严格 JSON 返回（不要任何其他文字）：
{"files": ["src/main.js", "src/api/user.js"], "reason": "一句话说明选择依据"}`;

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SELECT_ROLE },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) {
        const wait = [5, 15][attempt - 1] * 1000;
        logger.warn({ attempt }, `文件选择限流，等待 ${wait / 1000}s`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      // 文件选择返回 {files, reason}，与评分 JSON（totalScore）结构不同，需独立解析
      const parsed = extractFilesJson(content);
      if (!parsed || !Array.isArray(parsed.files)) {
        throw new Error('返回格式不包含有效的 JSON');
      }
      // 控制总数；路径有效性由调用方（projectGrading）用文件树校验
      const files = parsed.files.filter(f => typeof f === 'string' && f).slice(0, maxFiles);
      logger.info({ files: files.length, reason: parsed.reason }, '文件选择完成');
      return { files, reason: parsed.reason || '' };
    } catch (err) {
      lastError = err;
      logger.warn({ attempt, err: err.message }, '文件选择失败');
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('文件选择全部重试失败: ' + (lastError?.message || ''));
}
