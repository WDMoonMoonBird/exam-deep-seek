/**
 * defect-precheck.test.js — 确定性缺陷预检 + 折算单测（零 LLM）
 *
 * ★W2-C14：改为**自造夹具**（os.tmpdir() 下的最小工程），不再依赖 uploads/ 的真实上传副本。
 *   原因：uploads/ 被 .gitignore:21 忽略（git ls-files 无该夹具）⇒ 旧用例依赖**未版本化的运行时数据**，
 *   不可复现（W1 时“恰好”通过，与任何代码改动无关）。rubric 同样改为**内联常量**
 *   （原读 server/test-results/trustjudge/dataset.jsonl，也是未版本化数据）。
 *
 * 两个方向都断言：① 有 C 组缺陷 ⇒ fatal + 硬扣 ≥30 + 第一项「可运行」全扣 10；② 无缺陷 ⇒ issues 空 + 硬扣 0。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { precheckProject } from '../../../src/services/defectPrecheck.js';
import { scoreDefects } from '../../../src/services/defectScoring.js';

/** 自足 rubric：第一项 10 分（import 断裂 ⇒ 全扣）；登录 20 分；Pinia 状态管理 20 分（user.js） */
const RUBRIC = [
  '第一项 项目初始化与可运行，10 分。',
  '第二项 用户登录功能（Login.vue），20 分。',
  '第三项 Pinia 状态管理（user.js），20 分。',
].join('\n');

/** App.vue 引用 ./views/Login.vue —— 缺失即 import 断裂（C 组核心缺陷） */
const APP_VUE = [
  '<template><router-view/></template>',
  '<script>',
  "import Login from './views/Login.vue';",
  'export default { components: { Login } };',
  '</script>',
  '',
].join('\n');

/** 造一个最小工程；withLogin/withUser=false 即为「C 组」缺关键文件 */
function writeProject(root, { withLogin, withUser }) {
  fs.mkdirSync(path.join(root, 'src', 'views'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'store'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'main.js'), "import App from './App.vue';\n");
  fs.writeFileSync(path.join(root, 'src', 'App.vue'), APP_VUE);
  if (withLogin) fs.writeFileSync(path.join(root, 'src', 'views', 'Login.vue'), '<template><div/></template>\n');
  if (withUser) fs.writeFileSync(path.join(root, 'src', 'store', 'user.js'), 'export const user = {};\n');
  return root;
}

let tmpRoot;
let stdDir;
let fullDir;
let brokenDir;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'defect-precheck-'));
  stdDir = writeProject(path.join(tmpRoot, 'std'), { withLogin: true, withUser: true });
  fullDir = writeProject(path.join(tmpRoot, 'full'), { withLogin: true, withUser: true });
  brokenDir = writeProject(path.join(tmpRoot, 'broken'), { withLogin: false, withUser: false });
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('precheckProject — 自造夹具（C 组 = 缺 Login.vue / user.js，且 App.vue import 断裂）', () => {
  it('完整工程（对标原 A 组）→ 无缺陷', () => {
    const r = precheckProject({ rootDir: fullDir, stdDir });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.fileCount).toBeGreaterThan(0);
  });

  it('C 组 → 确定性抓到 import 断裂与关键文件缺失', () => {
    const r = precheckProject({ rootDir: brokenDir, stdDir });
    const types = r.issues.map((i) => i.type);
    expect(types).toContain('missing_import');
    expect(types).toContain('missing_key_file');
    // App.vue 引用了 Login.vue（目标确实被点名）
    const imp = r.issues.find((i) => i.type === 'missing_import');
    expect(imp.file).toContain('App.vue');
    expect(imp.target).toContain('Login.vue');
    // 关键文件缺失按 basename 记（Login.vue / user.js 都应被记）
    const miss = r.issues.filter((i) => i.type === 'missing_key_file').map((i) => i.file);
    expect(miss.join(' ')).toContain('Login.vue');
    expect(miss.join(' ')).toContain('user.js');
  });

  it('同一工程重复预检结果稳定（确定性：issue 类型集合逐一相等）', () => {
    const a = precheckProject({ rootDir: brokenDir, stdDir });
    const b = precheckProject({ rootDir: brokenDir, stdDir });
    expect(a.issues.map((i) => i.type).sort()).toEqual(b.issues.map((i) => i.type).sort());
  });
});

describe('scoreDefects — 折算（rubric 依赖）', () => {
  it('无缺陷 → 零扣分（反向方向）', () => {
    const pre = precheckProject({ rootDir: fullDir, stdDir });
    expect(pre.issues).toEqual([]);
    const s = scoreDefects({ issues: pre.issues, rubricText: RUBRIC });
    expect(s.totalHardDeduct).toBe(0);
    expect(s.fatal).toBe(false);
  });

  it('C 组缺陷 → 硬扣 ≥30 且 fatal（正向方向）', () => {
    const pre = precheckProject({ rootDir: brokenDir, stdDir });
    const s = scoreDefects({ issues: pre.issues, rubricText: RUBRIC });
    expect(s.fatal).toBe(true);
    expect(s.totalHardDeduct).toBeGreaterThanOrEqual(30);
    // 第一项「可运行」被全扣（import 断裂 ⇒ 无法启动）
    const run = s.hardDeductions.find((d) => d.reason.includes('可运行'));
    expect(run && run.deduct).toBe(10);
  });
});
