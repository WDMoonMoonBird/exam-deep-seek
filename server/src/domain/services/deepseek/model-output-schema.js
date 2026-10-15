/**
 * model-output-schema.js —— ★M9/H8（W2-P3）：模型输出的**统一 schema 校验层**（纯函数、零依赖）。
 *
 * 为什么放 domain：infrastructure 可以 import domain、反向不允许 ⇒ 这是「AI 解析侧」与「校验侧」唯一合法的共同层位。
 *
 * 设计口径（与任务书一致）：
 *  1) **不新造降级路径** —— 校验失败返回 null，由调用方走**既有**分支（评分侧 ABNORMAL_FEEDBACK、解析侧既有的「格式不合法」错误）。
 *  2) **H8 深化** —— 分值越界（非数字 / NaN / Infinity / 负数 / 超满分）在**解析层即被拒**；既有 clamp
 *     （server/src/services/projectGrading.js、ai/deepseek/project-grading.js）**保持不动**，两者互补。
 *  3) **不引入比既有消费方更严的约束** —— 只校验「形状/类型/区间」，题型枚举等只在调用方显式要求时才启用
 *     （实测教训：若强加题型枚举/非空题干，会把既有合法输出判非法，单元测试夹具即被误拒）。
 */

/** @returns {boolean} 有限数字（拒绝 NaN/Infinity/数字字符串） */
export const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * 评分类输出：{ score:number, feedback:string }。
 * @param {unknown} obj 解析后的对象
 * @param {{maxScore?: number}} [opts] 满分（默认 100；score 必须落在 [0, maxScore]）
 * @returns {{score:number, feedback:string}|null} 合法则返回规范化对象，否则 null
 */
export function schemaScoreFeedback(obj, opts = {}) {
  const maxScore = isFiniteNumber(opts.maxScore) ? opts.maxScore : 100;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const score = obj.score;
  const feedback = obj.feedback;
  if (!isFiniteNumber(score)) return null;                 // ★H8：非数字/NaN/Infinity 一律拒（不再静默 clamp）
  if (score < 0 || score > maxScore) return null;           // ★H8：越界即拒（负数/超满分）
  if (feedback != null && typeof feedback !== "string") return null;
  return { score, feedback: typeof feedback === "string" ? feedback : "" };
}

/** 题型枚举（可选严格模式用；与 prompts.js 的题型口径一致） */
export const QUESTION_TYPES = ["choice", "multi_choice", "judge", "fill", "code"];

/**
 * 试卷解析输出：{ questions:[...] }。
 * 只做形状校验（数组 + 逐项对象 + 字段类型），**不做题型枚举/非空题干**这类比消费方更严的约束。
 * @param {unknown} obj
 * @param {{strictTypes?: boolean}} [opts]
 * @returns {{questions: Array}|null}
 */
export function schemaQuestions(obj, opts = {}) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.questions)) return null;
  const out = [];
  for (const q of obj.questions) {
    if (!q || typeof q !== "object") return null;
    if (q.stem != null && typeof q.stem !== "string") return null;
    if (q.type != null && typeof q.type !== "string") return null;
    if (q.options != null && !Array.isArray(q.options)) return null;
    if (opts.strictTypes && q.type != null && !QUESTION_TYPES.includes(q.type)) return null;
    out.push(q);
  }
  return { questions: out };
}

/**
 * 通用对象数组校验（rubric-items / file-selection 这类条目列表输出）。
 * @param {unknown} obj
 * @param {{key: string, required?: string[], numeric?: string[]}} spec
 * @returns {Array|null} 合法则返回条目数组
 */
export function schemaItemList(obj, spec) {
  if (!obj || typeof obj !== "object") return null;
  const list = obj[spec.key];
  if (!Array.isArray(list)) return null;
  for (const it of list) {
    if (!it || typeof it !== "object") return null;
    for (const f of spec.required || []) {
      if (it[f] == null || (typeof it[f] === "string" && it[f].trim() === "")) return null;
    }
    for (const f of spec.numeric || []) {
      if (!isFiniteNumber(it[f])) return null;
    }
  }
  return list;
}

/**
 * 统一的「模型文本 → JSON → schema」入口：解析失败或形状不合法都返回 null。
 * @param {string} text 模型原始输出
 * @param {(obj: unknown) => unknown} schemaFn 校验函数（合法返回值 / 非法返回 null）
 * @returns {unknown} 校验通过的值，否则 null
 */
export function parseWithSchema(text, schemaFn) {
  const s = String(text == null ? "" : text);
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(m[0]); } catch { return null; }
  return schemaFn(obj);
}
