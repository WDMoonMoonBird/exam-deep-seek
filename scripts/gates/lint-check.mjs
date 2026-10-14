#!/usr/bin/env node
/**
 * 常驻静态检查门禁（lint-check）—— 补上 node --check / vite build / 既有 5 道门禁都拦不住的一类缺陷。
 *
 * 为什么需要它（2026-10-11 GodFile 拆分连续踩到、而机器本可拦住的四类缺陷）：
 *   ① 自由标识符（引用但未声明 / 未 import / 未注入）：学生答题页按键盘即抛 ReferenceError，
 *      潜伏 3 步 + 2 次提交才被自建扫描器抓到；
 *   ② 未绑定名进入 return 面：node --check 与 vite build 都放行；
 *   ③ 相对 import 指向已被删除的模块：拆分后残留 3 处；
 *   ④ 未使用的声明 / 拼写错的引用：全靠人工阅读发现。
 *
 * 规则（6 条 + 1 条防御性附加项，全部离线 AST 实现，见 scripts/gates/baselines/lint-gate-report.md）：
 *   no-undef              引用但未声明 / 未 import / 未注入的标识符【本门禁的核心】
 *   no-unused-vars        声明但从未使用（export 的声明不算未使用；下划线前缀豁免）
 *   no-unresolved-import  相对 import/require 的目标文件不存在（覆盖 export { x } from './y'）
 *   no-dupe-keys          对象字面量重复键（getter/setter 配对除外）
 *   no-redeclare          同一作用域重复声明
 *   no-const-assign       对 const 绑定 / import 绑定赋值（ESM 下均为 TypeError）
 *   parse-error【附加】    文件解析失败 —— 该文件所有规则都会被跳过，必须显式可见
 *
 * 扫描面：client/src（.js + .vue）+ server/src（.js）。
 *   .vue 只查 <script> / <script setup> 脚本块，**模板不查**（需 vue 专用规则，超出本门禁范围）。
 *   不含 tests/、node_modules、client/dist、docs/。
 *
 * ★ 基线对比模式（沿用 arch-metrics.mjs 的既有范式）：
 *   本仓 3.4 万行代码从未跑过 lint，一次性清零不现实，且大面积改写 = 行为变更风险。
 *   故：**已存在的违规只统计不阻断；只有出现基线之外的新违规才 exit 1**。
 *   比对键 = file + rule + symbol，并按“出现次数”比对：
 *     - 行号漂移（同一处违规因上方增删行而挪位）不算新违规；
 *     - 同类违规净增（例如某文件多出一处 no-undef:foo）才算。
 *   基线文件：scripts/gates/baselines/lint-baseline.json（由 --update-baseline 生成/刷新）。
 *
 * ★ 迁移识别（2026-10-11 追加；设计与自证见 scripts/gates/baselines/lint-gate-migration.md）：
 *   GodFile 拆分把整段代码**逐字搬**到新文件时，同一处缺陷只是换了宿主，它的 file 键随之改变 ⇒
 *   旧键 resolved、新键 fresh ⇒ 现行判定会把它误读成「新违规」而 exit 1（缺陷本身没有变化）。
 *   故：把同时出现、且满足下列**全部**条件的 resolved/fresh 成对判为**迁移**，不计入阻断项，单列「已迁移 N 条」：
 *     rule 相同 + symbol 相同 + **规范化后的代码行文本相同** + 该三元组两侧条数**一一相等**。
 *   方向一律是收窄假阳性：任一条不满足、或任一侧的文本取不到 ⇒ 不配对 ⇒ 仍然 exit 1（宁可漏判迁移，不可放行真新增）。
 *   为此 --update-baseline 会在每条基线上附带 text = 该行源码的规范化文本（迁移指纹）；
 *   旧基线（无 text）仍然可用，只是迁移识别退化为「旧宿主文件行仍可读」时才可能配对。
 *
 * 退出码：0 = 无基线外新违规（迁移不算新违规）；1 = 有基线外新违规；2 = 执行错误（与既有门禁一致）
 * 用法：
 *   node scripts/gates/lint-check.mjs                     # 默认：基线对比
 *   node scripts/gates/lint-check.mjs --update-baseline   # 生成/刷新基线
 *   node scripts/gates/lint-check.mjs --self-test         # 正控自检（门禁可信的前提）
 *   node scripts/gates/lint-check.mjs --json              # 机器可读
 *   node scripts/gates/lint-check.mjs --list --rule=no-undef --top=20
 *
 * 依赖：**只用仓库内已有包，不装新包、不联网** —— client/node_modules 的 @babel/parser、
 *       @babel/traverse、@vue/compiler-sfc（找不到时回退 server/node_modules、根 node_modules）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCAN_ROOTS = ['client/src', 'server/src'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'uploads', '.vite', '__snapshots__']);
const BASELINE_PATH = path.join(ROOT, 'scripts/gates/baselines/lint-baseline.json');

/** 判定顺序即输出顺序 */
const RULES = ['no-undef', 'no-unused-vars', 'no-unresolved-import', 'no-dupe-keys', 'no-redeclare', 'no-const-assign', 'parse-error'];

// ════════════════════════════════════════════════════════ 依赖（离线，只用仓库内已有包）

function resolveDep(spec) {
  for (const pkg of ['client/package.json', 'server/package.json', 'package.json']) {
    const p = path.join(ROOT, pkg);
    if (!fs.existsSync(p)) continue;
    try { return createRequire(p).resolve(spec); } catch { /* 换下一个 node_modules 根 */ }
  }
  throw new Error('仓库内找不到依赖 ' + spec + '（本门禁不装包、不联网）');
}

const parserNS = await import(pathToFileURL(resolveDep('@babel/parser')).href);
const babelParse = parserNS.parse ?? parserNS.default?.parse;
const traverseNS = await import(pathToFileURL(resolveDep('@babel/traverse')).href);
const babelTraverse = [traverseNS.default?.default, traverseNS.default, traverseNS.traverse].find((x) => typeof x === 'function');
const sfcNS = await import(pathToFileURL(resolveDep('@vue/compiler-sfc')).href);
const vueParse = sfcNS.parse ?? sfcNS.default?.parse;
if (typeof babelParse !== 'function' || typeof babelTraverse !== 'function' || typeof vueParse !== 'function') {
  console.error('门禁执行错误：离线依赖加载失败（@babel/parser / @babel/traverse / @vue/compiler-sfc）');
  process.exit(2);
}

// ════════════════════════════════════════════════════════ 全局白名单

const of = (s) => s.split(/\s+/).filter(Boolean);

/** ES 语言内建 */
const ES_BUILTINS = of(`AggregateError Array ArrayBuffer Atomics BigInt BigInt64Array BigUint64Array Boolean
  DataView Date decodeURI decodeURIComponent encodeURI encodeURIComponent Error escape eval EvalError
  FinalizationRegistry Float16Array Float32Array Float64Array Function globalThis Infinity Int16Array
  Int32Array Int8Array Intl isFinite isNaN JSON Map Math NaN Number Object parseFloat parseInt Promise
  Proxy RangeError ReferenceError Reflect RegExp Set SharedArrayBuffer String Symbol SyntaxError TypeError
  Uint16Array Uint32Array Uint8Array Uint8ClampedArray undefined unescape URIError WeakMap WeakRef WeakSet`);

/** Node 运行时全局 */
const NODE_GLOBALS = of(`process Buffer global __dirname __filename module exports require console
  queueMicrotask setImmediate clearImmediate setTimeout clearTimeout setInterval clearInterval
  structuredClone performance crypto fetch Headers Request Response FormData Blob File URL URLSearchParams
  TextEncoder TextDecoder TextEncoderStream TextDecoderStream AbortController AbortSignal Event EventTarget
  MessageChannel MessagePort MessageEvent BroadcastChannel WebSocket ReadableStream WritableStream
  TransformStream CompressionStream DecompressionStream DOMException navigator atob btoa`);

/** 浏览器全局（本仓是浏览器端 Vue 应用，必须齐全，否则大面积误报） */
const BROWSER_GLOBALS = of(`window self document navigator location history screen frames parent top opener
  closed name status origin devicePixelRatio innerWidth innerHeight outerWidth outerHeight pageXOffset
  pageYOffset scrollX scrollY screenX screenY screenLeft screenTop alert confirm prompt print open close
  stop focus blur scroll scrollTo scrollBy moveTo moveBy resizeTo resizeBy getComputedStyle getSelection
  matchMedia requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback
  addEventListener removeEventListener dispatchEvent postMessage localStorage sessionStorage indexedDB caches
  customElements XMLHttpRequest FileReader DOMParser XMLSerializer Image Audio Option Path2D OffscreenCanvas
  ImageBitmap ImageData CanvasRenderingContext2D WebGLRenderingContext WebGL2RenderingContext AudioContext
  webkitAudioContext speechSynthesis SpeechSynthesisUtterance MutationObserver IntersectionObserver
  ResizeObserver PerformanceObserver ReportingObserver EventSource Worker SharedWorker Notification Clipboard
  ClipboardItem DataTransfer DragEvent CustomEvent MouseEvent KeyboardEvent PointerEvent TouchEvent WheelEvent
  FocusEvent InputEvent UIEvent ProgressEvent StorageEvent PopStateEvent HashChangeEvent ErrorEvent CloseEvent
  PageTransitionEvent BeforeUnloadEvent DeviceMotionEvent DeviceOrientationEvent GamepadEvent AnimationEvent
  TransitionEvent CompositionEvent SubmitEvent ToggleEvent Node Element HTMLElement HTMLInputElement
  HTMLTextAreaElement HTMLSelectElement HTMLButtonElement HTMLFormElement HTMLCanvasElement HTMLImageElement
  HTMLVideoElement HTMLAudioElement HTMLAnchorElement HTMLDivElement HTMLSpanElement HTMLTableElement
  HTMLIFrameElement HTMLScriptElement HTMLLabelElement SVGElement SVGSVGElement Document DocumentFragment
  ShadowRoot Range Selection TreeWalker NodeFilter NodeList HTMLCollection NamedNodeMap DOMRect DOMRectReadOnly
  DOMMatrix DOMPoint DOMTokenList CSSStyleDeclaration CSSStyleSheet CSS MediaQueryList MediaStream
  MediaRecorder RTCPeerConnection IDBKeyRange IDBDatabase IDBFactory IDBOpenDBRequest IDBTransaction
  IDBObjectStore IDBIndex IDBCursor IDBRequest MediaSource SourceBuffer CustomElementRegistry ValidityState
  VisualViewport getModifierState`);

