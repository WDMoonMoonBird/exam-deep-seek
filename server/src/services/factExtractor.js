/**
 * factExtractor.js —— 工程事实提取器（基于 tree-sitter）。
 *
 * 规则驱动评分升级的中间层：把学生工程从「原始文件内容」转成「统一事实 JSON」，
 * 供规则引擎按事实字段做确定性判断（如 { fact: 'routes', op: '>=', value: 3 }）。
 *
 * 处理管线：学生工程 → L0 过滤 → 核心目录 → extractFacts() → 事实 JSON → 规则引擎。
 *
 * 设计约定：
 *   - 纯函数式、同步实现，仅依赖 node:fs / node:path / tree-sitter 系（零其他依赖，不 import prisma）；
 *   - 每个文件只解析一次；单文件解析失败（读不到/解析异常）不影响整体，跳过该文件继续；
 *   - 全部路径相对工程根输出（syntaxErrorFiles 等），路由 path 为原始字符串字面量；
 *   - 返回 facts 对象所有字段齐全，缺省为 0 / [] / false / 'unknown'；
 *   - .vue 优先尝试 tree-sitter-vue 整体解析（含 template）；若 tree-sitter-vue 不可用/解析异常，
 *     回退到提取 <script>（含 <script setup>）内容用 tree-sitter-javascript 解析（同 JS 逻辑）。
 *
 * 已知限制：
 *   - .ts/.tsx 用 tree-sitter-javascript 解析（契约要求），TS 类型注解（如 const x: number）会被
 *     JS 文法视为语法错误计入 syntaxErrors —— 属契约内行为，勿用于判定 TS 工程的语法健康度；
 *   - createRouter({ routes }) 的简写形式仅支持同文件顶层 const routes = [...] 定义（含 export const）；
 *     跨文件变量引用无法静态解析，不计入 routes。
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Parser from 'tree-sitter';
import JS from 'tree-sitter-javascript';
import { resolveProjectRoot } from './ruleExecutor.js';

// 与 ruleExecutor 同语义的工程根探测，直接复用
export { resolveProjectRoot };

// tree-sitter-vue 不在此处静态导入：其 0.2.1 绑定（ABI 13）与 tree-sitter 0.25 不兼容，
// 在部分运行环境（如 jest vm 模块）下连模块加载都会失败；改为惰性加载，
// 任何失败（加载/解析异常）都走「提取 <script> 用 JS 解析」的回退路径（契约要求）。
const _require = createRequire(import.meta.url);

// ==================== 常量 ====================

/** 参与事实提取的源码扩展名白名单（js/ts 系 + vue） */
const SOURCE_EXTS = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue']);

/** 递归遍历时跳过的目录名（第三方依赖/构建产物/隐藏项），与 ruleExecutor 保持一致 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'target']);

/** 入口文件探测候选（按顺序探测，存在者收集） */
const ENTRY_CANDIDATES = [
  'src/main.js', 'src/main.ts', 'src/main.jsx', 'src/main.tsx',
  'src/index.js', 'src/index.ts',
  'index.js', 'index.ts', 'main.js', 'main.ts',
  'app.js', 'server.js',
];

/** vue-router 路由 API 名（import 或调用任一处出现即视为使用了 vue-router） */
const ROUTER_API_NAMES = new Set([
  'createRouter', 'createWebHistory', 'createWebHashHistory', 'createMemoryHistory', 'addRoute',
]);

/** axios 请求方法名（axios.get/post/... 计入 apiCalls） */
const AXIOS_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'request']);

/** fetch 挂载对象白名单（window.fetch / globalThis.fetch 等计入 apiCalls） */
const FETCH_OBJECTS = new Set(['window', 'globalThis', 'self']);

/** Vue 框架相关依赖名（framework 判定用） */
const VUE_DEPS = new Set(['vue', 'vue-router', 'vuex', 'pinia', '@vue/cli-service', 'nuxt', 'nuxt3']);

/** React 框架相关依赖名 */
const REACT_DEPS = new Set(['react', 'react-dom', 'next', 'umi', 'remix', '@vitejs/plugin-react']);

/** Node 后端框架相关依赖名 */
const NODE_DEPS = new Set(['express', 'koa', 'fastify', 'egg', 'egg-bin', 'hapi', 'restify', '@nestjs/core', 'polka', 'micro']);

// ==================== 内部工具 ====================

/**
 * 生成全缺省 facts 骨架（字段与 Schema v1 完全一致）。
 * @returns {object}
 */
