/**
 * json-extract.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 489-779）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

/**
 * 截断 JSON 修复：
 * 1) 悬空字符串修剪：最后一个引号前是结构字符（: , [ { 空白）→ 该引号是字符串开始，丢弃其后残余；
 *    否则（闭引号）→ 尾部残余非结构字符时裁剪到引号后
 * 2) 去除尾部悬空逗号/冒号
 * 3) 括号栈补齐闭合符
 * @param {string} candidate 从 '{' 开始的候选 JSON 串
 * @returns {object|null} 修复成功返回对象，失败返回 null
 */
function repairTruncatedJson(candidate) {
  let lastQuote = candidate.lastIndexOf('"');
  if (lastQuote > 0) {
    const prev = candidate[lastQuote - 1];
    if (prev === ':' || prev === ',' || prev === '[' || prev === '{' || /\s/.test(prev)) {
      // 悬空开引号：其后残余全部丢弃
      candidate = candidate.slice(0, lastQuote);
    } else {
      // 闭引号：尾部残余非结构字符则裁剪
      const tail = candidate.slice(lastQuote + 1);
      if (!/^[\s:,}\]]*$/.test(tail)) {
        candidate = candidate.slice(0, lastQuote + 1);
      }
    }
  }
  // 去除尾部悬空键名与逗号/冒号（覆盖 : keyName 与 , "keyName" 两种残留形态）
  candidate = candidate
    .replace(/:\s*[\w\u4e00-\u9fff]*$/, '')
    .replace(/,\s*"[^"]*"\s*$/, '')
    .replace(/[,\s]+$/, '')
    .replace(/:\s*$/, '');
  // 括号栈补全
  const stack = [];
  for (const ch of candidate) {
    if (ch === '{' || ch === '[') stack.push(ch);
    else if ((ch === '}' && stack[stack.length - 1] === '{') || (ch === ']' && stack[stack.length - 1] === '[')) stack.pop();
  }
  const suffix = stack.slice().reverse().map((ch) => (ch === '{' ? '}' : ']')).join('');
  try { return JSON.parse(candidate + suffix); } catch { return null; }
}
/**
 * 从模型响应中提取项目评分 JSON（增强解析）：
 *  1) 直接匹配含 "totalScore" 的 JSON 对象（首个 { 到末个 }）
 *  2) 剥离 markdown 代码块围栏后重试（模型常包裹 ```json）
 *  3) 宽容补全：JSON 可能被 max_tokens 截断（finish_reason=length），尝试补尾部 }
 * @param {string} content 模型原始响应
 * @returns {object|null} 解析成功的对象；无法解析返回 null
 */
function extractProjectGradeJson(content) {
  if (!content) return null;
  const tryParse = (s) => {
    const m = s.match(/\{[\s\S]*"totalScore"[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  };
  // 1) 直接匹配
  let parsed = tryParse(content);
  if (parsed) return parsed;
  // 2) 剥离 markdown 围栏
  const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  parsed = tryParse(cleaned);
  if (parsed) return parsed;
  // 3) 宽容补全：截断场景——先修剪到最后一个完整字符串边界，再按括号栈补齐闭合符
  const first = cleaned.indexOf('{');
  if (first >= 0) {
    let candidate = cleaned.slice(first);
    if (candidate.includes('totalScore')) {
      try { return JSON.parse(candidate); } catch { /* 截断，继续补全 */ }
      // 共享截断修复（悬空字符串/尾逗号/括号补全）
      const repaired = repairTruncatedJson(candidate);
      if (repaired) return repaired;
    }
  }
  return null;
}

/**
 * 从模型响应提取文件选择 JSON（含 "files" 数组；剥离 markdown 围栏后按括号栈补全）。
 * @param {string} content
 * @returns {object|null}
 */
export function extractFilesJson(content) {
  if (!content) return null;
  let candidate = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const first = candidate.indexOf('{');
  if (first < 0) return null;
  candidate = candidate.slice(first);
  try { return JSON.parse(candidate); } catch { /* 截断补全 */ }
  // 共享截断修复（悬空字符串/尾逗号/括号补全）
  const repaired = repairTruncatedJson(candidate);
  if (repaired) return repaired;
  return null;
}

export { repairTruncatedJson, extractProjectGradeJson };
