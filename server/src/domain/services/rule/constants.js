/**
 * constants.js —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 37-124）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

/**
 * 支持的规则类型白名单（validateRules 校验用）。
 * @type {string[]}
 */
export const RULE_TYPES = [
  'file_exists',
  'dir_contains_file',
  'contains_text',
  'count_regex',
  'contains_regex',
  'file_count_in_dir',
  'syntax_check',
  'fact',
  // P0-2：语义级规则（解决正则脆弱 —— 写法差异即失分）
  'ast_pattern',      // {path, pattern}   —— tree-sitter 解析后按节点类型序列匹配（无视空白/引号/顺序）
  'count_imports',    // {path, module, min} —— 统计 import/require/from 语句中模块出现次数
  'normalized_text',  // {path, text}     —— 归一化（去全部空白）后包含匹配
];

/** 递归遍历时跳过的目录名（node_modules 等第三方/构建产物） */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'target',
]);

/**
 * syntax_check 可检查的扩展名（tree-sitter）：
 *   js/mjs/cjs/ts/jsx/tsx 用 tree-sitter-javascript 直接解析；
 *   vue 优先 tree-sitter-vue 整体解析，失败回退 <script> 提取 + JS 解析。
 */
const CHECKABLE_EXTS = new Set(['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'vue']);

/** fact 规则支持的比较 op 白名单（validateRules 校验用） */
export const FACT_OPS = ['>=', '>', '<=', '<', '==', '!=', 'includes', 'not_includes'];

/** fact 字段 → 中文标签（evidence 展示用；未收录字段回退原始字段名） */
const FACT_LABELS = {
  language: '语言',
  framework: '框架',
  hasPackageJson: 'package.json',
  dependencies: '依赖',
  entryFiles: '入口文件',
  vueFiles: 'Vue 文件数量',
  jsFiles: 'JS 文件数量',
  components: '组件',
  routes: '路由数量',
  routePaths: '路由路径',
  hasCreateRouter: 'createRouter 使用',
  hasVueRouter: 'vue-router 使用',
  hasPinia: 'Pinia 使用',
  stores: 'store',
  apiCalls: '接口调用次数',
  hasAxiosWrapper: 'axios 封装',
  hasAxios: 'axios 使用',
  syntaxErrors: '语法错误数',
  syntaxErrorFiles: '语法错误文件',
  // ---- Java（P0-1）----
  javaFiles: 'Java 文件数量',
  javaClasses: 'Java 类',
  javaImports: 'Java import',
  packageNames: 'Java 包名',
  hasSpringBoot: 'Spring Boot 使用',
  hasSpringMvc: 'Spring MVC 使用',
  hasMyBatis: 'MyBatis 使用',
  hasJpa: 'JPA 使用',
  hasLombok: 'Lombok 使用',
  controllers: 'Controller 类',
  apiMappings: '接口映射路径',
  hasPomXml: 'pom.xml',
  hasGradle: 'Gradle 构建文件',
  // ---- Python（P0-1）----
  pyFiles: 'Python 文件数量',
  pyClasses: 'Python 类',
  pyFunctions: 'Python 函数',
  pyImports: 'Python import',
  hasFlask: 'Flask 使用',
  hasDjango: 'Django 使用',
  hasFastAPI: 'FastAPI 使用',
  hasPydantic: 'Pydantic 使用',
  flaskRoutes: 'Flask 路由路径',
  hasRequirementsTxt: 'requirements.txt',
  hasPyproject: 'pyproject.toml/setup.py/Pipfile',
};

/** 数值比较失败时 evidence 展示的真实关系（如 routes>=3 实际 2 → "路由数量 2 < 3"） */
const INVERSE_OPS = { '>=': '<', '>': '<=', '<=': '>', '<': '>=' };

/** 证据中错误摘要的最大长度 */
const ERROR_SUMMARY_LEN = 160;

export { SKIP_DIRS, CHECKABLE_EXTS, FACT_LABELS, INVERSE_OPS, ERROR_SUMMARY_LEN };
