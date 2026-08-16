/**
 * 仓储适配器 × 真 MySQL 专项集成测试（integration/repositories.test.js）
 *
 * 覆盖对象：server/src/infrastructure/persistence/ 下现有 3 个适配器
 *   - QuestionRepository（question.repository.js）
 *   - SubmissionRepository（submission.repository.js）
 *   - SystemConfigRepository（system-config.repository.js）
 *
 * 覆盖点：CRUD 落库/读回、软删除语义（对照现有 question 语义）、事务回滚、唯一约束。
 * 数据隔离：所有写入数据使用 test_repo_ 前缀，afterAll 自清理；
 *           不触碰 setup.js 种子数据（review 套件依赖 ai_graded 种子行）。
 *
 * 注意：端口契约（domain/ports/repositories.js）声明 8 个仓储，
 *       但仅有 3 个适配器实现 —— 该差异记录于报告 DSGN-INT-02，不在本文件断言。
 */

import prisma from '../../src/utils/prisma.js';
import { QuestionRepository } from '../../src/infrastructure/persistence/question.repository.js';
import { SubmissionRepository } from '../../src/infrastructure/persistence/submission.repository.js';
import { SystemConfigRepository } from '../../src/infrastructure/persistence/system-config.repository.js';
import { getTestData } from './helpers.js';

const P = 'test_repo_'; // 数据前缀，便于识别与清理

