/**
 * assignment-q9-branches.test.js — Q9「无标准工程包 → 软警告 + 教师确认」控制器单元测试。
 *
 * 打桩 utils/prisma.js（零 DB、零网络），直接以 (req,res) 驱动 teacherController.createAssignment，
 * 覆盖三个契约分支：
 *   1) 无包 + 未确认           → 400 / code=1007 / requiresConfirmation + warnings，且不创建作业；
 *   2) 无包 + 显式确认         → code=0，正常创建（按开放性题目布置）；
 *   3) 有包（或非 project 题）  → code=0，无警告直接创建（与改动前完全一致）。
 * 另覆盖：混合选题只警告无包题、参数错误提前返回、软删除题目过滤条件。
 *
 * 「有无标准包」判据由 utils/projectPaths.hasStandardPackage 真实执行：
 * attachmentUrl 非空 → 有包；为空且标准包目录不存在 → 开放性题目（用例内先断言目录不存在，
 * 避免磁盘残留目录让用例假通过）。
 */
import fs from 'fs';
import { jest } from '@jest/globals';
import { standardDir } from '../../src/utils/projectPaths.js';

const questionFindMany = jest.fn();
const assignmentCreate = jest.fn();

jest.unstable_mockModule('../../src/utils/prisma.js', () => ({
  default: {
    question: { findMany: questionFindMany },
    assignment: { create: assignmentCreate },
  },
}));

// 必须在 mock 注册之后动态导入被测控制器（ESM 原生加载器不做 hoist）
const { createAssignment } = await import('../../src/controllers/teacherController.js');

/** 无标准包目录的题目 ID（先验目录不存在，确保被判为开放性题目） */
const OPEN_QID = 987654321;
/** 有标准包（attachmentUrl 非空）的题目 ID */
const STD_QID = 987654322;
/** 非 project 题型 */
const CODE_QID = 987654323;

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

const baseBody = (questionIds) => ({
  title: '开放性实训作业',
  startTime: '2026-05-01T00:00:00Z',
  endTime: '2026-06-01T00:00:00Z',
  questionIds,
  classIds: [1],
});

const openRow = { id: OPEN_QID, title: '开放性题目A', type: 'project', attachmentUrl: null, deletedAt: null };
const stdRow = { id: STD_QID, title: '标准包题目B', type: 'project', attachmentUrl: 'project-questions/' + STD_QID + '/standard', deletedAt: null };
const codeRow = { id: CODE_QID, title: '编程题C', type: 'code', attachmentUrl: null, deletedAt: null };

/** 按请求的题目 ID 返回命中行（模拟 prisma where id in + deletedAt:null） */
const rowsFor = (ids, rows) => rows.filter(r => ids.includes(r.id));

beforeEach(() => {
  questionFindMany.mockReset();
  assignmentCreate.mockReset();
  assignmentCreate.mockImplementation(async ({ data }) => ({ id: 4242, ...data }));
  expect(fs.existsSync(standardDir(OPEN_QID))).toBe(false);
  expect(fs.existsSync(standardDir(STD_QID))).toBe(false);
});

