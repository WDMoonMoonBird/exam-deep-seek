/**
 * rule-mutator.test.js —— 规则负例验证（ruleMutator）单元测试（离线，临时工程，无 LLM）。
 *
 * 覆盖：
 *  - mutateVariant 逐规则类型：断言「标准包上满分（前置）→ 变体上目标规则 score===0」；
 *  - validateNegativeTests：正常规则不误报 weak；过拟合规则（干扰串占位符冲突，变体仍含
 *    目标文本）必报 weak；无变异映射的 fact 规则跳过并记录原因；onlyIds 过滤；变体目录清理。
 *
 * 注意（playbook 三段式）：本套件 import ruleMutator → ruleExecutor/factExtractor（tree-sitter），
 * 必须与 fact-extractor/rule-executor 套件分开进程跑（套件 3，独立 jest 进程）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mutateVariant, validateNegativeTests } from '../../../src/services/ruleMutator.js';
import { runRules } from '../../../src/services/ruleExecutor.js';

/** 创建临时目录（测试后清理） */
function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rule-mutator-test-'));
}

/**
 * 标准包 fixture（多个顶层目录 src/ + public/，防止 resolveProjectRoot「单子目录含源码 → 下钻」）：
 *   package.json（vue/vue-router/pinia 依赖）
 *   src/main.js（createRouter + createPinia + app.use）
 *   src/router/index.js（createRouter）
 *   src/stores/user.js（defineStore）
 *   src/components/App.vue（含标记 'MUTATED' —— 过拟合 weak 用例用）
 *   src/views/Home.vue
 *   public/index.html
 * @param {string} dir - 工程根
 */
function buildStandardProject(dir) {
  fs.mkdirSync(path.join(dir, 'src', 'router'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'stores'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'components'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'views'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'demo-app',
    version: '1.0.0',
    dependencies: { vue: '^3.4.0', 'vue-router': '^4.3.0', pinia: '^2.1.0' },
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'src', 'main.js'), [
    "import { createApp } from 'vue';",
    "import { createRouter, createWebHistory } from 'vue-router';",
    "import { createPinia } from 'pinia';",
    'const router = createRouter({ history: createWebHistory() });',
    'const pinia = createPinia();',
    'const app = createApp({});',
    'app.use(router);',
    'app.use(pinia);',
    "app.mount('#app');",
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'src', 'router', 'index.js'),
    "import { createRouter } from 'vue-router';\nexport const router = createRouter({});\n");
  fs.writeFileSync(path.join(dir, 'src', 'stores', 'user.js'),
    "import { defineStore } from 'pinia';\nexport const useUserStore = defineStore('user', {});\n");
  fs.writeFileSync(path.join(dir, 'src', 'components', 'App.vue'),
    "<template><div>hello</div></template>\n<script setup>\nimport { useUserStore } from '../stores/user';\nconst flag = 'MUTATED';\n</script>\n");
  fs.writeFileSync(path.join(dir, 'src', 'views', 'Home.vue'),
    "<template><p>home</p></template>\n<script>\nexport default { name: 'Home' };\n</script>\n");
  fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<!DOCTYPE html><html><body></body></html>\n');
}

/**
 * 覆盖全部 8 种 rule_type 的合法规则集（客观 11 项 × 5 = 55 + 主观 45 = max_score 100）。
 * @returns {object}
 */
function allRules() {
  return {
    max_score: 100,
    objective_items: [
      { id: 'fe', item: '存在 package.json', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 5 },
      { id: 'dcf', item: 'components 下存在 Vue 组件', rule_type: 'dir_contains_file', params: { dir: 'src/components', pattern: '*.vue' }, max_score: 5 },
      { id: 'ct', item: 'main.js 使用 createRouter', rule_type: 'contains_text', params: { path: 'src/main.js', text: 'createRouter' }, max_score: 5 },
      { id: 'cr', item: 'main.js 至少 2 次 .use(', rule_type: 'count_regex', params: { path: 'src/main.js', regex: '\\.use\\(' , min: 2 }, max_score: 5 },
      { id: 'creg', item: 'main.js 调用 createRouter(', rule_type: 'contains_regex', params: { path: 'src/main.js', regex: 'createRouter\\(' }, max_score: 5 },
      { id: 'fc', item: 'src 下至少 2 个 Vue 文件', rule_type: 'file_count_in_dir', params: { dir: 'src', pattern: '*.vue', min: 2 }, max_score: 5 },
      { id: 'sc', item: 'src 下 Vue 文件语法正确', rule_type: 'syntax_check', params: { dir: 'src', pattern: '*.vue' }, max_score: 5 },
      { id: 'fvr', item: '使用 vue-router', rule_type: 'fact', params: { fact: 'hasVueRouter', op: '==', value: true }, max_score: 5 },
      { id: 'fpi', item: '使用 pinia', rule_type: 'fact', params: { fact: 'hasPinia', op: '==', value: true }, max_score: 5 },
      { id: 'fcr', item: '调用 createRouter', rule_type: 'fact', params: { fact: 'hasCreateRouter', op: '==', value: true }, max_score: 5 },
      { id: 'fdep', item: '依赖包含 vue', rule_type: 'fact', params: { fact: 'dependencies', op: 'includes', value: 'vue' }, max_score: 5 },
    ],
    subjective_items: [
      { id: 's1', item: '代码可读性', max_score: 45 },
    ],
  };
}

