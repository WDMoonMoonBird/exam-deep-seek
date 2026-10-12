# R2-B6b 修复记录（apply 路径未转发 --allow-prod + 拒绝退出码二义性）

## 摘要（≤10 行）
1. **F-R2B6-1（高·阻断）已修**：`backfill-snapshots.js` 的 **apply 阶段**第二次 `assertApplyAllowed` 未转发 `allowProd`（取默认 false）⇒ 生产回填在 CLI 层**必然被自己的守卫拒绝**（打印 31 行 ROW 后 `RESULT=REFUSE_PROD_DB reason=allow_prod_required:exam_system`）。已改为转发 `allowProd`。
2. **F-R2B6-2（低·掩盖者）已修**：拒绝路径把**字符串** code 传 `process.exit` ⇒ Node 抛 `TypeError: The "code" argument must be of type number` ⇒ 退出码变 **1**（本应 2）。已改为**数字**退出码，并在入口加 `exitWith()` 兜底（任何非数字 code 都不会再产生 TypeError）。
3. **机制可区分**：拒绝态打印 `REFUSED_BEFORE_CONNECT=yes target_db=…`（**不打印** `STAGE=connect`）；放行态先打印 `STAGE=connect target_db=… mode=…` 再连接 ⇒ 「守卫拒绝（2）」与「连接失败（1）」在**退出码 + 输出**上双重可区分。
4. **rollback 对称修复**：同类问题（重复守卫块 + 缺机制标记）一并清掉，apply/dry-run 两条路径都加标记与数字退出码。
5. **新增 w21（6 例，机制级、正反两向）**：拒绝态必须无 `STAGE=connect`/无连接错误/无 TypeError；放行态必须**无** `REFUSE_PROD_DB`（反向断言＝F-R2B6-1 的回归门）。
6. **既有测试零回归**：w20（13 例，t42）与 w9（7 例，t30）保持全绿；既有测试文件一行未改（只新增 w21）。
7. **verify 三段全绿（串行）**：check-layers 0 违规；unit（排除三重度）**49 套件/691 例** exit 0；contract 3/50 exit 0；integration **39 套件/370 例** exit 0（一次 `ownership-guards` 单例失败，单跑 62/62、整组复跑全绿 ⇒ 既有 flake）。
8. **生产库零写入**：只读指纹 before/after **逐位相同**（本轮不写生产；生产 `assignment_questions columns=7`＝队长已做的结构迁移，回填由队长执行）。
9. 未引入新依赖、未 npm install/构建；`server/src` 未动。
10. 未验证项与自纠见 §5/§6。

## 1 缺陷复现（修前）与根因
### 1.1 F-R2B6-1：apply 路径被自己的守卫拒绝
- 复现命令（本次用**不可达端口**等价复现，绝不连真库）：
```bash
cd server
node prisma/scripts/backfill-snapshots.js --apply --db-url mysql://u:p@127.0.0.1:1/exam_system --allow-db exam_system --allow-prod
```
- 修前行为：pre-check（第 121 行）转发 allowProd ⇒ dry-run/AUDIT 正常；**apply 阶段的第二次调用（第 141 行）漏传 allowProd** ⇒ 默认 false ⇒ `RESULT=REFUSE_PROD_DB reason=allow_prod_required:exam_system`。
- 队长现场证据：`/tmp/r2-backfill-audit.log`（先打印 31 行 ROW 再 REFUSE）；只读 SQL 复核生产库 `rubric_snapshot IS NOT NULL` = **0** ⇒ fail-closed、零写入 ✓。
### 1.2 F-R2B6-2：拒绝退出码二义性
- 修前：拒绝路径 `return guard.code`（字符串 `'REFUSE_PROD_DB'`）⇒ `process.exit('REFUSE_PROD_DB')` ⇒ `TypeError: The "code" argument must be of type number…` ⇒ 实际退出码 **1**，与「连接失败」不可区分 ⇒ w20（t42）与 C 的 t43 只断言 rc=1，两种原因都满足 ⇒ **两轮都没抓到 1.1**。

## 2 修法（三条要求 + 对称 + 加固）
| 项 | 修前 | 修后 |
|---|---|---|
| apply 阶段授权参数 | `assertApplyAllowed({ mode, dbName, allowDb })` ✗ | `…, allowProd: opts.allowProd }` ✅ |
| 拒绝退出码 | `return guard.code`（字符串 ⇒ TypeError ⇒ 1） | `return guard.exitCode`（**数字 2**）+ `exitWith()` 兜底 |
| 机制标记 | 无 | 拒绝：`REFUSED_BEFORE_CONNECT=yes`；放行：`STAGE=connect target_db=… mode=…` |
| rollback 对称 | 重复守卫块（打印两次）、无标记 | 去重 + 同款标记 + 数字退出码 |

