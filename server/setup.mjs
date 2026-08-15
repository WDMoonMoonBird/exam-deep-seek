/**
 * 服务器一键部署脚本
 * 用法：node setup.mjs
 *
 * 功能：
 * 1. 创建数据库表结构（Prisma migrate）
 * 2. 创建超级管理员账号（admin / ***REDACTED***）
 * 3. 导入教育部全国高校数据（从 XLS 文件）
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

/**
 * 从数据库连接串中解析出「库名」（URL pathname，去掉前导斜杠与 query）。
 *
 * 必须只取库名参与安全判定：若对整条连接串做子串匹配，密码或主机名里
 * 恰好含 'test'（如 password=Test@2024、host=test-db.internal）就会让指向
 * 生产库的清库脚本被放行——这正是护栏要防的事故类型。
 *
 * 解析失败（空值/非法 URL/密码含裸 '@' 等）一律返回空串，
 * 由调用方按 fail-closed 处理（拒绝执行），绝不因解析不出而放行。
 *
 * @param {string} url 原始连接串
 * @returns {string} 库名；无法解析时为空串
 */
function pickDbName(url) {
  try {
    return decodeURIComponent(new URL(String(url)).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

/**
 * 破坏性操作前置护栏：只允许对「测试库」执行清空/结构重建。
 *
 * 判定规则：DATABASE_URL 解析出的【库名】必须包含子串 'test'（大小写不敏感）。
 * 不满足则打印醒目警告并以退出码 1 中止进程，绝不继续往下执行。
 * 库名解析不出时同样拒绝（fail-closed）。
 *
 * 背景：本脚本含 `prisma db push --accept-data-loss` 与整表 deleteMany()，
 * 一旦误指向生产/开发主库会造成不可逆数据损失（参见 2026-08-03 数据删除事故）。
 *
 * @returns {void}
 */
function assertSafeToWipe() {
  const url = process.env.DATABASE_URL || '';
  const dbName = pickDbName(url);
  if (!/test/i.test(dbName)) {
    console.error('');
    console.error('==================================================');
    console.error('⛔ 拒绝执行：DATABASE_URL 库名不含 \'test\'，疑似生产/重要库，已中止');
    console.error('==================================================');
    console.error('   本脚本包含破坏性操作：');
    console.error('     - prisma db push --accept-data-loss（可能删列/删表）');
    console.error('     - teacherSchool / school 整表 deleteMany()');
    console.error('   仅允许在【库名】含 "test" 的数据源上运行');
    console.error('   （只认库名：密码/主机名里含 "test" 不算数）。');
    console.error(`   当前 DATABASE_URL: ${url ? maskDbUrl(url) : '(未设置)'}`);
    console.error(`   解析到的库名: ${dbName || '(无法解析)'}`);
    console.error('   如需初始化正式库，请人工确认后手动执行对应 SQL/命令。');
    console.error('');
    process.exit(1);
  }
}

/**
 * 打码数据库连接串中的密码，避免凭据出现在日志/终端输出中。
 *
 * @param {string} url 原始连接串
 * @returns {string} 已打码的连接串
 */
function maskDbUrl(url) {
  return String(url).replace(/(:\/\/[^:/?#]+):[^@]*@/, '$1:***@');
}

async function main() {
  // 护栏：任何破坏性行为之前先校验数据源安全
  assertSafeToWipe();

  console.log('========================================');
  console.log('  考试系统 - 服务器部署脚本');
  console.log('========================================\n');

  // 1. 数据库表结构（db push 直接同步 schema，无需迁移文件）
  console.log('[1/3] 创建数据库表结构...');
  assertSafeToWipe();
  execSync('npx prisma db push --accept-data-loss', { cwd: __dirname, stdio: 'inherit' });
  execSync('npx prisma generate', { cwd: __dirname, stdio: 'inherit' });
  console.log('  √ 表结构创建完成\n');

  // 2. 超级管理员
  console.log('[2/3] 创建超级管理员...');
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { realName: '超级管理员' },
    create: { username: 'admin', password: '***REDACTED***', realName: '超级管理员', role: 'super_admin' },
  });
  console.log(`  √ 超级管理员: admin / ***REDACTED*** (ID: ${admin.id})\n`);

  // 3. 导入高校数据
  console.log('[3/3] 导入全国高校数据...');
  const xlsPath = join(__dirname, '..', 'W020240621412769813275.xls');
  if (!existsSync(xlsPath)) {
    console.log('  ! XLS 文件未找到，跳过高校导入');
    console.log(`  预期路径: ${xlsPath}`);
  } else {
    const wb = XLSX.readFile(xlsPath);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

    // 先清空（整表 deleteMany，破坏性，二次校验数据源）
    assertSafeToWipe();
    await prisma.teacherSchool.deleteMany();
    await prisma.school.deleteMany();

    let province = '', count = 0;
    for (let i = 3; i < data.length; i++) {
      const row = data[i];
      if (!row?.length) continue;
      if (isNaN(row[0])) {
        const m = row[0]?.match(/^(.+?)（\d+所）/);
        if (m) province = m[1];
        continue;
      }
      const name = row[1], code = String(row[2]), city = row[4], level = row[5];
      if (!name || !code || code === 'undefined') continue;
      try {
        await prisma.school.create({
          data: { name, officialCode: code, province, city: city || null, level: level || null },
        });
        count++;
      } catch { /* skip duplicates */ }
    }
    console.log(`  √ 已导入 ${count} 所高校\n`);
  }

  console.log('========================================');
  console.log('  部署完成！');
  console.log('  超级管理员: admin / ***REDACTED***');
  console.log('  后端启动: npm start (端口 3000)');
  console.log('========================================');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('部署失败:', err);
  process.exit(1);
});
