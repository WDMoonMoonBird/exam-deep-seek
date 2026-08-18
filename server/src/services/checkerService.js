/**
 * checkerService.js — AI 生成 JSON 评分规则 + 自举校准服务（规则驱动）
 *
 * 实训题评分方案（2026-08-17 规则驱动版）：教师评分标准 → AI 生成 JSON 评分规则
 * （确定性检查学生工程，rule_type 白名单）→ 在标准工程包上运行校准（标准包应得满分，
 * 扣分则反馈证据让 AI 修正规则参数，循环 ≤3 轮）→ 就绪后评分链路用 ruleExecutor
 * 计算硬性分项，主观分项留给 LLM。
 *
 * 2026-08-18 重构（方案 docs/plan/2026-08-18-refactor-plan.md §4.1/§4.2/§4.3）：
 * - 标准包角色降级：校准终止改为「置信度阈值（默认 ≥90）→ review」，不再要求满分；
 * - 新增 review 状态（校准达标待教师确认）与体检报告（失分项：转主观/豁免/接受失分）；
 * - 规则版本化（checkerMeta.versions 全文快照，支持回滚；阶段 1 迁移 RuleVersion 表）；
 * - 输入快照 inputsSnapshot（评分标准/满分/描述/标准包指纹），保存守卫判断脚本是否过期；
 * - 题目描述参与第 1 轮生成提示词。
 *
 * 规则格式（生成目标，也是 questions.checkerScript 字段的存储内容，字段名不变前端兼容）：
 *   {
 *     "max_score": 100,
 *     "objective_items": [{ "id": "a1", "group": "...", "item": "...", "rule_type": "...", "params": {...}, "max_score": 2 }],
 *     "subjective_items": [{ "id": "s1", "item": "...", "max_score": 10 }]
 *   }
 * 执行与校验委托给 ruleExecutor.js（validateRules / runRules）。
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { getBaseUrl, getApiKey, getModel, summarizeRubricItems } from './deepseek.js';
import { buildFileTree, filterProjectFiles, buildFileTreeText } from './projectContextBuilder.js';
import { standardDir } from '../utils/projectPaths.js';
import { validateRules, runRules, resolveProjectRoot } from './ruleExecutor.js';
import { validateNegativeTests } from './ruleMutator.js';

const execFileAsync = promisify(execFile);

/** 自举校准最大轮数（超轮未达标 → 缺陷豁免后达标进 review / 否则 failed；2026-08-18 由 8 轮收紧为 3 轮，配合阈值达标机制已足够） */
const MAX_ROUNDS = 3;
/** 就绪置信度阈值：标准包得分 ≥ 阈值即进入 review（教师确认），不再要求必须满分（2026-08-18 §4.1） */
const DEFAULT_THRESHOLD = 90;
/** 脚本执行超时（毫秒，仅旧脚本沙箱执行 runCheckerScript 使用） */
const SCRIPT_TIMEOUT_MS = 30000;
/** 脚本输出缓冲上限（20MB，防脚本刷屏拖垮进程） */
const SCRIPT_MAX_BUFFER = 20 * 1024 * 1024;
/** 题目满分缺失时的兜底值 */
const DEFAULT_MAX_SCORE = 100;
/** LLM 输出 max_tokens（规则 JSON 长输出，非思考模式，2026-08-17 教训 2） */
const LLM_MAX_TOKENS = 16000;
/** 生成状态超过该时长视为陈旧（服务重启/崩溃中断），允许重新生成 */
const STALE_GENERATION_MS = 15 * 60 * 1000;
/** 单次 LLM 调用超时（网络挂起保护，2026-08-18） */
const LLM_CALL_TIMEOUT_MS = 180 * 1000;
/** 校准连续同分 ≥ 该轮数 → 下一轮改为全新生成（§4.2 轻量版，防原地踏步） */
const STUCK_ROUNDS = 3;

/** 规则类型白名单（与 ruleExecutor.RULE_TYPES 一致，prompt 注入用） */
const RULE_TYPES = [
  'file_exists',
  'dir_contains_file',
  'contains_text',
  'count_regex',
  'contains_regex',
  'file_count_in_dir',
  'syntax_check',
  'fact',
];

/** 规则 JSON 格式说明（prompt 注入，禁止注释） */
const RULES_FORMAT = [
  '{',
  '  "max_score": 100,',
  '  "objective_items": [',
  '    { "id": "a1", "group": "评分标准分项名", "item": "规则中文描述", "rule_type": "file_exists", "params": { "path": "package.json" }, "max_score": 2 }',
  '  ],',
  '  "subjective_items": [',
  '    { "id": "s1", "item": "主观项中文描述", "max_score": 5 }',
  '  ]',
  '}',
].join('\n');

/** 固定分项 automation_level 分类中文标签（prompt 固定分项段渲染用；旧数据缺失 → 无标注） */
const AUTOMATION_LEVEL_LABELS = {
  deterministic: '确定性',
  semi: '半确定',
  subjective: '主观',
};

/** 固定分项渲染分类标注：deterministic →（确定性）、semi →（半确定）、subjective →（主观）；缺失 → 空串（旧数据兜底） */
function automationLabel(item) {
  const label = AUTOMATION_LEVEL_LABELS[item && item.automation_level];
  return label ? '（' + label + '）' : '';
}

/** fact 规则可用字段清单（prompt 注入；字段与 factExtractor 输出一致） */
const FACTS_SCHEMA = [
  'language(字符串: "vue"/"node"/... 工程语言) / framework(字符串: 框架名)',
  'hasPackageJson(布尔) / dependencies(字符串数组) / entryFiles(字符串数组)',
  'vueFiles(数字: Vue 文件数) / jsFiles(数字: JS 文件数) / components(字符串数组)',
  'routes(数字: 路由数) / routePaths(字符串数组) / hasCreateRouter(布尔) / hasVueRouter(布尔)',
  'hasPinia(布尔) / stores(字符串数组) / apiCalls(数字: 接口调用次数)',
  'hasAxiosWrapper(布尔: axios 封装) / hasAxios(布尔)',
  'syntaxErrors(数字: 语法错误数) / syntaxErrorFiles(字符串数组)',
].join('\n');

/** 生成规则的系统提示词（只产 JSON 参数，不产代码 —— 2026-08-17 教训 1） */
const GENERATE_SYSTEM = '你是一个高校实训题评分规则生成器。你的任务是根据评分标准与标准工程包文件树，'
  + '生成一份确定性的评分规则 JSON（只包含规则参数，不写任何可执行代码）。\n'
  + '铁律：\n'
  + '- 只输出 JSON 本身，不要任何解释、代码块围栏或多余文字；\n'
  + '- 字段名必须是 item（规则中文描述），绝对不要用 name；subjective_items 必须输出（无主观项时输出空数组 []）；\n'
  + '- rule_type 只能使用白名单类型；params 必须真实可执行（文件路径必须来自标准包文件树，不得猜测）；\n'
  + '- 客观项必须能通过静态文件检查确定性判定；无法确定性判定的项才放入 subjective_items；\n'
  + '- 客观项总分 + 主观项总分必须恰好等于 max_score。';

/** 规则 JSON 完整示例（格式锚点，防止模型字段漂移） */
const RULES_EXAMPLE = [
  '{',
  '  "max_score": 100,',
  '  "objective_items": [',
  '    { "id": "a1", "group": "项目初始化与运行", "item": "存在 pom.xml", "rule_type": "file_exists", "params": { "path": "pom.xml" }, "max_score": 10 }',
  '  ],',
  '  "subjective_items": []',
  '}',
].join('\n');

