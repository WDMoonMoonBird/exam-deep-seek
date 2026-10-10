# test-round-06 —— 回归验证 + 对抗性复核（authorization scope 收口）

| 项 | 值 |
|---|---|
| 轮次 | **round 6 / 8**（Agent C · 回归验证 + 对抗性） |
| 日期 | 2026-10-11 |
| 被验 commit | **`e722f54`**（`git rev-parse HEAD` = `e722f549450ac9504d4c0b1e14a1ac148df498b6`，与 A/B 报告基线一致） |
| 工作树状态（本轮实测） | `git status --porcelain -uno` = 8 个 M（7 源 + 1 测试）+ `pipeline-status.md`（Captain）；**零新增/删除跟踪文件** |
| 被验对象 | `audit-round-06.md`（57/57 写端点普查 · 16 项需修）+ `refactor-round-06.md`（8 组修复落地 + §8 R-1） |
| 角色 | Agent C（`tech-test-automation`）· **只读测试**：仓库内仅写本报告与 `test-round-06.log`；探针落在 `/tmp` |
| 方法 | V1 全量回归（四段）→ V2 五项门禁 + 两数 → **V3 自建对抗性探针（83 请求 / 自建夹具 / 请求前后字段级对拍）** → V4 测试改动未弱化复核 → V5 内联可见集等价性复核 → V6 未闭合项登记 → V7 改动面旁证 |

> **口径声明**：本报告所有数字均为**本轮冻结树实测**（纪律 10），不采信 A/B 报告中的任何数字；引用处均标注「B 报 → 本轮实测」。

---

## 1 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| **V1** | 全量回归 `ROUND=06` | 4 处摘要 / 68 套件 / 1059 例 / **0 failed** | **4 处摘要 / 68 套件 / 1059 例 / 0 failed** | ✅ **PASS** |
| V1a | 四段分布 | 938+17+61+21（任务书/B 报） | **960 + 17 + 61 + 21 = 1059** | ⚠️ 段1 期望值有误（见 §2.2 / 缺陷 C6-5） |
| V1b | 重点套件 | ownership-guards 48 / assignment-q9 9 / submission.use-cases 32 / persistence-repositories 12 | **48 / 9 / 32 / 12 全绿** | ✅ PASS |
| **V2** | cycle-check | 71 文件 / **164 边不变** / SCC 0 | **71 / 164 / SCC 0 / 自环 0** | ✅ PASS |
| V2b | check-layers | 71 / 0 / 47 | **71 / 0 / 47** | ✅ PASS |
| V2c | arch-metrics | 0 / 47 / **10** | **0 / 47 / 10**（>500 观察带 19） | ✅ PASS（GodFile 未变 11） |
| V2d | hard-metrics | 0/0/0 | **0/0/0** | ✅ PASS |
| V2e | bind-check | self-test 3/3 + 真仓 0 违规 | **self-test 3/3；真仓 169 模块 / 512 绑定 / 0 违规** | ✅ PASS（绑定数 B 报 511 → 实测 512，见 C6-7） |
| V2f | 文件数 | 146 | **146** | ✅ PASS |
| V2g | studentController | 799 行 + 0 行改动 | **799 行；`git diff --stat` 空** | ✅ PASS |
| **V3** | 对抗性（8 组落地 + 绕过尝试） | 全部 403/404 + 零写入 | **83 请求：原链已断（4/4 403），但发现 6 条绕过写入（1 条新越权链）** | 🔴 **阻断**（C6-1） |
| V3a | 合法路径不误伤 | 全部 200 且形状不变 | **17/17 合法请求通过**（1 项重复 id → 500，既有形态，见 C6-3） | ✅ PASS |
| **V4** | B 的测试改动未弱化 | 无删除/放宽/objectContaining | **5 处删除全部可解释，0 处放宽；+26 例中 16 例带 DB 断言** | ✅ PASS |
| **V5** | 内联可见集与 getVisibleClassIds 等价 | 等价 | **文本逐行同形 + 运行时 6/6 判定一致** | ✅ PASS（建议后续收敛，C6-6） |
| **V6** | R-1 处置 | 如实登记未闭合 | **createAssignment 两处守卫仍缺（实测静态确证）；探针已回滚，9/9 绿** | ⚠️ **未闭合项登记** |
| **V7** | 改动面 | 仅 ownership-guards.test.js ∈ server/test | **实测一致**（`find -newermt` 佐证） | ✅ PASS |

**本轮结论：V1/V2/V4/V5/V7 PASS，V3 发现阻断 1 项 ⇒ 「需回流 B」。**

---

## 2 V1 后端全量回归

### 2.1 命令与结果（原始输出）

```
$ ROUND=06 bash docs/pipeline/scripts/unblock-g2.sh
→ 测试库: 127.0.0.1:3306/exam_system_test
✓ 端口可达 / ✓ schema 对齐
→ 退出码: 0 ｜ 完整日志: docs/pipeline/test-round-06.log

$ grep -E "^Test Suites:|^Tests:|^Time:" docs/pipeline/test-round-06.log
Test Suites: 65 passed, 65 total      ← 段1（除三个 tree-sitter 套件）
Tests:       960 passed, 960 total
Time:        172.834 s
Test Suites: 1 passed, 1 total        ← 段2 fact-extractor
Tests:       17 passed, 17 total
Test Suites: 1 passed, 1 total        ← 段3 rule-executor
Tests:       61 passed, 61 total
Test Suites: 1 passed, 1 total        ← 段4 rule-mutator
Tests:       21 passed, 21 total

$ grep -cE "^FAIL " docs/pipeline/test-round-06.log      → 0
$ grep -cE "^PASS " docs/pipeline/test-round-06.log      → 68
$ grep "●" … | grep -v "● Console"                        → （空）
```

