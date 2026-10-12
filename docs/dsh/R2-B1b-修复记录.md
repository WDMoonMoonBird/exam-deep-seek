# R2-B1b 修复记录（t30：回滚守卫前置 + 记录数字修正 + 假信号固化）

## 摘要（≤10 行）
1. **F-R2C1-1 已修**：`rollback-snapshots.js` 的库守卫**前置到建连接之前**并导出（`assertDbAllowed`）；最小复现从「rc=1 ROLLBACK_ERROR」变为 **rc=2 `RESULT=REFUSE_PROD_DB`，且一个连接都不建立**。
2. 快照列缺失时不再抛未捕获异常：改为 `PRECONDITION_MIGRATION_NOT_APPLIED` + **exit 3**（与 backfill 同口径）；dry-run 因此**可验证**。
3. 新增单测 `w9-rollback-cli.test.js`（7 例）覆盖**回滚 CLI 路径**：守卫函数、缺列 exit 3、不可达端口仍 rc=2（证明未建连）、生产库 --apply rc=2。
4. **F-R2C1-2 已更正**：contract 的**实测口径 = 3 套件 / 50 例**（`server/test/contract/`，exit 0）；t26 记录里的 8 套件/86 例是 `--testPathPatterns=contract` 的**超集**（误含 5 个带 contract 字样的其它目录套件）。
5. **F-R2C1-3 已固化**两条假信号（见 §3）：缺 `NODE_OPTIONS=--experimental-vm-modules` ⇒ 47/47 套件 parse 失败（0 例）；重度套件与主组同进程 ⇒ **稳定 22 例** tree-sitter 假失败，各自单跑全绿。
6. 回归（串行）：check-layers 0 违规；unit（排除重度）**42 套件/638 例** exit 0；contract 目录 **3/50** exit 0；重度各自单跑 17/61/21 exit 0；integration **34/354** exit 0。
7. 生产库只读指纹跑前/跑后**逐位不变**（6 表计数 + max_id + max_submitted + 列数 + 迁移状态 + 表数）。
8. 未执行任何迁移；未改既有测试（只新增 w9）；未 npm install/构建；未动 package.json。
9. 交付：本文件 + 修改 `server/prisma/scripts/rollback-snapshots.js` + 新增 `server/test/unit/w9-rollback-cli.test.js`。
10. 未验证项见 §5（迁移执行、列齐后的真库 rollback dry-run）。

## 1 F-R2C1-1：回滚脚本守卫前置（中，必修）
### 1.1 修前（C 的复现）
- 顺序：`new PrismaClient(...)` → `SELECT ... snapshot_origin ...` → 才做白名单判断 ⇒
  - 用生产类 URL 调用会**先连库先查询**，实测 `rc=1 ROLLBACK_ERROR ... Unknown column 'snapshot_origin'`；
  - 快照列缺失时 dry-run 也不可用（未捕获异常 rc=1）⇒ 回滚路径无法验证。
