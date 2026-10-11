#!/usr/bin/env node
/**
 * p5-analyze2.mjs —— P5 平台复算：文件级 ground-truth 对齐 + 多口径三指标。
 * 只读：不写 DB；仅读 /tmp/p5 下已解压提交与平台既有规则。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workDir = process.argv[2] || '/tmp/p5';
const testSetDir = path.join(repoRoot, '实验', '注入测试集');
const { resolveProjectRoot } = await import(path.join(repoRoot, 'server/src/services/factExtractors/common.js'));

const rules = JSON.parse(fs.readFileSync(path.join(workDir, 'checker_script.json'), 'utf8'));
const rulesById = new Map(rules.objective_items.map((r) => [r.id, r]));
const results = JSON.parse(fs.readFileSync(path.join(workDir, 'results.json'), 'utf8'));
const list = JSON.parse(fs.readFileSync(path.join(testSetDir, '错误清单.json'), 'utf8'));

const RUBRIC_TO_GROUP = { '一、项目初始化': '项目初始化', '二、路由与跳转': '路由与页面跳转', '三、登录功能': '登录功能',
  '四、注册功能': '注册功能', '五、Pinia': 'Pinia状态管理', '七、个人信息': '个人信息展示', '八、管理员列表': '管理员用户列表' };
const RUBRIC_SUBJECTIVE = { '六、主页布局权限': 's1', '九、规范健壮': 's2' };

// ---------- 1. 标准包基准 ----------
const stdDir = path.join(workDir, 'std');
fs.rmSync(stdDir, { recursive: true, force: true });
fs.mkdirSync(stdDir, { recursive: true });
try { execFileSync('unzip', ['-q', '-o', path.join(testSetDir, '标准工程包.zip'), '-d', stdDir, '-x', '__MACOSX/*'], { stdio: 'pipe' }); } catch {}
const stdRoot = resolveProjectRoot(stdDir);
const { runRules } = await import(path.join(repoRoot, 'server/src/infrastructure/rule/executor.js'));
const stdResult = runRules(rules, stdDir);

function fileMap(root) {
  const m = new Map();
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const a = path.join(abs, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(a, r); else if (e.isFile()) m.set(r, crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex'));
    }
  };
  if (fs.existsSync(root)) walk(root, '');
  return m;
}
const stdFiles = fileMap(stdRoot);

// ---------- 2. 逐份对齐 ----------
const rows = [];
for (const res of results) {
  const gt = list[res.index];
  const dest = path.join(workDir, 'subs', res.extractedAs);
  const root = resolveProjectRoot(dest);
  const files = fileMap(root);
  const changed = [], removed = [];
  for (const [f, h] of files) if (!stdFiles.has(f) || stdFiles.get(f) !== h) changed.push(f);
  for (const f of stdFiles.keys()) if (!files.has(f)) removed.push(f);
  const row = { index: res.index, name: res.name, kind: gt.kind, score: res.totalScore, objectiveMax: res.objectiveMax,
    lost: res.objectiveMax - res.totalScore, changed, removed,
    deductions: res.deducted.map((d) => { const r = rulesById.get(d.id);
      return { id: d.id, group: d.group, path: r && r.params ? r.params.path : null, type: r ? r.rule_type : null,
        text: r && r.params ? (r.params.text || r.params.regex || '') : '', lost: d.max - d.score, evidence: d.evidence }; }) };
  const groupLost = {};
  for (const g of res.groupSummary) groupLost[g.group] = g.maxScore - g.score;
  row.groupLost = groupLost;
  if (gt.kind === '错误变体') {
    row.errors = gt.errors.map((e) => {
      const groups = (e.rubric || []).map((r) => RUBRIC_TO_GROUP[r]).filter(Boolean);
      const subjR = (e.rubric || []).map((r) => RUBRIC_SUBJECTIVE[r]).filter(Boolean);
      const fileGone = !files.has(e.file);
      const byGroup = groups.filter((g) => (groupLost[g] || 0) > 0);
      const byFile = row.deductions.filter((d) => d.path === e.file);
      const byFileGroup = byFile.filter((d) => groups.includes(d.group));
      return { id: e.id, name: e.name, layer: e.layer, sev: e.sev, file: e.file, rubric: e.rubric, groups, subjectiveOnly: groups.length === 0 && subjR.length > 0,
        fileGone, fileChanged: row.changed.includes(e.file),
        A_group: byGroup.length > 0, A_groups: byGroup,
        B_file: byFile.length > 0, B_items: byFile.map((d) => d.id + ':' + d.text + '(-' + d.lost + ')'),
        C_fileGroup: byFileGroup.length > 0, C_items: byFileGroup.map((d) => d.id + ':' + d.text + '(-' + d.lost + ')') };
    });
  }
  rows.push(row);
}

const errs = rows.filter((r) => r.kind === '错误变体').flatMap((r) => r.errors.map((e) => ({ ...e, student: r.name })));
const N = errs.length;
const cnt = (f) => errs.filter(f).length;
const artifact = errs.filter((e) => e.fileGone);
const subjOnly = errs.filter((e) => e.subjectiveOnly);
const observable = errs.filter((e) => !e.fileGone);
const observableNonSubj = observable.filter((e) => !e.subjectiveOnly);

const metrics = {
  total: N,
  artifactCount: artifact.length, artifactList: artifact.map((e) => e.student + ':' + e.id + '(' + e.file + ')'),
  subjectiveOnlyCount: subjOnly.length,
  A_group: cnt((e) => e.A_group), B_file: cnt((e) => e.B_file), C_fileGroup: cnt((e) => e.C_fileGroup),
  A_obs: observable.filter((e) => e.A_group).length, B_obs: observable.filter((e) => e.B_file).length, C_obs: observable.filter((e) => e.C_fileGroup).length,
  A_obsNonSubj: observableNonSubj.filter((e) => e.A_group).length, C_obsNonSubj: observableNonSubj.filter((e) => e.C_fileGroup).length,
  obsTotal: observable.length, obsNonSubjTotal: observableNonSubj.length,
};
const variants = rows.filter((r) => r.kind === '错误变体');
metrics.sampleAll = variants.filter((r) => r.errors.every((e) => e.C_fileGroup || e.A_group)).length;
metrics.sampleStrict = variants.filter((r) => r.errors.every((e) => e.C_fileGroup)).length;
metrics.sampleTotal = variants.length;
const clean = rows.filter((r) => r.kind !== '错误变体');
metrics.cleanTotal = clean.length; metrics.cleanFull = clean.filter((r) => r.lost === 0).length;
metrics.harmlessTotal = rows.filter((r) => r.kind === '无害变体').length;
metrics.harmlessFull = rows.filter((r) => r.kind === '无害变体' && r.lost === 0).length;
metrics.controlTotal = rows.filter((r) => r.kind === '对照(原样)').length;
metrics.controlFull = rows.filter((r) => r.kind === '对照(原样)' && r.lost === 0).length;

console.log('=== 标准包基准（平台既有 checker 在标准包上的 objective 得分）===');
console.log('  totalScore =', stdResult.totalScore, '/', rules.max_score, ' objectiveMax =', stdResult.items.reduce((s, x) => s + x.max_score, 0),
  ' 扣分项 =', stdResult.items.filter((i) => i.score < i.max_score).map((i) => i.id).join(',') || '无');
console.log('=== 实例级 122 ===');
console.log('  A 组级归因            :', metrics.A_group, (metrics.A_group / N * 100).toFixed(2) + '%');
console.log('  B 文件级归因          :', metrics.B_file, (metrics.B_file / N * 100).toFixed(2) + '%');
console.log('  C 文件×组 双约束(严格):', metrics.C_fileGroup, (metrics.C_fileGroup / N * 100).toFixed(2) + '%');
console.log('  —— 其中承载文件已消失(清单伪影):', metrics.artifactCount, JSON.stringify(metrics.artifactList));
console.log('  —— 其中 rubric 仅映射主观项    :', metrics.subjectiveOnlyCount);
console.log('  A|可观测 :', metrics.A_obs + '/' + metrics.obsTotal, (metrics.A_obs / metrics.obsTotal * 100).toFixed(2) + '%');
console.log('  C|可观测 :', metrics.C_obs + '/' + metrics.obsTotal, (metrics.C_obs / metrics.obsTotal * 100).toFixed(2) + '%');
console.log('  C|可观测且非主观专属 :', metrics.C_obsNonSubj + '/' + metrics.obsNonSubjTotal, (metrics.C_obsNonSubj / metrics.obsNonSubjTotal * 100).toFixed(2) + '%');
console.log('=== 样本级 50 ===');
console.log('  全部检出(A∪C):', metrics.sampleAll, (metrics.sampleAll / 50 * 100).toFixed(2) + '%');
console.log('  全部检出(严格C):', metrics.sampleStrict, (metrics.sampleStrict / 50 * 100).toFixed(2) + '%');
console.log('=== 12 份非错误样本 ===');
console.log('  对照(原样) 满分:', metrics.controlFull + '/' + metrics.controlTotal);
console.log('  无害变体   满分:', metrics.harmlessFull + '/' + metrics.harmlessTotal, '→ 误扣率 =', ((metrics.harmlessTotal - metrics.harmlessFull) / metrics.harmlessTotal * 100).toFixed(2) + '%');
console.log('  合计满分:', metrics.cleanFull + '/' + metrics.cleanTotal);
console.log('=== 逐条错误判定（id@学生 文件 | A组级 C严格）===');
for (const r of variants) for (const e of r.errors) {
  console.log('  ' + [e.id.padEnd(3), r.name.padEnd(8), (e.file || '').padEnd(30), e.fileGone ? 'FILE_GONE' : (e.fileChanged ? 'changed' : 'UNCHANGED'), 'A=' + (e.A_group ? 'Y' : '.'), 'C=' + (e.C_fileGroup ? 'Y' : '.'), e.subjectiveOnly ? '[主观专属]' : '', e.C_items.join(' ') || e.A_groups.join(' ')].join(' '));
}
fs.writeFileSync(path.join(workDir, 'metrics2.json'), JSON.stringify({ metrics, rows }, null, 1), 'utf8');
