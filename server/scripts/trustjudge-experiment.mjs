/**
 * trustjudge-experiment.mjs — D 实验：同提交 legacy 直评 ×5 vs TrustJudge ×5 方差对比
 *
 * 用法：cd server && node scripts/trustjudge-experiment.mjs [--limit=3] [--rounds=5] [--out=docs/experiments/trustjudge-variance-report.md]
 * 输入：server/test-results/trustjudge/dataset.jsonl（C 产物）
 * legacy 链路：deepseek.gradeProject（temperature 0.3，DB system_configs key 已修复）
 * trustjudge 链路：trustJudgeGrader.gradeProjectTrustJudge（sidecar 127.0.0.1:8901）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gradeProject } from '../src/infrastructure/ai/deepseek/index.js';
import { gradeProjectTrustJudge } from '../src/services/trustJudgeGrader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const limit = Number((args.find(a => a.startsWith('--limit=')) || '--limit=3').split('=')[1]) || 3;
const rounds = Number((args.find(a => a.startsWith('--rounds=')) || '--rounds=5').split('=')[1]) || 5;
const outPath = path.resolve(__dirname, '..', '..', 'docs', 'experiments', 'trustjudge-variance-report.md');

const datasetPath = path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'dataset.jsonl');
const lines = fs.readFileSync(datasetPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const byId = new Map(lines.map(r => [r.submissionId, r]));
const TARGETS = [10340, 10342, 10326].slice(0, limit);
const rows = TARGETS.map(id => byId.get(id)).filter(Boolean);
console.log('样本:', rows.map(r => r.submissionId + '(legacy=' + r.legacyAiScore + ')').join(', '));

function summarize(samples) {
  const arr = samples.filter(n => typeof n === 'number' && Number.isFinite(n));
  const n = arr.length;
  if (n === 0) return { mean: 0, std: 0, min: null, max: null, range: null, scores: [] };
  const mean = arr.reduce((s, x) => s + x, 0) / n;
  const std = n > 1 ? Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean: +mean.toFixed(2), std: +std.toFixed(2), min: Math.min(...arr), max: Math.max(...arr), range: Math.max(...arr) - Math.min(...arr), scores: arr };
}

async function runOne(row, mode, attempt) {
  const q = row.question;
  const ctx = { title: q.title, description: '', scoringRubric: q.rubric, standardFiles: row.standardFiles, studentFiles: row.studentFiles };
  if (mode === 'legacy') {
    const r = await gradeProject(ctx);
    return { total: Math.round(Number(r.totalScore) || 0) };
  }
  const r = await gradeProjectTrustJudge(ctx);
  return { total: Math.round(Number(r.totalScore) || 0), raw: Number(r.totalScore) || 0 };
}

// 并发控制：3 路并行
async function mapLimit(items, worker, concurrency = 3) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

const report = { generatedAt: new Date().toISOString(), rounds, samples: [] };
for (const row of rows) {
  const entry = { submissionId: row.submissionId, studentId: row.studentId, legacyAiScore: row.legacyAiScore, rounds: [] };
  // legacy ×N
  const legacyTasks = Array.from({ length: rounds }, (_, i) => ({ mode: 'legacy', attempt: i + 1 }));
  const legacyRes = await mapLimit(legacyTasks, async (t) => {
    try { return await runOne(row, t.mode, t.attempt); } catch (e) { return { total: null, err: String(e.message || e).slice(0, 120) }; }
  });
  const legacyScores = legacyRes.map(r => r.total).filter(v => v !== null && v !== undefined);
  console.log('submission', row.submissionId, 'legacy scores:', JSON.stringify(legacyScores));
  // trustjudge ×N
  const tjTasks = Array.from({ length: rounds }, (_, i) => ({ mode: 'trustjudge', attempt: i + 1 }));
  const tjRes = await mapLimit(tjTasks, async (t) => {
    try { return await runOne(row, t.mode, t.attempt); } catch (e) { return { total: null, err: String(e.message || e).slice(0, 120) }; }
  });
  const tjScores = tjRes.map(r => r.total).filter(v => v !== null && v !== undefined);
  console.log('submission', row.submissionId, 'trustjudge scores:', JSON.stringify(tjScores));
  entry.rounds.push({
    legacy: summarize(legacyScores),
    trustjudge: summarize(tjScores),
    legacyRaw: legacyRes.map(r => r.total),
    tjRaw: tjRes.map(r => ({ total: r.total, raw: r.raw })),
  });
  report.samples.push(entry);
  // 实时落盘（防止 stdout 流丢失；JSON 幂等，可续跑）
  fs.writeFileSync(path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'experiment-results.json'), JSON.stringify(report, null, 2));
}

// 汇总
const agg = { legacy: summarize(report.samples.flatMap(s => s.rounds[0].legacy.scores)), trustjudge: summarize(report.samples.flatMap(s => s.rounds[0].trustjudge.scores)) };
report.summary = agg;

// 写报告
const mdLines = [
  '# TrustJudge 方差实验报告 — legacy 直评 ×' + rounds + ' vs TrustJudge ×' + rounds,
  '',
  '> 分支：feat/trustjudge-scoring ｜ 作业 353（用户管理系统前端）｜ 数据源：真实提交（server/test-results/trustjudge/dataset.jsonl）',
  '> 生成：' + report.generatedAt,
  '',
  '## 汇总',
  '',
  '| 指标 | legacy 直评 | TrustJudge |',
  '|---|---|---|',
  '| 参与提交数 | ' + report.samples.length + ' | ' + report.samples.length + ' |',
  '| 平均 std | ' + agg.legacy.std + ' | ' + agg.trustjudge.std + ' |',
  '| 同分率（全部重复同分占比） | — | — |',
  '',
  '## 明细',
  '',
  '| # | submission | legacy 基线 | legacy ×' + rounds + ' | std | TrustJudge ×' + rounds + ' | std |',
  '|---|---|---|---|---|---|---|',
];

for (const s of report.samples) {
  const l = s.rounds[0].legacy;
  const t = s.rounds[0].trustjudge;
  mdLines.push('| ' + s.submissionId + ' | ' + s.studentId + ' | ' + s.legacyAiScore + ' | '
    + '[' + l.scores.join(', ') + '] | ' + l.std + ' | '
    + '[' + t.scores.join(', ') + '] | ' + t.std + ' |');
}
mdLines.push('', '## 结论', '', '（由总控补充）', '');
fs.writeFileSync(outPath, mdLines.join('\n'));
console.log('报告已写入:', outPath);
console.log('AGG legacy mean/std:', JSON.stringify(agg.legacy));
console.log('AGG trustjudge mean/std:', JSON.stringify(agg.trustjudge));