### 1.2 修后（本轮的改动）
| 项 | 修前 | 修后 |
|---|---|---|
| 守卫位置 | 查询之后 | **`new PrismaClient` 之前**（校验不通过直接 return，零连接） |
| 守卫形态 | 内联 if | **导出函数 `assertDbAllowed({dbName, allowDb, mode})`**（可单测） |
| 双确认 | 仅 --apply | **dry-run 与 apply 都要 `--allow-db <目标库名>` 且与 URL 库名一致** |
| 生产库 --apply | 连接后才拒 | **连库前拒**（`db_not_allowed_for_apply:exam_system`，rc=2） |
| 缺列 | 未捕获异常 rc=1 | **`PRECONDITION_MIGRATION_NOT_APPLIED` + exit 3**（先检测 information_schema 列数） |
### 1.3 验收证据（真实输出）
```bash
# ① 最小复现（修后必须不再 rc=1）——任意 URL、不给 --allow-db
cd server && node prisma/scripts/rollback-snapshots.js --dry-run --db-url "mysql://u:p@127.0.0.1:1/exam_system"
RESULT=REFUSE_PROD_DB reason=allow_db_required:exam_system      # 退出码 2（修前为 rc=1 ROLLBACK_ERROR）

# ② 生产库 --apply（连库前拒）
node prisma/scripts/rollback-snapshots.js --apply --db-url "mysql://u:p@127.0.0.1:1/exam_system" --allow-db exam_system
RESULT=REFUSE_PROD_DB reason=db_not_allowed_for_apply:exam_system   # 退出码 2

# ③ 测试库 dry-run（显式 allow-db）：列未落地 ⇒ 明确前置条件失败，退出码 3
node prisma/scripts/rollback-snapshots.js --dry-run --db-url "$DATABASE_URL" --allow-db exam_system_test
MODE=dry-run DB=exam_system_test COLUMNS_APPLIED=no
RESULT=PRECONDITION_MIGRATION_NOT_APPLIED reason=snapshot_columns_missing   # 退出码 3
```
- 「不发生任何连接/查询」的**判定方法**：把 URL 指向不可达端口（`127.0.0.1:1`）。若脚本先连库，必然抛连接错误（rc=1）；实测 rc=2 且 stdout 只有 `RESULT=REFUSE_PROD_DB` ⇒ 证明守卫在连接之前（单测 W9-5）✓。
- 单测（新增，未改既有测试）：`server/test/unit/w9-rollback-cli.test.js` 7 例 —— W9-1 默认 dry-run/未知参数、W9-2 导出守卫的四类拒绝、W9-3 列检测、W9-4 SQL 形状、W9-5 不可达端口 rc=2（未建连）、W9-6 测试库 dry-run rc∈{0,3} 且无 ROLLBACK_ERROR、W9-7 生产库 --apply rc=2。

## 2 F-R2C1-2：contract 数字更正与口径
- **实测口径（本轮复跑，真实输出）**：`npx jest --config test/jest.config.js --runInBand --forceExit test/contract` ⇒
  ```
  Test Suites: 3 passed, 3 total ｜ Tests: 50 passed, 50 total ｜ CONTRACT_DIR_EXIT=0
  ```
  即 `server/test/contract/` 目录 = `extensibility.test.js` / `ports-contract.test.js` / `use-cases-contract.test.js` = **3 套件 / 50 例**。
- **t26 记录里 8 套件/86 例的来源**：当时用的是 `--testPathPatterns=contract`（**按路径子串匹配**），它同时命中 `test/integration/rc-batch-guard-contract.test.js`、`rc-export-objective-contract.test.js`、`rc-project-review-contract.test.js`、`rc-usecase-404-contract.test.js` 等 5 个**名字里带 contract 的其它目录**套件 ⇒ 8 套件/86 例是**超集**，不是 contract 目录口径。
- **更正写法**（应替换 `docs/dsh/R2-B1-实施记录.md` §5 表格第 2 行与 §7 的 contract 行）：
  ```
  | npx jest … test/contract（contract 目录口径） | Test Suites: 3 passed, 3 total ｜ Tests: 50 passed, 50 total ｜ exit 0 |
  # 说明：t26 记录的 8 套件/86 例是 --testPathPatterns=contract 的超集（含 5 个其它目录的 *-contract.test.js），已按 t27 复核改为目录口径 3/50。
  ```
- ★**范围说明（请队长裁定）**：t30 的 inScope 只含 `server/prisma/scripts` 与 `docs/dsh/R2-B1b-修复记录.md`，**不含** `docs/dsh/R2-B1-实施记录.md` ⇒ 本轮把更正写在本文档（含可直接粘贴的替换文本），未直接改那份记录，避免出现未声明的路径改动。若要把更正回填原文，请把该文件加入下一轮 scope（1 分钟即可应用）。

