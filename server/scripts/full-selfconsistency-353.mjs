/**
 * full-selfconsistency-353.mjs — 作业 353 全量自一致性聚合评分
 *
 * 策略：62 名学生按 studentFiles 内容哈希分组（实测 6 组）→ 每组代表 ×10 次 legacy 直评
 *       → 中位数/均值聚合 → 映射回组内全部学生。
 * 等价性：同组内容逐字节相同，LLM 输入相同 → 组内共用采样分布；组内 10 次采样
 *         同时量化该代码的跨调用波动（std/range）。
 *
 * 输出（实时落盘）：server/test-results/trustjudge/full-353-results.json
 * 用法：cd server && node scripts/full-selfconsistency-353.mjs [--rounds=10]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { gradeProject } from '../src/infrastructure/ai/deepseek/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const rounds = Number((args.find(a => a.startsWith('--rounds=')) || '--rounds=10').split('=')[1]) || 10;

const datasetPath = path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'dataset.jsonl');
const resultsPath = path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'full-353-results.json');
const lines = fs.readFileSync(datasetPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));

// DB：补全 students 的 best/final（展示用）
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\s]+)/)[1];
const conn = await mysql.createConnection({ uri: dbUrl });
const [dbRows] = await conn.query(
  'SELECT id, student_id, ai_score, best_score, final_score, status FROM submissions WHERE id IN (?)',
  [lines.map(r => r.submissionId)]
);
await conn.end();
const dbMap = new Map(dbRows.map(r => [r.id, r]));

// 1) 内容分组
const stdHash = crypto.createHash('sha256').update(lines[0].standardFiles).digest('hex');
const groups = new Map();
for (const row of lines) {
  const h = crypto.createHash('sha256').update(row.studentFiles).digest('hex');
  if (!groups.has(h)) groups.set(h, { hash: h, isStdCopy: h === stdHash, rep: row, members: [] });
  groups.get(h).members.push(row);
}

// 2) 每组代表 ×rounds 次评分
const groupList = [...groups.values()];
const results = { generatedAt: new Date().toISOString(), rounds, groups: [] };

async function mapLimit(items, worker, concurrency = 3) {
  const out = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

const mean = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
function std(arr) {
  const m = mean(arr);
  return arr.length > 1 ? Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1)) : 0;
}
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

for (const g of groupList) {
  const q = g.rep.question;
  const tasks = Array.from({ length: rounds }, () => ({}));
  const scores = [];
  const res = await mapLimit(tasks, async () => {
    try {
      const r = await gradeProject({
        title: q.title,
        description: '',
        scoringRubric: q.rubric,
        standardFiles: g.rep.standardFiles,
        studentFiles: g.rep.studentFiles,
      });
      const s = Math.round(Number(r.totalScore) || 0);
      scores.push(s);
      return s;
    } catch (e) {
      console.error('  round fail:', String(e.message || e).slice(0, 80));
      return null;
    }
  });
  const valid = res.filter(v => v !== null);
  const entry = {
    hash: g.hash.slice(0, 8),
    isStdCopy: g.isStdCopy,
    memberCount: g.members.length,
    scores: valid,
    mean: +mean(valid).toFixed(2),
    median: median(valid),
    std: +std(valid).toFixed(2),
    min: valid.length ? Math.min(...valid) : null,
    max: valid.length ? Math.max(...valid) : null,
    members: g.members.map(m => {
      const db = dbMap.get(m.submissionId) || {};
      return {
        submissionId: m.submissionId,
        studentId: m.studentId,
        legacyAiScore: m.legacyAiScore,
        dbBest: db.best_score,
        dbFinal: db.final_score,
        status: db.status,
      };
    }),
  };
  console.log('组 ' + entry.hash + (entry.isStdCopy ? '(标准包)' : '') + ' | ' + entry.memberCount + ' 人 | 聚合分 mean=' + entry.mean + ' median=' + entry.median + ' std=' + entry.std + ' | scores=' + JSON.stringify(valid));
  results.groups.push(entry);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
}
console.log('DONE 全部组完成，结果:', resultsPath);
