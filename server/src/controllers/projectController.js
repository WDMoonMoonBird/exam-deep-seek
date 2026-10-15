import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { buildTree, flattenTree } from '../utils/fileTree.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { extractZipSafely } from '../utils/projectArchive.js';
// ★R2-B62（F-T54-1）：multer 错误映射**复用**教师上传那一条（不再本地新写一份口径）
import { multerErrorResponse } from '../infrastructure/teacher/uploads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_UPLOAD_DIR = path.join(__dirname, '../../uploads/projects');

// 确保上传目录存在
if (!fs.existsSync(PROJECTS_UPLOAD_DIR)) {
  fs.mkdirSync(PROJECTS_UPLOAD_DIR, { recursive: true });
}

// multer 内存存储配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  defParamCharset: 'utf8',
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip') {
      return cb(new Error('仅支持 zip 文件'));
    }
    cb(null, true);
  },
});

// ==================== 归属校验（round 6 · body 目标资源） ====================

/**
 * 教师可见班级（直连 ∪ 团队共享）—— 语义与 teamController.getVisibleClassIds 逐字同形。
 *
 * ⚠️ 本文件**内联**实现而非 import：新增 `./teamController.js` 相对导入会多出 1 条边，
 * 破坏 cycle-check 的「164 条相对导入边」不变量（round 6 硬约束）；且 teachers/classes
 * 两侧的 schoolId 过滤规则必须与 getVisibleClassIds 完全一致。
 *
 * @param {number} teacherId
 * @param {number|string|null} schoolId 为空时不做学校过滤（沿用 getVisibleClassIds 既有行为）
 * @returns {Promise<Set<number>>}
 */
async function visibleClassIdSet(teacherId, schoolId) {
  const sid = schoolId ? +schoolId : null;
  const classScope = sid ? { class: { schoolId: sid } } : {};
  const direct = await prisma.teacherClass.findMany({ where: { teacherId, ...classScope }, select: { classId: true } });
  const teamIds = (await prisma.teamTeacher.findMany({ where: { teacherId }, select: { teamId: true } })).map(t => t.teamId);
  const teamClassIds = teamIds.length
    ? (await prisma.teamClass.findMany({ where: { teamId: { in: teamIds }, ...classScope }, select: { classId: true } })).map(tc => tc.classId)
    : [];
  return new Set([...direct.map(d => d.classId), ...teamClassIds]);
}

/** body.classIds 必须全部落在教师可见班级内（空数组 = 无目标资源 ⇒ 放行）。 */
async function canManageProjectClasses(req, classIds) {
  if (!classIds?.length) return true;
  const visible = await visibleClassIdSet(req.user.id, req.query.schoolId ? +req.query.schoolId : null);
  return classIds.every(cid => visible.has(+cid));
}

/**
 * ★H1：临时目录标识校验（防路径穿越）。
 *   ① 白名单正则：只接受服务端 uploadPackage 生成的 temp_<毫秒>_<base36随机> 形状；
 *   ② 目录包含：用 path.relative 判定解析结果仍落在 PROJECTS_UPLOAD_DIR 内（拒绝 .. 逃逸/绝对路径）。
 * 任一不满足返回 null，调用方一律 400，且在任何写库/文件操作之前完成。
 */
