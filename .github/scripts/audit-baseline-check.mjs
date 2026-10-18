#!/usr/bin/env node
/**
 * .github/scripts/audit-baseline-check.mjs —— ★R3-SUPPLY（P1，2026-10-18）
 * 供应链门禁的「基线感知」检查：只对**新增** high/critical 计数 FAIL，避免首次接入即恒红。
 *
 * 用法：node .github/scripts/audit-baseline-check.mjs <server|client> <audit.json> <baseline.json>
 * 退出码：0 = 通过（含首次记录基线）；1 = 新增高危（或 audit 结果不可解析 = fail-closed）。
 */
import fs from 'node:fs';

const [workspace, auditPath, baselinePath] = process.argv.slice(2);
if (!workspace || !auditPath || !baselinePath) {
  console.error('用法: audit-baseline-check.mjs <server|client> <audit.json> <baseline.json>');
  process.exit(2);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

let audit;
try {
  audit = readJson(auditPath);
} catch (err) {
  console.error('[audit-baseline] 无法解析 audit 输出（fail-closed）：', auditPath, err.message);
  process.exit(1);
}
const v = (audit && audit.metadata && audit.metadata.vulnerabilities) || null;
if (!v) {
  console.error('[audit-baseline] audit 输出缺少 metadata.vulnerabilities（fail-closed；镜像源不支持 audit 接口时需改用公网 registry）：', JSON.stringify(audit).slice(0, 300));
  process.exit(1);
}
const current = { high: Number(v.high) || 0, critical: Number(v.critical) || 0 };

let baseline;
try {
  baseline = readJson(baselinePath);
} catch (err) {
  console.error('[audit-baseline] 无法读取基线文件：', baselinePath, err.message);
  process.exit(1);
}
const entry = baseline[workspace] || null;
console.log('[audit-baseline] workspace=' + workspace + ' current=' + JSON.stringify(current) + ' baseline=' + JSON.stringify(entry));

if (!entry || entry.high == null || entry.critical == null) {
  console.log('[audit-baseline] 基线未冻结（first-run）：当前计数=' + JSON.stringify(current)
    + ' ⇒ PASS 并请把本工作区 audit artifact 的计数冻结进 ' + baselinePath + '（"'
    + workspace + '": ' + JSON.stringify(current) + '）');
  process.exit(0);
}
const baseHigh = Number(entry.high) || 0;
const baseCritical = Number(entry.critical) || 0;
if (current.critical > baseCritical || current.high > baseHigh) {
  console.error('[audit-baseline] FAIL：新增高危/严重漏洞（high ' + baseHigh + '→' + current.high
    + '；critical ' + baseCritical + '→' + current.critical + '）。请修复或按发布流程登记豁免后更新基线。');
  process.exit(1);
}
console.log('[audit-baseline] PASS：未新增 high/critical（当前 high=' + current.high + ' critical=' + current.critical + '）');
process.exit(0);
