/**
 * factExtractors/common.js —— 多语言事实提取公共层（P0-1）。
 *
 * 提供所有语言 adapter 共享的工具与公共事实字段：
 *   - 源码文件收集（按语言扩展名白名单）
 *   - 语法错误计数（tree-sitter 通用）
 *   - 字符串字面量去引号
 *   - 清单文件（package.json / pom.xml / build.gradle / requirements.txt / pyproject.toml）依赖提取
 *   - 入口文件探测
 *   - 空 facts 骨架（Schema v2：v1 字段全保留 + 语言扩展字段缺省）
 *
 * 设计约定（与 factExtractor 一致）：
 *   - 纯函数式、同步，零外部依赖（仅 node:fs / node:path）；
 *   - 任何失败只跳过该文件，绝不中断整体提取。
 */

import fs from 'node:fs';
import path from 'node:path';

/** 递归遍历时跳过的目录名（第三方依赖/构建产物/隐藏项），与 ruleExecutor 保持一致 */
export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'target']);

/** 源码扩展名 → 语言（P0-1：JS 系 + Vue + Java + Python） */
export const EXT_LANGUAGE = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'javascript', tsx: 'javascript', vue: 'vue',
  java: 'java',
  py: 'python',
};

/** 全部参与事实提取的源码扩展名 */
export const SOURCE_EXTS = new Set(Object.keys(EXT_LANGUAGE));

/** 清单文件 → 语言（目录级判定用；文件存在即视为该语言工程） */
export const MANIFEST_LANGUAGE = {
  'package.json': 'javascript',
  'pom.xml': 'java',
  'build.gradle': 'java',
  'build.gradle.kts': 'java',
  'requirements.txt': 'python',
  'pyproject.toml': 'python',
  'setup.py': 'python',
  'Pipfile': 'python',
};

/**
 * 生成全缺省 facts 骨架（Schema v2：v1 字段 + 语言扩展字段，缺省为 0/[]/false/'unknown'）。
 * @returns {object}
 */
export function emptyFacts() {
  return {
    // ---- v1 公共字段（保留，JS 语义不变）----
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
    // ---- v2 Java 扩展字段 ----
    javaFiles: 0,
    javaClasses: [],
    javaImports: [],
    packageNames: [],
    hasSpringBoot: false,
    hasSpringMvc: false,
    hasMyBatis: false,
    hasJpa: false,
    hasLombok: false,
    controllers: [],
    apiMappings: [],
    hasPomXml: false,
    hasGradle: false,
    // ---- v2 Python 扩展字段 ----
    pyFiles: 0,
    pyClasses: [],
    pyFunctions: [],
    pyImports: [],
    hasFlask: false,
    hasDjango: false,
    hasFastAPI: false,
    hasPydantic: false,
    flaskRoutes: [],
    hasRequirementsTxt: false,
    hasPyproject: false,
  };
}

/**
 * 取扩展名（小写，含点前全部；无扩展名返回 ''）。
 * @param {string} relPath - 相对路径
 * @returns {string}
 */
export function extOf(relPath) {
  const base = path.basename(relPath);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : '';
}

/**
 * 递归收集工程内全部源码文件（相对工程根的 posix 路径），跳过隐藏项与 SKIP_DIRS。
 * @param {string} projectRoot - 工程根（绝对路径）
 * @returns {string[]}
 */
