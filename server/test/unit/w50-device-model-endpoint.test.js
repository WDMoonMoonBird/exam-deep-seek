/**
 * W50（R2-B22）：装置模型端点必须是 **Messages API 根**（Anthropic 风格）—— 组合矩阵 + profile 落盘守卫 + bash -n + 无 key 泄漏。
 * 只读/沙箱：用 /tmp 隔离 home 调 scaffold_home，不触碰真实 ~/.dsh，不发起任何模型调用。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const LIB = path.join(REPO, 'scripts/dsh-grader/lib.sh');
const FAKE_KEY = 'sk-TESTONLY-w50-not-a-real-key';

function runBash(script, env = {}) {
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    cwd: REPO,
    // ★guard_isolated_home 的临时目录白名单依赖 TMPDIR（无它时 /private/var/folders 会被拒 ⇒ rc=2）⇒ 显式传入
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir(), ...env },
  });
}
function derive(env) {
  const r = runBash(`source '${LIB}' >/dev/null 2>&1; v="$(messages_api_root || true)"; printf '%s' "$v"`, env);
  return (r.stdout || '').trim();
}

describe('W50 装置模型端点（Messages API 根）', () => {
  it('★W50-1 组合矩阵：显式覆盖 > 含 /anthropic > api.deepseek.com ⇒ 追加 > 其他 host ⇒ 原样 > 都未设 ⇒ 空', () => {
    expect(derive({ DSH_GRADER_BASE_URL: 'https://gw.example.com/msg' })).toBe('https://gw.example.com/msg');
    expect(derive({ DSH_GRADER_BASE_URL: 'https://gw.example.com/msg', DEEPSEEK_BASE_URL: 'https://api.deepseek.com' })).toBe('https://gw.example.com/msg');
    expect(derive({ DEEPSEEK_BASE_URL: 'https://api.deepseek.com/anthropic' })).toBe('https://api.deepseek.com/anthropic');
    expect(derive({ DEEPSEEK_BASE_URL: 'https://api.deepseek.com' })).toBe('https://api.deepseek.com/anthropic');
    expect(derive({ DEEPSEEK_BASE_URL: 'https://api.deepseek.com/' })).toBe('https://api.deepseek.com/anthropic');
    expect(derive({ DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1' })).toBe('https://api.deepseek.com/anthropic');
    expect(derive({ DEEPSEEK_BASE_URL: 'https://my-gw.internal/llm' })).toBe('https://my-gw.internal/llm');
    expect(derive({})).toBe('');
  });

  it('★★W50-2 回归守卫：profile 落盘 baseURL 必须含 /anthropic（当 DEEPSEEK_BASE_URL=https://api.deepseek.com 时）', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'w50-home-'));
    const script = [
      `source '${LIB}' >/dev/null 2>&1`,
      `export DSH_HOME='${home}'`,
      `export DSH_PROFILE_NAME='headless-w50'`,
      `export DEEPSEEK_BASE_URL='https://api.deepseek.com'`,
      `export DEEPSEEK_MODEL='deepseek-v4-flash'`,
      `export DEEPSEEK_API_KEY='${FAKE_KEY}'`,
      `scaffold_home '${home}'`,
    ].join('; ');
    const out = runBash(script, {});
    expect(out.status).toBe(0);
    const patchPath = path.join(home, 'profiles', 'headless-w50', 'cordis.patch.yml');
    const patch = fs.readFileSync(patchPath, 'utf8');
    expect(patch).toContain('baseURL: https://api.deepseek.com/anthropic');
    expect(patch).not.toContain('baseURL: https://api.deepseek.com\n');
    expect(patch).toContain('model: deepseek-v4-flash');
    // 可观测：打印生效端点（scheme+host+path）与模型；**不得出现 key**
    const printed = (out.stdout || '') + (out.stderr || '');
    expect(printed).toContain('MODEL_ENDPOINT=https://api.deepseek.com/anthropic model=deepseek-v4-flash');
    expect(printed).not.toContain(FAKE_KEY);
    expect(printed).not.toContain('sk-');
    expect(patch).not.toContain(FAKE_KEY);
    fs.rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('★W50-3 未设任何端点 ⇒ 不写 baseURL 且明示 device-default（既有行为不变）', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'w50-home2-'));
    const script = [
      `source '${LIB}' >/dev/null 2>&1`,
      `export DSH_HOME='${home}' DSH_PROFILE_NAME='headless-w50b' DEEPSEEK_MODEL='deepseek-v4-flash'`,
      `unset DEEPSEEK_BASE_URL DSH_GRADER_BASE_URL`,
      `scaffold_home '${home}'`,
    ].join('; ');
    const out = runBash(script, {});
    expect(out.status).toBe(0);
    const patch = fs.readFileSync(path.join(home, 'profiles', 'headless-w50b', 'cordis.patch.yml'), 'utf8');
    expect(patch).not.toContain('baseURL:');
    expect((out.stdout || '')).toContain('MODEL_ENDPOINT=(device-default) model=deepseek-v4-flash');
    fs.rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('★W50-4 显式覆盖写入 profile（DSH_GRADER_BASE_URL 优先于 DEEPSEEK_BASE_URL）', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'w50-home3-'));
    const script = [
      `source '${LIB}' >/dev/null 2>&1`,
      `export DSH_HOME='${home}' DSH_PROFILE_NAME='headless-w50c'`,
      `export DSH_GRADER_BASE_URL='https://gw.example.com/msg'`,
      `export DEEPSEEK_BASE_URL='https://api.deepseek.com'`,
      `scaffold_home '${home}'`,
    ].join('; ');
    const out = runBash(script, {});
    expect(out.status).toBe(0);
    const patch = fs.readFileSync(path.join(home, 'profiles', 'headless-w50c', 'cordis.patch.yml'), 'utf8');
    expect(patch).toContain('baseURL: https://gw.example.com/msg');
    expect(patch).not.toContain('/anthropic');
    fs.rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('W50-5 bash -n：lib.sh 语法正确', () => {
    const r = spawnSync('bash', ['-n', LIB], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });
});
