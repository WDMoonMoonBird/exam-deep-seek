/**
 * rule-executor.test.js —— 确定性评分规则执行器单元测试（离线，纯函数 + 临时工程）。
 * 覆盖：validateRules 全校验路径（合法/总和 103 分/非法类型/缺字段/空数组/fact 参数校验）、
 * resolveProjectRoot 工程根探测、runRules 八种规则类型成功/失败路径（含 fact 规则）、
 * 得分钳制与 totalScore 约束、syntax_check（tree-sitter 合法/语法错误/vue）、
 * 防穿越、partial 按比例计分、groupSummary 分组汇总。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateRules,
  resolveProjectRoot,
  runRules,
  RULE_TYPES,
} from '../../../src/infrastructure/rule/index.js';

/** 创建临时目录（测试后清理） */
function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rule-exec-test-'));
}

/**
 * 构造合法规则集：客观 30 + 20 = 50，主观 50，合计 = max_score 100。
 * @param {object} [overrides] - 覆盖字段
 * @returns {object}
 */
function makeRules(overrides = {}) {
  return {
    max_score: 100,
    objective_items: [
      { id: 'a1', group: '项目初始化与运行', item: 'package.json 存在', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 30 },
      { id: 'a2', group: '项目初始化与运行', item: '路由包含 createRouter', rule_type: 'contains_text', params: { path: 'src/router/index.js', text: 'createRouter' }, max_score: 20 },
    ],
    subjective_items: [
      { id: 's1', item: '代码可读性', max_score: 50 },
    ],
    ...overrides,
  };
}

/**
 * 构造合法基础工程：package.json + src/router/index.js（含 createRouter）+ public/。
 * 额外建一个顶层目录 public/，避免 fixture 只有单个含源码的子目录（仅 src/），
 * 否则 resolveProjectRoot 会按「单子目录含源码 → 下钻」规则把工程根探测到 src/ 里，
 * 导致规则里的路径（package.json 等）全部解析不到。
 * @param {string} dir - 工程根
 */
