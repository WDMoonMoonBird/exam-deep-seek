#!/usr/bin/env node
/**
 * 架构门禁（G-4 / 规范终止条件「无高危架构违规、无超标 GodFile」）
 *
 * 判据（基线冻结于 2026-10-10 / commit ac60831）：
 *   - 分层违规数 = 0
 *   - "未分层待迁移"数不增（基线 42）
 *   - GodFile：>800 行 = 超标（基线 0）；>500 行 = 观察（基线 12，参考值不判真假）
 *   - ★静态豁免守卫违规 = 0（R2-B63 新增：白名单内出现 I/O ⇒ FAIL）
 * GodFile 阈值**规范未定义**，本仓约定 800（见 docs/plan/2026-10-10-流水线落地前必改清单.md G-7）。
 *
 * 静态展示豁免（R2-B63，口径=用户 2026-10-11 裁定：教师手册等【纯静态、无数据交互】页面不计判据）：
 *   · 白名单 scripts/gates/static-whitelist.json（每条含 path + 一行理由）命中的文件从 **GodFile 判据集合**移出，
 *     单列为 static_over800 / static_over500（报告可见、不计判据）；
 *   · ★反滥用守卫：白名单内文件（含 dir/** 子树与未来新增 section）只要**直接或间接**出现 I/O
 *     （axios / @/api/** / 数据类 composable / socketConfig·createTeacherSocket / socket.io / child_process，
 *     含"经 composable、store 间接取数"——例如 Submit.vue 自身 grep request 为 0）⇒ staticGuardIo FAIL
 *     「声明为静态，却含 I/O」，且**该文件不获豁免**（仍留在判据集合里）。
 *   · 判定实现与规则：scripts/gates/static-exempt.mjs；自测/变异对照：node scripts/gates/static-exempt.test.mjs
 *
 * 退出码：0 = 达标；1 = 劣于基线（含静态豁免被滥用）；2 = 执行错误
 * 用法：node scripts/gates/arch-metrics.mjs [--json] [--static-whitelist=<file>]
 *   --static-whitelist 仅供自测/变异对照替换白名单；它**不能放宽判据**：白名单内出现 I/O 一律 FAIL，
 *   未命中任何文件的条目只记为 stale（不产生豁免）。
 */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { DEFAULT_WHITELIST_REL, analyzeStaticExemption, collectSourceFiles } from './static-exempt.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
// 基线刷新记录：
//   2026-10-10 建（unmigrated 47 / GodFile 10 / 观察带 19）
//   2026-10-11 step1（ruleExecutor 拆 8 文件并落层）后刷新为 46 / 9 / 18
//   2026-10-11 step2（Submit.vue 抽 9 个 composable，全部 <500 行）后刷新为 46 / 8 / 18（观察带不变）
//   2026-10-11 step3（checkerService 拆 10 文件并落层）后刷新为 45 / 7 / 17
//   2026-10-11 step4（deepseek 拆 10 文件并落层）后刷新为 44 / 6 / 16
//   2026-10-11 step5（ProjectQuestionEdit.vue 抽 9 个 composable，.vue 868->348）后刷新为 44 / 5 / 15
//     （观察带 >500 含 >800；.vue 降到 348 后离开该集合，故 16->15 —— step5 方案原估「16→16」是错的）
//   2026-10-11 step6（QuestionEdit.vue 抽 12 个 composable，.vue 983->466）后刷新为 44 / 4 / 14
//     （466 < 500 ⇒ 同时离开两个集合，观察带实测 15->14，非预设）
//   2026-10-11 step7（ReviewDetail.vue 抽 7 个 composable，.vue 988->620）后刷新为 44 / 3 / 14
//     ⚠️ 观察带**不降**（14->14）：template 236 + style 359 = 595 行不可触碰，该文件结构上无法低于 500
//   2026-10-11 step8（reviewController 拆 11 文件：9 搬移 + 2 barrel，源已删）后刷新为 43 / 2 / 13
//     （观察带 14->13：被删的 reviewController.js 965 行原本在 >500 集合内）
//   2026-10-11 step9（teacherController 拆 12 文件：10 搬移 + 2 barrel，源已删）后刷新为 42 / 1 / 12
//     ★GodFile 1 = 仅剩 client/src/views/Doc.vue(1106)，系**用户裁定有意保留**（纯静态教师手册、不连后端、体量在内容非逻辑）
//   2026-10-13 B63（静态展示豁免 + I/O 反滥用守卫，t2）后：判据集合剔除**静态豁免**文件
//     （Doc.vue 1220 / Landing.vue 960 ⇒ 单列 static_over800，报告可见不计判据），
//     godfileOver800 基线在新判据集合上**复算 1 → 0**（历史那个 1 就是被豁免的 Doc.vue；只降不升，未用 --save-baseline）；
//     over500 观察带口径不变（全量普查，含静态豁免文件，另见 static_over500）；unmigrated / layerViolations 未动。
const BASELINE = { layerViolations: 0, unmigrated: 42, godfileOver800: 0, over500: 12, staticGuardIo: 0 };

export function parseArgs(argv) {
  const out = { json: false, whitelist: null };
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else if (a.startsWith('--static-whitelist=')) out.whitelist = a.slice('--static-whitelist='.length);
  }
  return out;
}

