# R2-C1b 复核（F-R2C1-1/2/3 是否真关闭 · 不采信 B 自测）

## 结论摘要（10 行）
1. **verdict = needs_revision（仅因契约层，非 B 的代码缺陷）**：F-R2C1-1、F-R2C1-2、F-R2C1-3 **全部关闭**（三条均由我自跑复核，最小复现与独立证据齐备），批1 其余结论仍成立；但契约 `Verify` 第 1 段（`jest test/unit test/contract` 同进程）**结构性非 0**（两次实测 rc=1；见 §10 F-R2C1B-1），使「每个 verify 命令都有 passed 记录」这一完成条件无法满足。
2. **F-R2C1-1（守卫前置）关闭**：原最小复现（生产类 URL、无 `--allow-db`）⇒ **rc=2** `RESULT=REFUSE_PROD_DB reason=allow_db_required:exam_system`；**独立证明「未发生连接」**：我自建 TCP 连接探针在同一窗口记录 **accepted=0**（阴性对照：守卫放行的同一 URL ⇒ accepted=1，证明探针有效）；真实生产 URL 同样 rc=2。
3. **缺列路径关闭**：迁移未应用场景 ⇒ **rc=3** `RESULT=PRECONDITION_MIGRATION_NOT_APPLIED reason=snapshot_columns_missing`（dry-run 与 `--apply` 均是），**不再有未捕获异常**。
4. **守卫已导出且被单测覆盖**：`dbNameOf` / `assertDbAllowed` / `detectSnapshotColumns` 导出；`w9-rollback-cli.test.js` **7 例**（含 W9-5「不可达端口 URL 也在建连前 rc=2」、W9-7「生产库 --apply rc=2」），单跑 **7/7 通过**；回滚 dry-run 现已可验证。
5. **F-R2C1-2 关闭**：我自算 contract = **3 套件 / 50 例**（`ls server/test/contract/*.test.js`=3），与记录更正值一致；记录 §2 说明原 8/86 来自 `--testPathPatterns=contract` 超集（多命中 5 个其它目录套件）并给出可粘贴替换文本。
6. **F-R2C1-3 关闭**：两条假信号已固化在记录 §3；我实测复现数字与记录**逐位一致**——缺 `NODE_OPTIONS` ⇒ 47/47 套件 parse 失败/0 例；重度套件与主组同进程 ⇒ **2 failed/46 passed/48 total、22 failed/765 passed/787 total**（仅 `fact-extractor`+`rule-executor`）。
7. **回归全部通过**：两库迁移未执行（aq 列=3、snapshot 列=0、`_prisma_migrations`=2、表数 22）；**生产库零写入**（跑前跑后独立只读指纹逐位不变 `PROD_FINGERPRINT_IDENTICAL`）；W4/W5 结论不变（本次改动面只有 `rollback-snapshots.js` + 新 w9 测试，`config.js`/`dshGraderRunner.js` 未动）。
8. 按项目 npm test 口径分跑：unit(排除重度) **42 套件/638 例全过**、contract **3/50 全过**、integration **34/354 全过**、check-layers **0 违规**、w9 **7/7**。
9. **契约字面命令**（`jest test/unit test/contract` 同进程）实测 rc=1 —— 即已固化的 tree-sitter 假信号（**非回归**），数字与记录 §3.2 一致；规避方式即项目自身 `npm test` 的分跑口径（第 8 行）。
10. 残留（低，非本轮 finding）：`docs/dsh/R2-B1-实施记录.md:105` 仍写 contract=8/86（B 已声明为 F-T30-2、不在 t30 scope）⇒ 建议下一轮把该文件纳入 scope 做纯文本更正。证据外置 `docs/dsh/evidence/agent-c/64–68`。

## 1 方法与「未连接」的独立判据（不采信 B 日志）
- 探针：`docs/dsh/evidence/agent-c/t31-tcp-conn-probe.py`——在本机 `127.0.0.1:19399` 监听，统计窗口内被接受的 TCP 连接数（MySQL 客户端只要发起连接就会被 `accept`）。
- 判据：把 `--db-url` 指向探针端口、库名保持生产名 `exam_system`——若脚本在建连前就拒绝，探针应 **accepted=0**；反之必然 ≥1。
- 同时做**阴性对照**：同一 URL 但让守卫放行（`--dry-run --allow-db exam_system`）⇒ 探针 **accepted=1** 且脚本以 Prisma 连接错误 rc=1 结束 ⇒ 证明探针确实能检出连接。
- 读码旁证：`assertDbAllowed(...)` 在 `new PrismaClient(...)` **之前**（rollback-snapshots.js:82-85），守卫只依赖 `dbNameOf(url)` 的纯字符串解析。