function resolveTempDir(tempId) {
  const id = String(tempId ?? '');
  if (!/^temp_\d+_[a-z0-9]+$/.test(id)) return null;
  const root = path.resolve(PROJECTS_UPLOAD_DIR);
  const dir = path.resolve(root, id);
  const rel = path.relative(root, dir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return dir;
}

// ==================== 实训任务 CRUD ====================

/** GET / — 分页查询任务列表 */
export const listProjects = async (req, res) => {
  try {
    // ★L8（W2-P2）：分页夹紧（pageSize 无上限 ⇒ 可一次拉全表；page 可为负 ⇒ skip 为负）。
    const { keyword, status } = req.query;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
    const where = { teacherId: req.user.id, deletedAt: null };
    if (keyword) where.title = { contains: keyword };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      prisma.project.findMany({
        where,
        select: {
          id: true, title: true, startTime: true, endTime: true,
          status: true, createdAt: true,
          classes: { include: { class: { select: { id: true, name: true } } } },
          _count: { select: { submissions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.project.count({ where }),
    ]);

    // 统计每个任务的已提交人数
    const projectIds = list.map(p => p.id);
    if (projectIds.length) {
      const gradedCounts = await prisma.projectSubmission.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds }, status: { not: 'draft' } },
        _count: { id: true },
      });
      const countMap = {};
      for (const g of gradedCounts) countMap[g.projectId] = g._count.id;

      // 统计每个任务的应提交总人数（班级学生数）
      for (const p of list) {
        const classIds = p.classes.map(c => c.classId);
        let totalStudents = 0;
        if (classIds.length) {
          totalStudents = await prisma.studentClass.count({
            where: { classId: { in: classIds } },
          });
        }
        p.submissionCount = countMap[p.id] || 0;
        p.totalStudents = totalStudents;
      }
    }

    res.json({ code: 0, message: 'ok', data: { list, total, page: +page, pageSize: +pageSize } });
  } catch (err) {
    logger.error({ err }, '获取实训任务列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** GET /:id — 获取任务详情（含文件树） */
export const getProject = async (req, res) => {
  try {
    const id = +req.params.id;
    const project = await prisma.project.findFirst({
      where: { id, teacherId: req.user.id, deletedAt: null },
      include: {
        classes: { include: { class: { select: { id: true, name: true } } } },
        files: true,
      },
    });
    if (!project) return res.status(404).json({ code: 1004, message: '任务不存在', data: null });

    // 将 files 转为树形 JSON
    const fileTree = filesToTree(project.files);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        ...project,
        fileTree,
        files: undefined, // 已经转为 tree，不暴露扁平列表
      },
    });
  } catch (err) {
    logger.error({ err }, '获取实训任务详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** POST / — 创建实训任务 */
export const createProject = async (req, res) => {
  try {
    const {
      title, description, startTime, endTime,
      machineWeight = 0.3, astWeight = 0.3, aiWeight = 0.4,
      machineConfig, aiPromptExtra,
      classIds = [], tempId,
      status = 'draft',
    } = req.body;

    if (!title || !startTime || !endTime || !classIds.length) {
      return res.status(400).json({ code: 1001, message: '参数错误：标题、时间、班级为必填项', data: null });
    }
    if (title.length > 200) {
      return res.status(400).json({ code: 1001, message: '标题不能超过200字', data: null });
    }
    // 验证权重：必须为有限数值且不小于 0（防 "abc" 等字符串被 Number() 转成 NaN 后绕过校验并持久化）
    const mwNum = +machineWeight;
    const awNum = +astWeight;
    const aiwNum = +aiWeight;
    if (!Number.isFinite(mwNum) || !Number.isFinite(awNum) || !Number.isFinite(aiwNum)
      || mwNum < 0 || awNum < 0 || aiwNum < 0) {
      return res.status(400).json({ code: 1001, message: '评分权重必须为非负数字', data: null });
    }
    // 验证权重合计为1
    const totalWeight = mwNum + awNum + aiwNum;
    if (Math.abs(totalWeight - 1) > 0.001) {
      return res.status(400).json({ code: 1001, message: '评分权重合计必须为100%', data: null });
    }

    // 归属校验（round 6 · body 目标）：classIds 必须落在本人可见班级内；在任何写库动作之前 ⇒ 未命中零写入
    if (!(await canManageProjectClasses(req, classIds))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

    // ★H1：tempId 先白名单 + 目录包含校验（在任何写库/文件操作之前）；不合规 400
    let tempDir = null;
    if (tempId) {
      tempDir = resolveTempDir(tempId);
      if (!tempDir) return res.status(400).json({ code: 1001, message: '非法临时目录标识', data: null });
    }

    // 创建任务 + 关联班级 + 文件树记录：整体放入交互式事务，中途失败整体回滚，避免孤儿数据
    // 注：目录迁移/buildTree 属文件系统操作无法回滚，按约定容忍其在事务内执行；
    // 事务保证 project / projectClass / projectFile 三者要么全部成功要么全部回滚
    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          teacherId: req.user.id,
          title,
          description: description || null,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          machineWeight: mwNum,
          astWeight: awNum,
          aiWeight: aiwNum,
          machineConfig: machineConfig || undefined,
          aiPromptExtra: aiPromptExtra || null,
          status,
        },
      });

      // 关联班级
      if (classIds.length) {
        await tx.projectClass.createMany({
          data: classIds.map(cid => ({ projectId: p.id, classId: +cid })),
        });
      }

      // 处理标准工程包：从临时目录迁移（tempDir 已过 ★H1 校验）
      if (tempDir) {
        const targetDir = path.join(PROJECTS_UPLOAD_DIR, String(p.id));
        if (fs.existsSync(tempDir)) {
          fs.renameSync(tempDir, targetDir);
          // 构建文件树并写入 project_files 表
          const standardDir = path.join(targetDir, 'standard');
          if (fs.existsSync(standardDir)) {
            const tree = buildTree(standardDir, { skipBaseDir: true });
            const flatList = flattenTree(tree);
            if (flatList.length > 0) {
              await tx.projectFile.createMany({
                data: flatList.map(f => ({
                  projectId: p.id,
                  path: f.path,
                  name: f.name,
                  type: f.type,
                  language: f.language,
                  size: f.size,
                  parentPath: f.parentPath,
                })),
              });
            }
          }
        }
      }

      return p;
    });

    logger.info({ projectId: project.id, classIds }, '实训任务已创建');
    res.json({ code: 0, message: '创建成功', data: project });
  } catch (err) {
    logger.error({ err }, '创建实训任务失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** PUT /:id — 更新实训任务 */
export const updateProject = async (req, res) => {
  try {
    const id = +req.params.id;
    const existing = await prisma.project.findFirst({
      where: { id, teacherId: req.user.id, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ code: 1004, message: '任务不存在', data: null });

    // 已发布的任务不允许修改文件包
    if (existing.status === 'published' && req.body.tempId) {
      return res.status(400).json({ code: 1001, message: '已发布的任务不允许修改标准工程包', data: null });
    }

    const {
      title, description, startTime, endTime,
      machineWeight, astWeight, aiWeight,
      machineConfig, aiPromptExtra,
      classIds, tempId, status,
    } = req.body;

    if (title && title.length > 200) {
      return res.status(400).json({ code: 1001, message: '标题不能超过200字', data: null });
    }

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (startTime !== undefined) data.startTime = new Date(startTime);
    if (endTime !== undefined) data.endTime = new Date(endTime);
    if (machineWeight !== undefined) data.machineWeight = +machineWeight;
    if (astWeight !== undefined) data.astWeight = +astWeight;
    if (aiWeight !== undefined) data.aiWeight = +aiWeight;
    if (machineConfig !== undefined) data.machineConfig = machineConfig;
    if (aiPromptExtra !== undefined) data.aiPromptExtra = aiPromptExtra;
    if (status !== undefined) data.status = status;

    // 验证权重：必须为有限数值且不小于 0（与 createProject 同款，防 NaN 持久化）
    const mw = data.machineWeight ?? existing.machineWeight;
    const aw = data.astWeight ?? existing.astWeight;
    const aiw = data.aiWeight ?? existing.aiWeight;
    if (!Number.isFinite(mw) || !Number.isFinite(aw) || !Number.isFinite(aiw)
      || mw < 0 || aw < 0 || aiw < 0) {
      return res.status(400).json({ code: 1001, message: '评分权重必须为非负数字', data: null });
    }
    if (Math.abs(mw + aw + aiw - 1) > 0.001) {
      return res.status(400).json({ code: 1001, message: '评分权重合计必须为100%', data: null });
    }

    // 归属校验（round 6 · body 目标）：classIds 覆盖式改写前先校验归属；未命中零写入
    if (classIds !== undefined && !(await canManageProjectClasses(req, classIds))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

    // ★H1：tempId 先白名单 + 目录包含校验（在任何写库/文件操作之前）；不合规 400
    let tempDir = null;
    if (tempId) {
      tempDir = resolveTempDir(tempId);
      if (!tempDir) return res.status(400).json({ code: 1001, message: '非法临时目录标识', data: null });
    }

    // 更新任务、班级关联、文件记录：整体放入交互式事务，中途失败回滚，避免孤儿数据
    // 注：rmSync/renameSync/buildTree 属文件系统操作，按约定容忍在事务内执行
    await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data });

      // 更新班级关联
      if (classIds !== undefined) {
        await tx.projectClass.deleteMany({ where: { projectId: id } });
        if (classIds.length) {
          await tx.projectClass.createMany({
            data: classIds.map(cid => ({ projectId: id, classId: +cid })),
          });
        }
      }

      // 处理标准工程包迁移（tempDir 已过 ★H1 校验）
      if (tempDir) {
        const targetDir = path.join(PROJECTS_UPLOAD_DIR, String(id));
        if (fs.existsSync(tempDir)) {
          // 删除旧文件记录和目录
          await tx.projectFile.deleteMany({ where: { projectId: id } });
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          fs.renameSync(tempDir, targetDir);
          // 重建文件记录
          const standardDir = path.join(targetDir, 'standard');
          if (fs.existsSync(standardDir)) {
            const tree = buildTree(standardDir, { skipBaseDir: true });
            const flatList = flattenTree(tree);
            if (flatList.length > 0) {
              await tx.projectFile.createMany({
                data: flatList.map(f => ({
                  projectId: id,
                  path: f.path,
                  name: f.name,
                  type: f.type,
                  language: f.language,
                  size: f.size,
                  parentPath: f.parentPath,
                })),
              });
            }
          }
        }
      }
    });

    logger.info({ projectId: id }, '实训任务已更新');
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    logger.error({ err }, '更新实训任务失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** DELETE /:id — 软删除实训任务 */
export const deleteProject = async (req, res) => {
  try {
    const id = +req.params.id;
    const project = await prisma.project.findFirst({
      where: { id, teacherId: req.user.id, deletedAt: null },
    });
    if (!project) return res.status(404).json({ code: 1004, message: '任务不存在', data: null });

    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    logger.info({ projectId: id }, '实训任务已软删除');
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除实训任务失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ==================== 上传标准工程包 ====================

/** POST /upload-package — 上传 zip 并返回文件树 */
export const uploadPackage = (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      // ★R2-B62（F-T54-1）：与 studentController/教师上传**同口径** —— LIMIT_FILE_SIZE ⇒ 413 + code1403，其它 ⇒ 400 + 可读 message
      const m = multerErrorResponse(err);
      return res.status(m.status).json(m.body);
    }
    if (!req.file) {
      return res.status(400).json({ code: 1001, message: '未选择文件', data: null });
    }

    try {
      // 生成临时 ID
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const targetDir = path.join(PROJECTS_UPLOAD_DIR, tempId, 'standard');

      // 解压 zip（含 GBK 文件名智能解码、分段清洗与 Zip-Slip 防护）
      extractZipSafely(req.file.buffer, targetDir);

      // 构建文件树
      const tree = buildTree(targetDir, { skipBaseDir: true });

      // 统计
      const flatList = flattenTree(tree);
      const fileCount = flatList.filter(f => f.type === 'file').length;
      const totalSize = flatList.reduce((sum, f) => sum + (f.size || 0), 0);

      logger.info({ tempId, fileCount, totalSize }, '标准工程包已上传');
      res.json({
        code: 0,
        message: '上传成功',
        data: { tree, fileCount, totalSize, tempId },
      });
    } catch (e) {
      // ★R3-D10（t19）：与 t16/D8 的学生侧（student/project-submit.js）**同口径** ——
      //   已知的「客户端压缩包问题」⇒ 400 + 可读文案（code 1001），不再 500；
      //   adm-zip 内部文案已在 utils/projectArchive.extractZipSafely 统一收敛为「压缩包内容非法」，
      //   本处只做状态码/文案白名单归一（路径穿越按其语义归一为同一文案）。
      const msg = e?.message || '未知错误';
      const isTraversal = msg.includes('Path traversal denied') || msg.includes('Invalid path segment');
      const isClientError = isTraversal || msg.includes('压缩包');
      if (isClientError) {
        logger.warn({ err: e }, '标准工程包解压被拒（客户端压缩包问题）');
        return res.status(400).json({ code: 1001, message: isTraversal ? '压缩包内容非法' : msg, data: null });
      }
      logger.error({ err: e }, '解压 zip 失败');
      res.status(500).json({ code: 2001, message: '解压失败: ' + msg, data: null });
    }
  });
};

// ==================== 工具函数 ====================

/**
 * 将扁平文件列表转为树形 JSON（用于 getProject 返回）
 * @param {Array} files - project_files 表中的扁平记录
 * @returns {Array} FileTreeNode[]
 */
function filesToTree(files) {
  if (!files || files.length === 0) return [];

  /** @type {Map<string, any>} */
  const nodeMap = new Map();
  /** @type {Array} */
  const roots = [];

  // 先建目录节点
  for (const f of files) {
    if (f.type === 'directory') {
      nodeMap.set(f.path, {
        name: f.name,
        type: 'directory',
        path: f.path,
        children: [],
      });
    }
  }

  // 建文件节点 + 挂载到父目录
  for (const f of files) {
    if (f.type === 'file') {
      const node = {
        name: f.name,
        type: 'file',
        path: f.path,
        language: f.language || 'plaintext',
        size: f.size || 0,
      };
      const parent = f.parentPath ? nodeMap.get(f.parentPath) : null;
      if (parent && parent.children) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  // 挂载目录到父目录
  for (const f of files) {
    if (f.type === 'directory') {
      const node = nodeMap.get(f.path);
      if (!node) continue;
      const parent = f.parentPath ? nodeMap.get(f.parentPath) : null;
      if (parent && parent.children) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  // 排序
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  };
  sortNodes(roots);

  return roots;
}
