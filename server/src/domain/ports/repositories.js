/**
 * 仓储端口 —— 领域层定义的数据访问契约（由基础设施层 Prisma 适配器实现）。
 * DSGN-001/BUG-011 处置（2026-08-16）：以应用层实际消费面重写，删除无实现无消费的空想契约；
 * 未实现仓储（Assignment/ReviewResult/User/Project/ProjectSubmission）从契约移除，列入 DSGN-018 排期。
 */

/**
 * @typedef {object} SubmissionRepository 提交仓储（SubmissionUseCases/ReviewUseCases 消费）
 * @property {(id: number) => Promise<object|null>} findById 按 ID 查询（含题目材料/小题）
 * @property {(id: number) => Promise<object|null>} findScoreContext 评分上下文（status/aiScore/aiFeedback/teacherFeedback/question.type）
 * @property {(id: number, data: object) => Promise<object>} update 更新提交字段
 * @property {(assignmentId: number, studentId?: number) => Promise<object|null>} findAssignmentContext 作业提交上下文（endTime/allowResubmit/mode/maxAttempts/locked）；传 studentId 时追加归属收窄：学生不在作业投放班级内 ⇒ null（round 6）
 * @property {(assignmentId: number, studentId: number, questionId: number, subQuestionId?: number|null) => Promise<object|null>} findByAssignmentAndQuestion 学生某题提交
 * @property {(assignmentId: number, questionId: number) => Promise<object|null>} findAssignmentQuestion 作业-题目关联（★R3-D11：入参归属校验用；返回 { questionId, question: { id, type, subQuestions: [{ id }] } } 或 null）
 * @property {(data: object) => Promise<object>} create 创建提交
 * @property {(assignmentId: number, studentId: number) => Promise<object>} resetByAssignment 重置为草稿（练习重答）
 */

/**
 * @typedef {object} QuestionRepository 题目仓储（QuestionUseCases 消费）
 * @property {(data: {teacherId: number, title: string, maxScore: number, difficulty?: string, material?: string, attachmentUrl?: string, objectiveSettings?: object, subQuestions: Array}) => Promise<object>} create 创建题目（含小题）
 * @property {(id: number) => Promise<object|null>} findById 按 ID 查询（含小题；已实现，待用例接入）
 */

/**
 * @typedef {object} SystemConfigRepository 系统配置仓储（DeepSeekGateway 等消费）
 * @property {(key: string) => Promise<string|null>} get 读取配置（DB 优先）
 * @property {(key: string, value: string) => Promise<void>} set 写入配置并失效缓存
 * @property {() => void} clearCache 清缓存（管理端改配置后调用）
 * @property {() => Promise<string|null>} getApiKey
 * @property {() => Promise<string>} getBaseUrl
 * @property {() => Promise<string>} getModel
 * @property {() => Promise<number>} getConcurrency
 * @property {() => Promise<object>} loadAll 全量加载（1 分钟缓存）
 */