function buildBasicProject(dir) {
  fs.mkdirSync(path.join(dir, 'src', 'router'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
  fs.writeFileSync(
    path.join(dir, 'src', 'router', 'index.js'),
    "import { createRouter, createWebHistory } from 'vue-router';\nconst router = createRouter({ history: createWebHistory() });\nexport default router;\n",
  );
}

/**
 * 创建第二个顶层目录（public/）：同 buildBasicProject 的目的 ——
 * 让工程根保持为 fixture 目录本身，不被「单子目录含源码 → 下钻」探测改写。
 * @param {string} dir - 工程根
 */
function addSecondTopDir(dir) {
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
}

describe('validateRules — 规则校验', () => {
  it('合法规则 → { ok: true }', () => {
    expect(validateRules(makeRules())).toEqual({ ok: true });
  });

  it('总和 ≠ max_score（103 分问题）→ 拒绝', () => {
    const rules = {
      max_score: 100,
      objective_items: [{ id: 'a1', item: 'x', rule_type: 'file_exists', params: { path: 'p' }, max_score: 60 }],
      subjective_items: [{ id: 's1', item: 'y', max_score: 43 }], // 60 + 43 = 103
    };
    const v = validateRules(rules);
    expect(v.ok).toBe(false);
    expect(v.error).toContain('总和');
    expect(v.error).toContain('103');
  });

  it('总和 ≠ max_score（客观超总分）→ 拒绝', () => {
    const rules = makeRules({ max_score: 100, objective_items: [{ ...makeRules().objective_items[0], max_score: 90 }] });
    expect(validateRules(rules).ok).toBe(false);
  });

  it('非法 rule_type → 拒绝', () => {
    const rules = makeRules();
    rules.objective_items[0].rule_type = 'run_code';
    const v = validateRules(rules);
    expect(v.ok).toBe(false);
    expect(v.error).toContain('不支持的规则类型');
  });

  it('缺字段 → 拒绝（客观缺 id / params / max_score，主观缺 item）', () => {
    const base = makeRules();
    const r1 = { ...base, objective_items: [{ ...base.objective_items[0], id: undefined }] };
    expect(validateRules(r1)).toEqual({ ok: false, error: '客观项缺少 id' });
    const r2 = { ...base, objective_items: [{ ...base.objective_items[0], params: undefined }] };
    expect(validateRules(r2)).toEqual({ ok: false, error: expect.stringContaining('params') });
    const r3 = { ...base, objective_items: [{ ...base.objective_items[0], max_score: undefined }] };
    expect(validateRules(r3)).toEqual({ ok: false, error: expect.stringContaining('max_score') });
    const r4 = { ...base, subjective_items: [{ id: 's1', item: undefined, max_score: 50 }] };
    expect(validateRules(r4)).toEqual({ ok: false, error: '主观项缺少 item' });
  });

  it('空数组：max_score > 0 但客观/主观为空 → 总和校验拒绝', () => {
    const v = validateRules({ max_score: 100, objective_items: [], subjective_items: [] });
    expect(v.ok).toBe(false);
    expect(v.error).toContain('总和');
  });

  it('缺少 objective_items / subjective_items（非数组）→ 拒绝', () => {
    expect(validateRules({ max_score: 100 })).toEqual({ ok: false, error: 'objective_items 必须是数组' });
    expect(validateRules({ max_score: 100, objective_items: [] })).toEqual({ ok: false, error: 'subjective_items 必须是数组' });
  });

  it('max_score 非正数 → 拒绝', () => {
    for (const m of [0, -5, '100', NaN, null]) {
      expect(validateRules({ max_score: m, objective_items: [], subjective_items: [] }).ok).toBe(false);
    }
  });

  it('RULE_TYPES 白名单完整', () => {
    expect(RULE_TYPES).toEqual([
      'file_exists',
      'dir_contains_file',
      'contains_text',
      'count_regex',
      'contains_regex',
      'file_count_in_dir',
      'syntax_check',
      'fact',
      'ast_pattern',
      'count_imports',
      'normalized_text',
    ]);
  });
});

describe('validateRules — fact 规则参数校验', () => {
  /** 构造单条 fact 客观项的规则集（max_score 10 = 总和） */
  const factItem = (params) => ({
    max_score: 10,
    objective_items: [{ id: 'f1', item: 'x', rule_type: 'fact', params, max_score: 10 }],
    subjective_items: [],
  });

  it('合法 fact 规则 → { ok: true }（数字/字符串/boolean op 全覆盖）', () => {
    for (const params of [
      { fact: 'routes', op: '>=', value: 3 },
      { fact: 'routes', op: '>', value: 1 },
      { fact: 'routes', op: '<=', value: 5 },
      { fact: 'routes', op: '<', value: 5 },
      { fact: 'dependencies', op: 'includes', value: 'vue-router' },
      { fact: 'dependencies', op: 'not_includes', value: 'lodash' },
      { fact: 'hasCreateRouter', op: '==', value: true },
      { fact: 'hasCreateRouter', op: '!=', value: false },
    ]) {
      expect(validateRules(factItem(params))).toEqual({ ok: true });
    }
  });

  it('op 不在白名单 → 拒绝', () => {
    for (const op of ['regex', '===', 'match', '', undefined]) {
      const v = validateRules(factItem({ fact: 'routes', op, value: 3 }));
      expect(v.ok).toBe(false);
      expect(v.error).toContain('op');
    }
  });

  it('缺 params.fact → 拒绝', () => {
    const v = validateRules(factItem({ op: '>=', value: 3 }));
    expect(v.ok).toBe(false);
    expect(v.error).toContain('fact');
  });

  it('value 类型非法（对象/非字符串数组/null/undefined）→ 拒绝', () => {
    for (const value of [{}, [1, 2], null, undefined]) {
      expect(validateRules(factItem({ fact: 'routes', op: '==', value })).ok).toBe(false);
    }
    // 字符串数组合法（includes 多值）
    expect(validateRules(factItem({ fact: 'dependencies', op: 'includes', value: ['vue', 'pinia'] })).ok).toBe(true);
  });

  it('数值比较 op 要求 value 为数字 → 拒绝', () => {
    for (const value of ['3', true, null]) {
      expect(validateRules(factItem({ fact: 'routes', op: '>=', value })).ok).toBe(false);
    }
  });

  it('includes op 要求 value 为字符串或字符串数组 → 拒绝其他', () => {
    for (const value of [3, true]) {
      expect(validateRules(factItem({ fact: 'dependencies', op: 'includes', value })).ok).toBe(false);
    }
  });
});

describe('resolveProjectRoot — 工程根探测', () => {
  it('单子目录含 package.json → 返回子目录', () => {
    const dir = tmpdir();
    try {
      const sub = path.join(dir, 'student-project');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'package.json'), '{}');
      expect(resolveProjectRoot(dir)).toBe(sub);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('单子目录含源码文件（src/main.js）→ 返回子目录', () => {
    const dir = tmpdir();
    try {
      const sub = path.join(dir, 'my-app');
      fs.mkdirSync(path.join(sub, 'src'), { recursive: true });
      fs.writeFileSync(path.join(sub, 'src', 'main.js'), 'export const a = 1;');
      expect(resolveProjectRoot(dir)).toBe(sub);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('多个子目录 → 返回 rootDir', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'a'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'b'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'a', 'index.js'), 'x');
      expect(resolveProjectRoot(dir)).toBe(path.resolve(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('无子目录（只有文件）→ 返回 rootDir', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'README.md'), 'x');
      expect(resolveProjectRoot(dir)).toBe(path.resolve(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('空目录 → 返回 rootDir', () => {
    const dir = tmpdir();
    try {
      expect(resolveProjectRoot(dir)).toBe(path.resolve(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('单子目录无源码（只有 .txt）→ 返回 rootDir', () => {
    const dir = tmpdir();
    try {
      const sub = path.join(dir, 'proj');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'readme.txt'), 'x');
      expect(resolveProjectRoot(dir)).toBe(path.resolve(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('不存在的路径 / 传入文件路径 → 原样返回', () => {
    const dir = tmpdir();
    try {
      const missing = path.join(dir, 'nope');
      expect(resolveProjectRoot(missing)).toBe(missing);
      const f = path.join(dir, 'a.js');
      fs.writeFileSync(f, 'x');
      expect(resolveProjectRoot(f)).toBe(f);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runRules — 返回结构与强制约束', () => {
  it('全部通过：客观分合计、主观项原样返回、pass 全 true、groupSummary 汇总', () => {
    const dir = tmpdir();
    try {
      buildBasicProject(dir);
      const r = runRules(makeRules(), dir);
      expect(r.totalScore).toBe(50);
      expect(r.items).toHaveLength(2);
      expect(r.items[0]).toMatchObject({
        id: 'a1', group: '项目初始化与运行', item: 'package.json 存在', max_score: 30, score: 30, pass: true,
      });
      expect(r.items[0].evidence).toBe('存在 package.json');
      expect(r.items[1].pass).toBe(true);
      expect(r.items[1].evidence).toContain('包含 createRouter');
      expect(r.subjective).toEqual([{ id: 's1', item: '代码可读性', max_score: 50 }]);
      expect(r.groupSummary).toEqual([{ group: '项目初始化与运行', score: 50, maxScore: 50 }]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('部分失败：totalScore 只计通过项得分，pass=false', () => {
    const dir = tmpdir();
    try {
      // 只有 src/router/index.js，缺 package.json（加 public/ 保持工程根为 dir 本身）
      fs.mkdirSync(path.join(dir, 'src', 'router'), { recursive: true });
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'router', 'index.js'), 'createRouter()');
      const r = runRules(makeRules(), dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].pass).toBe(false);
      expect(r.items[0].evidence).toBe('缺少 package.json');
      expect(r.items[1].score).toBe(20);
      expect(r.totalScore).toBe(20);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('得分钳制：命中远超最低次数也只给满分，score 永不超 max_score', () => {
    const dir = tmpdir();
    try {
      // 5 次匹配、min=2、max_score=10：原始比例 10*5/2=25，但上限 10
      fs.writeFileSync(path.join(dir, 'notes.txt'), Array(5).fill('TODO').join('\n'));
      const rules = {
        max_score: 10,
        objective_items: [{ id: 'c1', item: 'TODO 数量', rule_type: 'count_regex', params: { path: 'notes.txt', regex: 'TODO', min: 2 }, max_score: 10 }],
        subjective_items: [],
      };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(10);
      expect(r.totalScore).toBe(10);
      expect(r.items[0].pass).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('totalScore 不超客观项总分、不包含 subjective', () => {
    const dir = tmpdir();
    try {
      buildBasicProject(dir);
      const r = runRules(makeRules(), dir);
      // 客观满分 50，主观 50 不计入：totalScore 不可能超过 50
      expect(r.totalScore).toBeLessThanOrEqual(50);
      expect(r.totalScore).toBe(50);
      expect(r.subjective).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runRules：规则校验不通过 → 抛错拒绝执行', () => {
    const dir = tmpdir();
    try {
      const bad = {
        max_score: 100,
        objective_items: [{ id: 'x', item: 'y', rule_type: 'file_exists', params: { path: 'p' }, max_score: 60 }],
        subjective_items: [{ id: 's', item: 't', max_score: 50 }], // 60 + 50 = 110 ≠ 100
      };
      expect(() => runRules(bad, dir)).toThrow(/规则校验失败/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('确定性：同一规则 + 同一工程 → 两次执行结果一致', () => {
    const dir = tmpdir();
    try {
      buildBasicProject(dir);
      expect(runRules(makeRules(), dir)).toEqual(runRules(makeRules(), dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runRules — 各规则类型成功/失败路径', () => {
  it('file_exists：存在 → 满分；缺少 → 0 分', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      const ok = { max_score: 10, objective_items: [{ id: 'f1', item: '存在', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 10 }], subjective_items: [] };
      expect(runRules(ok, dir).items[0].score).toBe(10);
      const miss = { max_score: 10, objective_items: [{ id: 'f2', item: '缺少', rule_type: 'file_exists', params: { path: 'missing.txt' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(miss, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].evidence).toBe('缺少 missing.txt');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dir_contains_file：递归找到 *.vue → 满分；未找到 → 0 分', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src', 'views'), { recursive: true });
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'App.vue'), '<template></template>');
      fs.writeFileSync(path.join(dir, 'src', 'views', 'Home.vue'), '<template></template>');
      const rules = { max_score: 10, objective_items: [{ id: 'd1', item: 'vue 组件', rule_type: 'dir_contains_file', params: { dir: 'src', pattern: '*.vue' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(10);
      expect(r.items[0].evidence).toContain('App.vue');
      const miss = { max_score: 10, objective_items: [{ id: 'd2', item: '无组件', rule_type: 'dir_contains_file', params: { dir: 'src', pattern: '*.jsx' }, max_score: 10 }], subjective_items: [] };
      const r2 = runRules(miss, dir);
      expect(r2.items[0].score).toBe(0);
      expect(r2.items[0].evidence).toContain('未找到匹配文件');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('contains_text：包含 → 满分；未包含 → 0 分；文件不存在 → 0 分', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'data.txt'), 'hello world');
      const hit = { max_score: 10, objective_items: [{ id: 't1', item: '含 hello', rule_type: 'contains_text', params: { path: 'data.txt', text: 'hello' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(hit, dir);
      expect(r.items[0].score).toBe(10);
      expect(r.items[0].evidence).toBe('包含 hello');
      const miss = { max_score: 10, objective_items: [{ id: 't2', item: '无 bye', rule_type: 'contains_text', params: { path: 'data.txt', text: 'bye' }, max_score: 10 }], subjective_items: [] };
      expect(runRules(miss, dir).items[0].score).toBe(0);
      const missing = { max_score: 10, objective_items: [{ id: 't3', item: '读不存在', rule_type: 'contains_text', params: { path: 'nope.txt', text: 'x' }, max_score: 10 }], subjective_items: [] };
      const r3 = runRules(missing, dir);
      expect(r3.items[0].score).toBe(0);
      expect(r3.items[0].evidence).toContain('无法读取');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('contains_regex：匹配 → 满分；不匹配 / 正则非法 → 0 分', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'log.txt'), 'error at line 3');
      const hit = { max_score: 10, objective_items: [{ id: 'r1', item: '匹配', rule_type: 'contains_regex', params: { path: 'log.txt', regex: 'error\\s+at' }, max_score: 10 }], subjective_items: [] };
      expect(runRules(hit, dir).items[0].score).toBe(10);
      const miss = { max_score: 10, objective_items: [{ id: 'r2', item: '不匹配', rule_type: 'contains_regex', params: { path: 'log.txt', regex: 'fatal' }, max_score: 10 }], subjective_items: [] };
      const r2 = runRules(miss, dir);
      expect(r2.items[0].score).toBe(0);
      expect(r2.items[0].evidence).toContain('未匹配');
      const badRe = { max_score: 10, objective_items: [{ id: 'r3', item: '非法正则', rule_type: 'contains_regex', params: { path: 'log.txt', regex: '(' }, max_score: 10 }], subjective_items: [] };
      expect(runRules(badRe, dir).items[0].score).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('count_regex：≥ min → 满分；< min 非 partial → 0 分', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'TODO 1\nTODO 2\nTODO 3\n');
      const hit = { max_score: 10, objective_items: [{ id: 'c1', item: '足量', rule_type: 'count_regex', params: { path: 'notes.txt', regex: 'TODO', min: 2 }, max_score: 10 }], subjective_items: [] };
      const r = runRules(hit, dir);
      expect(r.items[0].score).toBe(10);
      expect(r.items[0].evidence).toBe('匹配 3 次（需 ≥2）');
      const miss = { max_score: 10, objective_items: [{ id: 'c2', item: '不足', rule_type: 'count_regex', params: { path: 'notes.txt', regex: 'TODO', min: 4 }, max_score: 10 }], subjective_items: [] };
      const r2 = runRules(miss, dir);
      expect(r2.items[0].score).toBe(0);
      expect(r2.items[0].evidence).toBe('匹配 3 次（需 ≥4）');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('count_regex：partial 按比例计分（Math.round(max * count / min)）', () => {
    const dir = tmpdir();
    try {
      // 2 次匹配、min=4、max=10 → round(10*2/4)=5
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'TODO 1\nTODO 2\n');
      const rules = {
        max_score: 10,
        objective_items: [{ id: 'p1', item: '部分命中', rule_type: 'count_regex', params: { path: 'notes.txt', regex: 'TODO', min: 4, partial: true }, max_score: 10 }],
        subjective_items: [],
      };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(5);
      expect(r.items[0].evidence).toBe('匹配 2 次（需 ≥4）');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('file_count_in_dir：≥ min → 满分；< min 非 partial → 0 分；partial 按比例', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'x');
      fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'y');
      const hit = { max_score: 10, objective_items: [{ id: 'n1', item: '足量', rule_type: 'file_count_in_dir', params: { dir: 'src', pattern: '*.js', min: 2 }, max_score: 10 }], subjective_items: [] };
      expect(runRules(hit, dir).items[0].score).toBe(10);
      const miss = { max_score: 10, objective_items: [{ id: 'n2', item: '不足', rule_type: 'file_count_in_dir', params: { dir: 'src', pattern: '*.js', min: 3 }, max_score: 10 }], subjective_items: [] };
      expect(runRules(miss, dir).items[0].score).toBe(0);
      const partial = { max_score: 10, objective_items: [{ id: 'n3', item: '部分', rule_type: 'file_count_in_dir', params: { dir: 'src', pattern: '*.js', min: 4, partial: true }, max_score: 10 }], subjective_items: [] };
      const r3 = runRules(partial, dir);
      expect(r3.items[0].score).toBe(5);
      expect(r3.items[0].evidence).toBe('匹配文件 2 个（需 ≥4）');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runRules — syntax_check（tree-sitter）', () => {
  it('全部文件语法合法 → 满分', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'const ok = 1;\n');
      fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'function f() { return 1; }\n');
      const rules = { max_score: 10, objective_items: [{ id: 's1', item: '语法', rule_type: 'syntax_check', params: { dir: 'src', pattern: '*.js' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(10);
      expect(r.items[0].evidence).toContain('语法检查通过（2 个文件）');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('含语法错误文件 → 0 分，evidence 含失败文件路径与错误摘要', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'good.js'), 'const ok = 1;\n');
      fs.writeFileSync(path.join(dir, 'src', 'broken.js'), 'const a = ;\n');
      const rules = { max_score: 10, objective_items: [{ id: 's2', item: '语法', rule_type: 'syntax_check', params: { dir: 'src', pattern: '*.js' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].pass).toBe(false);
      expect(r.items[0].evidence).toContain('src/broken.js');
      expect(r.items[0].evidence).toContain('第 1 行');
      expect(r.items[0].evidence).toContain('语法错误');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('.mjs 文件同样被检查（合法通过）', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'util.mjs'), 'export const u = 1;\n');
      const rules = { max_score: 10, objective_items: [{ id: 's3', item: 'mjs', rule_type: 'syntax_check', params: { dir: 'src', pattern: '*.mjs' }, max_score: 10 }], subjective_items: [] };
      expect(runRules(rules, dir).items[0].score).toBe(10);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('.ts 文件同样被检查（tree-sitter-javascript 解析，合法通过）', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'util.ts'), 'export const u = 1;\n');
      const rules = { max_score: 10, objective_items: [{ id: 's7', item: 'ts', rule_type: 'syntax_check', params: { dir: 'src', pattern: '*.ts' }, max_score: 10 }], subjective_items: [] };
      expect(runRules(rules, dir).items[0].score).toBe(10);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('vue：提取 <script> 检查，合法 → 满分', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'App.vue'), [
        '<template><div>hi</div></template>',
        '<script setup>',
        "import { ref } from 'vue';",
        "const msg = ref('hi');",
        '</script>',
      ].join('\n'));
      const rules = { max_score: 10, objective_items: [{ id: 's4', item: 'vue 语法', rule_type: 'syntax_check', params: { dir: 'src', pattern: '*.vue' }, max_score: 10 }], subjective_items: [] };
      expect(runRules(rules, dir).items[0].score).toBe(10);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('vue：<script> 语法错误 → 0 分，evidence 含文件路径', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      addSecondTopDir(dir);
      fs.writeFileSync(path.join(dir, 'src', 'App.vue'), [
        '<template></template>',
        '<script setup>',
        'const a = ;',
        '</script>',
      ].join('\n'));
      const rules = { max_score: 10, objective_items: [{ id: 's5', item: 'vue 语法', rule_type: 'syntax_check', params: { dir: 'src', pattern: '*.vue' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].evidence).toContain('src/App.vue');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('目录下无可检查文件 → 0 分', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      addSecondTopDir(dir);
      const rules = { max_score: 10, objective_items: [{ id: 's6', item: '空目录', rule_type: 'syntax_check', params: { dir: 'src', pattern: '*.js' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].evidence).toContain('未找到可检查的源码文件');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runRules — fact 规则（基于工程事实 JSON 判断）', () => {
  /**
   * 构造带路由的工程：src/router/index.js（routeCount 条内联路由）+ package.json。
   * 路由数组以 createRouter({ routes: [...] }) 内联数组形态书写 —— factExtractor
   * 按 tree-sitter 静态计数该数组元素；「createRouter({ routes }) 变量引用」简写无法
   * 静态解析数组长度（factExtractor 已知限制），不在此处使用。
   * 额外建 public/ 顶层目录，避免工程根被「单子目录含源码 → 下钻」探测改写。
   * @param {string} dir - 工程根
   * @param {number} routeCount - 路由条数
   * @param {object} [pkgDeps] - package.json dependencies
   */
  function buildRouterProject(dir, routeCount, pkgDeps = { vue: '^3.4.0', 'vue-router': '^4.3.0' }) {
    fs.mkdirSync(path.join(dir, 'src', 'router'), { recursive: true });
    addSecondTopDir(dir);
    const routeObjs = [];
    for (let i = 0; i < routeCount; i++) {
      routeObjs.push("{ path: '/page" + i + "', component: () => import('../views/Page" + i + ".vue') }");
    }
    const content = [
      "import { createRouter, createWebHistory } from 'vue-router';",
      'const router = createRouter({',
      '  history: createWebHistory(),',
      '  routes: [',
      routeObjs.join(',\n'),
      '  ],',
      '});',
      'export default router;',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'src', 'router', 'index.js'), content);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0', dependencies: pkgDeps }));
  }

  it('数字比较：routes >= 3 满足 → 满分，evidence 显示实际值', () => {
    const dir = tmpdir();
    try {
      buildRouterProject(dir, 3);
      const rules = { max_score: 10, objective_items: [{ id: 'fr1', item: '路由数量', rule_type: 'fact', params: { fact: 'routes', op: '>=', value: 3 }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(10);
      expect(r.items[0].pass).toBe(true);
      expect(r.items[0].evidence).toBe('路由数量 3 >= 3');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('数字比较：routes >= 3 不满足 → 0 分，evidence 显示真实关系（2 < 3）', () => {
    const dir = tmpdir();
    try {
      buildRouterProject(dir, 2);
      const rules = { max_score: 10, objective_items: [{ id: 'fr2', item: '路由数量', rule_type: 'fact', params: { fact: 'routes', op: '>=', value: 3 }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].pass).toBe(false);
      expect(r.items[0].evidence).toBe('路由数量 2 < 3');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes：dependencies 包含 vue-router → 满分', () => {
    const dir = tmpdir();
    try {
      buildRouterProject(dir, 1);
      const rules = { max_score: 10, objective_items: [{ id: 'fr3', item: '依赖', rule_type: 'fact', params: { fact: 'dependencies', op: 'includes', value: 'vue-router' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(10);
      expect(r.items[0].evidence).toBe('依赖包含 vue-router');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes：不包含 → 0 分，evidence 未包含', () => {
    const dir = tmpdir();
    try {
      buildRouterProject(dir, 1, { vue: '^3.4.0' }); // 无 vue-router 依赖
      const rules = { max_score: 10, objective_items: [{ id: 'fr4', item: '依赖', rule_type: 'fact', params: { fact: 'dependencies', op: 'includes', value: 'vue-router' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].evidence).toBe('依赖未包含 vue-router');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('not_includes：未包含 → 满分', () => {
    const dir = tmpdir();
    try {
      buildRouterProject(dir, 1, { vue: '^3.4.0' });
      const rules = { max_score: 10, objective_items: [{ id: 'fr5', item: '无依赖', rule_type: 'fact', params: { fact: 'dependencies', op: 'not_includes', value: 'vue-router' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(10);
      expect(r.items[0].evidence).toBe('依赖未包含 vue-router');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('boolean：hasCreateRouter == true 满足 → 满分；不满足 → 0 分', () => {
    const dir = tmpdir();
    try {
      buildRouterProject(dir, 1); // router 文件含 createRouter
      const okRules = { max_score: 10, objective_items: [{ id: 'fr6', item: 'createRouter', rule_type: 'fact', params: { fact: 'hasCreateRouter', op: '==', value: true }, max_score: 10 }], subjective_items: [] };
      const r1 = runRules(okRules, dir);
      expect(r1.items[0].score).toBe(10);
      expect(r1.items[0].pass).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    const dir2 = tmpdir();
    try {
      fs.mkdirSync(path.join(dir2, 'src'), { recursive: true });
      addSecondTopDir(dir2);
      fs.writeFileSync(path.join(dir2, 'src', 'router.js'), 'export default [];\n'); // 无 createRouter
      const noRules = { max_score: 10, objective_items: [{ id: 'fr7', item: 'createRouter', rule_type: 'fact', params: { fact: 'hasCreateRouter', op: '==', value: true }, max_score: 10 }], subjective_items: [] };
      const r2 = runRules(noRules, dir2);
      expect(r2.items[0].score).toBe(0);
      expect(r2.items[0].evidence).toContain('createRouter 使用');
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('fact 字段不存在 → 0 分，evidence 指明字段', () => {
    const dir = tmpdir();
    try {
      buildRouterProject(dir, 1);
      const rules = { max_score: 10, objective_items: [{ id: 'fr8', item: '不存在字段', rule_type: 'fact', params: { fact: 'no_such_field', op: '==', value: 1 }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].evidence).toBe('事实字段不存在：no_such_field');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fact 规则与其他规则混用（file_exists / contains_text）→ 各自计分、totalScore 正确', () => {
    const dir = tmpdir();
    try {
      buildRouterProject(dir, 3);
      fs.writeFileSync(path.join(dir, 'src', 'App.vue'), '<template></template>');
      const rules = {
        max_score: 100,
        objective_items: [
          { id: 'm1', item: 'package.json 存在', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 30 },
          { id: 'm2', item: '路由 ≥3', rule_type: 'fact', params: { fact: 'routes', op: '>=', value: 3 }, max_score: 30 },
          { id: 'm3', item: 'App.vue 含模板', rule_type: 'contains_text', params: { path: 'src/App.vue', text: '<template>' }, max_score: 40 },
        ],
        subjective_items: [],
      };
      const r = runRules(rules, dir);
      expect(r.totalScore).toBe(100);
      expect(r.items.map((i) => i.pass)).toEqual([true, true, true]);
      expect(r.items[1].evidence).toBe('路由数量 3 >= 3');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runRules — 防穿越', () => {
  it('params.path = ../secret → 0 分（越界拦截）', () => {
    const dir = tmpdir();
    const secret = path.join(dir, '..', 'secret-' + path.basename(dir) + '.txt');
    try {
      fs.writeFileSync(secret, 'TOP SECRET');
      const rules = { max_score: 10, objective_items: [{ id: 'x1', item: '不可越界', rule_type: 'file_exists', params: { path: '../' + path.basename(secret) }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].evidence).toContain('越界');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(secret, { force: true });
    }
  });

  it('params.path = 绝对路径（/etc/hosts）→ 0 分', () => {
    const dir = tmpdir();
    try {
      const rules = { max_score: 10, objective_items: [{ id: 'x2', item: '绝对路径', rule_type: 'file_exists', params: { path: '/etc/hosts' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].evidence).toContain('越界');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('params.dir = ../outside → dir_contains_file 越界 → 0 分', () => {
    const dir = tmpdir();
    try {
      const rules = { max_score: 10, objective_items: [{ id: 'x3', item: '目录越界', rule_type: 'dir_contains_file', params: { dir: '..', pattern: '*.js' }, max_score: 10 }], subjective_items: [] };
      const r = runRules(rules, dir);
      expect(r.items[0].score).toBe(0);
      expect(r.items[0].evidence).toContain('越界');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runRules — 工程根探测集成与 groupSummary', () => {
  it('解压根只有一个工程子目录 → 规则路径相对工程子目录解析', () => {
    const dir = tmpdir();
    try {
      const sub = path.join(dir, 'my-app');
      buildBasicProject(sub);
      const r = runRules(makeRules(), dir);
      expect(r.totalScore).toBe(50);
      expect(r.items[0].pass).toBe(true);
      expect(r.items[0].evidence).toBe('存在 package.json');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('groupSummary：无 group 归入「其他」，按 group 汇总', () => {
    const dir = tmpdir();
    try {
      buildBasicProject(dir);
      fs.writeFileSync(path.join(dir, 'src', 'App.vue'), '<template></template>');
      const rules = {
        max_score: 100,
        objective_items: [
          { id: 'a1', group: '运行', item: 'package.json 存在', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 30 },
          { id: 'a2', item: '路由包含 createRouter', rule_type: 'contains_text', params: { path: 'src/router/index.js', text: 'createRouter' }, max_score: 20 },
          { id: 'a3', item: 'App.vue 存在', rule_type: 'file_exists', params: { path: 'src/App.vue' }, max_score: 50 },
        ],
        subjective_items: [],
      };
      const r = runRules(rules, dir);
      expect(r.groupSummary).toEqual([
        { group: '运行', score: 30, maxScore: 30 },
        { group: '其他', score: 70, maxScore: 70 },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('groupSummary：失败项计入得分 0，maxScore 保留', () => {
    const dir = tmpdir();
    try {
      buildBasicProject(dir); // 无 App.vue
      const rules = {
        max_score: 100,
        objective_items: [
          { id: 'a1', group: '运行', item: 'package.json 存在', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 30 },
          { id: 'a2', item: 'App.vue 存在', rule_type: 'file_exists', params: { path: 'src/App.vue' }, max_score: 70 },
        ],
        subjective_items: [],
      };
      const r = runRules(rules, dir);
      expect(r.groupSummary).toEqual([
        { group: '运行', score: 30, maxScore: 30 },
        { group: '其他', score: 0, maxScore: 70 },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('工程根不存在 → 客观项全部 0 分，不抛错', () => {
    const rules = { max_score: 10, objective_items: [{ id: 'e1', item: '不存在', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 10 }], subjective_items: [] };
    const r = runRules(rules, path.join(os.tmpdir(), 'no-such-rule-exec-dir-xyz'));
    expect(r.items[0].score).toBe(0);
    expect(r.totalScore).toBe(0);
  });
});

describe('P0-2 语义级规则（ast_pattern / count_imports / normalized_text）', () => {
  /** 构造含格式差异的 Java 文件（混乱空格/换行/缩进） */
  function buildMessyJava(dir) {
    fs.writeFileSync(path.join(dir, 'UserController.java'), [
      'package  com.example.demo ;',
      '',
      'import   org.springframework.web.bind.annotation.*;',
      'import lombok.RequiredArgsConstructor;',
      '',
      '@RestController',
      'public class   UserController {',
      '   public   String   listUsers( ) {',
      '       return "ok" ;',
      '   }',
      '}',
    ].join('\n'));
  }

  it('ast_pattern：Java 类与方法存在（无视混乱格式）→ 满分；不存在 → 0 分', () => {
    const dir = tmpdir();
    try {
      buildMessyJava(dir);
      const ok = runRules({
        max_score: 20,
        objective_items: [
          { id: 'a1', item: '存在类', rule_type: 'ast_pattern', params: { path: 'UserController.java', pattern: 'class_declaration' }, max_score: 10 },
          { id: 'a2', item: '类内有方法', rule_type: 'ast_pattern', params: { path: 'UserController.java', pattern: 'class_declaration > method_declaration' }, max_score: 10 },
        ],
        subjective_items: [],
      }, dir);
      expect(ok.totalScore).toBe(20);
      // 反例：Java 文件用 Python 节点类型 → 失分
      const no = runRules({
        max_score: 5,
        objective_items: [{ id: 'a1', item: 'x', rule_type: 'ast_pattern', params: { path: 'UserController.java', pattern: 'class_definition' }, max_score: 5 }],
        subjective_items: [],
      }, dir);
      expect(no.totalScore).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('count_imports：统计 import 行（跨语言，无视引号风格）；不存在 → 0 分', () => {
    const dir = tmpdir();
    try {
      buildMessyJava(dir);
      const ok = runRules({
        max_score: 10,
        objective_items: [
          { id: 'a1', item: 'lombok import', rule_type: 'count_imports', params: { path: 'UserController.java', module: 'lombok', min: 1 }, max_score: 5 },
          { id: 'a2', item: 'spring import', rule_type: 'count_imports', params: { path: 'UserController.java', module: 'org.springframework', min: 1 }, max_score: 5 },
        ],
        subjective_items: [],
      }, dir);
      expect(ok.totalScore).toBe(10);
      const no = runRules({
        max_score: 5,
        objective_items: [{ id: 'a1', item: 'django', rule_type: 'count_imports', params: { path: 'UserController.java', module: 'django', min: 1 }, max_score: 5 }],
        subjective_items: [],
      }, dir);
      expect(no.totalScore).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalized_text：归一化后包含（无视空白差异）→ 满分；缺失 → 0 分', () => {
    const dir = tmpdir();
    try {
      buildMessyJava(dir);
      const ok = runRules({
        max_score: 5,
        objective_items: [{ id: 'a1', item: '包声明', rule_type: 'normalized_text', params: { path: 'UserController.java', text: 'package com.example.demo;' }, max_score: 5 }],
        subjective_items: [],
      }, dir);
      expect(ok.totalScore).toBe(5);
      const no = runRules({
        max_score: 5,
        objective_items: [{ id: 'a1', item: '无此包', rule_type: 'normalized_text', params: { path: 'UserController.java', text: 'package com.other;' }, max_score: 5 }],
        subjective_items: [],
      }, dir);
      expect(no.totalScore).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validateRules：三种新规则类型通过校验；未知类型拒绝', () => {
    const ok = validateRules({
      max_score: 15,
      objective_items: [
        { id: 'a1', item: 'a', rule_type: 'ast_pattern', params: { path: 'x.java', pattern: 'class_declaration' }, max_score: 5 },
        { id: 'a2', item: 'b', rule_type: 'count_imports', params: { path: 'x.py', module: 'flask', min: 1 }, max_score: 5 },
        { id: 'a3', item: 'c', rule_type: 'normalized_text', params: { path: 'x.txt', text: 'abc' }, max_score: 5 },
      ],
      subjective_items: [],
    });
    expect(ok.ok).toBe(true);
  });
});