/** Vue 编译器宏：只在 .vue 的脚本块里隐式可用（放到全局会掩盖 .js 里的真缺陷） */
const VUE_MACROS = of(`defineProps defineEmits defineExpose defineOptions defineSlots defineModel
  defineRender withDefaults`);

const GLOBAL_SET = new Set([...ES_BUILTINS, ...NODE_GLOBALS, ...BROWSER_GLOBALS]);
const VUE_MACRO_SET = new Set(VUE_MACROS);

// ════════════════════════════════════════════════════════ 小工具

/** 从绑定模式（ObjectPattern / ArrayPattern / AssignmentPattern / RestElement）里取出被声明的 Identifier 节点 */
function patternIdentifiers(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case 'Identifier': out.push(node); break;
    case 'ObjectPattern':
      for (const prop of node.properties) {
        if (prop.type === 'RestElement') patternIdentifiers(prop.argument, out);
        else patternIdentifiers(prop.value, out);
      }
      break;
    case 'ArrayPattern':
      for (const el of node.elements) patternIdentifiers(el, out);
      break;
    case 'AssignmentPattern': patternIdentifiers(node.left, out); break;
    case 'RestElement': patternIdentifiers(node.argument, out); break;
    case 'TSParameterProperty': patternIdentifiers(node.parameter, out); break;
    default: break;
  }
  return out;
}

/** 对象字面量里可静态比较的键名（computed / 含插值的模板串返回 null = 不判） */
function staticKeyName(key) {
  if (!key) return null;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'StringLiteral') return key.value;
  if (key.type === 'NumericLiteral') return String(key.value);
  if (key.type === 'BigIntLiteral') return String(key.value);
  return null;
}

const escapeRe = (s) => s.replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&');

/**
 * <script setup> 的顶层声明可能只被模板使用 —— 保守地用词边界文本匹配做宽免（只会漏报，不会误报）。
 * 必须同时匹配 kebab-case：模板里写 <inbox-outlined /> 时会被解析到 InboxOutlined 绑定
 * （Vue 的 hyphenate = \B([A-Z]) -> -$1 再小写）。实测本仓有 4 处属于这种写法。
 */
function templateMentions(templateText, name) {
  if (!templateText) return false;
  if (new RegExp('(?<![\\w$])' + escapeRe(name) + '(?![\\w$])').test(templateText)) return true;
  const kebab = name.replace(/\B([A-Z])/g, '-$1').toLowerCase();
  if (kebab !== name && new RegExp('(?<![\\w$])' + escapeRe(kebab) + '(?![\\w$])').test(templateText)) return true;
  return false;
}

/** 相对 import 的候选落点（Vite 解析习惯 + 常见静态资源） */
const EXT_CANDIDATES = ['', '.js', '.mjs', '.cjs', '.json', '.vue', '.ts', '.tsx', '.jsx', '.css', '.scss',
  '.less', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot',
  '.txt', '.md', '.wasm', '.yml', '.yaml'];
const INDEX_CANDIDATES = ['index.js', 'index.mjs', 'index.cjs', 'index.json', 'index.vue', 'index.ts'];
const resolveCache = new Map();

function specifierResolves(base) {
  if (resolveCache.has(base)) return resolveCache.get(base);
  let ok = false;
  for (const ext of EXT_CANDIDATES) {
    const p = base + ext;
    try { if (fs.statSync(p).isFile()) { ok = true; break; } } catch { /* 不存在 */ }
  }
  if (!ok) {
    for (const idx of INDEX_CANDIDATES) {
      try { if (fs.statSync(path.join(base, idx)).isFile()) { ok = true; break; } } catch { /* 不存在 */ }
    }
  }
  resolveCache.set(base, ok);
  return ok;
}

/** rest 元素里的名字（`...rest`）—— 「取出剩余字段」是常见且刻意的写法，unused 从宽 */
function patternRestNames(node, out = new Set()) {
  if (!node) return out;
  switch (node.type) {
    case 'RestElement': for (const id of patternIdentifiers(node.argument, [])) out.add(id.name); break;
    case 'ObjectPattern': for (const p of node.properties) patternRestNames(p.type === 'RestElement' ? p : p.value, out); break;
    case 'ArrayPattern': for (const el of node.elements) patternRestNames(el, out); break;
    case 'AssignmentPattern': patternRestNames(node.left, out); break;
    default: break;
  }
  return out;
}

// ════════════════════════════════════════════════════════ 单块分析（6 条规则的全部实现）

const PARSE_OPTS = {
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
  allowSuperOutsideMethod: true,
  errorRecovery: false,
  plugins: ['importAttributes'],
};

/** AST 遍历时跳过的元数据键（避免把 loc/注释当子节点递归） */
const AST_SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'comments']);

/**
 * ★W1-C-gate：子树上是否存在 `typeof <同名标识符>`（守卫探针，最多 400 个节点）。
 * @param {object} node 子树根
 * @param {string} name 目标标识符名（必须**同名**，异名守卫不放行）
 * @param {{n:number}} [budget] 递归预算
 * @returns {boolean}
 */
function subtreeHasTypeofGuard(node, name, budget = { n: 0 }) {
  if (!node || typeof node.type !== 'string') return false;
  if (budget.n++ > 400) return false;
  if (node.type === 'UnaryExpression' && node.operator === 'typeof'
    && node.argument && node.argument.type === 'Identifier' && node.argument.name === name) return true;
  for (const [key, value] of Object.entries(node)) {
    if (AST_SKIP_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) if (child && subtreeHasTypeofGuard(child, name, budget)) return true;
    } else if (value && typeof value.type === 'string' && subtreeHasTypeofGuard(value, name, budget)) return true;
  }
  return false;
}

/**
 * ★W1-C-gate：短路守卫里的「构建期 define」豁免（修 lint 门禁对 vite define 的误报）。
 *
 * 假阳性原样：`typeof __BUILD_VERSION__ !== 'undefined' && __BUILD_VERSION__ ? String(__BUILD_VERSION__) : 'dev'`
 *   —— 旧豁免只认「父节点直接是 `typeof X`」的那一次引用，短路表达式的第 2/3 次引用被误报 no-undef
 *   （vite `define` 注入的变量只能这样写：client/vite.config.js 的 __BUILD_VERSION__）。
 *
 * 判据（保守，**只**放行被 typeof 守卫过的同名标识符）：
 *   · `&&` 右侧：沿 `&&` 链上溯，若某个 `&&` 的**左操作数**含 `typeof <同名>` ⇒ 放行（短路语义保证左侧已求值）；
 *   · 三元：若「我」是 `cond ? A : B` 的 A，且 `cond` 含 `typeof <同名>` ⇒ 放行。
 * 不放行（保证真阳性仍被抓）：`||` 分支、异名守卫（`typeof window !== 'undefined' && 未声明标识符`）、裸引用。
 *
 * @param {object} p Babel ReferencedIdentifier path
 * @param {string} name 标识符名
 * @returns {boolean}
 */
function isTypeofShortCircuitGuarded(p, name) {
  let cur = p;
  for (let depth = 0; depth < 12 && cur.parentPath; depth += 1) {
    const parent = cur.parentPath;
    if (parent.isLogicalExpression({ operator: '&&' }) && parent.node.right === cur.node) {
      if (subtreeHasTypeofGuard(parent.node.left, name)) return true;
      cur = parent;
      continue;
    }
    if (parent.isConditionalExpression() && parent.node.consequent === cur.node) {
      if (subtreeHasTypeofGuard(parent.node.test, name)) return true;
      cur = parent;
      continue;
    }
    // 语句/函数/程序边界：不再上溯，避免把无关上下文误当守卫
    if (parent.isStatement() || parent.isFunction() || parent.isProgram() || parent.isBlockStatement()) return false;
    cur = parent;
  }
  return false;
}

/**
 * @param {string} code   脚本源码（.js 全文，或 .vue 的某一个 <script> 块内容）
 * @param {object} ctx    { absFile, isVue, isScriptSetup, templateText, lineAt }
 * @returns {{rule,line,symbol,message}[]}
 */
