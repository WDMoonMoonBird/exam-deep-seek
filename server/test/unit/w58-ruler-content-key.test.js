/**
 * W58（R2-B35）：尺子内容指纹 content_key 的**口径与可复算性**（纯函数层，不连库）。
 *
 * 覆盖：
 *  ① 规范化（CRLF/CR→LF + 去首尾空白）⇒ 同内容同 key、改一字不同 key；
 *  ② canonical 三段串**逐字**形状 + 用 shasum 子进程**独立复算**（不信任被测实现自己的哈希函数）；
 *  ③ 题目描述字节 ≡ r2b20-export-materials.buildAssignmentMd（同一份装置输入字节）；
 *  ④ 标准包口径 = 确定性 zip 字节 sha；目录缺失/为空 ⇒ **fail-closed**（不得静默降级为快照口径）；
 *  ⑤ 装置口径 dir digest（按 ignore 复算）与 scripts/dsh-checker/validate.py 逐位对拍；
 *  ⑥ 真实导出样例对拍（/tmp/grader-materials/311，存在才跑）；
 *  ⑦ 老/假 prisma（无 $queryRawUnsafe）⇒ 解析层降级不抛错（w15 回归保护）。
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAssignmentDescription, canonicalContentKeyInput, computeContentKey, CONTENT_KEY_LEN,
  explainContentKey, normalizeRulerText, resolveStandardPackageDir, resolveStandardPackageSha256,
  resolveUploadsRoot, rubricContentSha256, sha256Hex, standardDirDigest,
} from '../../src/infrastructure/dsh/ruler/dshRulerContentKey.js';
import { resolveAssignmentContent, resolveRulerForAssignment } from '../../src/infrastructure/dsh/ruler/dshRulerAssignment.js';
import { RULER_TAG, normalizeRulerRow, resolvePollMs, resolveWaitMs } from '../../src/infrastructure/dsh/ruler/dshRulerStore.js';
import { buildAssignmentMd } from '../../scripts/r2b20-export-materials.mjs';
import { zipDirectory } from '../../src/infrastructure/execution/deterministic-zip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const CHECKER_DIR = path.join(REPO, 'scripts', 'dsh-checker');
const SAMPLE_EXPORT = '/tmp/grader-materials/311';

function py(expr) {
  const res = spawnSync('python3', ['-c', 'import sys; sys.path.insert(0, ' + JSON.stringify(CHECKER_DIR) + '); import validate as V; ' + expr], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error('python failed: ' + res.stderr);
  return res.stdout.trim();
}

/** 用系统 shasum 独立复算（不经过被测模块） */
function shasumOf(text) {
  const res = spawnSync('shasum', ['-a', '256'], { input: Buffer.from(text, 'utf8'), encoding: 'utf8' });
  if (res.status !== 0) throw new Error('shasum failed: ' + res.stderr);
  return String(res.stdout).trim().split(/\s+/)[0];
}