describe('createAssignment — Q9 无标准工程包分支', () => {
  it('无包 + 未确认 → 400 + code=1007 软警告，且不创建作业', async () => {
    questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [openRow]));
    const res = mockRes();
    await createAssignment({ body: baseBody([OPEN_QID]), user: { id: 7 } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(1007);
    expect(res.body.data.requiresConfirmation).toBe(true);
    expect(res.body.data.warnings).toEqual([
      {
        questionId: OPEN_QID,
        title: '开放性题目A',
        message: '题目「开放性题目A」未上传标准工程包，将按开放性题目布置：AI 仅依据评分标准做评价式评分，不与参考答案对比',
      },
    ]);
    expect(res.body.message).toContain('开放性题目A');
    expect(res.body.message).toContain('确认按开放性题目布置');
    // 未确认 → 绝不落库
    expect(assignmentCreate).not.toHaveBeenCalled();
  });

  it('无包 + confirmWithoutStandardPackage=true → 正常创建（code=0）', async () => {
    questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [openRow]));
    const res = mockRes();
    const body = { ...baseBody([OPEN_QID]), confirmWithoutStandardPackage: true };
    await createAssignment({ body, user: { id: 7 } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe(4242);
    expect(assignmentCreate).toHaveBeenCalledTimes(1);
    const data = assignmentCreate.mock.calls[0][0].data;
    expect(data.teacherId).toBe(7);
    expect(data.title).toBe('开放性实训作业');
    // 题目关系正确落库（按选择顺序赋 sortOrder）
    expect(data.assignmentQuestions.create).toEqual([{ questionId: OPEN_QID, sortOrder: 1 }]);
    expect(data.assignmentClasses.create).toEqual([{ classId: 1 }]);
  });

  it('confirmWithoutStandardPackage 非 true（字符串/undefined）→ 仍拦截（只认显式确认）', async () => {
    questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [openRow]));
    for (const v of [undefined, false, 'true', 1]) {
      const res = mockRes();
      const body = baseBody([OPEN_QID]);
      if (v !== undefined) body.confirmWithoutStandardPackage = v;
      await createAssignment({ body, user: { id: 7 } }, res);
      expect(res.body.code).toBe(1007);
      expect(res.statusCode).toBe(400);
    }
    expect(assignmentCreate).not.toHaveBeenCalled();
  });

  it('有标准包（attachmentUrl 非空）→ 无警告直接创建（回归）', async () => {
    questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [stdRow]));
    const res = mockRes();
    await createAssignment({ body: baseBody([STD_QID]), user: { id: 7 } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.warnings).toBeUndefined();
    expect(assignmentCreate).toHaveBeenCalledTimes(1);
  });

  it('非 project 题（编程题）→ 不产生警告，直接创建', async () => {
    questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [codeRow]));
    const res = mockRes();
    await createAssignment({ body: baseBody([CODE_QID]), user: { id: 7 } }, res);

    expect(res.body.code).toBe(0);
    expect(assignmentCreate).toHaveBeenCalledTimes(1);
  });

  it('混合选题（1 有包 + 1 无包）→ warnings 只含无包题目', async () => {
    questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [stdRow, openRow]));
    const res = mockRes();
    await createAssignment({ body: baseBody([STD_QID, OPEN_QID]), user: { id: 7 } }, res);

    expect(res.body.code).toBe(1007);
    expect(res.body.data.warnings).toHaveLength(1);
    expect(res.body.data.warnings[0].questionId).toBe(OPEN_QID);
    expect(assignmentCreate).not.toHaveBeenCalled();

    // 确认后同一批题目创建成功，两道题都进作业
    questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [stdRow, openRow]));
    const res2 = mockRes();
    await createAssignment({ body: { ...baseBody([STD_QID, OPEN_QID]), confirmWithoutStandardPackage: true }, user: { id: 7 } }, res2);
    expect(res2.body.code).toBe(0);
    const create = assignmentCreate.mock.calls[0][0].data.assignmentQuestions.create;
    expect(create).toEqual([{ questionId: STD_QID, sortOrder: 1 }, { questionId: OPEN_QID, sortOrder: 2 }]);
  });

  it('参数缺失（无标题/无题目/无班级）→ 400/1001，不查库不落库', async () => {
    const res = mockRes();
    await createAssignment({ body: { questionIds: [], classIds: [] }, user: { id: 7 } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(1001);
    expect(questionFindMany).not.toHaveBeenCalled();
    expect(assignmentCreate).not.toHaveBeenCalled();
  });

  it('存在已删除/不存在的题目 → 400/1001，不进入警告分支', async () => {
    questionFindMany.mockImplementation(async () => [openRow]); // 只返回 1 行，但请求 2 个 ID
    const res = mockRes();
    await createAssignment({ body: baseBody([OPEN_QID, 999999999]), user: { id: 7 } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(1001);
    expect(assignmentCreate).not.toHaveBeenCalled();
  });

  it('题目查询过滤软删除（where.deletedAt === null）', async () => {
    questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [openRow]));
    const res = mockRes();
    await createAssignment({ body: { ...baseBody([OPEN_QID]), confirmWithoutStandardPackage: true }, user: { id: 7 } }, res);
    expect(questionFindMany).toHaveBeenCalledWith({ where: { id: { in: [OPEN_QID] }, deletedAt: null } });
  });
});