/** 与 wc -l 同口径：按换行符计数，末尾换行不多算一行 */
export function measureSizes(files) {
  return files
    .map((f) => ({ file: path.relative(ROOT, f).split(path.sep).join('/'), lines: (fs.readFileSync(f, 'utf8').match(/\n/g) || []).length }))
    .sort((a, b) => b.lines - a.lines);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  // ── 1. 分层守卫（复用仓库既有脚本，不重新实现）
  const layerScript = path.join(ROOT, 'server/scripts/check-layers.mjs');
  let layerRaw = '';
  try {
    layerRaw = cp.execSync('node "' + layerScript + '"', { cwd: ROOT }).toString();
  } catch (e) {
    layerRaw = (e.stdout || '').toString();
  }
  const unmigrated = Number((layerRaw.match(/未分层待迁移\s*(\d+)/) || [])[1] ?? NaN);
  const violations = Number((layerRaw.match(/违规\s*(\d+)\s*条/) || [])[1] ?? NaN);

  // ── 2. GodFile 普查
  const files = [...collectSourceFiles(path.join(ROOT, 'server/src')), ...collectSourceFiles(path.join(ROOT, 'client/src'))];
  const sized = measureSizes(files);

  // ── 3. 静态展示豁免 + ★I/O 反滥用守卫（B63）
  const whitelistFile = args.whitelist ? path.resolve(ROOT, args.whitelist) : path.join(ROOT, DEFAULT_WHITELIST_REL);
  const statics = analyzeStaticExemption({ root: ROOT, whitelistFile, files });
  const exemptSet = new Set(statics.exempt);
  const judged = sized.filter((s) => !exemptSet.has(s.file));
  const over800 = judged.filter((s) => s.lines > 800);
  const over500 = sized.filter((s) => s.lines > 500);
  const staticOver800 = sized.filter((s) => s.lines > 800 && exemptSet.has(s.file));
  const staticOver500 = sized.filter((s) => s.lines > 500 && exemptSet.has(s.file));
  const fmt = (rows) => rows.map((s) => s.file + ' (' + s.lines + ')');

  const rows = [
    { metric: 'layerViolations', baseline: BASELINE.layerViolations, actual: violations, status: violations > BASELINE.layerViolations ? 'FAIL' : 'PASS' },
    { metric: 'unmigrated', baseline: BASELINE.unmigrated, actual: unmigrated, status: unmigrated > BASELINE.unmigrated ? 'FAIL' : 'PASS' },
    { metric: 'godfileOver800', baseline: BASELINE.godfileOver800, actual: over800.length, status: over800.length > BASELINE.godfileOver800 ? 'FAIL' : 'PASS' },
    { metric: 'staticGuardIo', baseline: BASELINE.staticGuardIo, actual: statics.violations.length, status: statics.violations.length > BASELINE.staticGuardIo ? 'FAIL' : 'PASS' },
  ];

  const out = {
    gate: 'arch-metrics',
    rows,
    staticExemption: {
      whitelist: statics.whitelist.path,
      entries: statics.entries.map((e) => ({ path: e.path, reason: e.reason, matched: e.matched, matchedFiles: e.matchedFiles })),
      staleEntries: statics.staleEntries,
      checkedFiles: statics.checked,
      exemptedFiles: statics.exempt,
    },
    static_guard: {
      status: statics.guardStatus,
      baseline: BASELINE.staticGuardIo,
      violations: statics.violations,
      note: '白名单内出现 I/O（含经 composable·store 间接取数）⇒ FAIL「声明为静态，却含 I/O」，且该文件不获豁免',
    },
    godfile_over800: fmt(over800),
    static_over800: fmt(staticOver800),
    static_over500: fmt(staticOver500),
    reference: {
      over500: { baseline: BASELINE.over500, actual: over500.length, note: '观察带（不计判据）；全量普查，含静态豁免文件（其行数另见 static_over800/static_over500）' },
    },
    godfile_over500: fmt(over500),
    layerRaw: layerRaw.trim(),
    verdict: rows.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL',
  };

  if (args.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log('架构门禁（B63：静态展示豁免 + I/O 反滥用守卫）');
    for (const r of rows) console.log('  ' + (r.status === 'PASS' ? '✓' : '✗') + ' ' + r.metric.padEnd(18) + ' 基线=' + r.baseline + '  实测=' + r.actual);
    console.log('  · >500 行（观察带，不计判据；全量普查含静态豁免） 基线=' + BASELINE.over500 + ' 实测=' + over500.length);
    console.log('  GodFile >800 行（判据集合，已剔除静态豁免）：' + (over800.length ? out.godfile_over800.join(' / ') : '（无）'));
    console.log('  静态豁免 static_over800（报告可见、不计判据）：' + (staticOver800.length ? out.static_over800.join(' / ') : '（无）'));
    console.log('  静态豁免白名单（' + statics.whitelist.path + '，' + statics.entries.length + ' 条 / 命中 ' + statics.checked + ' 个文件）：');
    for (const e of statics.entries) console.log('    · ' + e.path + '（命中 ' + e.matched + '）—— ' + e.reason);
    if (statics.staleEntries.length) console.log('  ⚠ 白名单条目未命中任何文件（stale，不产生豁免）：' + statics.staleEntries.join(', '));
    if (statics.violations.length) {
      console.log('  ✗ 静态豁免违规（声明为静态，却含 I/O）—— 该文件不获豁免：');
      for (const v of statics.violations) console.log('    · ' + v.file + ' —— ' + v.detail);
    }
    console.log('  分层守卫原文：' + layerRaw.trim());
    console.log('结论：' + out.verdict);
  }
  process.exit(out.verdict === 'PASS' ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  try { main(); } catch (e) { console.error('门禁执行错误：' + e.message); process.exit(2); }
}
