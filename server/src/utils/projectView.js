/**
 * projectView.js — 实训题对外字段白名单（R2/R3/R4/R6 唯一落点）
 *
 * 铁律：学生视图必须「显式字段拷贝」，禁止 {...submission} 再 delete 的黑名单写法。
 * 新增敏感列时黑名单会静默泄漏，白名单则编译期即可发现缺失字段。
 */

const EMPTY_ENVELOPE = { kind: 'project', currentVersion: 0, history: [], grading: { state: 'none', version: 0, attempts: 0, error: null } };

/**
 * 将 Submission.answer（Text 字段，JSON 字符串）解析为版本信封对象。
 * answer 是 String? @db.Text 而非 Prisma Json，统一在此用 JSON 字符串存取。
 */
export function parseProjectAnswer(answer) {
  if (!answer) return { ...EMPTY_ENVELOPE };
  try {
    const obj = typeof answer === 'string' ? JSON.parse(answer) : answer;
    if (!obj || typeof obj !== 'object') return { ...EMPTY_ENVELOPE };
    const grading = obj.grading && typeof obj.grading === 'object'
      ? {
          state: obj.grading.state || 'none',
          version: Number(obj.grading.version) || 0,
          attempts: Number(obj.grading.attempts) || 0,
          error: obj.grading.error || null,
        }
      : { state: 'none', version: 0, attempts: 0, error: null };
    return {
      kind: obj.kind || 'project',
      currentVersion: Number(obj.currentVersion) || 0,
      history: Array.isArray(obj.history) ? obj.history : [],
      grading,
    };
  } catch {
    return { ...EMPTY_ENVELOPE };
  }
}

/** 将版本信封对象序列化回 JSON 字符串存入 answer 字段 */
export function serializeProjectAnswer(envelope) {
  return JSON.stringify(envelope);
}

/** 学生是否可见分数：仅 reviewed / published（兼容编程题批量发布链路，D3） */
export function canStudentSeeScore(status) {
  return status === 'reviewed' || status === 'published';
}

/**
 * 学生视图白名单。
 * - ai_graded 对学生映射为 submitted（R3：status 值本身也是泄漏，会暴露「AI 已打分」）
 * - 绝不返回 aiScore / aiFeedback / grading / referenceAnswer / 物理路径
 */
export function toStudentView(submission, _question) {
  const env = parseProjectAnswer(submission.answer);
  const status = submission.status === 'ai_graded' ? 'submitted' : submission.status;
  const showScore = canStudentSeeScore(submission.status);
  return {
    id: submission.id,
    questionId: submission.questionId,
    assignmentId: submission.assignmentId,
    status,
    submittedAt: submission.submittedAt || null,
    version: env.currentVersion,
    // D3：审核通过但教师未给分时显示 null（—），绝不回退到 AI 原始分
    score: showScore ? (submission.finalScore ?? null) : null,
    feedback: showScore ? (submission.teacherFeedback ?? null) : null,
    // 仅 submitted 态暴露后台评分进度；ai_graded 对学生映射为 submitted，
    // 但此时已在后台完成，无需展示进度。grading.failed 时前端提示"评分异常，稍候"。
    // BUG-017-adj（6③ 裁决）：parseProjectAnswer 会把缺省 grading 补成 'none'，
    // 导致 || 'pending' 永不生效——学生视图语义应为「无任务 = 待评分 pending」
    gradingState: submission.status === 'submitted'
      ? (env.grading?.state && env.grading.state !== 'none' ? env.grading.state : 'pending')
      : null,
  };
}

/** 教师视图：可携带 AI 原始评语（脱敏由教师自行负责），含评分任务态 */
export function toTeacherView(submission) {
  const env = parseProjectAnswer(submission.answer);
  return {
    id: submission.id,
    questionId: submission.questionId,
    assignmentId: submission.assignmentId,
    studentId: submission.studentId,
    status: submission.status,
    submittedAt: submission.submittedAt || null,
    attemptCount: submission.attemptCount || 0,
    version: env.currentVersion,
    aiScore: submission.aiScore ?? null,
    aiFeedback: submission.aiFeedback ?? null,
    finalScore: submission.finalScore ?? null,
    teacherFeedback: submission.teacherFeedback ?? null,
    grading: env.grading,
  };
}
