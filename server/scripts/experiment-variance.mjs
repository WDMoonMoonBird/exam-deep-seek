#!/usr/bin/env node
/**
 * experiment-variance.mjs — Team C 方差实验：LLM 直评（重复 N 次） vs 确定性规则评分（RQ6 证据）
 *
 * 依据：docs/plan/2026-08-18-batch-c-playbook.md 交付物 1。
 * 设计：
 *   - 输入：作业 id（默认 311）→ 取该作业下 project 类型提交的工程目录列表（每学生最新版本）
 *   - LLM 直评：调用 server/src/services/deepseek.js 的 gradeProject 对同一工程重复 N 次（默认 5），
 *     记录每次 totalScore；任一调用失败 → 跳过该工程并记录（gradeProject 内部已重试 3 次）
 *   - 确定性评分：复用规则评分链路（ruleExecutor.runRules）对同一工程评一次（确定性，同分）
 *   - 采样：默认取前 LIMIT（默认 5）个工程（LLM 调用成本控制，可配）
 *   - 输出：docs/experiments/variance-report.md（真实模式）+ stdout 汇总
 *
 * 模式：
 *   --dry          不调 LLM，用作业 311 工程列表打印统计结构验证正确性
 *                   （DB 不可达时回退合成演示列表，标注 synthetic，保证任何环境可验证）
 *   （默认）        真实模式：真实 DB + 真实 LLM 调用（由总控执行）
 *
 * 参数：
 *   --assignment=311   作业 id（默认 311）
 *   --limit=5          采样工程数（默认 5）
 *   --n=5              LLM 重复次数 N（默认 5）
 *   --out=<path>       报告输出路径（默认 docs/experiments/variance-report.md）
 *
 * 统计纯函数 summarizeVariance 导出供单测（server/test/unit/infrastructure/experiment-variance.test.js）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 显式加载 server/.env（无论从哪个 cwd 运行脚本，真实模式都能拿到 DATABASE_URL/DEEPSEEK 配置）
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REPORT = path.join(REPO_ROOT, 'docs', 'experiments', 'variance-report.md');

// ===================== 统计纯函数（导出供单测） =====================

/**
 * 样本统计：mean / std（样本标准差）/ min / max / range。
 * 约定：空数组 → mean=0、std=0、min/max/range=null（调用方跳过无样本工程）；
 *       单值 → mean=值、std=0（n=1 时样本方差无定义，按 0 处理）；
 *       非数值项被过滤（不参与统计）。
 * @param {Array<number>} samples 分数样本
 * @returns {{mean: number, std: number, min: number|null, max: number|null, range: number|null}}
 */
export function summarizeVariance(samples) {
  const arr = (Array.isArray(samples) ? samples : [])
    .filter((n) => typeof n === 'number' && Number.isFinite(n));
  const n = arr.length;
  if (n === 0) return { mean: 0, std: 0, min: null, max: null, range: null };
  const mean = arr.reduce((s, x) => s + x, 0) / n;
  // 样本标准差（贝塞尔校正）：sqrt(Σ(x-mean)² / (n-1))；n=1 无样本方差 → 0
  const std = n > 1 ? Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  return { mean, std, min, max, range: max - min };
}

/** 确定性种子伪随机（mulberry32）：dry-run 演示样本可复现，不依赖 Math.random */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===================== 参数解析 =====================