function analyzeBlock(code, ctx) {
  const findings = [];
  const addAt = (rule, localLine, symbol, message) => findings.push({ rule, line: ctx.lineAt(localLine || 1), symbol: symbol ?? '', message: message ?? '' });
  const add = (rule, node, symbol, message) => addAt(rule, node?.loc?.start?.line ?? 1, symbol, message);

  let ast;
  try {
    ast = babelParse(code, { sourceType: 'module', ...PARSE_OPTS });
  } catch (moduleErr) {
    try {
      ast = babelParse(code, { sourceType: 'unambiguous', ...PARSE_OPTS });
    } catch (e) {
      // 解析失败 ⇒ 本文件所有规则都会被跳过，必须显式暴露（否则是静默盲区）
      addAt('parse-error', e.loc?.line ?? moduleErr.loc?.line ?? 1, '<syntax>', String(e.message).split('\n')[0]);
      return findings;
    }
  }

  const scopes = [];
  const exportedLocals = new Set();
  const restNames = new Set();
  const catchBindings = new WeakSet();     // catch 形参：从宽（ESLint v8 默认 caughtErrors:none；Babel 把它的 kind 记为 let，不能按 kind 判）
  const functionExprNames = new WeakSet(); // 具名函数表达式的自名（(function selfDoc(){})() 是刻意写法，不是缺陷）
  const declSites = new Map(); // Scope -> Map(name -> [{line, kind}])

  const recordDecl = (scope, name, line, kind) => {
    if (!scope) return;
    let byName = declSites.get(scope);
    if (!byName) { byName = new Map(); declSites.set(scope, byName); }
    const arr = byName.get(name);
    if (arr) arr.push({ line, kind }); else byName.set(name, [{ line, kind }]);
  };
  /** 交给 Babel 判定「这个名字绑定在哪个作用域」——避免自己重实现作用域提升规则 */
  const ownerScope = (p, name) => { const b = p.scope.getBinding(name); return b ? b.scope : p.scope; };
  const isImplicitlyAvailable = (name) => GLOBAL_SET.has(name) || (ctx.isVue && VUE_MACRO_SET.has(name));

  function checkSpec(node, localLine) {
    const raw = node.value;
    if (typeof raw !== 'string' || !raw.startsWith('.')) return; // 裸模块名 / '@/' 等构建别名不在本门禁范围
    const base = path.resolve(path.dirname(ctx.absFile), raw.replace(/[?#].*$/, ''));
    if (specifierResolves(base)) return;
    addAt('no-unresolved-import', localLine, raw, '相对 import 目标在磁盘上不存在（模块可能已被删除/改名）');
  }

  function checkWrite(p, id) {
    const name = id.name;
    const binding = p.scope.getBinding(name);
    if (binding) {
      if (binding.kind === 'const' || binding.kind === 'module') {
        add('no-const-assign', id, name, binding.kind === 'module' ? '给 import 绑定赋值（ESM 下抛 TypeError）' : '给 const 绑定赋值（ESM 下抛 TypeError）');
      }
      return;
    }
    if (isImplicitlyAvailable(name)) return;
    add('no-undef', id, name, '赋值给未声明的标识符（ESM 严格模式下抛 ReferenceError）');
  }

  babelTraverse(ast, {
    Scope(p) { scopes.push(p.scope); },

    // ── 规则 1：no-undef（本门禁的核心）
    ReferencedIdentifier(p) {
      const name = p.node.name;
      if (isImplicitlyAvailable(name)) return;
      if (name === 'arguments') {
        let fp = p.getFunctionParent();
        while (fp && fp.isArrowFunctionExpression()) fp = fp.getFunctionParent();
        if (fp && !fp.isProgram()) return; // 普通函数里的 arguments 是合法隐式绑定
      }
      if (p.parentPath.isUnaryExpression({ operator: 'typeof' })) return; // typeof 不会抛 ReferenceError，ESLint 默认也放行
      // ★W1-C-gate：`typeof X !== 'undefined' && X ? String(X) : 'dev'` 的第 2/3 次引用同属被守卫引用
      if (isTypeofShortCircuitGuarded(p, name)) return;
      if (p.scope.getBinding(name)) return;
      add('no-undef', p.node, name, '引用但未声明 / 未 import / 未注入');
    },
    // `ghost = 1` 的左侧不是 ReferencedIdentifier（Babel 不把纯赋值目标算作引用），必须单独覆盖；
    // `ghost++` 的 argument 属于 ReferencedIdentifier，上面已覆盖。
    AssignmentExpression(p) {
      const left = p.node.left;
      if (left.type === 'Identifier') checkWrite(p, left);
      else if (left.type === 'ObjectPattern' || left.type === 'ArrayPattern') {
        for (const id of patternIdentifiers(left, [])) checkWrite(p, id);
      }
    },

    // ── 规则 3：no-unresolved-import（含 export { x } from './y' / export * from / import() / require()）
    ImportDeclaration(p) { checkSpec(p.node.source, p.node.source.loc.start.line); },
    ExportAllDeclaration(p) { if (p.node.source) checkSpec(p.node.source, p.node.source.loc.start.line); },
    ExportNamedDeclaration(p) {
      if (p.node.source) checkSpec(p.node.source, p.node.source.loc.start.line);
      const d = p.node.declaration;
      if (d) {
        if (d.type === 'VariableDeclaration') for (const dec of d.declarations) for (const id of patternIdentifiers(dec.id, [])) exportedLocals.add(id.name);
        else if (d.id) exportedLocals.add(d.id.name);
      }
      if (!p.node.source) for (const s of p.node.specifiers) if (s.local) exportedLocals.add(s.local.name);
    },
    ExportDefaultDeclaration(p) { if (p.node.declaration?.id) exportedLocals.add(p.node.declaration.id.name); },
    CallExpression(p) {
      const callee = p.node.callee;
      const arg = p.node.arguments[0];
      if (!arg || arg.type !== 'StringLiteral' || p.node.arguments.length !== 1) return;
      if (callee.type === 'Import') { checkSpec(arg, arg.loc.start.line); return; }
      if (callee.type === 'Identifier' && callee.name === 'require' && !p.scope.getBinding('require')) checkSpec(arg, arg.loc.start.line);
    },

    // ── 规则 4：no-dupe-keys
    ObjectExpression(p) {
      const seen = new Map();
      for (const prop of p.node.properties) {
        if (prop.type === 'SpreadElement' || prop.computed) continue;
        const key = staticKeyName(prop.key);
        if (key == null) continue;
        const kind = prop.kind === 'get' ? 'get' : prop.kind === 'set' ? 'set' : 'data';
        const prev = seen.get(key);
        if (!prev) { seen.set(key, { data: kind === 'data' ? 1 : 0, get: kind === 'get' ? 1 : 0, set: kind === 'set' ? 1 : 0 }); continue; }
        const dup = kind === 'data' ? prev.data + prev.get + prev.set > 0
          : kind === 'get' ? prev.get + prev.data > 0
            : prev.set + prev.data > 0; // get/set 成对是合法的访问器定义
        if (dup) add('no-dupe-keys', prop.key, key, '对象字面量重复键');
        prev[kind] += 1;
      }
    },

    // ── 规则 5 的原料：声明点（同一作用域内同名声明 = no-redeclare）
    VariableDeclaration(p) {
      for (const dec of p.node.declarations) {
        for (const id of patternIdentifiers(dec.id, [])) recordDecl(ownerScope(p, id.name), id.name, id.loc.start.line, p.node.kind);
        patternRestNames(dec.id, restNames);
      }
    },
    Function(p) {
      for (const param of p.node.params) {
        for (const id of patternIdentifiers(param, [])) recordDecl(ownerScope(p, id.name), id.name, id.loc.start.line, 'param');
        patternRestNames(param, restNames);
      }
      if (p.node.type === 'FunctionDeclaration' && p.node.id) {
        recordDecl(ownerScope(p, p.node.id.name), p.node.id.name, p.node.id.loc.start.line, 'hoisted');
      }
      if (p.node.type === 'FunctionExpression' && p.node.id) {
        const own = p.scope.getOwnBinding(p.node.id.name);
        if (own) functionExprNames.add(own);
      }
    },
    ClassDeclaration(p) { if (p.node.id) recordDecl(ownerScope(p, p.node.id.name), p.node.id.name, p.node.id.loc.start.line, 'class'); },
    CatchClause(p) {
      for (const id of patternIdentifiers(p.node.param, [])) {
        recordDecl(ownerScope(p, id.name), id.name, id.loc.start.line, 'catch');
        const own = p.scope.getOwnBinding(id.name);
        if (own) catchBindings.add(own);
      }
    },
  });

  // ── 规则 5：no-redeclare（解析器会先拦掉 let/const 的非法重复；这里覆盖 var / function / param）
  for (const byName of declSites.values()) {
    for (const [name, sites] of byName) {
      if (sites.length < 2) continue;
      if (sites.every((s) => s.kind === 'param' || s.kind === 'catch')) continue; // 宽松模式的重复形参、catch 兜底
      const sorted = sites.slice().sort((a, b) => a.line - b.line);
      for (let i = 1; i < sorted.length; i++) {
        addAt('no-redeclare', sorted[i].line, name, '同一作用域重复声明（首次在第 ' + sorted[0].line + ' 行）');
      }
    }
  }

  // ── 规则 2：no-unused-vars
  for (const scope of scopes) {
    const fnNode = scope.path?.node;
    const paramIds = fnNode && Array.isArray(fnNode.params) ? fnNode.params.flatMap((pr) => patternIdentifiers(pr, [])) : [];
    let lastUsedParam = -1;
    paramIds.forEach((id, i) => { const b = scope.getOwnBinding(id.name); if (b && b.referenced) lastUsedParam = i; });

    for (const [name, binding] of Object.entries(scope.bindings)) {
      if (binding.referenced) continue;
      if (name.startsWith('_')) continue;                       // 下划线前缀 = 显式「故意不用」
      if (exportedLocals.has(name)) continue;                   // export 的声明不算未使用
      if (restNames.has(name)) continue;                        // ...rest「取出剩余字段」的刻意写法
      if (catchBindings.has(binding)) continue;                 // 未使用的 catch 形参从宽（ESLint v8 默认 caughtErrors:none）
      if (functionExprNames.has(binding)) continue;             // 具名函数表达式的自名（自文档化 IIFE）
      // ★ .vue <script setup> 的顶层声明可能只被模板使用；本门禁只查脚本块 ⇒ 保守宽免（只会漏报，不会误报）
      if (ctx.isScriptSetup && scope.block.type === 'Program' && templateMentions(ctx.templateText, name)) continue;
      if (binding.kind === 'param') {
        const idx = paramIds.findIndex((id) => id.name === name);
        if (idx >= 0 && idx < lastUsedParam) continue;          // args: 'after-used'
      }
      const line = binding.identifier?.loc?.start?.line ?? binding.path?.node?.loc?.start?.line ?? 1;
      addAt('no-unused-vars', line, name, binding.kind === 'param' ? '形参声明但从未使用' : '声明但从未使用');
    }
  }

  return findings;
}


// ════════════════════════════════════════════════════════ 文件采集与扫描

function collectFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) collectFiles(p, acc); }
    else if (e.isFile() && /\.(js|mjs|cjs|vue)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** SFC 块内容第 1 行对应原文件的第几行（用 offset 反推，比信 loc.start.line 更稳） */
function blockLineStart(sfcSource, block) {
  const derived = sfcSource.slice(0, block.loc.start.offset).split('\n').length;
  return derived || block.loc.start.line;
}

/**
 * 扫描一个文件。
 * .js：全文分析。
 * .vue：只分析脚本块；**模板不查**（边界见报告）。
 *   同时存在 <script> 与 <script setup> 时，Vue 会把两块合并进同一模块作用域 ⇒
 *   本门禁按「按行拼接后一次性分析」处理，否则「A 块声明、B 块使用」会被误报成 no-undef。
 */
function scanFile(absFile) {
  const out = [];
  let raw;
  try { raw = fs.readFileSync(absFile, 'utf8'); } catch (e) {
    return { findings: [{ rule: 'parse-error', line: 1, symbol: '<read>', message: e.message }], lineCount: 0 };
  }
  const lineCount = raw.split('\n').length;
  const isVue = absFile.endsWith('.vue');

  if (!isVue) {
    for (const f of analyzeBlock(raw, { absFile, isVue: false, isScriptSetup: false, templateText: '', lineAt: (l) => l })) out.push(f);
    return { findings: out, lineCount };
  }

  let sfc;
  try { sfc = vueParse(raw, { filename: absFile }); } catch (e) {
    return { findings: [{ rule: 'parse-error', line: e.loc?.start?.line ?? 1, symbol: '<sfc>', message: String(e.message).split('\n')[0] }], lineCount };
  }
  for (const err of sfc.errors || []) {
    out.push({ rule: 'parse-error', line: err.loc?.start?.line ?? 1, symbol: '<sfc>', message: String(err.message || err).split('\n')[0] });
  }
  const { descriptor } = sfc;
  const templateText = descriptor.template?.content ?? '';
  const blocks = [];
  if (descriptor.script) blocks.push({ block: descriptor.script, setup: false });
  if (descriptor.scriptSetup) blocks.push({ block: descriptor.scriptSetup, setup: true });
  blocks.sort((x, y) => x.block.loc.start.offset - y.block.loc.start.offset);
  if (blocks.length === 0) return { findings: out, lineCount };

  if (blocks.length === 1) {
    const { block, setup } = blocks[0];
    const lineAt = (l) => blockLineStart(raw, block) + l - 1;
    for (const f of analyzeBlock(block.content, { absFile, isVue: true, isScriptSetup: setup, templateText, lineAt })) out.push(f);
    return { findings: out, lineCount };
  }

  const a = blocks[0].block, b = blocks[1].block;
  const aLines = a.content.split('\n');            // 按行拼接（不是字符拼接），保证块边界干净且行号可精确反推
  const bLines = b.content.split('\n');
  const aStart = blockLineStart(raw, a), bStart = blockLineStart(raw, b);
  const lineAt = (l) => (l <= aLines.length ? aStart + l - 1 : bStart + (l - aLines.length) - 1);
  for (const f of analyzeBlock(aLines.concat(bLines).join('\n'), { absFile, isVue: true, isScriptSetup: true, templateText, lineAt })) out.push(f);
  return { findings: out, lineCount };
}

const cmpViolation = (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1
  : a.line - b.line || RULES.indexOf(a.rule) - RULES.indexOf(b.rule) || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));

function scanTree(absRoots, relBase) {
  const files = [];
  for (const root of absRoots) collectFiles(root, files);
  files.sort();
  const violations = [];
  let lines = 0, parseFailedFiles = 0, vueFiles = 0;
  for (const abs of files) {
    const rel = path.relative(relBase, abs).split(path.sep).join('/');
    const { findings, lineCount } = scanFile(abs);
    lines += lineCount;
    if (abs.endsWith('.vue')) vueFiles++;
    if (findings.some((f) => f.rule === 'parse-error')) parseFailedFiles++;
    for (const f of findings) violations.push({ rule: f.rule, file: rel, line: f.line, symbol: f.symbol, message: f.message });
  }
  violations.sort(cmpViolation);
  return { files: files.length, vueFiles, jsFiles: files.length - vueFiles, lines, violations, parseFailedFiles };
}

// ════════════════════════════════════════════════════════ 基线对比

function tally(violations) {
  const counts = Object.fromEntries(RULES.map((r) => [r, 0]));
  const byFile = new Map();
  for (const v of violations) {
    counts[v.rule] = (counts[v.rule] || 0) + 1;
    byFile.set(v.file, (byFile.get(v.file) || 0) + 1);
  }
  const topFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return { counts, topFiles };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch (e) { throw new Error('基线文件损坏（' + path.relative(ROOT, BASELINE_PATH) + '）：' + e.message + ' —— 请用 --update-baseline 重新生成'); }
}

/**
 * 基线对比：比对键 = file + rule + symbol，并按“出现次数”比对。
 * 行号漂移不算新违规（同一处违规因上方增删行而挪位很常见）；
 * 同类违规净增（例如某文件多出一处 no-undef:foo）才算新违规。
 */
function diffBaseline(current, baseline) {
  const group = (list) => {
    const m = new Map();
    for (const v of list) {
      const k = v.file + '\u0000' + v.rule + '\u0000' + v.symbol;
      let g = m.get(k);
      if (!g) { g = { items: [], lines: new Set() }; m.set(k, g); }
      g.items.push(v); g.lines.add(v.line);
    }
    return m;
  };
  const cur = group(current);
  const base = baseline ? group(baseline.violations || []) : new Map();
  const fresh = [];
  const resolved = [];
  for (const [key, g] of cur) {
    const b = base.get(key);
    const allowed = b ? b.items.length : 0;
    const extra = g.items.length - allowed;
    if (extra <= 0) continue;
    const moved = g.items.filter((it) => !b || !b.lines.has(it.line));       // 行号也不在基线里 ⇒ 更可能是真新增
    const stayed = g.items.filter((it) => b && b.lines.has(it.line));
    fresh.push(...(moved.length >= extra ? moved.slice(0, extra) : moved.concat(stayed).slice(0, extra)));
  }
  for (const [key, b] of base) {
    const c = cur.get(key);
    const delta = b.items.length - (c ? c.items.length : 0);
    if (delta > 0) resolved.push({ key, delta });
  }
  fresh.sort(cmpViolation);
  return { fresh, resolved };
}

// ════════════════════════════════════════════════════════ 迁移识别（resolved ↔ fresh 配对）

/**
 * 永不参与迁移配对的规则。
 * parse-error 是**文件级**状态（解析失败 ⇒ 该文件所有规则都被跳过），它的「位置」是文件本身而不是某一行；
 * 任意两个文件都可能在同一条文本上解析失败 ⇒ 放开配对会产生真实的假阴性。这里选择保守：不配对（仍然阻断）。
 */
const MIGRATION_EXCLUDED_RULES = new Set(['parse-error']);

/** 规范化代码行文本：折叠所有空白序列为单个空格 + 去首尾空白；空行 / 取不到（非字符串）⇒ null（null 永不配对） */
function normalizeSourceText(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
}

/**
 * 读「某文件第 N 行」的源码原文（**未**规范化，规范化统一由 normalizeSourceText 负责）。
 * file 为相对仓库根的 POSIX 路径（扫描结果与基线用的是同一口径，故 path.resolve(ROOT, file) 可还原）。
 * 带缓存；读不到（文件已被删 / 行号越界 / IO 异常）返回 null —— 调用方据此 fail-closed。
 */
function makeSourceReader() {
  const cache = new Map();
  const linesOf = (relFile) => {
    if (cache.has(relFile)) return cache.get(relFile);
    let lines = null;
    try { lines = fs.readFileSync(path.resolve(ROOT, relFile), 'utf8').split('\n'); } catch { lines = null; }
    cache.set(relFile, lines);
    return lines;
  };
  return (relFile, line) => {
    const lines = linesOf(relFile);
    return lines ? (lines[line - 1] ?? null) : null;
  };
}

/**
 * 迁移配对：把「同一处缺陷换了宿主」与「真正新增的缺陷」区分开（动机与自证见 scripts/gates/baselines/lint-gate-migration.md）。
 *
 * 配对键（三元组）= rule + symbol + 规范化代码行文本；
 * 判定：对每个三元组要求 **resolved 条数 === fresh 条数 > 0**（一一配对，不部分配对），且两侧 file 两两不同。
 * 文本来源（任一侧取不到 ⇒ null ⇒ 该条目不参与配对，保持阻断）：
 *   resolved 侧 —— ① 基线条目自带的 text（--update-baseline 写入的指纹，旧宿主文件被删也仍在）；
 *                  ② 退回读当前工作树的「基线的 file:line」（旧宿主仍在且该行未挪动时才可用）；
 *   fresh    侧 —— 本次扫描树的 file:line 源码。
 *
 * @param {object[]} current  本次全量违规（用于判断基线里的哪些行号已不在结果里）
 * @param {object}   baseline 基线对象
 * @param {{fresh:object[],resolved:{key:string,delta:number}[]}} diff diffBaseline 的结果
 * @param {(file:string,line:number)=>string|null} readSource 取源码行原文（未规范化）
 * @returns {{migrations:object[], blocking:object[], migratedResolved:number}}
 */
function detectMigrations(current, baseline, diff, readSource) {
  const vacant = { migrations: [], blocking: diff ? diff.fresh.slice() : [], migratedResolved: 0 };
  if (!diff || !diff.fresh.length || !diff.resolved.length) return vacant;

  const groupByKey = (list) => {
    const m = new Map();
    for (const v of list) {
      const k = v.file + '\u0000' + v.rule + '\u0000' + v.symbol;
      const g = m.get(k);
      if (g) g.push(v); else m.set(k, [v]);
    }
    return m;
  };
  const curByKey = groupByKey(current || []);
  const baseByKey = groupByKey((baseline && baseline.violations) || []);

  // ── resolved 侧：把 delta 落到具体基线条目上。
  //    优先取「行号也不在本次结果里」的条目（更可能是真消失的那条）；候选不足时退回该键的全部基线条目。
  const resolvedSide = [];
  for (const r of diff.resolved) {
    const parts = r.key.split('\u0000');
    const file = parts[0], rule = parts[1], symbol = parts[2];
    if (MIGRATION_EXCLUDED_RULES.has(rule)) continue;                       // 该规则永不配对 ⇒ 保持阻断
    const baseItems = (baseByKey.get(r.key) || []).slice().sort((a, b) => a.line - b.line);
    const curLines = new Set((curByKey.get(r.key) || []).map((v) => v.line));
    let pool = baseItems.filter((it) => !curLines.has(it.line));
    if (pool.length < r.delta) pool = baseItems;
    for (const it of pool.slice(0, r.delta)) {
      const stored = normalizeSourceText(it.text);                          // ① 基线指纹（权威快照）
      const live = stored ? null : normalizeSourceText(readSource(it.file, it.line)); // ② 旧宿主仍在时的回退
      resolvedSide.push({ file, rule, symbol, line: it.line, text: stored || live });
    }
  }

  // ── fresh 侧：每条都取本次扫描树里该行的源码（与 resolved 侧同形：rule/symbol/file/line/text 全带齐）
  const freshSide = diff.fresh.map((v, i) => ({
    i, file: v.file, line: v.line, rule: v.rule, symbol: v.symbol, v,
    text: normalizeSourceText(readSource(v.file, v.line)),
  }));

  // ── 按三元组归并（文本取不到的条目不进组 ⇒ 永不配对）
  const groups = new Map();
  const push = (side, e) => {
    if (!e.text) return;
    const k = e.rule + '\u0000' + e.symbol + '\u0000' + e.text;
    let g = groups.get(k);
    if (!g) { g = { rule: e.rule, symbol: e.symbol, text: e.text, resolved: [], fresh: [] }; groups.set(k, g); }
    g[side].push(e);
  };
  for (const e of resolvedSide) push('resolved', e);
  for (const e of freshSide) push('fresh', e);

  const migrated = new Set();
  const migrations = [];
  const cmpPlace = (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line);
  for (const g of groups.values()) {
    if (!g.resolved.length || g.resolved.length !== g.fresh.length) continue; // 多配少配都不配对
    // 换宿主：resolved 的 file 与 fresh 的 file 必须两两不同。比对键含 file ⇒ 同一键不可能既 resolved 又 fresh，
    // 这一步是防御性断言（配对逻辑被改坏时立刻退化为不配对 = 仍然阻断）。
    if (g.resolved.some((r) => g.fresh.some((x) => x.file === r.file))) continue;
    migrations.push({
      rule: g.rule, symbol: g.symbol, text: g.text, count: g.resolved.length,
      from: g.resolved.map((e) => ({ file: e.file, line: e.line })).sort(cmpPlace),
      to: g.fresh.map((x) => ({ file: x.file, line: x.line })).sort(cmpPlace),
    });
    for (const f of g.fresh) migrated.add(f.i);
  }
  if (!migrations.length) return vacant;
  migrations.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1
    : a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1
      : a.from[0].file < b.from[0].file ? -1 : a.from[0].file > b.from[0].file ? 1 : 0));
  return {
    migrations,
    blocking: diff.fresh.filter((_, i) => !migrated.has(i)),
    migratedResolved: migrations.reduce((n, m) => n + m.count, 0),
  };
}