function emptyFacts() {
  return {
    language: 'unknown',
    framework: 'unknown',
    hasPackageJson: false,
    dependencies: [],
    entryFiles: [],
    vueFiles: 0,
    jsFiles: 0,
    components: [],
    routes: 0,
    routePaths: [],
    hasCreateRouter: false,
    hasVueRouter: false,
    hasPinia: false,
    stores: [],
    apiCalls: 0,
    hasAxiosWrapper: false,
    hasAxios: false,
    syntaxErrors: 0,
    syntaxErrorFiles: [],
  };
}

/**
 * 取扩展名（小写，含点前全部；无扩展名返回 ''）。
 * @param {string} relPath - 相对路径
 * @returns {string}
 */
function extOf(relPath) {
  const base = path.basename(relPath);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : '';
}

/**
 * 递归收集工程内全部源码文件（相对工程根的 posix 路径），跳过隐藏项与 SKIP_DIRS。
 * @param {string} projectRoot - 工程根（绝对路径）
 * @returns {string[]}
 */
function collectSourceFiles(projectRoot) {
  const out = [];
  const walk = (abs) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const childAbs = path.join(abs, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(childAbs);
      } else if (e.isFile() && SOURCE_EXTS.has(extOf(e.name))) {
        out.push(path.relative(projectRoot, childAbs).split(path.sep).join('/'));
      }
    }
  };
  walk(projectRoot);
  return out;
}

/**
 * 去掉字符串字面量的外层引号（单/双/反引号）。
 * @param {string} text - 源码里的字符串字面量文本
 * @returns {string}
 */
function unquote(text) {
  const s = String(text);
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    const BT = '\x60'; // 反引号
    if ((first === "'" && last === "'") || (first === '"' && last === '"') || (first === BT && last === BT)) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * 取调用表达式 arguments 节点的第一个指定类型命名子节点。
 * @param {object} call - call_expression 节点
 * @param {string} type - 目标节点类型（如 'string' / 'object'）
 * @returns {object|null}
 */
function firstArgOfType(call, type) {
  const args = call.childForFieldName('arguments')
    || (call.namedChildren.find((c) => c.type === 'arguments') || null);
  if (!args) return null;
  return args.namedChildren.find((c) => c.type === type) || null;
}

/**
 * 取对象字面量中指定 key 的值节点（key 为普通属性名）。
 * @param {object} obj - object 节点
 * @param {string} key - 属性名
 * @returns {object|null}
 */
function pairValueOf(obj, key) {
  for (const pair of obj.namedChildren) {
    if (pair.type === 'pair') {
      const k = pair.namedChildren[0];
      if (k && (k.type === 'property_identifier' || k.type === 'identifier') && k.text === key) {
        return pair.namedChildren[1] || null;
      }
    } else if (pair.type === 'shorthand_property_identifier' && pair.text === key) {
      // 简写属性：{ routes } —— 值即同名 identifier（路由变量引用解析用）
      return { type: 'identifier', text: key, namedChildren: [] };
    }
  }
  return null;
}

/**
 * 从路由对象（{ path: '/login', ... }）里取 path 字符串值。
 * @param {object} obj - object 节点
 * @returns {string|null}
 */
function pathOfRouteObject(obj) {
  const val = pairValueOf(obj, 'path');
  if (val && val.type === 'string') return unquote(val.text);
  return null;
}

/**
 * 统计一棵树的语法错误节点数（ERROR + isMissing）。
 * @param {object} tree - tree-sitter Tree
 * @returns {number}
 */
function countSyntaxErrors(tree) {
  let count = 0;
  const visit = (n) => {
    if (n.type === 'ERROR' || n.isMissing) count += 1;
    for (const c of n.namedChildren) visit(c);
  };
  visit(tree.rootNode);
  return count;
}

/**
 * 提取 .vue 内容中的全部 <script> 块内联内容（含 <script setup>、lang 属性等）。
 * 带 src= 的外链脚本无内联内容，跳过。
 * @param {string} code - vue 文件内容
 * @returns {string[]}
 */
function extractScriptBlocks(code) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(code))) !== null) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    out.push(m[2]);
  }
  return out;
}

/**
 * .vue 组件名：basename 去扩展名。
 * @param {string} relPath - 相对路径
 * @returns {string}
 */
function componentNameOf(relPath) {
  const base = path.basename(relPath);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(0, idx) : base;
}

// ==================== tree-sitter 解析器管理 ====================

/** JS 解析器（惰性单例；parse() 可复用，同步单线程使用） */
// 解析器每次新建（tree-sitter 共享 Parser 连续 parse 会使旧树节点失效）
/** vue 解析器（惰性单例；tree-sitter-vue 与 tree-sitter 0.25 的 ABI 不兼容时保持 null，走回退路径） */
let _vueParser = null;
let _vueParserTried = false;

