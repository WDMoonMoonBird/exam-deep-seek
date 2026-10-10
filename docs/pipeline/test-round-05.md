# test-round-05 —— 安全修复回归验证（S-2 越权收口 + S-6）· 对抗性验证

> 轮次：**05（回归验证 / 安全修复）** ｜ 日期：**2026-10-11（凌晨）**
> 被验对象：**工作树未提交改动**（HEAD = `7b874b1`；`git status --porcelain -uno` 有 4 个 M + 2 个新增未跟踪）—— 即 `docs/pipeline/refactor-round-05.md`（B）的全部产物
> Agent C 技能：`tech-test-automation` ｜ 立场：**对抗性**（不采信 B 自测，自建探针打破权）
> 上游输入：`docs/pipeline/project-constraints.md`（13 条纪律 / 四段口径 / 门禁判据）· `docs/pipeline/audit-round-04.md` §2.1 S-2 / §2.2 S-6 · `docs/pipeline/refactor-round-05.md` §9 · `pipeline-status.md`

---

## 0 约束遵守声明

| 约束 | 执行情况 |
|---|---|
| 只写 2 个产物 | ✅ 仓库内唯一写入 = `docs/pipeline/test-round-05.md`（本文件）+ `docs/pipeline/test-round-05.log`（由 `unblock-g2.sh` 按 ROUND=05 生成）。全部探针/冻结树/日志副本落 `/tmp`（`/tmp/c5-*`） |
| 禁 git 写操作 | ✅ 只读命令：`rev-parse / status / diff / show / archive / ls-files`；无 clean/stash/checkout/reset/restore |
| 禁重建 client/dist、禁重跑 ledger-check | ✅ 未构建、未跑 ledger-check；`client/dist` 窗口内写入 **0** |
| 临时服务端口 | ✅ 自建探针的 app 子进程**显式 `PORT=3199`**（31xx 段）；全程 `:3000`/`:5173` 监听数恒为 **0**（§5.1）；探针结束 `:3199` 亦释放 |
| 不写生产库 | ✅ 全部读写只连 `exam_system_test`（探针首行硬断言库名，不符即 exit 2） |
| 探针写入事后清理 | ✅ `c5_` 夹具自建自清，终态残留 users/classes/schools/teams/submissions **全 0**（§6.5 独立复核） |
| 禁止联网 | ✅ 零出网；未跑 npm audit |
| 纪律 7「先冻结再测」 | ✅ 改动前后对拍用 `git archive 7b874b1` → `/tmp/c5-freeze`（1016 个被跟踪文件），与活树分别起 app 同口径打同一批请求 |
| 纪律 8「git status 对未跟踪目录无证据力」 | ✅ 对 `tests/`（`git ls-files tests` = 0）与 `client/dist` **不用 git status 下结论**，改用 `find -newermt` + mtime 旁证（§7.3） |
| 纪律 10「行号/计数以本轮实测为准」 | ✅ 全部门禁数字、行数、用例数本轮自跑；未采信 B 报数 |

---

## 1 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| V1 | 后端全量四段 | 4 处 `Test Suites:` / **68 套件** / **1033 例** / **0 failed** | **4 处摘要**；65+1+1+1 = **68**；934+17+61+21 = **1033**；**0 failed**；exit 0 | ✅ **PASS**（首次运行 1 例偶发超时，见 §2.2） |
| V1b | 新增越权套件在跑且逐例通过 | 22 例全绿 | `PASS test/integration/ownership-guards.test.js`；定向 `Tests: 22 passed`，22/22 ✓ | ✅ **PASS** |
| V2 | bind-check 自测 / 真仓 | 3/3 检出；0 违规 exit 0（169 模块 / 511 绑定） | **3/3 检出 · SELF-TEST PASSED · exit 0**；**169 / 511 / 0 违规 / exit 0** | ✅ **PASS** |
| V2 | cycle-check | 71 文件 / **边 164** / SCC 0 | **71 / 164 / SCC 0 / 自环 0 / PASS** | ✅ **PASS（边数仍 164）** |
| V2 | check-layers | 71 / 0 / 47 | **71 / 0 / 47** | ✅ **PASS** |
| V2 | arch-metrics | 0 / 47 / 10 | **0 / 47 / 10**（+观察带 19）；GodFile 清单**不含** studentController | ✅ **PASS** |
| V2 | hard-metrics | 0 / 0 / 0 | **0 / 0 / 0**（样本 41 文件） | ✅ **PASS** |
| V2 | 文件数 / GodFile 余量 | 146；studentController ≤ 800 | **146**；`wc -l` = **799**（≤800，余量 1 行） | ✅ **PASS（高风险热区）** |
| **V3** | 越权是否真的被堵死 | 5 个写端点 + S-6 全部 403 且零写入 | **88 例越权/绕过尝试全部未突破**（403/1003 或 401，`dbEqual=true`）；冻结树同批用例为 **200 且真实写库** | ✅ **PASS（无成功绕过）** |
| V3b | 合法路径不误伤 | 本人 / 团队班级、本人学生 200 且形状不变 | 6 例合法路径 **200 全绿**（含团队班级 T14 语义）；1 例语义收窄（§4.5） | ✅ **PASS** |
| V4 | 端口无残留 | :3000/:5173 无监听、无残留进程 | 全程 **0 行**；无探针残留进程 | ✅ **PASS** |
| V4b | GodFile 10 + 可读性 | 计数 10、写法可读 | **10**；>500 观察带 **19**；新增 2 条长行（200/141 字符）但语义单调用 + 注释齐备 | ✅ **PASS（余量 1 行 = 热区）** |
| V5 | 复核新遗留 saveDraft/submit | 独立复现该证据 | **复现成立**：跨班草稿 200 + 落库 `status=draft`；跨班提交 200 + 落库 `status=submitted` | ⚠️ **成立（下一轮执行集候选）** |
| V6 | 改动面 / 旁证 | 声明一致 | 2 源文件 M + 2 新增未跟踪；既有测试文件 mtime **零改动**；client/dist/tests 窗口内 **0 写入** | ✅ **PASS** |

