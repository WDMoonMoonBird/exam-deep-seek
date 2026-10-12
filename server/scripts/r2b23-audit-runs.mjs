/**
 * r2b23-audit-runs.mjs —— R2-B23 阶段 3 审计（**只读**）。
 *
 * 扫描 <DSH_GRADER_RUNS_ROOT>（默认 /srv/grader/runs）与 /tmp/r2b4-job-*，报出：
 *   ① 凭据残留：任何 `.credentials.yaml`
 *   ② 会话残留：任何 `sessions/**` 或 `storages/session_projcache/**` 下的文件
 *   ③ 成功运行却 `sessions_purged != true`（读归档里的 run-teardown.json）
 * 正常 ⇒ `AUDIT_OK runs=<n>` rc=0；有发现 ⇒ `AUDIT_FINDINGS n=<x>` rc=1（逐条路径与原因）。
 *
 * 用法：node scripts/r2b23-audit-runs.mjs [--runs-root <dir>] [--tmp-glob <prefix>] [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_RUNS_ROOT, RUNS_ROOT_ENV, TEARDOWN_NAME } from '../src/services/dshRunArchiver.js';

const __filename = fileURLToPath(import.meta.url);
const SERVER = path.resolve(path.dirname(__filename), '..');

export function parseArgs(argv) {
  const o = { runsRoot: process.env[RUNS_ROOT_ENV] || DEFAULT_RUNS_ROOT, tmpPrefix: '/tmp/r2b4-job-', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--runs-root') o.runsRoot = argv[++i];
    else if (a === '--tmp-glob') o.tmpPrefix = argv[++i];
    else if (a === '--json') o.json = true;
  }
  return o;
}

function walk(root, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const it of entries) {
    const abs = path.join(root, it.name);
    if (it.isSymbolicLink()) continue;
    if (it.isDirectory()) walk(abs, out);
    else if (it.isFile()) out.push(abs);
  }
  return out;
}

const isSessionFile = (p) => p.includes('/sessions/') || p.includes('/storages/session_projcache/');
const isCredential = (p) => p.endsWith('.credentials.yaml');

/** 判定一个运行目录（归档或 run-root）的发现项 */
export function inspectRunDir(dir, { successHint = null } = {}) {
  const findings = [];
  const files = walk(dir);
  for (const f of files) {
    if (isCredential(f)) findings.push({ path: f, kind: 'credential_residue', detail: '明文凭据残留（.credentials.yaml）' });
    if (isSessionFile(f)) findings.push({ path: f, kind: 'session_residue', detail: '会话文件残留（应被 teardown 销毁）' });
  }
  const tdPath = path.join(dir, TEARDOWN_NAME);
  let teardown = null;
  if (fs.existsSync(tdPath)) {
    try { teardown = JSON.parse(fs.readFileSync(tdPath, 'utf8')); } catch { findings.push({ path: tdPath, kind: 'teardown_unreadable', detail: 'run-teardown.json 无法解析' }); }
  }
  if (teardown) {
    const success = successHint === null
      ? (teardown.keep_scene === false && /exit=0(\b|$)/.test(String(teardown.purge_policy || '')))
      : successHint === true;
    if (success && teardown.sessions_purged !== true) {
      findings.push({ path: tdPath, kind: 'sessions_not_purged', detail: '成功运行却 sessions_purged!=' + String(teardown.sessions_purged) + '（home_exists_after=' + String(teardown.home_exists_after) + ', session_files_after=' + String(teardown.session_files_after) + '）' });
    }
    if (teardown.home_exists_after === true && teardown.sessions_purged === true) {
      findings.push({ path: tdPath, kind: 'inconsistent_evidence', detail: 'sessions_purged=true 但 home_exists_after=true（证据自相矛盾）' });
    }
  }
  return { dir, files: files.length, teardown, findings };
}

/** 扫描运行根 + /tmp run-root 前缀 */
export function audit({ runsRoot = DEFAULT_RUNS_ROOT, tmpPrefix = '/tmp/r2b4-job-' } = {}) {
  const runs = [];
  const findings = [];
  if (fs.existsSync(runsRoot)) {
    for (const it of fs.readdirSync(runsRoot, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!it.isDirectory()) continue;
      const r = inspectRunDir(path.join(runsRoot, it.name));
      runs.push(r);
      findings.push(...r.findings);
    }
  }
  let tmpDirs = [];
  try { tmpDirs = fs.readdirSync(path.dirname(tmpPrefix)).filter((n) => n.startsWith(path.basename(tmpPrefix))).map((n) => path.join(path.dirname(tmpPrefix), n)).filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }); } catch { tmpDirs = []; }
  for (const d of tmpDirs.sort()) {
    const r = inspectRunDir(d);
    runs.push(r);
    findings.push(...r.findings);
  }
  return { runsRoot, n_runs: runs.length, findings };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const res = audit(opts);
  if (opts.json) console.log(JSON.stringify(res, null, 2));
  if (res.findings.length === 0) {
    if (!opts.json) console.log('AUDIT_OK runs=' + res.n_runs);
    process.exit(0);
  }
  if (!opts.json) {
    console.log('AUDIT_FINDINGS n=' + res.findings.length + ' runs=' + res.n_runs);
    for (const f of res.findings.slice(0, 50)) console.log('AUDIT_FINDING kind=' + f.kind + ' path=' + f.path + ' detail=' + f.detail);
  }
  process.exit(1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedDirectly) main();
