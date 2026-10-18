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

import { extractFirstJsonObject } from "./json-extract.js";   // ★R3-LLM-OUT（R20）：非贪婪「首个平衡 JSON 对象」提取

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
 * ★R3-LLM-OUT（R20）：改用**首个平衡 JSON 对象**（extractFirstJsonObject，非贪婪）——
 *   旧实现的贪婪正则 /\{[\s\S]*\}/ 会跨多个对象吞并，既是死代码（零消费者）又不可用；
 *   现由 project-grading（项目评分/主观分项）与 file-selection 作为 extract* 的兜底消费者。
 * @param {string} text 模型原始输出
 * @param {(obj: unknown) => unknown} schemaFn 校验函数（合法返回值 / 非法返回 null）
 * @returns {unknown} 校验通过的值，否则 null
 */
export function parseWithSchema(text, schemaFn) {
  const obj = extractFirstJsonObject(text);
  if (!obj || typeof obj !== "object") return null;
  return schemaFn(obj);
}

/**
 * ★R3-LLM-OUT（H8）：项目评分输出 { totalScore, breakdown?, highlights?, issues?, overallComment? }。
 *   分值越界/NaN/缺字段在解析层即拒（与 schemaScoreFeedback 同口径），由调用方走既有重试路径。
 * @param {unknown} obj
 * @param {{maxScore?: number}} [opts] 满分（默认 100；totalScore 必须落在 [0, maxScore]）
 * @returns {{totalScore:number, breakdown?:Array, highlights?:string[], issues?:string[], overallComment?:string}|null}
 */
export function schemaProjectGrade(obj, opts = {}) {
  const maxScore = isFiniteNumber(opts.maxScore) && opts.maxScore > 0 ? opts.maxScore : 100;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (!isFiniteNumber(obj.totalScore)) return null;
  if (obj.totalScore < 0 || obj.totalScore > maxScore) return null;
  const out = { totalScore: obj.totalScore };
  if (obj.breakdown != null) {
    if (!Array.isArray(obj.breakdown)) return null;
    const breakdown = [];
    for (const b of obj.breakdown) {
      if (!b || typeof b !== "object" || Array.isArray(b)) return null;
      // 口径：**只校验「出现即合法」的字段**，必填项仅限整条输出（totalScore）——
      //   截断修复（json-extract.repairTruncatedJson）可能产出 {"item":"功能"} 这类半截条目，
      //   既有 G4 用例要求可继续评分；缺 score 的条目由下游 clamp（Number(raw?.score)||0）收敛为 0 分。
      if (b.item != null && (typeof b.item !== "string" || !b.item.trim())) return null;
      if (b.score != null && (!isFiniteNumber(b.score) || b.score < 0)) return null;
      if (b.maxScore != null && (!isFiniteNumber(b.maxScore) || b.maxScore <= 0)) return null;
      if (b.comment != null && typeof b.comment !== "string") return null;
      breakdown.push(b);
    }
    out.breakdown = breakdown;
  }
  for (const key of ["highlights", "issues"]) {
    if (obj[key] == null) continue;
    if (!Array.isArray(obj[key]) || !obj[key].every((x) => typeof x === "string")) return null;
    out[key] = obj[key];
  }
  if (obj.overallComment != null) {
    if (typeof obj.overallComment !== "string") return null;
    out.overallComment = obj.overallComment;
  }
  return out;
}

/**
 * ★R3-LLM-OUT（H8）：主观分项评分输出 { items:[{item, score, comment?}] }（gradeSubjectiveItems 消费）。
 * @param {unknown} obj
 * @returns {{items:Array}|null}
 */
export function schemaSubjectiveItems(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (!Array.isArray(obj.items)) return null;
  const items = [];
  for (const it of obj.items) {
    if (!it || typeof it !== "object" || Array.isArray(it)) return null;
    // ★R3-LLM-FIX（§7 截断容忍）：与 schemaProjectGrade.breakdown **同口径** —— 只校验「出现即合法」的字段；
    //   extractFilesJson/repairTruncatedJson 可能产出 {"item":"规范"} 这类半截条目（score 缺失），
    //   放行后由 gradeSubjectiveItems 的既有 Number(raw?.score)||0 clamp 收敛为 0 分（= G4 项目评分同语义），
    //   而不是 3 次重试后整体失败。若 score 出现但非法（字符串/负数/NaN）仍拒绝。
    if (it.item != null && (typeof it.item !== "string" || !it.item.trim())) return null;
    if (it.score != null && (!isFiniteNumber(it.score) || it.score < 0)) return null;
    if (it.comment != null && typeof it.comment !== "string") return null;
    items.push(it);
  }
  return { items };
}

/**
 * ★R3-LLM-OUT（H8/M9）：文件选择输出 { files:[string], reason? }（file-selection.js 消费）。
 * @param {unknown} obj
 * @returns {{files:string[], reason:string}|null}
 */
export function schemaFileSelection(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (!Array.isArray(obj.files)) return null;
  const files = [];
  for (const f of obj.files) {
    if (typeof f !== "string" || !f.trim()) return null;
    files.push(f);
  }
  if (files.length > 200) return null;
  if (obj.reason != null && typeof obj.reason !== "string") return null;
  return { files, reason: typeof obj.reason === "string" ? obj.reason.slice(0, 500) : "" };
}
