#!/usr/bin/env node
/**
 * trustjudge-dataset.mjs — TrustJudge 评分对照实验数据集构建（只读，可重复运行）
 *
 * 目标：为「同一份学生答案多次评分差距大」复现与 TrustJudge sidecar 评分对照实验
 * 提供输入集——每行 = 某学生在题目 353 下「最新一次提交」的评分上下文：
 *   - studentFiles  : 学生磁盘版本目录经 L0 白名单过滤（filterProjectFiles + readKeptFiles）后的正文文本；
 *                     与 server/src/services/projectGrading.js buildGradingContext(mode='filter') 产出一致。
 *   - standardFiles : 标准工程包同样处理（全部提交相同，每行重复，sidecar 调用简单）。
 *   - question      : 题目 id / title / maxScore / scoring_rubric。
 *
 * 与真实评分链路一致性的实现方式：
 *   复用 server/src/services/projectContextBuilder.js（buildFileTree / filterProjectFiles，
 *   纯函数模块）与 utils/projectPaths.js、utils/projectView.js（parseProjectAnswer），
 *   按 projectGrading.js 中私有 readKeptFiles/readDirFiles 的等价逻辑组装文本（此处镜像实现，
 *   便于脚本零副作用离线运行；语义/格式与实评完全一致：L0 为空时降级为全量注入）。
 *
 * 纪律：
 *   - 只读：仅 SELECT 数据库、只读磁盘目录；绝不写库、绝不改 src。
 *   - 输出：server/test-results/trustjudge/dataset.jsonl（目录自动创建）。
 *
 * 用法：node scripts/trustjudge-dataset.mjs [questionId]   （默认 353）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { standardDir, submissionDir } from '../src/utils/projectPaths.js';
import {
  buildFileTree,
  filterProjectFiles,
  estimateTokens,
  BUDGET_TOKENS,
} from '../src/services/projectContextBuilder.js';
import { parseProjectAnswer } from '../src/domain/services/project-view.js';
import { isIgnored } from '../src/utils/fileTree.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const QUESTION_ID = Number(process.argv[2] || 353);
const OUT_FILE = path.join(SERVER_ROOT, 'test-results', 'trustjudge', 'dataset.jsonl');
const MAX_TEXT_BYTES = 1024 * 1024; // 与 utils/projectArchive.js 一致（readDirFiles 降级用）

// ---------- 读 server/.env 的 DATABASE_URL（只读连接串，不做任何 env 副作用） ----------
function loadDatabaseUrl() {
  const envPath = path.join(SERVER_ROOT, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = /^DATABASE_URL=(.+)$/m.exec(raw);
  if (!m) throw new Error('server/.env 缺少 DATABASE_URL');
  return m[1].trim();
}

// ---------- 文本组装（镜像 projectGrading.js 私有函数，保证与实评逐字节一致） ----------
function readFileSafe(abs) {
  try { return fs.readFileSync(abs, 'utf-8'); } catch { return ''; }
}

/** 镜像 projectGrading.js readDirFiles：忽略名单 + >1MB 跳过（mode='off' 降级用） */
function readDirFiles(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const walk = (base, rel = '') => {
    let entries;
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isIgnored(entry.name)) continue;
        walk(path.join(base, entry.name), rel + entry.name + '/');
      } else if (entry.isFile()) {
        if (isIgnored(entry.name)) continue;
        const abs = path.join(base, entry.name);
        const relPath = rel + entry.name;
        try {
          const { size } = fs.statSync(abs);
          if (size > MAX_TEXT_BYTES) {
            out.push(`// 文件过大（${relPath}，${(size / 1024 / 1024).toFixed(2)} MB），已跳过评分内容`);
            continue;
          }
          out.push(`// 文件名: ${relPath}\n${fs.readFileSync(abs, 'utf-8')}`);
        } catch { /* 单文件读取失败不影响整体 */ }
      }
    }
  };
  walk(dir);
  return out;
}

/** 镜像 projectGrading.js readKeptFiles：fold 文件折叠为占位行 */
function readKeptFiles(kept, base) {
  return kept
    .filter((f) => !f.dir)
    .map((f) => (f.fold
      ? `// 文件过大（${f.path}，${(f.size / 1024 / 1024).toFixed(2)} MB），已跳过评分内容`
      : `// 文件名: ${f.path}\n${readFileSafe(path.join(base, f.path))}`))
    .join('\n\n');
}

/**
 * 单侧文本：L0 白名单过滤优先；L0 为空时降级全量注入
 * （同 buildGradingContext：studentText 为空则整单降级 off 全量，见 projectGrading.js）。
 * @returns {{ text: string, exists: boolean, note: string }}
 */
function buildSideText(dir) {
  let exists = false;
  try { exists = Boolean(dir) && fs.existsSync(dir) && fs.statSync(dir).isDirectory(); } catch { exists = false; }
  if (!exists) return { text: '', exists: false, note: 'missing-dir' };
  const tree = buildFileTree(dir);
  if (!tree.length) return { text: '', exists: true, note: 'empty-tree' };
  const kept = filterProjectFiles(tree, dir).kept;
  const text = readKeptFiles(kept, dir);
  if (!text.trim()) {
    // L0 无正文 → 与实评相同：整单降级为全量注入（mode='off'）
    return { text: readDirFiles(dir).join('\n\n'), exists: true, note: 'l0-empty-fallback-full' };
  }
  return { text, exists: true, note: 'l0-filter' };
}

