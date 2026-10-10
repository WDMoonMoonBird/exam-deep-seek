/**
 * factExtractors/javascript.js —— JS/Vue 事实提取 adapter（P0-1 迁移）。
 *
 * 从原 factExtractor.js 迁入，行为严格不变：
 *   - .js/.ts/.jsx/.tsx/.mjs/.cjs：tree-sitter-javascript 解析，语法错误计数 + import/调用分析；
 *   - .vue：<script> 提取 + JS 解析（tree-sitter-vue 与 tree-sitter 0.25 ABI 不兼容 → 恒走回退，契约要求）；
 *   - 输出事实字段见 emptyFacts（v1 JS 字段全保留）。
 */

import fs from 'node:fs';
import path from 'node:path';
import Parser from 'tree-sitter';
import JS from 'tree-sitter-javascript';
import { countSyntaxErrors, extOf, unquote } from './common.js';

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

/** 入口文件探测候选（按顺序探测，存在者收集） */
const ENTRY_CANDIDATES = [
  'src/main.js', 'src/main.ts', 'src/main.jsx', 'src/main.tsx',
  'src/index.js', 'src/index.ts',
  'index.js', 'index.ts', 'main.js', 'main.ts',
  'app.js', 'server.js',
];

/**
 * 获取 JS 解析器。注意：tree-sitter 同一 Parser 连续 parse 会使旧树节点失效（缓冲复用），
 * 因此每次解析都新建实例。
 * @returns {object}
 */
export function getJsParser() {
  const p = new Parser();
  p.setLanguage(JS);
  return p;
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

/**
 * 对一棵 JS 语法树做事实提取（imports / axios·fetch 调用 / vue-router / pinia）。
 * @param {object} tree - tree-sitter Tree
 * @param {object} state - 累积状态（facts + 内部集合）
 */
export function analyzeJsTree(tree, state) {
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
  const base = relPath.split('/').pop();
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(0, idx) : base;
}

/**
 * 分析单个 .vue 文件：提取 <script>（含 <script setup>）用 JS 解析（imports/调用/router/pinia 同 JS 逻辑）。
 * @param {string} content - vue 文件内容
 * @param {string} relPath - 相对工程根路径
 * @param {object} state - 累积状态
 */
export function analyzeVueFile(content, relPath, state) {
  const { facts } = state;
  const jsParser = getJsParser();
  let jsErrors = 0;
  for (const block of extractScriptBlocks(content)) {
    if (!block.trim()) continue;
    const tree = jsParser.parse(block);
    jsErrors += countSyntaxErrors(tree);
    analyzeJsTree(tree, state);
  }
  if (jsErrors > 0) {
    facts.syntaxErrors += jsErrors;
    facts.syntaxErrorFiles.push(relPath);
  }
}

/**
 * 依据事实推导 framework（vue → react → node → unknown，先到先得）。
 * @param {object} facts - 已填写的 facts
 * @returns {string}
 */
export function detectFramework(facts) {
  const deps = new Set(facts.dependencies);
  if (facts.vueFiles > 0 || facts.hasVueRouter || facts.hasPinia || [...deps].some((d) => VUE_DEPS.has(d))) {
    return 'vue';
  }
  if ([...deps].some((d) => REACT_DEPS.has(d))) return 'react';
  if ([...deps].some((d) => NODE_DEPS.has(d)) || facts.jsFiles > 0) return 'node';
  return 'unknown';
}

/**
 * JS/Vue 工程事实提取（adapter 入口）：在公共收集之上做 JS 特定分析。
 * @param {object} ctx - { projectRoot, files, facts, state }
 */
export function extractJsFacts({ projectRoot, files, facts, state }) {
  // 入口文件探测
  facts.entryFiles = ENTRY_CANDIDATES.filter((rel) => {
    try {
      return fs.statSync(path.join(projectRoot, rel)).isFile();
    } catch {
      return false;
    }
  });

  // 文件计数（vueFiles/jsFiles）
  for (const rel of files) {
    if (extOf(rel) === 'vue') facts.vueFiles += 1;
    else facts.jsFiles += 1;
  }

  // 逐文件分析（每个文件只解析一次）
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

  // ---- 依赖交叉推导（v1 契约：与 registry 中 hasPackageJson/dependencies 配合）----
  const deps = new Set(facts.dependencies);
  facts.hasVueRouter = deps.has('vue-router')
    && (state.importedModules.has('vue-router') || state.usedRouterApis.size > 0);
  facts.hasCreateRouter = state.usedRouterApis.has('createRouter') || state.importedNames.has('createRouter');
  facts.hasPinia = deps.has('pinia')
    && (state.importedModules.has('pinia') || state.usedPiniaApis.size > 0);
  facts.hasAxios = state.importedModules.has('axios') || facts.hasAxios;
}
