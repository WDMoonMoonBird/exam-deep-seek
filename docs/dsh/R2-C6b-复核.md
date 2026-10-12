# R2-C6b 复核（apply 路径是否真越过守卫 · ★TCP 探针决定性判据）

## 结论摘要（10 行）
1. **verdict = pass**：t44 的两个缺陷（F-R2B6-1 apply 路径未转发 `--allow-prod`；F-R2B6-2 拒绝退出码二义/TypeError）**均已关闭**，机制级判据全部符合；无阻断 finding。
2. **★决定性判据【通过】**：双开关 + `--apply` + 库名 `exam_system` 的 URL 指向**我的探针端口**（`127.0.0.1:19399`，**非真实生产实例**）⇒ 探针 **`accepted=1`**，输出含 `STAGE=connect target_db=exam_system mode=apply` + `BACKFILL_ERROR`（连接失败）+ rc=1 + **无 `REFUSE_PROD_DB`** ⇒ **守卫确实被越过并尝试连接**（≠ 写入成功）。
3. **★拒绝态【通过】**：默认 / 仅 `--allow-db` / 仅 `--allow-prod` 三态 ⇒ 探针 **`accepted=0`** + rc=**2** + `RESULT=REFUSE_PROD_DB` + `REFUSED_BEFORE_CONNECT=yes` + **无连接错误** + **无 `STAGE=connect`** ⇒ 守卫在**连库之前**拒绝。
4. **真生产 URL + 单开关 + `--apply`** ⇒ 同样 rc=2、`accepted=0`（未连真库）——真生产只有 **dry-run**（只读）被我执行过。
5. **退出码/输出双可区分**：拒绝 ⇒ `2`+`REFUSED_BEFORE_CONNECT=yes`+`REFUSE_PROD_DB`（无 CONN_ERR）；越过 ⇒ `1`+`STAGE=connect`+`BACKFILL_ERROR`（无 REFUSE）⇒ F-R2B6-2 的二义性消除。
6. **TypeError 已消除**：六个拒绝态输出中均**无** `must be of type number`（`exitWith` 数字兜底 + 返回数字 exitCode）。
7. **rollback 对称【通过】**：默认 / `--allow-db`+`--apply`（`db_not_allowed_for_apply`）/ `--allow-prod` only ⇒ rc=2 + `accepted=0` + REFUSED 标记；双开关 ⇒ `accepted=1` + `STAGE=connect` + `ROLLBACK_ERROR` + rc=1 + 无 REFUSE。
8. **白名单未被放宽**：两脚本 `ALLOWED_APPLY_DBS=["exam_system_test"]`；函数级三态与 CLI 一致（生产授权只来自本次命令行）。
9. **生产库由我执行的命令零写入**（明细见 §6，含**队长回填的时间线披露**）：可写命令不是被拒（accepted=0）就是指向我的探针端口（无 MySQL ⇒ 连接失败、未执行 SQL）；对真生产只跑 dry-run（代码在 `if (opts.mode === 'dry-run') { … return 0; }` 提前返回，位于 apply 守卫与 `$executeRawUnsafe` 之前）。
10. **回归**：unit **49 套件/691 例** + contract **3/50** rc=0；integration **39 套件/370 例** rc=0；`FINGERPRINT_OK`；smoke **8/8**；既有测试文件**仅新增** `w21-prod-apply-path.test.js`；被验路径开收一致（145 文件 `4ad88679…`）。

## 1 方法（机制级判据）
- 逐例 TCP 探针（`t31-tcp-conn-probe.py 19399 <out.json> 12`）：**每个用例一个独立监听窗**，用例结束读取 `accepted` 计数 ⇒ 直接观测"是否发起了连接"。
- **安全插销（遵队长指令）**：决定性用例的 `--db-url` 一律为 `mysql://u:p@127.0.0.1:19399/exam_system`——**库名仍是 `exam_system`**（与生产同名，用于触发生产授权门）但 host/port 是**我自己的探针端口**，那里没有 MySQL ⇒ **不可能写到真库**；真生产 URL 只用于"拒绝态"（不连库）与"dry-run"（只读）。
- **语义澄清**：`accepted=1` = 「已越过守卫并**尝试连接**」，**不等于**写入成功——本次该路径在连接阶段即失败（`BACKFILL_ERROR`/`ROLLBACK_ERROR`），根本未执行任何 SQL。
- 判定脚本同时抽取四个机制标记：`REFUSE_PROD_DB`、`STAGE=connect`、`CONN_ERR`、`TypeError`（`must be of type number`）。