describe('mutateVariant — 逐规则类型：标准包满分 → 变体上目标规则必失分', () => {
  const projectRoot = tmpdir();
  beforeAll(() => {
    buildStandardProject(projectRoot);
  });
  afterAll(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });
  const rules = allRules();
  // 前置断言：全部 11 条规则在标准包上满分（正例前提）
  it('前置：标准包上全部规则满分（应得满分先验证）', () => {
    const base = runRules(rules, projectRoot);
    for (const it of base.items) {
      expect(it.score).toBe(it.max_score);
    }
  });

  const cases = [
    ['fe', 'file_exists'],
    ['dcf', 'dir_contains_file'],
    ['ct', 'contains_text'],
    ['cr', 'count_regex'],
    ['creg', 'contains_regex'],
    ['fc', 'file_count_in_dir'],
    ['sc', 'syntax_check'],
    ['fvr', 'fact(hasVueRouter)'],
    ['fpi', 'fact(hasPinia)'],
    ['fcr', 'fact(hasCreateRouter)'],
    ['fdep', 'fact(dependencies)'],
  ];

  it.each(cases)('规则 %s（%s）：变异后目标规则 score===0', (ruleId) => {
    const variantDir = tmpdir();
    try {
      const mv = mutateVariant(rules, ruleId, projectRoot, variantDir);
      expect(mv).toBeDefined();
      expect(mv.ok).toBe(true);
      const res = runRules(rules, variantDir);
      const target = res.items.find((it) => it.id === ruleId);
      expect(target).toBeDefined();
      expect(target.score).toBe(0);
    } finally {
      fs.rmSync(variantDir, { recursive: true, force: true });
    }
  });

  it('规则不存在 → ok=false', () => {
    const variantDir = tmpdir();
    try {
      const mv = mutateVariant(rules, 'nope', projectRoot, variantDir);
      expect(mv.ok).toBe(false);
      expect(mv.reason).toContain('规则不存在');
    } finally {
      fs.rmSync(variantDir, { recursive: true, force: true });
    }
  });
});

describe('validateNegativeTests — 正常规则不误报、过拟合规则必报 weak', () => {
  const projectRoot = tmpdir();
  beforeAll(() => {
    buildStandardProject(projectRoot);
  });
  afterAll(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('全部正常规则（8 类 + fact 映射）→ 全部覆盖，weakRules 为空、无跳过', async () => {
    const neg = await validateNegativeTests(allRules(), projectRoot, { concurrency: 4 });
    expect(neg.weakRules).toEqual([]);
    expect(neg.skipped).toEqual([]);
    expect(neg.covered).toBe(11);
    expect(neg.variantsRun).toBe(11);
  });

  it('过拟合规则（干扰串占位符冲突，变体仍含目标文本）→ 必报 weak；正常规则不误报', async () => {
    // 'MUTATED' 是变异占位符 '__RULE_MUTATED__' 的子串：替换后文本仍残留 → 规则仍通过 → weak。
    const rules = {
      max_score: 100,
      objective_items: [
        { id: 'overfit', item: 'App.vue 含标记 MUTATED', rule_type: 'contains_text', params: { path: 'src/components/App.vue', text: 'MUTATED' }, max_score: 20 },
        { id: 'ok1', item: '存在 package.json', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 20 },
        { id: 'ok2', item: '依赖包含 vue', rule_type: 'fact', params: { fact: 'dependencies', op: 'includes', value: 'vue' }, max_score: 20 },
      ],
      subjective_items: [{ id: 's1', item: '主观项', max_score: 40 }],
    };
    const neg = await validateNegativeTests(rules, projectRoot, { concurrency: 2 });
    const weakIds = neg.weakRules.map((w) => w.id);
    expect(weakIds).toContain('overfit');
    expect(neg.weakRules[0]).toMatchObject({ id: 'overfit', item: expect.any(String) });
    expect(neg.weakRules[0].reason).toContain('缺陷变体上规则仍得');
    expect(weakIds).not.toContain('ok1');
    expect(weakIds).not.toContain('ok2');
    expect(neg.covered).toBe(2);
  });

  it('无变异映射的 fact 规则（vueFiles）→ 跳过并记录原因；已映射规则不受影响', async () => {
    const rules = {
      max_score: 100,
      objective_items: [
        { id: 'nomap', item: '至少 2 个 Vue 文件', rule_type: 'fact', params: { fact: 'vueFiles', op: '>=', value: 2 }, max_score: 30 },
        { id: 'ok1', item: '存在 package.json', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 30 },
      ],
      subjective_items: [{ id: 's1', item: '主观项', max_score: 40 }],
    };
    const neg = await validateNegativeTests(rules, projectRoot);
    const nomap = neg.skipped.find((s) => s.id === 'nomap');
    expect(nomap).toBeDefined();
    expect(nomap.reason).toContain('fact 无变异映射');
    expect(neg.covered).toBe(1);
    expect(neg.weakRules).toEqual([]);
  });

  it('onlyIds 只验证指定规则', async () => {
    const neg = await validateNegativeTests(allRules(), projectRoot, { onlyIds: ['fe', 'ct'] });
    expect(neg.covered).toBe(2);
    expect(neg.variantsRun).toBe(2);
  });

  it('变体临时目录全部清理（不残留 rule-mutator-variant-*）', async () => {
    const listVariants = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('rule-mutator-variant-'));
    const before = listVariants();
    await validateNegativeTests(allRules(), projectRoot, { concurrency: 4 });
    const after = listVariants();
    expect(after).toEqual(before);
  });
});
