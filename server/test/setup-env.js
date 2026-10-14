/**
 * server/test/setup-env.js —— **必须最先执行**的测试环境前置（setupFiles[0]）
 *
 * 为什么必须独立成文件并且排在 test/setup.js 之前：
 *   `src/utils/prisma.js` 在**模块求值时**就用 DATABASE_URL 构造 PrismaClient，
 *   而 setupFiles 是 import 提升的 —— 写在 setup.js 里的赋值语句对它太晚了。
 *
 * 这里做两件事：
 *   1) 连接池上限收敛：jest 每个测试文件都有独立模块注册表 ⇒ 每个文件都会 new 一个
 *      PrismaClient，默认池 = CPU×2+1；157 个套件累计会打穿 MySQL max_connections(151)，
 *      表现为**后半程整片「套件红但 0 例失败」**：`Too many connections`。
 *   2) INTERNAL_SECRET 测试兜底（C2 修复后 app.js 缺失即拒启；仅未提供时填充）。
 */
process.env.PORT = process.env.PORT || '0';

if (!process.env.INTERNAL_SECRET) {
  process.env.INTERNAL_SECRET = 'test-only-internal-secret';
}

// 连接池收敛（幂等；显式配置优先，绝不覆盖调用方给的 connection_limit）
const url = process.env.DATABASE_URL;
if (url && !/[?&]connection_limit=/.test(url)) {
  process.env.DATABASE_URL = url + (url.includes('?') ? '&' : '?') + 'connection_limit=3';
}