export function collectSourceFiles(projectRoot) {
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
 * 统计一棵树的语法错误节点数（ERROR + isMissing）。
 * @param {object} tree - tree-sitter Tree
 * @returns {number}
 */
export function countSyntaxErrors(tree) {
  let count = 0;
  const visit = (n) => {
    if (n.type === 'ERROR' || n.isMissing) count += 1;
    for (const c of n.namedChildren) visit(c);
  };
  visit(tree.rootNode);
  return count;
}

/**
 * 去掉字符串字面量的外层引号（单/双/反引号）。
 * @param {string} text - 源码里的字符串字面量文本
 * @returns {string}
 */
export function unquote(text) {
  const s = String(text);
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    const BT = '`'; // 反引号
    if ((first === "'" && last === "'") || (first === '"' && last === '"') || (first === BT && last === BT)) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * 按清单文件提取依赖名（package.json 的 dependencies+devDependencies keys；
 * requirements.txt 的包名行；pyproject.toml 的 [project] dependencies 粗提取）。
 * 失败返回空数组，绝不抛错。
 * @param {string} projectRoot - 工程根
 * @param {string} manifest - 清单文件名（package.json / requirements.txt / pyproject.toml / pom.xml）
 * @returns {string[]}
 */
export function extractManifestDeps(projectRoot, manifest) {
  const p = path.join(projectRoot, manifest);
  if (!fs.existsSync(p)) return [];
  try {
    if (manifest === 'package.json') {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      const deps = new Set();
      for (const section of ['dependencies', 'devDependencies']) {
        const obj = pkg[section];
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const key of Object.keys(obj)) deps.add(key);
        }
      }
      return [...deps].sort();
    }
    if (manifest === 'requirements.txt') {
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      const deps = new Set();
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#') || t.startsWith('-')) continue;
        // 支持 name==1.0 / name>=1.0 / name 形式
        const m = t.match(/^([A-Za-z0-9_.-]+)/);
        if (m) deps.add(m[1].toLowerCase());
      }
      return [...deps].sort();
    }
    if (manifest === 'pyproject.toml') {
      const text = fs.readFileSync(p, 'utf8');
      const deps = new Set();
      const inDeps = /\[project\.dependencies\]/.test(text);
      if (inDeps) {
        for (const line of text.split(/\r?\n/)) {
          const m = line.trim().match(/^["']?([A-Za-z0-9_.-]+)/);
          if (m && !m[1].startsWith('[') && !m[1].startsWith('#')) deps.add(m[1].toLowerCase());
        }
      }
      return [...deps].sort();
    }
    if (manifest === 'pom.xml') {
      // 粗提取：<artifactId>xxx</artifactId>（排除 groupId/父 pom 常见项）
      const text = fs.readFileSync(p, 'utf8');
      const deps = new Set();
      const re = /<artifactId>([^<]+)<\/artifactId>/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        deps.add(m[1]);
      }
      return [...deps].sort();
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * 检测工程语言：按源码扩展名统计（多数优先）；平局时按清单文件加权。
 * @param {string} projectRoot - 工程根
 * @param {string[]} files - collectSourceFiles 输出
 * @returns {'javascript'|'java'|'python'|'unknown'}
 */
export function detectLanguage(projectRoot, files) {
  const counts = { javascript: 0, vue: 0, java: 0, python: 0 };
  for (const rel of files) {
    const lang = EXT_LANGUAGE[extOf(rel)];
    if (lang === 'vue') counts.javascript += 1; // vue 归 JS 系
    else if (lang) counts[lang] += 1;
  }
  // 清单文件加权（文件数平局/为零时决定语言）
  for (const [manifest, lang] of Object.entries(MANIFEST_LANGUAGE)) {
    if (fs.existsSync(path.join(projectRoot, manifest))) {
      counts[lang] += 1;
    }
  }
  let best = 'unknown';
  let bestN = 0;
  for (const [lang, n] of Object.entries(counts)) {
    if (n > bestN) { best = lang; bestN = n; }
  }
  return best;
}

/* ==================== 工程根探测（自 ruleExecutor.js 逐字搬移 · round 2 F-1） ====================
   搬移原因：ruleExecutor.js 与 factExtractor.js 曾互相 import（全仓唯一 SCC）。把「工程根探测」
   下沉到本模块后两条边都变成指向本模块的单向边，环消失。代码为逐字复刻，仅两处重命名：
     · SOURCE_EXTS  → ROOT_PROBE_EXTS     本模块已有的 SOURCE_EXTS 是 9 项源码白名单（语义不同）；
                                          探测必须沿用 ruleExecutor 的宽白名单，否则只含 .go/.html
                                          的外层包不再下钻 → 工程根解析行为改变。
     · collectFiles → collectAllFiles     本模块已有的 collectSourceFiles 只收源码、返回相对 posix
                                          路径；collectAllFiles 收全部普通文件、返回绝对路径。
                                          二者语义与返回类型均不同，不可互换（否则丢失 package.json 信号）。
   SKIP_DIRS 与本模块既有定义逐字相同，直接复用。 */

/** 工程根探测用扩展名白名单（逐字复刻自 ruleExecutor.js 的 SOURCE_EXTS） */
export const ROOT_PROBE_EXTS = new Set([
  // 前端
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'html', 'css', 'scss', 'sass', 'less',
  // 后端
  'java', 'py', 'go', 'c', 'cpp', 'h', 'hpp', 'cc', 'cxx', 'cs', 'rb', 'php', 'rs', 'kt', 'swift',
  // 脚本/数据/配置
  'sh', 'bash', 'sql', 'json', 'yml', 'yaml', 'xml', 'toml', 'ini',
]);

/**
 * 递归收集目录下全部普通文件（跳过隐藏项与 SKIP_DIRS）。
 * @param {string} dir - 绝对目录路径
 * @returns {string[]} 绝对路径列表
 */
export function collectAllFiles(dir) {
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
      } else if (e.isFile()) {
        out.push(childAbs);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * 工程根探测：rootDir 为解压根；若 rootDir 下只有一个子目录、且该子目录包含源码文件
 * （扩展名命中 ROOT_PROBE_EXTS 或含 package.json），返回该子目录；否则返回 rootDir。
 *
 * 供路径解析使用 —— 学生压缩包常见「外层解压根包一个工程目录」结构，规则里的路径
 * （如 package.json）是相对工程目录写的。
 *
 * @param {string} rootDir - 解压根
 * @returns {string} 工程根（绝对路径或原值）
 */
export function resolveProjectRoot(rootDir) {
  if (!rootDir || typeof rootDir !== 'string') return rootDir;
  const root = path.resolve(rootDir);
  let stat = null;
  try {
    stat = fs.statSync(root);
  } catch {
    return rootDir;
  }
  if (!stat.isDirectory()) return rootDir;

  let subdirs = [];
  try {
    subdirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .map((e) => e.name);
  } catch {
    return rootDir;
  }
  if (subdirs.length !== 1) return rootDir;

  // P0-1：清单文件是「工程根」的强信号 —— rootDir 自身含清单（package.json/pom.xml/
  // build.gradle/requirements.txt/pyproject.toml 等）时，即使只有唯一源码子目录也**不**下钻。
  // 否则典型 Java 工程（pom.xml + src/）会被误下钻到 src/，清单路径全部失配
  // （JS 工程 package.json + src/ 同理，属既有潜在缺陷一并修复）。
  const MANIFEST_NAMES = ['package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts',
    'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'];
  const hasRootManifest = MANIFEST_NAMES.some((name) => {
    try { return fs.statSync(path.join(root, name)).isFile(); } catch { return false; }
  });
  if (hasRootManifest) return rootDir;

  const candidate = path.join(root, subdirs[0]);
  const hasSource = collectAllFiles(candidate).some((f) => {
    const name = path.basename(f);
    return name === 'package.json' || ROOT_PROBE_EXTS.has(extOf(f));
  });
  return hasSource ? candidate : rootDir;
}