// ════════════════════════════════════════════════════════ 参数与报告

function parseArgs(argv) {
  const out = { json: false, selfTest: false, updateBaseline: false, list: false, top: 10, rule: null, roots: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '--update-baseline') out.updateBaseline = true;
    else if (a === '--list') out.list = true;
    else if (a === '--top') out.top = Number(argv[++i]) || 10;
    else if (a.startsWith('--top=')) out.top = Number(a.slice(6)) || 10;
    else if (a === '--rule') out.rule = argv[++i];
    else if (a.startsWith('--rule=')) out.rule = a.slice(7);
    else if (a === '--root') out.roots.push(argv[++i]);
    else if (!a.startsWith('-')) out.roots.push(a);
    else { console.error('未知参数: ' + a); process.exit(2); }
  }
  return out;
}

function buildBaselineJson(res) {
  const { counts } = tally(res.violations);
  const readSource = makeSourceReader();
  return {
    gate: 'lint-check',
    createdAt: new Date().toISOString(),
    note: '本仓历史违规快照（3.4 万行从未 lint 过，一次性清零会诱发大面积改写 = 行为变更风险）。'
      + '判定：只有「基线之外的新违规」才阻断；已存在的违规只统计。比对键 = file + rule + symbol，并按出现次数比对（行号漂移不算新违规）。'
      + '每条附 text = 该行源码的规范化文本（折叠空白后），作为「同一处缺陷换宿主」的迁移指纹：'
      + '配对要求 rule + symbol + text 三项全同且两侧条数一一相等，缺 text 的旧基线仍然可用（迁移识别退化为不配对）。',
    scanRoots: SCAN_ROOTS,
    scannedFiles: res.files,
    scannedLines: res.lines,
    counts,
    violations: res.violations.map((v) => {
      const text = normalizeSourceText(readSource(v.file, v.line));
      return { file: v.file, line: v.line, rule: v.rule, symbol: v.symbol, ...(text ? { text } : {}) };
    }),
  };
}

