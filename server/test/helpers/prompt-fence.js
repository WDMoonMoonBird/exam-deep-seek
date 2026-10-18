/**
 * server/test/helpers/prompt-fence.js — ★R3-LLM-INJ 测试侧围栏解析/归一化（C 写域）
 *
 * 新格式真源：server/src/domain/services/deepseek/prompts.js:57-66
 *   <<<LABEL_<nonce16hex>_BEGIN>>>
<data>
<<<LABEL_<nonce16hex>_END>>>
 * task-28 断言口径：
 *   · 同一围栏 BEGIN/END 必须使用**同一 nonce**；
 *   · 每次请求/每次构建 nonce 必须不同（CSPRNG，不可预测）；
 *   · 数据里自带的「伪造闭合串」只是数据，不构成真围栏（按 nonce 配对判定）；
 *   · 除 nonce 外结构/内容必须相等（normalizeFenceNonces 后可逐字节比较）。
 */

const NONCE = '[0-9a-f]{16}';

/** 按「同一 nonce」配对提取第一个围栏；非配对（如数据内伪造 END）不会被当作真围栏。 */
export function parsePairedFence(text, label) {
  const s = String(text == null ? '' : text);
  const beginRe = new RegExp('<<<' + label + '_(' + NONCE + ')_BEGIN>>>');
  const begin = s.match(beginRe);
  if (!begin) return null;
  const nonce = begin[1];
  const endMarker = '<<<' + label + '_' + nonce + '_END>>>';
  const innerStart = begin.index + begin[0].length;
  const endIdx = s.indexOf(endMarker, innerStart);
  if (endIdx < 0) return null;
  return {
    nonce,
    inner: s.slice(innerStart, endIdx),
    full: s.slice(begin.index, endIdx + endMarker.length),
  };
}

/** 所有 BEGIN 标记的 nonce（按出现顺序）。 */
export function fenceNonces(text, label) {
  const s = String(text == null ? '' : text);
  const re = new RegExp('<<<' + label + '_(' + NONCE + ')_BEGIN>>>', 'g');
  return [...s.matchAll(re)].map((m) => m[1]);
}

/** 所有 END 标记数量（含数据内伪造串；用于证明「伪造串不产生真配对」）。 */
export function countEndMarkers(text, label) {
  const s = String(text == null ? '' : text);
  const re = new RegExp('<<<' + label + '_' + NONCE + '_END>>>', 'g');
  return (s.match(re) || []).length;
}

/** 用固定占位替换 nonce（BEGIN/END 同步）⇒ 可做「除 nonce 外结构相等」的逐字节比较。 */
export function normalizeFenceNonces(text) {
  const s = String(text == null ? '' : text);
  return s.replace(new RegExp('_(' + NONCE + ')_(BEGIN|END)>>>', 'g'), '_(nonce)_$2>>>');
}
