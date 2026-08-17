/**
 * projectContextBuilder.js —— 实训题评分上下文构建器（纯函数模块，零副作用）。
 *
 * 职责：把「标准工程 / 学生提交」的磁盘目录转换为可供 LLM 评分使用的上下文，
 * 分三层（L0 → L1 → L2）：
 *   L0  buildFileTree + filterProjectFiles：收集文件、按白名单过滤、标记折叠项；
 *   L1  buildFileTreeText：文件树文本（第一轮 prompt 用）；
 *   L2  extractSkeleton / truncateToBudget：超预算时的骨架提取与按预算截断。
 *
 * 铁律：本模块为纯函数模块——只依赖 node:fs / node:path 与 @babel/parser，
 * 不得 import 任何数据库 / prisma / HTTP 相关模块。
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

// ==================== 常量定义 ====================

/**
 * 全语言白名单（扩展名，小写）。
 * 前端：js ts jsx tsx vue svelte html css scss sass less
 * 后端：java py go c cpp h hpp cc cxx cs rb php rs kt kts swift m mm
 * 脚本/数据：sh bash zsh ps1 sql
 * 配置（仅小文件）：json yml yaml xml toml ini properties env gradle
 * @type {Set<string>}
 */
export const SOURCE_WHITELIST = new Set([
  // 前端
  'js', 'ts', 'jsx', 'tsx', 'vue', 'svelte', 'html', 'css', 'scss', 'sass', 'less',
  // 后端
  'java', 'py', 'go', 'c', 'cpp', 'h', 'hpp', 'cc', 'cxx', 'cs', 'rb', 'php', 'rs',
  'kt', 'kts', 'swift', 'm', 'mm',
  // 脚本/数据
  'sh', 'bash', 'zsh', 'ps1', 'sql',
  // 配置（仅小文件）
  'json', 'yml', 'yaml', 'xml', 'toml', 'ini', 'properties', 'env', 'gradle',
]);

/**
 * 无扩展名 / 特殊命名的配置文件（ext 为空但 basename 命中白名单，按配置小文件规则处理）。
 * @type {Set<string>}
 */
export const SPECIAL_CONFIG_NAMES = new Set([
  'Dockerfile', 'Makefile', 'Jenkinsfile', 'Gemfile', 'Cargo.toml', 'go.mod',
]);

/**
 * 配置类扩展名（受 64KB 小文件限制）。
 * @type {Set<string>}
 */
const CONFIG_EXTS = new Set([
  'json', 'yml', 'yaml', 'xml', 'toml', 'ini', 'properties', 'env', 'gradle',
]);

/**
 * 目录权重表：首段目录名 → 权重。
 * 高价值目录 3/2；测试/文档/资源类 0；其他默认 1。
 * @type {Object<string, number>}
 */
export const DIR_WEIGHTS = {
  // 高价值（3）
  src: 3,
  app: 3,
  lib: 3,
  main: 3,
  // 中价值（2）
  components: 2,
  api: 2,
  routes: 2,
  services: 2,
  utils: 2,
  views: 2,
  pages: 2,
  // 低价值（0）
  tests: 0,
  test: 0,
  docs: 0,
  assets: 0,
  static: 0,
  public: 0,
  dist: 0,
  images: 0,
  fonts: 0,
};

/**
 * Token 预算上限（默认 120000）。
 * @type {number}
 */
export const BUDGET_TOKENS = 120000;

/** 配置类文件大小上限：64KB，超过直接丢弃 */
const MAX_CONFIG_SIZE = 64 * 1024;

/** 源码类文件大小上限：256KB，超过保留但标记 fold（不进正文） */
const MAX_SOURCE_SIZE = 256 * 1024;

/** 未知扩展名文件的头部探测字节数：2KB */
const UNKNOWN_HEAD_BYTES = 2048;

