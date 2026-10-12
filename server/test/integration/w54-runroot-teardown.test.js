/**
 * W54（R2-B27 路线 2）：worker 层 run-root teardown。
 * 覆盖：成功销毁会话+凭据保留骨架 / 失败现场+ .keep-scene / 反例 purge=false / 幂等 / 无 sessions 不报错 / 早期退出防御。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KEEP_SCENE_NAME, TEARDOWN_NAME, purgeRunRootSessions, sessionStats } from '../../src/services/dshRunArchiver.js';

function mkRoot({ sessions = 2, bytes = 1024, credentials = true, out = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w54-job-'));
  if (out) fs.mkdirSync(path.join(root, 'out'), { recursive: true });
  fs.mkdirSync(path.join(root, 'home', 'profiles', 'headless'), { recursive: true });
  fs.writeFileSync(path.join(root, 'home', 'profiles', 'headless', 'cordis.patch.yml'), '- id: x');
  for (let i = 0; i < sessions; i += 1) {
    const d = path.join(root, 'home', 'sessions', '--private-tmp--', 'sid' + i);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'session.v4.jsonl.zstd'), Buffer.alloc(bytes, 3));
  }
  fs.mkdirSync(path.join(root, 'home', 'storages', 'session_projcache', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'home', 'storages', 'session_projcache', 'sessions', 'a.json'), '{}');
  if (credentials) fs.writeFileSync(path.join(root, 'home', '.credentials.yaml'), 'DEEPSEEK_API_KEY: sk-should-not-persist');
  return root;
}

describe('W54 worker 层 run-root teardown（R2-B27 路线 2）', () => {
  it('★W54-1 成功 ⇒ sessions_purged=true / session_files_after=0 / credentials_removed=yes / home_policy=sessions+credentials / home_exists_after=yes（骨架保留）', () => {
    const root = mkRoot();
    const before = sessionStats(root);
    expect(before.files).toBeGreaterThan(0);
    const logs = [];
    const res = purgeRunRootSessions({ runRoot: root, exitCode: 0, purge: true, keepDays: 3, log: { log: (m) => logs.push(m) } });
    expect(res.sessionsPurged).toBe(true);
    expect(res.keepScene).toBe(false);
    const ev = JSON.parse(fs.readFileSync(path.join(root, 'out', TEARDOWN_NAME), 'utf8'));
    expect(ev.sessions_purged).toBe(true);
    expect(ev.session_files_after).toBe(0);
    expect(ev.credentials_removed).toBe('yes');
    expect(ev.home_policy).toBe('sessions+credentials');
    expect(ev.home_exists_after).toBe('yes');
    expect(ev.session_files_before).toBe(before.files);
    expect(ev.session_bytes).toBeGreaterThan(0);
    expect(ev.source).toBe('worker');
    expect(fs.existsSync(path.join(root, 'home', 'profiles', 'headless'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'home', 'sessions'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'home', '.credentials.yaml'))).toBe(false);
    expect(logs.some((l) => l.indexOf('RUN_TEARDOWN=') === 0 && l.indexOf('"sessions_purged":true') > 0)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);

  it('★W54-2 失败（exit=5）⇒ 现场保留（含会话）+ .keep-scene(keep_days=7) + 凭据仍删 + sessions_purged=false', () => {
    const root = mkRoot();
    purgeRunRootSessions({ runRoot: root, exitCode: 5, purge: true, keepDays: 7, log: { log: () => {} } });
    const ev = JSON.parse(fs.readFileSync(path.join(root, 'out', TEARDOWN_NAME), 'utf8'));
    expect(ev.sessions_purged).toBe(false);
    expect(ev.keep_scene).toBe(true);
    expect(ev.credentials_removed).toBe('yes');
    expect(fs.existsSync(path.join(root, 'home', '.credentials.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'home', 'sessions'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'home', KEEP_SCENE_NAME), 'utf8')).toContain('keep_days=7');
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);

  it('★W54-3 反例（purge=false）⇒ sessions_purged=false 且会话仍在', () => {
    const root = mkRoot();
    purgeRunRootSessions({ runRoot: root, exitCode: 0, purge: false, log: { log: () => {} } });
    const ev = JSON.parse(fs.readFileSync(path.join(root, 'out', TEARDOWN_NAME), 'utf8'));
    expect(ev.sessions_purged).toBe(false);
    expect(sessionStats(root).files).toBeGreaterThan(0);
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);

  it('W54-4 幂等：连续两次不报错，第二次 before=after=0', () => {
    const root = mkRoot();
    purgeRunRootSessions({ runRoot: root, exitCode: 0, log: { log: () => {} } });
    const second = purgeRunRootSessions({ runRoot: root, exitCode: 0, log: { log: () => {} } });
    expect(second.sessionsPurged).toBe(true);
    expect(second.evidence.session_files_before).toBe(0);
    expect(second.evidence.session_files_after).toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);

  it('W54-5 无 sessions 不报错（仅 projcache）；早期退出防御（out/ 不可用 ⇒ RUN_TEARDOWN_SKIPPED 且不创建 out/）', () => {
    const noSessions = mkRoot({ sessions: 0 });
    const r1 = purgeRunRootSessions({ runRoot: noSessions, exitCode: 0, log: { log: () => {} } });
    expect(r1.sessionsPurged).toBe(true);
    expect(r1.evidence.session_files_before).toBe(1);
    fs.rmSync(noSessions, { recursive: true, force: true });
    const noOut = mkRoot({ out: false });
    const logs = [];
    const r2 = purgeRunRootSessions({ runRoot: noOut, exitCode: 3, log: { log: (m) => logs.push(m) } });
    expect(r2.skipped).toBe('out_dir_unavailable');
    expect(logs.some((l) => l.indexOf('RUN_TEARDOWN_SKIPPED reason=out_dir_unavailable') === 0)).toBe(true);
    expect(fs.existsSync(path.join(noOut, 'out'))).toBe(false);
    expect(fs.existsSync(path.join(noOut, 'home', 'sessions'))).toBe(true);
    fs.rmSync(noOut, { recursive: true, force: true });
  }, 60000);
});
