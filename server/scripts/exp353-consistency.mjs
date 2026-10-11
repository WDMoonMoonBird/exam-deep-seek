/**
 * exp353-consistency.mjs — 作业 353 输出一致性对照实验
 *
 * 目的：回答「从模型输出一致性入手，能把同提交评分方差降到多少」
 * 设计：按【代码内容】去重（62 名学生实际只有少数几种代码），对每种代码跑
 *         arm t03 = temperature 0.3 ×N   （生产现状）
 *         arm t00 = temperature 0   ×N   （输出一致性手段）
 *       两者使用【与生产逐字节相同的 prompt】（复用 buildProjectGradePrompt + PROJECT_ROLE）
 *       与【生产同一个解析器】（extractProjectGradeJson），**唯一变量是 temperature**。
 * 不做：不修改任何生产代码；不写库；不碰生产服务器。
 * 用法：cd server && node scripts/exp353-consistency.mjs [--samples=5] [--concurrency=3] [--smoke]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getApiKey, getBaseUrl, getModel, PROJECT_ROLE, buildProjectGradePrompt } from '../src/infrastructure/ai/deepseek/index.js';
import { extractProjectGradeJson } from '../src/domain/services/deepseek/json-extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SAMPLES = Number(argOf('samples', '5')) || 5;
const CONC = Number(argOf('concurrency', '3')) || 3;
const SMOKE = args.includes('--smoke');
const OUT_JSON = path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'exp353-consistency-results.json');
const OUT_MD = path.resolve(__dirname, '..', '..', 'docs', 'experiments', 'exp353-consistency-report.md');

const datasetPath = path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'dataset.jsonl');
const rows = fs.readFileSync(datasetPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));

// —— 按代码内容去重（62 名学生实际只有少数几种代码）——
const sha = s => crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 12);
const stdSha = sha(rows[0].standardFiles);
const groups = new Map();
for (const r of rows) {
  const key = sha(r.studentFiles);
  if (!groups.has(key)) {
    const delta = Buffer.byteLength(r.studentFiles) - Buffer.byteLength(r.standardFiles);
    groups.set(key, { key, rep: r, count: 0, delta });
  }
  groups.get(key).count += 1;
}
const variants = [...groups.values()].sort((a, b) => a.delta - b.delta);
for (const v of variants) {
  v.tag = v.delta === 0 ? 'A(=标准包)' : (v.delta < -3000 ? 'C(缺文件)' : 'B(有差异)');
}
console.log('=== 数据集 ===');
console.log('  行数:', rows.length, '| 不同代码内容:', variants.length, '| 标准包 sha:', stdSha);
variants.forEach(v => console.log(`  [${v.tag}] sha=${v.key} 代表=${v.rep.submissionId} 人数=${v.count} Δ字节=${v.delta}`));

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = a => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function callOnce(row, temperature) {
  const prompt = buildProjectGradePrompt({
    title: row.question.title, description: '', scoringRubric: row.question.rubric,
    standardFiles: row.standardFiles, studentFiles: row.studentFiles,
  });
  const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const res = await fetch(BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'system', content: PROJECT_ROLE }, { role: 'user', content: prompt }],
          temperature, max_tokens: 16000,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 429) { await new Promise(r => setTimeout(r, [10, 30, 60][attempt - 1] * 1000)); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const choice = (data.choices || [])[0] || {};
      const content = (choice.message || {}).content || '';
      const parsed = extractProjectGradeJson(content);
      if (!parsed) return { score: null, err: 'parse_fail', finish: choice.finish_reason, len: content.length, usage: data.usage };
      const raw = Number(parsed.totalScore);
      const max = Number(row.question.maxScore) || 100;
      const score = Math.max(0, Math.min(max, Math.round(raw)));
      return { score, raw, err: null, finish: choice.finish_reason, usage: data.usage, breakdown: (parsed.breakdown || []).length };
    } catch (e) { clearTimeout(timer); if (attempt === 3) return { score: null, err: String(e.message || e).slice(0, 60) }; await new Promise(r => setTimeout(r, 3000)); }
  }
  return { score: null, err: 'exhausted' };
}

async function mapLimit(items, fn, limit) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const report = { generatedAt: new Date().toISOString(), samples: SAMPLES, concurrency: CONC, model: null, variants: [] };

if (SMOKE) {
  const v = variants[0];
  console.log('=== 冒烟测试：1 次调用（' + v.tag + ' ' + v.rep.submissionId + '）===');
  const t0 = Date.now();
  const r = await callOnce(v.rep, 0.3);
  console.log('  结果:', JSON.stringify(r).slice(0, 300));
  console.log('  耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  process.exit(0);
}

report.model = await getModel();
const baseUrl = await getBaseUrl();
console.log('=== 开始：模型=' + report.model + ' baseUrl=' + baseUrl + ' 每变体 ' + SAMPLES + ' 次 × 2 臂 ===');
const tasks = [];
for (const v of variants) for (const temp of [0.3, 0]) for (let s = 1; s <= SAMPLES; s += 1) tasks.push({ v, temp, s });
console.log('  总调用数:', tasks.length);

let done = 0;
const results = await mapLimit(tasks, async (t) => {
  const r = await callOnce(t.v.rep, t.temp);
  done += 1;
  if (done % 5 === 0 || done === tasks.length) console.log('  进度 ' + done + '/' + tasks.length + ' 最新: ' + t.v.rep.submissionId + ' temp=' + t.temp + ' -> ' + r.score + (r.err ? ' (' + r.err + ')' : ''));
  return { ...t, ...r };
}, CONC);

for (const v of variants) {
  const pick = temp => results.filter(r => r.v.key === v.key && r.temp === temp && r.score !== null).map(r => r.score);
  const t03 = pick(0.3), t00 = pick(0);
  report.variants.push({
    tag: v.tag, sha: v.key, rep: v.rep.submissionId, count: v.count, delta: v.delta,
    t03: { scores: t03, mean: t03.length ? +mean(t03).toFixed(2) : null, std: t03.length ? +std(t03).toFixed(2) : null, min: t03.length ? Math.min(...t03) : null, max: t03.length ? Math.max(...t03) : null, median: t03.length ? median(t03) : null },
    t00: { scores: t00, mean: t00.length ? +mean(t00).toFixed(2) : null, std: t00.length ? +std(t00).toFixed(2) : null, min: t00.length ? Math.min(...t00) : null, max: t00.length ? Math.max(...t00) : null, median: t00.length ? median(t00) : null },
  });
}
// 聚合指标：各变体 std 的均值（等权）
const agg = arm => { const s = report.variants.map(v => v[arm].std).filter(x => x !== null); return { meanOfStds: +mean(s).toFixed(2), maxStd: Math.max(...s), sumCalls: SAMPLES }; };
report.aggregate = { t03: agg('t03'), t00: agg('t00') };
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
console.log('=== 汇总 ===');
console.log('  t03(生产现状) 各变体 std 均值:', report.aggregate.t03.meanOfStds, '| 最大 std:', report.aggregate.t03.maxStd);
console.log('  t00(temp 0)   各变体 std 均值:', report.aggregate.t00.meanOfStds, '| 最大 std:', report.aggregate.t00.maxStd);
console.log('  结果已写入:', OUT_JSON);
// 生成 markdown
const md = [];
md.push('# 作业 353 · 输出一致性对照实验（temperature 0.3 vs 0）');
md.push('');
md.push('> 生成：' + report.generatedAt + ' ｜ 模型：' + report.model + ' ｜ 每臂每变体 ' + SAMPLES + ' 次 ｜ 总调用 ' + tasks.length);
md.push('> 方法与生产**逐字节相同的 prompt**（buildProjectGradePrompt + PROJECT_ROLE）与**同一个解析器**（extractProjectGradeJson），**唯一变量 = temperature**。');
md.push('');
md.push('## 汇总');
md.push('');
md.push('| 臂 | 各变体 std 的均值 | 最大 std |');
md.push('|---|---|---|');
md.push('| t03 = temperature 0.3（生产现状） | **' + report.aggregate.t03.meanOfStds + '** | ' + report.aggregate.t03.maxStd + ' |');
md.push('| t00 = temperature 0 | **' + report.aggregate.t00.meanOfStds + '** | ' + report.aggregate.t00.maxStd + ' |');
md.push('');
md.push('## 逐变体明细');
md.push('');
md.push('| 组 | 代表提交 | 人数 | Δ字节 | t03 分数 | t03 mean | t03 std | t00 分数 | t00 mean | t00 std |');
md.push('|---|---|---|---|---|---|---|---|---|---|');
for (const v of report.variants) {
  md.push('| ' + v.tag + ' | ' + v.rep + ' | ' + v.count + ' | ' + v.delta + ' | ' + JSON.stringify(v.t03.scores) + ' | ' + v.t03.mean + ' | **' + v.t03.std + '** | ' + JSON.stringify(v.t00.scores) + ' | ' + v.t00.mean + ' | **' + v.t00.std + '** |');
}
fs.writeFileSync(OUT_MD, md.join('\n') + '\n');
console.log('  报告已写入:', OUT_MD);
