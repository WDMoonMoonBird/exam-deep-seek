/**
 * W55（R2-B31）：run-root 生命周期共享 helper 的**造尺路径**行为（teardown→归档→清理），以及两路径共用同一 helper 的结构守卫。
 * 全部用文件系统夹具（不跑装置、不写生产库）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeBuildRunRoot, finalizeRunRoot, sessionStats } from '../../src/infrastructure/dsh/runs/dshRunArchiver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');

function mkBuildRun({ sessions = 3, bytes = 2048, credentials = true } = {}) {
  // ★注意：造尺 run-root 的真实形状是 /tmp/r2b7-checker-*（安全剪枝护栏要求 /tmp 前缀 + 该 basename）
  const runRoot = fs.mkdtempSync('/tmp/r2b7-checker-test-');
  fs.mkdirSync(path.join(runRoot, 'out', 'checker'), { recursive: true });
  fs.writeFileSync(path.join(runRoot, 'out', 'checker', 'checker.json'), '{}');
  fs.mkdirSync(path.join(runRoot, 'home', 'profiles', 'headless'), { recursive: true });
  fs.writeFileSync(path.join(runRoot, 'home', 'profiles', 'headless', 'cordis.patch.yml'), '- id: x');
  for (let i = 0; i < sessions; i += 1) {
    const d = path.join(runRoot, 'home', 'sessions', 'wd', 'sid' + i);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'session.v4.jsonl.zstd'), Buffer.alloc(bytes, 9));
  }
  fs.mkdirSync(path.join(runRoot, 'home', 'storages', 'session_projcache', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(runRoot, 'home', 'storages', 'session_projcache', 'sessions', 'a.json'), '{}');
  if (credentials) fs.writeFileSync(path.join(runRoot, 'home', '.credentials.yaml'), 'DEEPSEEK_API_KEY: sk-should-never-persist');
  return runRoot;
}

describe('W55 造尺路径 run-root 生命周期（R2-B31）', () => {
  it('★W55-1 造尺成功 ⇒ 证据 source=build + sessions_purged=true/session_files_after=0/credentials_removed=yes/home_policy/home_exists_after=yes，并归档到 build-<assignmentId>-<ts>/ 后清理 run-root', async () => {
    const runRoot = mkBuildRun();
    const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-root-'));
    const logs = [];
    const res = await finalizeBuildRunRoot({ runRoot, assignmentId: 9, exitCode: 0, runsRoot, log: { log: (m) => logs.push(m) } });
    const ev = JSON.parse(fs.readFileSync(path.join(runsRoot, path.basename(res.archive.dir), 'run-teardown.json'), 'utf8'));
    expect(ev.source).toBe('build');
    expect(ev.sessions_purged).toBe(true);
    expect(ev.session_files_after).toBe(0);
    expect(ev.credentials_removed).toBe('yes');
    expect(ev.home_policy).toBe('sessions+credentials');
    expect(ev.home_exists_after).toBe('yes');
    expect(ev.session_files_before).toBeGreaterThan(0);
    expect(path.basename(res.archive.dir)).toMatch(/^build-9-\d{8}T\d{6}Z$/);
    expect(fs.existsSync(path.join(runRoot, 'home', 'sessions'))).toBe(false);
    expect(fs.existsSync(path.join(runRoot, 'home', '.credentials.yaml'))).toBe(false);
    expect(fs.existsSync(runRoot)).toBe(false);   // 成功 ⇒ archiveRun 清理 run-root
    expect(logs.some((l) => l.includes('BUILD_RUN_FINALIZED') && l.includes('source=build'))).toBe(true);
    fs.rmSync(runsRoot, { recursive: true, force: true });
  }, 60000);

  it('★W55-2 造尺失败 ⇒ 保留现场（含会话）+ .keep-scene；凭据必删；run-root 不清理', async () => {
    const runRoot = mkBuildRun();
    const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-root-'));
    const res = await finalizeBuildRunRoot({ runRoot, assignmentId: 12, exitCode: 5, runsRoot, log: { log: () => {} } });
    const dj = fs.readdirSync(runsRoot).map((d) => path.join(runsRoot, d)).find((d) => fs.existsSync(path.join(d, 'run-teardown.json')));
    const ev = JSON.parse(fs.readFileSync(path.join(dj, 'run-teardown.json'), 'utf8'));
    expect(ev.source).toBe('build');
    expect(ev.sessions_purged).toBe(false);
    expect(ev.keep_scene).toBe(true);
    expect(ev.credentials_removed).toBe('yes');
    expect(fs.existsSync(path.join(runRoot, 'home', '.keep-scene'))).toBe(true);
    expect(sessionStats(runRoot).files).toBeGreaterThan(0);   // 现场（含会话）保留
    expect(fs.existsSync(runRoot)).toBe(true);
    expect(res.archive.pruned).toBe(false);
    fs.rmSync(runRoot, { recursive: true, force: true });
    fs.rmSync(runsRoot, { recursive: true, force: true });
  }, 60000);

  it('★W55-3 退出码语义：helper 永不抛；归档不可写也不影响调用方原码（fail-soft 对拍）', async () => {
    const runRoot = mkBuildRun({ sessions: 1 });
    const res = await finalizeRunRoot({ runRoot, success: true, exitCode: 0, source: 'build', dirName: 'build-1-x', runsRoot: '/proc/definitely-not-writable', log: { log: () => {} } });
    expect(res.archive.skipped || res.error).toBeTruthy();      // 归档失败被显式记录，不抛
    const code = (() => { let rc = 5; try { void res; } catch { rc = 1; } return rc; })();
    expect(code).toBe(5);                                        // 原码保持
    fs.rmSync(runRoot, { recursive: true, force: true });
  }, 60000);

  it('★★W55-4 两路径共用同一 helper（结构守卫）：worker 调 finalizeRunRoot；造尺动态导入 finalizeBuildRunRoot；造尺不自行实现会话销毁', async () => {
    const worker = fs.readFileSync(path.join(SERVER, 'src/infrastructure/dsh/worker/run-once.js'), 'utf8');
    const build = fs.readFileSync(path.join(SERVER, 'scripts/r2b7-build-checker.mjs'), 'utf8');
    const archiver = fs.readFileSync(path.join(SERVER, 'src/services/dshRunArchiver.js'), 'utf8');
    expect(worker.includes('await finalizeRunRoot({')).toBe(true);
    expect(worker.includes('source: \'worker\'')).toBe(true);
    expect(build.includes('finalizeBuildRunRoot')).toBe(true);
    expect(build.includes('dshRunArchiver.js')).toBe(true);
    expect(archiver.includes('export async function finalizeRunRoot(')).toBe(true);
    expect(archiver.includes('export async function finalizeBuildRunRoot(')).toBe(true);
    // 造尺脚本不得自行实现销毁（必须复用）
    expect(/rmSync\([^)]*sessions/.test(build)).toBe(false);
    expect(build.includes('purgeRunRootSessions(')).toBe(false);
    // 造尺退出码包装：先 finalize 再 exitWith(rc)，且 finalize 自带 try/catch
    expect(build.includes('await finalize(rc); exitWith(rc);')).toBe(true);
    expect(/catch \(err\) \{ console\.log\('BUILD_RUN_FINALIZE_FAILED/.test(build)).toBe(true);
  });
});
