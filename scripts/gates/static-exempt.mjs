#!/usr/bin/env node
/**
 * 静态展示豁免（R2-B63）—— 白名单判定 + I/O 反滥用守卫（无副作用、可 import；arch-metrics 与自测共用）
 *
 * 口径：教师手册等【纯静态、无数据交互】页面不计 GodFile 判据（用户 2026-10-11 裁定，
 *   见 docs/plan/2026-10-11-godfile-split-plan.md §范围裁剪）；但豁免必须**自动判定**：
 *   ① 白名单命中 ⇒ 这些文件从 GodFile 判据集合移出，单列为 static_over800 / static_over500；
 *   ② ★反滥用守卫 ⇒ 白名单内文件只要**直接或间接**出现 I/O，门禁 FAIL「声明为静态，却含 I/O」，
 *      且该文件**不获得豁免**（仍留在判据集合里）。
 *
 * I/O 型（两类都查）：
 *   · import 型：axios / @/api/**（API 层模块）/ socketConfig·createTeacherSocket / socket.io / child_process；
 *   · 调用型  ：axios.xxx / request.get(...) / fetch(...) / new WebSocket(...) / new XMLHttpRequest / child_process…
 * 间接取数（本模块的关键）：不只看被豁免文件自己，而是沿 import 图做**闭包**（composable / store / 任意本地模块），
 *   命中即 FAIL 并附**证据链**（哪一行 import 了谁、最终在哪个文件哪一行命中哪条规则）。
 *   为什么必须看间接：client/src/views/student/Submit.vue（真数据页）里 "request" 出现 0 次 —— 取数在
 *   ../../composables/submit/useSubmitPage.js -> useAssignmentLoader.js -> api/request.js。
 *   自测 scripts/gates/static-exempt.test.mjs 把 Submit.vue 作为**必红反例**（只看直接 import 的守卫会放行它）。
 *
 * 精度处理（避免把"文档里写的代码样例"当成真 I/O —— manual/** 里就有这种字符串）：
 *   · .vue 只取 <script> 块（模板里的说明文字不参与判定）；
 *   · import 抽取只认**行首** import/export 语句（写在字符串里的示例代码不算）；
 *   · 调用型规则在"去注释 + 去字符串"的代码视图上匹配（示例文本不算）。
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_WHITELIST_REL = 'scripts/gates/static-whitelist.json';
export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'uploads']);
const SRC_FILE_RE = /\.(js|mjs|cjs|ts|vue)$/;

/* ───────────────────────── 通用工具 ───────────────────────── */

export function collectSourceFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) collectSourceFiles(p, acc); }
    else if (SRC_FILE_RE.test(e.name)) acc.push(p);
  }
  return acc;
}

export const toRel = (root, abs) => path.relative(root, abs).split(path.sep).join('/');
const blankAll = (s) => s.replace(/[^\n]/g, ' ');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const srcLineAt = (src, idx) => {
  const start = src.lastIndexOf('\n', idx - 1) + 1;
  const end = src.indexOf('\n', idx);
  return src.slice(start, end < 0 ? undefined : end).trim().slice(0, 160);
};

/* ───────────────────────── 白名单 ───────────────────────── */

export function loadWhitelist(fileAbs) {
  if (!fs.existsSync(fileAbs)) throw new Error('静态豁免白名单不存在：' + fileAbs);
  let data;
  try { data = JSON.parse(fs.readFileSync(fileAbs, 'utf8')); }
  catch (e) { throw new Error('静态豁免白名单不是合法 JSON：' + fileAbs + '（' + e.message + '）'); }
  const entries = Array.isArray(data) ? data : data && data.entries;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('静态豁免白名单 entries 为空：' + fileAbs);
  for (const e of entries) {
    if (!e || typeof e.path !== 'string' || !e.path.trim()) throw new Error('白名单条目缺少 path：' + JSON.stringify(e));
    if (typeof e.reason !== 'string' || !e.reason.trim()) throw new Error('白名单条目缺少一行理由（reason）：' + e.path);
  }
  return { entries, note: (data && data.note) || '', source: fileAbs };
}

