/**
 * selfconsistency-experiment.mjs — 自一致性聚合实验
 *
 * 目的：同提交多次独立 LLM 评分后取中位数/均值，验证聚合是否显著降低"同答案方差"。
 * 设计：3 个样本 × 15 次 legacy 直评（deepseek.gradeProject）→ 按 3 组 × 5 次切分，
 *       计算每组 median/mean → 组间 std vs 单次 std（理论上均值聚合 std 缩减 ~√5）。
 * 用法：cd server && node scripts/selfconsistency-experiment.mjs [--rounds=15] [--groups=3]
 * 输出：server/test-results/trustjudge/selfconsistency-results.json（实时落盘）
 *       docs/experiments/selfconsistency-report.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gradeProject } from '../src/services/deepseek.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const totalRounds = Number((args.find(a => a.startsWith('--rounds=')) || '--rounds=15').split('=')[1]) || 15;
const groups = Number((args.find(a => a.startsWith('--groups=')) || '--groups=3').split('=')[1]) || 3;

const datasetPath = path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'dataset.jsonl');
const lines = fs.readFileSync(datasetPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const byId = new Map(lines.map(r => [r.submissionId, r]));
const TARGETS = [10340, 10342, 10326];
const rows = TARGETS.map(id => byId.get(id)).filter(Boolean);

const resultsPath = path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'selfconsistency-results.json');
const reportPath = path.resolve('/Users/you/My Projects/My Vue/Exam-DeepSeek', 'docs', 'experiments', 'selfconsistency-report.md');

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const mean = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
function std(arr) {
  const m = mean(arr);
  return arr.length > 1 ? Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1)) : 0;
}

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

const report = { generatedAt: new Date().toISOString(), totalRounds, groups, samples: [] };
for (const row of rows) {
  const entry = { submissionId: row.submissionId, studentId: row.studentId, legacyBaseline: row.legacyAiScore, allScores: [], groupStats: [] };
  const tasks = Array.from({ length: totalRounds }, (_, i) => i + 1);
  const res = await mapLimit(tasks, async () => {
    try {
      const r = await gradeProject({
        title: row.question.title,
        description: '',
        scoringRubric: row.question.rubric,
        standardFiles: row.standardFiles,
        studentFiles: row.studentFiles,
      });
      return Math.round(Number(r.totalScore) || 0);
    } catch (e) {
      console.error('round fail:', String(e.message || e).slice(0, 100));
      return null;
    }
  });
  const scores = res.filter(v => v !== null);
  entry.allScores = scores;
  // 按 groups 切组（每组均分 rounds；不够则最后一组少）
  const per = Math.floor(scores.length / groups);
  for (let g = 0; g < groups; g += 1) {
    const slice = scores.slice(g * per, (g + 1) * per);
    if (slice.length < 2) continue;
    entry.groupStats.push({
      group: g + 1,
      scores: slice,
      median: median(slice),
      mean: +mean(slice).toFixed(2),
      std: +std(slice).toFixed(2),
    });
  }
  // 全量单次 std
  entry.singleStd = +std(scores).toFixed(2);
  // 组间聚合 std（各组 median / mean 的 std）
  const medians = entry.groupStats.map(g => g.median);
  const means = entry.groupStats.map(g => g.mean);
  entry.medianOfMedians = +median(medians).toFixed(2);
  entry.meanOfMeans = +mean(means).toFixed(2);
  entry.betweenGroupMedianStd = +std(medians).toFixed(2);
  entry.betweenGroupMeanStd = +std(means).toFixed(2);
  console.log('submission', row.submissionId, 'scores:', JSON.stringify(scores));
  console.log('  singleStd:', entry.singleStd, '| betweenGroupMedianStd:', entry.betweenGroupMedianStd, '| betweenGroupMeanStd:', entry.betweenGroupMeanStd);
  report.samples.push(entry);
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));
}

// 报告
const md = [];
md.push('# 自一致性聚合实验报告 — legacy 直评同提交 ×' + totalRounds + ' → 中位数/均值聚合');
md.push('');
md.push('> 分支：feat/trustjudge-scoring ｜ 作业 353 真实提交 ｜ 生成：' + report.generatedAt);
md.push('> 方法：每样本独立调用 deepseek.gradeProject ×' + totalRounds + '（temperature 0.3），按 ' + groups + ' 组 ×' + Math.floor(totalRounds / groups) + ' 切分，比较单次 std 与组间聚合 std');
md.push('');
md.push('## 明细');
md.push('');
md.push('| submission | 基线 | 全部得分 | 单次 std | 组数 | 组 median | 组间 std | 组 mean | 组间 std |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const s of report.samples) {
  md.push('| ' + s.submissionId + ' | ' + s.legacyBaseline + ' | [' + s.allScores.join(', ') + '] | ' + s.singleStd
    + ' | ' + s.groupStats.length + ' | [' + s.groupStats.map(g => g.median).join(', ') + '] | ' + s.betweenGroupMedianStd
    + ' | [' + s.groupStats.map(g => g.mean).join(', ') + '] | ' + s.betweenGroupMeanStd + ' |');
}
md.push('');
md.push('## 观察与结论');
md.push('');
md.push('（由总控补充：验证聚合是否按 ~√N 缩减组间 std；对比 TrustJudge 与 rule-driven 数据）');
md.push('');
fs.writeFileSync(reportPath, md.join('\n'));
console.log('报告:', reportPath);
console.log('JSON:', resultsPath);