**总判：PASS（无阻断）**，附 3 项轻微/优化与 2 项下一轮候选（§8/§9）。

---

## 2 V1｜后端全量回归

### 2.1 命令与原始摘要（canonical 日志 = `docs/pipeline/test-round-05.log`）

```bash
ROUND=05 bash docs/pipeline/scripts/unblock-g2.sh   # → 退出码: 0
# 首次运行因日志已存在被脚本拒绝（归档保护），确认首跑为偶发失败后以 FORCE=1 重跑：
FORCE=1 ROUND=05 bash docs/pipeline/scripts/unblock-g2.sh
```

```
Test Suites: 65 passed, 65 total      ← 段1（基线 64 + 新增 ownership-guards 1）
Tests:       934 passed, 934 total    ← 基线 912 + 22
Test Suites: 1 passed, 1 total        ← 段2 fact-extractor
Tests:       17 passed, 17 total
Test Suites: 1 passed, 1 total        ← 段3 rule-executor
Tests:       61 passed, 61 total
Test Suites: 1 passed, 1 total        ← 段4 rule-mutator
Tests:       21 passed, 21 total
```

复算：`grep -cE '^Test Suites:' docs/pipeline/test-round-05.log` → **4**；`grep -cE '^FAIL'` → **0**；套件 65+1+1+1 = **68**；用例 934+17+61+21 = **1033**。与 refactor-round-05 §4 声明的增量（67→68 套件、1011→1033 例）**逐位吻合**，差值恰好等于本轮新增文件。

### 2.2 ⚠️ 首次运行的 1 例偶发超时（完整披露，含反证）

| 运行 | 命令 | 结果 | 耗时 |
|---|---|---|---|
| 第 1 次（我并发跑门禁时） | `ROUND=05 bash …` | **1 failed** / 933 passed / 934；套件 65，段2-4 被 `&&` **短路未跑** → 仅 1 处摘要 | 202.5 s |
| 隔离复跑 ×2 | `--testPathPatterns=admin-teacher-delete` | **4 passed / 4**，1.13 s / 1.08 s | — |
| 第 2 次（全量段1，无并发） | 同 npm test 段1 | **65 passed / 934 passed / 0 failed** | 172.2 s |
| 第 3 次（canonical 四段） | `FORCE=1 ROUND=05 …` | **全绿 / exit 0** | 172.2 s + 1.6 s |

失败明细（原始日志第 691-705 行）：`test/integration/admin-teacher-delete.test.js › 删除教师 → 成功，且该教师登录被拒` → `thrown: "Exceeded timeout of 30000 ms for a test."`（`testTimeout: 30000`，`test/jest.config.js`）。**该套件与本轮改动零交集**（只打 `/api/admin/teachers/:id`、`/api/auth/login`、`/api/teacher/questions`）。历史日志 `test-round-00..03.log` 中 `Exceeded timeout` 计数均为 **0**，本轮首次出现。
日志内无任何 `EMFILE / EADDRINUSE / ECONNREFUSED / MaxListeners / P2024` 告警（计数 0）；`ulimit -n` = 1048575。**判定：环境性偶发超时（load 相关），非本轮改动引入，非断言型回归** —— 依据是「同命令无并发复跑即全绿 + 隔离 2/2 全绿 + 该套件不触达被改代码 + 首跑耗时比基线慢 18%」。
第 1 次日志已完整保留在仓库外：`/tmp/c5-test-round-05-run1-FLAKY.log`（1315 行），供 Captain 复核。

### 2.3 新增套件定向复核（B 报 22 例）

