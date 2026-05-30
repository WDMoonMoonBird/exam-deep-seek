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

async function main() {
  console.log('========================================');
  console.log('  考试系统 - 服务器部署脚本');
  console.log('========================================\n');

  // 1. 数据库表结构（db push 直接同步 schema，无需迁移文件）
  console.log('[1/3] 创建数据库表结构...');
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

    // 先清空
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
