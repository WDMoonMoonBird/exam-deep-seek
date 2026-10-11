#!/usr/bin/env node
/**
 * p5-analyze3.mjs —— P5 平台复算最终口径分析（修正「清单伪影」判定：删除型错误本身即文件消失）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workDir = process.argv[2] || '/tmp/p5';
const data = JSON.parse(fs.readFileSync(path.join(workDir, 'metrics2.json'), 'utf8'));
const rows = data.rows;
const DELETION_IDS = new Set(['S1', 'S2', 'S3', 'S4']);

const variants = rows.filter((r) => r.kind === '错误变体');
const errs = [];
for (const r of variants) for (const e of r.errors) {
  const isDeletion = DELETION_IDS.has(e.id);
  const artifact = e.fileGone && !isDeletion;              // 清单伪影：承载文件被别的注入删掉
  const subjOnly = e.subjectiveOnly;                        // rubric 仅映射主观项
  errs.push({ ...e, student: r.name, isDeletion, artifact, subjOnly });
}
const N = errs.length;
const cnt = (f) => errs.filter(f).length;
const pct = (a, b) => (b === 0 ? 'n/a' : (a / b * 100).toFixed(2) + '%');

const artifacts = errs.filter((e) => e.artifact);
const subjOnlyErrs = errs.filter((e) => e.subjOnly && !e.artifact);
const observable = errs.filter((e) => !e.artifact);
const objObservable = errs.filter((e) => !e.artifact && !e.subjOnly);

const R = (label, n, d) => '  ' + label.padEnd(38) + n + '/' + d + ' = ' + pct(n, d);

console.log('===== 实例级（122 个注入错误）=====');
console.log(R('A 组级归因（rubric 分组内有扣分）', cnt((e) => e.A_group), N));
console.log(R('B 文件级归因（扣分项 path==错误文件）', cnt((e) => e.B_file), N));
console.log(R('C 严格（组×文件 双约束）', cnt((e) => e.C_fileGroup), N));
console.log(R('D 宽松（A∪B）', cnt((e) => e.A_group || e.B_file), N));
console.log('  —— 清单伪影（承载文件被别的注入删除，静态不可观测）:', artifacts.length, artifacts.map((e) => e.student + '/' + e.id).join(', '));
console.log('  —— rubric 仅映射主观项（平台客观规则层不覆盖）:', subjOnlyErrs.length);
console.log('  —— 删除型错误 S1/S2/S3/S4:', cnt((e) => e.isDeletion));
console.log('===== 剔除不可观测后 =====');
console.log(R('A|非伪影', cnt((e) => !e.artifact && e.A_group), observable.length));
console.log(R('C|非伪影', cnt((e) => !e.artifact && e.C_fileGroup), observable.length));
console.log(R('A|非伪影且非主观专属', cnt((e) => !e.artifact && !e.subjOnly && e.A_group), objObservable.length));
console.log(R('C|非伪影且非主观专属', cnt((e) => !e.artifact && !e.subjOnly && e.C_fileGroup), objObservable.length));
console.log(R('D|非伪影且非主观专属', cnt((e) => !e.artifact && !e.subjOnly && (e.A_group || e.B_file)), objObservable.length));
console.log('===== 样本级（50 份错误变体）=====');
const samp = (f) => variants.filter((r) => r.errors.every((e) => f({ ...e, artifact: e.fileGone && !DELETION_IDS.has(e.id), subjOnly: e.subjectiveOnly }))).length;
console.log(R('全部检出(A 组级)', samp((e) => e.A_group), 50));
console.log(R('全部检出(C 严格)', samp((e) => e.C_fileGroup), 50));
console.log(R('全部检出(D 宽松)', samp((e) => e.A_group || e.B_file), 50));
const notArt = (r) => r.errors.filter((e) => !(e.fileGone && !DELETION_IDS.has(e.id)));
console.log(R('非伪影错误全部检出(A)', variants.filter((r) => notArt(r).every((e) => e.A_group)).length, 50));
console.log('===== 12 份非错误样本 =====');
const clean = rows.filter((r) => r.kind !== '错误变体');
console.log('  纯对照 6 份客观满分:', clean.filter((r) => r.kind === '对照(原样)' && r.lost === 0).length + '/6');
console.log('  无害变体 6 份客观满分:', clean.filter((r) => r.kind === '无害变体' && r.lost === 0).length + '/6');
console.log('  误扣率 =', ((6 - clean.filter((r) => r.kind === '无害变体' && r.lost === 0).length) / 6 * 100).toFixed(2) + '%');
console.log('===== 逐条明细 =====');
const lines = [];
for (const e of errs) {
  lines.push([e.student, e.id, e.name, e.file, e.artifact ? 'PROJ' : (e.isDeletion ? 'DEL' : ''), e.subjOnly ? 'SUBJ' : '',
    'A=' + (e.A_group ? 'Y' : '.'), 'B=' + (e.B_file ? 'Y' : '.'), 'C=' + (e.C_fileGroup ? 'Y' : '.'),
    (e.C_items.length ? e.C_items : (e.B_items.length ? e.B_items : [])).join(' ')].join(' | '));
}
console.log(lines.join('\n'));
fs.writeFileSync(path.join(workDir, 'metrics3.json'), JSON.stringify({ errs, rows }, null, 1), 'utf8');
fs.writeFileSync(path.join(workDir, 'per-error.txt'), lines.join('\n'), 'utf8');