function formatReport(res, baseline, diff, mig, args) {
  const cur = tally(res.violations);
  const baseCounts = baseline ? tally(baseline.violations || []).counts : Object.fromEntries(RULES.map((r) => [r, 0]));
  const migrations = mig ? mig.migrations : [];
  const migratedCount = migrations.reduce((n, m) => n + m.count, 0);
  const blocked = mig ? mig.blocking : (diff ? diff.fresh : []);   // 阻断项 = 基线外的「真新增」（判定为迁移的不算）
  const migratedResolved = mig ? mig.migratedResolved : 0;
  const L = [];
  L.push('=== lint-check: 常驻静态检查门禁（' + (baseline ? '基线对比' : '未建立基线') + '）===');
  L.push('扫描面      : ' + SCAN_ROOTS.join(' + ') + '（.vue 只查 <script>/<script setup> 脚本块，模板不查）');
  L.push('扫描文件    : ' + res.files + '（.vue ' + res.vueFiles + ' / .js ' + res.jsFiles + '）');
  L.push('代码行      : ' + res.lines);
  L.push('解析失败    : ' + res.parseFailedFiles + ' 个文件' + (res.parseFailedFiles ? '（这些文件的所有规则都会被跳过，已按 parse-error 计）' : ''));
  L.push('基线        : ' + (baseline ? path.relative(ROOT, BASELINE_PATH) + '（' + (baseline.createdAt || '?') + '，' + (baseline.violations || []).length + ' 条）' : '（缺失）'));
  L.push('');
  L.push('── 分类统计（基线 → 当前，新增） '.padEnd(78, '─'));
  L.push('  规则                   基线      当前      新增');
  for (const r of RULES) {
    const nw = diff ? diff.fresh.filter((v) => v.rule === r).length : 0;   // 「新增」列 = 基线外的新键（口径与改动前一致）
    const nb = blocked.filter((v) => v.rule === r).length;                 // 其中真正阻断的（已扣除判定为迁移的）
    const flag = nb > 0 ? '  ← 新增' : nw > 0 ? '  ← 已迁移（不计入阻断）' : '';
    L.push('  ' + r.padEnd(22) + String(baseCounts[r] ?? 0).padStart(6) + String(cur.counts[r] ?? 0).padStart(10) + String(nw).padStart(10) + flag);
  }
  L.push('  ' + '合计'.padEnd(21) + String((baseline?.violations || []).length).padStart(6) + String(res.violations.length).padStart(10)
    + String(diff ? diff.fresh.length : 0).padStart(10));
  if (migratedCount > 0) L.push('  · 「新增」列 = 基线外新键（含判定为迁移的 ' + migratedCount + ' 条）；实际阻断项 = ' + blocked.length + ' 条');
  L.push('');
  L.push('── 基线之外的新违规（阻断项） '.padEnd(78, '─'));
  if (!diff) L.push('  （未建立基线，无法判定）');
  else if (blocked.length === 0) L.push('  （无）');
  else for (const v of blocked.slice(0, 60)) L.push('  ✗ ' + v.file + ':' + v.line + '  ' + v.rule + '  ' + v.symbol + '  — ' + v.message);
  if (blocked.length > 60) L.push('  ... 其余 ' + (blocked.length - 60) + ' 条已省略（--json 取全量）');
  // 「已消除」只算真正修掉的：被判定为迁移的那部分虽然从旧宿主消失，但并没有消失（它换了宿主）
  const resolvedNet = diff ? diff.resolved.reduce((n, x) => n + x.delta, 0) - migratedResolved : 0;
  if (resolvedNet > 0) L.push('  · 已消除（基线内被修掉）: ' + resolvedNet + ' 条');
  L.push('');
  if (migratedCount > 0) {
    L.push('── 已迁移 ' + migratedCount + ' 条（rule + symbol + 规范化行文本 三项全同、两侧条数一一相等） '.padEnd(78, '─'));
    L.push('  （同一处缺陷换宿主：不计入阻断项，也不计入「已消除」）');
    for (const m of migrations) {
      L.push('  ⇄ ' + m.rule + '  ' + m.symbol + '  ｜ ' + m.text);
      for (let i = 0; i < Math.max(m.from.length, m.to.length); i++) {
        const a = m.from[i], b = m.to[i];
        L.push('      ' + (a ? a.file + ':' + a.line : '（无）') + '   →   ' + (b ? b.file + ':' + b.line : '（无）'));
      }
    }
    L.push('');
  }
  L.push('── 基线内违规 Top ' + args.top + ' 文件（只统计、不阻断） '.padEnd(78, '─'));
  if (cur.topFiles.length === 0) L.push('  （无）');
  else for (const [f, n] of cur.topFiles.slice(0, args.top)) L.push('  ' + String(n).padStart(5) + '  ' + f);
  L.push('');
  if (args.list) {
    L.push('── 全量违规清单（--list） '.padEnd(78, '─'));
    for (const v of res.violations) L.push('  ' + v.file + ':' + v.line + '  ' + v.rule + '  ' + v.symbol);
    L.push('');
  }
  const verdict = !baseline ? 'NO-BASELINE' : blocked.length ? 'FAIL' : 'PASS';
  const migNote = migratedCount > 0 ? '；另有 ' + migratedCount + ' 条为同一处缺陷换宿主（迁移），不计入阻断' : '';
  L.push(verdict === 'PASS' ? '结论：PASS（无基线外新违规' + (migratedCount > 0 ? '；' + migratedCount + ' 条为迁移，不计入阻断' : '') + '）'
    : verdict === 'FAIL' ? '结论：FAIL（发现 ' + blocked.length + ' 条基线之外的新违规' + migNote + '）'
      : '结论：无法判定（基线缺失）');
  return { text: L.join('\n'), verdict };
}

