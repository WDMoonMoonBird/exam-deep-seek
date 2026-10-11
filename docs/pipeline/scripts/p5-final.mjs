#!/usr/bin/env node
/**
 * p5-final.mjs —— P5 平台复算：把「平台扣分项」逐条归因到注入错误，产出最终三指标。
 * 归因规则（可复查，见 docs/pipeline/P5-平台复算.md 第二节）：
 *   仅当平台上「语义上对应该项缺陷」的规则项真的失分，才计为检出。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workDir = process.argv[2] || '/tmp/p5';
const results = JSON.parse(fs.readFileSync(path.join(workDir, 'results.json'), 'utf8'));
const list = JSON.parse(fs.readFileSync(path.join(repoRoot, '实验', '注入测试集', '错误清单.json'), 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(workDir, 'checker_script.json'), 'utf8'));
const rulesById = new Map(rules.objective_items.map((r) => [r.id, r]));

/** 错误 id → 平台侧判定谓词（deductedIds = 该提交失分的规则项 id 集合） */
const ATTR = {
  S1: (d) => d.has('a14'),                       // 删除 Login.vue  → file_exists src/views/Login.vue
  S2: (d) => d.has('a52'),                       // 删除 stores/user.js → file_exists src/stores/user.js
  S3: (d) => d.has('a66'),                       // 删除 UserList.vue → file_exists
  S4: (d) => d.has('a16'),                       // 删除 User.vue → file_exists
  S5: () => false,                               // 路由 import 指向不存在文件：无任何规则校验 import 目标
  S6: () => false,                               // store import 路径写错：同上
  S7: () => false,                               // 未挂载 Pinia：a9 只查 main.js 含 'pinia'（import 行仍在）
  S8: () => false,                               // 未挂载 router：main.js 无 router 相关规则
  S9: () => false,                               // 未注册 Antd：a8 只查 main.js 含 'ant-design-vue'
  L1: () => false,                               // 首行 return：所有被检 token 仍在
  L2: (d) => d.has('a25'),                       // 密码正则放宽 → contains_regex 失分
  L3: () => false,                               // 不跳转：a19/a28 查 '/user'，文件内其它位置仍含
  L4: () => false,                               // 不写 store：a27 查 'userStore'，声明行仍在
  L5: () => false,                               // 失败不提示：a29/a33 查 'notification'，success 仍在
  H1: (d) => d.has('a71'),                       // 整行缺邮箱列 → 'email' 消失
  H2: () => false,                               // dataIndex 拼错：key:'email' 仍在 → a71 仍通过
  F1: () => false,                               // store 注释全删：无规则检查注释
  F2: (d) => d.has('a27'),                       // userStore→x → 'userStore' 消失
};
const DELETION = new Set(['S1', 'S2', 'S3', 'S4']);

const variants = [];
const allErrs = [];
for (const res of results) {
  const gt = list[res.index];
  if (gt.kind !== '错误变体') continue;
  const ded = new Set(res.deducted.map((d) => d.id));
  const row = { name: res.name, score: res.totalScore, lost: res.objectiveMax - res.totalScore, deducted: [...ded], errors: [] };
  for (const e of gt.errors) {
    const detected = (ATTR[e.id] || (() => false))(ded);
    const ruleIds = Object.entries(ATTR).length ? null : null;
    row.errors.push({ id: e.id, name: e.name, file: e.file, rubric: e.rubric, sev: e.sev, layer: e.layer, detected });
    allErrs.push({ ...e, student: res.name, detected, score: res.totalScore });
  }
  variants.push(row);
}
const N = allErrs.length;
const det = allErrs.filter((e) => e.detected).length;
const pct = (a, b) => (a / b * 100).toFixed(2) + '%';

// 剔除「静态不可观测」的错误：删除型错误把同文件/同学生其它错误的承载物一起消灭
const ARTIFACT = new Set(['周磊08/L5', '蔡娜43/L1', '魏丽46/L1', '学生 1/F1']);
const observable = allErrs.filter((e) => !ARTIFACT.has(e.student + '/' + e.id));
const detObs = observable.filter((e) => e.detected).length;

const sampleAll = variants.filter((r) => r.errors.every((e) => e.detected)).length;
const sampleObs = variants.filter((r) => r.errors.filter((e) => !ARTIFACT.has(r.name + '/' + e.id)).every((e) => e.detected)).length;

const byId = {};
for (const e of allErrs) { byId[e.id] = byId[e.id] || { n: 0, det: 0 }; byId[e.id].n += 1; if (e.detected) byId[e.id].det += 1; }

console.log('================ P5 平台复算 · 最终指标 ================');
console.log('规则规模: max_score=' + rules.max_score + ' objective_items=' + rules.objective_items.length
  + ' (客观满分 ' + rules.objective_items.reduce((s, x) => s + x.max_score, 0) + ') subjective_items=' + rules.subjective_items.length
  + ' (主观满分 ' + rules.subjective_items.reduce((s, x) => s + x.max_score, 0) + ')');
console.log('--- 指标 1 检出率 ---');
console.log('  实例级(122, 语义归因)      : ' + det + '/122 = ' + pct(det, N));
console.log('  实例级(剔除 4 项不可观测)   : ' + detObs + '/' + observable.length + ' = ' + pct(detObs, observable.length));
console.log('  样本级(50, 全部检出)        : ' + sampleAll + '/50 = ' + pct(sampleAll, 50));
console.log('  样本级(剔除不可观测后)      : ' + sampleObs + '/50 = ' + pct(sampleObs, 50));
console.log('--- 指标 2/3 无害与对照 ---');
const clean = results.filter((r) => list[r.index].kind !== '错误变体');
const harmless = clean.filter((r) => list[r.index].kind === '无害变体');
const control = clean.filter((r) => list[r.index].kind === '对照(原样)');
const fullOf = (arr) => arr.filter((r) => r.totalScore === r.objectiveMax).length;
console.log('  无害变体满分: ' + fullOf(harmless) + '/' + harmless.length + ' → 误扣率 ' + pct(harmless.length - fullOf(harmless), harmless.length));
console.log('  纯对照满分  : ' + fullOf(control) + '/' + control.length);
console.log('  合计满分    : ' + (fullOf(harmless) + fullOf(control)) + '/' + clean.length);
console.log('--- 按错误类型 ---');
for (const [k, v] of Object.entries(byId).sort()) console.log('  ' + k.padEnd(4) + ' ' + v.det + '/' + v.n);
console.log('--- 逐份明细（错误变体）---');
for (const r of variants) {
  console.log('  ' + r.name.padEnd(9) + String(r.score).padStart(2) + '/77 失分' + String(r.lost).padStart(3)
    + '  检出 ' + r.errors.filter((e) => e.detected).length + '/' + r.errors.length
    + '  ' + r.errors.map((e) => e.id + (e.detected ? '✓' : '✗')).join(' '));
}
console.log('--- 漏检清单（按类型聚合）---');
for (const [k, v] of Object.entries(byId).sort()) if (v.det < v.n) console.log('  ' + k + ' 漏检 ' + (v.n - v.det) + '/' + v.n + ' 次');
fs.writeFileSync(path.join(workDir, 'final-metrics.json'), JSON.stringify({ metrics: { N, det, detObs, obsTotal: observable.length, sampleAll, sampleObs, harmless: harmless.length, harmlessFull: fullOf(harmless), control: control.length, controlFull: fullOf(control) }, byId, variants, allErrs }, null, 1), 'utf8');
