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
      // R3-D5（G2）：范围校验需要题目满分（type 仍用于实训题「AI 评语不透传」规则）
      select: { status: true, aiScore: true, aiFeedback: true, teacherFeedback: true, question: { select: { type: true, maxScore: true } } },
    });
  }

  /** 按 ID 更新提交字段 */
  update(id, data) {
    return this.prisma.submission.update({ where: { id }, data });
  }

  /**
   * 查询作业提交上下文（对齐 submitAnswer/saveDraft 的 select）。
   *
   * 传入 studentId 时追加**归属收窄**（round 6）：学生必须在该作业已投放的班级内，
   * 否则返回 null —— 判据与 studentController.assertStudentInAssignment:493-506 同形
   * （assignmentClass ∩ studentClass），仅查询形态不同。
   *
   * 为什么并入本方法而不是新增独立方法：本仓库既有单测
   * （test/unit/application/submission.use-cases.test.js 的假仓储、test/unit/infrastructure/
   * persistence-repositories.test.js 的 prisma 替身）**只实现了既有方法**；
   * 新增 port 方法会让既有套件整体变红（本轮不得改既有测试文件）。契约语义不变：
   * 「未投放」与「不存在」都返回 null，由用例层区分 404 / 403。
   *
   * ⚠️ 不传 studentId 时查询形状与改动前逐字一致（select 白名单不变）。
   *
   * @param {number} assignmentId
   * @param {number} [studentId] 传入时校验该生属于作业投放班级
   * @returns {Promise<object|null>} 未命中/未投放 ⇒ null
   */
  async findAssignmentContext(assignmentId, studentId) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { endTime: true, allowResubmit: true, mode: true, maxAttempts: true, locked: true },
    });
    if (!assignment || studentId == null) return assignment;

    const linked = await this.prisma.assignmentClass.findFirst({
      where: { assignmentId, class: { studentClasses: { some: { studentId } } } },
      select: { assignmentId: true },
    });
    return linked ? assignment : null;
  }

  /** 查询学生某题的提交记录 */
  findByAssignmentAndQuestion(assignmentId, studentId, questionId, subQuestionId) {
    const where = { assignmentId, studentId, questionId };
    if (subQuestionId) where.subQuestionId = subQuestionId;
    return this.prisma.submission.findFirst({ where });
  }

  /**
   * 作业-题目关联（★R3-D11 / F-E2E-1：提交入参归属校验）。
   * 命中 ⇒ 返回 { questionId, question: { id, type, subQuestions: [{ id }] } }；未投放/不存在 ⇒ null。
   * 一次查询同时支撑两个判定：questionId 属于该作业、subQuestionId 属于该题目。
   */
  findAssignmentQuestion(assignmentId, questionId) {
    return this.prisma.assignmentQuestion.findUnique({
      where: { assignmentId_questionId: { assignmentId, questionId } },
      select: {
        questionId: true,
        question: { select: { id: true, type: true, subQuestions: { select: { id: true } } } },
      },
    });
  }

  /** 创建提交 */
  create(data) {
    return this.prisma.submission.create({ data });
  }

  /** 重置某作业下学生全部提交为草稿（练习重新答题） */
  resetByAssignment(assignmentId, studentId) {
    return this.prisma.submission.updateMany({
      where: { assignmentId, studentId },
      data: { status: 'draft', answer: '', aiScore: null, aiFeedback: null, finalScore: null, teacherFeedback: null, submittedAt: null, reviewedAt: null },
    });
  }
}