## 3 机制级实测输出（不可达端口；拒绝态/放行态并排）
```
# ① 默认拒（backfill）
RESULT=REFUSE_PROD_DB reason=allow_db_required:exam_system
REFUSED_BEFORE_CONNECT=yes target_db=exam_system                                  rc=2
# ② 单开关拒（backfill --allow-db 或 --allow-prod）
RESULT=REFUSE_PROD_DB reason=allow_prod_required:exam_system   /   allow_db_required:exam_system
REFUSED_BEFORE_CONNECT=yes target_db=exam_system                                  rc=2
# ③ ★双开关（backfill --apply）
AUDIT target_db=exam_system allow_db=exam_system allow_prod=yes authorization=--allow-db+--allow-prod authorized_prod=yes
STAGE=connect target_db=exam_system mode=apply                                    ← 越过守卫（无 REFUSE 行）
BACKFILL_ERROR …（连接失败）                                                      rc=1
# ④ rollback 对称：默认拒 rc=2 / 单开关（apply）rc=2 db_not_allowed_for_apply / 双开关 ⇒ STAGE=connect + ROLLBACK_ERROR rc=1
```
- 关键读法：**出现 `STAGE=connect` 即证明已越过守卫**；出现 `REFUSED_BEFORE_CONNECT` 即证明拒绝发生在连接之前（无连接错误）。

## 4 测试（新增 w21；既有 w20/w9 不回归）
```bash
npx jest --config test/jest.config.js --runInBand --forceExit test/unit/w21-prod-apply-path.test.js   # 6 passed
npx jest --config test/jest.config.js --runInBand --forceExit test/unit/w20-prod-authorization.test.js # 13 passed（t42，未改）
npx jest --config test/jest.config.js --runInBand --forceExit test/unit/w9-rollback-cli.test.js       # 7 passed（t30，未改）
```
w21 用例按**机制**断言（不是只比 rc）：
- W21-1/2：拒绝态 ⇒ rc=2 + 含 `REFUSE_PROD_DB` + 含 `REFUSED_BEFORE_CONNECT` + **不含** `STAGE=connect` + **不含**连接错误 + **不含** TypeError 文案；
- W21-3：★双开关 + `--apply` ⇒ 含 `STAGE=connect` 与连接错误、rc=1、**不得**出现 `REFUSE_PROD_DB`（反向断言＝F-R2B6-1 回归门）+ AUDIT 字段齐全；
- W21-4/5：rollback 对称（拒绝 rc=2 无连接错误；放行 rc=1 无 REFUSE）；
- W21-6：退出码可区分性——2 ⇔ `REFUSED_BEFORE_CONNECT`、1 ⇔ `STAGE=connect`。

## 5 未验证项（单列）
1. **真实生产回填未执行**（契约要求：本轮纯修复，回填由队长执行）。放行证据只到「越过守卫 + 连接阶段」；真实写入需队长在授权窗口执行。
2. **真实生产库连接后的 dry-run 复算**（`MATCHED=31`）未做——需要可连生产的网络与授权窗口。
3. **AUDIT/REFUSED 行未落库**：只打印 stdout；执行时建议重定向留档。

## 6 自纠清单
1. **我的 w20 断言强度不够**：它只断言放行态 rc=1 且 `not.toContain(REFUSE_PROD_DB)` —— 修前 apply 路径**先打印 REFUSE 再返回字符串 code** ⇒ 实际上 w20-9 应当失败却被 rc 混淆掩盖：因为 `process.exit(字符串)` 抛出的 TypeError 让 stdout 里已经打了 REFUSE 行 ✗。**教训：凡「守卫是否被越过」的断言，必须同时断言机制标记（`STAGE=connect` 有/无），不能只看 rc 或只做单侧 contains。** w21 已按此重写（正反两向 + 标记）。
2. **重复守卫块**：t42 的补丁在 rollback 留了一块重复的拒绝分支（会打印两次），本轮去重。
3. **补丁纪律**：本轮所有改动仍走独立 Python 文件 + `node --check`；改完立即用不可达端口跑三态机制实测再进测试。
