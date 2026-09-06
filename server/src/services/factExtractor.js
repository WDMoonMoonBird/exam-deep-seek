/**
 * factExtractor.js —— 工程事实提取器（多语言插件架构，P0-1）。
 *
 * 规则驱动评分升级的中间层：把学生工程从「原始文件内容」转成「统一事实 JSON」，
 * 供规则引擎按事实字段做确定性判断（如 { fact: 'routes', op: '>=', value: 3 }）。
 *
 * 处理管线：学生工程 → L0 过滤 → 核心目录 → extractFacts() → 事实 JSON → 规则引擎。
 *
 * 多语言插件架构（P0-1）：
 *   语言检测（扩展名统计 + 清单文件加权）→ 分派到对应 adapter：
 *     - factExtractors/javascript.js —— JS/TS/Vue（v1 逻辑迁入，行为不变）
 *     - factExtractors/java.js       —— Java（tree-sitter-java）
 *     - factExtractors/python.js     —— Python（tree-sitter-python）
 *   公共层（文件收集/语法错误/清单依赖/语言检测）见 factExtractors/common.js。
 *
 * 设计约定：
 *   - 纯函数式、同步实现，仅依赖 node:fs / node:path / tree-sitter 系（零其他依赖，不 import prisma）；
 *   - 每个文件只解析一次；单文件解析失败（读不到/解析异常）不影响整体，跳过该文件继续；
 *   - 全部路径相对工程根输出（syntaxErrorFiles 等）；
 *   - 返回 facts 对象所有字段齐全，缺省为 0 / [] / false / 'unknown'（Schema v2：v1 全保留 + 语言扩展字段）。
 *
 * 已知限制（v1 契约延续）：
 *   - .ts/.tsx 用 tree-sitter-javascript 解析，TS 类型注解会被 JS 文法视为语法错误计入 syntaxErrors；
 *   - createRouter({ routes }) 的简写形式仅支持同文件顶层 const 定义；
 *   - Java/Python 的事实维度以各 adapter 覆盖的字段为准（见 emptyFacts）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot } from './ruleExecutor.js';
import {
  collectSourceFiles, detectLanguage, emptyFacts, extractManifestDeps, extOf,
} from './factExtractors/common.js';
import { extractJsFacts, detectFramework as detectJsFramework } from './factExtractors/javascript.js';
import { extractJavaFacts, detectJavaFramework } from './factExtractors/java.js';
import { extractPythonFacts, detectPythonFramework } from './factExtractors/python.js';

// 与 ruleExecutor 同语义的工程根探测，直接复用
export { resolveProjectRoot };

// ==================== 语言分派 ====================

/** adapter 注册表：语言 → { extract, detectFramework, manifests } */
const ADAPTERS = {
  javascript: {
    extract: extractJsFacts,
    detectFramework: detectJsFramework,
    manifests: ['package.json'],
  },
  java: {
    extract: extractJavaFacts,
    detectFramework: detectJavaFramework,
    manifests: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  },
  python: {
    extract: extractPythonFacts,
    detectFramework: detectPythonFramework,
    manifests: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
  },
};

/**
 * 工程事实提取：把 rootDir 下的源码工程转成统一事实 JSON。
 *
 * 流程：
 *   1. resolveProjectRoot 解析工程根（唯一含源码子目录时下钻）；
 *   2. 语言检测（扩展名统计 + 清单文件加权）；
 *   3. 公共：清单依赖提取 + 源码文件收集；
 *   4. 按语言分派 adapter（语法错误计数 + 语言特定分析）；
 *   5. 语言特定框架判定，列表去重，返回 Schema v2 全字段 facts。
 *
 * 任何单文件失败（读不到/解析异常）只跳过该文件，绝不中断整体提取。
 *
 * @param {string} rootDir - 工程目录（解压根或工程根）
 * @returns {object} 事实 JSON（字段与 Schema v2 一致，缺省为 0/[]/false/'unknown'）
 */