**判定**：**4 处 `Test Suites:` 摘要齐备**（`&&` 串联未短路）· **68 套件 / 1059 例 / 0 failed** · 与 round-5 基线（1033）+ B 申报的 **+26 例**精确吻合（1033 + 26 = 1059）。

### 2.2 ★段1 期望值勘误（不影响 PASS）

| 口径 | 段1 | 段2 | 段3 | 段4 | 合计 |
|---|---|---|---|---|---|
| 任务书 / B 报告 §9 期望 | 938 | 17 | 61 | 21 | **1037** ❌ 与 1059 自相矛盾 |
| round-5 日志实测（`test-round-05.log`） | **934** | 17 | 61 | 21 | 1033 ✅ |
| **round-6 本轮实测** | **960** | 17 | 61 | 21 | **1059** ✅ |

「938」= 沿用 round-1 的段1 基线 **912** + 26；round-5 的段1 实测已是 **934**。**总数与套件数完全正确，仅段1 的期望值陈旧**（登记为 C6-5，文档级，非回归）。

### 2.3 重点复跑（定向隔离复跑，非依赖全量日志）

```
$ cd server && DATABASE_URL=<exam_system_test> PORT=0 NODE_OPTIONS=--experimental-vm-modules \
  npx jest --config test/jest.config.js --runInBand --forceExit --testPathPatterns="<每套件>"
### integration/ownership-guards        Test Suites: 1 passed  Tests:  48 passed,  48 total
### unit/assignment-q9-branches         Test Suites: 1 passed  Tests:   9 passed,   9 total   ← ★ 必须仍 9/9
### unit/application/submission.use-cases Test Suites: 1 passed Tests:  32 passed,  32 total
### unit/infrastructure/persistence-repositories Test Suites: 1 passed Tests: 12 passed, 12 total
```

**四个重点套件全部为绿**，其中 `assignment-q9-branches` **9/9**（证明 B 在 §6 的两处探针已真实回滚，未把半成品留在树里）。

---

## 3 V2 门禁与不变量（五项 + 两个数）

```
$ node scripts/gates/cycle-check.mjs
  扫描 71 文件 / 164 条相对导入边        ← ★ 164 边不变
  强连通分量（|SCC|>1）: 0（基线 1） ｜ 自环: 0
结论：PASS

$ node server/scripts/check-layers.mjs
文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个    ← ★ 71/0/47 不变

$ node scripts/gates/arch-metrics.mjs
  ✓ layerViolations 基线=0 实测=0 ｜ ✓ unmigrated 基线=47 实测=47
  ✓ godfileOver800  基线=10 实测=10   ← ★ 未变 11
  · >500 行（观察带）基线=19 实测=19
  GodFile >800：Submit.vue(1519) / teacherController.js(1332) / checkerService.js(1280) / Doc.vue(1106) /
                 deepseek.js(1051) / ruleExecutor.js(1010) / ReviewDetail.vue(988) / QuestionEdit.vue(983) /
                 reviewController.js(965) / ProjectQuestionEdit.vue(862)
结论：PASS

$ node scripts/gates/hard-metrics.mjs
  ✓ hex6 0/0 ｜ ✓ important 0/0 ｜ ✓ modalConfirm 0/0（参考：非 style.css 的 !important = 20，按设计使用）
结论：PASS

$ node scripts/gates/bind-check.mjs --self-test
  synthetic modules scanned: 5 ｜ synthetic violations detected: 3
  SELF-TEST PASSED: 3/3 合成坏绑定被检出，合法绑定零误报（门禁非「永远绿灯」）
$ node scripts/gates/bind-check.mjs
  modules scanned: 169 ｜ named import bindings checked: 512 ｜ BINDING VIOLATIONS: 0
  （4 条 unresolved / 1 条 external 仅登记，均为既有）

$ find server/src client/src -type f | wc -l        → 146      ← ★ 146 不变
$ wc -l < server/src/controllers/studentController.js → 799     ← ★ GodFile 阈值 800 未破
$ git diff --stat -- server/src/controllers/studentController.js → （空）  ← ★ 0 行改动佐证
```

**五项门禁 + 两个数全部达标**。teacherController 由 1278 → **1332** 行（新增守卫），但它**本就在 GodFile 基线 10 个之内**，判据是「超标个数」而非行数 ⇒ `godfileOver800` 未变 11 ✅。

---

## 4 ★V3 对抗性验证（自建探针 · 83 请求 · 字段级对拍）

### 4.0 装置与纪律

- 脚本：`/tmp/r6c-probe.mjs`（+ `/tmp/r6c-probe-v5.mjs`），`node … 2>&1`，原始输出 `/tmp/r6c-probe.log`（已作为附录并入 `test-round-06.log`）
- **`PORT=0` 显式设置**（纪律 14）：日志实测 `"port":"0"` / `HTTP 服务已启动 → http://localhost:0`；**未占用 :5173 / :3000**，收尾 `process.exit(0)`
- 库：探针内 `SELECT DATABASE()` = **exam_system_test**（非白名单即 exit 3）
- 夹具**完全自建**（前缀 `c6_`：3 校 / 5 教师（含 1 名多校、1 名软删）/ 5 班 / 2 团队 / 2 生 / 2 题 / 1 作业），**未复用 A/B 的 `to_`/`r6b_` 夹具**
- 零写入判据 = **请求前后快照 `JSON.stringify` 全等**（班级 4 表 / 团队 3 表 / 用户+班级链 / checker 三字段 / submission 行 / project+projectClass）
- **未联网 / 未触发 LLM**：只调用 `checker/confirm`、`checker/rollback`（纯 DB）与他人的 `checker/generate`（在守卫处即 404，不会 fire-and-forget）；**从未对自有题目调用 generate**
- 收尾：`cleanup leftover c6_ users = 0  schools = 0` ✅

