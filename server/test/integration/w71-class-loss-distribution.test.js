/**
 * W71（R2-B68 / t14）：按班看失分项分布 —— 聚合口径 + 接口契约 + 空数据 + 权限 fail-closed。
 *
 * A 组（零 DB）：loadClassLossDistribution 用**注入的 prisma 桩** —— 班级收敛、可见范围 403、空数据、
 *   BigInt 版本号转字符串；纯函数 parseLossBreakdown 的坏输入。
 * B 组（测试库夹具，前缀 test_b68_，与 test/setup.js 的清理口径一致）：
 *   · aiFeedback 真 JSON 列往返 ⇒ 服务聚合正确（含未判定项不计入分母、按失分率降序）；
 *   · 控制器契约（真 prisma + 假 req/res）：400 参数错 / 403 不可见班级 / 200 正常与空作业。
 * 只读被测代码：接口无任何写路径（本测试自己建/删夹具）。
 */
import prisma from '../../src/utils/prisma.js';
import { loadClassLossDistribution, parseLossBreakdown, aggregateLossByItem } from '../../src/application/queries/classLossDistribution.js';
import { getAssignmentLossDistribution } from '../../src/interface/http/controllers/teacher/loss-distribution.js';

const TAG = 'test_b68_' + Date.now();
const ctx = { schoolId: null, teacherId: null, classId: null, studentIds: [], questionId: null, assignmentId: null, emptyAssignmentId: null, rulerKey: null, rulerId: null };
const bk = (rows) => JSON.stringify({ source: 'dsh-checker', breakdown: rows });
const sha64 = (s) => (s + '0'.repeat(64)).slice(0, 64);

const fakeRes = () => {
  const out = { code: null, body: null, status: 0 };
  const res = { status(c) { out.status = c; return res; }, json(b) { out.code = b.code; out.body = b; return res; } };
  return { res, out };
};
const fakeReq = (over = {}) => ({ params: { id: '1' }, query: {}, user: { id: ctx.teacherId }, ...over });

beforeAll(async () => {
  const school = await prisma.school.create({ data: { name: TAG + '_school' } });
  ctx.schoolId = school.id;
  const teacher = await prisma.user.create({ data: { username: TAG + '_teacher', password: 'x', realName: 'B68 教师', role: 'teacher' } });
  ctx.teacherId = teacher.id;
  const s1 = await prisma.user.create({ data: { username: TAG + '_s1', password: 'x', realName: 'B68 学生一', role: 'student' } });
  const s2 = await prisma.user.create({ data: { username: TAG + '_s2', password: 'x', realName: 'B68 学生二', role: 'student' } });
  ctx.studentIds = [s1.id, s2.id];
  const cls = await prisma.class.create({ data: { name: TAG + '_class', schoolId: ctx.schoolId } });
  ctx.classId = cls.id;
  await prisma.teacherClass.create({ data: { teacherId: ctx.teacherId, classId: ctx.classId } });
  await prisma.studentClass.createMany({ data: ctx.studentIds.map((studentId) => ({ studentId, classId: ctx.classId })) });
  const q = await prisma.question.create({ data: { teacherId: ctx.teacherId, title: TAG + '_q', maxScore: 100, difficulty: 'easy', type: 'project' } });
  ctx.questionId = q.id;
  const a = await prisma.assignment.create({ data: { teacherId: ctx.teacherId, title: TAG + '_a', startTime: new Date(), endTime: new Date(Date.now() + 86400000), mode: 'exam' } });
  ctx.assignmentId = a.id;
  const empty = await prisma.assignment.create({ data: { teacherId: ctx.teacherId, title: TAG + '_empty', startTime: new Date(), endTime: new Date(Date.now() + 86400000), mode: 'exam' } });
  ctx.emptyAssignmentId = empty.id;
  await prisma.assignmentQuestion.create({ data: { assignmentId: ctx.assignmentId, questionId: ctx.questionId } });
  // 尺子绑定（版本块：BigInt id ⇒ 必须转字符串）。
  // ★生成的 Prisma Client DMMF 不含 grading_rulers / assignment_question_rulers（B35 起由原始 SQL 管理）⇒ 夹具也用 raw SQL。
  const rulerKey = sha64('b68' + Date.now());
  await prisma.$executeRaw`INSERT INTO grading_rulers (content_key, status, checker_id, rubric_sha256, standard_sha256) VALUES (${rulerKey}, 'ready', 'ck_b68', ${'r'.repeat(16)}, ${'s'.repeat(16)})`;
  const rulerRows = await prisma.$queryRaw`SELECT id FROM grading_rulers WHERE content_key = ${rulerKey} LIMIT 1`;
  ctx.rulerKey = rulerKey;
  ctx.rulerId = rulerRows[0].id;
  await prisma.$executeRaw`INSERT INTO assignment_question_rulers (assignment_id, question_id, ruler_id) VALUES (${ctx.assignmentId}, ${ctx.questionId}, ${ctx.rulerId})`;
  // 两份结果（P01 全错、P02 全对）+ 一份含未判定项（P03 unknown 不计入分母）
  await prisma.submission.create({ data: { assignmentId: ctx.assignmentId, studentId: ctx.studentIds[0], questionId: ctx.questionId, status: 'ai_graded', aiScore: 50, checkerId: 'ck_b68', canonicalSha256: 'sha_b68', aiFeedback: bk([{ item: 'P01', title: '命名规范', status: 'miss', score: 0, maxScore: 10 }, { item: 'P02', title: '空值处理', status: 'hit', score: 10, maxScore: 10 }]) } });
  await prisma.submission.create({ data: { assignmentId: ctx.assignmentId, studentId: ctx.studentIds[1], questionId: ctx.questionId, status: 'ai_graded', aiScore: 60, checkerId: 'ck_b68', canonicalSha256: 'sha_b68', aiFeedback: bk([{ item: 'P01', title: '命名规范', status: 'miss', score: 0, maxScore: 10 }, { item: 'P02', title: '空值处理', status: 'hit', score: 8, maxScore: 10 }, { item: 'P03', title: '异常分支', status: 'unknown', score: 0, maxScore: 5 }]) } });
}, 60000);

