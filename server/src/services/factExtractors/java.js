/**
 * factExtractors/java.js —— Java 事实提取 adapter（P0-1）。
 *
 * 基于 tree-sitter-java 对 .java 文件做事实提取：
 *   - 文件计数（javaFiles）、语法错误统计（syntaxErrors / syntaxErrorFiles）；
 *   - package 声明路径、import 完整包路径（通配符保留为 xxx.*）；
 *   - 类名（class/interface/enum declaration）、@Controller/@RestController 控制器、
 *     Spring 请求映射注解（GetMapping/PostMapping/PutMapping/DeleteMapping/PatchMapping/
 *     RequestMapping）的第一个字符串参数（类上/方法上均可）；
 *   - Spring Boot / Spring MVC / MyBatis / JPA / Lombok 框架标志（依赖 + import 双源判定）；
 *   - detectJavaFramework 框架判定：spring-boot → spring → mybatis-spring → lombok → java。
 *
 * 设计约定（与 factExtractor.js / javascript.js 一致）：
 *   - 纯同步、零额外依赖；单文件解析失败 catch 后跳过，绝不中断整体；
 *   - 每次解析新建 Parser（tree-sitter 同一 Parser 连续 parse 会使旧树节点失效）；
 *   - 收集阶段去重写入 state 的 *Set，函数末尾统一回填 facts 数组字段
 *     （注册中心 factExtractor.js 还会再做一次去重，双保险）。
 */

import fs from 'node:fs';
import path from 'node:path';
import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import { countSyntaxErrors, extOf } from './common.js';

/** Spring 请求映射注解（apiMappings 收集目标；类上/方法上均可收集） */
const MAPPING_ANNOTATIONS = new Set([
  'GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'PatchMapping', 'RequestMapping',
]);

/** 控制器注解（controllers 收集目标，仅 class_declaration 判定） */
const CONTROLLER_ANNOTATIONS = new Set(['RestController', 'Controller']);

/** 参与注解/类名收集的声明节点类型（类/接口/枚举 + 方法/构造器） */
const DECL_TYPES = new Set([
  'class_declaration', 'interface_declaration', 'enum_declaration',
  'method_declaration', 'constructor_declaration',
]);

/**
 * 获取 Java 解析器。注意：tree-sitter 同一 Parser 连续 parse 会使旧树节点失效（缓冲复用），
 * 因此每次解析都新建实例。
 * @returns {object}
 */
export function getJavaParser() {
  const p = new Parser();
  p.setLanguage(Java);
  return p;
}

/**
 * 去掉字符串字面量外层双引号（局部实现：Java 字符串转义不做深度还原，去引号即可）。
 * @param {string} text - 源码里的字符串字面量文本
 * @returns {string}
 */