### 4.1 逐项结果（记录行原文摘录）

**L 合法路径（必须不误伤）——17/17 通过**

```
L1  tA 改自己班级+挂自己团队         http=200 code=0   （响应 {"code":0,"message":"更新成功","data":null}）
L2  tA 建班(本校)+挂自己团队          http=200 code=0
L3  tA 建团队(本校)                 http=200 code=0
L4/L4b tA 改自己团队(名单+班级)       http=200 code=0   ← 形状逐字不变
L5  tC(成员非创建者)改团队名          http=200 code=0   ← R6-P10 语义边界，未被过度收紧
L6/L7 tA 本班新增/批量新增学生        http=200 code=0
L8  tA 改自己学生(同名班级)           http=200 code=0
L9  tA 自己题 checker/confirm 空body http=400 code=1001 {"message":"缺少 action"}     ← 未被误伤成 404
L10 tA 自己题 checker/rollback 空body http=400 code=1001 {"message":"缺少 ruleVersionId"}
L11 tA 本班建实训任务                http=200 code=0
L12 本班学生读作业详情                http=200 code=0
L13 本班学生存草稿                   http=200 code=0
L14 本班学生提交                     http=200 code=0
L15 tA 清空本班团队关联(空数组)        http=200 code=0
L16 tA 重复 id                      http=500  ← 既有形态（P2002 createMany，见 C6-3）
L17 tB 自己班级挂自己团队             http=200 code=0
```

**A 非成员越权 + 原链（期望被 B 的修复阻断）**

```
A1 tB 改他人团队名                    http=403 code=1003 zero=true
A2 tB 踢出创建者(teacherIds:[tB])     http=403 code=1003 zero=true
A3 tB 挂他人班级进他人团队             http=403 code=1003 zero=true
A4 tB 清空他人团队名单                 http=403 code=1003 zero=true
A5 tM(他团队成员)改 teamB             http=403 code=1003 zero=true
A6 不存在团队                         http=404 code=1004 {"message":"团队不存在"}   ← 形状不变
AC1 tB 改 teamA 名单+挂 clsA          http=403 code=1003 zero=true
AC2 tB 改 tA 的班级(原链末环)          http=403 code=1003 zero=true
AC3 tA 把班级挂进他人团队(第一环)       http=403 code=1003 zero=true
AC4 tB 随后改 tA 班级                 http=403 code=1003 zero=true
```
⇒ **A §3.3 的原始越权链（非成员 → 改他人团队名单 → 挂他人班级 → 改他人班级）已被彻底斩断**（4/4 403 + 零写入）。

**B 教师端 body 目标（8 组落地项）**

```
B1  tB 在他人学校建班                 http=403 code=1003 zero=true      （#24 schoolId）
B2  tA 建班挂他人团队                 http=403 code=1003 zero=true      （#24 teamIds）
B3  tA 改班挂他人团队(★第一环)         http=403 code=1003 zero=true      （#25）
B4  tA 混合[自己团队,他人团队]         http=403 code=1003 zero=true
B5-B8 teamIds=[0] / [-1] / [超大数] / [字符串teamB] → 全 403 code=1003 zero=true   （id 强转/负数/超大数绕过无效）
B9  tA body.id=teamB 混淆            http=200 code=0  （body.id 被忽略；快照 teamB 变化的唯一原因是该请求合法地
                                                        清除了 clsA 的团队关联——即 BY1 注入的那条，非新写入）
B10 tA 改学生 classId=他人班(★接管面)  http=403 code=1003 zero=true      （#54 目标侧）
B11 tA 他人班新增学生                 http=403 code=1003 zero=true      （#52）
B12 tA 他人班批量新增                 http=403 code=1003 zero=true      （#53）
B13 不存在班级                        http=400 code=1001 {"message":"班级不存在"}  ← 既有分支原位
B14 tA 改学生 classId=0(falsy)        http=200 code=0 zero=true          （无写入，无越权）
B15 tA teamIds=对象{length:1}         http=500 code=2001 zero=true        （TypeError，见 C6-3）
B16 tA teamIds=字符串"1"              http=500 code=2001 zero=true        （同上）
```

**C checker 三写端点 / D 学生端 / E project / M 多校（全绿）**