describe('仓储适配器 × 真 MySQL 专项', () => {
  let teacherId;
  let assignmentId;
  let questionId;
  let studentIds;
  const cleanup = { questionIds: [], submissionIds: [], assignmentIds: [], cfgKeys: [] };

  beforeAll(async () => {
    const td = getTestData();
    teacherId = td.teacherId;
    assignmentId = td.assignmentId;
    questionId = td.questionId;
    studentIds = td.studentIds;
    expect(teacherId).toBeTruthy();
    expect(assignmentId).toBeTruthy();
    expect(questionId).toBeTruthy();
  });

  afterAll(async () => {
    if (cleanup.submissionIds.length) {
      await prisma.submission.deleteMany({ where: { id: { in: cleanup.submissionIds } } });
    }
    if (cleanup.assignmentIds.length) {
      await prisma.assignment.deleteMany({ where: { id: { in: cleanup.assignmentIds } } });
    }
    if (cleanup.questionIds.length) {
      await prisma.subQuestion.deleteMany({ where: { questionId: { in: cleanup.questionIds } } });
      await prisma.question.deleteMany({ where: { id: { in: cleanup.questionIds } } });
    }
    if (cleanup.cfgKeys.length) {
      await prisma.systemConfig.deleteMany({ where: { key: { in: cleanup.cfgKeys } } });
    }
  });

  // ===================== QuestionRepository =====================

  describe('QuestionRepository（question.repository.js）', () => {
    const repo = () => new QuestionRepository({ prisma });
    const baseQuestion = (title, subQuestions) => ({
      teacherId,
      title,
      maxScore: 100,
      difficulty: 'easy',
      subQuestions,
    });

    it('R1: create 创建含小题题目 → 返回 subQuestions 按 sortOrder 升序', async () => {
      const q = await repo().create(baseQuestion(P + 'question_a', [
        { title: '小题B', content: '<p>B</p>', referenceAnswer: 'ansB', score: 30, language: 'python' },
        { title: '小题A', content: '<p>A</p>', referenceAnswer: 'ansA', score: 70, language: 'python' },
      ]));
      cleanup.questionIds.push(q.id);

      expect(q.id).toBeTruthy();
      expect(q.title).toBe(P + 'question_a');
      expect(q.deletedAt).toBeNull();
      expect(q.subQuestions).toHaveLength(2);
      expect(q.subQuestions.map(sq => sq.sortOrder)).toEqual([1, 2]);
      expect(q.subQuestions[0].title).toBe('小题B');
      expect(q.subQuestions[1].score).toBe(70);
    });

    it('R2: create 小题默认值 → type=code、language=cpp 兜底、score 原样保存', async () => {
      const q = await repo().create(baseQuestion(P + 'question_defaults', [
        { title: '题1', content: '', referenceAnswer: '', score: 60 },
      ]));
      cleanup.questionIds.push(q.id);

      const sq = q.subQuestions[0];
      expect(sq.type).toBe('code');
      expect(sq.language).toBe('cpp');
      expect(sq.score).toBe(60);
    });

    it('R3: findById → 按 ID 查回含小题（排序稳定）', async () => {
      const created = await repo().create(baseQuestion(P + 'question_find', [
        { title: 'q1', content: 'c1', referenceAnswer: 'a1', score: 40, language: 'python' },
        { title: 'q2', content: 'c2', referenceAnswer: 'a2', score: 60, language: 'python' },
      ]));
      cleanup.questionIds.push(created.id);

      const found = await repo().findById(created.id);
      expect(found.id).toBe(created.id);
      expect(found.subQuestions.map(sq => sq.sortOrder)).toEqual([1, 2]);
      expect(found.subQuestions[0].content).toBe('c1');
    });

    it('R4: findById 不存在 → null', async () => {
      const found = await repo().findById(999999999);
      expect(found).toBeNull();
    });

    it('R5: 软删除语义 —— 适配器 findById 不过滤 deletedAt（现行行为留证）', async () => {
      const created = await repo().create(baseQuestion(P + 'question_softdel', [
        { title: 'x', content: 'c', referenceAnswer: 'a', score: 100, language: 'python' },
      ]));
      cleanup.questionIds.push(created.id);

      // 先软删除
      await prisma.question.update({ where: { id: created.id }, data: { deletedAt: new Date() } });
      const raw = await prisma.question.findUnique({ where: { id: created.id } });
      expect(raw.deletedAt).not.toBeNull();

      // 适配器 findById 为裸 findUnique，无 deletedAt:null 过滤 → 仍返回软删除行
      const viaRepo = await repo().findById(created.id);
      expect(viaRepo).not.toBeNull();
      expect(viaRepo.deletedAt).not.toBeNull();

      // 对照：API 语义（question.test.js Q9）在 controller 层做 deletedAt:null 过滤 → GET 404。
      // 契约 repositories.js 未声明 findById 的软删除过滤语义 → 行为不一致留证（报告 DSGN-INT-01）
    });

    it('R6: 事务行为 —— $transaction 内 create 后抛错 → 整体回滚', async () => {
      const title = P + 'question_tx_rollback';
      await expect(
        prisma.$transaction(async (tx) => {
          const r = new QuestionRepository({ prisma: tx });
          await r.create(baseQuestion(title, [
            { title: 'x', content: 'c', referenceAnswer: 'a', score: 100, language: 'python' },
          ]));
          throw new Error('rollback-intentional');
        })
      ).rejects.toThrow('rollback-intentional');

      const exists = await prisma.question.count({ where: { title } });
      expect(exists).toBe(0);
    });
  });

  // ===================== SubmissionRepository =====================

  describe('SubmissionRepository（submission.repository.js）', () => {
    const repo = () => new SubmissionRepository({ prisma });
    let subQId;  // 种子题小题1 id（非空 subQuestionId 唯一约束测试用）
    let subQId2; // 种子题小题2 id（S4 用不同小题避免与 S1 撞唯一键）

    beforeAll(async () => {
      const sqs = await prisma.subQuestion.findMany({ where: { questionId }, orderBy: { sortOrder: 'asc' } });
      subQId = sqs[0].id;
      subQId2 = sqs[1] ? sqs[1].id : sqs[0].id;
      expect(subQId).toBeTruthy();
      expect(subQId2).toBeTruthy();
    });

    it('S1: create + findById → 含 question.material/subQuestions 与 subQuestion', async () => {
      const sub = await repo().create({
        assignmentId, studentId: studentIds[0], questionId, subQuestionId: subQId,
        answer: 'print(1)', status: 'submitted', submittedAt: new Date(),
      });
      cleanup.submissionIds.push(sub.id);

      const found = await repo().findById(sub.id);
      expect(found.id).toBe(sub.id);
      expect(found.answer).toBe('print(1)');
      expect(found.question).toBeTruthy();
      expect(found.question.subQuestions.length).toBeGreaterThan(0);
      expect(found.subQuestion.id).toBe(subQId);
    });

    it('S2: 唯一约束 (assignment,student,question,subQuestionId) → 重复 create 抛 P2002', async () => {
      const key = { assignmentId, studentId: studentIds[1], questionId, subQuestionId: subQId };
      const first = await repo().create({ ...key, answer: 'a1', status: 'submitted' });
      cleanup.submissionIds.push(first.id);

      await expect(
        repo().create({ ...key, answer: 'a2', status: 'submitted' })
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('S3: update → 字段更新落库', async () => {
      const sub = await repo().create({
        assignmentId, studentId: studentIds[2], questionId, subQuestionId: subQId,
        answer: 'x', status: 'draft',
      });
      cleanup.submissionIds.push(sub.id);

      const updated = await repo().update(sub.id, { answer: 'y', status: 'submitted', finalScore: 88 });
      expect(updated.answer).toBe('y');
      expect(updated.finalScore).toBe(88);

      const found = await repo().findById(sub.id);
      expect(found.status).toBe('submitted');
    });

    it('S4: findByAssignmentAndQuestion → 命中 / 未命中 / subQuestionId 过滤', async () => {
      const sub = await repo().create({
        assignmentId, studentId: studentIds[0], questionId, subQuestionId: subQId2,
        answer: 'hit', status: 'draft',
      });
      cleanup.submissionIds.push(sub.id);

      const hit = await repo().findByAssignmentAndQuestion(assignmentId, studentIds[0], questionId, subQId2);
      expect(hit.id).toBe(sub.id);

      const miss = await repo().findByAssignmentAndQuestion(assignmentId, studentIds[0], questionId, subQId2 + 99999);
      expect(miss).toBeNull();
    });

    it('S5: findScoreContext → select 形状（status/aiScore/aiFeedback/teacherFeedback/question.type）', async () => {
      const sub = await repo().create({
        assignmentId, studentId: studentIds[2], questionId, subQuestionId: subQId2,
        answer: 'x', status: 'ai_graded', aiScore: 90, aiFeedback: 'ok',
      });
      cleanup.submissionIds.push(sub.id);

      const ctx = await repo().findScoreContext(sub.id);
      expect(ctx.status).toBe('ai_graded');
      expect(ctx.aiScore).toBe(90);
      expect(ctx.aiFeedback).toBe('ok');
      expect(ctx.question.type).toBe('code');
      expect(ctx).not.toHaveProperty('answer'); // select 未包含敏感字段
    });

    it('S6: findAssignmentContext → select 形状（endTime/allowResubmit/mode/maxAttempts/locked）', async () => {
      const ctx = await repo().findAssignmentContext(assignmentId);
      expect(ctx).toHaveProperty('endTime');
      expect(ctx).toHaveProperty('allowResubmit');
      expect(ctx).toHaveProperty('mode');
      expect(ctx).toHaveProperty('maxAttempts');
      expect(ctx).toHaveProperty('locked');
      expect(ctx).not.toHaveProperty('title');
    });

    it('S7: resetByAssignment → 该生该作业全部提交重置为草稿并清空评分字段', async () => {
      // 独立作业，避免污染种子提交（review 套件依赖 ai_graded 种子行）
      const asg = await prisma.assignment.create({
        data: {
          teacherId,
          title: P + 'assignment_reset',
          startTime: new Date('2026-01-01'),
          endTime: new Date('2027-01-01'),
        },
      });
      cleanup.assignmentIds.push(asg.id);

      const stu = studentIds[0];
      const s1 = await repo().create({
        assignmentId: asg.id, studentId: stu, questionId,
        answer: 'a1', status: 'submitted', submittedAt: new Date(),
        aiScore: 66, aiFeedback: 'f1', finalScore: 60, teacherFeedback: 'tf',
      });
      const s2 = await repo().create({
        assignmentId: asg.id, studentId: stu, questionId, subQuestionId: subQId,
        answer: 'a2', status: 'ai_graded', submittedAt: new Date(), aiScore: 80, aiFeedback: 'f2',
      });
      cleanup.submissionIds.push(s1.id, s2.id);

      const res = await repo().resetByAssignment(asg.id, stu);
      expect(res.count).toBe(2);

      const rows = await prisma.submission.findMany({ where: { id: { in: [s1.id, s2.id] } } });
      for (const row of rows) {
        expect(row.status).toBe('draft');
        expect(row.answer).toBe('');
        expect(row.aiScore).toBeNull();
        expect(row.aiFeedback).toBeNull();
        expect(row.finalScore).toBeNull();
        expect(row.teacherFeedback).toBeNull();
        expect(row.submittedAt).toBeNull();
        expect(row.reviewedAt).toBeNull();
      }
    });

    it('S8: 事务回滚 + NULL subQuestionId 不触发唯一约束（MySQL 语义留证）', async () => {
      const before = await prisma.submission.count({ where: { studentId: studentIds[0], questionId } });
      let insertedId = null;

      await expect(
        prisma.$transaction(async (tx) => {
          const r = new SubmissionRepository({ prisma: tx });
          const created = await r.create({
            assignmentId, studentId: studentIds[0], questionId,
            answer: 'tx-null-sq', status: 'submitted',
          });
          insertedId = created.id; // 插入成功 → (assignment,student,question,NULL) 可重复（MySQL 唯一索引 NULL 不互斥）
          throw new Error('submission-rollback');
        })
      ).rejects.toThrow('submission-rollback');

      const after = await prisma.submission.count({ where: { studentId: studentIds[0], questionId } });
      expect(after).toBe(before); // 回滚生效
      expect(insertedId).toBeTruthy(); // NULL 重复插入未被约束拦截（留证 → 报告 DSGN-INT-03）
    });
  });

  // ===================== SystemConfigRepository =====================

  describe('SystemConfigRepository（system-config.repository.js）', () => {
    const cfgKey = () => P + 'cfg_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

    it('C1: set + get 读写回环（test_ 前缀 key）', async () => {
      const repo = new SystemConfigRepository({ prisma });
      const key = cfgKey();
      cleanup.cfgKeys.push(key);

      await repo.set(key, 'v1');
      expect(await repo.get(key)).toBe('v1');

      await repo.set(key, 'v2');
      expect(await repo.get(key)).toBe('v2'); // set 已失效缓存
    });

    it('C2: get 未命中 → envFallback 兜底', async () => {
      const repo = new SystemConfigRepository({ prisma });
      expect(await repo.get(P + 'missing_' + Date.now(), 'fb')).toBe('fb');
    });

    it('C3: set 后缓存失效 → 读回新值（不命中旧缓存）', async () => {
      const repo = new SystemConfigRepository({ prisma, cacheTtlMs: 60000 });
      const key = cfgKey();
      cleanup.cfgKeys.push(key);

      await repo.set(key, 'one');
      expect(await repo.get(key)).toBe('one');
      await repo.set(key, 'two');
      expect(await repo.get(key)).toBe('two');
    });
  });

  // ===================== 契约对照（证据留档，不做实现断言） =====================

  describe('端口契约 vs 实现差异（留证）', () => {
    it('contract-gap: 8 个契约仓储仅 3 个有适配器实现', () => {
      // domain/ports/repositories.js 声明 8 个仓储：
      //   Question / Assignment / Submission / ReviewResult / User / SystemConfig / Project / ProjectSubmission
      // 实际适配器（infrastructure/persistence/）：
      //   question.repository.js / submission.repository.js / system-config.repository.js
      // 其余 5 个（Assignment/ReviewResult/User/Project/ProjectSubmission）无适配器实现，
      // 相关读写仍散落在 controllers/services 中直接使用 prisma。
      // 详细差异与影响面见报告 DSGN-INT-02。
      expect(true).toBe(true);
    });
  });
});