// ════════════════════════════════════════════════════════ --self-test（门禁可信的前提）

/**
 * ① 干净样本：把「已知会诱发假阳性的写法」逐条钉进来。
 *    任何一条被判违规 ⇒ 门禁在误报 ⇒ 自检 FAIL。
 *    覆盖：对象方法简写形参绑定 / 函数体内前向引用 / 正则与模板串字面量 /
 *          浏览器与 Node 全局 / import.meta / typeof 豁免 / ...rest 豁免 /
 *          export 的声明不算未使用 / export { x } from './y' 解析 /
 *          <script setup> 顶层声明只被模板使用 / <script>+<script setup> 双块合并。
 */
const CLEAN_FIXTURES = {
  'lib/dep.js': [
    'export function usedHelper(value) { return value * 2; }',
    'export const alsoUsed = 1;',
    'export default usedHelper;',
  ].join('\n'),

  'clean/main.js': [
    "import { usedHelper } from '../lib/dep.js';",
    "export { alsoUsed } from '../lib/dep.js';",
    "import '../lib/dep.js';",
    '',
    'export const publicApi = (input) => usedHelper(input);',
    '',
    '// ★ 对象方法简写的形参必须正确绑定（本仓踩过的假阳性）',
    'const handlers = {',
    '  onFulfilled(value) { return value + laterDeclared(); },',
    '  onRejected(reason) { return String(reason); },',
    '  get size() { return 1; },',
    '  set size(next) { void next; },',
    '};',
    '',
    '// ★ 函数体内的前向引用（先用后声明）必须绑定成功',
    'function laterDeclared() { return 1; }',
    '',
    'export function exercise() {',
    '  const pattern = /\\bnotAnIdentifier\\b/g;',
    '  const text = \`template \${usedHelper(2)} literal\`;',
    '  const { size = 0, ...restOfKeys } = handlers;',
    "  const el = document.createElement('div');",
    '  window.addEventListener(\'resize\', () => requestAnimationFrame(() => {}));',
    '  const timer = setTimeout(() => {}, 1);',
    '  clearTimeout(timer);',
    "  const url = new URL('https://example.com/');",
    "  const buf = Buffer.from(String(process.env.NODE_ENV || ''));",
    '  return [pattern, text, size, el, url, buf, typeof notDeclaredAtAll];',
    '}',
    '',
    'export const metaUrl = import.meta.url;',
    '',
    'export function takesCallback(a, b) { return a + b; }',
    '',
    '// ★W1-C-gate 复现夹具（vite 构建期 define 的标准写法：短路守卫里的第 2/3 次引用曾被误报 no-undef）',
    "export const buildStamp = typeof __BUILD_VERSION__ !== 'undefined' && __BUILD_VERSION__ ? String(__BUILD_VERSION__) : 'dev';",
  ].join('\n'),

  'clean/ChildWidget.vue': [
    '<template><span>{{ label }}</span></template>',
    '<script setup>',
    'const label = 1;',
    '</script>',
  ].join('\n'),

  'clean/Clean.vue': [
    '<template>',
    '  <section class="clean">',
    '    <ChildWidget :count="count" />',
    '    <p>{{ message }}</p>',
    '    <button @click="templateOnlyHandler">{{ label }}</button>',
    '  </section>',
    '</template>',
    '',
    '<script setup>',
    "import ChildWidget from './ChildWidget.vue';",
    "const message = 'hi';",
    'const count = 1;',
    'const label = \`\${message}!\`;',
    'function templateOnlyHandler() { return count + 1; }',
    'defineProps({ title: String });',
    '</script>',
  ].join('\n'),

  // ★ 模板里的 kebab-case 写法也要能认出来（<child-widget /> 解析到 ChildWidget 绑定）
  'clean/KebabUse.vue': [
    '<template>',
    '  <child-widget :n="1" />',
    '</template>',
    '',
    '<script setup>',
    "import ChildWidget from './ChildWidget.vue';",
    '</script>',
  ].join('\n'),

  'clean/BothBlocks.vue': [
    '<template>',
    '  <div>{{ fromSetup }}</div>',
    '</template>',
    '',
    '<script>',
    'export const fromPlainScript = 1;',
    '</script>',
    '',
    '<script setup>',
    'const fromSetup = fromPlainScript + 1;',
    '</script>',
  ].join('\n'),
};