## 2 F-R2C1-1（原最小复现）
| 场景 | 命令 | 结果 |
|---|---|---|
| 原最小复现（生产类 URL，无 allow-db） | `node prisma/scripts/rollback-snapshots.js --dry-run --db-url mysql://u:p@127.0.0.1:19399/exam_system` | **rc=2**、`RESULT=REFUSE_PROD_DB reason=allow_db_required:exam_system`、探针 **accepted=0**（无连接/无查询） |
| 真实生产 URL（只读守卫路径） | `--dry-run --db-url <生产URL>` | **rc=2**、同一 reason（修前为 rc=1 `ROLLBACK_ERROR Unknown column 'snapshot_origin'`） |
| `--apply` 生产库名 | `--apply --allow-db exam_system --db-url <假生产URL>` | **rc=2**、`reason=db_not_allowed_for_apply:exam_system` |
| 阴性对照（守卫放行） | `--dry-run --allow-db exam_system --db-url <假生产URL>` | rc=1（连接后失败）、探针 **accepted=1** ⇒ 探针有效 |

## 3 缺列路径（迁移未应用）
- `node prisma/scripts/rollback-snapshots.js --dry-run --allow-db exam_system_test --db-url <测试库>` ⇒ **rc=3**、`MODE=dry-run DB=exam_system_test COLUMNS_APPLIED=no` + `RESULT=PRECONDITION_MIGRATION_NOT_APPLIED reason=snapshot_columns_missing`。
- `--apply` 同 URL ⇒ **rc=3**、同 reason（修前：未捕获异常 rc=1）。

## 4 守卫导出与单测覆盖（读码 + 实跑）
- 导出：`parseArgs`(25) / `dbNameOf`(38) / `assertDbAllowed`(46) / `buildRollbackSelectSql`(56) / `buildRollbackUpdateSql`(60) / `detectSnapshotColumns`(66)。
- `test/unit/w9-rollback-cli.test.js` 7 例：W9-1 默认 dry-run；W9-2 守卫（无 allow-db/不匹配/生产库 apply）；W9-3 列检测；W9-4 SQL 形状；W9-5 **建连前拒绝（指向不可达端口仍 rc=2）**；W9-6 测试库 dry-run rc∈{0,3}；W9-7 生产库 --apply ⇒ rc=2。
- 实跑：`npx jest … test/unit/w9-rollback-cli.test.js` ⇒ **Test Suites: 1 passed；Tests: 7 passed**（rc=0）。
- dry-run 可验证性：测试库 rc=3（缺列）、生产 URL rc=2 ⇒ 无需任何写入即可目视判定。

## 5 F-R2C1-2（contract 数字）
- 自算：`ls server/test/contract/*.test.js | wc -l` = **3**（`extensibility`/`ports-contract`/`use-cases-contract`）；`npx jest … test/contract` ⇒ **3 passed / 50 passed**（rc=0）。
- 记录：`docs/dsh/R2-B1b-修复记录.md` §2 已写明「实测口径 = 3 套件/50 例」，并解释 t26 的 8/86 来自 `--testPathPatterns=contract` 超集（多命中 5 个其它目录套件）并附替换文本 ⇒ **与新记录一致**。
- 残留：`docs/dsh/R2-B1-实施记录.md:105` 原文仍为 8/86（B 声明 F-T30-2 不在其 scope）——见 §8 观察 O-1。

## 6 F-R2C1-3（两条假信号固化）
- `grep -rn 'NODE_OPTIONS=--experimental-vm-modules' docs/dsh/R2-B1b-修复记录.md` 命中（§3.1）；`grep -n 'tree-sitter' …` 命中（§3.2）。
- 我实测复现（与记录逐位一致）：
  - 缺 `NODE_OPTIONS` ⇒ `Test Suites: 47 failed, 47 total / Tests: 0 total`（parse 失败，0 例执行）；
  - 同进程把重度套件卷入 ⇒ `Test Suites: 2 failed, 46 passed, 48 total / Tests: 22 failed, 765 passed, 787 total`，失败仅 `fact-extractor`/`rule-executor`，报错 `src/infrastructure/rule/syntax.js:44 TypeError: Cannot read properties of undefined (reading 'type')`；三套件各自单跑 17/61/21 全绿。