/**
 * 获取 JS 解析器。注意：tree-sitter 同一 Parser 连续 parse 会使旧树节点失效（缓冲复用），
 * 因此每次解析都新建实例。
 * @returns {object}
 */
function getJsParser() {
  const p = new Parser();
  p.setLanguage(JS);
  return p;
}

/**
 * 获取 tree-sitter-vue 解析器；不可用（构造/setLanguage 抛错）返回 null，后续不再重试。
 * @returns {object|null}
 */
function getVueParser() {
  // 2026-08-18：tree-sitter-vue（ABI 13）与 tree-sitter 0.25 原生二进制冲突，
  // require 会污染进程内 tree-sitter 核心状态（节点失效）。统一走 <script> 提取 + JS 解析。
  return null;
}

// ==================== JS 源码分析 ====================

/**
 * 对一棵 JS 语法树做事实提取（imports / axios·fetch 调用 / vue-router / pinia）。
 * @param {object} tree - tree-sitter Tree
 * @param {object} state - 累积状态（facts + 内部集合）
 */
function analyzeJsTree(tree, state) {
  const { facts } = state;
  const importStmts = [];
  const callExprs = [];
  const memberExprs = [];

  const visit = (n) => {
    switch (n.type) {
      case 'import_statement':
        importStmts.push(n);
        break;
      case 'call_expression':
        callExprs.push(n);
        break;
      case 'member_expression':
        memberExprs.push(n);
        break;
      case 'lexical_declaration': {
        // 顶层 const 数组定义收集（路由变量引用解析）：const routes = [...] / export const routes = [...]
        const parentType = n.parent ? n.parent.type : '';
        if ((parentType === 'program' || parentType === 'export_statement') && state.topLevelConsts) {
          for (const decl of n.namedChildren) {
            if (decl.type !== 'variable_declarator') continue;
            const name = decl.namedChildren.find(c => c.type === 'identifier');
            const value = decl.namedChildren.find(c => c.type === 'array');
            if (name && value) state.topLevelConsts[name.text] = value;
          }
        }
        break;
      }
      default:
        break;
    }
    for (const c of n.namedChildren) visit(c);
  };
  visit(tree.rootNode);

  // ---- import 提取 ----
  for (const imp of importStmts) {
    const srcNode = imp.childForFieldName('source')
      || (imp.namedChildren.find((c) => c.type === 'string') || null);
    if (srcNode) state.importedModules.add(unquote(srcNode.text));
    // import 的名字（默认导入 / 命名导入 / import type）收集到 importedNames
    for (const clause of imp.namedChildren) {
      if (clause.type === 'import_clause') {
        const collectIds = (n) => {
          for (const c of n.namedChildren) {
            if (c.type === 'identifier') state.importedNames.add(c.text);
            else collectIds(c);
          }
        };
        collectIds(clause);
      }
    }
  }

  // ---- 调用表达式 ----
  for (const call of callExprs) {
    const fn = call.childForFieldName('function') || (call.namedChildren[0] || null);
    if (!fn) continue;

    if (fn.type === 'identifier') {
      const name = fn.text;
      if (name === 'require' || name === 'import') {
        // require('x') / import('x') 视作模块引入
        const s = firstArgOfType(call, 'string');
        if (s) state.importedModules.add(unquote(s.text));
      } else if (name === 'fetch') {
        facts.apiCalls += 1;
      } else if (name === 'createRouter') {
        facts.hasCreateRouter = true;
        state.usedRouterApis.add('createRouter');
        const obj = firstArgOfType(call, 'object');
        if (obj) {
          const routesVal = pairValueOf(obj, 'routes');
          // 变量引用解析：routes: routes（identifier）→ 顶层 const routes = [...] 定义
          let routesArr = (routesVal && routesVal.type === 'array') ? routesVal : null;
          if (!routesArr && routesVal && routesVal.type === 'identifier' && state.topLevelConsts[routesVal.text]) {
            routesArr = state.topLevelConsts[routesVal.text];
          }
          if (routesArr && routesArr.type === 'array') {
            facts.routes += routesArr.namedChildren.length;
            for (const el of routesArr.namedChildren) {
              if (el.type === 'object') {
                const p = pathOfRouteObject(el);
                if (p) facts.routePaths.push(p);
              }
            }
          }
        }
      } else if (ROUTER_API_NAMES.has(name)) {
        // createWebHistory / createWebHashHistory / createMemoryHistory / addRoute（直接调用形态）
        state.usedRouterApis.add(name);
        if (name === 'addRoute') {
          facts.routes += 1;
          const s = firstArgOfType(call, 'string');
          if (s) facts.routePaths.push(unquote(s.text));
        }
      } else if (name === 'defineStore') {
        state.usedPiniaApis.add('defineStore');
        const s = firstArgOfType(call, 'string');
        if (s) facts.stores.push(unquote(s.text));
      } else if (name === 'createPinia') {
        state.usedPiniaApis.add('createPinia');
      }
      continue;
    }

    if (fn.type === 'member_expression') {
      const { base, prop } = memberParts(fn);
      if (base === 'axios') {
        if (AXIOS_METHODS.has(prop)) {
          facts.apiCalls += 1;
          facts.hasAxios = true;
        } else if (prop === 'create') {
          facts.hasAxiosWrapper = true;
          facts.hasAxios = true;
        } else if (prop === 'defaults') {
          // axios.defaults.xxx = ... 赋值形态
          facts.apiCalls += 1;
          facts.hasAxios = true;
        }
      } else if (FETCH_OBJECTS.has(base) && prop === 'fetch') {
        facts.apiCalls += 1;
      } else if (prop === 'addRoute') {
        // router.addRoute(...) 每次调用计一条路由
        facts.routes += 1;
        state.usedRouterApis.add('addRoute');
        const s = firstArgOfType(call, 'string');
        if (s) facts.routePaths.push(unquote(s.text));
        const obj = firstArgOfType(call, 'object');
        if (obj) {
          const p = pathOfRouteObject(obj);
          if (p) facts.routePaths.push(p);
        }
      }
    }
  }

  // ---- 成员表达式（仅补 axios.defaults 赋值形态，避免与调用重复计数）----
  for (const m of memberExprs) {
    const { base, prop } = memberParts(m);
    if (base === 'axios' && prop === 'defaults') {
      facts.apiCalls += 1;
      facts.hasAxios = true;
    }
  }
}

