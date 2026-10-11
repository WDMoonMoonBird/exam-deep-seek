/**
 * factExtractors/python.js —— Python 事实提取 adapter（P0-1）。
 *
 * 基于 tree-sitter-python 解析 .py 文件，输出 Schema v2 Python 扩展字段：
 *   - pyFiles / pyClasses / pyFunctions / pyImports（收集阶段写入 state 去重 Set，末尾统一落 facts）
 *   - hasFlask / hasDjango / hasFastAPI / hasPydantic（imports ∪ 清单依赖）
 *   - flaskRoutes（decorated_definition 的 decorator 调用第一个 string 参数，如 @app.route('/users')）
 *   - syntaxErrors / syntaxErrorFiles（countSyntaxErrors 统计）
 *
 * 设计约定（与 javascript.js 一致）：
 *   - 纯同步；单文件解析失败 catch 后跳过该文件，绝不中断整体提取；
 *   - 每次解析新建 Parser（tree-sitter 同一 Parser 连续 parse 会使旧树节点失效）。
 */

import fs from 'node:fs';
import path from 'node:path';
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import { countSyntaxErrors, extOf } from './common.js';

/** Python 字符串字面量前缀（f/r/b/u 及其组合，如 fr/rf/br/rb，大小写不敏感） */
const STRING_PREFIX_RE = /^(?:fr|rf|br|rb|f|r|b|u)/i;

/**
 * 获取 Python 解析器。注意：tree-sitter 同一 Parser 连续 parse 会使旧树节点失效（缓冲复用），
 * 因此每次解析都新建实例。
 * @returns {object}
 */
export function getPythonParser() {
  const p = new Parser();
  p.setLanguage(Python);
  return p;
}

/**
 * 去掉 Python 字符串字面量的前缀（f/r/b/u 及组合）与外层引号（单/双/反引号，含三引号）。
 * @param {string} text - 源码里的字符串字面量文本（type === 'string'）
 * @returns {string}
 */
