// 领域实体：身份、核心状态与关键不变量；持久化与查询由仓储端口负责

import { SubmissionStatus, QuestionType } from './value-objects.js';
import { SubmissionClosedError, DuplicateSubmissionError, IllegalStateError } from './errors.js';

// 提交聚合：学生针对作业某题目的答案提交（截止后不可提交，状态机单向流转）
export class Submission {
  constructor({ id, assignmentId, studentId, questionId, answer, status = SubmissionStatus.DRAFT, submittedAt = null }) {
    this.id = id;
    this.assignmentId = assignmentId;
    this.studentId = studentId;
    this.questionId = questionId;
    this.answer = answer;
    this.status = status;
    this.submittedAt = submittedAt;
  }

  // 提交（草稿 → 已提交）
  submit({ endTime, now = new Date(), alreadySubmitted = false }) {
    if (endTime && now > endTime) throw new SubmissionClosedError('提交已截止');
    if (alreadySubmitted || this.status !== SubmissionStatus.DRAFT) {
      throw new DuplicateSubmissionError('该作业已提交，不可重复提交');
    }
    this.status = SubmissionStatus.SUBMITTED;
    this.submittedAt = now;
  }

  // 标记已评分（已提交 → 已评分）
  markGraded() {
    if (this.status === SubmissionStatus.DRAFT) throw new IllegalStateError('草稿不可标记为已评分');
    if (this.status === SubmissionStatus.AI_GRADED || this.status === SubmissionStatus.REVIEWED) {
      throw new IllegalStateError('该提交已评分，请走重评流程');
    }
    this.status = SubmissionStatus.AI_GRADED;
  }
}

// 用户：身份 + 角色 + 学校/班级关系
export class User {
  constructor({ id, username, realName, role, lastSchoolId = null }) {
    this.id = id;
    this.username = username;
    this.realName = realName;
    this.role = role;
    this.lastSchoolId = lastSchoolId;
  }

  isTeacher() { return this.role === 'teacher'; }
  isStudent() { return this.role === 'student'; }
  isAdmin() { return this.role === 'super_admin'; }
}

// 题目：题干 + 小题列表（分值不变量由 ScoringService 校验）
export class Question {
  constructor({ id, title, type = QuestionType.PROGRAMMING, maxScore = 0, difficulty = 'medium', subQuestions = [], teacherId }) {
    this.id = id;
    this.title = title;
    this.type = type;
    this.maxScore = maxScore;
    this.difficulty = difficulty;
    this.subQuestions = subQuestions;
    this.teacherId = teacherId;
  }
}

// 作业：教师发布给班级的题目集合，含开放/截止时间
export class Assignment {
  constructor({ id, teacherId, title, startTime = null, endTime = null, mode = 'normal', classIds = [], questionIds = [] }) {
    this.id = id;
    this.teacherId = teacherId;
    this.title = title;
    this.startTime = startTime;
    this.endTime = endTime;
    this.mode = mode;
    this.classIds = classIds;
    this.questionIds = questionIds;
  }

  // 提交窗口是否开启；endTime 为空视为不限制
  isOpen(now = new Date()) {
    if (this.startTime && now < this.startTime) return false;
    if (this.endTime && now > this.endTime) return false;
    return true;
  }
}

// 评分结果：引擎产出（score + feedback），来源标记 machine/ast/ai/manual
export class ReviewResult {
  constructor({ id = null, submissionId, score, feedback, source = 'ai', reviewedAt = null }) {
    this.id = id;
    this.submissionId = submissionId;
    this.score = score;
    this.feedback = feedback;
    this.source = source;
    this.reviewedAt = reviewedAt;
  }
}

// 实训项目（教师发布）
export class Project {
  constructor({ id, teacherId, title, description = '', standardDir = null }) {
    this.id = id;
    this.teacherId = teacherId;
    this.title = title;
    this.description = description;
    this.standardDir = standardDir;
  }
}

// 实训项目提交：学生上传的代码快照，评分后产生 ReviewResult
export class ProjectSubmission {
  constructor({ id, projectId, studentId, versionDir = null, status = 'submitted' }) {
    this.id = id;
    this.projectId = projectId;
    this.studentId = studentId;
    this.versionDir = versionDir;
    this.status = status;
  }
}

// 小组（团队）
export class Team {
  constructor({ id, schoolId, name, creatorId, memberTeacherIds = [], classIds = [] }) {
    this.id = id;
    this.schoolId = schoolId;
    this.name = name;
    this.creatorId = creatorId;
    this.memberTeacherIds = memberTeacherIds;
    this.classIds = classIds;
  }
}

// 学校 / 班级：组织结构实体
export class School {
  constructor({ id, name, officialCode = null }) {
    this.id = id;
    this.name = name;
    this.officialCode = officialCode;
  }
}

export class Class {
  constructor({ id, name, schoolId }) {
    this.id = id;
    this.name = name;
    this.schoolId = schoolId;
  }
}