afterAll(async () => {
  const safe = async (fn) => { try { await fn(); } catch { /* 清理尽力而为；test_ 前缀口径由 setup 兜底 */ } };
  await safe(() => prisma.submission.deleteMany({ where: { assignmentId: { in: [ctx.assignmentId, ctx.emptyAssignmentId].filter(Boolean) } } }));
  await safe(() => prisma.$executeRaw`DELETE FROM assignment_question_rulers WHERE assignment_id = ${ctx.assignmentId}`);
  await safe(() => prisma.$executeRaw`DELETE FROM grading_rulers WHERE checker_id = 'ck_b68'`);
  await safe(() => prisma.assignmentQuestion.deleteMany({ where: { assignmentId: ctx.assignmentId } }));
  await safe(() => prisma.assignment.deleteMany({ where: { id: { in: [ctx.assignmentId, ctx.emptyAssignmentId].filter(Boolean) } } }));
  await safe(() => prisma.question.deleteMany({ where: { teacherId: ctx.teacherId } }));
  await safe(() => prisma.studentClass.deleteMany({ where: { classId: ctx.classId } }));
  await safe(() => prisma.teacherClass.deleteMany({ where: { classId: ctx.classId } }));
  await safe(() => prisma.class.deleteMany({ where: { id: ctx.classId } }));
  await safe(() => prisma.user.deleteMany({ where: { username: { startsWith: TAG } } }));
  await safe(() => prisma.school.deleteMany({ where: { name: TAG + '_school' } }));
}, 60000);