function unquote(text) {
  const s = String(text);
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

/**
 * 取注解名（去掉限定前缀）：org.springframework.web.bind.annotation.GetMapping → GetMapping。
 * @param {object} ann - marker_annotation / annotation 节点
 * @returns {string}
 */
function annotationName(ann) {
  const first = ann.namedChildren[0];
  if (!first) return '';
  const text = first.text;
  const idx = text.lastIndexOf('.');
  return idx >= 0 ? text.slice(idx + 1) : text;
}

/**
 * 取注解参数里的第一个字符串字面量（去引号），无字符串参数返回 null
 * （@GetMapping("/users") 与 @GetMapping(value = "/users", ...) 均命中；
 * @RequestMapping(method = RequestMethod.GET) 等无字符串参数时跳过）。
 * @param {object} ann - annotation 节点
 * @returns {string|null}
 */
function firstStringArg(ann) {
  const args = ann.namedChildren.find((c) => c.type === 'annotation_argument_list');
  if (!args) return null;
  let found = null;
  const walk = (n) => {
    if (found) return;
    if (n.type === 'string_literal') { found = n; return; }
    for (const c of n.namedChildren) walk(c);
  };
  walk(args);
  return found ? unquote(found.text) : null;
}

/**
 * 取声明节点的注解列表（modifiers 子节点下的 marker_annotation / annotation）。
 * @param {object} decl - class_declaration / method_declaration 等声明节点
 * @returns {object[]}
 */
function annotationsOf(decl) {
  const mods = decl.namedChildren.find((c) => c.type === 'modifiers');
  if (!mods) return [];
  return mods.namedChildren.filter((c) => c.type === 'annotation' || c.type === 'marker_annotation');
}

/**
 * 取声明节点名（class/interface/enum/method 的 name 字段，兜底首个 identifier）。
 * @param {object} decl - 声明节点
 * @returns {object|null}
 */
function declName(decl) {
  return decl.childForFieldName('name')
    || (decl.namedChildren.find((c) => c.type === 'identifier') || null);
}

/**
 * 对一棵 Java 语法树做事实提取（package / imports / 类名 / 控制器 / api 映射）。
 * @param {object} tree - tree-sitter Tree
 * @param {object} state - 累积状态（facts + 内部 Set）
 */
export function analyzeJavaTree(tree, state) {
  const root = tree.rootNode;

  const visit = (n) => {
    if (n.type === 'package_declaration') {
      const scoped = n.namedChildren.find((c) => c.type === 'scoped_identifier');
      if (scoped) state.packageNamesSet.add(scoped.text);
    } else if (n.type === 'import_declaration') {
      const named = n.namedChildren;
      const scoped = named.find((c) => c.type === 'scoped_identifier');
      if (scoped) {
        const hasWildcard = named.some((c) => c.type === 'asterisk');
        state.javaImportsSet.add(hasWildcard ? scoped.text + '.*' : scoped.text);
      }
    } else if (DECL_TYPES.has(n.type)) {
      const name = declName(n);
      const anns = annotationsOf(n);
      if (n.type === 'class_declaration' || n.type === 'interface_declaration' || n.type === 'enum_declaration') {
        if (name) state.classesSet.add(name.text);
        if (n.type === 'class_declaration') {
          // 控制器：仅 class_declaration 上带 @RestController / @Controller
          for (const ann of anns) {
            if (CONTROLLER_ANNOTATIONS.has(annotationName(ann)) && name) {
              state.controllersSet.add(name.text);
            }
          }
        }
      }
      // api 映射：类上/方法上（含构造器）的请求映射注解，取第一个字符串参数
      for (const ann of anns) {
        if (MAPPING_ANNOTATIONS.has(annotationName(ann))) {
          const p = firstStringArg(ann);
          if (p !== null && p !== '') state.apiMappingsSet.add(p);
        }
      }
    }
    for (const c of n.namedChildren) visit(c);
  };
  visit(root);
}

/**
 * Java 工程事实提取（adapter 入口）：文件计数 + 逐文件解析（语法错误 + 事实分析）+ 框架标志。
 * @param {object} ctx - { projectRoot, files, facts, state, language }
 */
export function extractJavaFacts({ projectRoot, files, facts, state }) {
  // 防御性默认（真实调用由 emptyFacts() 提供，冒烟模拟可能只给部分字段）
  facts.javaFiles = facts.javaFiles || 0;
  facts.syntaxErrors = facts.syntaxErrors || 0;
  if (!Array.isArray(facts.syntaxErrorFiles)) facts.syntaxErrorFiles = [];

  // 文件计数
  for (const rel of files) {
    if (extOf(rel) === 'java') facts.javaFiles += 1;
  }

  // 逐文件解析：语法错误统计 + 事实分析，每个 .java 文件只解析一次
  for (const rel of files) {
    if (extOf(rel) !== 'java') continue;
    let content;
    try {
      content = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
    } catch {
      continue; // 读不到的文件跳过
    }
    try {
      const parser = getJavaParser(); // 每次新建，避免旧树节点失效
      const tree = parser.parse(content);
      const errs = countSyntaxErrors(tree);
      if (errs > 0) {
        facts.syntaxErrors += errs;
        facts.syntaxErrorFiles.push(rel);
      }
      analyzeJavaTree(tree, state);
    } catch {
      // 单文件解析失败不影响整体
    }
  }

  // 集合去重 → facts 数组字段（注册中心还会再兜底去重一次）
  facts.javaImports = [...state.javaImportsSet];
  facts.packageNames = [...state.packageNamesSet];
  facts.javaClasses = [...state.classesSet];
  facts.controllers = [...state.controllersSet];
  facts.apiMappings = [...state.apiMappingsSet];

  // ---- 框架标志（依赖 + import 双源判定）----
  const deps = new Set(facts.dependencies || []);
  const imports = facts.javaImports;
  facts.hasSpringBoot = facts.hasSpringBoot
    || [...deps].some((d) => d.includes('spring-boot'))
    || imports.some((i) => i.includes('org.springframework.boot'));
  facts.hasSpringMvc = imports.some((i) => i.includes('org.springframework.web'));
  facts.hasMyBatis = [...deps].some((d) => d.toLowerCase().includes('mybatis'))
    || imports.some((i) => i.includes('org.apache.ibatis'));
  facts.hasJpa = imports.some((i) => i.includes('javax.persistence')
    || i.includes('jakarta.persistence') || i.includes('org.springframework.data.jpa'));
  facts.hasLombok = [...deps].some((d) => d.toLowerCase().includes('lombok'))
    || imports.some((i) => i.includes('lombok'));
}

/**
 * 依据事实推导 Java framework（spring-boot → spring → mybatis-spring → lombok → java）。
 * 规则：spring 优先于 mybatis/lombok，mybatis 优先于 lombok。
 * @param {object} facts - 已填写的 facts
 * @returns {string}
 */
export function detectJavaFramework(facts) {
  const deps = new Set(facts.dependencies || []);
  const imports = new Set(facts.javaImports || []);
  const depHas = (kw) => [...deps].some((d) => d.toLowerCase().includes(kw));
  const importHas = (sub) => [...imports].some((i) => i.includes(sub));

  if (facts.hasSpringBoot || depHas('spring-boot') || importHas('org.springframework.boot')) {
    return 'spring-boot';
  }
  if (facts.hasSpringMvc || depHas('spring') || importHas('org.springframework')) {
    return 'spring';
  }
  if (facts.hasMyBatis || depHas('mybatis') || importHas('org.apache.ibatis')) {
    return 'mybatis-spring';
  }
  if (facts.hasLombok || depHas('lombok') || importHas('lombok')) {
    return 'lombok';
  }
  if ((facts.javaFiles || 0) > 0) return 'java';
  return 'unknown';
}