/** 未知扩展名文件的源码特征正则：命中任一即视为源码文本 */
const SOURCE_FEATURE_RE = /[{}(=;]|function|class|def|import|public/;

/** 递归遍历时跳过的目录名 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'target',
]);

/** JS 家族扩展名：走 @babel/parser AST 骨架提取 */
const JS_FAMILY = new Set(['js', 'jsx', 'ts', 'tsx', 'vue']);

/** 正则兜底的函数声明行模式（够用即可，不过度复杂） */
const FUNC_LINE_RE = /(?:public|private|protected|static|final|abstract|async|export|def|function|func|fn|fun)(?:\s+[\w$]+)*\s+[A-Za-z_$][\w$]*\s*\(/;

/** 正则兜底的类声明行模式 */
const CLASS_LINE_RE = /(?:public\s+|abstract\s+|final\s+|export\s+)?(?:class|interface|trait)\s+[A-Za-z_$][\w$]*/;

/** Go 方法接收者模式：func (r Receiver) Serve(...)（BUG-011） */
const GO_METHOD_RE = /func\s*\([^)]*\)\s*[A-Za-z_$][\w$]*\s*\(/;

// ==================== 内部工具 ====================

/**
 * 提取文件扩展名（小写，无扩展名返回空串）。
 * @param {string} name - 文件名
 * @returns {string}
 */
function extOf(name) {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

/**
 * 计算文件权重（DIR_WEIGHTS 规则）：
 *   - main/index 开头的文件名 → 3（最高优先级）；
 *   - 无目录（根文件）→ 3；
 *   - 路径首段目录名精确命中 DIR_WEIGHTS → 对应值；
 *   - 首段目录名以 main 开头 → 3；
 *   - 其他 → 1。
 * @param {string} relPath - 相对路径（可为空串表示根文件）
 * @param {string} name - 文件名
 * @returns {number}
 */
export function computeWeight(relPath, name, isDir = false) {
  if (/^(main|index)/.test(name || '')) return 3;
  const rel = String(relPath || '');
  // 根文件（无目录分段）→ 3；目录条目自身即首段，仍需参与 DIR_WEIGHTS 匹配
  if (!isDir && !rel.includes('/')) return 3;
  const firstSeg = rel.split('/')[0];
  if (!firstSeg) return 3;
  if (Object.prototype.hasOwnProperty.call(DIR_WEIGHTS, firstSeg)) return DIR_WEIGHTS[firstSeg];
  if (firstSeg.startsWith('main')) return 3;
  return 1;
}

/**
 * 判断是否配置类文件（扩展名命中配置表，或 basename 命中特殊配置文件名单）。
 * @param {string} name - 文件名
 * @param {string} ext - 扩展名
 * @returns {boolean}
 */
function isConfigFile(name, ext) {
  return CONFIG_EXTS.has(ext) || SPECIAL_CONFIG_NAMES.has(name);
}

// ==================== L0：文件树构建 ====================

/**
 * 递归构建文件树（扁平数组，前序 DFS，父目录先于子项）。
 *
 * 规则：
 *   - 跳过 node_modules/.git/dist/build/.idea/.vscode/target 目录与隐藏文件（以 . 开头）；
 *   - 目录也出现在列表中（dir=true），size 为该目录下全部文件大小之和；
 *   - 排序：目录在前，同级按名称（字节序）排序。
 *
 * @param {string} dir - 绝对目录路径
 * @returns {Array<{path: string, name: string, dir: boolean, size: number, ext: string}>}
 *   path 为相对路径（空串根目录下的条目直接用文件名）。
 */
export function buildFileTree(dir) {
  if (!dir || typeof dir !== 'string') return [];
  let stat = null;
  try {
    stat = fs.statSync(dir);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];

  const walk = (abs, rel) => {
    let entries = [];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return { items: [], size: 0 };
    }
    entries = entries.filter((e) => {
      if (e.name.startsWith('.')) return false; // 隐藏文件
      if (e.isDirectory() && SKIP_DIRS.has(e.name)) return false;
      return true;
    });
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });

    const items = [];
    let total = 0;
    for (const e of entries) {
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        const sub = walk(childAbs, childRel);
        items.push({ path: childRel, name: e.name, dir: true, size: sub.size, ext: '' });
        items.push(...sub.items);
        total += sub.size;
      } else {
        let size = 0;
        try {
          size = fs.statSync(childAbs).size;
        } catch {
          size = 0;
        }
        items.push({ path: childRel, name: e.name, dir: false, size, ext: extOf(e.name) });
        total += size;
      }
    }
    return { items, size: total };
  };

  return walk(dir, '').items;
}