/**
 * 拆解 member_expression：最左侧标识符名（base）+ 最右侧属性名（prop）。
 * @param {object} node - member_expression 节点
 * @returns {{base: string, prop: string}}
 */
function memberParts(node) {
  let cur = node;
  let prop = '';
  while (cur.type === 'member_expression') {
    const children = cur.namedChildren;
    const last = children[children.length - 1];
    if (last) prop = last.text;
    const first = children[0];
    cur = first;
  }
  return { base: cur ? cur.text : '', prop };
}

// ==================== Vue 文件分析 ====================

/**
 * 分析单个 .vue 文件：优先 tree-sitter-vue 整体解析（template 层错误），
 * 同时提取 <script>（含 <script setup>）用 JS 解析（imports/调用/router/pinia 同 JS 逻辑）。
 * @param {string} content - vue 文件内容
 * @param {string} relPath - 相对工程根路径
 * @param {object} state - 累积状态
 */
function analyzeVueFile(content, relPath, state) {
  const { facts } = state;
  let vueErrors = 0;
  const vueParser = getVueParser();
  if (vueParser) {
    try {
      const tree = vueParser.parse(content);
      vueErrors = countSyntaxErrors(tree);
    } catch {
      vueErrors = 0; // 单文件 vue 解析异常不影响整体
    }
  }

  const jsParser = getJsParser();
  let jsErrors = 0;
  for (const block of extractScriptBlocks(content)) {
    if (!block.trim()) continue;
    const tree = jsParser.parse(block);
    jsErrors += countSyntaxErrors(tree);
    analyzeJsTree(tree, state);
  }

  const total = jsErrors + vueErrors;
  if (total > 0) {
    facts.syntaxErrors += total;
    facts.syntaxErrorFiles.push(relPath);
  }
}

// ==================== 框架判定 ====================

/**
 * 依据事实推导 framework（vue → react → node → unknown，先到先得）。
 * @param {object} facts - 已填写的 facts
 * @returns {string}
 */
function detectFramework(facts) {
  const deps = new Set(facts.dependencies);
  if (facts.vueFiles > 0 || facts.hasVueRouter || facts.hasPinia || [...deps].some((d) => VUE_DEPS.has(d))) {
    return 'vue';
  }
  if ([...deps].some((d) => REACT_DEPS.has(d))) return 'react';
  if ([...deps].some((d) => NODE_DEPS.has(d)) || facts.jsFiles > 0) return 'node';
  return 'unknown';
}

// ==================== 导出函数 ====================