/** RichEditor 的 material 是 HTML：转纯文本（供提示词与输入快照使用） */
function stripHtml(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ===================== 宽容 JSON 解析（截断补全 / 围栏剥离） =====================

/**
 * 提取 JSON 文本：剥离 markdown 围栏与前后说明文字，取首个 { 到末个 } 之间的片段。
 * @param {string} raw
 * @returns {string|null}
 */
function extractJsonText(raw) {
  if (typeof raw !== 'string') return null;
  const stripped = raw.replace(/\`\`\`[a-zA-Z]*/g, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return stripped.slice(start, end + 1);
}

/**
 * 截断补全：按括号配平补上缺失的闭合符（max_tokens 截断场景）。
 * 截断在字符串中间时 JSON.parse 必然失败 → null（调用方处理）。
 * @param {string} text
 * @returns {object|null}
 */
function repairTruncatedJson(text) {
  const stack = [];
  let inString = false;
  let esc = false;
  for (const ch of text) {
    if (inString) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  const closers = stack.reverse().map((c) => (c === '{' ? '}' : ']')).join('');
  try {
    return JSON.parse(text + closers);
  } catch (err) {
    return null;
  }
}

/** 宽容解析：围栏剥离 → 直接解析 → 首{末}切片解析 → 全文本配平补全（截断场景） */
function parseLooseJson(raw) {
  if (typeof raw !== 'string') return null;
  const stripped = raw.replace(/\`\`\`[a-zA-Z]*/g, '');
  try {
    return JSON.parse(stripped);
  } catch (err) { /* 继续尝试 */ }
  const sliced = extractJsonText(stripped);
  if (sliced) {
    try {
      return JSON.parse(sliced);
    } catch (err) { /* 截断场景：继续尝试补全 */ }
  }
  return repairTruncatedJson(stripped);
}

// ===================== 旧脚本结果解析（保留，兼容历史调用） =====================

/**
 * 解析旧脚本 check(rootDir) 返回的检查结果 JSON。
 * 归一化：item 名 trim、score 越界截断 [0, maxScore]、非法项丢弃、evidence 非字符串省略。
 * @param {string} output
 * @returns {{totalScore: number, items: Array, subjective: Array}|null}
 */
export function parseCheckerResult(output) {
  const parsed = parseLooseJson(output);
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.totalScore !== 'number' || !Number.isFinite(parsed.totalScore)) return null;
  if (!Array.isArray(parsed.items) || !Array.isArray(parsed.subjective)) return null;

  const items = [];
  for (const it of parsed.items) {
    if (!it || typeof it !== 'object') continue;
    const name = typeof it.item === 'string' ? it.item.trim() : '';
    if (!name) continue;
    const maxScore = Number(it.maxScore);
    if (!Number.isFinite(maxScore) || maxScore <= 0) continue;
    const scoreRaw = Number(it.score);
    if (!Number.isFinite(scoreRaw)) continue;
    const score = Math.max(0, Math.min(maxScore, scoreRaw));
    const out = { item: name, maxScore, score };
    if (typeof it.evidence === 'string' && it.evidence.trim() !== '') {
      out.evidence = it.evidence.trim();
    }
    items.push(out);
  }

  const subjective = [];
  for (const it of parsed.subjective) {
    if (!it || typeof it !== 'object') continue;
    const name = typeof it.item === 'string' ? it.item.trim() : '';
    const maxScore = Number(it.maxScore);
    if (!name || !Number.isFinite(maxScore) || maxScore <= 0) continue;
    subjective.push({ item: name, maxScore });
  }

  return { totalScore: parsed.totalScore, items, subjective };
}

// ===================== 规则 JSON 解析（规则驱动） =====================

/**
 * 解析 AI 生成的评分规则 JSON 并归一化：
 * - id 缺省自动补全（objective a1/a2…，subjective s1/s2…，跳过已占用 id）
 * - item trim、max_score 四舍五入取整、rule_type 白名单、params 必须对象
 * - 非法项丢弃；总和归一化：客观项合计调整为 target = max_score - 主观项合计
 *   （不足时最后一项补齐差额；超出时等比缩放取整后最后一项兜差），保证 validateRules 通过
 * @param {string} output
 * @returns {{max_score: number, objective_items: Array, subjective_items: Array}|null}
 */
export function parseCheckerRules(output) {
  const parsed = parseLooseJson(output);
  if (!parsed || typeof parsed !== 'object') return null;
  const maxScore = parsed.max_score;
  if (typeof maxScore !== 'number' || !Number.isFinite(maxScore) || maxScore <= 0) return null;
  if (!Array.isArray(parsed.objective_items)) return null;
  // 容错：模型偶尔省略 subjective_items（无主观项时）→ 视为空数组（2026-08-18）
  const rawSubjective = parsed.subjective_items === undefined ? [] : parsed.subjective_items;
  if (!Array.isArray(rawSubjective)) return null;

  const objectiveItems = [];
  const usedObjIds = new Set();
  let objSeq = 0;
  for (const it of parsed.objective_items) {
    if (!it || typeof it !== 'object') continue;
    // item 兼容 name（模型字段漂移容错）
    const rawName = typeof it.item === 'string' && it.item.trim() !== '' ? it.item : it.name;
    const item = typeof rawName === 'string' ? rawName.trim() : '';
    const ms = Math.round(Number(it.max_score));
    if (!item || !Number.isFinite(ms) || ms <= 0) continue;
    if (!RULE_TYPES.includes(it.rule_type)) continue;
    if (!it.params || typeof it.params !== 'object' || Array.isArray(it.params)) continue;
    let id = typeof it.id === 'string' && it.id.trim() !== '' ? it.id.trim() : null;
    if (!id) {
      do { objSeq += 1; id = 'a' + objSeq; } while (usedObjIds.has(id));
    } else if (usedObjIds.has(id)) {
      // id 冲突：跳过（规则引擎要求 id 唯一）
      continue;
    }
    usedObjIds.add(id);
    objectiveItems.push({
      id,
      ...(typeof it.group === 'string' && it.group.trim() !== '' ? { group: it.group.trim() } : {}),
      item,
      rule_type: it.rule_type,
      params: it.params,
      max_score: ms,
    });
  }

  const subjectiveItems = [];
  const usedSubIds = new Set();
  let subSeq = 0;
  for (const it of rawSubjective) {
    if (!it || typeof it !== 'object') continue;
    const rawName = typeof it.item === 'string' && it.item.trim() !== '' ? it.item : it.name;
    const item = typeof rawName === 'string' ? rawName.trim() : '';
    const ms = Math.round(Number(it.max_score));
    if (!item || !Number.isFinite(ms) || ms <= 0) continue;
    let id = typeof it.id === 'string' && it.id.trim() !== '' ? it.id.trim() : null;
    if (!id) {
      do { subSeq += 1; id = 's' + subSeq; } while (usedSubIds.has(id));
    } else if (usedSubIds.has(id)) {
      continue;
    }
    usedSubIds.add(id);
    subjectiveItems.push({ id, item, max_score: ms });
  }

  // 总和归一化：客观项合计 → target = max_score - 主观项合计
  // 不足 → 末项补齐差额；超出 → 比例缩放 + 最大余数法取整（每项 ≥1 且合计精确 = target）
  const subSum = subjectiveItems.reduce((s, x) => s + x.max_score, 0);
  const target = maxScore - subSum;
  let objSum = objectiveItems.reduce((s, x) => s + x.max_score, 0);
  if (objectiveItems.length > 0 && objSum !== target) {
    if (objSum < target) {
      const diff = target - objSum;
      objectiveItems[objectiveItems.length - 1].max_score += diff;
    } else if (target > 0) {
      const n = objectiveItems.length;
      const scale = target / objSum;
      const raw = objectiveItems.map((x) => x.max_score * scale);
      const floors = raw.map((x) => Math.max(1, Math.floor(x)));
      let rem = target - floors.reduce((s, x) => s + x, 0);
      const order = raw
        .map((x, i) => i)
        .sort((i, j) => (raw[j] - floors[j]) - (raw[i] - floors[i]));
      for (let k = 0; rem > 0 && k < n * 2; k += 1) {
        floors[order[k % n]] += 1;
        rem -= 1;
      }
      objectiveItems.forEach((x, i) => { x.max_score = Math.max(1, floors[i]); });
    }
    objSum = objectiveItems.reduce((s, x) => s + x.max_score, 0);
    if (objSum !== target && objectiveItems.length > 0) {
      const last = objectiveItems.length - 1;
      objectiveItems[last].max_score += target - objSum;
      if (objectiveItems[last].max_score <= 0) {
        // 极端兜底：末项被扣到 ≤0 时从最大项借分
        const maxIdx = objectiveItems.reduce((mi, x, i, arr) => (arr[i].max_score > arr[mi].max_score ? i : mi), 0);
        const need = 1 - objectiveItems[last].max_score;
        objectiveItems[last].max_score = 1;
        objectiveItems[maxIdx].max_score -= need;
      }
    }
  }

  return { max_score: maxScore, objective_items: objectiveItems, subjective_items: subjectiveItems };
}

// ===================== 固定分项三分类校验（Team B 2026-08-18） =====================

/** 规则描述中「固定分项名 + 分隔符 + 检查描述」式写法的分隔符（用于 item 匹配） */
const RUBRIC_NAME_SEPARATORS = ['（', '(', ':', '：', ',', '，', ' '];

/**
 * 校验固定分项分类与生成规则的一致性（Rubric Analyzer 三分类）：
 * automation_level=subjective 的固定分项不得被生成为 objective 客观规则（应原样放入
 * subjective_items）。匹配依据（prompt 约定 objective 项 group=评分标准分项名）：
 * objective 项的 group 或 item 与固定分项名完全一致，或 item 以「分项名 + 分隔符」开头。
 * 旧 rubricItems（无 automation_level，normalizeRubricItems 兜底为 deterministic）天然不触发校验。
 * @param {object} rules parseCheckerRules 结果
 * @param {Array|null} fixedItems 固定分项（含 automation_level 字段）
 * @returns {Array<string>} 被错误写入 objective_items 的「主观」分类分项名（空数组 = 通过）
 */
export function findMisplacedSubjective(rules, fixedItems) {
  if (!rules || !Array.isArray(rules.objective_items)) return [];
  const fixed = Array.isArray(fixedItems) ? fixedItems : [];
  const subjectiveNames = fixed
    .filter((it) => it && typeof it === 'object' && it.automation_level === 'subjective')
    .map((it) => String(it.item || '').trim())
    .filter((name) => name.length > 0);
  if (subjectiveNames.length === 0) return [];
  const objPairs = rules.objective_items
    .filter((o) => o && typeof o === 'object')
    .map((o) => [String(o.group || '').trim(), String(o.item || '').trim()]);
  return subjectiveNames.filter((name) =>
    objPairs.some(([group, item]) =>
      group === name
      || item === name
      || RUBRIC_NAME_SEPARATORS.some((sep) => item.startsWith(name + sep))));
}

// ===================== 旧脚本沙箱执行（保留，历史兼容） =====================

/**
 * 在子进程中沙箱执行旧检查脚本（module.exports = { check(rootDir) }），返回解析后的结果。
 * 超时/异常时抛错（错误信息含 stderr 片段）。
 * @param {string} script 脚本源码
 * @param {string} rootDir 学生/标准工程根目录
 * @returns {Promise<{totalScore: number, items: Array, subjective: Array}>}
 */
export async function runCheckerScript(script, rootDir) {
  const scriptPath = path.join(
    os.tmpdir(),
    'checker-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.cjs',
  );
  fs.writeFileSync(scriptPath, script);
  const runner = [
    'const m = require(' + JSON.stringify(scriptPath) + ');',
    'const rootDir = process.argv[1];',
    'Promise.resolve(m.check(rootDir)).then((result) => {',
    '  process.stdout.write(JSON.stringify(result));',
    '}).catch((err) => { console.error(err && err.stack ? err.stack : String(err)); process.exit(1); });',
  ].join('\n');
  try {
    const { stdout } = await execFileAsync(process.execPath, ['-e', runner, rootDir], {
      timeout: SCRIPT_TIMEOUT_MS,
      maxBuffer: SCRIPT_MAX_BUFFER,
    });
    const result = parseCheckerResult(stdout);
    if (!result) throw new Error('检查脚本输出不是合法结果 JSON');
    return result;
  } catch (err) {
    if (err && err.killed) throw new Error('检查脚本执行超时（' + SCRIPT_TIMEOUT_MS + 'ms）');
    const stderr = String((err && err.stderr) || (err && err.message) || err).slice(0, 500);
    throw new Error('检查脚本执行失败：' + stderr);
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (e) { /* 忽略清理失败 */ }
  }
}

// ===================== LLM 调用（非思考模式，重试 2 次） =====================

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

// ===================== Prompt 构建 =====================

/**
 * 构建第 1 轮「生成规则」用户提示词：题目描述 + 评分标准全文 + 满分 + 规则格式 + 白名单 + 文件树。
 * 要求输出严格 JSON（{ max_score, objective_items, subjective_items }），只输出 JSON。
 * @param {string} rubric 教师评分标准
 * @param {number} maxScore 满分
 * @param {Array|null} fixedItems 固定分项（rubricItems 注入）
 * @param {string} stdFileTree 标准包文件树文本
 * @param {string} description 题目描述（2026-08-18 起参与生成）
 * @returns {string}
 */
export function buildGenerateUserPrompt(rubric, maxScore, fixedItems, stdFileTree, description) {
  const fixed = (Array.isArray(fixedItems) && fixedItems.length > 0)
    ? '\n\n【固定分项（必须逐项覆盖，不得增删改；满分合计 ' + maxScore + ' 分）】\n'
      + fixedItems.map((it, i) => (i + 1) + '. ' + it.item + automationLabel(it) + '（' + it.maxScore + ' 分）').join('\n')
    : '';
  const treeSection = stdFileTree
    ? '\n\n【标准工程包文件树（事实依据，请据此确定文件路径，不要猜测）】\n' + stdFileTree + '\n'
    : '';
  const descSection = (description && String(description).trim())
    ? '【题目描述】\n' + String(description).trim() + '\n\n'
    : '';
  return '【评分标准】\n' + rubric + '\n\n'
    + '【满分】' + maxScore + ' 分' + fixed + '\n\n'
    + descSection
    + treeSection + '\n\n'
    + '【规则格式（严格 JSON，仅此一种输出）】\n' + RULES_FORMAT + '\n\n'
    + '【示例（仅格式参考）】\n' + RULES_EXAMPLE + '\n\n'
    + '【fact 规则可用字段（params: {fact, op, value}，op: >= > <= < == != includes not_includes）】\n' + FACTS_SCHEMA + '\n'
    + '要求：\n'
    + '- 输出严格 JSON：{ max_score, objective_items, subjective_items }；只输出 JSON 本身，不要任何解释、代码块围栏或多余文字\n'
    + '- 字段名必须是 item（规则中文描述），绝对不要用 name；subjective_items 必须输出，无主观项时输出空数组 []\n'
    + '- objective_items 覆盖所有可确定性检查的评分点，每项含 id/group/item/rule_type/params/max_score；params 必须具体可执行（真实文件路径、正则表达式等）\n'
    + '- rule_type 只能使用白名单类型：' + RULE_TYPES.join(' / ') + '\n'
    + '- 分组：评分标准的每个分项用 group 字段关联；多个客观项可同 group，group 内 max_score 之和必须等于该分项满分\n'
    + '- 分项必须严格来自评分标准，按评分标准自然拆分，不要人为合并或压缩；禁止自创评分标准未提及的检查项（如 README/test/eslint 等）\n'
    + '- 只有无法通过静态文件检查确定分数的项才放入 subjective_items，不要用规则判断主观项\n'
    + '- 分类标注为（主观）的固定分项禁止生成 objective 规则，必须原样放入 subjective_items；分类标注为（确定性）的固定分项必须全部生成可执行客观规则（objective_items）；分类标注为（半确定）的固定分项允许客观规则与主观评分混合\n'
    + '- objective_items 总分 + subjective_items 总分必须恰好等于 max_score\n'
    + '- 只输出 JSON。';
}

/**
 * 构建第 2 轮起「校准修正规则」用户提示词。
 * 分两种情况：规则解析/执行失败（反馈错误信息）与执行成功但未达标（反馈扣分项）。
 * 模型修正规则参数（rule_type/params/max_score），不是重写代码。
 * @param {{result?: object, deductions?: Array, error?: string}} feedback 上一轮反馈
 * @param {string} stdFileTree 标准包文件树文本
 * @param {Array|null} fixedItems 固定分项
 * @param {object|null} prevRules 上一轮有效规则（供模型基于它修正）
 * @returns {string}
 */
function buildCalibrateUserPrompt(feedback, stdFileTree, fixedItems, prevRules) {
  const treeSection = stdFileTree
    ? '\n\n【标准工程包文件树（事实依据：标准包实际存在的文件，请据此修正路径/正则等参数）】\n' + stdFileTree + '\n'
    : '';
  const fixedSection = Array.isArray(fixedItems) && fixedItems.length > 0
    ? '\n\n【固定分项（必须严格逐项覆盖，不得增删改）】\n' + fixedItems.map((it, i) => (i + 1) + '. ' + it.item + automationLabel(it) + '（' + it.maxScore + ' 分）').join('\n') + '\n'
    : '';
  const prevRulesSection = prevRules
    ? '\n\n【上一版规则（请基于它修正 rule_type/params/max_score，不要改写成代码）】\n' + JSON.stringify(prevRules, null, 2) + '\n'
    : '';
  const PATH_RULES = '铁律：params.path/params.dir 必须来自【标准工程包文件树】中真实存在的文件/目录，绝对禁止编造文件路径；'
    + '正则匹配不到时，先依据文件片段调整正则或改用其他检查方式（如 contains_text 关键字），不要重复同一写法。';
  if (feedback && feedback.error) {
    return '以下评分规则在标准工程包上检查失败。请基于上一版规则修正规则参数（rule_type/params/max_score 等），不要改写成代码，也不要新增评分标准未提及的检查项。\n'
      + PATH_RULES + '\n'
      + '【错误】' + String(feedback.error).slice(0, 1200) + '\n'
      + prevRulesSection + fixedSection + treeSection + '\n'
      + '只输出修正后的完整规则 JSON。';
  }
  const failedItems = (feedback && Array.isArray(feedback.deductions) ? feedback.deductions : [])
    .filter((it) => it.score < it.max_score)
    .map((it) => {
      let line = '- ' + it.item + '：应得 ' + it.max_score + ' 分，实得 ' + it.score + ' 分，证据：' + (it.evidence || '');
      if (it.snippet) line += '；文件开头片段：「' + it.snippet + '」';
      return line;
    })
    .join('\n');
  const defectSection = (feedback && Array.isArray(feedback.defectItems) && feedback.defectItems.length > 0)
    ? '\n【标准包缺陷候选（保留项，不要修改或删除）】以下规则引用的文件在标准包中不存在。若评分标准确实要求这些能力，请保留这些规则原样（标准包自身未实现，将交由教师确认处理）；它们不计入校准扣分。\n'
      + feedback.defectItems.map((x, i) => (i + 1) + '. ' + x).join('\n') + '\n'
    : '';
  // 负例验证（Team A）：弱规则（区分度不足）进入修复反馈（Rule Repair）
  const weakRulesSection = (feedback && Array.isArray(feedback.weakRules) && feedback.weakRules.length > 0)
    ? '\n【弱规则（区分度不足）】以下规则在缺陷变体上仍通过，无法区分真实实现与表面实现，请改为更具体的检查（更精确的路径/内容/组合条件），不要删除该评分项：\n'
      + feedback.weakRules.map((w) => '- ' + (w.item || ('规则 ' + w.id)) + '（' + w.id + '）：' + (w.reason || '')).join('\n') + '\n'
    : '';
  return '以下评分规则在标准工程包上检查未得满分（缺陷候选除外）。标准工程包不应被扣分，说明其余规则参数有误（路径/正则/匹配方式/评分比例等）。'
    + '请基于上一版规则修正 rule_type/params/max_score，只针对以下扣分项调整，其他已正确的检查项不要改动，也不要改写成代码。\n'
    + PATH_RULES + '\n'
    + '【扣分项】\n' + (failedItems || '（无扣分项，请检查 max_score 合计）') + defectSection + weakRulesSection
    + prevRulesSection + fixedSection + treeSection + '\n'
    + '输出修正后的完整规则 JSON（规则格式与满分合计保持不变）。';
}

// ===================== 负例验证反馈接线（Team A） =====================

/**
 * 把负例验证结果（weakRules）挂载到校准反馈对象上（纯函数，供单测）。
 * 只在 lastFeedback 生成处调用；weakRules 为空数组时不添加任何段落（prompt 按空判断）。
 * @param {object|null} lastFeedback 上一轮反馈（{ result, deductions, defectItems } 或 { error }）
 * @param {Array|null} weakRules 负例验证弱规则 [{id, item, reason}]；非数组视为空
 * @returns {object} 携带 weakRules 的新反馈对象（不修改入参）
 */
export function attachNegativeFeedback(lastFeedback, weakRules) {
  const base = lastFeedback && typeof lastFeedback === 'object' && !Array.isArray(lastFeedback)
    ? { ...lastFeedback }
    : {};
  base.weakRules = Array.isArray(weakRules) ? weakRules : [];
  return base;
}

// ===================== 状态读取 =====================

/**
 * 读取题目评分规则生成状态。
 * @param {number|string} questionId 题目 id
 * @returns {Promise<{status: string, script: string|null, meta: object}>}
 */
export async function getCheckerState(questionId) {
  const q = await prisma.question.findUnique({
    where: { id: +questionId },
    select: { checkerScript: true, checkerStatus: true, checkerMeta: true },
  });
  if (!q) return { status: 'none', script: null, meta: null };
  const meta = q.checkerMeta || {
    rounds: 0, rules: null, items: [], subjective: [], log: [], error: null,
    report: null, versions: [], inputsSnapshot: null, threshold: DEFAULT_THRESHOLD, activeVersionId: null,
  };
  return { status: q.checkerStatus || 'none', script: q.checkerScript, meta };
}

// ===================== 体检报告 / 版本 / 快照（2026-08-18 §4.1/§4.3） =====================

/** 标准包指纹：文件相对路径+大小 排序后 SHA1（判断标准包是否更换） */
function packageFingerprint(rootDir) {
  try {
    const lines = [];
    const walk = (dir, rel) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relPath = rel ? rel + '/' + ent.name : ent.name;
        if (ent.isDirectory()) walk(full, relPath);
        else lines.push(relPath + ':' + fs.statSync(full).size);
      }
    };
    walk(rootDir, '');
    return crypto.createHash('sha1').update(lines.sort().join('\n')).digest('hex').slice(0, 12);
  } catch (err) {
    return null;
  }
}

/** 追加规则版本记录（rules 全文快照，支持回滚）；status: 'draft' | 'active' */
function appendVersion(meta, rulesText, status, reason) {
  const list = Array.isArray(meta.versions) ? meta.versions : [];
  const maxId = list.reduce((m, v) => Math.max(m, Number(v.id) || 0), 0);
  const id = maxId + 1;
  list.push({
    id,
    version: 'v' + id,
    status,
    reason,
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    rules: rulesText,
  });
  meta.versions = list;
  if (status === 'active') meta.activeVersionId = id;
  return id;
}

/** 报告项标记：标准包未包含该文件（缺陷候选，交教师转主观/豁免/接受） */
function markDefectReportItems(meta, missingPathIds) {
  if (!meta.report || !missingPathIds || missingPathIds.size === 0) return;
  for (const it of meta.report.items || []) {
    if (missingPathIds.has(it.id)) {
      it.note = '标准包未包含该文件（缺陷候选：评分标准要求但标准包未实现，可转主观/豁免/接受失分）';
    }
  }
}

/** 由 runRules 结果构建标准包体检报告（失分项 → 教师处理：转主观/豁免/接受失分） */
function buildReport(meta, rules, resultItems, maxScore) {
  const deductions = (Array.isArray(resultItems) ? resultItems : [])
    .filter((it) => it.score < it.max_score);
  meta.report = {
    score: maxScore - deductions.reduce((s, it) => s + (it.max_score - it.score), 0),
    max_score: maxScore,
    threshold: meta.threshold || DEFAULT_THRESHOLD,
    items: deductions.map((it) => ({
      id: it.id,
      group: it.group || '',
      ruleLabel: it.item || ('规则 ' + it.id),
      deduction: it.max_score - it.score,
      status: 'pending',
      note: (it.evidence || '').slice(0, 120) || '标准包未满足该规则',
    })),
  };
}

// ===================== 规则路径校验 / 文件片段（L1/L2：通用防幻觉，2026-08-18） =====================

/** 规则参数中作为「路径」使用的字段（按 rule_type） */
const PATH_PARAM_BY_TYPE = {
  file_exists: 'path',
  contains_text: 'path',
  count_regex: 'path',
  contains_regex: 'path',
  dir_contains_file: 'dir',
  file_count_in_dir: 'dir',
  syntax_check: 'dir',
};

/**
 * 收集工程根下全部文件/目录（相对路径，用于路径白名单校验）。
 * @param {string} projectRoot resolveProjectRoot 结果
 * @returns {{files: Set<string>, dirs: Set<string>}}
 */
function collectProjectPaths(projectRoot) {
  const files = new Set();
  const dirs = new Set();
  const walk = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) {
        dirs.add(relPath);
        walk(path.join(dir, ent.name), relPath);
      } else {
        files.add(relPath);
      }
    }
  };
  walk(projectRoot, '');
  return { files, dirs };
}

/**
 * L1 路径白名单校验：规则引用的 path/dir 必须真实存在于标准工程包（相对工程根）。
 * AI 幻觉不存在的文件（如 DataController.java）会在校准前被拦截并作为反馈，
 * 避免整轮空转（355 卡 76 分的根因）。
 * @param {object} rules
 * @param {{files: Set<string>, dirs: Set<string>}} paths
 * @returns {Array<{id: string, path: string, kind: string}>} 不存在的引用
 */
function validateRulePaths(rules, paths) {
  const errors = [];
  for (const item of rules.objective_items || []) {
    const key = PATH_PARAM_BY_TYPE[item.rule_type];
    if (!key) continue;
    const p = item.params && item.params[key];
    if (typeof p !== 'string' || !p) continue;
    const clean = p.replace(/^\.\//, '');
    const exists = key === 'dir' ? paths.dirs.has(clean) || paths.files.has(clean) : paths.files.has(clean);
    if (!exists) errors.push({ id: item.id, path: p, kind: key });
  }
  return errors;
}

/**
 * L2 校准反馈增强：读取失分规则指向的文件开头片段（供模型修正正则/匹配方式）。
 * @param {string} projectRoot
 * @param {Array} objectiveItems 本轮规则
 * @param {Array} deductions 失分项（runRules 结果）
 * @returns {Array} 附带 snippet 的失分项
 */
function enrichDeductionSnippets(projectRoot, objectiveItems, deductions) {
  const byId = new Map(objectiveItems.map((it) => [it.id, it]));
  return deductions.map((it) => {
    const rule = byId.get(it.id);
    const key = rule && PATH_PARAM_BY_TYPE[rule.rule_type];
    const p = key === 'path' && rule && rule.params && rule.params.path;
    if (!p) return it;
    try {
      const abs = path.resolve(projectRoot, p);
      if (!abs.startsWith(path.resolve(projectRoot) + path.sep)) return it;
      const content = fs.readFileSync(abs, 'utf8').slice(0, 200).replace(/\s+/g, ' ');
      return { ...it, snippet: content };
    } catch (e) {
      return it;
    }
  });
}

// ===================== 生成 + 自举校准（核心） =====================

/**
 * 将题目标记为 failed 并落库（meta.error 说明失败原因）。
 * @param {number} id 题目 id
 * @param {object} meta 运行期 meta（引用）
 * @param {string} error 失败说明
 * @returns {Promise<{status: string, error: string}>}
 */
async function markFailed(id, meta, error) {
  meta.error = error;
  await prisma.question.update({
    where: { id },
    data: { checkerStatus: 'failed', checkerMeta: meta },
  });
  logger.error({ questionId: id, error }, 'checkerService: 评分规则生成失败（failed）');
  return { status: 'failed', error };
}

/**
 * AI 生成 JSON 评分规则 + 自举校准（核心入口，规则驱动）。
 * 流程：置 generating → 第 1 轮 LLM 生成规则 JSON → parseCheckerRules →
 * runRules(规则, 标准包) 执行 → 满分则 ready；达标（≥阈值）则 review（交教师确认，
 * 含体检报告与版本快照）；未达标则构造校准反馈让 LLM 修正参数（round+1）→ 重跑；
 * ≤ MAX_ROUNDS 轮；多轮取最优规则。超轮后最优仍达标 → review，否则 failed。
 * LLM 调用失败重试 2 次；仍失败 → failed+error。已在 generating/calibrating 时幂等返回。
 * 规则存储：questions.checkerScript 字段存规则 JSON 文本（字段名不变，前端兼容）。
 * @param {number|string} questionId 题目 id
 * @returns {Promise<{status: string, rounds?: number, totalScore?: number, error?: string}|null>}
 */
export async function generateChecker(questionId) {
  const id = +questionId;
  const question = await prisma.question.findUnique({
    where: { id },
    select: {
      id: true, maxScore: true, scoringRubric: true, checkerStatus: true,
      rubricItems: true, material: true,
    },
  });
  if (!question) {
    logger.warn({ questionId: id }, 'checkerService: 题目不存在，无法生成评分规则');
    return null;
  }
  // 幂等：generating/calibrating 且 15 分钟内活跃 → 直接返回；陈旧状态（服务重启中断等）允许重新生成
  if (question.checkerStatus === 'generating' || question.checkerStatus === 'calibrating') {
    const started = Number((question.checkerMeta && question.checkerMeta.startedAt) || 0);
    if (Date.now() - started < STALE_GENERATION_MS) {
      logger.info({ questionId: id }, 'checkerService: 已在生成中，幂等返回');
      return { status: 'generating' };
    }
    logger.warn({ questionId: id, started }, 'checkerService: 检测到陈旧生成状态，允许重新生成');
  }
  const maxScore = Math.max(0, Number(question.maxScore) || DEFAULT_MAX_SCORE);
  const rubric = (question.scoringRubric || '').trim() || '默认评分标准：功能完整性 / 代码规范性 / 健壮性';

  const meta = {
    rounds: 0, rules: null, items: [], subjective: [], log: [], error: null,
    report: null, versions: [], inputsSnapshot: null, threshold: DEFAULT_THRESHOLD, activeVersionId: null,
    startedAt: Date.now(),
  };
  await prisma.question.update({
    where: { id },
    data: { checkerStatus: 'generating', checkerMeta: meta },
  });
  logger.info({ questionId: id, maxScore }, 'checkerService: 开始生成评分规则（自举校准）');

  const rootDir = standardDir(id);
  if (!fs.existsSync(rootDir)) {
    logger.warn({ questionId: id, rootDir }, 'checkerService: 标准工程包目录不存在');
    return markFailed(id, meta, '标准工程包目录不存在：' + rootDir + '。可能标准包本身有瑕疵，请人工确认。');
  }
  // 输入快照：保存守卫用（评分标准/满分/描述/标准包任一变更 → 提示重新生成）
  meta.inputsSnapshot = {
    rubric: (question.scoringRubric || '').trim(),
    maxScore,
    description: stripHtml(question.material),
    packageFingerprint: packageFingerprint(rootDir),
  };
  await prisma.question.update({
    where: { id },
    data: { checkerMeta: meta },
  });

  // 分项必须来自题干+评分标准：优先用 rubricItems 固定分项，无则提炼一次
  let fixedItems = Array.isArray(question.rubricItems) && question.rubricItems.length > 0 ? question.rubricItems : null;
  if (!fixedItems) {
    try { fixedItems = await summarizeRubricItems(rubric, maxScore); } catch { fixedItems = null; }
  }

  // 工程根（规则路径以此解析）与标准包文件树（第 1 轮生成与校准反馈共用的事实依据）
  // 2026-08-18 L1 修正：树文本基于 projectRoot 生成，模型看到的路径 = 规则执行解析的路径，
  // 避免标准包外层目录前缀（如 demo2/）导致模型路径引用与执行不一致。
  const projectRoot = resolveProjectRoot(rootDir);
  const stdTree = buildFileTree(projectRoot);
  const stdTreeText = buildFileTreeText(filterProjectFiles(stdTree, projectRoot).kept, { withSizes: false });
  // L1：路径白名单（一次性构建，每轮校验）
  const projectPaths = collectProjectPaths(projectRoot);

  let bestRules = null;
  let bestScore = -1;
  let bestDefectIds = new Set();
  // 上一轮有效规则：供校准提示让模型基于它修正参数（改 rule_type/params/max_score，不是重写代码）
  let lastRules = null;
  // 上一轮反馈：运行成功 → { result, deductions }；解析/运行失败 → { error }
  let lastFeedback = null;
  // 卡死检测：连续同分 ≥ STUCK_ROUNDS → 下一轮全新生成（防原地踏步）
  let lastTotalScore = null;
  let stuckCount = 0;

  // 单轮执行：解析 → 结构检查 → L1 路径白名单 → runRules；失败抛错（错误信息即校准反馈）
  // 2026-08-18：解析失败时给出针对性提示（缺 subjective_items / 缺 objective_items），替代模糊的总和错误
  const evaluateRound = async (output) => {
    const rules = parseCheckerRules(output);
    if (!rules) {
      const raw = typeof output === 'string' ? output : '';
      const hasMax = /"max_score"\s*:/.test(raw);
      const hasObj = /"objective_items"\s*:/.test(raw);
      const hasSub = /"subjective_items"\s*:/.test(raw);
      if (hasMax && hasObj && !hasSub) {
        throw new Error('规则解析失败：缺少 subjective_items 数组（无主观项时必须输出空数组 []）');
      }
      if (hasMax && !hasObj) {
        throw new Error('规则解析失败：缺少 objective_items 数组');
      }
      throw new Error('规则解析失败：模型输出不是合法评分规则 JSON（请严格按【规则格式】输出：max_score + objective_items/subjective_items 数组）');
    }
    if (rules.objective_items.length === 0 && rules.subjective_items.length === 0) {
      throw new Error('规则解析失败：objective_items 与 subjective_items 全部无效。每项必须包含：item（规则中文描述，不是 name）、rule_type（白名单内）、params（对象）、max_score（正整数）；请按【规则格式】重新输出。');
    }
    // Team B 三分类校验：subjective 分类的固定分项不得被生成为 objective 规则
    // （复用现有校准错误通道：抛错 → 下一轮校准反馈，错误信息指明具体分项名）
    const misplaced = findMisplacedSubjective(rules, fixedItems);
    if (misplaced.length > 0) {
      throw new Error('规则校准校验失败：「主观」分类分项被错误生成为客观规则（objective_items），'
        + '请将这些分项移除并原样放入 subjective_items：' + misplaced.join('、'));
    }
    // L1 路径白名单校验（§4.1 标准包缺陷候选机制，2026-08-18）：
    // 规则引用标准包不存在的文件 → 不判死整轮；标记为缺陷候选（评分标准要求但标准包未实现），
    // 保留在规则中（学生仍按此评分），从校准得分中豁免（标准包自身缺陷，交教师确认/转主观）。
    const pathErrors = validateRulePaths(rules, projectPaths);
    const missingPathIds = new Set(pathErrors.map((e) => e.id));
    // 执行器契约：runRules(rules, rootDir) → { totalScore, items, subjective, groupSummary }
    const result = await runRules(rules, rootDir);
    const totalScore = Number(result && result.totalScore) || 0;
    return { rules, result, totalScore, missingPathIds };
  };

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    meta.rounds = round;
    const fresh = round === 1 || stuckCount >= STUCK_ROUNDS;
    if (fresh) stuckCount = 0;
    const promptForRound = fresh
      ? buildGenerateUserPrompt(rubric, maxScore, fixedItems, stdTreeText, stripHtml(question.material))
      : buildCalibrateUserPrompt(lastFeedback, stdTreeText, fixedItems, lastRules);
    logger.info({ questionId: id, round, fresh: fresh && round > 1 }, 'checkerService: 第 ' + round + ' 轮生成规则');
    if (fresh && round > 1) logger.info({ questionId: id, round }, 'checkerService: 卡死 ≥' + STUCK_ROUNDS + ' 轮，改为全新生成');

    let output = null;
    let outcome = null; // { rules, result, totalScore } | null（失败）
    let lastErrMsg = '';
    // 每轮同 prompt 最多尝试 2 次：模型偶发格式崩坏时同 prompt 重试，不污染校准反馈（2026-08-18）
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        output = await callLlm(GENERATE_SYSTEM, promptForRound);
      } catch (err) {
        logger.error({ questionId: id, err: err.message }, 'checkerService: LLM 调用失败，终止生成');
        return markFailed(id, meta, 'LLM 调用失败：' + err.message);
      }
      try {
        outcome = await evaluateRound(output);
        break;
      } catch (err) {
        lastErrMsg = String(err && err.message ? err.message : err);
        logger.warn({ questionId: id, round, attempt, err: lastErrMsg.slice(0, 200) }, 'checkerService: 本轮尝试失败');
      }
    }

    if (!outcome) {
      const snippet = output ? '；模型输出前 150 字符：' + String(output).slice(0, 150).replace(/\n/g, ' ') : '';
      meta.log.push({ round, totalScore: null, detail: '本轮规则检查失败：' + lastErrMsg.slice(0, 300) + snippet });
      lastFeedback = { error: lastErrMsg };
      await prisma.question.update({ where: { id }, data: { checkerMeta: meta } });
      logger.warn({ questionId: id, round, err: lastErrMsg }, 'checkerService: 本轮规则检查失败');
      continue;
    }

    const { rules, result, totalScore, missingPathIds } = outcome;
    // 缺陷候选项（标准包未实现但评分标准要求）：从校准得分中豁免（§4.1 标准包 ≠ 满分答案）
    const defectItems = rules.objective_items.filter((i) => missingPathIds.has(i.id));
    const defectSum = defectItems.reduce((s, i) => s + i.max_score, 0);
    const calibScore = totalScore + defectSum;
    // 真实失分（非缺陷候选）：文件存在但规则未匹配/未满足 → 应通过校准修正
    const realDeductionSum = (Array.isArray(result.items) ? result.items : [])
      .filter((it) => it.score < it.max_score && !missingPathIds.has(it.id))
      .reduce((s, it) => s + (it.max_score - it.score), 0);
    // 负例验证（Team A）：对标准包上通过的规则派生确定性缺陷变体，判定目标规则必失分（防过拟合）。
    // 入参为**解压根目录 rootDir（未解析）**（BUG-A-03：传已解析的 projectRoot 会导致嵌套工程
    // 二次下钻、规则路径全部失配、covered=0）；异常 catch 后跳过，绝不因负例验证失败而终止生成流程；
    // weak 规则不阻塞达标判定，但进入修复反馈。
    let neg = { covered: 0, skipped: [], weakRules: [], variantsRun: 0 };
    const passedRules = (Array.isArray(result.items) ? result.items : []).filter((it) => it.score === it.max_score);
    if (passedRules.length > 0) {
      try {
        neg = await validateNegativeTests(rules, rootDir, { concurrency: 4 });
      } catch (err) {
        logger.warn(
          { questionId: id, err: String(err && err.message ? err.message : err) },
          'checkerService: 负例验证异常，跳过（不影响生成流程）',
        );
        neg = {
          covered: 0,
          skipped: [{ id: '*', reason: '负例验证异常：' + String(err && err.message ? err.message : err).slice(0, 200) }],
          weakRules: [],
          variantsRun: 0,
        };
      }
    }
    const negDetail = neg.weakRules.length > 0
      ? '；负例验证：' + neg.weakRules.length + ' 条弱规则（覆盖 ' + neg.covered + '，跳过 ' + neg.skipped.length + '）'
      : (neg.covered > 0 || neg.skipped.length > 0
          ? '；负例验证：覆盖 ' + neg.covered + '，跳过 ' + neg.skipped.length
          : '');
    meta.log.push({
      round,
      totalScore,
      detail: 'totalScore=' + totalScore + ' / ' + rules.max_score
        + '（objective ' + (Array.isArray(result.items) ? result.items.length : 0)
        + ' 项，subjective ' + (Array.isArray(result.subjective) ? result.subjective.length : 0) + ' 项'
        + (defectItems.length ? '；缺陷候选 ' + defectItems.length + ' 项（豁免 ' + defectSum + ' 分）' : '') + '）'
        + negDetail,
    });
    if (calibScore > bestScore) {
      bestScore = calibScore;
      bestRules = rules;
      bestDefectIds = new Set(missingPathIds);
    }
    // 卡死检测
    if (lastTotalScore !== null && totalScore === lastTotalScore) stuckCount += 1;
    else stuckCount = 0;
    lastTotalScore = totalScore;
    // 规则存储：checkerScript 字段存规则 JSON 文本（字段名不变，前端兼容）
    const rulesText = JSON.stringify(rules);
    await prisma.question.update({ where: { id }, data: { checkerScript: rulesText, checkerMeta: { ...meta } } });
    // 第 1 轮之后进入校准态（前端轮询展示"校准中"）
    if (round === 1) {
      await prisma.question.update({ where: { id }, data: { checkerStatus: 'calibrating' } });
    }
    // 满分/达标判定：校准得分达标（calibScore = totalScore + 缺陷候选豁免分）且真实失分为 0
    // （真实失分 = 规则参数问题，应继续校准修正；缺陷候选豁免仅用于防标准包缺陷卡死）
    const subSumCheck = (rules.subjective_items || []).reduce((s, x) => s + (Number(x.max_score) || 0), 0);
    const threshold = meta.threshold || DEFAULT_THRESHOLD;
    if (calibScore >= rules.max_score - subSumCheck && realDeductionSum === 0) {
      meta.rules = rules;
      meta.items = Array.isArray(result.items) ? result.items : [];
      meta.subjective = Array.isArray(result.subjective) ? result.subjective : [];
      buildReport(meta, rules, result.items, rules.max_score);
      markDefectReportItems(meta, missingPathIds);
      appendVersion(meta, rulesText, 'active', '校准满分就绪（校准得分 ' + calibScore + '/' + rules.max_score + ' 分' + (defectItems.length ? '，含 ' + defectItems.length + ' 项缺陷候选豁免' : '') + '）');
      await prisma.question.update({
        where: { id },
        data: { checkerStatus: 'ready', checkerScript: rulesText, checkerMeta: { ...meta, error: null } },
      });
      logger.info(
        { questionId: id, round, totalScore, calibScore, defectCount: defectItems.length },
        'checkerService: 生成通过，评分规则就绪（ready）',
      );
      return { status: 'ready', rounds: round, totalScore };
    }
    // 置信度阈值达标（如 ≥90/100）：标准包缺陷豁免后达标且无真实失分 → review（2026-08-18 §4.1）
    if (calibScore >= threshold && realDeductionSum === 0) {
      meta.rules = rules;
      meta.items = Array.isArray(result.items) ? result.items : [];
      meta.subjective = Array.isArray(result.subjective) ? result.subjective : [];
      buildReport(meta, rules, result.items, rules.max_score);
      markDefectReportItems(meta, missingPathIds);
      appendVersion(meta, rulesText, 'draft', '校准达标（校准得分 ' + calibScore + '/' + rules.max_score + ' 分，阈值 ≥' + threshold + '，含 ' + defectItems.length + ' 项缺陷候选豁免），待教师确认');
      await prisma.question.update({
        where: { id },
        data: { checkerStatus: 'review', checkerScript: rulesText, checkerMeta: { ...meta, error: null } },
      });
      logger.info(
        { questionId: id, round, totalScore, calibScore, defectCount: defectItems.length },
        'checkerService: 校准达标进入 review，等待教师确认',
      );
      return { status: 'review', rounds: round, totalScore };
    }
    // 未达标：记录本轮规则与扣分项（附文件片段，L2，缺陷候选除外），下一轮让模型修正规则参数
    lastRules = rules;
    // 负例验证接线：weakRules（区分度不足）随反馈进入下一轮校准 prompt（若本轮无通过规则则为空数组）
    lastFeedback = attachNegativeFeedback({
      result,
      defectItems: defectItems.map((i) => i.item + '（' + i.max_score + ' 分）'),
      deductions: enrichDeductionSnippets(
        projectRoot,
        rules.objective_items,
        (Array.isArray(result.items) ? result.items : [])
          .filter((it) => it.score < it.max_score && !missingPathIds.has(it.id)),
      ),
    }, neg.weakRules);
  }
  // 多轮未满分：若最优规则的校准得分（含缺陷候选豁免）达到阈值 → review（教师确认/处理失分项）；否则 failed
  const threshold = meta.threshold || DEFAULT_THRESHOLD;
  if (bestRules && bestScore >= threshold) {
    meta.rules = bestRules;
    const bestText = JSON.stringify(bestRules);
    try {
      const bestResult = await runRules(bestRules, rootDir);
      meta.items = Array.isArray(bestResult.items) ? bestResult.items : [];
      buildReport(meta, bestRules, bestResult.items, bestRules.max_score);
      markDefectReportItems(meta, bestDefectIds);
    } catch (err) {
      meta.report = null;
    }
    appendVersion(meta, bestText, 'draft', '多轮最优规则达标（校准得分 ' + bestScore + '/' + maxScore + ' 分，阈值 ≥' + threshold + '），待教师确认');
    await prisma.question.update({
      where: { id },
      data: { checkerStatus: 'review', checkerScript: bestText, checkerMeta: { ...meta, error: null } },
    });
    logger.info({ questionId: id, bestScore }, 'checkerService: 多轮最优规则达标进入 review');
    return { status: 'review', rounds: MAX_ROUNDS, totalScore: bestScore };
  }
  // 保留最优规则（供人工查看/继续），标记 failed
  if (bestRules) {
    meta.rules = bestRules;
    await prisma.question.update({ where: { id }, data: { checkerScript: JSON.stringify(bestRules), checkerMeta: { ...meta } } });
  }
  const reason = '生成 ' + MAX_ROUNDS + ' 轮后标准包最高得分 ' + bestScore + '/' + maxScore + ' 分，低于就绪阈值（≥' + threshold + '）。可能标准包本身有瑕疵或检查规则过严，请人工确认。';
  return markFailed(id, meta, reason);
}

// ===================== 教师确认 / 回滚（2026-08-18 §4.3/§11.6） =====================

/**
 * 教师确认操作（review 态）：
 * - confirm：确认启用（ready，当前草稿版本转 active）
 * - to_subjective：将失分规则项移入 subjective_items（AI 主观评分），重写 checker_script
 * - exempt / accept：标记体检报告失分项（豁免/接受），不改变规则
 * - update_rules：高级模式编辑规则 JSON 后保存（重新校验）
 * - regenerate：重新触发生成（fire-and-forget）
 * @param {number|string} questionId
 * @param {{action: string, itemIds?: Array, rules?: object}} body
 * @returns {Promise<{status: string, script: string|null, meta: object}|null>}
 */
export async function confirmChecker(questionId, body) {
  const id = +questionId;
  const { action, itemIds, rules: newRules } = body || {};
  const q = await prisma.question.findUnique({
    where: { id },
    select: { checkerScript: true, checkerStatus: true, checkerMeta: true },
  });
  if (!q) return null;
  const meta = q.checkerMeta || {};
  let script = q.checkerScript;
  let nextStatus = q.checkerStatus;

  if (action === 'regenerate') {
    generateChecker(id).catch((err) => logger.error({ err, questionId: id }, '自动评分器重新生成异常'));
    return { status: 'generating', script, meta };
  }

  if (action === 'update_rules') {
    if (!newRules || typeof newRules !== 'object') return { status: q.checkerStatus, script, meta };
    const v = validateRules(newRules);
    if (!v.ok) return { status: q.checkerStatus, script, meta, error: v.error };
    script = JSON.stringify(newRules);
    meta.rules = newRules;
    nextStatus = 'review';
  }

  if (action === 'confirm') {
    const list = Array.isArray(meta.versions) ? meta.versions : [];
    const latest = list[list.length - 1];
    if (latest) {
      list.forEach((x) => {
        x.status = x.id === latest.id ? 'active' : (x.status === 'active' ? 'archived' : x.status);
      });
      meta.activeVersionId = latest.id;
    }
    nextStatus = 'ready';
    meta.error = null;
  }

  if ((action === 'to_subjective' || action === 'exempt' || action === 'accept') && Array.isArray(itemIds)) {
    const report = meta.report || { items: [] };
    let rules = null;
    if (script) { try { rules = JSON.parse(script); } catch (e) { rules = null; } }
    for (const itemId of itemIds) {
      const rep = report.items.find((i) => String(i.id) === String(itemId));
      if (!rep) continue;
      if (action === 'to_subjective' && rules) {
        const idx = rules.objective_items.findIndex((o) => String(o.id) === String(itemId));
        if (idx >= 0) {
          const [obj] = rules.objective_items.splice(idx, 1);
          rules.subjective_items.push({
            id: 's' + (rules.subjective_items.length + 1),
            item: obj.item,
            max_score: obj.max_score,
            reason: '教师转主观',
          });
          script = JSON.stringify(rules);
        }
        rep.status = 'subjective';
        rep.note = '已转主观（AI 单次评分，温度 0）';
      } else if (action === 'exempt') {
        rep.status = 'exempt';
        rep.note = '教师豁免（不计入校准失分，规则仍对学生生效）';
      } else if (action === 'accept') {
        rep.status = 'accept';
        rep.note = '接受失分（保留扣分）';
      }
    }
    if (rules) meta.rules = rules;
    meta.report = report;
  }

  await prisma.question.update({
    where: { id },
    data: { checkerScript: script, checkerStatus: nextStatus, checkerMeta: meta },
  });
  return getCheckerState(id);
}

/**
 * 回滚到历史规则版本（版本快照存 checkerMeta.versions，阶段 1 迁移 RuleVersion 表）。
 * @param {number|string} questionId
 * @param {number} versionId
 * @returns {Promise<{status: string, script: string|null, meta: object}|null>}
 */
export async function rollbackChecker(questionId, versionId) {
  const id = +questionId;
  const q = await prisma.question.findUnique({
    where: { id },
    select: { checkerScript: true, checkerStatus: true, checkerMeta: true },
  });
  if (!q) return null;
  const meta = q.checkerMeta || {};
  const list = Array.isArray(meta.versions) ? meta.versions : [];
  const v = list.find((x) => Number(x.id) === Number(versionId));
  if (!v || !v.rules) return null;
  list.forEach((x) => {
    if (Number(x.id) === Number(versionId)) x.status = 'active';
    else if (x.status === 'active') x.status = 'archived';
  });
  meta.activeVersionId = Number(versionId);
  await prisma.question.update({
    where: { id },
    data: { checkerScript: v.rules, checkerStatus: 'ready', checkerMeta: meta },
  });
  return getCheckerState(id);
}