/** 双端上下文（镜像 buildGradingContext mode='filter'：任一空 → 双端全量降级） */
function buildContext(stdDir, stuDir) {
  const std = buildSideText(stdDir);
  const stu = buildSideText(stuDir);
  if (!stu.text.trim()) {
    // 降级模式（与实评一致）：双端都用 readDirFiles 全量注入
    return {
      standardFiles: std.exists ? readDirFiles(stdDir).join('\n\n') : '(无标准工程文件)',
      studentFiles: stu.text,
      note: stu.exists ? 'off-full' : 'missing-dir',
    };
  }
  return {
    standardFiles: std.text.trim() ? std.text : '(无标准工程文件)',
    studentFiles: stu.text,
    note: stu.note,
  };
}

// ---------- 主流程 ----------
async function main() {
  const dbUrl = loadDatabaseUrl();
  const conn = await mysql.createConnection({ uri: dbUrl });

  // 1) 题目信息
  const [[q]] = await conn.query(
    'SELECT id, title, max_score AS maxScore, scoring_rubric AS rubric FROM questions WHERE id = ?',
    [QUESTION_ID],
  );
  if (!q || !q.rubric) throw new Error(`题目 ${QUESTION_ID} 不存在或缺少 scoring_rubric`);

  // 2) 353 全部提交 → 每学生最新一次（submitted_at desc, id desc 取首条）
  const [rows] = await conn.query(
    'SELECT id, assignment_id, student_id, status, ai_score, submitted_at, answer ' +
    'FROM submissions WHERE question_id = ? ORDER BY submitted_at DESC, id DESC',
    [QUESTION_ID],
  );
  const seen = new Set();
  const latest = [];
  for (const r of rows) {
    if (seen.has(r.student_id)) continue;
    seen.add(r.student_id);
    latest.push(r);
  }
  latest.sort((a, b) => a.student_id - b.student_id); // 输出顺序稳定可复现
  await conn.end();

  const stdDir = standardDir(QUESTION_ID);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  const skipped = [];   // { studentId, reason }
  const extracted = []; // 非空成功行记录
  let lineCount = 0;
  const fd = fs.openSync(OUT_FILE, 'w');
  try {
    for (const sub of latest) {
      const env = parseProjectAnswer(sub.answer);
      const version = Number(env.currentVersion) || 0;
      let standardFiles = null;
      let studentFiles = null;
      let skipReason = null;
      let note = '';

      if (version < 1) {
        skipReason = 'no-version';
      } else {
        const stuDir = submissionDir(QUESTION_ID, String(sub.student_id), version);
        const ctx = buildContext(stdDir, stuDir);
        standardFiles = ctx.standardFiles;
        studentFiles = ctx.studentFiles;
        note = ctx.note;
        if (!ctx.studentFiles || !ctx.studentFiles.trim()) {
          skipReason = ctx.note === 'missing-dir' ? 'missing-dir' : 'empty-student-files';
        }
      }

      const record = {
        submissionId: sub.id,
        studentId: sub.student_id,
        version,
        legacyAiScore: sub.ai_score,
        question: {
          id: q.id,
          title: q.title,
          maxScore: q.maxScore,
          rubric: q.rubric,
        },
        standardFiles: standardFiles || '',
        studentFiles: studentFiles || '',
      };
      if (skipReason) {
        record.skipped = true;
        skipped.push({ studentId: sub.student_id, reason: skipReason });
      } else {
        extracted.push({ studentId: sub.student_id, submissionId: sub.id, tokens: estimateTokens(studentFiles) + estimateTokens(standardFiles) });
      }
      fs.writeSync(fd, Buffer.from(JSON.stringify(record) + '\n'));
      lineCount++;
    }
  } finally {
    fs.closeSync(fd);
  }

  // ---------- 控制台汇总 ----------
  console.log('题目:', q.id, q.title, '| maxScore:', q.maxScore);
  console.log('DB 提交总数(question_id=' + QUESTION_ID + '):', rows.length, '| 学生数:', latest.length, '| 输出行数:', lineCount);
  console.log('提取成功:', extracted.length, '| 跳过:', skipped.length);
  if (skipped.length) {
    console.log('缺失目录/空文件清单:');
    for (const s of skipped) console.log('  - student', s.studentId, '(' + s.reason + ')');
  }
  if (extracted.length) {
    const toks = extracted.map((e) => e.tokens);
    const maxT = Math.max(...toks);
    const avgT = Math.round(toks.reduce((a, b) => a + b, 0) / toks.length);
    console.log('上下文 token 估算: 均值', avgT, '| 最大', maxT, '(预算', BUDGET_TOKENS + '，全部在预算内则无截断)');
  }
  console.log('输出文件:', OUT_FILE, '(' + (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1) + ' MB)');

  // ---------- 抽样验证：第 1 份 standardFiles/studentFiles 前 500 字符 ----------
  const first = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8').split('\n')[0]);
  console.log('\n===== 抽样：第 1 份 (submissionId=' + first.submissionId + ', student=' + first.studentId + ', v' + first.version + ', legacyAiScore=' + first.legacyAiScore + ') =====');
  console.log('--- standardFiles 前 500 字符 ---');
  console.log(String(first.standardFiles).slice(0, 500));
  console.log('\n--- studentFiles 前 500 字符 ---');
  console.log(String(first.studentFiles).slice(0, 500));
}

main().catch((err) => {
  console.error('数据集构建失败:', err.message);
  process.exit(1);
});