## 3 F-R2C1-3：两条假信号固化（记录 + 命令说明）
### 3.1 缺 NODE_OPTIONS ⇒ 47/47 套件 parse 失败（0 例）
- 现象：不加 `NODE_OPTIONS=--experimental-vm-modules` 时，jest 以 CJS 解析 ESM ⇒ 每个套件 `SyntaxError: Cannot use import statement outside a module`，报告 `Test Suites: 47 failed` 而 `Tests: 0 total`。
- 命令说明（正确形式）：
  ```bash
  cd server
  export NODE_OPTIONS=--experimental-vm-modules
  export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed 's|/exam_system|/exam_system_test|')"
  node -e 'const u=new URL(process.env.DATABASE_URL); if(u.pathname!=="/exam_system_test"){console.error("REFUSE "+u.pathname);process.exit(1)} console.log("db_ok="+u.pathname)'
  node scripts/check-layers.mjs
  npx jest --config test/jest.config.js --runInBand --forceExit --testPathPatterns=unit --testPathIgnorePatterns="(fact-extractor|rule-executor|rule-mutator)"
  npx jest --config test/jest.config.js --runInBand --forceExit test/contract
  # 三个重度套件各自单跑（见 3.2）
  npx jest --config test/jest.config.js --runInBand --forceExit test/unit/infrastructure/{fact-extractor,rule-executor,rule-mutator}.test.js
  npx jest --config test/jest.config.js --runInBand --forceExit test/integration
  ```
### 3.2 重度套件与主组同进程 ⇒ 稳定 22 例 tree-sitter 假失败（各自单跑全绿）
- 复现（本轮真实输出）：`npx jest … test/unit test/contract`（同进程）⇒ **Test Suites: 2 failed, 46 passed, 48 total ｜ Tests: 22 failed, 765 passed, 787 total**，失败集中在 `test/unit/infrastructure/fact-extractor.test.js` 与 `rule-executor.test.js`，报错为 `syntax.js:44 TypeError: Cannot read properties of undefined (reading 'type')`（tree-sitter 在共享进程里的状态问题）。
- 判定：**不是回归**——项目自身 `npm test` 就是把这三个套件排除在主组外、各自单跑；本轮单跑 **fact-extractor 17/17、rule-executor 61/61、rule-mutator 21/21 全绿**。
- 因此：契约 verify 里 `… test/unit test/contract` 这一条**预期 exit 1 且只允许出现这 22 例（2 个重度套件）**；其余任何失败都算回归。

## 4 验证汇总（安全命令、串行独自运行）
| 项 | 真实输出 |
|---|---|
| `node scripts/check-layers.mjs` | 文件 118 个，**违规 0 条**，未分层待迁移 43 个，exit 0 |
| 契约 verify 原文：`npx jest … test/unit test/contract` | **exit 1**，`Test Suites: 2 failed, 46 passed, 48 total`、`Tests: 22 failed, 765 passed, 787 total`（= §3.2 已知假信号，仅 2 个重度套件） |
| 项目口径 unit（排除重度） | `Test Suites: 42 passed, 42 total ｜ Tests: 638 passed, 638 total`，exit 0（含新增 w9） |
| 项目口径 contract 目录 | `Test Suites: 3 passed` / `Tests: 50 passed`，exit 0 |
| 重度各自单跑 | fact-extractor 17/17、rule-executor 61/61、rule-mutator 21/21，exit 0 |
| `npx jest … test/integration` | 一次 33/34（`qa-batch1-independent-review.test.js::R16`，既有顺序/状态 flake）；**复跑 34 套件/354 例全绿 exit 0**，该文件单跑 17/17 |
| 生产库指纹（跑前 / 跑后） | `users=1252/questions=32/assignments=52/assignment_questions=52 columns=3/submissions=1601/system_configs=4` + max_id + max_submitted + 2 迁移 ok + 表数 22 —— **逐位不变** |

## 5 未验证项（单列）
1. **迁移仍未执行**（硬约束）：列齐之后的 `rollback --dry-run` 真库路径（打印 WOULD_NULL）本轮只验到 exit 3 分支；授权窗口内先在测试库应用迁移即可复算。
2. **回滚 --apply 的真实写入**未演练（同样需授权窗口 + 测试库）。
3. **integration 的 R16 flake**：本轮仍复现一次（复跑即绿），未修（不在 write scope，且属既有问题）。
4. **contract 原文记录的回填**：见 §2 范围说明（等队长放行 scope）。