```
C1 tB confirm 他人题目   http=404 code=1004 {"message":"题目不存在"} zero=true   （#29）
C2 tB rollback 他人题目  http=404 code=1004 zero=true                            （#30，checkerScript 逐字节不变）
C3 tB generate 他人题目  http=404 code=1004 zero=true                            （#28；未触发 LLM）
C4 tB confirm 不存在题目 http=404 code=1004
D1 stuC 存草稿(非本班)   http=403 code=1003 {"message":"无权访问该作业"} zero=true （#15）
D2 stuC 提交(非本班)     http=403 code=1003 zero=true                            （#14）
D3 stuC retry(非本班)    http=403 code=1003 zero=true                            （#16）
D4 stuC 读详情(S-6 回归) http=403 code=1003
D5/D6/D7 不存在/负数/超大 id → 404 code=1004（形状不变）
D8 stuC body 内混淆 assignmentId → 403 zero=true
D9 ★存量越权草稿行(直接插库模拟修复前遗留) + 读详情 → 403   ← 读侧守卫与「有无提交」无关（见 §5.1）
D10 存量草稿行 + submit → 403 zero=true
E1 tB 用他人班级建任务    http=403 code=1003 zero=true   （#18）
E2 tB 混合[自己班,他人班]  http=403 code=1003 zero=true
E3/E4/E5 字符串 id / 负数 / 不存在 id → 全 403 zero=true
E6 tA 改自己任务为他人班   http=403 code=1003 zero=true   （#19）
E7 tB 改他人任务 classIds  http=404 code=1004 zero=true   （既有 teacherId 收窄）
E8 tB 空 classIds         http=400 code=1001 {"message":"参数错误：标题、时间、班级为必填项"}
M1 tM 用S1作用域改S2班级   http=403 zero=true     M2 tM 用S2作用域改S2自己班 http=200 zero=true
M3 tM 用S2作用域改S1自己班 http=403 zero=true     M4 tM 在自己不属的S3建班   http=403
M5 tM 在自己所属S2建班     http=200               M6 tM 挂他人团队(teamA)    http=403 zero=true
M7 tB 跨校改 tM 班级       http=403 zero=true     M9 tB 不带 schoolId 改 tA 班级 http=403 zero=true
M8 tM 不带 schoolId 改班级  http=500（Prisma schoolId:null，既有形态，见 C6-4）
X1 软删教师持旧 token 写     http=401 code=1002 {"message":"用户不存在"}   ← 软删即时失效（正向）
```

**X 软删维度（schema 实测）**

```
$ SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME LIKE 'deleted%'
[{"t":"assignments","c":"deleted_at"},{"t":"projects","c":"deleted_at"},
 {"t":"questions","c":"deleted_at"},{"t":"users","c":"deleted_at"}]
```
⇒ **classes / teams / teacher_classes / team_classes / student_classes 均无软删列** ⇒ 任务书所列「软删班级」绕过尝试**在该 schema 下不可构造**（登记为「不适用」，非「已防御」）。

### 4.2 ★★绕过尝试清单与判定（任务书：任何一条能绕过即判阻断）

| # | 绕过尝试（设计意图） | 结果 | 判定 |
|---|---|---|---|
| 1 | id 强转（teamIds/classIds 传字符串） | 403 / 拒绝（B5-B8, E3） | ❌ 未绕过 |
| 2 | 负数 id（-1） | 403（B6, E4） | ❌ 未绕过 |
| 3 | 超大数 id（4294967294 / 99999999999） | 403 / 404（B7, D7, E5） | ❌ 未绕过 |
| 4 | 把 id 放 body 混淆（body.id=teamB） | body.id 被忽略（B9） | ❌ 未绕过 |
| 5 | 空数组（无目标资源） | 放行为「清空」语义，**只减不增**（L15, E8=400） | ❌ 未绕过 |
| 6 | 重复 id | 合法场景 500（P2002），非提权（L16 / C6-3） | ❌ 未绕过 |
| 7 | 混合合法+非法 id | **整体拒绝** 403（B4, E2）—— `every` 语义正确 | ❌ 未绕过 |
| 8 | 软删班级 | 该 schema 无软删列，不可构造 | ❌ 未绕过（N/A） |
| 9 | team 成员边界（成员/创建者/非成员） | 非成员 403 ✅；**成员/创建者路径见下 #12** | 🔴 **见 #12** |
| 10 | 同 teacherId 多校 | 作用域按 query schoolId 正确收窄（M1/M3 403，M2/M5 200） | ❌ 未绕过 |
| 11 | 非数组 teamIds（对象/字符串） | 500（TypeError），**零写入**（B15/B16） | ❌ 未绕过 |
| **12** | **★ 把【他人班级】挂进【自有团队】**（`updateTeam.classIds` 无任何内容校验） | **200 + 真实写库** | 🔴 **绕过成立 → 阻断** |

### 4.3 ★阻断 C6-1：越权链以「变体」形式存活（updateTeam.classIds 未校验）

**A 的原始链已断（AC1-AC4），但同一因果链的另一扇门仍敞开**：`teamController.updateTeam:94-109` 只校验「谁在改团队」，**完全不校验改进去的内容**——`classIds` 可以是任意学校、任意教师的班级。

**实测（本探针，HTTP + 字段级对拍）**

```
BY1 tB 把 tA 的 clsA 挂进自有 teamB   http=200 code=0  WRITTEN   ← teamClass(teamB, clsA) 落库
BY2 tB 改 tA 的班级(经团队放大)        http=200 code=0  WRITTEN   ← clsA.name 被跨租户改写
BY3 tB 重置 tA 学生口令(账号接管)       http=200 code=0  WRITTEN   ← stuA.password 被改写
BY4 tB 把 tA 学生移出班级              http=403 code=1003 zero=true （该路径的目标班不在其 s1 可见集内）
BY5 tB 往 tA 班级加学生                http=200 code=0  WRITTEN   ← 越权创建学生并挂入 tA 班级
BY6 tC(成员非创建者) 把 clsB 挂进 teamA http=200 code=0  WRITTEN
BY7 tA(创建者) 把 clsB 挂进 teamA      http=200 code=0  WRITTEN
```

**因果链**：① `PUT /teacher/teams/<自有团队> {classIds:[<他人班级>]}` → 200（无校验）→ ② `getVisibleClassIds` = 直连 ∪ 团队班级 ⇒ 他人班级**进入攻击者可见集** → ③ 此后 round-5/round-6 的**全部写守卫**（updateClass / updateStudent / addStudent / batchAddStudents / reset-password / project.classIds …）对该班级**一律放行**。

