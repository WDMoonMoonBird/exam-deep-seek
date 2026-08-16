/**
 * SubmissionRepository —— 提交仓储适配器（实现 domain/ports/repositories.js 契约）。
 * 查询形状对齐现有调用方（reviewController regrade/updateScore），保证切换行为等价。
 */

export class SubmissionRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /** 按 ID 查询（含题目材料/小题，对齐 regrade 链路） */
  findById(id) {
    return this.prisma.submission.findUnique({
      where: { id },
      include: {
        question: { select: { material: true, subQuestions: { orderBy: { sortOrder: 'asc' } } } },
        subQuestion: true,
      },
    });
  }

  /** 按 ID 查询评分上下文（对齐 updateScore 的 select） */
  findScoreContext(id) {
    return this.prisma.submission.findUnique({
      where: { id },
      select: { status: true, aiScore: true, aiFeedback: true, teacherFeedback: true, question: { select: { type: true } } },
    });
  }

  /** 更新提交字段 */
  update(id, data) {
    return this.prisma.submission.update({ where: { id }, data });
  }
}