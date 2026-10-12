# R2-C1c 复核（契约修正后：六条 verify 全部可执行且通过）

## 结论摘要（10 行）
1. **verdict = pass**：修正后的六条 verify **全部 rc=0**，无通过性争议；t31 的两条契约层 finding（F-R2C1B-1/B-2）已被新契约消除。
2. 六条实测：**①** unit(排除三重度套件) **42 套件/638 例** + contract **3 套件/50 例** rc=0；**②** fact-extractor **1/17** rc=0；**③** rule-executor **1/61** rc=0；**④** rule-mutator **1/21** rc=0；**⑤** integration **34/354** rc=0；**⑥** `db-fingerprint.js` **FINGERPRINT_OK** rc=0。
3. 每条 verify 都自带 `db_ok=/exam_system_test` 硬断言与 `check-layers`（118 文件 / **0 违规**）⇒ 命令自校验、可粘贴、可直接复算。
4. **cwd 无关性【实测通过】**：同一段（内含 `cd "$(git rev-parse --show-toplevel)/server"`）从**仓库根**与从 **server/** 各跑一次 fact-extractor 段 ⇒ 均 **rc=0 / 17 例通过** ⇒ **F-R2C1B-2 已修**（不再有两处 `cd server` 断链）。
5. **F-R2C1-1 仍关闭（重跑）**：假生产 URL 与真实生产 URL 均 **rc=2** `RESULT=REFUSE_PROD_DB reason=allow_db_required:exam_system`；t31 的 TCP 连接探针证据（**accepted=0**，阴性对照 accepted=1）继续适用。
6. **dry-run 三态（重跑）**：① 测试库 ⇒ **rc=3** `PRECONDITION_MIGRATION_NOT_APPLIED`；② 生产 URL ⇒ **rc=2**；③ 守卫放行 ⇒ **rc=1**（连接后失败）——三态分明、无需写入即可判定。
7. **F-R2C1-2 仍关闭**：本次 verify ① 实测 contract = **3 套件/50 例**，与记录权威值一致；**O-1 判断：队长的一行级更正已足够**（原 8/86 行保留但就地标注「此口径为超集」+ 给出权威值 3/50 并指向 R2-B1b §2）。
8. **F-R2C1-3 仍关闭**：两条假信号（缺 NODE_OPTIONS⇒47/47 parse 失败；重度套件同进程⇒~22 例 tree-sitter 假失败）已被新契约规避（NODE_OPTIONS + 分跑）——六条全绿即为反证。
9. **回归通过**：迁移未执行（两库 aq 列=3、snapshot 列=0、`_prisma_migrations`=2、表数 22）；**生产库零写入**（08:32 / 08:46 / 08:49 三时点独立只读指纹逐位一致，且第 ⑥ 条 B 脚本前后 FINGERPRINT_OK）；W4/W5 结论不变（工作树仅 t30 的 `rollback-snapshots.js` + `w9` 测试）；被验路径**开=收指纹** `253 文件 / 0ed8b6e5…`。
10. 证据外置 `docs/dsh/evidence/agent-c/69–73`；本报告 ≤200 行 / ≤20KB。

## 1 六条 verify 逐条记录（命令与输出）
| # | 命令要点 | 结果 |
|---|---|---|
| ① | `test/unit --testPathIgnorePatterns="(fact-extractor|rule-executor|rule-mutator)" && test/contract` | rc=0；`Test Suites: 42 passed, 42 total / Tests: 638 passed` + `3 passed, 3 total / Tests: 50 passed`；`db_ok=/exam_system_test`、check-layers 0 违规 |
| ② | `test/unit/infrastructure/fact-extractor.test.js` | rc=0；`1 passed / 17 passed` |
| ③ | `test/unit/infrastructure/rule-executor.test.js` | rc=0；`1 passed / 61 passed` |
| ④ | `test/unit/infrastructure/rule-mutator.test.js` | rc=0；`1 passed / 21 passed` |
| ⑤ | `test/integration` | rc=0；`34 passed / 354 passed` |
| ⑥ | `node "$(git rev-parse --show-toplevel)/server/prisma/scripts/db-fingerprint.js"` | rc=0；`FINGERPRINT_OK`；`TABLE_COUNT=22`；两库 `assignment_questions columns=3`；`MIGRATION …init ok` + `…soft_delete ok` |
- 说明：六条均为**独立命令**（各自 setup DB 守卫 + check-layers），逐条 rc 由 shell 捕获；本轮无任何一条需要重试或调整参数。

## 2 cwd 无关性（对 F-R2C1B-2 的实测）
```
同一段（fact-extractor）：
  从仓库根   bash /tmp/t32/block-fact.sh  ⇒ rc=0，Test Suites: 1 passed / Tests: 17 passed
  从 server/ bash /tmp/t32/block-fact.sh  ⇒ rc=0，Test Suites: 1 passed / Tests: 17 passed
```
段首即 `cd "$(git rev-parse --show-toplevel)/server"`，因此与调用者 cwd 无关 ⇒ t31 的 F-R2C1B-2（整串两处 `cd server` 断链）已消除。
（附带说明：本任务中我一次初步 cwd 试跑出现 rc=2，经查是我自建命令的 shell 嵌套引号被破坏——`bash: -c: unexpected EOF while looking for matching )`——与契约无关；改用脚本文件后两次均 rc=0。）

## 3 三条原 finding 仍为关闭（含本轮重跑证据）
| finding | t32 重跑/复述证据 | 状态 |
|---|---|---|
| F-R2C1-1（守卫前置，回滚 CLI） | 假生产 URL ⇒ rc=2、真实生产 URL ⇒ rc=2（`allow_db_required:exam_system`）；t31 独立 TCP 连接探针证据（监听 127.0.0.1:19399，守卫路径 **accepted=0**；阴性对照 accepted=1 证明探针有效）；读码：`assertDbAllowed` 在 `new PrismaClient` 之前 | 关闭 |
| F-R2C1-1（缺列路径） | 测试库 dry-run ⇒ rc=3 `PRECONDITION_MIGRATION_NOT_APPLIED reason=snapshot_columns_missing` | 关闭 |
| F-R2C1-2（contract 数字） | 本次 verify ① 实测 **3 套件/50 例**；记录权威值一致（见 §5） | 关闭 |
| F-R2C1-3（假信号固化） | 新契约下六条全绿即反证；两条假信号的成因与规避已写入 R2-B1b 记录 §3，且本轮按该口径执行 | 关闭 |

## 4 回归
| 项 | 证据 |
|---|---|
| 迁移未执行 | 两库 `assignment_questions` 列 = `assignment_id,question_id,sort_order`、`snapshot` 列 = 0、`_prisma_migrations` = 2、表数 22（与 t25/t27/t31 一致） |
| 生产库零写入 | 三时点独立只读指纹（t31 08:32 跑前、t31 08:46 跑后、t32 08:49 跑中）**逐位一致**；第 ⑥ 条（本轮测试之后）`FINGERPRINT_OK` 且数值同上 ⇒ 差异为空 |
| W4/W5 不变 | 工作树仅 `server/prisma/scripts/rollback-snapshots.js`（M）+ `server/test/unit/w9-rollback-cli.test.js`（新）⇒ `config.js`（`getDshGradingConcurrency`）与 `dshGraderRunner.js`（`buildGraderEnv`）未被触碰，t27 的 W4/W5 结论继续有效 |
| 被验路径指纹 | 开工 = 收尾 = **253 文件 / merged `0ed8b6e575d514329f059229669e88f494b980aa1fe31cd4e2e21129213bf19b`（含明细一致，变化清单为空）** |

## 5 O-1 判断（R2-B1 记录 contract 数字）
- 现状（`docs/dsh/R2-B1-实施记录.md`）：第 105 行原数字保留，但**就地追加** `← ★此口径为超集（见下方更正）；权威值 = 3 套件 / 50 例`；第 108 行起给出更正说明（`--testPathPatterns=contract` 为路径子串匹配，多命中 test/integration 下 5 个含 "contract" 的套件），并指向 `R2-B1b-修复记录.md` §2 为权威。
- **判断：足够**。理由：①错值不再冒充权威（有就地标注 + 权威值）；②成因与替换口径完整；③历史表格保留可追溯性，且同一表格的 unit 数字（41/631）也是历史快照（现为 42/638，w9 新增），保留原值反而更忠实。建议（可选、非阻断）：在该表下补一行「本表为 2026-10-12 快照，新数值以 R2-B1b §2 与后续记录为准」。

## 6 未核验与纪律
- 未核验（与 t31 相同）：列齐之后的真库 `rollback --apply`、迁移的实际执行（禁令内不执行，留授权窗口）；`--submissions` 无关，本轮不涉及 DSH 装置。
- 纪律：未改 `server/**`、`tests/`、`client/dist`；未跑禁令清单（3 个无护栏 `.mjs`、`prisma migrate dev/reset/db push/deploy`、e2e）；DB 仅只读 SELECT + LIMIT（临时 `my.cnf` chmod 600、用后即删，只打印聚合值）；未占 :5173/:3000/:19387；未写 `~/.dsh`。