```bash
cd server && DATABASE_URL="<exam_system_test>" NODE_OPTIONS=--experimental-vm-modules \
  npx jest --config test/jest.config.js --runInBand --forceExit --testPathPatterns="ownership-guards" --verbose
```
```
PASS test/integration/ownership-guards.test.js
Tests: 22 passed, 22 total          ← 逐例 ✓ 计数 = 22（T1..T18 + S1..S4）
```
全量日志中该文件亦为 `PASS`（第 368 行）。**确认「真的在跑」且逐例通过**（非 skip/非 only）。

---

## 3 V2｜五项门禁 + 不变量（活树实测，原始输出）

```
== cycle-check ===      扫描 71 文件 / 164 条相对导入边 · SCC(|>1|)=0 · 自环 0 · 结论：PASS   [exit 0]
== check-layers ===     文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个                  [exit 0]
== arch-metrics ===     layerViolations 0=0 · unmigrated 47=47 · godfileOver800 10=10 · >500 19=19 · PASS [exit 0]
   GodFile >800 清单（10 项）：Submit.vue(1519) checkerService(1280) teacherController(1278) Doc.vue(1106)
     deepseek(1051) ruleExecutor(1010) ReviewDetail(988) QuestionEdit(983) reviewController(965) ProjectQuestionEdit(862)
     ⇒ 不含 studentController.js ✅
== hard-metrics ===     hex6 0=0 · important 0=0 · modalConfirm 0=0（样本 41 文件）· PASS      [exit 0]
== bind-check --self-test ===  synthetic 5 scanned / violations 3 (3 期望) · SELF-TEST PASSED · [exit 0]
== bind-check（真仓）===  modules scanned 169 · named bindings 511 · unresolved 4(登记) · external 1(登记) · VIOLATIONS 0 [exit 0]
== find server/src client/src -type f | wc -l ===  146
== wc -l server/src/controllers/studentController.js ===  799
```

- **边数 164 不变** ✅（新增守卫只用已 import 的 `getVisibleClassIds` + `prisma`，零新增跨文件边）。
- **studentController 799 ≤ 800** ✅（另一口径独立复算：自写扫描器同口径 `>800 = 10`、`>500 = 19`，且 799 落在观察带内）。
- bind-check **负向能力成立**（3/3 检出合成坏绑定 + exit 0），**真实仓库 0 违规 + exit 0** ⇒ 既非「永远绿灯」也非「永远红灯」。

---

## 4 ★V3｜对抗性越权验证（本轮核心）

### 4.0 装置（**完全自建，未复用 B 的脚本或 /tmp 产物**）

- 探针：`/tmp/c5-idor-probe.mjs`（30KB，自写）；夹具前缀 **`c5_`**（B 用 `to_`）；独立学校 29951/29952；4 名教师 × 6 个班级 × 8 名学生 × 4 份作业。
- 拓扑覆盖 5 类关系：**跨校**（tB∈校B）、**同校非本人**（tC∈校A）、**团队**（tC∈teamT_A 且 classA2∈team）、**多校教师**（tD∈校A+校B、同时在两校各有直连/团队班级）、**本人**（tA）。
- 请求：真 HTTP（`fetch`）打自建 app 子进程 `PORT=3199`（库 `exam_system_test`）；token 走真实 `POST /api/auth/login`。
- **每一例 DB 零写入对拍**：请求前后对 9 张表的**字段级**快照（class/user 全字段含 bcrypt 哈希 / studentClass / teacherClass / assignmentClass / teamClass / teamTeacher / assignment / submission）做 `JSON.stringify` 全等比较，逐例打印 `dbEqual`。
- **改动前对照**：同一探针用 `C5_ROOT=/tmp/c5-freeze`（`git archive 7b874b1`）再跑一遍，得到 before/after 矩阵。
- 规模：**108 例**，其中越权/绕过尝试 **88 例**。

### 4.1 before/after 矩阵（关键行，原始输出对拍）

| 用例（教师 B → 教师 A 的资源） | 改动前 7b874b1 | 改动后（活树） | 读法 |
|---|---|---|---|
| `PUT /teacher/classes/A1` (?schoolId=B) | **200 / db 已改** | **403 / 1003 / db 未改** | 跨校改名被堵 |
| `DELETE /teacher/classes/A1` (?schoolId=B) | **200 / db 已改**（班级真被删，级联删 3 张关联表） | **403 / 1003 / db 未改** | 跨校删除被堵 |
| `PUT /teacher/classes/A2`（他人团队班级） | **200 / db 已改** | **403 / 1003 / db 未改** | 团队边界外不可写 |
| `PUT /teacher/students/sA`（改名） | **200 / db 已改** | **403 / 1003 / db 未改** | — |
| `PUT /teacher/students/sA`（抢学号） | **200 / db 未改** | **403 / 1003 / db 未改** | 旧版返回 200 但字段未变（因非 tmp_ 前缀），仍属无校验 |
| `PUT /teacher/students/sA` {classId=B1} | **200 / db 已改** | **403 / 1003 / db 未改** | 旧版可把他人学生抢走 |
| `DELETE /teacher/students/sA` | **200 / db 已改**（学生被硬删，连带提交） | **403 / 1003 / db 未改** | — |
| `PUT …/students/sSoft/reset-password`（软删学生） | **200 / db 已改** | **403 / 1003 / db 未改** | deletedAt 不构成可见性 |
| `sA GET /student/assignments/asgB`（跨班） | **401**（sA 已被上一例越权删除 ⇒ token 失效） | **403 / 「无权访问该作业」** | 旧版连删学生都能做，故 before 列被自身破坏污染 |
| `sOut（已转出班级）GET asgA` | **200 / 泄漏** | **403 / 1003** | S-6 收窄生效 |