export function extractFacts(rootDir) {
  const facts = emptyFacts();
  const projectRoot = resolveProjectRoot(rootDir);

  // ---- 语言检测 ----
  const files = collectSourceFiles(projectRoot);
  const language = detectLanguage(projectRoot, files);

  // ---- 公共：清单依赖（按语言对应清单；多清单并存时合并）----
  const adapter = ADAPTERS[language];
  if (adapter) {
    const deps = new Set();
    let hasManifest = false;
    for (const manifest of adapter.manifests) {
      if (fs.existsSync(path.join(projectRoot, manifest))) {
        hasManifest = true;
        for (const d of extractManifestDeps(projectRoot, manifest)) deps.add(d);
      }
    }
    facts.hasPackageJson = hasManifest && adapter.manifests.includes('package.json');
    facts.dependencies = [...deps].sort();
    // 清单布尔字段（Java/Python 判定用）
    facts.hasPomXml = fs.existsSync(path.join(projectRoot, 'pom.xml'));
    facts.hasGradle = fs.existsSync(path.join(projectRoot, 'build.gradle'))
      || fs.existsSync(path.join(projectRoot, 'build.gradle.kts'));
    facts.hasRequirementsTxt = fs.existsSync(path.join(projectRoot, 'requirements.txt'));
    facts.hasPyproject = fs.existsSync(path.join(projectRoot, 'pyproject.toml'))
      || fs.existsSync(path.join(projectRoot, 'setup.py'))
      || fs.existsSync(path.join(projectRoot, 'Pipfile'));
  }

  // ---- state（adapter 内部累积集合）----
  const state = {
    facts,
    importedModules: new Set(),
    importedNames: new Set(),
    usedRouterApis: new Set(),
    usedPiniaApis: new Set(),
    topLevelConsts: {}, // 内部累积：顶层 const 名 → array 节点（路由变量引用解析用，不进 facts）
    javaImportsSet: new Set(),
    packageNamesSet: new Set(),
    classesSet: new Set(),
    controllersSet: new Set(),
    apiMappingsSet: new Set(),
    pyImportsSet: new Set(),
    pyClassesSet: new Set(),
    pyFunctionsSet: new Set(),
    flaskRoutesSet: new Set(),
  };

  // ---- 按语言分派 adapter ----
  if (adapter) {
    adapter.extract({ projectRoot, files, facts, state, language });
  } else {
    // 未知语言：仍统计语法错误（无语言特定分析）
    for (const rel of files) {
      if (extOf(rel) === 'vue') facts.vueFiles += 1;
      else if (extOf(rel) === 'js' || extOf(rel) === 'mjs' || extOf(rel) === 'cjs'
        || extOf(rel) === 'jsx' || extOf(rel) === 'ts' || extOf(rel) === 'tsx') facts.jsFiles += 1;
    }
  }

  // ---- 列表去重（保序）----
  facts.syntaxErrorFiles = [...new Set(facts.syntaxErrorFiles)];
  facts.routePaths = [...new Set(facts.routePaths)];
  facts.stores = [...new Set(facts.stores)];
  facts.components = [...new Set(facts.components)];
  facts.entryFiles = [...new Set(facts.entryFiles)];
  facts.javaImports = [...new Set(facts.javaImports)];
  facts.packageNames = [...new Set(facts.packageNames)];
  facts.javaClasses = [...new Set(facts.javaClasses)];
  facts.controllers = [...new Set(facts.controllers)];
  facts.apiMappings = [...new Set(facts.apiMappings)];
  facts.pyImports = [...new Set(facts.pyImports)];
  facts.pyClasses = [...new Set(facts.pyClasses)];
  facts.pyFunctions = [...new Set(facts.pyFunctions)];
  facts.flaskRoutes = [...new Set(facts.flaskRoutes)];

  // ---- language / framework ----
  if (adapter) {
    // v1 契约：vue 主导工程 language 报 'vue'（v2 语言检测为 'javascript' 时按 vueFiles 修正）
    facts.language = language === 'javascript' && facts.vueFiles > 0 ? 'vue' : language;
    facts.framework = adapter.detectFramework(facts);
  } else {
    facts.language = facts.vueFiles > 0 ? 'vue' : (facts.jsFiles > 0 ? 'javascript' : 'unknown');
    facts.framework = detectJsFramework(facts);
  }

  return facts;
}
