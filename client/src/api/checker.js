import request from './request.js';

/**
 * 评分脚本（规则）API 封装 —— §十一 界面改造方案 11.6
 * 后端未就绪时全部接口走 mock（原型交互用），mock=false 时走真实接口。
 */

// ---------------- 规则类型中文标签（RuleSummaryCard / 体检报告共用） ----------------
export const RULE_TYPE_LABELS = {
  file_exists: '文件存在',
  dir_contains_file: '目录包含文件',
  contains_text: '文本包含',
  count_regex: '正则计数',
  contains_regex: '正则匹配',
  file_count_in_dir: '目录文件数',
  syntax_check: '语法检查',
  fact: '工程事实',
  count_range: '区间计数',
};

export const SHOW_MESSAGE_LABELS = {
  always: '始终显示',
  on_failure: '失败时显示',
  never: '隐藏',
};

// ---------------- 真实 API（后端就绪后启用） ----------------

/** 获取规则状态（none|generating|calibrating|review|ready|failed） */
export function getCheckerStatus(questionId) {
  return request.get('/teacher/questions/' + questionId + '/checker');
}

/** 触发生成 + 校准（可选题型模板） */
export function generateChecker(questionId, data) {
  return request.post('/teacher/questions/' + questionId + '/checker/generate', data);
}

/** 题型模板列表 */
export function getTemplates() {
  return request.get('/teacher/questions/checker/templates');
}

/** 教师确认（confirm | regenerate | to_subjective | exempt | accept） */
export function confirmChecker(questionId, data) {
  return request.post('/teacher/questions/' + questionId + '/checker/confirm', data);
}

/** 回滚到历史版本 */
export function rollbackChecker(questionId, ruleVersionId) {
  return request.post('/teacher/questions/' + questionId + '/checker/rollback', { ruleVersionId });
}

/** 标准包体检报告 */
export function getHealthReport(questionId) {
  return request.get('/teacher/questions/' + questionId + '/checker/report');
}

/** 规则版本历史 */
export function getRuleVersions(questionId) {
  return request.get('/teacher/questions/' + questionId + '/checker/versions');
}

/** 规则质量聚合（新页面） */
export function getRuleQuality(params = {}) {
  return request.get('/teacher/rule-quality', { params });
}

// ---------------- Mock 数据工厂（原型交互，数据对齐题目 353 实测） ----------------

const TEMPLATES = [
  { code: 'vue-frontend-crud', name: 'Vue 前端 CRUD', lang: 'Vue/JS', desc: '路由跳转 / 登录注册 / Pinia / 列表页 / 代码规范', groups: 9 },
  { code: 'java-backend-api', name: 'Java 后端 API', lang: 'Java', desc: '接口路由 / 参数校验 / 异常兜底 / 数据层', groups: 8 },
  { code: 'python-algorithm', name: 'Python 算法题', lang: 'Python', desc: '函数定义 / 边界处理 / 复杂度 / 注释', groups: 5 },
];

const GROUPS = [
  { group: '项目初始化与运行', points: 9, count: 9 },
  { group: '路由与跳转', points: 9, count: 9 },
  { group: '登录', points: 18, count: 18 },
  { group: '注册', points: 18, count: 18 },
  { group: 'Pinia', points: 9, count: 9 },
  { group: '主页布局', points: 14, count: 14 },
  { group: '个人信息', points: 5, count: 5 },
  { group: '用户列表', points: 9, count: 9 },
  { group: '代码规范', points: 9, count: 9 },
];

const RULE_CYCLE = ['file_exists', 'contains_text', 'count_regex', 'contains_regex', 'fact', 'syntax_check'];

/** 生成 69 条客观规则 + 3 条主观项的 mock 规则（结构对齐 Schema v2） */
export function mockRules() {
  const items = [];
  let seq = 0;
  for (const g of GROUPS) {
    const per = Math.max(1, Math.round(g.points / g.count));
    for (let i = 0; i < g.count; i++) {
      seq += 1;
      const ruleType = RULE_CYCLE[seq % RULE_CYCLE.length];
      items.push({
        id: 'a' + seq,
        group: g.group,
        rule_type: ruleType,
        params: mockParams(ruleType),
        score: per,
        max_score: per,
        hidden: seq % 9 === 0,
        show_message: 'on_failure',
        evidence_template: mockEvidence(ruleType, seq),
      });
    }
  }
  return {
    schema_version: 2,
    max_score: 100,
    objective_items: items,
    subjective_items: [
      { id: 's1', item: '接口失败兜底处理', max_score: 2, reason: '标准包缺陷豁免自动转主观' },
      { id: 's2', item: '代码可维护性', max_score: 1, reason: '无法确定性检查' },
    ],
  };
}