> **before 列的自污染即最强证据**：改动前教师 B 一路 200 地把 A 的班级与学生**真实删除**，导致后续用例的 token/资源全部失效（404/401）。这正是 audit-04 §2.7-3 悬空的「未实际发过一条越权 HTTP 请求」被本轮补上后的实证。

### 4.2 V3.1/V3.2 跨教师写操作：**全部 403 + 零写入**

```
--- V3.1 班级 ---
  OK  B-updateClass-A1(schoolId=B)                 -> 403/1003 dbEqual=true
  OK  B-deleteClass-A1(schoolId=B)                 -> 403/1003 dbEqual=true
  OK  B-updateClass-A1(伪传受害校 schoolId=A)         -> 403/1003 dbEqual=true
  OK  B-deleteClass-A1(伪传受害校 schoolId=A)         -> 403/1003 dbEqual=true
  OK  B-updateClass-A1(无schoolId)                  -> 403/1003 dbEqual=true
  OK  C-updateClass-A1(同校非本人)                    -> 403/1003 dbEqual=true
  OK  C-deleteClass-A1(同校非本人)                    -> 403/1003 dbEqual=true
  OK  B-updateClass-A2(他人团队班级)                   -> 403/1003 dbEqual=true
  OK  B-updateClass-A1-无token                      -> 401/1002 dbEqual=true
--- V3.2 学生 ---
  OK  B-updateStudent-sA(改名 / 抢学号 / 改班级) ×3    -> 403/1003 dbEqual=true
  OK  B-deleteStudent-sA                           -> 403/1003 dbEqual=true
  OK  B-resetPassword-sA                           -> 403/1003 dbEqual=true（响应体不含该生学号）
  OK  C-updateStudent-sA / C-resetPassword-sA       -> 403/1003 dbEqual=true
  OK  B-deleteStudent-sSoft / B-resetPassword-sSoft -> 403/1003 dbEqual=true
  OK  A-resetPassword-不存在(404) / A-updateStudent-不存在(404)  -> 404/1004（既有分支原位）
```
- **403 契约逐字一致**：`{code:1003, message:'无权操作', data:null}`；`reset-password` 越权响应**不含学号**（无状态泄露）。
- **零写入**：`dbEqual=true`（含 bcrypt 哈希逐字节比较、三类关联表计数、提交行数）。`RESTORE: sA 的 password hash 在全部越权尝试后仍可 `bcrypt.compareSync(原口令)` 通过`（探针内断言）。

### 4.3 S-6 跨班学生作业详情：**403 且零泄漏**

```
  OK  sA-GET-asgB(跨班)        -> 403/1003 「无权访问该作业」 dbEqual=true   响应体递归不含题干/评分标准/参考答案
  OK  sB-GET-asgB(本班)        -> 200/0  data.assignment + data.submissions 齐备
  OK  sA-GET-asgA(本班)        -> 200/0
  OK  sA-GET-asgNoClass(无投放) -> 403/1003
  OK  sA-GET-asgSoftDel(软删作业) -> 200/0   ← 复核 B §3 第 3 条「软删作业仍可查看」成立
  OK  sA-GET-不存在作业         -> 404/1004「作业不存在」（既有 404 原位）
  OK  sOut(已转出班级)-GET-asgA -> 403/1003  ← 复核 B §3 登记的语义收窄
```

### 4.4 ★对抗性绕过尝试清单（**这是本轮最重要的部分**）

