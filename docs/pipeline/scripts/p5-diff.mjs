#!/usr/bin/env node
/**
 * p5-diff.mjs —— 为「扣分项 → 注入错误」的精细归因生成 变更文件 diff + 扣分项 + ground truth 对照表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workDir = process.argv[2] || '/tmp/p5';
const testSetDir = path.join(repoRoot, '实验', '注入测试集');
const { resolveProjectRoot } = await import(path.join(repoRoot, 'server/src/services/factExtractors/common.js'));

const rules = JSON.parse(fs.readFileSync(path.join(workDir, 'checker_script.json'), 'utf8'));
const rulesById = new Map(rules.objective_items.map((r) => [r.id, r]));
const results = JSON.parse(fs.readFileSync(path.join(workDir, 'results.json'), 'utf8'));
const list = JSON.parse(fs.readFileSync(path.join(testSetDir, '错误清单.json'), 'utf8'));
const stdRoot = resolveProjectRoot(path.join(workDir, 'std'));

const out = [];
for (const res of results) {
  const gt = list[res.index];
  if (gt.kind !== '错误变体') continue;
  const root = resolveProjectRoot(path.join(workDir, 'subs', res.extractedAs));
  const files = new Set(gt.errors.map((e) => e.file));
  const ded = res.deducted.map((d) => { const r = rulesById.get(d.id); return { id: d.id, group: d.group, path: r?.params?.path, text: r?.params?.text || r?.params?.regex, lost: d.max - d.score }; });
  out.push('\n########## ' + res.name + '  平台客观分 ' + res.totalScore + '/77  失分 ' + (77 - res.totalScore) + ' ##########');
  out.push('GROUND TRUTH: ' + gt.errors.map((e) => e.id + '(' + e.name + '@' + e.file + ')').join(' , '));
  out.push('平台扣分项: ' + (ded.length ? ded.map((d) => d.id + '[' + d.group + '|' + d.path + '|' + JSON.stringify(d.text) + '|-' + d.lost + ']').join(' ') : '（无扣分）'));
  for (const f of files) {
    const a = path.join(stdRoot, f), b = path.join(root, f);
    if (!fs.existsSync(b)) { out.push('--- FILE DELETED: ' + f); continue; }
    const sa = fs.existsSync(a) ? fs.readFileSync(a, 'utf8').split('\n') : [];
    const sb = fs.readFileSync(b, 'utf8').split('\n');
    const hunks = [];
    const maxLen = Math.max(sa.length, sb.length);
    for (let i = 0; i < maxLen; i += 1) if ((sa[i] || '') !== (sb[i] || '')) hunks.push('  L' + (i + 1) + '  -' + JSON.stringify(sa[i] ?? null) + '\n        +' + JSON.stringify(sb[i] ?? null));
    out.push('--- FILE ' + f + ' 差异行数=' + hunks.length);
    out.push(hunks.slice(0, 14).join('\n'));
    if (hunks.length > 14) out.push('  ...(' + (hunks.length - 14) + ' more)');
  }
}
fs.writeFileSync(path.join(workDir, 'diff-report.txt'), out.join('\n'), 'utf8');
console.log('written', out.length, 'lines');
