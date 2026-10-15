import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
// ★H6（W2-P2c）：一次性初始口令的**唯一生成器**（随机 + 去混淆字符集；调用方只回显一次、绝不落日志）
import { generateInitialPassword } from '../infrastructure/security/initial-password.js';

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
      where: { role: 'teacher', deletedAt: null },
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

    // ★H6（W2-P2c）：初始口令 = **一次性随机口令**（不再等于工号 ⇒ 消除可猜解初始口令）；与 mustChangePassword 成对。
    const initialPassword = generateInitialPassword();
    const teacher = await prisma.user.create({
      data: {
        username, realName, password: bcrypt.hashSync(initialPassword, 10), role: 'teacher',
        passwordChangedAt: new Date(), // ★R2-B67：设密路径④——建号初始口令
        mustChangePassword: true,      // ★H6：首登强制改密（改密成功即清零）
        teacherSchools: schoolIds?.length ? { create: schoolIds.map(sid => ({ schoolId: +sid })) } : undefined,
      },
      select: { id: true, username: true, realName: true, role: true, createdAt: true },
    });
    logger.info({ teacherId: teacher.id }, '教师已创建');   // ★H6：日志只记 id，**绝不记 initialPassword**
    // ★H6：口令只在本响应**回显一次** —— message 供各端既有提示直接展示，data.initialPassword 供程序消费
    res.json({ code: 0, message: `创建成功，初始口令：${initialPassword}（首次登录须修改）`, data: { ...teacher, initialPassword } });
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