| # | 绕过向量 | 具体输入 | 结果 | 是否绕过 |
|---|---|---|---|---|
| 1 | **id 类型强转**（班级 PUT，8 变体） | `6087` `06087` `+6087` `6087.0` `0x17c7` `␣6087␣` `6087.000` `6.087e3` | 全 **403/1003** | ❌ 未绕过 |
| 2 | **id 边界值**（班级 PUT） | `-6087` `99999999999999999999` `abc` `NaN` `undefined` `null` `1e999` `6087abc` `999999999` | 全 **403/1003** | ❌ 未绕过 |
| 3 | **DELETE 强转**（最危险：写成 200 即越权删除） | `06087` `6087.0` `0x17c7` `␣6087␣` `+6087` `-6087` | 全 **403/1003**，班级仍在 | ❌ 未绕过 |
| 4 | **学生 id 强转**（PUT + RESET 各 8 变体 = 16 例） | 同 #1 全部形态 | 全 **403/1003** | ❌ 未绕过 |
| 5 | **学生 id 边界**（DELETE） | `-24549` → 403；`abc`/`1e999`/`1e20` → **500**（Prisma NaN/Infinity 抛错，**零写入**） | 无写入 | ❌ 未绕过（500 属既有错误处理口径，§8-3） |
| 6 | **受害 id 放 body** | `PUT /teacher/classes/B1` body 带 `{id: A1, classId: A1}`；`RESET /students/sB` body 带 `{id: sA}` | **200 但只改了自己的 B1/sB**（A1/sA 未动，`dbEqual` 对 A1/sA 无变化） | ❌ 未绕过（body id 被忽略） |
| 7 | **schoolId 参数伪造/畸形** | `?schoolId=abc` / `=0` / `=`(空) / `=A&B`(数组) / `[]=A` / 伪传受害校 A | 全 **403/1003**；读端点 `GET /teacher/classes?schoolId=B` 的可见集 = `[classB1]`，**不含 classA1** | ❌ 未绕过（「UI 可见集 == 守卫放行集」经真实夹具证实） |
| 8 | **软删除对象** | 软删学生（`deletedAt`）→ DELETE / RESET；软删作业 → 学生详情 | 软删学生 **403**；软删作业 **200**（= B 声明，非越权） | ❌ 未绕过。`Class` 模型**无 deletedAt 列**（schema 实测）⇒「软删班级」向量在本仓不存在 |
| 9 | **team 关系边界** | 团队内（tC）改团队班级 → **200 ✅ 合法**；团队外（tB）改同一班级 → 403；同校非团队成员改他人班级 → 403 | 边界正确 | ❌ 未绕过 |
| 10 | **同一 teacherId、不同 school** | 多校教师 tD：改校A直连班级 `?schoolId=A` → 200；同班级伪传 `?schoolId=B` → **403**；校B团队班级 `?schoolId=A` → **403**；无/畸形 schoolId（不过滤）→ 命中本人可见集 | 与「当前学校可见集」自洽 | ❌ 未绕过（见 §4.5 语义判定） |
| 11 | **伪造/缺失令牌** | 无 token → 401/1002；学生 token 打教师路由 → 403（`requireRole`） | — | ❌ 未绕过 |
| 12 | **不存在的资源 id** | 班级 999999999 → 403（旧实现 500）；学生 999999999 → 404（PUT/RESET 原位）/ 403（DELETE 守卫先行） | 一致且零写入 | ❌ 未绕过 |

**★ 结论：88 例越权/绕过尝试，0 例成功越过新守卫。** 未发现任何可以读到/改到/删到他人资源的路径；所有拒绝路径均满足 **状态码 403 + code 1003 + DB 逐字段零变化**。

### 4.5 合法路径未误伤（含 B 点名的 3 个「我可能错」点复核）

```
  OK  A-PUT-own-classA1(改名→改回)           -> 200/0 '更新成功'   dbEqual=false（确实改名）
  OK  A-PUT-own-student-sVictim(改名)        -> 200/0 '更新成功'   dbEqual=false
  OK  A-RESET-own-student-sVictim2           -> 200/0 '密码已重置为学号（c5_stuVictim2）' dbEqual=false
  OK  A-DELETE-own-student-sVictim           -> 200/0 '删除成功'   dbEqual=false
  OK  A-DELETE-own-classA3                   -> 200/0 '删除成功'   dbEqual=false
  OK  C-PUT-team-classA2(schoolId=A)         -> 200/0 '更新成功'   ← 团队班级分支未被过度收窄
  OK  D-PUT-own-classDA(schoolId=A)          -> 200/0
  OK  C-GET-classes 可见集 = [classA2]（团队班级） ← 读/写两侧可见集一致
```

| B 的「我可能错」 | C 的独立复核 | 判定 |
|---|---|---|
| ① `getSchoolId` 取 query 是否误伤合法调用 | 用真实夹具对拍：读端点 `getAllClasses` 与守卫**同一可见集**（B 的可见 = [classB1] 不含 classA1；C 的可见 = [classA2] 团队班级且改它 200）。多校教师 tD 在校A 时管理**校B** 团队班级 → 403，属**正确收窄**（读端点同样不下发该班级；切校后即可见） | ✅ **认同 B 的判定** |
| ② `updateClass` 写入的 schoolId 取自 query 是否影响合法流 | 现行 UI 走 `switch-class` 端点；且改动前该行为会把班级 `schoolId` 改写成当前校（**旧代码即存在的数据破坏面**），新守卫反而挡住了这条误用 | ✅ **无影响（且更安全）** |
| ③ 799 行在 C 的口径下是否 ≤800 | `wc -l` = **799**；`arch-metrics` 同口径 **799 且不入 >800 清单**；独立扫描器同口径 `>800 = 10` | ✅ **≤800 成立** |