## 2 ★决定性判据（backfill）
| 用例 | rc | TCP 探针 | REFUSE | STAGE=connect | CONN_ERR | TypeError |
|---|---|---|---|---|---|---|
| 默认（无开关，探针 URL） | **2** | **accepted=0** | yes | no | no | no |
| 仅 `--allow-db` | **2** | **accepted=0** | yes | no | no | no |
| 仅 `--allow-prod` | **2** | **accepted=0** | yes | no | no | no |
| **双开关 + `--apply`（探针 URL）** | 1 | **accepted=1** | **no** | **yes** | **yes** | no |
| 真生产 URL + 单开关 + `--apply` | **2** | **accepted=0** | yes | no | no | no |
| 真生产 URL + 双开关 + `--dry-run`（只读） | 0 | （连真库） | no | yes | no | no |
- 双开关输出原文：`AUDIT … authorized_prod=yes` → `STAGE=connect target_db=exam_system mode=apply` → `BACKFILL_ERROR Invalid \`prisma.$queryRawUnsafe()\` invocation:`（连接失败）。
- 拒绝态输出原文：`RESULT=REFUSE_PROD_DB reason=allow_db_required:exam_system` + `REFUSED_BEFORE_CONNECT=yes target_db=exam_system`。

## 3 rollback 对称
| 用例 | rc | 探针 | 标记 |
|---|---|---|---|
| 默认 | 2 | **accepted=0** | REFUSE + REFUSED_BEFORE_CONNECT，无 STAGE/CONN_ERR |
| `--allow-db`+`--apply` | 2 | **accepted=0** | `db_not_allowed_for_apply:exam_system`（兼容 w9） |
| `--allow-prod` only | 2 | **accepted=0** | `allow_db_required` |
| 双开关 + `--apply`（探针 URL） | 1 | **accepted=1** | 无 REFUSE + `STAGE=connect` + `ROLLBACK_ERROR` |
| 真生产 + 单开关 + `--apply` | 2 | **accepted=0** | REFUSED |
| 真生产 + 双开关 + `--dry-run` | 0 | （连真库） | `STAGE=connect mode=dry-run` + `WOULD_NULL=31`（只读） |

## 4 白名单与授权函数（不连库断言）
```json
{"whitelist":{"backfill":["exam_system_test"],"rollback":["exam_system_test"],"only_test_db":true,"contains_prod":false},
 "backfill_fn":{"no_switches":{"exitCode":2,"reason":"allow_db_required:exam_system"},
                "db_only":{"exitCode":2,"reason":"allow_prod_required:exam_system"},
                "prod_only":{"exitCode":2,"reason":"allow_db_required:exam_system"},
                "both":{"ok":true,"authorizedProd":true,"authorization":"--allow-db+--allow-prod"}},
 "rollback_fn":{"db_only_apply":{"exitCode":2,"reason":"db_not_allowed_for_apply:exam_system"},
                "both":{"ok":true,"authorizedProd":true},"dry_run_single":{"ok":true,"authorizedProd":false}}}
```

## 5 修复的代码证据
- `backfill-snapshots.js:143`：apply 阶段 `assertApplyAllowed({ mode, dbName, allowDb, allowProd: opts.allowProd })` ⇒ **转发 is 修复**（t42 版漏传 ⇒ 默认 false ⇒ 自拒）。
- `backfill-snapshots.js:122/144`：拒绝时打印 `REFUSED_BEFORE_CONNECT=yes` 并 `return guard.exitCode`（**数字**）。
- `backfill-snapshots.js:164`：`const exitWith = (c) => process.exit(Number.isFinite(Number(c)) ? Number(c) : 1)` ⇒ 杜绝字符串 code 的 TypeError。
- `rollback-snapshots.js:96/99/121`：同款标记 + 数字退出码 + `STAGE=connect`。

