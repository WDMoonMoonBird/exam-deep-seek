/**
 * checkerController.js — AI 自动评分器（确定性检查器）生成与状态接口
 */
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { generateChecker, getCheckerState, confirmChecker, rollbackChecker } from '../services/checkerService.js';

/**
 * GET /api/teacher/questions/:id/checker — 查询脚本生成状态
 */
export const getChecker = async (req, res) => {
  try {
    const q = await prisma.question.findUnique({
      where: { id: +req.params.id },
      select: { id: true, type: true },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    if (q.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '仅实训题支持自动评分器', data: null });
    }
    const state = await getCheckerState(q.id);
    res.json({ code: 0, message: 'ok', data: state });
  } catch (err) {
    logger.error({ err }, '查询自动评分器状态失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/**
 * POST /api/teacher/questions/:id/checker/confirm — 教师确认操作（review 态）
 * body: { action: 'confirm'|'to_subjective'|'exempt'|'accept'|'update_rules'|'regenerate', itemIds?, rules? }
 */
export const confirmCheckerHandler = async (req, res) => {
  try {
    const id = +req.params.id;
    const q = await prisma.question.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    if (q.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '仅实训题支持自动评分器', data: null });
    }
    const action = req.body && req.body.action;
    if (!action || typeof action !== 'string') {
      return res.status(400).json({ code: 1001, message: '缺少 action', data: null });
    }
    const state = await confirmChecker(id, {
      action,
      itemIds: Array.isArray(req.body.itemIds) ? req.body.itemIds : [],
      rules: req.body.rules,
    });
    if (!state) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    res.json({ code: 0, message: 'ok', data: state });
  } catch (err) {
    logger.error({ err }, '自动评分器确认操作失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/**
 * POST /api/teacher/questions/:id/checker/rollback — 回滚到历史规则版本
 * body: { ruleVersionId }
 */
export const rollbackCheckerHandler = async (req, res) => {
  try {
    const id = +req.params.id;
    const q = await prisma.question.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    if (q.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '仅实训题支持自动评分器', data: null });
    }
    const versionId = Number(req.body && req.body.ruleVersionId);
    if (!Number.isFinite(versionId) || versionId <= 0) {
      return res.status(400).json({ code: 1001, message: '缺少 ruleVersionId', data: null });
    }
    const state = await rollbackChecker(id, versionId);
    if (!state) return res.status(404).json({ code: 1004, message: '规则版本不存在', data: null });
    res.json({ code: 0, message: 'ok', data: state });
  } catch (err) {
    logger.error({ err }, '自动评分器回滚失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/**
 * POST /api/teacher/questions/:id/checker/generate — 触发异步生成 + 自举校准
 * 生成为异步长流程（1~3 分钟），前端轮询 GET checker 获取进度；
 * 已在 generating 时幂等返回。
 */
export const generateCheckerHandler = async (req, res) => {
  try {
    const id = +req.params.id;
    const q = await prisma.question.findUnique({
      where: { id },
      select: { id: true, type: true, checkerStatus: true },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    if (q.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '仅实训题支持自动评分器', data: null });
    }
    // fire-and-forget：异步生成；幂等与陈旧状态重启由 generateChecker 内部保证
    generateChecker(id).catch(err => logger.error({ err, questionId: id }, '自动评分器生成异常'));
    res.json({ code: 0, message: '已开始生成', data: { status: 'generating' } });
  } catch (err) {
    logger.error({ err }, '触发自动评分器生成失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};