**为什么这是「漏做」而非「设计」**（三重证据）：
1. **同一 fix 的对称面已有正确做法**：B 在 `updateClass` 上实现了 `teamIds ⊆ 本人团队`（B3 实测 403）；`updateTeam.classIds` 是**同一契约的缺失半边**（A §5.1 #1 的修法只写了成员判据，未写内容判据）。
2. **UI 无法产生该请求**：`client/src/api/request.js:17` 给每个请求注入 `schoolId=currentSchool.id`；`TeamEdit.vue:132 loadClasses()` → `GET /teacher/classes` 只返回**本人可见班级**。⇒ 合法流程的 `classIds` 恒 ⊆ 可见集，**加此校验对合法路径零影响**（与本轮 L4/L5 实测一致）。
3. **同文件对照**：`deleteTeam:123` 有创建者校验、`leaveTeam:139` 只动自己行 ⇒ 该端点族**是有归属概念的**。

**最小修法契约（建议回流 B 时并入下一轮）**：
```js
// teamController.updateTeam：在成员/创建者判定之后、【任何写库动作之前】
if (classIds !== undefined && classIds.length
    && !(await canSeeAllClasses(req.user.id, classIds, getSchoolId(req)))) {
  return res.status(403).json({ code: 1003, message: '无权操作', data: null });
}
// 判据：classIds ⊆ getVisibleClassIds(req.user.id, getSchoolId(req))（空集=清空，放行）
```
注意 **时序**：现实现的 `team.update({name})`（:95-97）在 `classIds` 处理之前，校验必须提到**整个写库段之前**才能保证零写入。配套需 **C 侧新增用例**（当前 `grep "put('/api/teacher/teams"` = 0 命中，且 B 的 R1-R4 只覆盖「非成员」与合法路径，**无一条覆盖「成员/创建者挂他人班级」**）。

**同一端点的另一未校验字段** `teacherIds`（低-中）：成员/创建者可增删任意教师（含把任意教师拉进自己团队）。加害面小于 `classIds`（拉进来的人只获得「该团队自身班级」的可见性，而该集合在 C6-1 修复后必 ⊆ 团队成员自己的可见集），且与拍板项 **R6-P10（团队治理语义）** 重叠 ⇒ 登记为 C6-2，随 R6-P10 一并拍板。

---

## 5 ★V4 / ★V5 复核结论

### 5.1 V4 —— B 对 `ownership-guards.test.js` 的改动是否弱化

**改动面（`git diff --numstat`）= +287 / −5，`it(` 总数 48。5 处删除逐条可解释**：

| 删除行 | 性质 | 是否弱化 |
|---|---|---|
| `let sA, sB, …, team;` | 同一行扩为 `…, team, teamB;`（新增夹具变量） | 否 |
| `let qS6, asgA, asgB;` | 同一行扩为 `…, qChecker, …` | 否 |
| `it('S3: …仍 403…')` | 用例名改写（同步新语义） | 否 |
| `expect(draft.body.code).toBe(0)` | **被删的正是「把漏洞锁成期望值」的那一行** | 否（方向为收紧） |
| `expect(count).toBeGreaterThan(0)` | 换为 `toBe(before)`（`before` 被前置断言为 **0**）+ 三键唯一索引 `toBe(0)` | 否（更强） |

**(a) 翻转后是否保住原意 + 是否新增 DB 零写入断言 —— 结论：保住，且补齐了更强的半边**

- 原意拆解：原用例 = 「未投放学生**能落草稿**（前置）→ 取详情**仍 403**（守卫生效）」。翻转后：前置改为 **403 + 零写入**（更强的既成事实），读侧 `403 + {code:1003,message:'无权访问该作业'}` **逐字保留**（:655-657）。
- **诚实指出的口径变化**：修复后已无法再通过 API 构造「攻击者名下存在提交行」这一前置 ⇒ 原用例中「**有**提交仍 403」的字面场景在该用例内不再可复现。
- **我用独立探针把这个缺口补上了**：直接向库里插入一条 `stuC × asgA` 的**存量草稿行**（模拟修复前遗留数据），再取详情 —— **D9 = 403**（且响应体不含题干/评分标准）。⇒ 读侧守卫（`studentController:231` 的 `assignmentClass ∩ studentClasses`）**与「有无提交行」完全无关**，原意所指向的安全性由我的探针独立证实；同时证伪了「靠存量脏数据仍能读」的担心。
- **DB 零写入断言**：`before` 前置断言为 0 + 请求后 `toBe(before)` + `(assignmentId,studentId,questionId)` 三键 `toBe(0)`（抢答面/AI 计费面）——**三条独立断言，均非仅状态码**。

**(b) 是否有断言被删除/放宽/改用弱化写法 —— 结论：无**

- 全文件弱化写法扫描：`objectContaining` = 0、`expect.any` = 0、`expect.anything` = 0、`toMatchObject` = 0、`toBeTruthy/toBeDefined` = 0。
- 命中的 4 处 `not.to*` / `toBeGreaterThan` 全部**位于未改动的既有用例**（:195 :347 :393 :630，T 段/S1/S2），与本次改动无关。
- `T1-T18`（18 例）**逐字未动**（diff 中该区段仅作为上下文出现）；`S1/S2/S4` 亦未动。

**(c) 新增 26 例是否真的断言 403 与零写入 —— 结论：是，16/26 带 DB 级证据**

| 类别 | 例数 | 明细 |
|---|---|---|
| **越权拒绝 + DB 快照/toEqual 或 count 零写入** | **16** | R1 R5 R7 R8 R9 R11 R12 R13 R15 R16 R17 R20 R21 R22 S3 S5 |
| 合法路径 200 + 响应形状 `toEqual`（防过度收紧） | 7 | R2 R3 R6 R10 R14 R21(兼) S8 |
| 既有分支形状不变（404/400） | 3 | R4 S7 R18 R19（R18/R19 为「本人题目落到既有 400」，证明未误伤） |
| 仅断言状态码 + 体（无 DB 快照） | 1 | **S6（retry）** |