**唯一登记在案的合法路径收窄**（照实上报，非缺陷）：`PUT /teacher/classes/:id` **不带 schoolId** → **500/2001**（`C-PUT-team-classA2(无schoolId)`、`D-PUT-team-classB2(无schoolId)`、`D-PUT-own-classDA(?schoolId=abc)`）。**改动前同输入同为 500**（before/after 两列一致、`dbEqual=true`）⇒ **既有缺陷、与本轮改动无关**：`updateClass` 把 `schoolId`（null/NaN）写回非空列 → Prisma 抛错。UI **不可达**：`client/src/api/request.js:16-18` 对教师请求统一注入 `currentSchool.id`。登记为 §8-3（优化）。

---

## 5 V4｜复核 B 自陈的两项风险

### 5.1 ① 端口残留

```
lsof -nP -i :3000  → 0 行     lsof -nP -i :5173 → 0 行
lsof -nP -i :3001 -i :3100 -i :3199 → 0 行（探针跑完亦释放）
ps: 无任何探针/游离 node 进程（仅 Jest 运行期进程 + 用户既有 playwright-mcp）
```
**根因复核（读源码，非采信）**：`server/src/app.js:152` 在**模块加载时**执行 `start()`，`start()` 于 `:145-149` `http.createServer(app)` + `initSocket` + `server.listen(PORT)`，`PORT = process.env.PORT || 3000`（`:26`）；jest 之所以安全，是 `server/test/setup.js:2` 显式 `process.env.PORT='0'`。**结论：B 的根因分析正确，当前无残留。**

**可复用的规避写法**（本轮我自己即按此执行，未占用 :3000）：
```js
process.env.PORT = '3199';            // ① 取数脚本 import app.js 之前必须显式指定：'0'（随机）或 31xx
process.env.DATABASE_URL = TEST_URL;  // ② 先写 env 再 import（dotenv 不覆盖既有 env）
const { default: app } = await import(SERVER + '/src/app.js');  // ③ 真 import 才会触发 listen
// ④ 用后 kill 子进程 + lsof 复核；⑤ 绝不 import 活树 app.js 做一次性校验（会占 3000）
```
建议（转 Captain）：写入 `constraints §3` 作为**第 14 条纪律**「任何 import `server/src/app.js` 的脚本必须先设 `PORT=0`」；根治方案是给 `app.js` 加 `NODE_ENV==='test' || PORT==='0'` 守卫或改为导出 `start`（改启动语义，需用户拍板）。

### 5.2 ② studentController 799 行 / GodFile 与可读性

| 项 | 实测 |
|---|---|
| `wc -l` | **799**（≤800，余量 **1 行**） |
| `arch-metrics` godfileOver800 | **10（不变）**，清单 10 项中**不含** studentController |
| `>500` 观察带 | **19（不变）**，studentController(799) 在其中 |
| 行长（可读性） | 最长行 200 字符（`:231` 新增守卫单查询）；>140 字符行 2 → **4**；>120 字符 16（HEAD 13） |
| 写法评估 | 新增的 2 条长行均为**单个 Prisma 调用**（非压缩多语句），其上有解释性注释（`:230` 说明语义等价于 `assertStudentInAssignment`、`:234` 说明折行原因）；无 `;,` 挤行、无可读性破坏 |
| 结论 | ✅ 计数与写法均**未突破门禁**；但**余量仅 1 行**，该文件是**高风险热区**（下一次任何 +2 行改动都会破 800；而拆文件撞 `unmigrated 47` 不增判据）——与 B §6.2 的自我登记一致 |

---

## 6 V5｜复核 B 登记的新遗留：saveDraft / submit 无班级校验

**独立复现（我自建夹具，非 B 的 S3 用例）：学生 sA ∈ classA1，目标作业 asgB ∈ classB1（未投放给 sA）**

```
  OK  sA-PUT /student/assignments/asgB/draft   -> 200/0   dbEqual=false
      → 越权草稿行: id=19353 status=draft  answer="C5_DRAFT_CROSS"     ← 真实落库
  OK  sA-GET /student/assignments/asgB         -> 403/1003 dbEqual=true  ← 详情守卫未被「有提交」绕过（B S3 结论成立）
  OK  sA-POST /student/assignments/asgB/submit -> 200/0   dbEqual=false
      → 越权提交行: id=19353 status=submitted answer="C5_SUBMIT_CROSS"  ← 草稿被改写为已提交
```
代码级旁证：`studentController.js:271-278 / :290-296` 只透传 `assignmentId/studentId/questionId`；应用层 `application/use-cases/submission.use-cases.js:27-56（submit）/:64-81（saveDraft）` **只校验「作业是否存在 / 是否锁定 / 是否过期 / 是否重复提交」，零班级归属校验**。