/**
 * 工程事实提取：把 rootDir 下的源码工程转成统一事实 JSON。
 *
 * 流程：
 *   1. resolveProjectRoot 解析工程根（唯一含源码子目录时下钻）；
 *   2. package.json 依赖提取（dependencies + devDependencies 的 key）；
 *   3. 入口文件探测（ENTRY_CANDIDATES 中存在者）；
 *   4. 递归遍历源码文件（跳过 node_modules/.git 等；js/ts/vue 扩展名）：
 *      - .js/.ts：tree-sitter-javascript 解析，语法错误计数 + import/调用分析；
 *      - .vue：tree-sitter-vue 整体解析（失败回退），<script> 块 JS 解析分析；
 *   5. 推导 language / framework，去重列表，返回 Schema v1 全字段 facts。
 *
 * 任何单文件失败（读不到/解析异常）只跳过该文件，绝不中断整体提取。
 *
 * @param {string} rootDir - 工程目录（解压根或工程根）
 * @returns {object} 事实 JSON（字段与 Schema v1 一致，缺省为 0/[]/false/'unknown'）
 */
export function extractFacts(rootDir) {
  const facts = emptyFacts();
  const projectRoot = resolveProjectRoot(rootDir);
  const state = {
    facts,
    importedModules: new Set(),
    importedNames: new Set(),
    usedRouterApis: new Set(),
    usedPiniaApis: new Set(),
    topLevelConsts: {}, // 内部累积：顶层 const 名 → array 节点（路由变量引用解析用，不进 facts）
  };

  // ---- package.json 依赖 ----
  const pkgPath = path.join(projectRoot, 'package.json');
  facts.hasPackageJson = fs.existsSync(pkgPath);
  if (facts.hasPackageJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = new Set();
      for (const section of ['dependencies', 'devDependencies']) {
        const obj = pkg[section];
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const key of Object.keys(obj)) deps.add(key);
        }
      }
      facts.dependencies = [...deps].sort();
    } catch {
      // package.json 解析失败：hasPackageJson 仍为 true（文件存在），依赖按空处理
      facts.dependencies = [];
    }
  }

  // ---- 入口文件探测 ----
  facts.entryFiles = ENTRY_CANDIDATES.filter((rel) => {
    try {
      return fs.statSync(path.join(projectRoot, rel)).isFile();
    } catch {
      return false;
    }
  });

  // ---- 收集源码文件并统计文件数 ----
  const files = collectSourceFiles(projectRoot);
  for (const rel of files) {
    if (extOf(rel) === 'vue') facts.vueFiles += 1;
    else facts.jsFiles += 1;
  }

  // ---- 逐文件分析（每个文件只解析一次）----
  for (const rel of files) {
    let content;
    try {
      content = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
    } catch {
      continue; // 读不到的文件跳过
    }
    try {
      if (extOf(rel) === 'vue') {
        facts.components.push(componentNameOf(rel));
        analyzeVueFile(content, rel, state);
      } else {
        const jsParser = getJsParser(); // 保持引用：tree-sitter 树节点惰性访问 parser 内存，parser 被 GC 后树失效
        const tree = jsParser.parse(content);
        const errs = countSyntaxErrors(tree);
        if (errs > 0) {
          facts.syntaxErrors += errs;
          facts.syntaxErrorFiles.push(rel);
        }
        analyzeJsTree(tree, state);
      }
    } catch {
      // 单文件解析失败不影响整体
    }
  }

  // ---- 依赖交叉推导 ----
  const deps = new Set(facts.dependencies);
  facts.hasVueRouter = deps.has('vue-router')
    && (state.importedModules.has('vue-router') || state.usedRouterApis.size > 0);
  facts.hasCreateRouter = state.usedRouterApis.has('createRouter') || state.importedNames.has('createRouter');
  facts.hasPinia = deps.has('pinia')
    && (state.importedModules.has('pinia') || state.usedPiniaApis.size > 0);
  facts.hasAxios = state.importedModules.has('axios') || facts.hasAxios;

  // ---- 列表去重（保序）----
  facts.syntaxErrorFiles = [...new Set(facts.syntaxErrorFiles)];
  facts.routePaths = [...new Set(facts.routePaths)];
  facts.stores = [...new Set(facts.stores)];
  facts.components = [...new Set(facts.components)];
  facts.entryFiles = [...new Set(facts.entryFiles)];

  // ---- language / framework ----
  facts.language = facts.vueFiles > 0 ? 'vue' : (facts.jsFiles > 0 ? 'javascript' : 'unknown');
  facts.framework = detectFramework(facts);

  return facts;
}