/** ② 正控样本：每条规则各自注入一处真实缺陷，必须被**精确**检出 */
const CONTROLS = [
  {
    rule: 'no-undef', file: 'ctl/no-undef.js', desc: '引用但未声明 + 赋值给未声明的标识符',
    code: ['export function boom(event) {', '  freeIdentifierNeverDeclared(event);', '  alsoFreeAssignTarget = 1;', '  return event;', '}'].join('\n'),
    expect: [['no-undef', 'freeIdentifierNeverDeclared'], ['no-undef', 'alsoFreeAssignTarget']],
  },
  {
    // ★W1-C-gate 守卫精度正控：typeof 豁免**只**放行同名标识符，且**只**认 && / 三元守卫
    rule: 'no-undef【守卫精度】', file: 'ctl/no-undef-guard-scope.js',
    desc: 'typeof 守卫必须同名同链才豁免：异名 &&、|| 右侧、裸引用仍须报 no-undef',
    code: [
      'export function pick(flag) {',
      "  const guarded = typeof __BUILD_VERSION__ !== 'undefined' && __BUILD_VERSION__ ? String(__BUILD_VERSION__) : 'dev';",
      "  const otherName = typeof window !== 'undefined' && missingAfterGuard;",
      '  const orBranch = flag || ghostInOr;',
      '  return [guarded, otherName, orBranch];',
      '}',
    ].join('\n'),
    expect: [['no-undef', 'missingAfterGuard'], ['no-undef', 'ghostInOr']],
    mustNotReport: ['__BUILD_VERSION__'],
  },
  {
    rule: 'no-unused-vars', file: 'ctl/no-unused-vars.js', desc: '声明但从未使用（export 的不算）',
    code: ['export const keep = 1;', 'const declaredButNeverUsed = 2;', 'export function ok() { return keep; }'].join('\n'),
    expect: [['no-unused-vars', 'declaredButNeverUsed']],
    mustNotReport: ['keep', 'ok'],
  },
  {
    rule: 'no-unresolved-import', file: 'ctl/no-unresolved-import.js', desc: '相对 import 指向已删除模块（含 export ... from）',
    code: ["import { gone } from './module-deleted-by-refactor.js';", "export { alsoGone } from './also-deleted.js';", 'export const touch = gone;'].join('\n'),
    expect: [['no-unresolved-import', './module-deleted-by-refactor.js'], ['no-unresolved-import', './also-deleted.js']],
  },
  {
    rule: 'no-dupe-keys', file: 'ctl/no-dupe-keys.js', desc: '对象字面量重复键',
    code: ['export const config = { retries: 1, timeout: 2, retries: 3 };'].join('\n'),
    expect: [['no-dupe-keys', 'retries']],
    mustNotReport: ['timeout'],
  },
  {
    rule: 'no-redeclare', file: 'ctl/no-redeclare.js', desc: '同一作用域重复声明',
    code: ['export function clash() {', '  var duplicated = 1;', '  var duplicated = 2;', '  return duplicated;', '}'].join('\n'),
    expect: [['no-redeclare', 'duplicated']],
  },
  {
    rule: 'no-const-assign', file: 'ctl/no-const-assign.js', desc: '对 const 绑定赋值',
    code: ['export function reassign() {', '  const frozen = 1;', '  frozen = 2;', '  return frozen;', '}'].join('\n'),
    expect: [['no-const-assign', 'frozen']],
  },
  {
    rule: '是否宽免过头', file: 'ctl/setup-unused-other.vue', desc: '模板未引用的 <script setup> 顶层声明仍须报未使用',
    code: ['<template>', '  <div>{{ shown }}</div>', '</template>', '', '<script setup>', 'const shown = 1;', 'const hiddenAndUnused = 2;', '</script>'].join('\n'),
    expect: [['no-unused-vars', 'hiddenAndUnused']],
    mustNotReport: ['shown'],
  },
  {
    rule: 'parse-error【附加】', file: 'ctl/parse-error.js', desc: '解析失败必须显式暴露（否则该文件所有规则静默跳过）',
    code: 'export function broken( { return 1; }',
    expect: [['parse-error', '<syntax>']],
  },
];

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-check-selftest-'));
  const put = (rel, content) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
  const lines = [];
  const failures = [];
  lines.push('=== lint-check --self-test（正控自检：注入的缺陷必须被检出，干净样本必须零误报）===');
  lines.push('临时树    : ' + dir + '（跑完即删）');

  try {
    // ── ① 干净树：零误报
    for (const [rel, code] of Object.entries(CLEAN_FIXTURES)) put(rel, code);
    const cleanRun = scanTree([dir], dir);
    const cleanNames = Object.keys(CLEAN_FIXTURES).sort();
    lines.push('');
    lines.push('── ① 干净树（' + cleanNames.length + ' 个文件，逐条覆盖已知假阳性写法） '.padEnd(74, '─'));
    const cleanByFile = new Map();
    for (const v of cleanRun.violations) cleanByFile.set(v.file, (cleanByFile.get(v.file) || 0) + 1);
    for (const rel of cleanNames) {
      const n = cleanByFile.get(rel) || 0;
      lines.push('  ' + (n === 0 ? '✓' : '✗') + ' ' + rel.padEnd(34) + String(n).padStart(3) + ' 条');
    }
    for (const v of cleanRun.violations) {
      lines.push('      ↳ 误报 ' + v.file + ':' + v.line + '  ' + v.rule + '  ' + v.symbol);
      failures.push('干净样本被判违规（假阳性）：' + v.file + ':' + v.line + ' ' + v.rule + ' ' + v.symbol);
    }
    lines.push('  小计：干净树 ' + cleanRun.files + ' 文件 / 误报 ' + cleanRun.violations.length + ' 条');

    // ── ② 正控树：每条规则都必须命中
    for (const c of CONTROLS) put(c.file, c.code);
    const ctlRun = scanTree([dir], dir);
    lines.push('');
    lines.push('── ② 正控树（' + CONTROLS.length + ' 条正控，每条必须被精确检出） '.padEnd(74, '─'));
    let hits = 0;
    for (const c of CONTROLS) {
      const inFile = ctlRun.violations.filter((v) => v.file === c.file);
      const missing = c.expect.filter(([rule, symbol]) => !inFile.some((v) => v.rule === rule && v.symbol === symbol));
      const overreach = (c.mustNotReport || []).filter((s) => inFile.some((v) => v.symbol === s));
      if (missing.length === 0 && overreach.length === 0) {
        hits++;
        lines.push('  ✓ ' + c.rule.padEnd(26) + c.file);
        for (const [rule, symbol] of c.expect) lines.push('        命中 ' + rule + '  ' + symbol + '   — ' + c.desc);
      } else {
        lines.push('  ✗ ' + c.rule.padEnd(26) + c.file);
        for (const [rule, symbol] of missing) { lines.push('        未检出 ' + rule + '  ' + symbol); failures.push(c.file + ' 未检出 ' + rule + ':' + symbol); }
        for (const s of overreach) { lines.push('        误报 ' + s); failures.push(c.file + ' 误报 ' + s); }
      }
    }
    lines.push('  小计：' + hits + '/' + CONTROLS.length + ' 条正控命中');

    // ── ③ 正控树里干净样本仍须零误报（确认注入没有污染判断）
    const cleanStillBad = ctlRun.violations.filter((v) => cleanNames.includes(v.file));
    lines.push('');
    lines.push('── ③ 注入后干净样本复检 '.padEnd(74, '─'));
    lines.push('  ' + (cleanStillBad.length === 0 ? '✓' : '✗') + ' 干净样本仍为 ' + cleanStillBad.length + ' 条误报');
    for (const v of cleanStillBad) failures.push('注入后干净样本被误报：' + v.file + ':' + v.line + ' ' + v.rule + ' ' + v.symbol);

    // ── ④ 基线对比逻辑自检（门禁的核心行为：行号漂移不算新违规，同类净增才算）
    const fix = (file, line, rule, symbol) => ({ file, line, rule, symbol });
    const b0 = { violations: [fix('a.js', 10, 'no-undef', 'foo'), fix('b.js', 3, 'no-unused-vars', 'bar')] };
    const drift = diffBaseline([fix('a.js', 40, 'no-undef', 'foo'), fix('b.js', 3, 'no-unused-vars', 'bar')], b0);
    const added = diffBaseline([fix('a.js', 10, 'no-undef', 'foo'), fix('a.js', 99, 'no-undef', 'foo'), fix('b.js', 3, 'no-unused-vars', 'bar')], b0);
    const brandNew = diffBaseline([fix('a.js', 10, 'no-undef', 'foo'), fix('c.js', 1, 'no-dupe-keys', 'k')], b0);
    const baselineCases = [
      ['行号漂移（10→40 行）不算新违规', drift.fresh.length === 0],
      ['同类净增一条 ⇒ 恰好 1 条新违规，且定位到新增的 99 行', added.fresh.length === 1 && added.fresh[0].line === 99],
      ['全新 file|rule|symbol ⇒ 判为新违规', brandNew.fresh.length === 1 && brandNew.fresh[0].symbol === 'k'],
      ['基线内违规被修掉 ⇒ 记入「已消除」', brandNew.resolved.length === 1 && brandNew.resolved[0].delta === 1],
    ];
    lines.push('');
    lines.push('── ④ 基线对比逻辑（行号漂移 vs 真新增） '.padEnd(74, '─'));
    for (const [desc, ok] of baselineCases) {
      lines.push('  ' + (ok ? '✓' : '✗') + ' ' + desc);
      if (!ok) failures.push('基线对比逻辑自检失败：' + desc);
    }

    // ── ⑤ 迁移配对逻辑（同一处缺陷换宿主 vs 真新增）—— 纯逻辑：源码行由注入的假读取器提供，不碰磁盘
    const place = (file, line, rule, symbol) => ({ file, line, rule, symbol, message: '' });
    let fakeTree = {};
    const fakeRead = (file, line) => fakeTree[file + ':' + line] ?? null;
    const migCases = [
      {
        desc: '成对迁移（rule+symbol+行文本全同，1↔1）⇒ 记为迁移、不阻断（缩进/空白不同不影响：规范化折叠空白）',
        base: [place('server/src/controllers/old.js', 354, 'no-unused-vars', 'count')],
        cur: [place('server/src/interface/http/batch.js', 42, 'no-unused-vars', 'count')],
        text: { 'server/src/controllers/old.js:354': '    let count = 0;', 'server/src/interface/http/batch.js:42': '\t  let   count = 0;  ' },
        expect: { migrations: 1, migrated: 1, blocking: 0 },
      },
      {
        desc: '成对迁移 2↔2（同一三元组两条）⇒ 记为 1 组、迁移 2 条、不阻断',
        base: [place('a/old.js', 10, 'no-unused-vars', 'count'), place('a/old.js', 30, 'no-unused-vars', 'count')],
        cur: [place('a/new1.js', 5, 'no-unused-vars', 'count'), place('a/new2.js', 7, 'no-unused-vars', 'count')],
        text: { 'a/old.js:10': 'let count = 0;', 'a/old.js:30': 'let count = 0;', 'a/new1.js:5': 'let count = 0;', 'a/new2.js:7': 'let count = 0;' },
        expect: { migrations: 1, migrated: 2, blocking: 0 },
      },
      {
        desc: '部分迁移（2 组可配对 + 1 条真新增）⇒ 配对 2 条、剩下 1 条仍阻断',
        base: [place('a/oldA.js', 1, 'no-unused-vars', 'count'), place('a/oldB.js', 2, 'no-unused-vars', 'foo')],
        cur: [place('a/newA.js', 3, 'no-unused-vars', 'count'), place('a/newB.js', 4, 'no-unused-vars', 'foo'), place('a/newC.js', 9, 'no-unused-vars', 'bar')],
        text: { 'a/oldA.js:1': 'let count = 0;', 'a/oldB.js:2': 'const foo = 1;', 'a/newA.js:3': 'let count = 0;', 'a/newB.js:4': 'const foo = 1;', 'a/newC.js:9': 'const bar = 2;' },
        expect: { migrations: 2, migrated: 2, blocking: 1 },
      },
      {
        desc: '代码文本不同（count = 0 → count = 1）⇒ 不配对、仍阻断',
        base: [place('a/old.js', 10, 'no-unused-vars', 'count')],
        cur: [place('a/new.js', 5, 'no-unused-vars', 'count')],
        text: { 'a/old.js:10': 'let count = 0;', 'a/new.js:5': 'let count = 1;' },
        expect: { migrations: 0, migrated: 0, blocking: 1 },
      },
      {
        desc: 'symbol 改名（count → count2）⇒ 不配对、仍阻断',
        base: [place('a/old.js', 10, 'no-unused-vars', 'count')],
        cur: [place('a/new.js', 5, 'no-unused-vars', 'count2')],
        text: { 'a/old.js:10': 'let count = 0;', 'a/new.js:5': 'let count2 = 0;' },
        expect: { migrations: 0, migrated: 0, blocking: 1 },
      },
      {
        desc: 'rule 不同（no-unused-vars → no-undef，symbol 与文本都相同）⇒ 不配对、仍阻断',
        base: [place('a/old.js', 10, 'no-unused-vars', 'count')],
        cur: [place('a/new.js', 5, 'no-undef', 'count')],
        text: { 'a/old.js:10': 'let count = 0;', 'a/new.js:5': 'let count = 0;' },
        expect: { migrations: 0, migrated: 0, blocking: 1 },
      },
      {
        desc: '条数不等（resolved 2 / fresh 1）⇒ 一条都不配、仍阻断',
        base: [place('a/old.js', 10, 'no-unused-vars', 'count'), place('a/old.js', 30, 'no-unused-vars', 'count')],
        cur: [place('a/new.js', 5, 'no-unused-vars', 'count')],
        text: { 'a/old.js:10': 'let count = 0;', 'a/old.js:30': 'let count = 0;', 'a/new.js:5': 'let count = 0;' },
        expect: { migrations: 0, migrated: 0, blocking: 1 },
      },
      {
        desc: '条数不等反向（resolved 1 / fresh 2）⇒ 一条都不配、仍阻断 2 条',
        base: [place('a/old.js', 10, 'no-unused-vars', 'count')],
        cur: [place('a/new.js', 5, 'no-unused-vars', 'count'), place('a/new.js', 9, 'no-unused-vars', 'count')],
        text: { 'a/old.js:10': 'let count = 0;', 'a/new.js:5': 'let count = 0;', 'a/new.js:9': 'let count = 0;' },
        expect: { migrations: 0, migrated: 0, blocking: 2 },
      },
      {
        desc: '旧宿主已删除且基线无 text（旧文本取不到）⇒ fail-closed、不配对、仍阻断',
        base: [place('a/deleted.js', 10, 'no-unused-vars', 'count')],
        cur: [place('a/new.js', 5, 'no-unused-vars', 'count')],
        text: { 'a/new.js:5': 'let count = 0;' },
        expect: { migrations: 0, migrated: 0, blocking: 1 },
      },
      {
        desc: 'parse-error 永不参与配对（文件级状态，不是某一行的缺陷）⇒ 仍阻断',
        base: [place('a/old.js', 1, 'parse-error', '<syntax>')],
        cur: [place('a/new.js', 1, 'parse-error', '<syntax>')],
        text: { 'a/old.js:1': 'export function broken( { return 1; }', 'a/new.js:1': 'export function broken( { return 1; }' },
        expect: { migrations: 0, migrated: 0, blocking: 1 },
      },
      {
        desc: '新旧宿主同一 file（合成反例：比对键的互斥性被破坏）⇒ 防御性拒绝配对、仍阻断',
        base: [place('a/same.js', 10, 'no-unused-vars', 'count')],
        cur: [place('a/same.js', 99, 'no-unused-vars', 'count')],
        text: { 'a/same.js:10': 'let count = 0;', 'a/same.js:99': 'let count = 0;' },
        fakeDiff: {
          fresh: [place('a/same.js', 99, 'no-unused-vars', 'count')],
          resolved: [{ key: 'a/same.js\u0000no-unused-vars\u0000count', delta: 1 }],
        },
        expect: { migrations: 0, migrated: 0, blocking: 1 },
      },
    ];
    lines.push('');
    lines.push('── ⑤ 迁移配对逻辑（同一处缺陷换宿主 vs 真新增） '.padEnd(74, '─'));
    let migHits = 0;
    for (const c of migCases) {
      fakeTree = c.text || {};
      const b = { violations: c.base };
      const d = c.fakeDiff || diffBaseline(c.cur, b);
      const m = detectMigrations(c.cur, b, d, fakeRead);
      const got = { migrations: m.migrations.length, migrated: m.migrations.reduce((n, x) => n + x.count, 0), blocking: m.blocking.length };
      const ok = got.migrations === c.expect.migrations && got.migrated === c.expect.migrated && got.blocking === c.expect.blocking;
      if (ok) migHits++;
      lines.push('  ' + (ok ? '✓' : '✗') + ' ' + c.desc);
      lines.push('        实测 迁移组 ' + got.migrations + ' / 迁移条数 ' + got.migrated + ' / 阻断 ' + got.blocking
        + '　期望 迁移组 ' + c.expect.migrations + ' / 迁移条数 ' + c.expect.migrated + ' / 阻断 ' + c.expect.blocking);
      if (!ok) failures.push('迁移配对逻辑自检失败：' + c.desc);
    }
    lines.push('  小计：' + migHits + '/' + migCases.length + ' 条迁移用例符合预期');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  lines.push('');
  if (failures.length) {
    lines.push('SELF-TEST FAILED（' + failures.length + ' 项）：');
    for (const f of failures) lines.push('  - ' + f);
    console.log(lines.join('\n'));
    process.exit(1);
  }
  lines.push('SELF-TEST PASSED: ' + CONTROLS.length + '/' + CONTROLS.length + ' 正控命中，干净树 0 误报（门禁非「永远绿灯」）');
  console.log(lines.join('\n'));
  process.exit(0);
}