function unquote(text) {
  let s = String(text);
  s = s.replace(STRING_PREFIX_RE, '');
  if (s.length >= 2) {
    const q = s[0];
    const BT = '`'; // 反引号
    if (q === "'" || q === '"' || q === BT) {
      if (s.startsWith(q + q + q) && s.endsWith(q + q + q)) return s.slice(3, -3);
      if (s.endsWith(q)) return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * function_definition 是否计入 pyFunctions：顶层函数（module 直属）或类内方法。
 * 装饰的函数（decorated_definition 包裹）按被装饰对象所属层级判定；嵌套闭包不计入。
 * @param {object} node - function_definition 节点
 * @returns {boolean}
 */
function isTopLevelOrMethod(node) {
  const parent = node.parent;
  if (!parent) return true; // 防御：无父节点视为顶层
  if (parent.type === 'module') return true; // 顶层函数
  if (parent.type === 'block') {
    // 类内方法：block 的父是 class_definition（类的 body 字段 suite → block）
    return parent.parent && parent.parent.type === 'class_definition';
  }
  if (parent.type === 'decorated_definition') {
    const gp = parent.parent;
    if (gp && gp.type === 'module') return true; // 装饰的顶层函数
    // 装饰的类方法：decorated_definition → block → class_definition
    if (gp && gp.type === 'block' && gp.parent && gp.parent.type === 'class_definition') return true;
    return false;
  }
  return false;
}

/**
 * 收集 import_statement 的模块名：dotted_name（import os / import a.b）或
 * aliased_import 的 name 字段（import numpy as np）。支持逗号多导入。
 * @param {object} node - import_statement 节点
 * @param {object} state - 累积状态
 */
function collectImportStatement(node, state) {
  for (const child of node.namedChildren) {
    if (child.type === 'dotted_name') {
      state.pyImportsSet.add(child.text);
    } else if (child.type === 'aliased_import') {
      const mod = child.childForFieldName('name');
      if (mod) state.pyImportsSet.add(mod.text);
    }
  }
}

/**
 * 收集 import_from_statement 的模块名（module_name 字段，如 from flask import Flask → 'flask'）。
 * 相对导入（from . import x）module_name 是 relative_import，无真实模块名，跳过。
 * @param {object} node - import_from_statement 节点
 * @param {object} state - 累积状态
 */
function collectImportFromStatement(node, state) {
  const mod = node.childForFieldName('module_name');
  if (mod && mod.type === 'dotted_name') state.pyImportsSet.add(mod.text);
}

/**
 * 收集 decorated_definition 的 Flask 路由：decorator 子节点的调用表达式
 * （如 @app.route('/users')）参数列表里第一个 string 参数。
 * @param {object} node - decorated_definition 节点
 * @param {object} state - 累积状态
 */
function collectFlaskRoutes(node, state) {
  for (const child of node.namedChildren) {
    if (child.type !== 'decorator') continue;
    const expr = child.namedChildren[0]; // decorator: '@' expression newline，首个命名子节点即表达式
    if (!expr || expr.type !== 'call') continue;
    const args = expr.childForFieldName('arguments')
      || (expr.namedChildren.find((c) => c.type === 'argument_list') || null);
    if (!args) continue;
    const str = args.namedChildren.find((c) => c.type === 'string');
    if (str) state.flaskRoutesSet.add(unquote(str.text));
  }
}

/**
 * 对一棵 Python 语法树做事实提取（imports / 类 / 函数 / Flask 路由装饰器）。
 * @param {object} tree - tree-sitter Tree
 * @param {object} state - 累积状态（facts + 内部去重 Set）
 */
export function analyzePythonTree(tree, state) {
  const visit = (n) => {
    switch (n.type) {
      case 'import_statement':
        collectImportStatement(n, state);
        break;
      case 'import_from_statement':
        collectImportFromStatement(n, state);
        break;
      case 'class_definition': {
        const name = n.childForFieldName('name');
        if (name) state.pyClassesSet.add(name.text);
        break;
      }
      case 'function_definition': {
        const name = n.childForFieldName('name');
        if (name && isTopLevelOrMethod(n)) state.pyFunctionsSet.add(name.text);
        break;
      }
      case 'decorated_definition':
        collectFlaskRoutes(n, state);
        break;
      default:
        break;
    }
    for (const c of n.namedChildren) visit(c);
  };
  visit(tree.rootNode);
}

/**
 * Python 工程事实提取（adapter 入口）：文件计数 + 逐文件解析分析 + 去重集合统一落 facts。
 * @param {object} ctx - { projectRoot, files, facts, state, language }
 */
export function extractPythonFacts({ projectRoot, files, facts, state }) {
  // 文件计数
  for (const rel of files) {
    if (extOf(rel) === 'py') facts.pyFiles += 1;
  }

  // 逐文件分析（每个 .py 文件只解析一次；读不到/解析失败跳过该文件）
  for (const rel of files) {
    if (extOf(rel) !== 'py') continue;
    let content;
    try {
      content = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
    } catch {
      continue;
    }
    try {
      const parser = getPythonParser(); // 保持引用：tree-sitter 树节点惰性访问 parser 内存
      const tree = parser.parse(content);
      const errs = countSyntaxErrors(tree);
      if (errs > 0) {
        facts.syntaxErrors += errs;
        facts.syntaxErrorFiles.push(rel);
      }
      analyzePythonTree(tree, state);
    } catch {
      // 单文件解析失败不影响整体
    }
  }

  // 去重集合统一落 facts（注册中心 factExtractor 还会再做一次去重，双保险）
  facts.pyImports = [...state.pyImportsSet];
  facts.pyClasses = [...state.pyClassesSet];
  facts.pyFunctions = [...state.pyFunctionsSet];
  facts.flaskRoutes = [...state.flaskRoutesSet];

  // 框架标记：imports ∪ 清单依赖（依赖名已小写；imports 归一化为小写比较）
  const deps = new Set((facts.dependencies || []).map((d) => String(d).toLowerCase()));
  const imports = new Set([...state.pyImportsSet].map((i) => i.toLowerCase()));
  facts.hasFlask = imports.has('flask') || deps.has('flask');
  facts.hasDjango = imports.has('django') || deps.has('django');
  facts.hasFastAPI = imports.has('fastapi') || deps.has('fastapi');
  facts.hasPydantic = imports.has('pydantic') || deps.has('pydantic');
}

/**
 * 依据事实推导 Python 框架（优先级：django > fastapi > flask > python > unknown）。
 * @param {object} facts - 已填写的 facts
 * @returns {string}
 */
export function detectPythonFramework(facts) {
  const deps = new Set((facts.dependencies || []).map((d) => String(d).toLowerCase()));
  const imports = new Set((facts.pyImports || []).map((i) => i.toLowerCase()));
  const has = (name) => imports.has(name) || deps.has(name);
  if (has('django')) return 'django';
  if (has('fastapi')) return 'fastapi';
  if (has('flask')) return 'flask';
  if (facts.pyFiles > 0) return 'python';
  return 'unknown';
}