function parseArgs(argv) {
  const args = { assignment: 311, limit: 5, n: 5, dry: false, out: DEFAULT_REPORT };
  for (const a of argv) {
    if (a === '--dry') { args.dry = true; continue; }
    const m = a.match(/^--([a-z]+)=(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (key === 'assignment') args.assignment = Number(raw) || 311;
    else if (key === 'limit') args.limit = Math.max(1, Number(raw) || 5);
    else if (key === 'n') args.n = Math.max(1, Number(raw) || 5);
    else if (key === 'out') args.out = path.resolve(REPO_ROOT, raw);
  }
  return args;
}

// ===================== 工程列表（真实模式：DB；dry 回退合成） =====================

/**
 * 取作业下 project 类型提交的工程列表（每学生最新可评分版本）。
 * 返回 [{ submissionId, studentId, questionId, version, title, maxScore, stuDir, stdDir, question }]
 */
async function listProjectsFromDb(assignmentId, prisma) {
  const subs = await prisma.submission.findMany({
    where: { assignmentId: +assignmentId, question: { type: 'project' } },
    include: {
      question: {
        select: {
          id: true, title: true, material: true, scoringRubric: true, maxScore: true,
          type: true, checkerScript: true, checkerStatus: true, checkerMeta: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  const { parseProjectAnswer } = await import('../src/utils/projectView.js');
  const { standardDir, submissionDir } = await import('../src/utils/projectPaths.js');
  const out = [];
  for (const s of subs) {
    const env = parseProjectAnswer(s.answer);
    const version = env.currentVersion;
    if (!version || version < 1) continue;
    const stuDir = submissionDir(s.questionId, s.studentId, version);
    if (!fs.existsSync(stuDir)) continue;
    out.push({
      submissionId: s.id,
      studentId: s.studentId,
      questionId: s.questionId,
      version,
      title: (s.question && s.question.title) || ('submission#' + s.id),
      maxScore: (s.question && Number(s.question.maxScore)) || 100,
      stuDir,
      stdDir: standardDir(s.questionId),
      question: s.question,
    });
  }
  return out;
}

/** dry-run 演示工程列表（DB 不可达时回退；生成 demo 样本的结构与真实一致） */
function syntheticProjects(args) {
  const out = [];
  for (let i = 1; i <= args.limit; i++) {
    out.push({
      submissionId: 900000 + i,
      studentId: 100000 + i,
      questionId: 31100 + i,
      version: 1,
      title: 'synthetic-demo-' + i + '（DB 不可达演示）',
      maxScore: 100,
      stuDir: '/nonexistent/project-' + i,
      stdDir: '/nonexistent/standard-' + i,
      question: { checkerScript: null, checkerStatus: 'none', checkerMeta: null },
      synthetic: true,
    });
  }
  return out;
}

// ===================== 评分执行 =====================

/** LLM 直评：对同一工程重复 N 次 gradeProject；任一失败抛错（调用方跳过该工程） */
async function gradeProjectRepeated(project, n, args) {
  const { gradeProject } = await import('../src/services/deepseek.js');
  const { buildGradingContext } = await import('../src/services/projectGrading.js');
  const { getProjectContextMode } = await import('../src/services/deepseek.js');
  const mode = await getProjectContextMode();
  const ctx = await buildGradingContext({
    mode,
    stdDir: project.stdDir,
    stuDir: project.stuDir,
    question: project.question,
  });
  const samples = [];
  for (let i = 1; i <= n; i++) {
    try {
      const res = await gradeProject({
        title: project.title,
        description: (project.question && project.question.material) || '',
        scoringRubric: (project.question && project.question.scoringRubric) || '',
        standardFiles: ctx.standardFiles,
        studentFiles: ctx.studentFiles,
        // LLM 直评：不注入固定分项（对比确定性链路的自由分项形态，测模型自身波动）
        fixedItems: null,
      });
      const score = Math.max(0, Math.min(project.maxScore, Math.round(Number(res && res.totalScore) || 0)));
      samples.push(score);
    } catch (err) {
      throw new Error('LLM 直评第 ' + i + ' 次失败：' + (err && err.message ? err.message : String(err)));
    }
  }
  return samples;
}

/** 确定性评分：复用规则评分链路（ruleExecutor.runRules），规则缺失 → null */
async function gradeDeterministic(project) {
  const script = project.question && typeof project.question.checkerScript === 'string'
    ? project.question.checkerScript
    : null;
  if (!script || !script.trim()) return null;
  let rules;
  try { rules = JSON.parse(script); } catch { return null; }
  if (!rules || !Array.isArray(rules.objective_items)) return null;
  const { runRules } = await import('../src/infrastructure/rule/index.js');
  const res = await runRules(rules, project.stuDir);
  return Math.min(project.maxScore, Math.max(0, Number(res && res.totalScore) || 0));
}

// ===================== 报告构建 =====================

function fmt(v, digits = 2) {
  return v === null || v === undefined ? '—' : Number(v).toFixed(digits);
}

/** 构建 markdown 报告（纯函数，dry-run 也用它打印结构预览） */
export function buildReport(args, rows, meta) {
  const lines = [];
  lines.push('# 方差实验报告 — LLM 直评 ×' + args.n + ' vs 确定性规则评分');
  lines.push('');
  lines.push('> 作业：' + args.assignment + '　采样工程数：' + rows.length + '（LIMIT=' + args.limit + '）　LLM 重复次数：N=' + args.n);
  lines.push('> 生成时间：' + new Date().toISOString() + (meta.synthetic ? '　⚠ 数据源：合成演示（DB 不可达）' : '　数据源：真实评分'));
  lines.push('> 说明：LLM 直评 = gradeProject 自由分项（temperature 0.3）；确定性 = ruleExecutor.runRules（零 token、同分）；std 为 LLM 样本标准差（样本方差，n-1）。');
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|---|---|');
  lines.push('| 参与统计工程数 | ' + rows.length + ' |');
  lines.push('| LLM 调用次数（成功） | ' + meta.llmCalls + ' |');
  lines.push('| 平均 std（LLM 样本） | ' + fmt(meta.avgStd) + ' |');
  lines.push('| std 波动区间 | [' + fmt(meta.minStd) + ', ' + fmt(meta.maxStd) + '] |');
  lines.push('| 同分率（LLM 重复 ' + args.n + ' 次全部同分占比） | ' + fmt(meta.sameRate * 100, 1) + '% |');
  lines.push('| LLM mean vs deterministic 平均绝对偏差 | ' + fmt(meta.avgAbsDelta) + ' |');
  lines.push('| 跳过工程（LLM 失败/无版本目录） | ' + meta.skipped.length + ' |');
  if (meta.skipped.length > 0) {
    lines.push('');
    lines.push('### 跳过清单');
    lines.push('');
    for (const s of meta.skipped) lines.push('- ' + s.id + ' 「' + s.title + '」：' + s.reason);
  }
  lines.push('');
  lines.push('## 明细');
  lines.push('');
  lines.push('| # | 工程 | deterministic | LLM 样本 | mean | std | min | max | range | Δstd |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    lines.push('| ' + (i + 1) + ' | 「' + r.title + '」 | ' + fmt(r.deterministic) + ' | [' + r.samples.join(', ') + '] | '
      + fmt(r.stats.mean) + ' | ' + fmt(r.stats.std) + ' | ' + fmt(r.stats.min) + ' | ' + fmt(r.stats.max)
      + ' | ' + fmt(r.stats.range) + ' | ' + fmt(r.deltaStd) + ' |');
  });
  lines.push('');
  return lines.join('\n') + '\n';
}

// ===================== 主流程 =====================

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { default: prisma } = await import('../src/utils/prisma.js');

  // 1) 工程列表：DB 可达 → 作业工程列表；DB 不可达（仅 dry 模式）→ 合成列表
  let projects = null;
  let dbOk = false;
  try {
    projects = await listProjectsFromDb(args.assignment, prisma);
    dbOk = true;
  } catch (err) {
    if (!args.dry) {
      console.error('✗ DB 不可达，真实模式无法继续：' + (err && err.message ? err.message : String(err)));
      console.error('  请确认 server/.env 的 DATABASE_URL 指向可用库后重试。');
      process.exit(1);
    }
    console.warn('⚠ DB 不可达（' + (err && err.message ? err.message : String(err)) + '），dry-run 回退合成演示工程列表。');
    projects = syntheticProjects(args);
  }
  projects = projects.slice(0, args.limit);

  console.log('===== experiment-variance.mjs =====');
  console.log('模式：' + (args.dry ? 'dry-run（不调 LLM）' : '真实（LLM ×' + args.n + '）')
    + '　作业：' + args.assignment + '　工程数：' + projects.length + '　N=' + args.n
    + (dbOk ? '' : '　[synthetic]'));

  const rows = [];
  const skipped = [];
  let llmCalls = 0;

  for (let idx = 0; idx < projects.length; idx++) {
    const p = projects[idx];
    const label = '[' + (idx + 1) + '/' + projects.length + '] ' + p.title + ' (submission#' + p.submissionId + ')';

    // dry-run：用可复现的演示样本验证统计结构（不调 LLM）
    let samples;
    if (args.dry) {
      const rnd = seededRandom(311 * 1000 + p.submissionId);
      const base = 70 + Math.floor(rnd() * 25); // 70~94
      samples = Array.from({ length: args.n }, (_, k) =>
        Math.max(0, Math.min(p.maxScore, base + Math.round((rnd() - 0.5) * (idx % 3 === 0 ? 16 : 6)))));
    } else {
      try {
        samples = await gradeProjectRepeated(p, args.n, args);
        llmCalls += samples.length;
      } catch (err) {
        console.warn('  跳过 ' + label + '：' + err.message);
        skipped.push({ id: p.submissionId, title: p.title, reason: err.message });
        continue;
      }
    }

    let deterministic = null;
    if (args.dry) {
      const rnd = seededRandom(311 * 2000 + p.submissionId);
      deterministic = p.synthetic ? Math.round(70 + rnd() * 20) : null; // 合成工程给演示值
    } else {
      try { deterministic = await gradeDeterministic(p); }
      catch (err) { deterministic = null; }
    }

    const stats = summarizeVariance(samples);
    rows.push({
      title: p.title,
      submissionId: p.submissionId,
      deterministic,
      samples,
      stats,
      deltaStd: stats.std, // 确定性 std 恒为 0 → Δstd = LLM std
    });
    console.log('  ✓ ' + label + ' → samples=[' + samples.join(', ') + '] mean=' + stats.mean.toFixed(2)
      + ' std=' + stats.std.toFixed(3) + ' deterministic=' + (deterministic === null ? 'N/A(无规则)' : deterministic));
  }

  // 2) 汇总统计
  const stds = rows.map(r => r.stats.std);
  const avgStd = stds.length ? stds.reduce((s, x) => s + x, 0) / stds.length : 0;
  const minStd = stds.length ? Math.min(...stds) : 0;
  const maxStd = stds.length ? Math.max(...stds) : 0;
  const sameRate = rows.length ? rows.filter(r => r.stats.std === 0).length / rows.length : 0;
  const withDet = rows.filter(r => r.deterministic !== null && r.deterministic !== undefined);
  const avgAbsDelta = withDet.length
    ? withDet.reduce((s, r) => s + Math.abs(r.deterministic - r.stats.mean), 0) / withDet.length
    : null;

  const report = buildReport(args, rows, {
    synthetic: !dbOk, llmCalls, avgStd, minStd, maxStd, sameRate, avgAbsDelta, skipped,
  });

  // 3) 输出
  if (args.dry) {
    console.log('\n----- 统计结构预览（dry-run，不调 LLM）-----');
    console.log(report);
    console.log('----- dry-run 完成：统计结构正确（真实模式将写入报告文件）-----');
  } else {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, report, 'utf-8');
    console.log('\n✔ 报告已写入：' + args.out);
  }
  console.log('汇总：平均 std=' + avgStd.toFixed(3) + '　std 区间=[' + minStd.toFixed(3) + ', ' + maxStd.toFixed(3)
    + ']　同分率=' + (sameRate * 100).toFixed(1) + '%　跳过=' + skipped.length);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('✗ 实验脚本执行失败：', err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}
