/**
 * parsers.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 60-70 · 171-228 · 232-271 · 275-382 · 386-387 · 389-415）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

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
  } catch {
    return null;
  }
}

/** 宽容解析：围栏剥离 → 直接解析 → 首{末}切片解析 → 全文本配平补全（截断场景） */
function parseLooseJson(raw) {
  if (typeof raw !== 'string') return null;
  const stripped = raw.replace(/\`\`\`[a-zA-Z]*/g, '');
  try {
    return JSON.parse(stripped);
  } catch { /* 继续尝试 */ }
  const sliced = extractJsonText(stripped);
  if (sliced) {
    try {
      return JSON.parse(sliced);
    } catch { /* 截断场景：继续尝试补全 */ }
  }
  return repairTruncatedJson(stripped);
}

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

export { RULE_TYPES };