export const resetTeacherPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const teacher = await prisma.user.findFirst({ where: { id: +id, role: 'teacher' } });
    if (!teacher) return res.status(404).json({ code: 1004, message: '教师不存在', data: null });

    // ★H6（W2-P2c）：重置口令 = 一次性随机口令（不再等于工号）+ 置强制改密标志；与 password_changed_at 同处落库
    const initialPassword = generateInitialPassword();
    const newPassword = bcrypt.hashSync(initialPassword, 10);
    // ★R2-B67：设密路径②——管理员重置教师密码
    await prisma.user.update({ where: { id: +id }, data: { password: newPassword, passwordChangedAt: new Date(), mustChangePassword: true } });
    logger.info({ teacherId: id }, '教师密码已重置');   // ★H6：日志不落 initialPassword
    res.json({ code: 0, message: `密码已重置，临时口令：${initialPassword}（首次登录须修改）`, data: { initialPassword } });
  } catch (err) {
    logger.error({ err }, '重置教师密码失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const target = await prisma.user.findUnique({ where: { id: +id } });
    if (!target || target.role !== 'teacher' || target.deletedAt) {
      return res.status(404).json({ code: 1004, message: '教师不存在', data: null });
    }
    if (target.id === req.user.id) {
      return res.status(400).json({ code: 1001, message: '不能删除当前登录账号', data: null });
    }
    // 软删除：保留历史数据（题目/作业/成绩/班级关联可追溯），账号立即不可登录
    await prisma.user.update({ where: { id: +id }, data: { deletedAt: new Date() } });
    logger.info({ teacherId: id }, '教师已删除（软删除）');
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除教师失败');
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

    // ★H6（W2-P2c）：初始口令 = **一次性随机口令**（不再等于学号）+ 首登强制改密
    const initialPassword = generateInitialPassword();
    const student = await prisma.user.create({
      data: {
        username: fullUsername,
        realName,
        password: bcrypt.hashSync(initialPassword, 10),
        passwordChangedAt: new Date(), // ★R2-B67：设密路径④——建号初始口令
        mustChangePassword: true,      // ★H6：首登强制改密（改密成功即清零）
        role: 'student',
        studentClasses: classIds?.length
          ? { create: classIds.map((cid) => ({ classId: +cid })) }
          : undefined,
      },
      select: { id: true, username: true, realName: true, role: true, createdAt: true },
    });
    logger.info({ studentId: student.id }, '学生已创建');   // ★H6：日志不落 initialPassword
    res.json({ code: 0, message: `创建成功，初始口令：${initialPassword}（首次登录须修改）`, data: { ...student, initialPassword } });
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
        // ★L2（W2-P2b）：**日志脱敏 + 体积上限** —— 原实现把 pm2 日志尾部原样回给前端：
        //   ① 日志里可能带 token / 口令 / 手机号（学生与教师的敏感数据）⇒ 必须脱敏；
        //   ② 单文件无上限读取 + 无总量上限 ⇒ 内存/响应体积与侦察面风险。
        //   实现刻意**不用正则字面量**（避免转义歧义），全部走字符串操作，便于逐条复核。
        const SENSITIVE_KEYS = ['token', 'password', 'passwd', 'pwd', 'authorization', 'secret', 'apikey', 'api_key'];
        const MAX_LOG_BYTES = 256 * 1024;   // 单文件最多读尾部 256KB
        const MAX_TOTAL_LINES = 200;        // 响应内日志总行数上限
        const APOS = String.fromCharCode(39);
        function redactLogLine(line) {
          let s = String(line == null ? '' : line);
          const lower = s.toLowerCase();
          for (const k of SENSITIVE_KEYS) {
            const idx = lower.indexOf(k);
            if (idx === -1) continue;
            let i = idx + k.length;
            while (i < s.length && (s[i] === '"' || s[i] === APOS || s[i] === ' ' || s[i] === ':' || s[i] === '=')) i += 1;
            let j = i;
            while (j < s.length && s[j] !== ' ' && s[j] !== '"' && s[j] !== APOS && s[j] !== ',' && s[j] !== '}') j += 1;
            if (j > i) s = s.slice(0, i) + '<redacted>' + s.slice(j);
          }
          const out = [];
          let buf = '';
          const flush = () => {
            if (buf.length === 11 && buf[0] === '1') out.push(buf.slice(0, 3) + '****' + buf.slice(7));
            else out.push(buf);
            buf = '';
          };
          for (const ch of s) {
            if (ch >= '0' && ch <= '9') buf += ch;
            else { flush(); out.push(ch); }
          }
          flush();
          return out.join('');
        }
        const readTail = (file, maxLines) => {
          const buf = fs.readFileSync(path.join(logDir, file));
          const slice = buf.length > MAX_LOG_BYTES ? buf.slice(buf.length - MAX_LOG_BYTES) : buf;
          return String(slice).split('\n').filter((l) => l.trim()).slice(-maxLines).map(redactLogLine);
        };
        // 先读错误日志
        const errFiles = allFiles.filter(f => f.includes('error'));
        for (const file of errFiles.slice(0, 3)) {
          try {
            const lines = readTail(file, 30);
            logLines.push('--- ' + file + ' (最近 ' + lines.length + ' 行，已脱敏) ---');
            logLines.push(...lines);
          } catch {}
        }
        // 再读输出日志
        const outFiles = allFiles.filter(f => f.includes('out'));
        for (const file of outFiles.slice(0, 3)) {
          try {
            const lines = readTail(file, 20);
            logLines.push('--- ' + file + ' (最近 ' + lines.length + ' 行，已脱敏) ---');
            logLines.push(...lines);
          } catch {}
        }
        if (logLines.length > MAX_TOTAL_LINES) {
          result.logs = logLines.slice(0, MAX_TOTAL_LINES).join('\n') + '\n…（已按体积上限截断）';
        } else {
          result.logs = logLines.join('\n') || '(日志为空)';
        }
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
import { clearConfigCache } from '../infrastructure/ai/deepseek/index.js';
// ★R2-B36：价目表（system_configs.llm_prices）——官方默认值 + 高峰/空闲两档，管理员可读写（本文件已挂在 /api/admin/settings 鉴权之后）
import { loadLlmPrices, saveLlmPrices } from '../infrastructure/dsh/usage/dshRunUsageStore.js';

export const getSettings = async (_req, res) => {
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: ['deepseek_api_key', 'deepseek_model', 'deepseek_base_url', 'ai_concurrency', 'dsh_grading_concurrency'] } },
    });
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));

    // ★I1（W2-P2b）：**密钥不回显** —— 原实现回显「前 4 + **** + 后 4」（首尾字符同样可用于形态确认/口令猜测），
    //   且短密钥还会退化到「前 2 + ****」。口径：**只回布尔**「已配置 / 未配置」。
    const rawKey = map.deepseek_api_key || process.env.DEEPSEEK_API_KEY || '';
    const apiKeyConfigured = !!rawKey;

    const cpus = os.cpus().length;
    const totalMemGB = +(os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    // 推荐并发：核数×8，最小1，最大128
    const recommended = Math.max(1, Math.min(cpus * 8, 128));

    // ★R2-B36：价目表（有效表 = 官网默认值 + DB 覆盖；缺省/坏配置都返回可用表）
    const prices = await loadLlmPrices({ prisma });

    res.json({
      code: 0,
      data: {
        deepseek_api_key_configured: apiKeyConfigured,   // ★I1：不再回显密钥（含掩码形态）；前端如需展示请读该布尔
        llm_prices: prices.table,
        llm_prices_source: prices.source,
        llm_prices_invalid_reason: prices.invalid_reason || null,
        deepseek_model: map.deepseek_model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        deepseek_base_url: map.deepseek_base_url || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        ai_concurrency: +map.ai_concurrency || 16,
        dsh_grading_concurrency: +map.dsh_grading_concurrency || 1,   // W4：DSH 作业级并发（单位=会话数，默认 1）
        has_key: !!rawKey,
        cpus,
        totalMemGB,
        recommended_concurrency: recommended,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取AI配置失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const { deepseek_api_key, deepseek_model, deepseek_base_url, ai_concurrency, dsh_grading_concurrency, llm_prices } = req.body;

    // ★R2-B36：价目表写接口（校验失败**不改库**并返回可判定 reason）
    if (llm_prices !== undefined) {
      let payload = llm_prices;
      if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { return res.status(400).json({ code: 1010, message: 'llm_prices 不是合法 JSON', data: { reason: 'not_json' } }); } }
      const saved = await saveLlmPrices({ prisma, prices: payload });
      if (!saved.ok) {
        logger.warn({ reason: saved.reason }, 'R2-B36：价目表校验失败（未写库）');
        return res.status(400).json({ code: 1010, message: '价目表格式不合法（未保存）', data: { reason: saved.reason } });
      }
      logger.info({ price_version: saved.saved && saved.saved.effective_from }, 'R2-B36：价目表已更新');
      return res.json({ code: 0, message: '价目表已保存，即时生效', data: { llm_prices: saved.saved } });
    }

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
      // ★M1（W2-P2）：**落库前校验** —— 原实现把任意 URL 直接写库 ⇒ 后续 testConnection/评分链路可被指向内网或云元数据。
      const chk = assertSafeAiBaseUrl(deepseek_base_url);
      if (!chk.ok) return res.status(400).json({ code: 1001, message: "AI Base URL 不合法：" + chk.reason, data: null });
      items.push({ key: "deepseek_base_url", value: chk.url });
    }
    if (ai_concurrency !== undefined) {
      const c = +ai_concurrency;
      if ([1,8,16,32,64,128].includes(c)) {
        items.push({ key: 'ai_concurrency', value: String(c) });
      }
    }

    // W4（R2-B1）：DSH 作业级并发键（单位=会话数，默认 1；与 ai_concurrency 不是同一个闸）
    if (dsh_grading_concurrency !== undefined) {
      const c = +dsh_grading_concurrency;
      if ([1,2,3,4,8].includes(c)) {
        items.push({ key: 'dsh_grading_concurrency', value: String(c) });
      }
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

/**
 * ★M1（W2-P2）：AI Base URL **白名单校验** —— 拒绝非 https、私有/环回/链路本地/**云元数据**地址。
 *   命中条件：域名 ∈ AI_ALLOWED_HOSTS（逗号分隔，缺省仅 api.deepseek.com）；IP/内网主机名一律拒。
 *   与“落库前校验 + 使用前校验”双点配合（见 saveAIConfig / testConnection）。
 * @returns {{ok: true, url: string} | {ok: false, reason: string}}
 */
function assertSafeAiBaseUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return { ok: false, reason: "URL 格式非法" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "必须使用 https" };
  const host = String(u.hostname || "").toLowerCase();
  if (!host) return { ok: false, reason: "缺少主机名" };
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isIpv6 = host.includes(":");
  if (isIpv4) {
    if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.") || host === "203.0.113.10" || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return { ok: false, reason: "禁止内网/环回/元数据地址" };
    }
  }
  if (isIpv6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))) {
    return { ok: false, reason: "禁止内网/环回地址" };
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return { ok: false, reason: "禁止内网主机名" };
  }
  const allow = String(process.env.AI_ALLOWED_HOSTS || "api.deepseek.com").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allow.includes(host)) return { ok: false, reason: "域名不在白名单" };
  return { ok: true, url: u.origin };
}

