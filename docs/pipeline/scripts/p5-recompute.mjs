#!/usr/bin/env node
/**
 * p5-recompute.mjs —— P5 平台复算：用平台既有 checker（questions.checker_script）+ 平台规则执行器
 * runRules 复算注入测试集 62 份提交。只读：不写 DB、不执行学生代码、不构建。
 * 用法: node docs/pipeline/scripts/p5-recompute.mjs /tmp/p5
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workDir = process.argv[2] || '/tmp/p5';
const testSetDir = path.join(repoRoot, '实验', '注入测试集');
const subsDir = path.join(workDir, 'subs');
fs.mkdirSync(subsDir, { recursive: true });

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
const { runRules } = await import(path.join(repoRoot, 'server/src/infrastructure/rule/executor.js'));

const rules = JSON.parse(fs.readFileSync(path.join(workDir, 'checker_script.json'), 'utf8'));
const list = JSON.parse(fs.readFileSync(path.join(testSetDir, '错误清单.json'), 'utf8'));

function extract(zipPath, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  try {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', dest, '-x', '__MACOSX/*'], { stdio: 'pipe' });
  } catch (e) { /* -x 无匹配时 unzip 返回 11，仍已解压 */ }
  return dest;
}

const results = [];
for (let i = 0; i < list.length; i += 1) {
  const item = list[i];
  const zip = path.join(testSetDir, item.file);
  const dest = path.join(subsDir, String(i).padStart(2, '0') + '_' + item.name.replace(/[\/\s]/g, '_'));
  extract(zip, dest);
  let out;
  try {
    out = runRules(rules, dest);
  } catch (err) {
    results.push({ index: i, name: item.name, kind: item.kind, error: String(err && err.message) });
    continue;
  }
  const deducted = out.items.filter((it) => it.score < it.max_score)
    .map((it) => ({ id: it.id, group: it.group, item: it.item, path: (it.params || {}).path, max: it.max_score, score: it.score, evidence: it.evidence }));
  results.push({
    index: i, name: item.name, kind: item.kind, extractedAs: path.basename(dest),
    totalScore: out.totalScore, objectiveMax: out.items.reduce((s, x) => s + x.max_score, 0),
    groupSummary: out.groupSummary, deductedCount: deducted.length, deducted,
  });
  process.stderr.write('[' + (i + 1) + '/' + list.length + '] ' + item.name + ' ' + out.totalScore + '\n');
}
fs.writeFileSync(path.join(workDir, 'results.json'), JSON.stringify(results, null, 1), 'utf8');

const objMax = results.find((r) => r.objectiveMax)?.objectiveMax;
console.log(JSON.stringify({
  rulesMaxScore: rules.max_score,
  objectiveItems: rules.objective_items.length,
  subjectiveItems: rules.subjective_items.length,
  objectiveMax: objMax,
  subjectiveMax: rules.subjective_items.reduce((s, x) => s + x.max_score, 0),
  scores: results.map((r) => ({ name: r.name, kind: r.kind, score: r.totalScore, deducted: r.deductedCount })),
}, null, 1));