describe('W71 失分项分布（R2-B68）', () => {
  it('W71-1 纯函数：坏输入不抛、空 breakdown 视为无结果', () => {
    expect(parseLossBreakdown(null)).toMatchObject({ ok: false, items: [] });
    expect(parseLossBreakdown('')).toMatchObject({ ok: false, items: [] });
    expect(parseLossBreakdown('not-json')).toMatchObject({ ok: false, reason: 'bad_json', items: [] });
    expect(parseLossBreakdown('[1,2]')).toMatchObject({ ok: false, items: [] });
    expect(parseLossBreakdown(JSON.stringify({ source: 'dsh-checker' }))).toMatchObject({ ok: true, items: [] });
    expect(aggregateLossByItem([])).toMatchObject({ items: [], totals: { submissionsScanned: 0, items: 0 } });
  });

  it('W71-2 注入桩（零 DB）：班级收敛、可见范围 fail-closed、空数据、BigInt 版本转字符串', async () => {
    const calls = [];
    const stub = {
      studentClass: { findMany: async ({ where }) => { calls.push(['studentClass', where]); return [{ studentId: 1 }, { studentId: 2 }]; } },
      submission: { findMany: async ({ where }) => { calls.push(['submission', where]); return [{ id: 1, aiFeedback: bk([{ item: 'X', status: 'miss' }, { item: 'Y', status: 'hit' }]) }]; } },
      // 版本块走参数化 $queryRaw（tagged template：(strings, ...values)）
      $queryRaw: async (strings) => {
        const sql = strings.join('?');
        if (/assignment_question_rulers/.test(sql)) return [{ questionId: 9, rulerId: 7n }];
        if (/grading_rulers/.test(sql)) return [{ id: 7n, contentKey: 'k'.repeat(64), status: 'ready', checkerId: 'ck', rubricSha256: 'r', standardSha256: 's' }];
        return [];
      },
    };
    const ok = await loadClassLossDistribution({ prisma: stub, assignmentId: 5, classId: 42, visibleClassIds: [42] });
    expect(ok.ok).toBe(true);
    expect(ok.items.map((i) => i.item)).toEqual(['X', 'Y']);
    expect(ok.rulers[0].rulerId).toBe('7');
    expect(typeof ok.rulers[0].rulerId).toBe('string');
    expect(calls.find((c) => c[0] === 'studentClass')[1]).toEqual({ classId: 42 });
    // classId 不在可见集合 ⇒ 403 fail-closed（不发任何查询）
    const forbidden = await loadClassLossDistribution({ prisma: stub, assignmentId: 5, classId: 43, visibleClassIds: [42] });
    expect(forbidden).toEqual({ ok: false, reason: 'forbidden' });
    // 非法参数
    expect((await loadClassLossDistribution({ prisma: stub, assignmentId: 0 })).reason).toBe('bad_assignment');
    expect((await loadClassLossDistribution({ prisma: stub, assignmentId: 5, classId: -1 })).reason).toBe('bad_class');
    // 空数据（无提交）
    const emptyStub = { ...stub, submission: { findMany: async () => [] } };
    const empty = await loadClassLossDistribution({ prisma: emptyStub, assignmentId: 5, classId: 42, visibleClassIds: [42] });
    expect(empty.items).toEqual([]);
    expect(empty.totals).toMatchObject({ submissionsScanned: 0, hits: 0, misses: 0 });
  });

  it('W71-3 测试库夹具：聚合口径正确（分子/分母、失分率降序、未判定不计入分母、批改版本）', async () => {
    const r = await loadClassLossDistribution({ prisma, assignmentId: ctx.assignmentId, classId: ctx.classId });
    expect(r.ok).toBe(true);
    expect(r.items.map((i) => i.item)).toEqual(['P01', 'P02', 'P03']);
    const p01 = r.items[0];
    expect(p01).toMatchObject({ hit: 0, miss: 2, numerator: 2, denominator: 2, lossRate: 1 });
    expect(p01.title).toBe('命名规范');
    const p02 = r.items[1];
    expect(p02).toMatchObject({ hit: 2, miss: 0, numerator: 0, denominator: 2, lossRate: 0, scoreSum: 18, maxScoreSum: 20, avgScore: 9 });
    const p03 = r.items[2];
    expect(p03).toMatchObject({ unknown: 1, denominator: 0, lossRate: null });
    expect(r.totals).toMatchObject({ submissionsScanned: 2, submissionsWithItems: 2, items: 3, hits: 2, misses: 2, unknown: 1 });
    expect(r.versions).toEqual([{ checkerId: 'ck_b68', canonicalSha256: 'sha_b68', submissions: 2 }]);
    expect(r.rulers.length).toBe(1);
    expect(r.rulers[0]).toMatchObject({ questionId: ctx.questionId, status: 'ready', checkerId: 'ck_b68' });
    expect(typeof r.rulers[0].rulerId).toBe('string');
    expect(r.rulers[0].contentKey).toHaveLength(64);
  });

  it('W71-4 测试库夹具：空作业 ⇒ 空分布（不抛、无假数据）', async () => {
    const r = await loadClassLossDistribution({ prisma, assignmentId: ctx.emptyAssignmentId, classId: ctx.classId });
    expect(r.ok).toBe(true);
    expect(r.items).toEqual([]);
    expect(r.totals).toEqual({ submissionsScanned: 0, submissionsWithItems: 0, items: 0, hits: 0, misses: 0, unknown: 0 });
    expect(r.rulers).toEqual([]);
  });

  it('W71-5 接口契约（真 prisma + 假 req/res）：400 参数错 / 403 不可见班级 / 200 正常 / 200 空作业', async () => {
    const bad = fakeRes();
    await getAssignmentLossDistribution(fakeReq({ params: { id: 'abc' } }), bad.res);
    expect(bad.out.status).toBe(400);
    expect(bad.out.code).toBe(1001);

    const forbidden = fakeRes();
    await getAssignmentLossDistribution(fakeReq({ params: { id: String(ctx.assignmentId) }, query: { classId: '99999999' } }), forbidden.res);
    expect(forbidden.out.status).toBe(403);
    expect(forbidden.out.code).toBe(1003);

    const ok = fakeRes();
    await getAssignmentLossDistribution(fakeReq({ params: { id: String(ctx.assignmentId) }, query: { classId: String(ctx.classId) } }), ok.res);
    expect(ok.out.code).toBe(0);
    expect(ok.out.body.data.items.map((i) => i.item)).toEqual(['P01', 'P02', 'P03']);

    const empty = fakeRes();
    await getAssignmentLossDistribution(fakeReq({ params: { id: String(ctx.emptyAssignmentId) }, query: { classId: String(ctx.classId) } }), empty.res);
    expect(empty.out.code).toBe(0);
    expect(empty.out.body.data.items).toEqual([]);
  }, 60000);

  it('W71-6 ★R3-S5（t30）：legacy 形状（无 title/status）真实库往返 ⇒ 按 score/maxScore 推导 hit/miss，未知仍不计入分母', async () => {
    // legacy 写回形状：services/projectGrading.js clampBreakdown 旧实现（item/score/maxScore/comment，无 title/status）
    const legacySub = await prisma.submission.create({
      data: {
        assignmentId: ctx.assignmentId, studentId: ctx.studentIds[0], questionId: ctx.questionId,
        status: 'ai_graded', aiScore: 5, checkerId: 'ck_b68', canonicalSha256: 'sha_legacy_b68',
        aiFeedback: bk([
          { item: 'P01', score: 0, maxScore: 10, comment: 'legacy：命名缺失' },   // ⇒ 推导 miss
          { item: 'P04', score: 5, maxScore: 5, comment: 'legacy：全对' },        // ⇒ 推导 hit
          { item: 'P05', score: 2, maxScore: 10 },                                // 部分得分 ⇒ 未知
        ]),
      },
    });
    try {
      const raw = await prisma.submission.findUnique({ where: { id: legacySub.id } });
      const parsed = parseLossBreakdown(raw.aiFeedback);   // 真 JSON 列往返（legacy 形状）
      expect(parsed.items.map((i) => [i.item, i.status])).toEqual([['P01', 'miss'], ['P04', 'hit'], ['P05', null]]);

      const r = await loadClassLossDistribution({ prisma, assignmentId: ctx.assignmentId, classId: ctx.classId });
      const p01 = r.items.find((i) => i.item === 'P01');
      const p04 = r.items.find((i) => i.item === 'P04');
      const p05 = r.items.find((i) => i.item === 'P05');
      // 夹具 2 条（带 status）+ legacy 1 条 ⇒ P01 3 次 miss（旧形状不再落 unknown）
      expect(p01).toMatchObject({ hit: 0, miss: 3, unknown: 0, numerator: 3, denominator: 3, lossRate: 1 });
      expect(p04).toMatchObject({ title: '', hit: 1, miss: 0, unknown: 0, numerator: 0, denominator: 1, lossRate: 0 });
      expect(p05).toMatchObject({ hit: 0, miss: 0, unknown: 1, numerator: 0, denominator: 0, lossRate: null });
      // 口径不放宽：分母仍是 hit+miss（3+3），未知 2 项（P03 与 P05）单列
      expect(r.totals).toMatchObject({ submissionsScanned: 3, submissionsWithItems: 3, hits: 3, misses: 3, unknown: 2 });
    } finally {
      await prisma.submission.deleteMany({ where: { id: legacySub.id } });
    }
  }, 60000);
});