- 唯一无 DB 快照的是 `S6 retry`；我的独立探针 **D3** 已补上（`snapSubs → zero=true`）。
- 契约文案一致性：`expectDeniedOperation` 断言 **403 + `{code:1003,message:'无权操作',data:null}` 整 body**（非 objectContaining）；checker 断言 **404 + `{code:1004,message:'题目不存在',data:null}` 整 body**；学生侧断言 **403 + `{message:'无权访问该作业'}` 整 body** —— 与 A §5.1 契约逐字一致，且与我的探针实测逐字一致。

### 5.2 V5 —— `projectController` 内联可见集是否与 `getVisibleClassIds` 等价

**文本层（逐行对拍）**

| 维度 | `teamController.js:176-196`（规范实现） | `projectController.js:45-54`（内联副本） | 等价 |
|---|---|---|---|
| schoolId 归一 | `sid = schoolId ? +schoolId : null` | 同 | ✅ |
| 学校过滤形状 | `classScope = sid ? { class: { schoolId: sid } } : {}` | 同 | ✅ |
| 直连查询 | `teacherClass.findMany({where:{teacherId, ...classScope}, select:{classId}})` | 同 | ✅ |
| 团队集合 | `teamTeacher.findMany({where:{teacherId}})` | 同 | ✅ |
| 团队班级查询 | `teamClass.findMany({where:{teamId:{in:teamIds}, ...classScope}})` | 同（`teamIds.length ? … : []` 等价于 `if (teamIds.length>0)`） | ✅ |
| 去重 | `[...new Set([...direct, ...team])]`（数组） | `new Set([...])`（集合） | ✅ 成员判据等价 |
| 软删过滤 | **无**（`Class/TeacherClass/TeamClass` 无 `deletedAt` 列，schema 实测） | **无** | ✅ 等价（两侧同样不适用） |
| 空集语义 | 调用侧 `canTeacherManageClasses` 空集放行 | `canManageProjectClasses` 空集放行 | ✅ |

**运行时层（我自建的行为等价矩阵，6/6 一致）**——以「规范实现」的宿主端点（`updateClass` 路径守卫）与「内联副本」的宿主端点（`createProject` 的 `body.classIds` 守卫）互为判定器：

```
sid=s1 cX1(直连,s1)  getVisibleClassIds=VISIBLE  visibleClassIdSet=VISIBLE  AGREE
sid=s1 cX2(团队,s1)  getVisibleClassIds=VISIBLE  visibleClassIdSet=VISIBLE  AGREE
sid=s1 cF (他人,s2)  getVisibleClassIds=HIDDEN   visibleClassIdSet=HIDDEN   AGREE
sid=s2 cX1(直连,s1)  getVisibleClassIds=HIDDEN   visibleClassIdSet=HIDDEN   AGREE
sid=s2 cX2(团队,s1)  getVisibleClassIds=HIDDEN   visibleClassIdSet=HIDDEN   AGREE
sid=s2 cF (他人,s2)  getVisibleClassIds=HIDDEN   visibleClassIdSet=HIDDEN   AGREE
V5 行为等价矩阵: 全部一致 = true  单元格数 = 6
```

**结论：等价（直连∪团队 ✅ / 学校维度 ✅ / 软删维度 N/A 且两侧一致）⇒ 不判阻断。**

**漂移风险评估（登记项 C6-6，低-可维护性）**：这是本仓的老毛病（round 3 曾专门收敛重复助手函数）。当前两份实现**没有任何共享常量或测试联动**——一旦将来只改一处（例如给 `getVisibleClassIds` 增加 `deletedAt` 过滤、或改学校维度语义），另一处会静默漂移，且**两侧的现有用例都不会红**。建议的收敛形态（不新增文件、不增 import 边的前提下）：
1. 首选：把 `getVisibleClassIds` 下沉到一个**已存在**的 utils 文件并双向 import（不新增文件 ⇒ 146 不变；需复算 `cycle-check` 边数与 `check-layers` 未分层数）；
2. 次选：`projectController` 直接 import `teamController`（仅 +1 边，把 164 基线**显式更新为 165**——本轮把它锁成不变量是为了守门禁，但"为了不增 1 条边而复制一份授权判据"本身有**安全漂移**成本，建议在下一轮由 Captain 显式拍板取舍）；
3. 兜底：为两份实现共用一个等价性用例（把本报告的 6 格矩阵固化为测试），漂移即红灯。

---

## 6 V6 未闭合项登记（如实登记，不掩盖）

| 项 | 状态 | 本轮独立取证 |
|---|---|---|
| **R-1：`createAssignment` 的 `questionIds` / `classIds` 归属校验** | **未闭合**（B 未落地，Captain 已裁决「转下一轮」） | 静态实测：`teacherController.js:738` `prisma.question.findMany({ where: { id: { in: questionIds }, deletedAt: null } })` —— **无 `teacherId`**；`:774` `classIds.map((cid) => ({ classId: +cid }))` —— **无可见集校验**。二者与 A §2.1 #38 的判定一致。 |
| 探针是否已回滚 | **已回滚** | `assignment-q9-branches` **9/9 绿**（§2.3 定向复跑）；`git diff` 中该单测不在改动面（§7） |
| 阻塞原因是否成立 | **成立且已复核** | 该单测用 `jest.unstable_mockModule` 把 prisma 打成**部分替身**并**逐字断言查询形状**（`toHaveBeenCalledWith({where:{id:{in:[…]},deletedAt:null}})`）⇒ 任何正确实现都会让它变红。B 的两份探针原始输出（§6）与我的复跑一致。 |

