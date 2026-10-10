/**
 * trustJudgeGrader.js — TrustJudge 评分 sidecar 接入（GRADING_MODE=trustjudge 时的评分后端）
 *
 * 与 legacy deepseek.js gradeProject 保持同构签名与返回信封：
 *   gradeProjectTrustJudge({ title, description, scoringRubric, standardFiles, studentFiles, mode, fixedItems })
 *   → { totalScore, breakdown[], highlights[], issues[], overallComment }
 *
 * 链路：
 *   1. 【显式让位】sidecar 当前不支持 open 语义与固定分项，其三条静态边界（已核实）：
 *        · GradeRequest 仅 6 个字段且 model_config={"extra":"ignore"} → Node 传的额外字段被静默丢弃；
 *        · build_messages 无条件输出「== Reference / standard solution ==」段（open 题只会渲染成
 *          “(none provided)”），system 恒为批判式角色；
 *        · items 由 parseRubricItems(scoringRubric) 正则推导，不使用 ensureRubricItems 的固定分项。
 *      因此 mode==='open' 或 fixedItems 有效时，本函数不调用 sidecar，直接走 legacy gradeProject
 *      （这两项能力它都已支持），并记一条明确日志——把「跨语言静默丢失」变成可见的让位。
 *   2. 其余情况：从 scoringRubric 文本自然分段推导分项 items（“第一项…N 分” 等），
 *      解析失败 / 无分段 → items=[]（sidecar 仅评总分）；
 *      然后 POST http://127.0.0.1:8901/grade（180s 超时，失败重试 2 次，退避 2s/5s）。
 *   3. 响应按 legacy 信封同构组装（totalScore 四舍五入并 clamp 到 0~100；
 *      breakdown 逐项 round；highlights/issues/overallComment 置空占位）。
 *   4. sidecar 不可达 / 超时 / 5xx / 响应畸形 → 记录日志并降级调用 legacy gradeProject
 *      （deepseek.js 原样保留，服务可用性不受 sidecar 故障影响）；
 *      **降级时 mode / fixedItems 一并透传**（与 projectGrading.js 的 gradeArgs 语义一致）。
 *
 * 三条静态边界与「后续对齐 sidecar」的待办：见 KNOWN_ISSUES.md「P2 已知限制」。
 */

import logger from '../utils/logger.js';
import { gradeProject } from './deepseek.js';

/** TrustJudge sidecar 基址（FastAPI，仅监听 127.0.0.1） */
const SIDECAR_URL = 'http://127.0.0.1:8901';
const GRADE_TIMEOUT_MS = 180_000;

/** 总分单元固定满分（sidecar 对 total 单独打分，scale=100） */
export const TOTAL_UNIT_MAX_SCORE = 100;
/** 总分单元 id */
export const TOTAL_UNIT_ID = 'total';

/**
 * 重试退避（毫秒）：默认 2s / 5s（第 1 次失败后等 2s，第 2 次失败后等 5s）。
 * 测试可用 TRUSTJUDGE_BACKOFF_MS 覆盖为 “0,0” 加速，生产默认不变。
 */
function backoffSchedule() {
  const raw = process.env.TRUSTJUDGE_BACKOFF_MS;
  if (raw) {
    const parsed = String(raw).split(',').map((s) => Number(s.trim()));
    if (parsed.every(Number.isFinite)) return parsed;
  }
  return [2000, 5000];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** clamp v 到 [0, max]；v 非法（NaN）按 0 处理 */
function clampScore(v, max) {
  const n = Number(v);
  const m = Number(max) > 0 ? Number(max) : TOTAL_UNIT_MAX_SCORE;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(m, n));
}

/**
 * 从评分标准文本自然分段推导分项（“第一项，描述…，N 分。” / “第1条…” / “满分 N 分” 写法）。
 * 逐段取「段首标题之后 → 首个分值标记之前」的文本作为描述（前 40 字），分值为该分项 maxScore；
 * 无标题分段或解析失败返回空数组（sidecar 仅评总分）。
 * @param {string} rubric 教师自定义评分标准（纯文本）
 * @returns {Array<{item: string, maxScore: number}>}
 */
