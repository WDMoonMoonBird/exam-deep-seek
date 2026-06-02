import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// ===================== 学校管理 =====================

export const getSchools = async (req, res) => {
  try {
    const list = await prisma.school.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取学校列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createSchool = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ code: 1001, message: '校名不能为空', data: null });
    const school = await prisma.school.create({ data: { name } });
    logger.info({ schoolId: school.id }, '学校已创建');
    res.json({ code: 0, message: '创建成功', data: school });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '校名已存在', data: null });
    logger.error({ err }, '创建学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const school = await prisma.school.update({ where: { id: +id }, data: { name } });
    res.json({ code: 0, message: '更新成功', data: school });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '校名已存在', data: null });
    logger.error({ err }, '更新学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteSchool = async (req, res) => {
  try {
    const id = +req.params.id;
    const classes = await prisma.class.findMany({ where: { schoolId: id }, select: { id: true } });
    const classIds = classes.map((c) => c.id);
    await prisma.$transaction([
      prisma.studentClass.deleteMany({ where: { classId: { in: classIds } } }),
      prisma.teacherClass.deleteMany({ where: { classId: { in: classIds } } }),
      prisma.assignmentClass.deleteMany({ where: { classId: { in: classIds } } }),
      prisma.class.deleteMany({ where: { schoolId: id } }),
      prisma.school.delete({ where: { id } }),
    ]);
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 班级管理 =====================

export const getClasses = async (req, res) => {
  try {
    const { schoolId } = req.query;
    const where = schoolId ? { schoolId: +schoolId } : {};
    const list = await prisma.class.findMany({
      where,
      include: { school: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取班级列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createClass = async (req, res) => {
  try {
    const { name, schoolId, teacherIds } = req.body;
    if (!name || !schoolId) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    const cls = await prisma.class.create({
      data: {
        name,
        schoolId: +schoolId,
        teacherClasses: teacherIds?.length
          ? { create: teacherIds.map((tid) => ({ teacherId: +tid })) }
          : undefined,
      },
    });
    logger.info({ classId: cls.id }, '班级已创建');
    res.json({ code: 0, message: '创建成功', data: cls });
  } catch (err) {
    logger.error({ err }, '创建班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, schoolId, teacherIds } = req.body;

    // 更新班级基本信息
    await prisma.class.update({ where: { id: +id }, data: { name, schoolId: +schoolId } });

    // 重建教师关联
    if (teacherIds !== undefined) {
      await prisma.teacherClass.deleteMany({ where: { classId: +id } });
      if (teacherIds.length > 0) {
        await prisma.teacherClass.createMany({
          data: teacherIds.map((tid) => ({ teacherId: +tid, classId: +id })),
        });
      }
    }

    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    logger.error({ err }, '更新班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteClass = async (req, res) => {
  try {
    const id = +req.params.id;
    await prisma.$transaction([
      prisma.studentClass.deleteMany({ where: { classId: id } }),
      prisma.teacherClass.deleteMany({ where: { classId: id } }),
      prisma.assignmentClass.deleteMany({ where: { classId: id } }),
      prisma.class.delete({ where: { id } }),
    ]);
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 教师管理 =====================

export const getTeachers = async (req, res) => {
  try {
    const list = await prisma.user.findMany({
      where: { role: 'teacher' },
      select: { id: true, username: true, realName: true, createdAt: true, teacherSchools: { include: { school: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取教师列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createTeacher = async (req, res) => {
  try {
    const { username, realName, schoolIds } = req.body;
    if (!username || !realName) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    const teacher = await prisma.user.create({
      data: {
        username, realName, password: bcrypt.hashSync(username, 10), role: 'teacher',
        teacherSchools: schoolIds?.length ? { create: schoolIds.map(sid => ({ schoolId: +sid })) } : undefined,
      },
      select: { id: true, username: true, realName: true, role: true, createdAt: true },
    });
    logger.info({ teacherId: teacher.id }, '教师已创建');
    res.json({ code: 0, message: '创建成功', data: teacher });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '工号已存在', data: null });
    logger.error({ err }, '创建教师失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { realName, schoolIds } = req.body;
    const data = {};
    if (realName !== undefined) data.realName = realName;
    await prisma.user.update({ where: { id: +id, role: 'teacher' }, data });

    // 重建学校关联
    if (schoolIds !== undefined) {
      await prisma.teacherSchool.deleteMany({ where: { teacherId: +id } });
      if (schoolIds.length > 0) {
        await prisma.teacherSchool.createMany({ data: schoolIds.map(sid => ({ teacherId: +id, schoolId: +sid })) });
      }
      // 如果当前 lastSchoolId 不在新列表中，清空
      const user = await prisma.user.findUnique({ where: { id: +id } });
      if (user.lastSchoolId && !schoolIds.includes(user.lastSchoolId)) {
        await prisma.user.update({ where: { id: +id }, data: { lastSchoolId: null } });
      }
    }
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    logger.error({ err }, '更新教师失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 学生管理 =====================

export const getStudents = async (req, res) => {
  try {
    const { classId } = req.query;
    const where = { role: 'student' };
    if (classId) {
      where.studentClasses = { some: { classId: +classId } };
    }
    const list = await prisma.user.findMany({
      where,
      select: {
        id: true, username: true, realName: true, createdAt: true,
        studentClasses: { include: { class: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取学生列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createStudent = async (req, res) => {
  try {
    const { username, realName, classIds } = req.body;
    if (!username || !realName) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    // 从第一个班级获取学校代码
    let fullUsername = username;
    if (classIds?.length && !username.includes('@')) {
      const cls = await prisma.class.findUnique({ where: { id: +classIds[0] }, include: { school: true } });
      if (cls) {
        const code = cls.school.officialCode || `school${cls.school.id}`;
        fullUsername = `${username}@${code}`;
      }
    }

    const student = await prisma.user.create({
      data: {
        username: fullUsername,
        realName,
        password: bcrypt.hashSync(username, 10),
        role: 'student',
        studentClasses: classIds?.length
          ? { create: classIds.map((cid) => ({ classId: +cid })) }
          : undefined,
      },
      select: { id: true, username: true, realName: true, role: true, createdAt: true },
    });
    logger.info({ studentId: student.id }, '学生已创建');
    res.json({ code: 0, message: '创建成功', data: student });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '学号已存在', data: null });
    logger.error({ err }, '创建学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 服务器监控 =====================
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function execAsync(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) return resolve({ error: err.message, stderr });
      resolve({ stdout, stderr });
    });
  });
}

export const getMonitor = async (_req, res) => {
  try {
    const result = { processes: [], logs: '', errors: [], system: {} };

    // 系统信息
    result.system = {
      hostname: os.hostname(),
      platform: os.platform(),
      cpus: os.cpus().length,
      totalMem: (os.totalmem() / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      freeMem: (os.freemem() / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      uptime: Math.floor(os.uptime() / 3600) + 'h ' + Math.floor((os.uptime() % 3600) / 60) + 'm',
      loadAvg: os.loadavg().map(v => v.toFixed(2)),
    };

    // PM2 进程状态
    const pm2 = await execAsync('pm2 jlist');
    if (pm2.stdout) {
      try {
        const list = JSON.parse(pm2.stdout);
        result.processes = list.map(p => ({
          name: p.name,
          status: p.pm2_env?.status || 'unknown',
          cpu: p.monit?.cpu || 0,
          memory: p.monit ? (p.monit.memory / 1024 / 1024).toFixed(1) + ' MB' : 'N/A',
          uptime: p.pm2_env?.pm_uptime ? formatUptime(Date.now() - p.pm2_env.pm_uptime) : 'N/A',
          restarts: p.pm2_env?.restart_time || 0,
          pid: p.pid,
        }));
      } catch { result.errors.push('无法解析 PM2 JSON'); }
    } else {
      result.errors.push('PM2 不可用: ' + (pm2.error || '未知错误'));
    }

    // 读取 PM2 日志（错误 + 输出）
    const logDir = path.join(os.homedir(), '.pm2', 'logs');
    try {
      if (fs.existsSync(logDir)) {
        const allFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
        const logLines = [];
        // 先读错误日志
        const errFiles = allFiles.filter(f => f.includes('error'));
        for (const file of errFiles.slice(0, 3)) {
          try {
            const content = fs.readFileSync(path.join(logDir, file), 'utf-8');
            const lines = content.split('\n').filter(l => l.trim()).slice(-30);
            logLines.push(`--- ${file} (最近 ${lines.length} 行) ---`);
            logLines.push(...lines);
          } catch {}
        }
        // 再读输出日志
        const outFiles = allFiles.filter(f => f.includes('out'));
        for (const file of outFiles.slice(0, 3)) {
          try {
            const content = fs.readFileSync(path.join(logDir, file), 'utf-8');
            const lines = content.split('\n').filter(l => l.trim()).slice(-20);
            logLines.push(`--- ${file} (最近 ${lines.length} 行) ---`);
            logLines.push(...lines);
          } catch {}
        }
        result.logs = logLines.join('\n') || '(日志为空)';
      } else {
        result.logs = '(日志目录不存在)';
      }
    } catch (e) {
      result.errors.push('读取日志失败: ' + e.message);
    }

    res.json({ code: 0, data: result });
  } catch (err) {
    logger.error({ err }, '获取监控信息失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== AI 配置管理 =====================
import { clearConfigCache } from '../services/deepseek.js';

export const getSettings = async (_req, res) => {
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: ['deepseek_api_key', 'deepseek_model', 'deepseek_base_url'] } },
    });
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));

    // API Key 脱敏：只显示前4后4
    let maskedKey = '';
    const rawKey = map.deepseek_api_key || process.env.DEEPSEEK_API_KEY || '';
    if (rawKey.length > 8) {
      maskedKey = rawKey.slice(0, 4) + '****' + rawKey.slice(-4);
    } else if (rawKey) {
      maskedKey = rawKey.slice(0, 2) + '****';
    }

    res.json({
      code: 0,
      data: {
        deepseek_api_key: maskedKey,
        deepseek_model: map.deepseek_model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        deepseek_base_url: map.deepseek_base_url || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        has_key: !!rawKey,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取AI配置失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const { deepseek_api_key, deepseek_model, deepseek_base_url } = req.body;

    const items = [];
    if (deepseek_api_key !== undefined && deepseek_api_key !== '') {
      // 如果不是脱敏值（不含****），说明用户输入了新Key
      if (!deepseek_api_key.includes('****')) {
        items.push({ key: 'deepseek_api_key', value: deepseek_api_key });
      }
    }
    if (deepseek_model) {
      items.push({ key: 'deepseek_model', value: deepseek_model });
    }
    if (deepseek_base_url) {
      items.push({ key: 'deepseek_base_url', value: deepseek_base_url });
    }

    for (const item of items) {
      await prisma.systemConfig.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: item,
      });
    }

    // 清缓存，下次调用立即生效
    clearConfigCache();

    logger.info({ keys: items.map(i => i.key) }, 'AI 配置已更新');
    res.json({ code: 0, message: '配置已保存，1分钟内生效', data: null });
  } catch (err) {
    logger.error({ err }, '保存AI配置失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

function formatUptime(ms) {
  if (ms < 60000) return Math.floor(ms / 1000) + 's';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
  return Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
}