> **对结论的影响**：R-1 是**已知并已裁决的未闭合项**，不作为本轮阻断依据；但它与 C6-1 叠加后，攻击者仍有「他人题 + 他人班」的建作业面（A #38）——建议下一轮**同批**处理（两者都需要动 `server/test/`，可一次性授权 C 侧改替身与新增用例）。

---

## 7 V7 改动面与旁证

```
$ git status --porcelain -uno
 M pipeline-status.md                                   ← Captain 的状态文件
 M server/src/application/use-cases/submission.use-cases.js
 M server/src/controllers/checkerController.js
 M server/src/controllers/projectController.js
 M server/src/controllers/teacherController.js
 M server/src/controllers/teamController.js
 M server/src/domain/ports/repositories.js
 M server/src/infrastructure/persistence/submission.repository.js
 M server/test/integration/ownership-guards.test.js
（`git status --porcelain` 全量：未跟踪项均为既有清单——.VSCodeCounter/ .agent-teams/ .cw_skill/ docs 报告等，
  本轮**未新增任何未跟踪文件**）

$ find server/test -type f -newermt "2026-10-11 01:13:00"      ← round 6 窗口起点
server/test/integration/ownership-guards.test.js                ← ★ 唯一被改的测试文件
$ find server/test -type f -exec stat -f "%Sm %N" … | sort -r | head -3
23:18:31 server/test/e2e/.e2e-state.json
22:19:26 server/test/e2e/playwright.local.config.js
22:05:14 server/test/fixtures/students_missing_name.xlsx        ← 其余既有测试文件 mtime 零改动

$ find client/src client/dist -type f -newermt "2026-10-11 01:13:00"   → （空）
$ find tests -type f -newermt "2026-10-11 01:13:00"                    → （空）

$ for f in $(git diff --name-only); do stat -f "%Sm %N" -t "%m-%d %H:%M:%S" "$f"; done
10-11 01:24:22 …teamController.js   10-11 01:24:35 …pipeline-status.md/checkerController.js
10-11 01:24:42 …projectController.js 10-11 01:24:48 …submission.use-cases.js/repositories.js/submission.repository.js
10-11 01:25:00 …teacherController.js 10-11 01:25:50 …ownership-guards.test.js
```

⇒ **改动面与 B 的申报完全一致**；`client/`、`client/dist`、`tests/` 在 round-6 窗口内**零写入**（`find -newermt` 旁证，纪律 8）；`server/test` 下仅 `ownership-guards.test.js` 被改。

**旁证中的一处诚实记录**：`server/uploads/`（`.gitignore:21` 忽略的运行期目录）中 `project-submissions`（01:31）与 `project-questions`（01:32）两个目录的 mtime 在测试窗口内变化（子目录增删，来自 jest 集成套件与探针创建/清理 project）。**无跟踪文件受影响**，且不属于 constraints §1/§2 的保护对象；此处登记以免「零写入」被理解为全仓库绝对零变更。

---

## 8 缺陷分级

| 编号 | 级别 | 标题 | 证据 | 处置 |
|---|---|---|---|---|
| **C6-1** | 🔴 **阻断 / 高** | `updateTeam.classIds` **无内容校验** ⇒ 可把任意他人班级挂进自有团队，随后对该班级执行全部写操作（跨租户改班、重置他生口令、越权建学生） | §4.3 BY1/BY2/BY3/BY5/BY6/BY7（HTTP 200 + 真实写库 + 对拍） | **回流 B**（最小修法契约见 §4.3） |
| C6-2 | 🟡 低-中 | `updateTeam.teacherIds` 无内容校验（成员/创建者可增删任意教师） | §4.3 末段；R6-P10 拍板项 | 随 R6-P10 拍板；建议同批加「被加入者须与团队同校/可见」判据 |
| C6-3 | 🟡 低 | 非数组 `teamIds` → 500（TypeError）；重复 id → 500（P2002） | B15/B16/L16 | 零写入、无越权；**两者在改动前同型**（写库点 vs 守卫点）；建议下一轮顺手做参数类型前置校验（不影响判据） |
| C6-4 | 🔵 信息 | `updateClass` 不带 `?schoolId=` → 500（Prisma `schoolId: null`） | M8；`git diff` 证明 `data:{name, schoolId}` 为**既有行** | 既有形态，非本轮回归；登记待产品/前端口径确认 |
| C6-5 | 🔵 信息 | 文档口径：段1 期望应为 **960**（非 938） | §2.2 | 请 Captain 在 `pipeline-status.md` 更正，避免下一轮误判 |
| C6-6 | 🔵 低（可维护性） | `projectController` 内联复制可见集实现 | §5.2（等价但无联动） | 登记「建议后续收敛为单一实现」，三种形态见 §5.2 |
| C6-7 | 🔵 信息 | `bind-check` 绑定数 B 报 **511** / 本轮实测 **512**（违规均为 0） | §3 | 差异 1 条，疑为 B 在最后一次写文件前采样；不影响判据 |

---

## 9 未做项与残留风险