/** dir/**（子树）与 *（单段通配）→ RegExp；精确路径亦支持 */
export function patternToRegExp(pattern) {
  const body = String(pattern)
    .replace(/[.+^$?{}\[\]()|\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp('^' + body + '$');
}

/* ───────────────────────── I/O 型规则 ───────────────────────── */

export const IO_RULES = {
  /** 裸模块（npm 包）—— 出现即 I/O */
  bare: [
    { re: /^axios$|^axios\//, rule: 'axios（HTTP 客户端）' },
    { re: /^(node:)?child_process$/, rule: 'child_process（子进程）' },
    { re: /^socket\.io(-client)?(\/|$)|^engine\.io-client(\/|$)/, rule: 'socket.io（实时通道）' },
    { re: /^(node-fetch|whatwg-fetch|isomorphic-fetch|undici|superagent)(\/|$)/, rule: 'HTTP 客户端' },
  ],
  /** 名称类：任务点名的教师端实时通道出口（按名判定，不依赖解析） */
  name: /(socketConfig|createTeacherSocket)/,
  /** 别名形式的 API 层（本仓未用 @ 别名，保留以防将来启用） */
  alias: /^@\/api(\/|$)/,
  /** 解析后落在 API 层目录 ⇒ I/O */
  apiDirs: ['client/src/api/', 'server/src/api/'],
  /** 调用型（在去注释、去字符串的代码视图上匹配） */
  calls: [
    { re: /\baxios\s*[.(]/, rule: 'axios 调用' },
    { re: /\bcreateTeacherSocket\s*\(/, rule: 'createTeacherSocket 调用' },
    { re: /\brequest\s*\.\s*(?:get|post|put|patch|delete|head|options)\s*\(/, rule: 'request 调用' },
    { re: /\bfetch\s*\(/, rule: 'fetch 调用' },
    { re: /\bnew\s+XMLHttpRequest\b/, rule: 'XMLHttpRequest 调用' },
    { re: /\bnew\s+(?:WebSocket|EventSource)\s*\(/, rule: '实时通道调用' },
    { re: /\b(?:child_process|execSync|spawnSync|execFileSync)\b/, rule: 'child_process 调用' },
  ],
};

/* ───────────────────────── 源码视图（保行号） ───────────────────────── */

function scriptOnly(src, absFile) {
  if (!/\.vue$/i.test(absFile)) return src;
  let out = blankAll(src);
  const re = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(src))) {
    const bodyStart = m.index + m[0].indexOf('>') + 1;
    out = out.slice(0, bodyStart) + m[1] + out.slice(bodyStart + m[1].length);
  }
  return out;
}

const blankComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, blankAll)
   .replace(/(^|[^:'"\\])\/\/[^\n]*/gm, (m, p1) => p1 + blankAll(m.slice(p1.length)));

const blankStrings = (s) =>
  s.replace(/'(?:[^'\\\n]|\\.)*'/g, blankAll)
   .replace(/"(?:[^"\\\n]|\\.)*"/g, blankAll)
   .replace(/`(?:[^`\\]|\\.)*`/g, blankAll);

/** 代码视图：仅 <script> 块 + 去注释 + 去字符串（行号与原文一致） */
export const codeView = (src, absFile) => blankComments(blankStrings(scriptOnly(src, absFile)));
/** 导入视图：仅 <script> 块 + 去注释（保留字符串，供抽 import 说明符） */
export const importView = (src, absFile) => blankComments(scriptOnly(src, absFile));

/** 行首 import/export 语句（含多行）与动态 import()/require() */
export function extractImports(view) {
  const lines = view.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(?:import|export)\b/.test(lines[i])) continue;
    const side = /^\s*import\s*(['"])([^'"]+)\1\s*;?\s*$/.exec(lines[i]);
    if (side) { out.push({ spec: side[2], line: i + 1 }); continue; }
    let text = lines[i];
    for (let j = i + 1; j <= Math.min(i + 30, lines.length - 1); j++) {
      text += '\n' + lines[j];
      const m = /\bfrom\s*(['"])([^'"\n]+)\1/.exec(text);
      if (m) { out.push({ spec: m[2], line: j + 1 }); i = j; break; }
    }
  }
  for (const m of view.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) out.push({ spec: m[2], line: lineOf(view, m.index) });
  for (const m of view.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) out.push({ spec: m[2], line: lineOf(view, m.index) });
  return out;
}

export function resolveLocal(fromAbs, spec, root) {
  if (spec.startsWith('@/')) return firstExisting(path.join(root, 'client/src', spec.slice(2)));
  if (!spec.startsWith('.')) return null;
  return firstExisting(path.resolve(path.dirname(fromAbs), spec));
}

const EXT_CANDS = ['', '.js', '.mjs', '.cjs', '.ts', '.vue', '.json',
  '/index.js', '/index.mjs', '/index.cjs', '/index.ts', '/index.vue'];
function firstExisting(base) {
  for (const ext of EXT_CANDS) {
    const c = base + ext;
    try { if (fs.statSync(c).isFile()) return c; } catch { /* 试下一个后缀 */ }
  }
  return null;
}

export const isApiPath = (rel) => IO_RULES.apiDirs.some((d) => rel.startsWith(d));

/* ───────────────────────── 判定器 ───────────────────────── */

export function createIoAnalyzer(root) {
  const read = (f) => fs.readFileSync(f, 'utf8');
  const refsCache = new Map();

  /** 单文件「直接 I/O」引用（不看间接）；返回 {kind, rule, line, spec?, resolved?, text?}[] */
  function directIoRefs(absFile) {
    if (refsCache.has(absFile)) return refsCache.get(absFile);
    const src = read(absFile);
    const code = codeView(src, absFile);
    const refs = [];
    for (const imp of extractImports(importView(src, absFile))) {
      const bare = IO_RULES.bare.find((r) => r.re.test(imp.spec));
      if (bare) { refs.push({ kind: 'import', rule: bare.rule, line: imp.line, spec: imp.spec }); continue; }
      if (IO_RULES.name.test(imp.spec)) { refs.push({ kind: 'import', rule: '实时通道出口（socketConfig / createTeacherSocket）', line: imp.line, spec: imp.spec }); continue; }
      const local = resolveLocal(absFile, imp.spec, root);
      const rel = local ? toRel(root, local) : null;
      if (rel && isApiPath(rel)) { refs.push({ kind: 'import', rule: 'API 层模块（' + rel + '）', line: imp.line, spec: imp.spec, resolved: rel }); continue; }
      if (rel && IO_RULES.name.test(rel)) { refs.push({ kind: 'import', rule: '实时通道出口（' + rel + '）', line: imp.line, spec: imp.spec, resolved: rel }); continue; }
      if (!rel && IO_RULES.alias.test(imp.spec)) { refs.push({ kind: 'import', rule: '@/api（API 层别名）', line: imp.line, spec: imp.spec }); }
    }
    for (const c of IO_RULES.calls) {
      const m = c.re.exec(code);
      if (m) refs.push({ kind: 'call', rule: c.rule, line: lineOf(code, m.index), text: srcLineAt(src, m.index) });
    }
    refsCache.set(absFile, refs);
    return refs;
  }

  /** 沿 import 图做闭包（BFS，最短证据链）；命中返回 {tainted, chain, marker} */
  function ioChain(absFile, { maxDepth = 12 } = {}) {
    const startRel = toRel(root, absFile);
    const queue = [{ abs: absFile, chain: [{ file: startRel, line: null, spec: null }] }];
    const seen = new Set([path.resolve(absFile)]);
    while (queue.length) {
      const cur = queue.shift();
      const refs = directIoRefs(cur.abs);
      if (refs.length) return { tainted: true, chain: cur.chain, marker: refs[0] };
      if (cur.chain.length > maxDepth) continue;
      for (const imp of extractImports(importView(read(cur.abs), cur.abs))) {
        const target = resolveLocal(cur.abs, imp.spec, root);
        if (!target) continue;
        const key = path.resolve(target);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ abs: target, chain: [...cur.chain, { file: toRel(root, target), line: imp.line, spec: imp.spec }] });
      }
    }
    return { tainted: false, chain: [], marker: null };
  }

  return { root, directIoRefs, ioChain };
}

/** 单文件直接判定（便捷入口，测试/变异对照用） */
export function directIoRefs(absFile, root) {
  return createIoAnalyzer(root).directIoRefs(absFile);
}

export function chainText(chain, marker) {
  const hops = chain.map((h) => (h.line ? h.file + '（上一跳 import 在第 ' + h.line + ' 行）' : h.file));
  return hops.join(' ⇒ ') + ' ⇒ 命中：' + marker.rule + (marker.line ? '（本文件第 ' + marker.line + ' 行' + (marker.text ? '：' + marker.text : '') + '）' : '');
}

/**
 * 静态豁免判定（arch-metrics 与自测共用）
 * @param {{root:string, whitelistFile:string, files:string[]}} opts
 *   files：判定范围（仓库内所有源文件绝对路径）；白名单条目的命中集合由它过滤得出
 */
export function analyzeStaticExemption({ root, whitelistFile, files }) {
  const wl = loadWhitelist(whitelistFile || path.join(root, DEFAULT_WHITELIST_REL));
  const all = (files && files.length ? files : collectSourceFiles(path.join(root, 'client/src')))
    .map((f) => toRel(root, f)).sort();

  const entries = wl.entries.map((e) => {
    const re = patternToRegExp(e.path);
    const matchedFiles = all.filter((r) => re.test(r));
    return { path: e.path, reason: e.reason, matched: matchedFiles.length, matchedFiles };
  });
  const staleEntries = entries.filter((e) => e.matched === 0).map((e) => e.path);
  const targets = [...new Set(entries.flatMap((e) => e.matchedFiles))].sort();

  const analyzer = createIoAnalyzer(root);
  const exempt = [];
  const violations = [];
  for (const rel of targets) {
    const io = analyzer.ioChain(path.join(root, rel));
    if (!io.tainted) { exempt.push(rel); continue; }
    const owner = entries.filter((e) => e.matchedFiles.includes(rel)).map((e) => e.path);
    violations.push({
      file: rel,
      whitelist: owner,
      reason: '声明为静态，却含 I/O：' + io.marker.rule,
      marker: io.marker,
      chain: io.chain,
      detail: chainText(io.chain, io.marker),
    });
  }
  return {
    whitelist: { path: toRel(root, wl.source), note: wl.note },
    entries,
    targets,
    exempt,
    violations,
    staleEntries,
    checked: targets.length,
    guardStatus: violations.length === 0 ? 'PASS' : 'FAIL',
  };
}