export function parseRubricItems(rubric) {
  if (!rubric || !rubric.trim()) return [];
  // 标题形态：第一项 / 第1项 / 第一部分 / 第一条…
  const HEADING_RE = /第\s*[零一二三四五六七八九十百0-9]+\s*[项条部分点][、,，:：]?/g;
  const heads = [];
  let m;
  while ((m = HEADING_RE.exec(rubric)) !== null) {
    heads.push({ start: m.index, end: m.index + m[0].length });
  }
  if (!heads.length) return [];

  const items = [];
  for (let i = 0; i < heads.length; i += 1) {
    const segStart = heads[i].end;
    const segEnd = i + 1 < heads.length ? heads[i + 1].start : rubric.length;
    const seg = rubric.slice(segStart, segEnd);
    // 只在本段「首个完整句」（到 。/！/？ 为止）内找分值标记，避免被后续细则里的
    // “得 N 分；…N 分” 等次级分值劫持；允许 “，10 分” 与 “满分 15 分” 两种写法
    const head = seg.match(/^[^。！？\n]*/)[0];
    const marker = head.match(/[，,]\s*(\d{1,3})\s*分/) || head.match(/满分\s*(\d{1,3})\s*分/);
    if (!marker) continue;
    const desc = head
      .slice(0, marker.index)
      .replace(/^[\s，,。:：、|]+/, '')
      .replace(/[\s，,。:：、|]+$/, '')
      .trim();
    const maxScore = parseInt(marker[1], 10);
    if (!desc || !Number.isInteger(maxScore) || maxScore < 1 || maxScore > 500) continue;
    items.push({ item: desc.slice(0, 40), maxScore });
  }
  return items;
}

/**
 * 归一化调用方传入的固定分项（规则驱动链路 ensureRubricItems 的产物）：
 * 只保留能通过 sidecar 校验的项（item 非空、maxScore 为 1~500 整数），
 * 空数组 / 全非法 → []（调用方据此回退到 rubric 文本推导）。
 * @param {Array<{item:string, maxScore:number}>|null} fixedItems
 * @returns {Array<{item:string, maxScore:number}>}
 */
export function normalizeFixedItems(fixedItems) {
  if (!Array.isArray(fixedItems)) return [];
  return fixedItems
    .map((it) => ({
      item: String(it?.item || '').trim().slice(0, 60),
      maxScore: Number(it?.maxScore),
    }))
    .filter((it) => it.item && Number.isInteger(it.maxScore) && it.maxScore >= 1 && it.maxScore <= 500);
}

/**
 * 组装发送给 sidecar 的 /grade 请求体（字段即 sidecar 的 GradeRequest 契约，
 * 见 trustjudge-server/app.py；其余字段会被 extra="ignore" 静默丢弃，故不发送）。
 * items 由 rubric 文本正则推导；带 fixedItems / open 的调用在入口已让位给 legacy，不会走到这里。
 */
function buildGradeRequest({ title, scoringRubric, standardFiles, studentFiles }) {
  const items = parseRubricItems(scoringRubric).map((it, idx) => ({
    id: 'i' + (idx + 1),
    item: it.item,
    maxScore: it.maxScore,
  }));
  return {
    title: String(title || '未命名项目'),
    rubric: String(scoringRubric || ''),
    maxScore: TOTAL_UNIT_MAX_SCORE,
    standardFiles: String(standardFiles || ''),
    studentFiles: String(studentFiles || ''),
    items,
  };
}

/**
 * 把 sidecar /grade 响应组装为与 legacy gradeProject 同构的返回信封。
 * @param {{totalScore: number, breakdown: Array}} data sidecar 响应体
 * @returns {{totalScore:number, breakdown:Array, highlights:Array, issues:Array, overallComment:string}}
 */
export function assembleTrustJudgeResult(data) {
  const rawBreakdown = Array.isArray(data?.breakdown) ? data.breakdown : [];
  const breakdown = rawBreakdown.map((b) => ({
    item: String(b?.item || '').slice(0, 60),
    score: Math.round(clampScore(b?.score, b?.maxScore)),
    maxScore: Number(b?.maxScore) || 0,
    comment: String(b?.comment || '').slice(0, 60),
  }));
  return {
    totalScore: Math.round(clampScore(data?.totalScore, TOTAL_UNIT_MAX_SCORE)),
    breakdown,
    highlights: [],
    issues: [],
    overallComment: '',
  };
}