// ==================== L0：白名单过滤 ====================

/**
 * L0 过滤：白名单 + 大小阈值 + 未知扩展名内容探测。
 *
 * 规则：
 *   a) 白名单扩展名命中 → 保留；但配置类文件（含无扩展名配置文件）size > 64KB → 丢弃；
 *   b) 源码类白名单文件 size > 256KB → 保留但标记 fold=true（折叠占位，不进正文）；
 *   c) 未知扩展名：读文件头 2KB，UTF-8 可读文本且命中源码特征正则 → 保留，否则丢弃；
 *   d) 目录节点无条件保留（用于文件树展示，不计入过滤）。
 *
 * @param {Array<{path: string, name: string, dir: boolean, size: number, ext: string}>} fileList
 *   buildFileTree 的输出
 * @param {string} [rootDir] - 扫描根目录绝对路径；读取未知扩展名文件头需要，
 *   缺省时未知扩展名文件一律丢弃（无法验证内容）
 * @returns {{kept: Array<{path: string, name: string, size: number, ext: string, fold: boolean, weight: number, dir?: boolean}>, dropped: Array<{path: string, name: string, size: number, ext: string, reason: string}>}}
 */
export function filterProjectFiles(fileList, rootDir) {
  const kept = [];
  const dropped = [];

  for (const f of fileList || []) {
    if (!f || typeof f !== 'object') continue;
    const { path: relPath, name, dir, size, ext } = f;
    const base = {
      path: relPath || name || '',
      name: name || '',
      size: typeof size === 'number' ? size : 0,
      ext: ext || '',
    };
    if (dir) {
      // 目录节点保留（用于文件树展示，不计入过滤）
      kept.push({
        ...base,
        dir: true,
        fold: false,
        weight: computeWeight(relPath || '', name || '', true),
      });
      continue;
    }

    const whitelisted = SOURCE_WHITELIST.has(ext) || SPECIAL_CONFIG_NAMES.has(name);
    if (whitelisted) {
      if (isConfigFile(name, ext)) {
        if (size > MAX_CONFIG_SIZE) {
          dropped.push({ ...base, reason: 'config-too-large' });
          continue;
        }
      } else if (size > MAX_SOURCE_SIZE) {
        kept.push({
          ...base,
          dir: false,
          fold: true,
          weight: computeWeight(relPath || '', name || '', false),
        });
        continue;
      }
      kept.push({
        ...base,
        dir: false,
        fold: false,
        weight: computeWeight(relPath || '', name || '', false),
      });
      continue;
    }

    // 未知扩展名：读文件头 2KB 探测
    if (!rootDir) {
      dropped.push({ ...base, reason: 'unknown-no-rootdir' });
      continue;
    }
    let head = '';
    try {
      const absPath = path.join(rootDir, relPath || name || '');
      const fd = fs.openSync(absPath, 'r');
      try {
        const buf = Buffer.alloc(UNKNOWN_HEAD_BYTES);
        const read = fs.readSync(fd, buf, 0, UNKNOWN_HEAD_BYTES, 0);
        head = buf.slice(0, read).toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      head = '';
    }
    const isReadableText = head.indexOf('\u0000') === -1 && head.indexOf('\uFFFD') === -1;
    if (isReadableText && SOURCE_FEATURE_RE.test(head)) {
      kept.push({
        ...base,
        dir: false,
        fold: false,
        weight: computeWeight(relPath || '', name || '', false),
      });
    } else {
      dropped.push({ ...base, reason: 'unknown-not-source' });
    }
  }

  return { kept, dropped };
}

// ==================== L1：文件树文本序列化 ====================

/**
 * 将扁平文件列表构建为嵌套树。
 * @param {Array<{path: string, name: string, dir: boolean, size: number}>} fileList
 * @returns {{name: string, path: string, dir: boolean, size: number, children: Array<object>}}
 */
function buildNested(fileList) {
  const root = { name: '.', path: '', dir: true, size: 0, children: [] };
  const map = new Map();
  map.set('', root);
  for (const f of fileList || []) {
    const relPath = f.path || f.name || '';
    const node = { ...f, children: [] };
    const idx = relPath.lastIndexOf('/');
    const parentPath = idx > 0 ? relPath.slice(0, idx) : '';
    const parent = map.get(parentPath) || root;
    parent.children.push(node);
    map.set(relPath, node);
  }
  return root;
}

/**
 * 递归渲染树文本（tree 风格）。
 * @param {Array<object>} children - 子节点
 * @param {string} prefix - 行首缩进/连字符前缀
 * @param {boolean} withSizes - 是否输出 [大小KB]
 * @param {Array<string>} lines - 输出收集数组
 */
function renderTree(children, prefix, withSizes, lines) {
  const sorted = [...children].sort((a, b) => {
    const ad = a.dir === true;
    const bd = b.dir === true;
    if (ad !== bd) return ad ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  for (let i = 0; i < sorted.length; i += 1) {
    const child = sorted[i];
    const isLast = i === sorted.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const isDir = child.dir === true;
    const weight = typeof child.weight === 'number'
      ? child.weight
      : computeWeight(child.path || '', child.name || '', child.dir === true);
    // BUG-007：文件名可能含换行/控制字符（注入面），转义为字面量再入 prompt
    const safeName = String(child.name || '').replace(/[\r\n\t]+/g, ' ').trim();
    let label = (isDir ? safeName + '/' : safeName);
    if (withSizes) {
      label += ' [' + (child.size / 1024).toFixed(1) + 'KB]';
    }
    label += ' (' + weight + ')';
    lines.push(prefix + connector + label);
    if (child.children && child.children.length > 0) {
      renderTree(child.children, prefix + (isLast ? '    ' : '│   '), withSizes, lines);
    }
  }
}

/**
 * 文件树文本序列化（类似 tree 命令，供 L1 第一轮 prompt 使用）。
 * 每行格式：目录/文件名 [大小KB] (权重)；withSizes=false 时省略 [大小KB]。
 * @param {Array<{path: string, name: string, dir: boolean, size: number, weight?: number}>} fileList
 *   扁平文件列表（buildFileTree 或 filterProjectFiles 的 kept）
 * @param {{withSizes?: boolean}} [options]
 * @returns {string}
 */
export function buildFileTreeText(fileList, { withSizes = true } = {}) {
  if (!Array.isArray(fileList) || fileList.length === 0) return '';
  const root = buildNested(fileList);
  const lines = [];
  renderTree(root.children, '', withSizes, lines);
  return lines.join('\n');
}

// ==================== L2：骨架提取 ====================

/**
 * 将 AST 节点参数列表渲染为参数名串。
 * @param {Array<object>} params - babel AST params
 * @returns {string}
 */
function renderParams(params) {
  if (!Array.isArray(params)) return '';
  return params.map((p) => {
    if (!p || typeof p !== 'object') return 'arg';
    switch (p.type) {
      case 'Identifier':
        return p.name || 'arg';
      case 'AssignmentPattern':
        return (p.left && p.left.name) || 'arg';
      case 'RestElement':
        return '...' + ((p.argument && p.argument.name) || 'arg');
      case 'ObjectPattern':
        return '{...}';
      case 'ArrayPattern':
        return '[...]';
      default:
        return 'arg';
    }
  }).join(', ');
}

/**
 * 注释节点转骨架行（每行截断 120 字符）。
 * @param {Array<object>} comments - babel AST comments
 * @param {string} source - 原始源码（未使用，保留参数位）
 * @returns {Array<string>}
 */
function commentsToLines(comments) {
  if (!Array.isArray(comments)) return [];
  const lines = [];
  for (const c of comments) {
    if (!c || typeof c.value !== 'string') continue;
    const raw = c.value.replace(/^[\s*]+/, '').replace(/[\s*]+$/, '');
    const parts = raw.split('\n');
    for (const part of parts) {
      const line = (part || '').trim();
      if (line) lines.push('// ' + line.slice(0, 120));
    }
  }
  return lines;
}

/**
 * 通用 AST 遍历：收集骨架行到 out（WeakSet 防环）。
 * @param {object} node - AST 节点
 * @param {string} source - 原始源码
 * @param {Set<string>} out - 骨架行收集（去重）
 * @param {WeakSet<object>} seen - 防环
 */
function collectFromAst(node, source, out, seen) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type !== 'string') return;
  if (seen.has(node)) return;
  seen.add(node);

  switch (node.type) {
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportDefaultDeclaration':
    case 'ExportAllDeclaration': {
      const start = typeof node.start === 'number' ? node.start : -1;
      const end = typeof node.end === 'number' ? node.end : -1;
      if (start >= 0 && end > start) {
        const firstLine = source.slice(start, end).split('\n')[0];
        if (firstLine) out.add(firstLine.slice(0, 100));
      }
      break;
    }
    case 'FunctionDeclaration': {
      const name = node.id && node.id.name ? node.id.name : 'anonymous';
      out.add('function ' + name + '(' + renderParams(node.params) + ')');
      break;
    }
    case 'ClassDeclaration': {
      const name = node.id && node.id.name ? node.id.name : 'Anonymous';
      out.add('class ' + name);
      break;
    }
    case 'VariableDeclarator': {
      const init = node.init;
      if (init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) {
        const idName = node.id && node.id.type === 'Identifier' ? node.id.name : 'anonymous';
        out.add('const ' + idName + ' = (' + renderParams(init.params) + ') =>');
      }
      break;
    }
    case 'ObjectMethod': {
      const keyName = node.key && typeof node.key.name === 'string' ? node.key.name : 'method';
      out.add(keyName + '(' + renderParams(node.params) + ')');
      break;
    }
    case 'ObjectProperty': {
      const value = node.value;
      if (value && (value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression')) {
        const keyName = node.key && typeof node.key.name === 'string' ? node.key.name : 'prop';
        out.add(keyName + ': (' + renderParams(value.params) + ') =>');
      }
      break;
    }
    case 'ClassMethod':
    case 'ClassPrivateMethod': {
      const keyName = node.key && typeof node.key.name === 'string' ? node.key.name : 'method';
      out.add(keyName + '(' + renderParams(node.params) + ')');
      break;
    }
    case 'ClassProperty':
    case 'ClassPrivateProperty': {
      const keyName = node.key && typeof node.key.name === 'string' ? node.key.name : 'prop';
      out.add(keyName);
      break;
    }
    default:
      break;
  }

  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && typeof item.type === 'string') {
          collectFromAst(item, source, out, seen);
        }
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      collectFromAst(value, source, out, seen);
    }
  }
}