// ════════════════════════════════════════════════════════ 入口

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) selfTest();

  const roots = args.roots.length ? args.roots.map((r) => path.resolve(ROOT, r)) : SCAN_ROOTS.map((r) => path.join(ROOT, r));
  for (const r of roots) if (!fs.existsSync(r)) throw new Error('扫描根目录不存在：' + r);

  const res = scanTree(roots, ROOT);

  if (args.updateBaseline) {
    const before = readBaseline();
    const payload = buildBaselineJson(res);
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n');
    const { counts, topFiles } = tally(res.violations);
    console.log('=== lint-check --update-baseline：基线已刷新 ===');
    console.log('文件        : ' + path.relative(ROOT, BASELINE_PATH));
    console.log('扫描        : ' + res.files + ' 文件 / ' + res.lines + ' 行');
    console.log('违规总数    : ' + res.violations.length + (before ? '（旧基线 ' + (before.violations || []).length + '）' : '（此前无基线）'));
    console.log('迁移指纹    : 每条附带 text = 该行源码的规范化文本（供「同一处缺陷换宿主」的迁移配对使用）');
    for (const r of RULES) console.log('  ' + r.padEnd(22) + String(counts[r] || 0).padStart(6));
    console.log('Top 文件：');
    for (const [f, n] of topFiles.slice(0, args.top)) console.log('  ' + String(n).padStart(5) + '  ' + f);
    process.exit(0);
  }

  const baseline = readBaseline();
  const diff = baseline ? diffBaseline(res.violations, baseline) : null;
  const mig = diff ? detectMigrations(res.violations, baseline, diff, makeSourceReader()) : null;
  const { text, verdict } = formatReport(res, baseline, diff, mig, args);

  if (args.json) {
    console.log(JSON.stringify({
      gate: 'lint-check',
      scanRoots: SCAN_ROOTS,
      scannedFiles: res.files,
      scannedLines: res.lines,
      parseFailedFiles: res.parseFailedFiles,
      counts: tally(res.violations).counts,
      topFiles: tally(res.violations).topFiles.slice(0, args.top),
      baseline: baseline ? { path: path.relative(ROOT, BASELINE_PATH), total: (baseline.violations || []).length, createdAt: baseline.createdAt } : null,
      newViolations: diff ? diff.fresh : null,
      resolved: diff ? diff.resolved : null,
      blockingViolations: diff ? (mig ? mig.blocking : diff.fresh) : null,   // 新增字段：扣除迁移后的真·阻断项（= 退出码依据）
      migrations: diff ? (mig ? mig.migrations : []) : null,                  // 新增字段：判定为「同一处缺陷换宿主」的配对明细
      violations: args.list || args.rule ? res.violations.filter((v) => !args.rule || v.rule === args.rule) : undefined,
      verdict,
    }, null, 2));
  } else if (args.rule) {
    const filtered = res.violations.filter((v) => v.rule === args.rule);
    console.log('=== lint-check --rule=' + args.rule + ' ===');
    console.log('命中 ' + filtered.length + ' 条：');
    for (const v of filtered) console.log('  ' + v.file + ':' + v.line + '  ' + v.symbol + '  — ' + v.message);
  } else {
    console.log(text);
  }

  if (!baseline) {
    console.error('');
    console.error('基线缺失：' + path.relative(ROOT, BASELINE_PATH) + ' 不存在，门禁无法给出判决。');
    console.error('请先运行：node scripts/gates/lint-check.mjs --update-baseline');
    process.exit(2);
  }
  process.exit(verdict === 'PASS' ? 0 : 1);
}

try { main(); } catch (e) { console.error('门禁执行错误：' + e.message); process.exit(2); }
