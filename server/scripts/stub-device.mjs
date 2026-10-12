#!/usr/bin/env node
/**
 * stub-device.mjs —— R2-B4 自测/冒烟用的【假装置】：不联网、不调模型、不跑学生代码。
 * 只写 run-root 产物（checker.json + measure/*.json）并按 STUB_MODE 决定退出码，用于把
 * 「建 job → 消费 → 入库/needs_rerun」全链路跑通（零模型调用）。
 *
 * 环境：
 *  STUB_MODE        ok（默认）| exit5 | exit6 | no-artifacts | slow
 *  STUB_SLEEP       毫秒（slow 模式睡眠；ok 模式可选）
 *  STUB_SPAN_LOG    追加一行 "start <ms> end <ms>"（并发闸自测用）
 *  STUB_SUBMISSIONS 逗号分隔的提交 id（默认 1101）
 *  STUB_SCORE       正常份分数（默认 62）
 *  GRADER_RUN_ROOT  装置运行的 run-root（由平台 runner 注入）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'checker.sample.json');
const runRoot = process.env.GRADER_RUN_ROOT || path.join('/tmp', 'stub-run-root-default');
const mode = process.env.STUB_MODE || 'ok';
const sleepMs = Number(process.env.STUB_SLEEP || 0);
const subs = String(process.env.STUB_SUBMISSIONS || '1101').split(',').map((s) => s.trim()).filter(Boolean);
const score = Number(process.env.STUB_SCORE || 62);

const spanLog = process.env.STUB_SPAN_LOG;
const startedAt = Date.now();
const writeSpan = () => { if (spanLog) fs.appendFileSync(spanLog, 'start ' + startedAt + ' end ' + Date.now() + '\n'); };

if (mode === 'slow' && sleepMs > 0) {
  await new Promise((r) => setTimeout(r, sleepMs));
  writeSpan();
  process.exit(0);
}

if (mode === 'no-artifacts') { writeSpan(); process.exit(0); }

// STUB_SLUG=1：按装置真实命名写产物（submission.id = slug = s01/s02…）并写 assignment-manifest
const slugMode = process.env.STUB_SLUG === '1';
const outDir = path.join(runRoot, 'out');
fs.mkdirSync(path.join(outDir, 'checker'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'measure'), { recursive: true });
fs.copyFileSync(FIXTURE, path.join(outDir, 'checker', 'checker.json'));

const checker = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const staleMode = mode === 'exit6';
if (slugMode) {
  fs.mkdirSync(path.join(outDir, 'assignment'), { recursive: true });
  const manifestIds = String(process.env.STUB_MANIFEST_IDS || '').split(',').map((s) => s.trim());
  fs.writeFileSync(path.join(outDir, 'assignment', 'assignment-manifest.json'), JSON.stringify({
    schema_version: 'assignment-manifest/1',
    assignment_id: String(process.env.STUB_ASSIGNMENT_ID || '0'),
    submissions: subs.map((s, i) => ({ slug: s, id: manifestIds[i] || '' })),
  }));
}
for (const sid of subs) {
  const isNull = staleMode && sid === subs[subs.length - 1]; // exit6：最后一份记 null（unsupported 语义）
  const result = {
    schema_version: 'checker-result/1',
    checker_id: checker.checker_id,
    canonical_sha256: 'sha256:' + (sid + '0'.repeat(64)).slice(0, 64),
    submission: { id: sid, root_rel: '.', digest: 'sha256:' + 'd'.repeat(64), file_count: 7 },
    totals: { score: isNull ? null : score, max_score: checker.scoring.max_score, aggregate: checker.scoring.aggregate },
    items: [{ id: (checker.predicates[0] || {}).id || 'p1', score: isNull ? 0 : score, max_score: checker.scoring.max_score, comment: 'stub' }],
    reconciliation: { expected_items: (checker.predicates || []).length, evaluated_items: (checker.predicates || []).length, unsupported: isNull ? ['stub-unsupported'] : [], errors: [] },
    stale: mode === 'exit5',
    run_meta: { exit_code: mode === 'exit6' ? 6 : (mode === 'exit5' ? 5 : 0) },
  };
  fs.writeFileSync(path.join(outDir, 'measure', 'sub-' + sid + '.json'), JSON.stringify(result, null, 1));
}
writeSpan();
process.exit(mode === 'exit6' ? 6 : (mode === 'exit5' ? 5 : 0));
