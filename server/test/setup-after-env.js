/**
 * server/test/setup-after-env.js —— 每个测试文件跑完就**释放本文件的 Prisma 连接**
 *
 * 背景（实测）：--runInBand 下 jest 仍为**每个测试文件**建立独立模块注册表 ⇒ 每个文件
 * 各 new 一个 PrismaClient 且从不 disconnect，连接一路累积到 MySQL max_connections(151)，
 * 全量跑时后半程 49 个套件集体「failed to run / Too many connections」（0 例失败）。
 *
 * 口径：只断连接，不改断言；Prisma 在后续查询时会自动重连 ⇒ 对用例语义无影响。
 */
import prisma from '../src/utils/prisma.js';

afterAll(async () => {
  try {
    await prisma.$disconnect();
  } catch {
    /* 关连接失败不应把套件判红（真缺陷仍会由断言暴露） */
  }
});
