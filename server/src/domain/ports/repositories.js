/**
 * 仓储端口 —— 领域层定义的数据访问契约（由基础设施层 Prisma 适配器实现）。
 * 应用层只依赖这些接口，不依赖 Prisma/MySQL。
 */

/**
 * @typedef {object} QuestionRepository 题目仓储
 * @property {(id: number|string) => Promise<object|null>} findById 按 ID 查询（含小题）
 * @property {(ids: Array<number|string>) => Promise<Array<object>>} findByIds 批量查询
 * @property {(q: object) => Promise<void>} save 保存（创建/更新）
 * @property {(criteria: {teacherId?: number, schoolId?: number, keyword?: string, page?: number, pageSize?: number}) => Promise<{list: Array, total: number}>} search 分页搜索
 */

/**
 * @typedef {object} AssignmentRepository 作业仓储
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(a: object) => Promise<void>} save
 * @property {(teacherId: number, schoolId: number) => Promise<Array<object>>} listByTeacher
 */

/**
 * @typedef {object} SubmissionRepository 提交仓储
 * @property {(s: object) => Promise<void>} save
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(assignmentId: number|string, studentId: number|string) => Promise<object|null>} findByAssignmentAndStudent
 * @property {(assignmentId: number|string) => Promise<Array<object>>} listByAssignment
 */

/**
 * @typedef {object} ReviewResultRepository 评分结果仓储
 * @property {(r: object) => Promise<void>} save
 * @property {(submissionId: number|string) => Promise<Array<object>>} findBySubmissionId
 */

/**
 * @typedef {object} UserRepository 用户仓储
 * @property {(username: string) => Promise<object|null>} findByUsername
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(u: object) => Promise<void>} save
 */

/**
 * @typedef {object} SystemConfigRepository 系统配置仓储（AI key/model 等，敏感值由基础设施层处理）
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string) => Promise<void>} set
 */

/**
 * @typedef {object} ProjectRepository 实训项目仓储
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(p: object) => Promise<void>} save
 */

/**
 * @typedef {object} ProjectSubmissionRepository 实训项目提交仓储
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(ps: object) => Promise<void>} save
 * @property {(projectId: number|string) => Promise<Array<object>>} listByProject
 */