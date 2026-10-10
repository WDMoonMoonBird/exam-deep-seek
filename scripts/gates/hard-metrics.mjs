#!/usr/bin/env node
/**
 * 硬指标门禁（G-4）—— 复算《审查团队入场包》§1 的三项硬指标，并把基线钉死在代码里。
 *
 * 口径（严格对齐入场包 §6 的复算命令，勿擅自放宽）：
 *   - 样本：client/src/style.css + client/src 下全部 *.vue
 *   - 预处理：去除 /* ... *​/ 块注释
 *   - hex(6)      ：/#[0-9a-fA-F]{6}/g
 *   - !important  ：/!important/g
 *   - Modal.confirm：client/src/views 下 *.vue 的 /Modal\.confirm/g
 *
 * 退出码：0 = 未超标；1 = 有指标劣于基线；2 = 执行错误
 * 用法：node scripts/gates/hard-metrics.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CLIENT_SRC = path.join(ROOT, 'client/src');

/** 冻结基线（2026-10-10，commit ac60831，入场包 §1） */
const BASELINE = { hex6: 0, important: 0, modalConfirm: 0 };

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function listFiles(dir, ext) {
  return cp.execSync(`find "${dir}" -type f -name "${ext}"`).toString().trim().split('\n').filter(Boolean);
}

function count(re, text) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function main() {
  const styleCss = path.join(CLIENT_SRC, 'style.css');
  if (!fs.existsSync(styleCss)) throw new Error(`缺少样本文件：${styleCss}`);

  const samples = [styleCss, ...listFiles(CLIENT_SRC, '*.vue')];
  let hex6 = 0;
  let important = 0;
  const hexHits = [];
  const importantHits = [];
  for (const f of samples) {
    const t = stripComments(fs.readFileSync(f, 'utf8'));
    const h = count(/#[0-9a-fA-F]{6}/g, t);
    const i = count(/!important/g, t);
    if (h) { hex6 += h; hexHits.push(`${path.relative(ROOT, f)} (${h})`); }
    if (i) { important += i; importantHits.push(`${path.relative(ROOT, f)} (${i})`); }
  }

  const viewsDir = path.join(CLIENT_SRC, 'views');
  let modalConfirm = 0;
  const modalHits = [];
  for (const f of listFiles(viewsDir, '*.vue')) {
    const t = stripComments(fs.readFileSync(f, 'utf8'));
    const c = count(/Modal\.confirm/g, t);
    if (c) { modalConfirm += c; modalHits.push(`${path.relative(ROOT, f)} (${c})`); }
  }

  const actual = { hex6, important, modalConfirm };

  // 参考口径（不入判据，仅供审查者核对"是否靠排除样本达标"）
  const allCss = listFiles(CLIENT_SRC, '*.css');
  const legacyImportant = allCss
    .filter((f) => !f.endsWith('style.css'))
    .reduce((n, f) => n + count(/!important/g, stripComments(fs.readFileSync(f, 'utf8'))), 0);

  const rows = Object.keys(BASELINE).map((k) => ({
    metric: k,
    baseline: BASELINE[k],
    actual: actual[k],
    status: actual[k] > BASELINE[k] ? 'FAIL' : 'PASS',
  }));

  const out = {
    gate: 'hard-metrics',
    replicaOf: 'docs/reports/审查团队入场包-2026-10-10.md §1/§6',
    samples: { count: samples.length, style: 'client/src/style.css + client/src/**/*.vue (去块注释)' },
    rows,
    reference: { nonStyleCssImportant: legacyImportant, note: '非 style.css 的 CSS 中的 !important（legacy-patch.css 19 处旧内核降级层 + tokens.css 1 处），按设计使用，不计违规' },
    evidence: { hexHits, importantHits, modalHits },
    verdict: rows.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL',
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log('硬指标门禁（去注释口径）');
    console.log('样本：' + out.samples.style + `，共 ${out.samples.count} 个文件`);
    for (const r of rows) {
      console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.metric.padEnd(13)} 基线=${r.baseline}  实测=${r.actual}`);
    }
    if (hexHits.length) console.log('  hex 命中：' + hexHits.join(', '));
    if (importantHits.length) console.log('  !important 命中：' + importantHits.join(', '));
    if (modalHits.length) console.log('  Modal.confirm 命中：' + modalHits.join(', '));
    console.log(`  参考：非 style.css 的 CSS 中 !important = ${legacyImportant}（legacy-patch 19 + tokens.css 1，按设计使用，不计违规）`);
    console.log('结论：' + out.verdict);
  }
  process.exit(out.verdict === 'PASS' ? 0 : 1);
}

try { main(); } catch (e) { console.error('门禁执行错误：' + e.message); process.exit(2); }