| # | 未做项 | 原因 / 影响 |
|---|---|---|
| 1 | **突变（负向）验证**：临时注释守卫确认对应用例恰好变红 | C 为**只读角色**，不得改 `server/src`。判据改由「独立探针 + 字段级对拍」承担（本轮 83 请求已成对拍正反两面） |
| 2 | 像素 sha1 / axe 无障碍复核 | 本轮**零 client 改动**（`find -newermt` 实测）⇒ 判据 5 条件维持 round-5 状态，无需重跑 |
| 3 | worker / AI 批改队列的运行时实测 | 不联网、不启常驻服务；「越权提交行进入 AI 队列」的结论沿用 A 的推理链（`gradingWorker.js:128`）。本轮已从**源头**封死（D1/D2/D10 零写入） |
| 4 | 性能基准 | 本仓无该装置；新增守卫为每请求 1–2 次索引查询，未测 |
| 5 | 全库快照对拍 | `exam_system_test` 是 jest 共享库（`setup.js` 反复清理），全库对拍无意义；改用「夹具前后字段级对拍 + leftover 计数 = 0」 |
| 6 | 反向证明：`classIds` 修复后 BY 链失效 | 属下一轮 B 的修复验证范围（C 届时复跑同一探针即可，脚本与判据已固化在本报告 §4.3） |
| R-a | `R6-P9`（团队班级是否应授予写权限） | 产品语义拍板项；**C6-1 修复后**该语义的最坏放大面被消除（团队内容只能来自成员自己的可见集），可独立拍板 |
| R-b | `R6-P10`（成员互改名单治理） | 拍板项；L5/BY6 实测证明「成员可改」仍是现状 |
| R-c | `getChecker`（读）未收窄 | A/B 已登记的读侧缺口（低-中），不在本轮 16 项内 |

---

## 10 本轮结论

> **V1 PASS**：4 处摘要 · **68 套件 / 1059 例 / 0 failed**（四段 960+17+61+21；段1 期望值 938 为陈旧口径，见 C6-5）· 重点套件 ownership-guards **48** · assignment-q9-branches **9/9** · submission.use-cases **32** · persistence-repositories **12** 全绿。
> **V2 PASS**：cycle **71/164/SCC 0** · layers **71/0/47** · arch **0/47/10**（GodFile 未变 11）· hard **0/0/0** · bind-check **self-test 3/3 + 真仓 0 违规** · 文件 **146** · studentController **799 行且 0 行改动（git diff 空）**。
> **★V3 阻断**：83 条自建对抗性请求中，**A §3.3 的原始越权链已被彻底斩断（AC1-AC4 全 403 + 零写入），但发现 6 条绕过写入** —— 根因是 `teamController.updateTeam` 对 `classIds` **无任何内容校验**，攻击者（**无需受害者配合**）可「把他人班级挂进自有团队 → 班级进入其可见集 → 对该班级改名 / 重置其学生口令（账号接管）/ 越权建学生」全部 200 并真实落库。**按任务书「任何一条能绕过即判阻断」⇒ 本轮判「需回流 B」。**
> **★V4 PASS**：5 处删除全部可解释（2 处变量声明扩行 + S3 的 3 行旧断言），**0 处放宽 / 0 处 objectContaining / 0 处 expect.any**；翻转后的 S3 保留读侧 403 原意并新增 3 条 DB 零写入断言；26 例新增中 **16 例带 DB 级证据**；T1-T18 逐字未动。「有提交仍 403」的字面场景因修复后不可再构造，我用**存量脏数据探针（D9 = 403）**独立补证。
> **★V5 PASS**：内联副本与 `getVisibleClassIds` **文本逐行同形 + 运行时 6/6 判定一致**（直连∪团队、学校维度、软删维度 N/A 且两侧一致）⇒ 不判阻断；**漂移风险登记为 C6-6**，建议后续收敛为单一实现（三种形态与取舍见 §5.2）。
> **V6 登记**：`createAssignment` 的 `questionIds`/`classIds` 归属校验**未闭合**（实测静态确证），B 的探针**已回滚**、`assignment-q9-branches` 保持 **9/9 绿**；与 C6-1 建议在下一轮同批修复（可一次性授权 C 侧改单测替身）。
> **V7 PASS**：改动面与 B 申报一致；`client/`、`client/dist`、`tests/` 窗口内零写入；`server/test` 仅 `ownership-guards.test.js` 被改。
>
> ### 最终判定：**需回流 B（1 项阻断：C6-1）**
> 修复面**极小且已给出契约**（`updateTeam` 增 1 处 `classIds ⊆ getVisibleClassIds` 守卫 + 位置提到写库段之前 + C 侧补 4-6 条用例）；修复后本报告 §4.3 的同一探针可直接复跑判绿。

---

## 附录 A 复算命令清单（可逐字复跑）

```bash
# V1
ROUND=06 bash docs/pipeline/scripts/unblock-g2.sh
grep -E "^Test Suites:|^Tests:" docs/pipeline/test-round-06.log
grep -cE "^FAIL " docs/pipeline/test-round-06.log          # → 0

# V2
node scripts/gates/cycle-check.mjs && node server/scripts/check-layers.mjs
node scripts/gates/arch-metrics.mjs && node scripts/gates/hard-metrics.mjs
node scripts/gates/bind-check.mjs --self-test && node scripts/gates/bind-check.mjs
find server/src client/src -type f | wc -l                  # → 146
wc -l < server/src/controllers/studentController.js         # → 799
git diff --stat -- server/src/controllers/studentController.js   # → 空

# V3/V5（探针；PORT=0，仅 exam_system_test）
TEST_URL="$(node -e '<从 server/.env 只换库名>')"
cd server && DATABASE_URL="$TEST_URL" PORT=0 node /tmp/r6c-probe.mjs      # 83 请求
cd server && DATABASE_URL="$TEST_URL" PORT=0 node /tmp/r6c-probe-v5.mjs   # V5 6 格矩阵
```