describe('W58 尺子内容指纹（content_key）口径', () => {
  it('W58-1 ★规范化：CRLF/CR→LF + 去首尾空白 ⇒ 等价输入同 key；改一字不同 key；key 为 64 位小写 hex', () => {
    const base = { standardSha: 'sha256:absent', rubric: '评分标准A：1) 拆分 2) 路由', description: '# 题目\n\n材料' };
    const k = computeContentKey(base);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).toHaveLength(CONTENT_KEY_LEN);
    // 换行统一 + 首尾空白：三种写法等价
    expect(computeContentKey({ ...base, rubric: '  评分标准A：1) 拆分 2) 路由\r\n' })).toBe(k);
    expect(computeContentKey({ ...base, rubric: '评分标准A：1) 拆分 2) 路由\r' })).toBe(k);
    expect(computeContentKey({ ...base, description: '\r\n# 题目\n\n材料\n\n' })).toBe(k);
    // 改一字 ⇒ 不同 key
    expect(computeContentKey({ ...base, rubric: '评分标准A：1) 拆分 2) 路 由' })).not.toBe(k);
    expect(computeContentKey({ ...base, standardSha: 'sha256:' + 'a'.repeat(64) })).not.toBe(k);
    expect(computeContentKey({ ...base, description: '# 题目\n\n材料x' })).not.toBe(k);
    // 段间边界无歧义：把 rubric 的内容挪到 description 不能撞 key
    const moved = computeContentKey({ standardSha: base.standardSha, rubric: base.description, description: base.rubric });
    expect(moved).not.toBe(k);
  });

  it('W58-2 ★canonical 串逐字形状 + shasum 子进程独立复算 == computeContentKey', () => {
    const input = { standardSha: 'b92495', rubric: 'R1\r\nR2 ', description: 'D\n' };
    const canonical = canonicalContentKeyInput(input);
    expect(canonical).toBe('standard_sha256=b92495\nrubric=R1\nR2\ndescription=D');
    expect(computeContentKey(input)).toBe(shasumOf(canonical)); // 独立复算（不信任实现）
    const ex = explainContentKey(input);
    expect(ex.contentKey).toBe(shasumOf(ex.canonical));
    expect(ex.parts.rubricSha256).toBe('sha256:' + sha256Hex('R1\r\nR2 ')); // 装置口径=原始字节（不规范化）
    expect(ex.parts.rubric).toBe('R1\nR2'); // 参与 key 的是规范化后的文本
    expect(ex.recompute).toContain('shasum -a 256');
  });

  it('W58-3 题目描述字节 ≡ r2b20 buildAssignmentMd（装置 题目描述.md 的同一份字节）', () => {
    expect(buildAssignmentDescription({ title: '  T ', material: '  M\n' })).toBe(buildAssignmentMd({ title: '  T ', material: '  M\n' }));
    expect(buildAssignmentDescription({ title: 'T', material: 'M' })).toBe('# T\n\nM\n');
    expect(buildAssignmentDescription({ title: '', material: '' })).toBe('# \n\n\n');
  });

  it('W58-4 ★标准包口径 = 确定性 zip 字节 sha；目录缺失/为空 ⇒ fail-closed（无静默降级）', () => {
    const uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w58-uploads-'));
    const qid = 987654321;
    const dir = path.join(uploadsRoot, 'project-questions', String(qid), 'standard');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'beta');
    expect(resolveStandardPackageDir(qid, { uploadsRoot })).toBe(dir);
    const got = resolveStandardPackageSha256({ questionId: qid, uploadsRoot });
    expect(got.ok).toBe(true);
    expect(got.source).toBeUndefined(); // 返回值形态：{ok, sha256, dir, files, bytes}
    expect(got.sha256).toBe(sha256Hex(zipDirectory(dir))); // 与确定性 zip 字节逐位一致（可独立复算）
    expect(got.sha256).toBe(crypto.createHash('sha256').update(zipDirectory(dir)).digest('hex')); // 不依赖本模块的哈希实现
    expect(got.files).toBe(2);
    // 目录缺失 ⇒ ok:false（fail-closed；绝不回落 assignment_questions.standard_hash）
    const missing = resolveStandardPackageSha256({ questionId: 987654322, uploadsRoot });
    expect(missing.ok).toBe(false);
    expect(missing.reason).toBe('standard_package_missing');
    // 空目录 ⇒ ok:false
    const emptyDir = path.join(uploadsRoot, 'project-questions', '987654323', 'standard');
    fs.mkdirSync(emptyDir, { recursive: true });
    const empty = resolveStandardPackageSha256({ questionId: 987654323, uploadsRoot });
    expect(empty).toEqual({ ok: false, reason: 'standard_package_empty', dir: emptyDir });
    fs.rmSync(uploadsRoot, { recursive: true, force: true });
  });

  it('W58-5 装置口径 dir digest（按 checker 的 ignore 复算）与 validate.py 逐位对拍', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w58-digest-'));
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'node_modules', 'x.js'), 'x');
    fs.writeFileSync(path.join(root, 'a.txt'), 'alpha');
    const ignore = ['node_modules/**'];
    expect(standardDirDigest(root, ignore)).toBe(py('print(V.dir_sha256(' + JSON.stringify(root) + ', ' + JSON.stringify(ignore) + ')[0])'));
    expect(standardDirDigest(root, [])).toBe(py('print(V.dir_sha256(' + JSON.stringify(root) + ', ())[0])'));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('W58-6 真实导出样例对拍（/tmp/grader-materials/311 存在时）：A 独立复算的两个值逐位一致', () => {
    if (!fs.existsSync(path.join(SAMPLE_EXPORT, 'export-manifest.json'))) {
      console.log('W58-6 SKIP：样例目录不存在（' + SAMPLE_EXPORT + '）');
      return;
    }
    const m = JSON.parse(fs.readFileSync(path.join(SAMPLE_EXPORT, 'export-manifest.json'), 'utf8'));
    const S = sha256Hex(fs.readFileSync(path.join(SAMPLE_EXPORT, m.standard.file))); // 字节口径（sha256Hex 支持 Buffer）
    const R = fs.readFileSync(path.join(SAMPLE_EXPORT, m.rubric.file), 'utf8');
    const D = fs.readFileSync(path.join(SAMPLE_EXPORT, m.assignment_doc.file), 'utf8');
    expect(S).toBe(m.standard.sha256);
    expect(computeContentKey({ standardSha: S, rubric: R, description: D })).toBe('c031b1fee35020ea6c93d464d4a06ef105ad7d0d116cc31ad71c80b169958470');
    expect(computeContentKey({ standardSha: S, rubric: R.replace('功能', '功 能'), description: D })).toBe('51418469488e94259581eaaa15a87e8c75610f26b94656aa8e7dfe577ab2cf45');
    // 与导出器 sha256 口径对拍（rubric / 题目描述）
    expect(rubricContentSha256(R)).toBe('sha256:' + m.rubric.sha256);
    expect(sha256Hex(D)).toBe(m.assignment_doc.sha256);
  });

  it('W58-7 假 prisma（无 $queryRawUnsafe）⇒ 解析层降级不抛错（w15 回归保护）', async () => {
    const fake = { assignment: { findFirst: async () => null }, gradingChecker: { findFirst: async () => null } };
    const c = await resolveAssignmentContent({ prisma: fake, assignmentId: 1 });
    expect(c.ok).toBe(false);
    const r = await resolveRulerForAssignment({ prisma: fake, assignmentId: 1, mode: 'reuse', log: { log() {}, warn() {}, info() {} } });
    expect(r.ok).toBe(false);
    expect(r.contentOk).toBe(false);
    // 纯助手：row 归一、env 解析、机制标记常量
    expect(normalizeRulerRow(null)).toBeNull();
    expect(normalizeRulerRow({ id: 1n, content_key: 'k', status: 'ready', checker_id: 'c', checker_raw: Buffer.from('x') }).id).toBe(1);
    expect(resolveUploadsRoot({ DSH_GRADER_UPLOADS_ROOT: ' /tmp/x ' })).toBe('/tmp/x');
    expect(resolveUploadsRoot({})).toBeNull();
    expect(resolvePollMs({ DSH_RULER_POLL_MS: '7' })).toBe(7);
    expect(resolveWaitMs({ DSH_RULER_WAIT_MS: '0' })).toBe(0);
    expect(RULER_TAG.reuse).toBe('RULER_REUSE_HIT');
    expect(RULER_TAG.adopted).toBe('RULER_ADOPTED_OLD_ANCHOR');
    expect(RULER_TAG.bindConflict).toBe('RULER_BIND_CONFLICT');
    expect(normalizeRulerText(null)).toBe('');
    expect(crypto.createHash('sha256').update('x').digest('hex')).toHaveLength(64);
  });
});
