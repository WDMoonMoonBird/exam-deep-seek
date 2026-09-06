/**
 * defect-precheck.test.js — 确定性缺陷预检 + 折算单测（零 LLM）
 * 用例基于作业 353 的真实提交目录（A/B 组完整、C 组故意缺文件）。
 * 注意：依赖 uploads 目录与标准包存在；若环境无数据则跳过（describe.skip 守卫）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { precheckProject } from '../../../src/services/defectPrecheck.js';
import { scoreDefects } from '../../../src/services/defectScoring.js';

const here = path.dirname(fileURLToPath(import.meta.url)); // server/test/unit/infrastructure
const SERVER = path.resolve(here, '..', '..', '..');
const UPLOADS = path.join(SERVER, 'uploads');
const hasData = fs.existsSync(path.join(UPLOADS, 'project-submissions', '353', '1068', '1'));
const stdDir = path.join(UPLOADS, 'project-questions', '353', 'standard');
const rubricPath = path.join(SERVER, 'test-results', 'trustjudge', 'dataset.jsonl');
let rubric = '';
try {
  rubric = JSON.parse(fs.readFileSync(rubricPath, 'utf8').split('\n')[0]).question.rubric;
} catch { rubric = ''; }

const maybe = hasData ? describe : describe.skip;
maybe('defectPrecheck — 确定性缺陷检测（作业 353 真实提交）', () => {
  it('A 组（标准包原样）无缺陷', () => {
    const dir = path.join(UPLOADS, 'project-submissions', '353', '1066', '1');
    const r = precheckProject({ rootDir: dir, stdDir });
    expect(r.issues).toEqual([]);
    expect(r.fileCount).toBeGreaterThan(0);
  });

  it('B 组（完整实现）无缺陷', () => {
    const dir = path.join(UPLOADS, 'project-submissions', '353', '1067', '1');
    const r = precheckProject({ rootDir: dir, stdDir });
    expect(r.issues).toEqual([]);
  });

  it('C 组（故意缺 Login.vue/user.js）→ 确定性抓到 import 断裂与缺失', () => {
    const dir = path.join(UPLOADS, 'project-submissions', '353', '1068', '1');
    const r = precheckProject({ rootDir: dir, stdDir });
    const types = r.issues.map((i) => i.type);
    expect(types).toContain('missing_import');
    expect(types).toContain('missing_key_file');
    // App.vue 引用了 Login.vue
    const imp = r.issues.find((i) => i.type === 'missing_import');
    expect(imp.file).toContain('App.vue');
    expect(imp.target).toContain('Login.vue');
  });
});

maybe('scoreDefects — 折算（rubric 依赖）', () => {
  it('无缺陷 → 零扣分', () => {
    const s = scoreDefects({ issues: [], rubricText: rubric });
    expect(s.totalHardDeduct).toBe(0);
    expect(s.fatal).toBe(false);
  });

  it('C 组缺陷 → 硬扣 ≥30 且 fatal', () => {
    const dir = path.join(UPLOADS, 'project-submissions', '353', '1068', '1');
    const pre = precheckProject({ rootDir: dir, stdDir });
    const s = scoreDefects({ issues: pre.issues, rubricText: rubric });
    expect(s.fatal).toBe(true);
    expect(s.totalHardDeduct).toBeGreaterThanOrEqual(30);
    // 第一项可运行被全扣
    const run = s.hardDeductions.find((d) => d.reason.includes('可运行'));
    expect(run && run.deduct).toBe(10);
  });
});