/**
 * 调用 TrustJudge sidecar 评分（180s 超时，失败重试 2 次：2s/5s 退避）；
 * sidecar 不可达 / 超时 / 5xx / 响应畸形时记录日志并降级调用 legacy gradeProject。
 *
 * 入参签名与 deepseek.js gradeProject 完全一致（含 mode / fixedItems）：页面/控制器/信封组装零改动可切换。
 * （description 参数仅作签名兼容，sidecar 提示词不使用该字段。）
 *
 * @param {'standard'|'open'} [mode] 评分模式：open=无标准工程包的评价式评分；
 *        sidecar 不支持该语义 → 显式让位给 legacy gradeProject（不再静默丢失）
 * @param {Array<{item:string, maxScore:number}>|null} [fixedItems] 固定分项（规则驱动链路产物）；
 *        同上，sidecar 不消费 → 让位 legacy；透传语义与 projectGrading.js 的 gradeArgs 一致
 */
export async function gradeProjectTrustJudge({ title, description, scoringRubric, standardFiles, studentFiles, mode, fixedItems }) {
  // 入参：与调用方（projectGrading.js gradeArgs）同构；让位与降级两条路径都必须带上 mode/fixedItems
  const params = { title, description, scoringRubric, standardFiles, studentFiles, mode, fixedItems };

  // 【显式让位 · 纵深防御】主判断点在评分路由（projectGrading.js：sidecarGap → useTrustJudge +
  // 「本次改走 legacy」info 日志）；这里对直接调用方（如 server/scripts/trustjudge-experiment.mjs）
  // 做同一规则的兜底：sidecar 不支持 open 语义与固定分项（三条静态边界见文件头注释），与其让 Node
  // 传入的字段被 Python 静默丢弃，不如明确改走已支持这两项能力的 legacy gradeProject 并记 info 日志。
  const normalizedFixed = normalizeFixedItems(fixedItems);
  if (mode === 'open' || normalizedFixed.length > 0) {
    logger.info(
      {
        gradingMode: 'trustjudge',
        delegateTo: 'legacy',
        reason: mode === 'open' ? 'sidecar 不支持 open 语义' : 'sidecar 不支持固定分项',
        mode: mode || '',
        fixedItemCount: normalizedFixed.length,
      },
      'sidecar 不支持 open/fixedItems 语义，本次改走 legacy gradeProject',
    );
    return gradeProject(params);
  }

  const body = buildGradeRequest(params);
  const url = SIDECAR_URL + '/grade';
  const backoffs = backoffSchedule();

  let lastError = null;
  // 总尝试 3 次（初始 + 重试 2 次）
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GRADE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (!data || !Number.isFinite(Number(data.totalScore))) {
          throw new Error('TrustJudge sidecar 响应畸形（缺 totalScore）');
        }
        logger.info(
          { gradingMode: 'trustjudge', totalScore: data.totalScore, itemCount: body.items.length, attempt },
          'TrustJudge sidecar 评分成功',
        );
        return assembleTrustJudgeResult(data);
      }
      // 4xx（如 422 参数校验失败）重试无意义 → 直接降级
      if (res.status >= 400 && res.status < 500) {
        throw new DegradeNowError('TrustJudge sidecar 返回 ' + res.status);
      }
      throw new Error('TrustJudge sidecar 返回 ' + res.status);
    } catch (err) {
      clearTimeout(timer);
      const isDegrade = err instanceof DegradeNowError;
      lastError = isDegrade ? err : err;
      if (err.name === 'AbortError') {
        logger.warn({ attempt, gradingMode: 'trustjudge' }, 'TrustJudge sidecar 超时，重试中');
      } else if (!isDegrade) {
        logger.warn({ attempt, err: err.message, gradingMode: 'trustjudge' }, 'TrustJudge sidecar 调用失败，重试中');
      }
      if (isDegrade || attempt >= 3) break;
      await sleep(backoffs[attempt - 1] ?? 0);
    }
  }

  const reason = lastError?.message || '未知错误';
  logger.warn(
    { err: lastError, gradingMode: 'trustjudge', mode: params.mode || 'standard', fixedItemCount: normalizeFixedItems(params.fixedItems).length },
    'TrustJudge sidecar 不可用，降级调用 legacy gradeProject：' + reason,
  );
  // 透传 mode / fixedItems：保证降级后 open 题仍是 open 语义、固定分项对齐仍生效（M6 修复）
  return gradeProject(params);
}

/** 标记「无需重试、直接降级」的内部错误（4xx 等确定性失败）。 */
class DegradeNowError extends Error {}
