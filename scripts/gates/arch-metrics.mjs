#!/usr/bin/env node
/**
 * 架构门禁（G-4 / 规范终止条件「无高危架构违规、无超标 GodFile」）
 *
 * 判据（基线冻结于 2026-10-10 / commit ac60831）：
 *   - 分层违规数 = 0
 *   - "未分层待迁移"数不增（基线 47）
 *   - GodFile：>800 行 = 超标（基线 10 个）；>500 行 = 观察（基线 19 个）
 * GodFile 阈值**规范未定义**，本仓约定 800（见 docs/plan/2026-10-10-流水线落地前必改清单.md G-7）。
 *
 * 退出码：0 = 达标；1 = 劣于基线；2 = 执行错误
 * 用法：node scripts/gates/arch-metrics.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';

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
const BASELINE = { layerViolations: 0, unmigrated: 43, godfileOver800: 2, over500: 13 };

const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage', 'uploads']);

function collect(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) collect(p, acc); }
    else if (/\.(js|mjs|cjs|ts|vue)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function main() {
  const json = process.argv.includes('--json');

  // ── 1. 分层守卫（复用仓库既有脚本，不重新实现）
  const layerScript = path.join(ROOT, 'server/scripts/check-layers.mjs');
  let layerRaw = '';
  let layerExit = 0;
  try {
    layerRaw = cp.execSync(`node "${layerScript}"`, { cwd: ROOT }).toString();
  } catch (e) {
    layerRaw = (e.stdout || '').toString();
    layerExit = e.status ?? 1;
  }
  const unmigrated = Number((layerRaw.match(/未分层待迁移\s*(\d+)/) || [])[1] ?? NaN);
  const violations = Number((layerRaw.match(/违规\s*(\d+)\s*条/) || [])[1] ?? NaN);

  // ── 2. GodFile 普查
  const files = [...collect(path.join(ROOT, 'server/src')), ...collect(path.join(ROOT, 'client/src'))];
  const sized = files
    .map((f) => {
      // 与 `wc -l` 同口径：按换行符计数，末尾换行不多算一行
      const src = fs.readFileSync(f, 'utf8');
      return { file: path.relative(ROOT, f), lines: (src.match(/\n/g) || []).length };
    })
    .sort((a, b) => b.lines - a.lines);
  const over800 = sized.filter((s) => s.lines > 800);
  const over500 = sized.filter((s) => s.lines > 500);

  const rows = [
    { metric: 'layerViolations', baseline: BASELINE.layerViolations, actual: violations, status: violations > BASELINE.layerViolations ? 'FAIL' : 'PASS' },
    { metric: 'unmigrated', baseline: BASELINE.unmigrated, actual: unmigrated, status: unmigrated > BASELINE.unmigrated ? 'FAIL' : 'PASS' },
    { metric: 'godfileOver800', baseline: BASELINE.godfileOver800, actual: over800.length, status: over800.length > BASELINE.godfileOver800 ? 'FAIL' : 'PASS' },
  ];

  const out = {
    gate: 'arch-metrics',
    rows,
    reference: { over500: { baseline: BASELINE.over500, actual: over500.length } },
    godfile_over800: over800.map((s) => `${s.file} (${s.lines})`),
    godfile_over500: over500.map((s) => `${s.file} (${s.lines})`),
    layerRaw: layerRaw.trim(),
    verdict: rows.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL',
  };

  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log('架构门禁');
    for (const r of rows) console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.metric.padEnd(18)} 基线=${r.baseline}  实测=${r.actual}`);
    console.log(`  · >500 行（观察带，不计判据） 基线=${BASELINE.over500} 实测=${over500.length}`);
    console.log('  GodFile >800 行：' + (over800.length ? out.godfile_over800.join(' / ') : '（无）'));
    console.log('  分层守卫原文：' + layerRaw.trim());
    console.log('结论：' + out.verdict);
  }
  process.exit(out.verdict === 'PASS' ? 0 : 1);
}

try { main(); } catch (e) { console.error('门禁执行错误：' + e.message); process.exit(2); }
