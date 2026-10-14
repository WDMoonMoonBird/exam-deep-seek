/**
 * W1-C-gate · lint 门禁 typeof 守卫豁免（构建期 define）—— 断言层锁定
 *
 * 被锁定行为：
 *   ① `node scripts/gates/lint-check.mjs --self-test` 必须 PASS（门禁不是「永远绿灯」：正控必须命中）
 *   ② vite `define` 的标准写法（`typeof X !== 'undefined' && X ? String(X) : 'dev'`）零 no-undef 误报
 *   ③ 豁免**不得过头**：裸未声明标识符 / 异名 typeof 守卫 / `||` 右侧 必须仍报 no-undef（真阳性）
 *   ④ 真实仓库 client/src/composables/appVersion.js 不再出现 __BUILD_VERSION__ 违规
 *
 * 只做只读调用（spawn 门禁 + 临时目录），不改任何源码；与 W1-C-lintgate.md 的证据同源。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const GATE = path.join(REPO, 'scripts/gates/lint-check.mjs');
const GUARDED_NAME = '__BUILD_VERSION__';

function runGate(args) {
  const res = spawnSync(process.execPath, [GATE, ...args], { cwd: REPO, encoding: 'utf8', timeout: 180000 });
  return { status: res.status, out: String(res.stdout || ''), err: String(res.stderr || '') };
}

function noUndefUnder(root) {
  const r = runGate(['--root', root, '--rule=no-undef', '--json']);
  return (JSON.parse(r.out).violations || []).filter((v) => v.rule === 'no-undef');
}

describe('★W1-C-gate：lint 门禁的 typeof 守卫豁免（构建期 define）', () => {
  it('门禁 --self-test PASS（正控全命中 + 干净树 0 误报）', () => {
    const r = runGate(['--self-test']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('SELF-TEST PASSED');
  }, 240000);

  it('复现夹具零误报 + 三类真阳性仍被抓（豁免不过头）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-gate-w1c-jest-'));
    try {
      const put = (rel, code) => {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, code);
      };
      put('guard/guarded-define.js', [
        "export const buildStamp = typeof " + GUARDED_NAME + " !== 'undefined' && " + GUARDED_NAME
          + ' ? String(' + GUARDED_NAME + ") : 'dev';",
      ].join('\n'));
      put('guard/bare.js', 'export function boom() { return neverDeclaredAnywhere(); }');
      put('guard/wrong-name.js', "export const x = typeof window !== 'undefined' && missingAfterGuard;");
      put('guard/or-branch.js', 'export const y = globalFlag || ghostInOr;');

      const found = noUndefUnder(dir);
      const bySymbol = (s) => found.filter((v) => v.symbol === s).length;

      expect(bySymbol(GUARDED_NAME)).toBe(0);          // 被守卫 ⇒ 放行
      expect(bySymbol('neverDeclaredAnywhere')).toBe(1); // 裸引用 ⇒ 仍报
      expect(bySymbol('missingAfterGuard')).toBe(1);     // 异名守卫 ⇒ 仍报
      expect(bySymbol('ghostInOr')).toBe(1);             // || 右侧 ⇒ 仍报
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 240000);

  it('真实仓库：__BUILD_VERSION__ 违规已消失（client/src/composables/appVersion.js）', () => {
    const r = runGate(['--rule=no-undef', '--json']);
    const hit = (JSON.parse(r.out).violations || []).filter((v) => v.symbol === GUARDED_NAME);
    expect(hit).toEqual([]);
  }, 240000);
});
