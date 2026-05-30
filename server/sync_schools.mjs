/**
 * 教育部高校数据同步脚本
 * 用法：node sync_schools.mjs <xls文件路径>
 * 例如：node sync_schools.mjs ../W020240621412769813275.xls
 *
 * 功能：读取教育部 XLS 文件，更新 schools 表（新增的添加，已有的按院校代码更新名称/省份/城市/层次）
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import { existsSync } from 'fs';

const prisma = new PrismaClient();

const filePath = process.argv[2];
if (!filePath || !existsSync(filePath)) {
  console.error('请提供有效的 XLS 文件路径');
  console.error('用法: node sync_schools.mjs <教育部XLS文件路径>');
  process.exit(1);
}

const wb = XLSX.readFile(filePath);
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

let currentProvince = '';
let added = 0, updated = 0;

for (let i = 3; i < data.length; i++) {
  const row = data[i];
  if (!row || !row.length) continue;

  // 省份标题行
  if (isNaN(row[0])) {
    const m = row[0]?.match(/^(.+?)（\d+所）/);
    if (m) currentProvince = m[1];
    continue;
  }

  const name = row[1];
  const code = String(row[2]);
  const city = row[4] || null;
  const level = row[5] || null;

  if (!name || !code || code === 'undefined') continue;

  const existing = await prisma.school.findUnique({ where: { officialCode: code } });
  if (existing) {
    await prisma.school.update({
      where: { officialCode: code },
      data: { name, province: currentProvince, city, level },
    });
    updated++;
  } else {
    await prisma.school.create({
      data: { name, officialCode: code, province: currentProvince, city, level },
    });
    added++;
  }
}

console.log(`同步完成：新增 ${added} 所，更新 ${updated} 所`);
await prisma.$disconnect();