## 6 生产库零写入（我执行的命令）与时间线披露
- **我的可写命令**：`bf-double` / `rb-double`（`--apply`）指向**探针端口** ⇒ 连接失败、未执行 SQL；其余 `--apply` 全部被守卫拒绝（accepted=0）。
- **我对真生产只跑了 dry-run**：代码在 `if (opts.mode === 'dry-run') { console.log('DRY_RUN_OK … (未写库)'); return 0; }` 处提前返回（在 apply 守卫与 `$executeRawUnsafe` **之前**）⇒ 只读。
- **★时间线（如实披露状态变化，非我所为）**：本轮开工（约 11:55）我读到生产 `非空快照行=0`、aq 列=7、迁移=4；收尾（约 12:10）读到 `aq 总行=52 / rubric_snapshot IS NOT NULL=31 / snapshot_origin: NULL=21,\\'backfill\\'=31 / project 型且仍待回填=0`。⇒ 期间**队长按授权执行了生产回填**（我全程未对真库 `--apply`）。旁证：backfill dry-run 由 t43 的 `MATCHED=31 (preflight)` 变为 `MATCHED=0`，rollback dry-run 报 `WOULD_NULL=31`；`standard_hash` 非空=0（回填默认 NULL，与设计一致）。
- **我未改写历史分数**：92 分摘要 `e8496ae6…`（开工=收尾一致）。

## 7 回归
| 项 | 结果 |
|---|---|
| verify ① | unit(排除三重度) **49 套件/691 例** + contract **3 套件/50 例** rc=0（含新增 w21 6 例） |
| verify ② | integration **39 套件/370 例** rc=0 |
| verify ③ | `db-fingerprint.js` `FINGERPRINT_OK`（users 1252 / questions 32 / assignments 52 / aq 52 columns=7 / submissions 1601 / system_configs 4；迁移 4；表 24） |
| smoke | `R2B4_SMOKE=PASS checks=8 failed=0` |
| 测试文件 | `git status -- server` 仅 ` M backfill-snapshots.js`、` M rollback-snapshots.js`、`?? test/unit/w21-prod-apply-path.test.js` ⇒ **既有测试文件未被修改** |
| 被验路径 | `server/prisma`+`server/test` 开收一致：145 文件 `4ad88679c31a38f23a470c94e5c62bf6ac6e12fd16f56b13bfbb16a842ba01dc` |

## 8 观察与未核验（非阻断）
- **O-1（我自己的教训，已写进本轮结论）**：t43 我只断言"放行态 rc=1 且不含 REFUSE"——但**修前 apply 路径会先打印 REFUSE、再因字符串 exit 抛 TypeError 让 rc 变 1** ⇒ 两种原因都满足 rc=1，**掩盖了缺陷**。本轮改为机制标记断言（`STAGE=connect` 有/无 + `REFUSED_BEFORE_CONNECT=yes` + 四标记联合），并加 TCP 探针的 `accepted` 作为**物理判据**。
- **O-2**：`accepted=1` 只证明"越过守卫并尝试连接"，不证明写成功；真实的 `--apply` 生产回填由队长执行（本轮已执行，见 §6）。
- **O-3（未核验）**：回填后 `standard_hash` 全为 NULL（无标准包哈希）⇒ 依赖 standard_hash 的 stale 判定对这批行等价于"未记录"，建议在冻结语义文档中标注。

## 9 预算与纪律
- 真实模型调用 **0 次**；报告 ≤200 行 / ≤20KB；长证据外置 `106–109`。
- 未改 `server/**`、`tests/`、`client/dist`；**未对生产库执行任何写操作**；未跑禁令命令；未占 :5173/:3000/:19387。
