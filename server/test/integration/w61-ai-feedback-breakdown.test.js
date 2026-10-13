/**
 * W61（R2-B41 / t14）：装置**分项依据**接进 submissions.ai_feedback.breakdown + 确定性回填脚本。
 *
 * 覆盖：
 *  ①有 grading-result 投影 ⇒ breakdown 带 title/status，且 comment 取装置 reason（含「证据: <路径>」**不被截断**，上限 300）；
 *  ②缺投影 / 坏 JSON / 缺 reason ⇒ 不崩、分数照写、comment 退化为空；
 *  ③判定口径回归 ⇒ 同夹具「有投影 vs 无投影」的 aiScore/checkerId/canonicalSha256/gradingStale 逐项一致（分数来源不变）；
 *  ④回填脚本本地演练：dry-run 不写库、--apply 只改 ai_feedback、分数零变化、幂等。
 * 仅测试库；自建行与临时目录，afterAll 清理。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { buildWriteback, consumeMeasureResults, loadGradingResultIndex, normalizeDetailDoc } from '../../src/services/dshCheckerConsumer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const SCRIPT = path.join(SERVER, 'scripts', 'backfill-ai-feedback.mjs');
const FIXTURE = path.join(SERVER, 'scripts', 'fixtures', 'checker.sample.json');
const TAG = 'w61-aifb-' + Date.now();
const cleanup = { assignmentIds: [], questionIds: [], userIds: [], submissionIds: [], roots: [] };

const LONG_REASON = 'P01(count_regex): 2 <= 计数 <= 50 / 计数 4 | 证据: src/main/webapp/WEB-INF/web.xml 第 12 行 jakartaee 命名空间声明（这段前缀刻意加长以证明 60 字截断会切掉证据路径）';

function mkRunRoot({ slug, score, items = null, projection = 'per-slug', projectItems = null, brokenProjection = false, manifestStudentName = '' } = {}) {
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w61-run-'));
  cleanup.roots.push(runRoot);
  fs.mkdirSync(path.join(runRoot, 'out', 'measure'), { recursive: true });
  fs.mkdirSync(path.join(runRoot, 'out', 'assignment'), { recursive: true });
  const checker = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  fs.writeFileSync(path.join(runRoot, 'out', 'measure', slug + '.json'), JSON.stringify({
    schema_version: 'checker-result/1',
    checker_id: checker.checker_id,
    canonical_sha256: 'sha256:' + 'c'.repeat(64),
    submission: { id: slug, root_rel: '.', digest: 'sha256:' + 'a'.repeat(64), file_count: 5 },
    totals: { score, max_score: checker.scoring.max_score, aggregate: checker.scoring.aggregate },
    // ★分数来源（量尺投影）：items 只有分数，**没有** reason/title/status
    items: items || [
      { id: 'P01', score: 1, max_score: 1, comment: '' },
      { id: 'P02', score: 0, max_score: 1, comment: '' },
    ],
    reconciliation: { expected_items: 2, evaluated_items: 2, unsupported: [], errors: [] },
    stale: false, run_meta: { exit_code: 0 },
  }));
  // ★manifest.submissions[].id 是**源目录名/学生名**（deriveSlugMapFromRunRoot 按 realName/username 对齐），不是提交 id
  const manifest = { schema_version: 'assignment-manifest/1', assignment_id: String(cleanup.assignmentIds[0] || ''), submissions: [{ slug, id: manifestStudentName || '' }] };
  fs.writeFileSync(path.join(runRoot, 'out', 'assignment', 'assignment-manifest.json'), JSON.stringify(manifest));
  if (brokenProjection) {
    fs.mkdirSync(path.join(runRoot, 'out', 'grading-result'), { recursive: true });
    fs.writeFileSync(path.join(runRoot, 'out', 'grading-result', slug + '.json'), '{ 坏 JSON');
  } else if (projection === 'per-slug') {
    fs.mkdirSync(path.join(runRoot, 'out', 'grading-result'), { recursive: true });
    fs.writeFileSync(path.join(runRoot, 'out', 'grading-result', slug + '.json'), JSON.stringify({
      submission: { id: slug },
      totals: { score, max_score: checker.scoring.max_score },
      items: projectItems || [
        { id: 'P01', title: 'web.xml 使用 jakartaee 命名空间且声明 web-app 5.0 版本', max_score: 1, score: 1, status: 'hit', reason: LONG_REASON },
        { id: 'P02', title: 'web-app 版本声明存在', max_score: 1, score: 0, status: 'miss', reason: 'P02(regex): 未命中 | 证据: src/main/webapp/WEB-INF/web.xml' },
      ],
    }));
  } else if (projection === 'single-doc') {
    fs.writeFileSync(path.join(runRoot, 'out', 'grading-result.json'), JSON.stringify({ items: [{ id: 'P01', title: '单份契约分项', status: 'hit', score: 1, max_score: 1, reason: '单份契约 reason | 证据: src/x.java' }] }));
  }
  return runRoot;
}

async function mkSubmissionRows(n = 2) {
  const teacher = await prisma.user.create({ data: { username: TAG + '-t', password: 'x', role: 'teacher', realName: TAG } });
  cleanup.userIds.push(teacher.id);
  const q = await prisma.question.create({ data: { teacherId: teacher.id, title: TAG, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
  cleanup.questionIds.push(q.id);
  const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: TAG, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
  cleanup.assignmentIds.push(a.id);
  await prisma.assignmentQuestion.create({ data: { assignmentId: a.id, questionId: q.id, sortOrder: 1 } });
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const u = await prisma.user.create({ data: { username: TAG + '-s' + i, password: 'x', role: 'student', realName: TAG + ' 学生' + (i + 1) } });
    cleanup.userIds.push(u.id);
    const s = await prisma.submission.create({ data: { assignmentId: a.id, studentId: u.id, questionId: q.id, status: 'submitted', aiFeedback: '旧的 AI 评语（自然语言）' } });
    cleanup.submissionIds.push(s.id);
    out.push({ id: s.id, studentId: u.id, realName: u.realName });
  }
  return { assignmentId: a.id, questionId: q.id, rows: out };
}

describe('W61 AI 评分依据（R2-B41）', () => {
  let env = null;

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { id: { in: cleanup.submissionIds } } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: cleanup.assignmentIds } } });
    await prisma.assignment.deleteMany({ where: { id: { in: cleanup.assignmentIds } } });
    await prisma.question.deleteMany({ where: { id: { in: cleanup.questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
    for (const d of cleanup.roots) fs.rmSync(d, { recursive: true, force: true });
  }, 90000);

  beforeAll(async () => { env = await mkSubmissionRows(2); }, 90000);

  it('★W61-1 有 grading-result 投影 ⇒ breakdown 带 title/status，comment 取装置 reason 且「证据: <路径>」不被截断（上限 300）', async () => {
    const slug = 'w61-s1';
    const runRoot = mkRunRoot({ slug, score: 1, manifestStudentName: env.rows[0].realName });
    const res = await consumeMeasureResults({ prisma, runRoot, assignmentId: env.assignmentId, logImpl: { info() {} } });
    expect(res.written).toBe(1);
    const sub = await prisma.submission.findUnique({ where: { id: env.rows[0].id }, select: { aiScore: true, aiFeedback: true, checkerId: true } });
    expect(sub.aiScore).toBe(1);                                   // ★分数来源不变
    const fb = JSON.parse(sub.aiFeedback);
    expect(fb.source).toBe('dsh-checker');
    expect(fb.detail_source).toContain('out/grading-result/');      // 依据来源留痕
    expect(fb.breakdown).toHaveLength(2);
    const p01 = fb.breakdown.find((x) => x.item === 'P01');
    expect(p01.title).toBe('web.xml 使用 jakartaee 命名空间且声明 web-app 5.0 版本');
    expect(p01.status).toBe('hit');
    expect(p01.score).toBe(1);
    expect(p01.maxScore).toBe(1);
    expect(p01.comment).toContain('证据: src/main/webapp/WEB-INF/web.xml');   // ★60 字截断会切掉证据 ⇒ 证明上限已放宽
    expect(p01.comment).toContain('第 12 行');
    expect(p01.comment.length).toBeGreaterThan(60);
    expect(p01.comment.length).toBeLessThanOrEqual(300);
    const p02 = fb.breakdown.find((x) => x.item === 'P02');
    expect(p02.status).toBe('miss');
    expect(p02.comment).toContain('证据:');
  }, 90000);

  it('★W61-2 缺投影 / 坏 JSON / 缺 reason ⇒ 不崩、分数照写、comment 退化为空', async () => {
    const cases = [
      { slug: 'w61-s2', projection: 'none' },
      { slug: 'w61-s2b', projection: 'per-slug', brokenProjection: true },
      { slug: 'w61-s2c', projection: 'per-slug', projectItems: [{ id: 'P01', title: '无 reason 的分项', score: 1, max_score: 1 }] },
    ];
    for (const c of cases) {
      const runRoot = mkRunRoot({ slug: c.slug, score: 1, projection: c.projection, brokenProjection: c.brokenProjection, projectItems: c.projectItems, manifestStudentName: env.rows[1].realName });
      const res = await consumeMeasureResults({ prisma, runRoot, assignmentId: env.assignmentId, logImpl: { info() {} } });
      expect(res.written).toBe(1);                                  // ★缺依据不影响写分
      const sub = await prisma.submission.findUnique({ where: { id: env.rows[1].id }, select: { aiScore: true, aiFeedback: true } });
      expect(sub.aiScore).toBe(1);
      const fb = JSON.parse(sub.aiFeedback);
      const comments = fb.breakdown.map((x) => String(x.comment || ''));
      expect(comments.every((x) => x === '')).toBe(true);            // ★退化为空（不编造依据）
      const titles = fb.breakdown.map((x) => String(x.title || ''));
      if (c.projectItems) {
        // 有投影但缺 reason：title/status 仍可落地（部分增强），comment 为空
        expect(titles.some((x) => x !== '')).toBe(true);
        expect(fb.breakdown.find((x) => x.item === 'P01').title).toBe('无 reason 的分项');
      } else {
        expect(titles.every((x) => x === '')).toBe(true);            // 无/坏投影 ⇒ 连 title 也没有（不编造）
      }
    }
  }, 120000);

  it('★W61-3 判定口径回归：同夹具「有投影 vs 无投影」的 aiScore/checkerId/canonicalSha256/gradingStale 逐项一致', async () => {
    const withProj = buildWriteback({
      result: { totals: { score: 77, max_score: 100 }, checker_id: 'sha256:' + 'd'.repeat(64), canonical_sha256: 'sha256:' + 'e'.repeat(64), stale: false, items: [{ id: 'P01', score: 1, max_score: 1 }] , grading_detail: { items: [{ id: 'P01', title: 'T', status: 'hit', reason: 'R | 证据: src/a.java' }], source: 'out/grading-result/x.json' } },
      score: 77,
    });
    const without = buildWriteback({
      result: { totals: { score: 77, max_score: 100 }, checker_id: 'sha256:' + 'd'.repeat(64), canonical_sha256: 'sha256:' + 'e'.repeat(64), stale: false, items: [{ id: 'P01', score: 1, max_score: 1 }] },
      score: 77,
    });
    expect(withProj.aiScore).toBe(without.aiScore);
    expect(withProj.checkerId).toBe(without.checkerId);
    expect(withProj.canonicalSha256).toBe(without.canonicalSha256);
    expect(withProj.gradingStale).toBe(without.gradingStale);
    const a = JSON.parse(withProj.aiFeedback); const b = JSON.parse(without.aiFeedback);
    expect(a.raw_score).toBe(b.raw_score);
    expect(a.score_int).toBe(b.score_int);
    expect(a.breakdown.map((x) => [x.item, x.score, x.maxScore])).toEqual(b.breakdown.map((x) => [x.item, x.score, x.maxScore]));
    expect(a.breakdown[0].comment).toContain('证据:');                // 只有依据变丰富，分数与判定不变
    expect(b.breakdown[0].comment).toBe('');
  }, 60000);

  it('★W61-4 回填脚本：dry-run 不写库 / --apply 只改 ai_feedback / 分数零变化 / 幂等', async () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'w61-backfill-'));
    cleanup.roots.push(src);
    fs.mkdirSync(path.join(src, 'out', 'grading-result'), { recursive: true });
    const items = [
      { id: 'P01', title: '分项一', max_score: 1, score: 1, status: 'hit', reason: 'P01 | 证据: src/a.java' },
      { id: 'P02', title: '分项二', max_score: 1, score: 0, status: 'miss', reason: 'P02 | 证据: src/b.java' },
    ];
    fs.writeFileSync(path.join(src, 'out', 'grading-result', 'w61-bf1.json'), JSON.stringify({ submission: { id: 'w61-bf1', student_name: env.rows[0].realName }, totals: { score: 1, max_score: 2 }, items }));
    fs.writeFileSync(path.join(src, 'out', 'grading-result', 'w61-bf2.json'), JSON.stringify({ submission: { id: 'w61-bf2' }, totals: { score: 1, max_score: 2 }, items }));
    // 先把两行的 aiScore 设成与源一致（回填的前提；脚本对不一致会跳过）
    await prisma.submission.update({ where: { id: env.rows[0].id }, data: { aiScore: 1 } });
    await prisma.submission.update({ where: { id: env.rows[1].id }, data: { aiScore: 1 } });
    const mapFile = path.join(src, 'map.json');
    fs.writeFileSync(mapFile, JSON.stringify({ 'w61-bf1': env.rows[0].id, 'w61-bf2': env.rows[1].id }));

    const run = (args) => spawnSync(process.execPath, [SCRIPT, '--from', src, '--map', mapFile, ...args], { encoding: 'utf8', timeout: 120000, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL } });
    const before = await prisma.submission.findMany({ where: { id: { in: [env.rows[0].id, env.rows[1].id] } }, select: { id: true, aiScore: true, finalScore: true, aiFeedback: true } });

    // ① dry-run：不写库
    const dry = run(['--json']);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('SCORE_UNCHANGED=yes');
    expect(dry.stdout).toContain('MODE=dry-run');
    const afterDry = await prisma.submission.findMany({ where: { id: { in: [env.rows[0].id, env.rows[1].id] } }, select: { id: true, aiScore: true, aiFeedback: true } });
    expect(afterDry.map((x) => x.aiFeedback)).toEqual(before.map((x) => x.aiFeedback));   // dry-run 零写入

    // ② --apply：只改 ai_feedback
    const apply = run(['--apply']);
    expect(apply.status).toBe(0);
    expect(apply.stdout).toContain('SCORE_UNCHANGED=yes');
    expect(apply.stdout).toContain('IDEMPOTENT=yes');
    const afterApply = await prisma.submission.findMany({ where: { id: { in: [env.rows[0].id, env.rows[1].id] } }, select: { id: true, aiScore: true, finalScore: true, aiFeedback: true } });
    for (const b of before) {
      const a = afterApply.find((x) => x.id === b.id);
      expect(a.aiScore).toBe(b.aiScore);          // ★分数零变化
      expect(a.finalScore).toBe(b.finalScore);
    }
    const fb = JSON.parse(afterApply.find((x) => x.id === env.rows[0].id).aiFeedback);
    expect(fb.breakdown.find((x) => x.item === 'P01').comment).toContain('证据: src/a.java');
    expect(fb.breakdown.find((x) => x.item === 'P01').status).toBe('hit');
    expect(fb.breakdown.find((x) => x.item === 'P01').title).toBe('分项一');
    expect(fb.detail_backfilled_at_rule).toContain('R2-B41');

    // ③ 幂等：再跑一次 ⇒ changed=0 且内容字节一致
    const again = run(['--apply']);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('changed=0');
    const afterAgain = await prisma.submission.findUnique({ where: { id: env.rows[0].id }, select: { aiFeedback: true } });
    expect(afterAgain.aiFeedback).toBe(afterApply.find((x) => x.id === env.rows[0].id).aiFeedback);
  }, 180000);

  it('★W61-5 教师侧：dsh-checker 形状 ⇒ 分项表数据齐备；旧文本/坏 JSON/空 ⇒ 安全降级；视图已接线', async () => {
    const mod = await import('../../../client/src/composables/review/parseCheckerFeedback.js');
    const parse = mod.parseCheckerFeedbackText || mod.parseCheckerFeedback;
    const checker = parse(JSON.stringify({
      source: 'dsh-checker', score_int: 93, max_score: 100, checker_id: 'sha256:' + 'f'.repeat(64),
      breakdown: [
        { item: 'P01', title: 'web.xml 命名空间', status: 'hit', score: 1, maxScore: 1, comment: '判据 | 证据: src/a.xml' },
        { item: 'P02', title: '版本声明', status: 'miss', score: 0, maxScore: 1, comment: '未命中' },
      ],
    }));
    expect(checker.kind).toBe('checker');
    expect(checker.scoreText).toBe('93');
    expect(checker.maxText).toBe('100');
    expect(checker.total).toBe(2);
    expect(checker.hits).toBe(1);
    expect(checker.hasEvidence).toBe(true);
    expect(checker.rows.map((r) => r.ok)).toEqual([true, false]);          // ✅/❌ 判定
    expect(checker.rows[0].title).toBe('web.xml 命名空间');
    expect(checker.rows[0].comment).toContain('证据:');
    // 旧的自然语言评语 / 其它 JSON / 坏 JSON / 空 ⇒ 原样或空（绝不改写、不抛错）
    expect(parse('很好，继续加油').kind).toBe('text');
    expect(parse('{"a":1}').kind).toBe('text');
    expect(parse('{坏 JSON').kind).toBe('text');
    expect(parse('{坏 JSON').text).toBe('{坏 JSON');                        // 降级为原样文本
    expect(parse('').kind).toBe('empty');
    expect(parse(null).kind).toBe('empty');
    // 视图接线（源码契约）：解析器被引用 + 渲染 ✅/❌ 与汇总
    const view = fs.readFileSync(path.resolve(SERVER, '..', 'client', 'src', 'views', 'teacher', 'ReviewDetail.vue'), 'utf8');
    expect(view).toContain("parseCheckerFeedback");
    expect(view).toContain('✅');
    expect(view).toContain('❌');
    expect(view).toContain('项中');
    expect(view).toContain("kind === 'checker'");
    expect(view).toContain("kind === 'text'");
  }, 60000);

  it('★W61-6 CAP-BF-1/2：数组归档按条展开（每条一 slug）+ slug 作姓名兜底 + 无 slug 条目记 UNMAPPED_EXPAND + --map 优先', async () => {
    const mod = await import('../../scripts/backfill-ai-feedback.mjs');
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'w61-arr-'));
    cleanup.roots.push(src);
    const items = [
      { id: 'P01', title: '分项一', max_score: 1, score: 1, status: 'hit', reason: 'P01 | 证据: src/a.java' },
      { id: 'P02', title: '分项二', max_score: 1, score: 0, status: 'miss', reason: 'P02 | 证据: src/b.java' },
    ];
    // 云端实测形状：array[40]，每条含 submission_id/items（这里 2 条有效 + 1 条无 slug 的条目）
    fs.writeFileSync(path.join(src, 'grading-results.json'), JSON.stringify([
      { submission_id: env.rows[0].realName, items, totals: { score: 1, max_score: 2 } },
      { submission_id: env.rows[1].realName, items, totals: { score: 1, max_score: 2 } },
      { items, totals: { score: 1, max_score: 2 } },
    ]));
    // ① 展开：3 条（2 有 slug + 1 无）⇒ 不再整包当一份
    const loaded = mod.loadDetailRows(src);
    expect(loaded.rows).toHaveLength(3);
    expect(loaded.rows.map((r) => r.slug)).toEqual([env.rows[0].realName, env.rows[1].realName, null]);
    expect(loaded.expandMissing).toEqual([{ source: 'grading-results.json', indexes: [2] }]);
    // ② 脚本 dry-run：slug 作姓名兜底 ⇒ 2 条命中；无 slug 条目报 UNMAPPED_EXPAND
    const run = (args) => spawnSync(process.execPath, [SCRIPT, '--from', src, ...args], { encoding: 'utf8', timeout: 120000, env: { ...process.env } });
    const dry = run([]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('DETAIL_ROWS=3');
    expect(dry.stdout).toContain('UNMAPPED_EXPAND source=grading-results.json index=2 reason=no_slug_field');
    expect((dry.stdout.match(/via=slug_as_realName_or_username/g) || []).length).toBe(2);
    expect(dry.stdout).toContain('SCORE_UNCHANGED=yes');
    // ③ --map 显式优先（两条都指向第二行 ⇒ via=explicit_map，不再走姓名兜底）
    const mapFile = path.join(src, 'map2.json');
    fs.writeFileSync(mapFile, JSON.stringify({ [env.rows[0].realName]: env.rows[1].id, [env.rows[1].realName]: env.rows[1].id }));
    const withMap = run(['--map', mapFile]);
    expect(withMap.status).toBe(0);
    expect((withMap.stdout.match(/via=explicit_map/g) || []).length).toBe(2);
    expect(withMap.stdout).not.toContain('via=slug_as_realName_or_username');
  }, 120000);

  it('★W61-7 CAP-BF-3：复用运行归档聚合逐份分项；build 路径逐字节保留；聚合确定 + 回填可直吃', async () => {
    const { archiveRun, aggregateDetailResults } = await import('../../src/services/dshRunArchiver.js');
    const jobId = 900000 + (Date.now() % 80000);
    const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'w61-runs-'));
    cleanup.roots.push(runsRoot);
    const mkReuseRoot = () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w61-reuse-'));
      cleanup.roots.push(root);
      fs.mkdirSync(path.join(root, 'out', 'grading-result'), { recursive: true });
      fs.mkdirSync(path.join(root, 'out', 'measure'), { recursive: true });
      for (const [name, slug] of [['学生甲', 's02'], ['学生乙', 's01']]) {
        fs.writeFileSync(path.join(root, 'out', 'grading-result', slug + '.json'), JSON.stringify({
          submission: { id: slug, student_name: name },
          totals: { score: 1, max_score: 2 },
          items: [{ id: 'P01', title: '分项一', max_score: 1, score: 1, status: 'hit', reason: 'P01 | 证据: src/a.java' }],
        }));
        fs.writeFileSync(path.join(root, 'out', 'measure', slug + '.json'), JSON.stringify({ submission: { id: slug }, totals: { score: 1 } }));
      }
      fs.writeFileSync(path.join(root, 'out', 'run-teardown.json'), JSON.stringify({ sessions_purged: true, source: 'worker' }));
      fs.writeFileSync(path.join(root, 'out', 'device.stdout.log'), 'ASSIGNMENT_RESULT=N=2' + String.fromCharCode(10));
      return root;
    };
    // ① 复用形状（**无** out/grading-results.json）⇒ 归档聚合出逐份分项
    const root1 = mkReuseRoot();
    const r1 = await archiveRun({ runRoot: root1, jobId, success: true, runsRoot, log: { log() {}, warn() {} } });
    const aggPath = path.join(r1.dir, 'grading-results.json');
    expect(fs.existsSync(aggPath)).toBe(true);
    const agg = JSON.parse(fs.readFileSync(aggPath, 'utf8'));
    expect(Array.isArray(agg)).toBe(true);
    expect(agg.map((x) => x.submission_id)).toEqual(['s01', 's02']);            // 稳定排序
    expect(agg[0].items[0].reason).toContain('证据: src/a.java');               // 逐份分项（含依据）真的进了归档
    expect(String(agg[0].source)).toContain('out/grading-result/');
    expect(agg[1].student_name).toBe('学生甲');
    // ② 聚合确定性：同输入两份 run-root ⇒ 归档字节一致
    const root2 = mkReuseRoot();
    const r2 = await archiveRun({ runRoot: root2, jobId, success: true, runsRoot, log: { log() {}, warn() {} }, dirName: 'build-1-' + jobId });
    expect(fs.readFileSync(path.join(r2.dir, 'grading-results.json'), 'utf8')).toBe(fs.readFileSync(aggPath, 'utf8'));
    // ③ build 路径（device 已写 out/grading-results.json）⇒ 归档逐字节保留 device 原文（不覆盖、不改写）
    const deviceDoc = JSON.stringify([{ submission_id: 'd1', items: [{ id: 'P01', score: 1, max_score: 1, reason: 'device | 证据: src/d.java' }] }]);
    const root3 = mkReuseRoot();
    fs.writeFileSync(path.join(root3, 'out', 'grading-results.json'), deviceDoc);
    const r3 = await archiveRun({ runRoot: root3, jobId, success: true, runsRoot, log: { log() {}, warn() {} }, dirName: 'build-2-' + jobId });
    expect(fs.readFileSync(path.join(r3.dir, 'grading-results.json'), 'utf8')).toBe(deviceDoc);
    // ④ 纯函数直测 + 回填脚本可直吃归档（无需人工构造映射源）
    expect(aggregateDetailResults(root1).map((x) => x.submission_id)).toEqual(['s01', 's02']);
    const mapFile = path.join(runsRoot, 'map.json');
    fs.writeFileSync(mapFile, JSON.stringify({ s01: env.rows[0].id, s02: env.rows[1].id }));
    const dry = spawnSync(process.execPath, [SCRIPT, '--from', r1.dir, '--map', mapFile, '--json'], { encoding: 'utf8', timeout: 120000, env: { ...process.env } });
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('DETAIL_ROWS=2');
    expect((dry.stdout.match(/ROW sub=/g) || []).length).toBe(2);
    expect(dry.stdout).toContain('SCORE_UNCHANGED=yes');
  }, 180000);
});