/**
 * 行首注释化兜底（解析失败时）：每行 // 前缀，截断 100 字符。
 * @param {string} code - 原始内容
 * @returns {string}
 */
function commentOut(code) {
  return String(code || '').split('\n').map((line) => '// ' + line.slice(0, 100)).join('\n');
}

/**
 * 从 vue 内容中提取 <script> 部分；没有 script 块返回空串。
 * @param {string} code - vue 文件内容
 * @returns {string}
 */
function extractVueScript(code) {
  const m = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(String(code || ''));
  return m ? m[1] : '';
}

/**
 * 正则兜底：从非 JS 语言源码提取函数/类声明行（每行截断 120 字符）。
 * @param {string} code - 文件内容
 * @returns {Array<string>}
 */
function regexSkeleton(code) {
  const out = [];
  const lines = String(code || '').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (FUNC_LINE_RE.test(line) || CLASS_LINE_RE.test(line) || GO_METHOD_RE.test(line)) {
      out.push(line.slice(0, 120));
    }
  }
  return out;
}

/**
 * L2 骨架提取（仅超预算兜底用，绝不抛错）。
 *
 * JS 家族（js/ts/jsx/tsx/vue）：
 *   - 用 @babel/parser 解析（vue 先提取 <script> 部分）；
 *   - 提取：注释（每行截断 120 字符）、import/export 语句首行（截断 100 字符）、
 *     函数/类声明签名、对象方法/类方法/类属性名；
 *   - 解析失败 → 返回原始内容逐行注释化（每行 // 前缀截断 100 字符）。
 * 其他语言（java/py/go 等）：正则兜底提取函数声明行与类声明行；
 *   提取为空时同样回退到逐行注释化。
 *
 * @param {string} fileContent - 文件内容
 * @param {string} ext - 文件扩展名（小写）
 * @returns {string} 去重后的骨架文本
 */