## 7 回归
| 项 | 结果 |
|---|---|
| 迁移未执行 | 两库 `assignment_questions` 列 = `assignment_id,question_id,sort_order`、`snapshot` 列 = 0、`_prisma_migrations` = 2、表数 22（与 t25/t27 一致，跑前跑后不变） |
| 生产库零写入 | 跑前（08:32）跑后（08:46）独立只读指纹：`users 1252 / questions 32 / assignments 52 / submissions 1601 / aq 52 / system_configs 4`、`max_id 2337/10400`、`max_submitted_at 2026-10-09 16:47:48.791`、列数/迁移/表数不变 ⇒ **差异为空**；B 的 `db-fingerprint.js` 前后一致 |
| W4/W5 结论不变 | 本次工作树仅 `rollback-snapshots.js`（M）与 `w9-rollback-cli.test.js`（新）；`config.js`（含 `getDshGradingConcurrency`）与 `dshGraderRunner.js`（含 `buildGraderEnv`）未被触碰 ⇒ t27 的 W4/W5 结论继续有效 |
| 被验路径指纹 | 开工 = 收尾 = **253 文件 / merged `0ed8b6e575d514329f059229669e88f494b980aa1fe31cd4e2e21129213bf19b`（变化清单为空）** |
| 测试基线 | unit(排除重度) 42/638 全过、contract 3/50 全过、**合并跑（契约命令 + 项目口径 `--testPathIgnorePatterns`）= 45 套件/688 例全过 rc=0**、integration 34/354 全过、check-layers 0 违规；w9 单跑 7/7 |

## 8 观察与未核验
- **O-1（低，非本轮 finding）**：`docs/dsh/R2-B1-实施记录.md:105` 仍写 `contract 8 套件/86 例`；B 已在 t30 声明为 F-T30-2（不在其 scope）。建议队长把该文件加入下一轮 scope，做一次纯文本更正（新记录 §2 已提供替换文本）。
- **O-2（口径）**：`--dry-run --allow-db <库名>` 对生产库名是**显式允许**的（只读 SELECT）；`--apply` 才受白名单（仅 `exam_system_test`）约束。这与 backfill 的口径一致，属设计而非缺陷；如需"生产库 dry-run 也拒绝"，需另立判据。
- **未核验**：列齐之后的真库 `rollback --apply`（需授权窗口，禁令内不执行）；迁移的实际执行。

## 10 契约层 finding（本轮 verdict 的**唯一**阻断项）
**F-R2C1B-1（中，契约/命令口径，非代码缺陷）**
- 现象：契约 `Verify` 第 1 段 `npx jest --config test/jest.config.js --runInBand --forceExit test/unit test/contract` **按字面执行结构性 rc=1**（我两次实测：2 failed/46 passed/48 total 且 22 → 24 failed/765 → 763 passed/787 total；失败恒为 `fact-extractor`+`rule-executor` 的 `syntax.js:44 TypeError` tree-sitter 假信号）。⇒ 任何执行者都无法为"D 段 verify"提供 passed 记录，复核轮必然卡在完成条件上。
- 归因：不是 B 的修复缺陷——B 已在 `docs/dsh/R2-B1b-修复记录.md` §3.2 固化该假信号，项目自身 `package.json:test` 也用**分跑**规避。问题在契约文本仍沿用"同进程跑 unit+contract"的写法（队长此前已因 `NODE_OPTIONS` 缺省 amend 过一次，属同类问题）。
- 最小复现：`cd server && export NODE_OPTIONS=--experimental-vm-modules && export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed 's|/exam_system|/exam_system_test|')" && npx jest --config test/jest.config.js --runInBand --forceExit test/unit test/contract` ⇒ rc=1（2 failed/46 passed）。
- 要求修复（契约/记录文本，不涉代码）：把该段替换为项目口径的分跑形式，例如
  `npx jest --config test/jest.config.js --runInBand --forceExit test/unit --testPathIgnorePatterns="(fact-extractor|rule-executor|rule-mutator)" && npx jest --config test/jest.config.js --runInBand --forceExit test/contract`
  （我实测：45 套件/688 例全过 rc=0）。若坚持单条 jest 调用，则须附加同一 `--testPathIgnorePatterns`。

**F-R2C1B-2（低，契约/命令口径）**
- 现象：把 `Verify` 整串直接粘贴到**一个** shell 里会有两处 `cd server`：第一段已进入 `server/`，第二段的 `cd server` 在 `server/` 内找不到同名目录 ⇒ `&&` 链断开，第二段与第三段（`node server/prisma/scripts/db-fingerprint.js`）都直接失败；我按整串实测 **rc=1**。
- 要求修复：verify 按三段独立命令书写（或第二段去掉重复的 `cd server`、第三段用 `node prisma/scripts/db-fingerprint.js`）。最小复现：把 verify 原文作为单行执行 ⇒ rc=1。

## 9 预算与纪律
- 本报告 ≤200 行/≤20KB，开头 10 行摘要；长证据外置 `docs/dsh/evidence/agent-c/64–68` + 探针脚本 `t31-tcp-conn-probe.py`。
- 未改 `server/**`、`tests/`、`client/dist`；未跑禁令清单命令（3 个无护栏 `.mjs`、`prisma migrate dev/reset/db push/deploy`、e2e）；未占 :5173/:3000/:19387；未写 `~/.dsh`；DB 访问仅只读 SELECT + LIMIT，临时凭据文件 chmod 600 且用后即删。