export const testConnection = async (_req, res) => {
  const start = Date.now();
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: ['deepseek_api_key', 'deepseek_model', 'deepseek_base_url', 'ai_concurrency', 'dsh_grading_concurrency'] } },
    });
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const apiKey = map.deepseek_api_key || process.env.DEEPSEEK_API_KEY;
    const baseUrl = (map.deepseek_base_url || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = map.deepseek_model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

    if (!apiKey) {
      return res.json({ code: 0, data: { ok: false, error: "未配置 API Key", latency: null } });
    }

    // ★M1（W2-P2）：**使用前再校验一次**（存量库值可能早于本次校验存在；此处拒绝即不发出请求）。
    const urlCheck = assertSafeAiBaseUrl(baseUrl);
    if (!urlCheck.ok) {
      return res.json({ code: 0, data: { ok: false, latency: null, error: "AI Base URL 未通过安全校验" } });
    }

    const resp = await fetch(`${urlCheck.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const latency = Date.now() - start;
    if (resp.ok) {
      res.json({ code: 0, data: { ok: true, latency: `${latency}ms`, error: null } });
    } else {
      const text = await resp.text().catch(() => '');
      // ★M1（W2-P2）：**错误回显改固定文案** —— 原实现把上游响应体前 200 字符回给前端（可探测内网服务/泄露上游细节）。
      logger.warn({ status: resp.status, snippet: String(text).slice(0, 120) }, "AI 连通性测试失败（细节仅日志）");
      res.json({ code: 0, data: { ok: false, latency: `${latency}ms`, error: `上游返回 HTTP ${resp.status}` } });
    }
  } catch (err) {
    const latency = Date.now() - start;
    // ★M1（W2-P2，队长复核补漏）：**catch 分支同样不得到回显 err.message** —— 该端点的 baseUrl 来自库值，
    //   而 assertSafeAiBaseUrl 拒绝内网/非白名单地址时抛出的消息里会带**主机名/URL** ⇒ 等于把 200-char snippet
    //   的回显面换成异常消息。⇒ 细节只进日志；latency 保留（排障有用且不敏感）。
    logger.warn({ err: err && err.message, baseUrlChecked: true }, "AI 连通性测试异常（细节仅日志）");
    res.json({ code: 0, data: { ok: false, latency: latency ? `${latency}ms` : "—", error: "连接失败（细节见服务端日志）" } });
  }
};

function formatUptime(ms) {
  if (ms < 60000) return Math.floor(ms / 1000) + 's';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
  return Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
}