export function extractSkeleton(fileContent, ext) {
  const code = String(fileContent || '');
  const extLower = String(ext || '').toLowerCase();
  const out = new Set();

  if (JS_FAMILY.has(extLower)) {
    try {
      let jsCode = code;
      if (extLower === 'vue') {
        jsCode = extractVueScript(code);
        if (!jsCode.trim()) return commentOut(code);
      }
      const plugins = [];
      if (extLower === 'ts' || extLower === 'tsx') plugins.push('typescript');
      if (extLower === 'tsx' || extLower === 'jsx' || extLower === 'vue') plugins.push('jsx');
      const ast = parse(jsCode, {
        sourceType: 'unambiguous',
        errorRecovery: true,
        plugins,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
      });
      const seen = new WeakSet();
      collectFromAst(ast, jsCode, out, seen);
      // 注释独立处理
      if (Array.isArray(ast.comments)) {
        for (const c of commentsToLines(ast.comments)) out.add(c);
      }
    } catch {
      return commentOut(code);
    }
  } else {
    const matched = regexSkeleton(code);
    if (matched.length === 0) return commentOut(code);
    for (const line of matched) out.add(line);
  }

  return [...out].join('\n');
}

// ==================== Token 估算与预算截断 ====================

/**
 * Token 估算（近似）：中文字符按 1.5 字符/token，其余按 3.5 字符/token。
 * @param {string} text - 文本
 * @returns {number} 估算 token 数（向上取整）
 */
export function estimateTokens(text) {
  const s = String(text ?? '');
  if (s.length === 0) return 0;
  const chineseCount = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherCount = s.length - chineseCount;
  return Math.ceil(chineseCount / 1.5 + otherCount / 3.5);
}

/**
 * 预算截断：超过预算时按比例截断到 80% 预算，
 * 末尾追加「\n\n⚠️ 以下内容因预算限制被截断」标记。
 * @param {string} text - 原始文本
 * @param {number} budget - token 预算
 * @returns {{text: string, truncated: boolean}}
 */
export function truncateToBudget(text, budget) {
  const s = String(text ?? '');
  if (s.length === 0) return { text: '', truncated: false };
  const tokens = estimateTokens(s);
  if (tokens <= budget) return { text: s, truncated: false };
  const ratio = (budget * 0.8) / tokens;
  const cut = Math.max(0, Math.floor(s.length * Math.min(1, ratio)));
  const marker = '\n\n⚠️ 以下内容因预算限制被截断';
  return { text: s.slice(0, cut) + marker, truncated: true };
}
