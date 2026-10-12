/**
 * W51（R2-B28b 改写）：**装置侧零注入**守卫 + 会话销毁由 worker 层承担。
 * 背景：路线 2 把 teardown 从装置 run.sh 的 EXIT trap 移出（装置脚本与 HEAD 逐字节一致）——装置侧注入会与
 * 「预期非 0 退出」场景交互（t82：`$var` 紧跟全角字符 ⇒ bash 3.2 unbound ⇒ 覆盖退出码）。
 * 断言口径：装置内**不存在**任何 teardown/purge 接线；销毁由 worker 承担且顺序为 teardown → 归档。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const LIB = path.join(REPO, 'scripts/dsh-grader/lib.sh');
const RUN = path.join(REPO, 'scripts/dsh-grader/run.sh');
const ARCHIVER = path.join(REPO, 'server/src/services/dshRunArchiver.js');
const WORKER = path.join(REPO, 'server/src/services/dshGradingJobWorker.js');

function bash(script) {
  return spawnSync('bash', ['-c', script], { encoding: 'utf8', cwd: REPO, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir() } });
}
function mkScene() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'w51-home-'));
  fs.mkdirSync(path.join(home, 'sessions', 'wd', 'sid1'), { recursive: true });
  fs.writeFileSync(path.join(home, 'sessions', 'wd', 'sid1', 'session.v4.jsonl.zstd'), Buffer.alloc(2048, 7));
  fs.mkdirSync(path.join(home, 'storages', 'session_projcache', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(home, 'storages', 'session_projcache', 'sessions', 'a.json'), '{}');
  fs.mkdirSync(path.join(home, 'profiles', 'headless'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'headless', 'cordis.patch.yml'), '- id: x');
  fs.writeFileSync(path.join(home, '.credentials.yaml'), 'DEEPSEEK_API_KEY: sk-should-never-persist');
  return home;
}

describe('W51 装置侧零注入 + worker 层会话销毁（R2-B28b 改写）', () => {
  it('★W51-1 session_stats 取证：sessions/** 与 storages/session_projcache/** 都计入（文件数 + 字节）', () => {
    const home = mkScene();
    const out = bash(`source '${LIB}' >/dev/null 2>&1; session_stats '${home}'`);
    expect(out.status).toBe(0);
    expect(out.stdout.trim()).toBe('2 2050');
    fs.rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('★W51-2 失败现场：write_keep_scene 写入 .keep-scene（含保留天数）且不删任何东西', () => {
    const home = mkScene();
    const out = bash(`source '${LIB}' >/dev/null 2>&1; write_keep_scene '${home}' 3; cat '${home}/.keep-scene'`);
    expect(out.stdout).toContain('keep_scene=yes');
    expect(out.stdout).toContain('keep_days=3');
    expect(fs.existsSync(path.join(home, 'sessions'))).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('★★W51-3 装置侧零注入：run.sh / lib.sh 不含任何 teardown/purge 接线', () => {
    const run = fs.readFileSync(RUN, 'utf8');
    const lib = fs.readFileSync(LIB, 'utf8');
    for (const needle of ['--purge-home', '--keep-home', 'PURGE_HOME=', 'teardown_home', 'purge_sessions', 'SCENE_KEEP_DAYS', 'run-teardown.json', 'RUN_TEARDOWN=']) {
      expect(run.includes(needle)).toBe(false);
    }
    for (const needle of ['teardown_home', 'purge_sessions', 'run-teardown.json', 'RUN_TEARDOWN=']) {
      expect(lib.includes(needle)).toBe(false);
    }
    expect(lib.includes('cleanup_credentials()')).toBe(true);
    expect(lib.includes('guard_isolated_home()')).toBe(true);
  });

  it('★★W51-4 销毁由 worker 承担：purgeRunRootSessions 存在且 runOnce 顺序为 teardown → 归档', () => {
    const archiver = fs.readFileSync(ARCHIVER, 'utf8');
    const worker = fs.readFileSync(WORKER, 'utf8');
    expect(archiver.includes('export function purgeRunRootSessions(')).toBe(true);
    expect(archiver.includes('export function sessionStats(')).toBe(true);
    expect(archiver.includes("home_policy: 'sessions+credentials'")).toBe(true);
    const teardownIdx = worker.indexOf('purgeRunRootSessions({ runRoot: res.runRoot');
    const archiveIdx = worker.indexOf('await archiveRun({ runRoot: res.runRoot');
    expect(teardownIdx).toBeGreaterThan(-1);
    expect(archiveIdx).toBeGreaterThan(-1);
    expect(teardownIdx).toBeLessThan(archiveIdx);
  });

  it('★W51-5 装置脚本与 HEAD 逐字节一致（零注入的强证据）', () => {
    const c = (f) => spawnSync('bash', ['-c', `cd '${REPO}' && cmp -s ${f} <(git show HEAD:${f}) && echo SAME || echo DIFF`], { encoding: 'utf8' }).stdout.trim();
    expect(c('scripts/dsh-grader/run.sh')).toBe('SAME');
    expect(c('scripts/dsh-grader/selftest.sh')).toBe('SAME');
  }, 60000);
});