**判定：⚠️ 证据成立，可稳定复现。** 影响＝任意学生可对**未投放给自己**的作业落库写入（污染数据、占位/抢答面），并可由学生**自行制造 submission 行** —— 这正是 B §8-3 警告的「不能以『存在任意 submission 行』作为放行条件，否则修出来的是假门」。**列为下一轮（round 6）执行集候选**，本轮不阻断（B 已登记、未获修授权）。

---

## 7 V6｜改动面与旁证

### 7.1 改动面（`git status --porcelain -uno`）

```
 M docs/pipeline/project-constraints.md          ← 他方（Captain，纪律 13）
 M pipeline-status.md                            ← 他方（Captain，round 5 状态）
 M server/src/controllers/studentController.js   ← 本轮任务 B（S-6）
 M server/src/controllers/teacherController.js   ← 本轮任务 A（S-2）
?? scripts/gates/bind-check.mjs                  ← 本轮新增（门禁，239 行）
?? server/test/integration/ownership-guards.test.js ← 本轮新增（410 行 / 22 例）
```
`git diff --numstat`：`teacherController.js +45/-0`（**纯新增，零删除**）、`studentController.js +6/-4`（净 +2）⇒ **与 B 声明一致，无第三个源文件被动过**。
另注：`?? server/tmp-probe-ref-answer.mjs` 亦为未跟踪，但 **mtime = 2026-10-09 21:16**（早于本轮窗口 3 天）⇒ 属**历史遗留**，非本轮产物（如实登记，不归因 B）。

### 7.2 既有测试文件未被修改（**mtime 旁证**，陷阱 8）

```
find server/test -type f -name '*.js' -newermt '2026-10-11 00:42:00'
  → 仅 server/test/integration/ownership-guards.test.js（00:52:50，新增）
server/test 全部 *.js = 92 个；其余 91 个的 mtime 最新为 2026-10-10 21:55:06
阶段 mtime 标尺：teacherController 00:50:57 · bind-check 00:51:50 · ownership-guards 00:52:50 · studentController 00:56:03 · refactor-round-05.md 00:58:54
```
⇒ **只新增 1 个测试文件，既有 91 个测试文件在改动窗口内零写入** ✅

### 7.3 client / client/dist / tests 零写入（不依赖 git status，陷阱 8）

