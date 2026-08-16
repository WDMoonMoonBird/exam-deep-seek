/**
 * QuestionRepository —— 题目仓储适配器（实现 domain/ports/repositories.js 契约）。
 * create 的写入形状对齐 teacherController.createQuestion 原实现（行为等价）。
 */

export class QuestionRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  findById(id) {
    return this.prisma.question.findUnique({
      where: { id },
      include: { subQuestions: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** 创建题目（含小题），返回含小题的完整题目（对齐原 createQuestion） */
  create({ teacherId, title, maxScore, difficulty, material, attachmentUrl, objectiveSettings, subQuestions }) {
    return this.prisma.question.create({
      data: {
        teacherId,
        title,
        maxScore,
        difficulty,
        material,
        attachmentUrl,
        objectiveSettings: objectiveSettings || undefined,
        subQuestions: {
          create: subQuestions.map((sq, i) => ({
            sortOrder: i + 1,
            title: sq.title || '',
            type: sq.type || 'code',
            score: sq.score,
            content: sq.content || '',
            referenceAnswer: sq.referenceAnswer || '',
            language: sq.language || 'cpp',
            objectiveItems: sq.objectiveItems || undefined,
            scoringCriteria: sq.scoringCriteria || null,
          })),
        },
      },
      include: { subQuestions: { orderBy: { sortOrder: 'asc' } } },
    });
  }
}