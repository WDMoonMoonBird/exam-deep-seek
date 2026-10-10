#!/usr/bin/env node
/**
 * 循环依赖门禁（G-4 / 规范终止条件「无高耦合模块」）
 *
 * 判定：对给定根目录下的 ESM/CJS 相对导入图做 **Tarjan 强连通分量（SCC）** 分析。
 *   - |SCC| > 1  → 真实循环依赖
 *   - 自环（文件 import 自己）单独判定，避免与 SCC 混淆
 * 每条环都附**内部边 + 行号**证据，便于人工复核（本项目曾因检测器误报产出假结论，故必须可复核）。
 *
 * 退出码：0 = 环数 ≤ 基线；1 = 环数 > 基线；2 = 执行错误
 * 用法：node scripts/gates/cycle-check.mjs [--root server/src] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const BASELINE = { cycles: 1, members: ['server/src/services/factExtractor.js', 'server/src/services/ruleExecutor.js'] };

function parseArgs(argv) {
  const out = { root: 'server/src', json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = argv[++i];
    else if (argv[i] === '--json') out.json = true;
  }
  return out;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);

function collectFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) collectFiles(p, acc); }
    else if (/\.(js|mjs|cjs|ts|vue)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const IMPORT_RE = /(?:^|[^\w.])import\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpec(fromFile, spec, allFiles) {
  if (!spec.startsWith('.')) return null;            // 只关心仓库内部相对导入
  const base = path.resolve(path.dirname(fromFile), spec);
  const cands = [base, base + '.js', base + '.mjs', base + '.cjs', base + '.ts',
    path.join(base, 'index.js'), path.join(base, 'index.mjs')];
  return cands.find((c) => allFiles.has(c)) || null;
}

function buildGraph(rootAbs, files) {
  const graph = new Map();
  const edges = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const deps = new Set();
    const lines = src.split('\n');
    for (let ln = 0; ln < lines.length; ln++) {
      const line = lines[ln];
      IMPORT_RE.lastIndex = 0;
      let m;
      while ((m = IMPORT_RE.exec(line))) {
        const spec = m[1] || m[2] || m[3];
        const target = resolveSpec(f, spec, new Set(files));
        if (!target) continue;
        deps.add(target);
        edges.push({ from: f, to: target, line: ln + 1, spec });
      }
    }
    graph.set(f, [...deps]);
  }
  return { graph, edges };
}

/** Tarjan（迭代实现，避免深图爆栈） */
function tarjanSCC(graph) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  let counter = 0;

  for (const start of graph.keys()) {
    if (index.has(start)) continue;
    const work = [[start, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, pi] = frame;
      if (pi === 0) { index.set(v, counter); low.set(v, counter); counter++; stack.push(v); onStack.add(v); }
      const neighbors = graph.get(v) || [];
      let advanced = false;
      for (let i = pi; i < neighbors.length; i++) {
        const w = neighbors[i];
        if (!graph.has(w)) continue;
        if (!index.has(w)) { frame[1] = i + 1; work.push([w, 0]); advanced = true; break; }
        if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      }
      if (advanced) continue;
      frame[1] = neighbors.length;
      if (low.get(v) === index.get(v)) {
        const comp = [];
        for (;;) { const w = stack.pop(); onStack.delete(w); comp.push(w); if (w === v) break; }
        if (comp.length > 1) sccs.push(comp);
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(v)));
      }
    }
  }
  return sccs;
}

function main() {
  const { root, json } = parseArgs(process.argv.slice(2));
  const rootAbs = path.join(ROOT_DIR, root);
  if (!fs.existsSync(rootAbs)) throw new Error(`根目录不存在：${rootAbs}`);

  const files = collectFiles(rootAbs);
  const { graph, edges } = buildGraph(rootAbs, files);
  const sccs = tarjanSCC(graph);
  const selfLoops = edges.filter((e) => e.from === e.to);

  const rel = (p) => path.relative(ROOT_DIR, p);
  const cycles = sccs.map((comp) => {
    const set = new Set(comp);
    const inner = edges.filter((e) => set.has(e.from) && set.has(e.to));
    return {
      members: comp.map(rel).sort(),
      internalEdges: inner.map((e) => `${rel(e.from)}:${e.line} → ${rel(e.to)}`),
    };
  });

  const out = {
    gate: 'cycle-check',
    root,
    scannedFiles: files.length,
    edges: edges.length,
    cycles: cycles.length,
    baseline: BASELINE.cycles,
    selfLoops: selfLoops.map((e) => `${rel(e.from)}:${e.line}`),
    detail: cycles,
    verdict: cycles.length > BASELINE.cycles ? 'FAIL' : 'PASS',
  };

  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`循环依赖门禁 · 根目录 ${root}`);
    console.log(`  扫描 ${files.length} 文件 / ${edges.length} 条相对导入边`);
    console.log(`  强连通分量（|SCC|>1）: ${cycles.length}（基线 ${BASELINE.cycles}）`);
    for (const c of cycles) {
      console.log('  ↻ ' + c.members.join('  ↔  '));
      for (const e of c.internalEdges) console.log('      ' + e);
    }
    console.log(`  自环（文件 import 自身）: ${selfLoops.length}`);
    console.log('结论：' + out.verdict);
  }
  process.exit(out.verdict === 'PASS' ? 0 : 1);
}

try { main(); } catch (e) { console.error('门禁执行错误：' + e.message); process.exit(2); }