function mockParams(ruleType) {
  switch (ruleType) {
    case 'file_exists': return { path: 'src/views/UserList.vue' };
    case 'dir_contains_file': return { dir: 'src/stores', pattern: '*.js' };
    case 'contains_text': return { path: 'src/api/index.js', text: 'axios.create' };
    case 'count_regex': return { path: 'src/router/index.js', regex: 'createRouter', min: 1 };
    case 'contains_regex': return { path: 'src/**/*.vue', regex: 'el-form|a-form' };
    case 'file_count_in_dir': return { dir: 'src/views', pattern: '*.vue', min: 5 };
    case 'syntax_check': return { dir: 'src', pattern: '**/*.{js,vue}', lang: 'js' };
    case 'fact': return { fact: 'hasVueRouter', op: '===', value: true };
    default: return { path: 'src', regex: '.*', min: 1, max: 99, step: 1 };
  }
}

function mockEvidence(ruleType, seq) {
  const map = {
    file_exists: '工程缺少文件 {path}',
    dir_contains_file: '目录 {dir} 中未找到匹配 {pattern} 的文件',
    contains_text: '{path} 中未包含 "{text}"',
    count_regex: '{path} 中 "{regex}" 命中次数不足（要求 ≥{min} 次）',
    contains_regex: '未找到匹配 {regex} 的代码',
    file_count_in_dir: '{dir} 下匹配 {pattern} 的文件不足 {min} 个',
    syntax_check: '存在语法错误文件',
    fact: '工程事实 {fact} 不满足 {op} {value}',
  };
  return map[ruleType] || '规则未命中';
}

/** 标准包体检报告 mock：94/100 + 3 条失分项（2 条已知缺陷自动豁免 + 1 条待确认） */
export function mockHealthReport() {
  return {
    score: 94,
    max_score: 100,
    threshold: 90,
    items: [
      { id: 'd1', group: '代码规范', ruleLabel: 'Axios 封装统一基础地址', deduction: 3, status: 'exempt', note: '已知缺陷：标准包组件内直接 axios.get' },
      { id: 'd2', group: '用户列表', ruleLabel: '对接口失败有兜底处理（.catch）', deduction: 2, status: 'exempt', note: '已知缺陷：UserList.vue 仅 .then 无 .catch' },
      { id: 'd3', group: '主页布局', ruleLabel: '接口失败兜底处理', deduction: 1, status: 'pending', note: '标准包未实现，请决定：转主观 / 豁免 / 接受失分' },
    ],
  };
}

/** 规则版本历史 mock */
export function mockVersions() {
  return [
    { id: 3, version: 'v3', status: 'draft', schemaVersion: 2, reason: '重构方案校准重构（多轮生成取最优）', createdAt: '2026-08-18 10:42' },
    { id: 2, version: 'v2', status: 'archived', schemaVersion: 2, reason: '人工修正：3 项缺陷转主观', createdAt: '2026-08-17 16:20' },
    { id: 1, version: 'v1', status: 'archived', schemaVersion: 1, reason: '历史版本（69 项客观 + 0 主观）', createdAt: '2026-08-16 09:05' },
  ];
}

/** 规则质量面板 mock：题目 353 数据 + 一个被改分集中的 group */
export function mockRuleQuality() {
  return {
    summary: { totalSignals: 27, activeRules: 69, suggestions: 2 },
    rows: [
      { questionId: 353, question: '用户管理系统（前端）', group: '用户列表', ruleCount: 9, points: 9, overrideCount: 12, avgDelta: -4.2, suggest: true },
      { questionId: 353, question: '用户管理系统（前端）', group: '登录', ruleCount: 18, points: 18, overrideCount: 8, avgDelta: -2.5, suggest: true },
      { questionId: 353, question: '用户管理系统（前端）', group: '路由与跳转', ruleCount: 9, points: 9, overrideCount: 3, avgDelta: 0.6, suggest: false },
      { questionId: 353, question: '用户管理系统（前端）', group: '主页布局', ruleCount: 14, points: 14, overrideCount: 4, avgDelta: 1.2, suggest: false },
    ],
  };
}