```
find client/src client/dist tests -type f -newermt '2026-10-11 00:42:00' → 0 / 0 / 0
（参照：client/src 最近写入 = 00:08:27 的 3 个 round-2 文件，早于本轮窗口；
  client/dist 最近 = 2026-10-10 22:02:03；tests/ 最近 = 00:19:14 的两个日志 —— 均早于 00:42）
git ls-files tests | wc -l = 0  ← tests/ 不在跟踪内，故本条**只以 mtime 为据**，不引用 git status
```
⇒ 本轮**零 client 改动**（硬指标 0/0/0 不变、无视觉/无障碍风险）、**未重建 client/dist**、**未触碰 tests/** ✅

### 7.4 探针与测试库卫生

```
测试库残留（独立复核）：c5_ users/classes/schools/teams/submissions = 0；B 的 to_ users/schools/classes = 0
db = exam_system_test（探针首行硬断言，非该库即 exit 2）
```

---

## 8 缺陷分级

### 8.1 阻断（0 项）
**无。** 88 例对抗性越权/绕过尝试全部被正确拒绝，未发现任何可越过新守卫的路径。

### 8.2 轻微（2 项，均已登记/可解释，不阻断）

| # | 项 | 证据 | 归属 |
|---|---|---|---|
| 1 | **新守卫未覆盖「body 传入的目标资源」**：① `updateStudent` 的 `body.classId` 无归属校验 → 教师可把自己学生移入**他人班级**（`A-PUT-own-student-sMove{classId=B1}` → 200，映射表新增 classB1）；② `updateClass` 的 `body.teamIds` 无归属校验 → 可把自己班级挂进**任意团队**，随后该团队成员即获得写权限（`A-PUT-own-classA1{teamIds=[T_A]}` → 200 + teamClass 建行；紧接着 `C-PUT-classA1` → **200**） | §4.4 #6 与 §4.6 实测；①B 已在 refactor-05 §7-1 登记 | ① B 已登记（不在本轮清单）；② **本轮新发现**（B 未登记） |
| 2 | **全量回归偶发 30s 超时** | 首跑 1/2 出现（`admin-teacher-delete`），隔离 2/2 绿、无并发复跑全绿（§2.2） | 环境/装置（非本轮代码）；旁证：`app.js` 每测试文件一次 `start()` ⇒ 每个文件泄漏 1 个 listener + 1 个 `setInterval`（65 个），**未确证因果**，登记观察 |

### 8.3 优化（3 项）

| # | 项 | 证据 |
|---|---|---|
| 1 | 非法/缺失 `schoolId` 时 `updateClass` 返回 **500**（Prisma 非空列写入 null/NaN）—— **改动前后同值**（before/after 双列 500，`dbEqual=true`），UI 不可达（客户端必注入 schoolId） | §4.5 表末 |
| 2 | `deleteStudent` 非法 id（`abc`/`1e999`/超长）→ **500**（守卫内 Prisma 查询抛错）；`updateClass` 同类输入 → 403。**前后一致、零写入**、无越权 | §4.4 #5 |
| 3 | 学生作业详情 id = `1e999`(Infinity) → **500**（`:214` 的 `findFirst({id:+id})` 抛错；该行**未被本轮改动**，git diff 可证）；id = **负数** → 404（语义正确） | §4.4 与 §4.5 |

### 8.4 遗留（下一轮候选，需 Captain 立项）

1. **【中】`saveDraft`/`submitAnswer` 无班级归属校验**（§6 已独立复现）—— 学生可对非本班作业落库写入。
2. **【中】`updateStudent.body.classId` 目标班级归属校验**（B §7-1 登记）。
3. **【轻微】`updateClass.body.teamIds` 团队归属校验**（本轮新增发现，见 §8.2-1②）—— 与 2 同形，建议同批修（约 3 行/处）。

---

## 9 未做项与残留风险

| # | 未做项 | 原因 |
|---|---|---|
| 1 | 页面级回归（CDP/axe/像素） | 本轮**零 client 改动**（§7.3），无视觉/无障碍变更面；按 r0 既定口径「零 client 改动 ⇒ 0 新增违规」，未重复执行昂贵装置 |
| 2 | `updateClass`/学生各端点在**无 schoolId** 下的既有 500 修复 | 属既有缺陷、UI 不可达、修它改的是写库语义（可能误伤 `switch-class` 流）⇒ 只登记（§8.3-1） |
| 3 | `/api/internal/graded`（S-1）、默认超管口令（S-3）、日志整包（S-4） | audit-04 §3.2 已裁定「需用户拍板」，**未获本轮授权**，本轮未触碰 |
| 4 | 依赖 CVE / 动态渗透 / 前端 XSS | 禁网 + 无生产环境（沿用 audit-04 §2.7 的诚实边界） |
| 5 | `bind-check` 的 star re-export / CJS / 动态 import 盲区 | 门禁已自陈保守边界（只漏报不误报）；本轮未新增负向用例覆盖这三类 |

**残留风险**：① `studentController.js` 距 800 仅 **1 行**，下次任何实质改动必破门禁（而拆文件撞 `unmigrated` 不增判据 → 结构性两难，需用户拍板）；② 全量回归存在**低频偶发超时**（本轮 1/2），CI 口径下会表现为假红 —— 建议判据改为「复跑一次仍失败才算回归」；③ 本轮为**未提交工作树**，若被后续改动覆盖则本报告的证据锚点失效（锚点 = HEAD `7b874b1` + 上述 mtime 标尺）。

---

## 10 本轮结论

> ### ✅ PASS —— 无需回流 Agent B
>
> 1. **全量回归**：4 处摘要 · **68 套件** · **1033 例** · **0 failed** · exit 0；新增越权套件 22/22 在跑且全绿。
> 2. **五项门禁**：cycle **71/164（边数不变）**/SCC 0 · layers **71/0/47** · arch **0/47/10** · hard **0/0/0** · bind-check **自测 3/3 + 真仓 169/511/0 违规**；文件数 **146**；`studentController` = **799 ≤ 800**。
> 3. **★对抗性验证（核心）**：**108 例 / 其中 88 例越权与绕过尝试，0 例成功**；5 个写端点 + S-6 全部返回 403/1003 且 **DB 逐字段零变化**；冻结树同批用例为 200 且真实写库（跨校改名/删班/删学生/重置口令/读他人作业题干**全部可复现为旧漏洞**）⇒ **越权确实被堵死，无成功绕过**。
> 4. **合法路径未误伤**：本人班级/学生、**团队班级**改删均 200 且响应形状逐字不变；B 点名的 3 处「我可能错」经独立复核**全部成立**。
> 5. **V4**：`:3000`/`:5173` 全程无监听、无残留进程；`app.js:152` 模块加载即 listen 的根因复核正确，已给出可复用规避写法。
> 6. **V5**：`saveDraft`/`submit` 无班级校验**独立复现成立**（跨班草稿与提交均 200 且真实落库）⇒ 列为 **round 6 执行集首选**。
> 7. **V6**：改动面与声明一致（2 源文件 + 2 新增）；既有 91 个测试文件 mtime 零改动；`client/`、`client/dist`、`tests/` 改动窗口内 **0 写入**。
>
> **唯二保留意见**（不构成阻断）：① body 参数（`classId`/`teamIds`）的相邻越权面未收口（§8.2-1，建议 round 6 与 V5 同批修）；② 全量回归的偶发超时需以「复跑一次」为判据口径（§2.2）。
