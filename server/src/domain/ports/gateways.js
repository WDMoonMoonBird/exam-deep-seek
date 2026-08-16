/**
 * 外部能力端口 —— 领域层定义的网关契约（由基础设施层适配器实现）。
 * 依赖倒置核心：应用层通过本文件接口调用外部世界，反向由基础设施层实现。
 */

/**
 * AI 网关：统一 AI 能力入口（评分/试卷解析）。
 * @typedef {object} AiGateway
 * @property {(req: {material?: string, subQuestionTitle?: string, subQuestionContent?: string, referenceAnswer: string, studentAnswer: string, maxScore: number, scoringCriteria?: string}) => Promise<{score: number, feedback: string}>} grade 评分
 * @property {(paperText: string) => Promise<Array<object>>} parsePaper 试卷解析（可选实现）
 */

/**
 * 编译/分析执行器：机器校验（编译检查、AST 分析），child_process 封装。
 * @typedef {object} ExecutorPort
 * @property {(dir: string, config?: {checkCompile?: boolean}) => Promise<{passed: boolean, score: number, feedback: string, details?: object}>} compileCheck 编译检查（对齐 CompileExecutor.compileCheck 签名，BUG-010 处置）
 */

/**
 * 通知端口：实时推送（Socket.IO 等）。
 * @typedef {object} NotificationPort
 * @property {(schoolId: number, payload: object) => Promise<void>} notifyGraded 评分完成推送
 * @property {(schoolId: number, payload: object) => Promise<void>} notifyProjectGraded 项目评分完成推送
 */

/**
 * 限流端口：登录防爆破等。
 * @typedef {object} RateLimiterPort
 * @property {(key: string) => Promise<boolean>} isBlocked 是否已封锁
 * @property {(key: string) => Promise<void>} recordFailure 记录失败
 * @property {(key: string) => Promise<void>} recordSuccess 记录成功
 */

/**
 * 单元工作：跨仓储原子事务。
 * @typedef {object} UnitOfWork
 * @property {(fn: (tx: object) => Promise<T>) => Promise<T>} withTransaction 在事务中执行
 * @template T
 */