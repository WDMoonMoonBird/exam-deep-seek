# test-round-07 —— round 6 回流回归验证 + ★对抗性复核（C6-1 斩断 / R-1 收口）

| 项 | 值 |
|---|---|
| 轮次 | **round 7 / 8**（Agent C · 独立验证 · round 6 回流） |
| 日期 | 2026-10-11 |
| 被验 commit | **`50dbc66`**（`git log --oneline -1` 实测）+ **未提交工作树**（round 7 WIP，5 个文件 M） |
| 工作树状态 | `git status --porcelain -uno`：`pipeline-status.md`(Captain) / `teacherController.js` / `teamController.js` / `test/integration/ownership-guards.test.js` / `test/unit/assignment-q9-branches.test.js` —— 与 B 报告 §1 `git diff --numstat` **逐行一致**（7/1、12/0、224/0、39/11） |
| 技能 | `tech-test-automation`（已加载） |
| 上游输入 | `project-constraints.md`（**17 条**）｜`test-round-06.md` §4.3（C6-1 阻断与最小修法契约）｜`refactor-round-07.md`｜`pipeline-status.md` |
| 方法 | ① 全量回归（`unblock-g2.sh`）② 五门禁 + 不变量 ③ **自建对抗性探针**（3 个脚本，PORT=0，库=exam_system_test）④ 逐行复核被改测试文件 ⑤ **自建变异（负向）验证**（/tmp 冻结副本） |
| 纪律 | 只读测试；除本报告与 `test-round-07.log` 外**零仓库写入**；探针/副本全在 `/tmp`；显式 `PORT=0`（实测打印 `PORT = "0"`，端口由内核分配 50860/51762）；夹具前缀 `c7_`/`c8_`/`c9_` 自建自清（`cleanup leftover` 全 0）；禁用命令（clean/stash/checkout -- ./reset --hard/restore .）一律未用 |

---

## 1 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| V1 | 后端全量回归 | 4 摘要 / **68 套件** / **1073 例** / 0 failed；四段 974+17+61+21 | 退出码 **0**；`Test Suites: 65/1/1/1`；`Tests: 974/17/61/21`；`PASS` 行 **68**、`FAIL` 行 **0** | ✅ **PASS** |
| V1b | 段1 数字 | 974（= 1073−17−61−21，第 17 条纪律） | 974，且 974+17+61+21 = 1073 精确闭合 | ✅ 不回归 |
| V1c | 重点复跑 | ownership-guards **62**、q9 **9**、submission.use-cases 32、persistence-repositories 12 | **62 / 9 / 32 / 12**（定向隔离复跑） | ✅ |
| V2 | cycle-check | 71 文件 / **164 边不变** / SCC 0 | `扫描 71 文件 / 164 条相对导入边`；`强连通分量: 0`；`结论：PASS` | ✅ |
| V2 | check-layers | 71 / 0 / 47 | `文件 71 个，违规 0 条，未分层待迁移 47 个` | ✅ |
| V2 | arch-metrics | 0 / 47 / **10** | `layerViolations 0`、`unmigrated 47`、`godfileOver800 10`（>500 观察带 19） | ✅ |
| V2 | hard-metrics | 0 / 0 / 0 | hex6 0、important 0、modalConfirm 0 | ✅ |
| V2 | bind-check | 0 违规 | `BINDING VIOLATIONS: 0`（169 模块 / 512 绑定） | ✅ |
| V2 | 源文件数 | **146** | `find server/src client/src -type f \| wc -l` = **146** | ✅ 不新增文件 |
| V2 | studentController | **799 行且 git diff 空** | `799`；`git diff \| wc -c` = **0** | ✅ |
| V2 | 新增被跟踪文件 | 0 | `git status --porcelain` 中 `^A ` 行 = **0** | ✅ |
| V3 | ★C6-1 是否真斩断 | 403 + 零写入（含混合整体拒绝/时序/空数组） | 自建探针 **46 项：45 PASS / 1 FAIL**；唯一 FAIL 为「重复 id → 500」（**越权项 0**） | ✅ **斩断** |
| V3 | ★绕过尝试 | 任一绕过即阻断 | 14 条全部**未取得越权写入**（13 条 403/500 零写入 + 1 条 200 零写入） | ✅ 无绕过 |
| V3 | 合法路径不误伤 | 全部 200 | 7/7 → 200（含成员维护名单、空数组清空、建作业） | ✅ |
| V4 | ★被改测试是否弱化 | 只补桩+加键；断言不得更弱 | 三类改动**逐行核实**；弱化写法 0；`expect()` 40→40；`it()` 9→9；11 处删除 = 10 调用点 + 1 断言行（该行**更强**） | ✅ **无弱化** |
| V4d | 新桩是否恒真 | 不得使断言失效 | 桩承重实验：`teacherClass` 桩由 `[{classId:1}]` 改 `[]` ⇒ **8 failed / 1 passed / 9** | ✅ 非恒真 |
| V5 | ★变异反向证明 | 测试必须能抓到漏洞 | 我的数字：基线 **71/71 绿**；变异后 **12 failed / 59 passed / 71**（OG 11 + q9 1）；探针 1 由 1 FAIL → **24 FAIL**（链四环全 200 + 落库） | ✅ **有牙** |
| V6 | R-1（createAssignment） | questionIds→400/1001 无预言机；classIds→403/1003 | 实测他人题 = 不存在题**响应体逐字节相同**；他人班 403 零写入；混合整体拒绝；合法 200 | ✅ 生效 |
| V6 | C6-2（teacherIds） | 给出判定 | **不阻断本轮，随 R6-P10 拍板**（附实测转授权链证据） | ⚠️ 待拍板 |
| V7 | 改动面 | 仅 2 个测试文件被改 | 窗口内 `server/test` 仅 2 文件；`client/`、`client/dist`、`tests/` **零写入**；dist mtime **Oct 10 21:55:33 未变** | ✅ |

**判据全绿 ⇒ 本轮结论 = PASS（无阻断，无需回流 B）**，另登记 4 项低危缺陷/观察（§8）。

---

## 2 V1 后端全量回归（原始输出）

```
$ ROUND=07 bash docs/pipeline/scripts/unblock-g2.sh
→ 测试库: localhost:3306/exam_system_test
✓ 端口可达
✓ schema 对齐
→ 开始回归（--runInBand，耗时较长）…
→ 退出码: 0 ｜ 完整日志: docs/pipeline/test-round-07.log
── 基线摘要 ──
   Test Suites: 65 passed, 65 total     Tests: 974 passed, 974 total     Time: 172.892 s
   Test Suites: 1 passed, 1 total       Tests:  17 passed,  17 total     Time:   0.475 s
   Test Suites: 1 passed, 1 total       Tests:  61 passed,  61 total     Time:   0.489 s
   Test Suites: 1 passed, 1 total       Tests:  21 passed,  21 total     Time:   0.661 s
```

- **4 处** `Test Suites:` 摘要（第 55 行的短路陷阱未触发）→ 四段确实全跑。
- 套件 **65+1+1+1 = 68**；用例 **974+17+61+21 = 1073**；`^PASS ` 行 68、`^FAIL ` 行 0、`failed` 词仅出现在 4 条被 mock 的 TrustJudge 日志里（非测试结果）。
- **段1 = 974 = 全量 − 17 − 61 − 21**，与第 17 条纪律一致（旧基线段1=912/934/960 均不可沿用）；本轮相对 round 6（68 套件 / 1073 例）**零增减**。

**四个重点套件（定向隔离复跑，非依赖全量日志）**

```
$ (cd server && DATABASE_URL="<exam_system_test>" NODE_OPTIONS=--experimental-vm-modules \
    npx --no-install jest --config test/jest.config.js --runInBand --forceExit <文件>)
integration/ownership-guards        Tests: 62 passed, 62 total   ← B 报 48→62 ✅ 复现
unit/assignment-q9-branches         Tests:  9 passed,  9 total   ← ★仍 9/9
unit/application/submission.use-cases Tests: 32 passed, 32 total
unit/infrastructure/persistence-repositories Tests: 12 passed, 12 total
```

---

## 3 V2 门禁与不变量（原始输出）

```
$ node scripts/gates/cycle-check.mjs
  循环依赖门禁 · 根目录 server/src
    扫描 71 文件 / 164 条相对导入边
    强连通分量（|SCC|>1）: 0（基线 1）
    自环: 0            结论：PASS
$ node server/scripts/check-layers.mjs
  文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个
$ node scripts/gates/arch-metrics.mjs
  ✓ layerViolations 基线=0 实测=0   ✓ unmigrated 基线=47 实测=47   ✓ godfileOver800 基线=10 实测=10
  · >500 行（观察带） 基线=19 实测=19                     结论：PASS
$ node scripts/gates/hard-metrics.mjs
  ✓ hex6 0  ✓ important 0  ✓ modalConfirm 0                结论：PASS
$ node scripts/gates/bind-check.mjs
  modules scanned 169 ｜ named import bindings checked 512 ｜ BINDING VIOLATIONS: 0
$ find server/src client/src -type f | wc -l         → 146
$ wc -l server/src/controllers/studentController.js  → 799
$ git diff -- server/src/controllers/studentController.js | wc -c → 0
```

**164 条导入边不变**与 B 的「复用既有 import、未新增跨文件边」声明一致（teacherController.js:9 早有 `getVisibleClassIds` import；本轮新增的 `canTeacherManageClasses` 是同文件既有函数）。

---

## 4 ★V3 对抗性验证（自建探针 · 46 项 · 字段级对拍）

### 4.0 装置与纪律

- 脚本（**全部自建，未复用 B 的 `/tmp/r7b-probe.mjs`**）：`/tmp/c7probe/c7-probe.mjs`（主探针 46 项）、`c7-probe2.mjs`（部分写入边界）、`c7-probe3.mjs`（链四环最小对拍）。
- 首行 `process.env.PORT='0'`，自建 `http.createServer(app)` + `listen(0)`；实测打印 `自建 HTTP 服务: 127.0.0.1:50860`（内核对端分配）——**未占用 :5173 / :3000**；库名白名单自检（非 `exam_system_test` 即 exit 3）。
- 夹具（`c7_`）：2 校 / 4 教师（tX 在 S2，其余 S1）/ 4 班 / 2 团队（teamA 创建者 tA、成员 tC；teamB 创建者 tB）/ 1 生 / 2 题。
- **零写入判据 = 请求前后 19 个字段级快照对拍**：teamA/teamB `name`、clsA/clsB/clsC/clsX `name`、stuA `bcrypt 哈希`、6 组 `teamClass` count、`studentClass` count、`teamTeacher` count、assignment count、c7_ 用户数、`teacherClass(clsA,tB)`。

### 4.1 必测五面（任务书 ①–⑤）

| # | 请求 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| ① | tB 把 tA 的 clsA 挂进自有 teamB（`{name:HACK, classIds:[clsA]}`） | 403 + 零写入 | `http=403 code=1003 msg=无权操作`；`changed=[]`（teamB.name 未改）；`teamClass(teamB,clsA)=0` | ✅ |
| ② | **混合数组** `[clsB(本人), clsA(他人)]` | **整体拒绝**、不得部分成功 | `http=403 code=1003`；`changed=[]`、`teamClass(teamB,clsB)=0`（连本人的也没写） | ✅ 无部分成功 |
| ③ | 空数组 `classIds: []`（=清空） | 语义不得被误伤 → 200 | `http=200 code=0`，`teamClass(teamB,clsB) 1→0` | ✅ 未被误伤 |
| ④ | **时序** `{name:HACK_ORDER, classIds:[clsA]}` | 403 且**不得先改名** | `http=403`；`teamB.name "c7_team_b"→"c7_team_b"` | ✅ 无部分写入 |
| ⑤a | tB 改 tA 的班级名 | 403 + 零写入 | `http=403 code=1003`；clsA.name 未变 | ✅ |
| ⑤b | tB 重置 tA 班学生口令 | 403 + 哈希不变 | `http=403 code=1003`；`hashChanged=false` | ✅ |
| ⑤c | tB 越权往 tA 班级建学生 | 403 + 零写入 | `http=403 code=1003`；学生数 1→1、用户数 5→5 | ✅ |
| ⑤d | tC（teamA **成员**，非创建者）把 tA 的 clsA 挂进 teamA | 403 + 零写入 | `http=403 code=1003`；`changed=[]` | ✅ |
| ⑤e | tB(S1) 用 `schoolId=S2` 交 S2 的 clsX | 403 + 零写入 | `http=403 code=1003`；`changed=[]` | ✅ |
| ⑤f | 链条「放大面」复核：tB 在**省略 schoolId** 下再改 clsA | 403（可见集恒不含 clsA） | `http=403 code=1003` | ✅ |

**因果结论**：C6-1 的链条是「① 写 `teamClass`（唯一输入源）→ ② `getVisibleClassIds` 放大 → ③ 全部写守卫放行」。本轮在 **①** 处斩断，②的输入恒为空集，③因此各自独立 403 —— 我的 ⑤d/⑤f 两条独立确认「放大面不存在」，不是只靠第一环。

### 4.2 ★绕过尝试清单（14 条，任务书要求主动设计）

| # | 绕过尝试 | 实测 | 判定 |
|---|---|---|---|
| X1 | `classIds: ["<clsA>"]` 字符串数字强转 | 403 / 零写入 | ❌ 未绕过 |
| X2 | 负数 `[-1]` | 403 / 零写入 | ❌ |
| X3 | 超大数 `[999999999]` | 403 / 零写入 | ❌ |
| X4 | 非数字串 `["abc"]`（NaN） | 403 / 零写入 | ❌ |
| X5 | 单元素嵌套数组 `[["<clsA>"]]`（`+[]` 会强转） | 403 / 零写入 | ❌ |
| X6 | 布尔 `[true]`（`+true=1`） | 403 / 零写入 | ❌ |
| X7 | 混合类型 `[clsB, "abc"]` | 403 / 零写入（整体拒绝） | ❌ |
| X8 | `classIds` 只放 **query** 不放 body | 200 但 `changed=[]`（body 无 classIds ⇒ 不触发写库段） | ❌ 未绕过 |
| X9 | 非数组字符串 `classIds: "<clsB>"` | 500 / **零写入**（守卫内 `every` 先抛，删除动作未执行） | ❌ |
| X10 | 非数组对象 `classIds: {}` | 200 / 见 §8 D-3（清空**自有**团队班级，非越权） | ❌ 未越权 |
| X11 | 非数组对象 `{length:5}` | 500 / 零写入 | ❌ |
| X12 | **重复 id** `[clsB, clsB]`（本人的班，合法 id） | **500** / 零越权（详见 D-3） | ❌ 未越权 |
| X13 | 软删班级 | `Class` **无 `deletedAt` 列**（schema 实测）⇒ 不可构造（≠已防御） | — |
| X14 | `team.schoolId=S1` 但教师用 `schoolId=S2` 交 S1 班级 | 403 / 零写入 | ❌ |

> **14 条全部未取得跨租户写入 ⇒ 无绕过。** 任务书的「任何一条绕过即判阻断」**不触发**。

### 4.3 合法路径（不得误伤）—— 7/7 全绿

```
L1 tB 挂本人 clsB 进自有 teamB       → 200/0，teamClass 落库 1        ✅
L2 classIds: []（清空）              → 200/0，teamClass 1→0            ✅
L3 成员 tC 挂本人 clsC 进 teamA      → 200/0，teamClass 落库 1        ✅（成员维护名单未被收紧）
L4/L4b tA 改本人班级名（含复原）      → 200/0                          ✅
L5 tB 往本人班级建学生                → 200/0，用户数 5→6              ✅
L6 tA 重置本班学生口令                → 200/0                          ✅
R36 tB 本人题 + 本人班建作业          → 200/0，assignment 0→1          ✅
```

---

## 5 ★V4 被改测试文件复核（逐条结论 · 第 16 条纪律）

被核对象：`server/test/unit/assignment-q9-branches.test.js`（`+39 / −11`）。**我方独立取 `git diff` 全文（149 行 / 7777 B）逐行判读**，不采信报告转录。

### (a) 是否只在「补桩 + 加键」边界内 → **是**

| 类别 | 实测内容 | 判定 |
|---|---|---|
| 模型桩 | 3 个 `jest.fn()` + mockModule 内 3 个模型键 + beforeEach 内 3 个 `mockReset` + 3 个 `mockImplementation`（`teacherClass=[{classId:1}]`、`teamTeacher=[]`、`teamClass=[]`） | ✅ 授权范围 |
| 请求桩 | 新增 `mockReq(body, userId, query = {})`；10 处调用点由 `{ body, user:{id:7} }` 改写为 `mockReq(body, 7)`，`body`/`user.id` 取值**逐字未变**，仅多出 `query: {}` | ✅ 同类补桩 |
| 断言加键 | `toHaveBeenCalledWith({ where: { id: { in: [OPEN_QID] }, deletedAt: null, teacherId: 7 } })` —— 原键 `id` / `deletedAt` **逐字保留**，仅新增 `teacherId: 7` | ✅ 明确授权 |

**无第四类改动**：新增行中除注释/空行外，全部落入上表（3+3+3+3+1+10+1）。

### (b) 有无断言被删除/放宽/弱化 → **无**

```
$ grep -cE "objectContaining|expect\.any|expect\.anything|toMatchObject|toBeTruthy|toBeDefined" <新文件>  → 0
$ git show HEAD:<旧文件> | grep -cE "<同模式>"                                                     → 0
$ grep -c 'expect(' 新 / 旧 → 40 / 40        $ grep -c "  it(" 新 / 旧 → 9 / 9
$ grep -c 'not.toHaveBeenCalled' 新 / 旧 → 6 / 6   （负向断言一处未少）
```

### (c) 11 处删除的性质 → **10 处调用点改写 + 1 处加键，无断言行被删**

`git diff -U0 | grep '^-'` 共 11 行（去掉 `---` 头后）：前 10 行全部形如 `-    await createAssignment({ body…, user: { id: 7 } }, res);`（调用点），第 11 行为 `-    expect(questionFindMany).toHaveBeenCalledWith({ where: { id: { in: [OPEN_QID] }, deletedAt: null } });` —— 该行**被替换为三键版本，原两键逐字保留** ⇒ **更强**。

### (d) 新桩/`mockReq` 是否让某条既有断言变成恒真或失效 → **否（有实验）**

- **桩是承重的**（反证实验，在 `/tmp/c7mut` 冻结副本上做）：把 `teacherClassFindMany` 由 `[{ classId: 1 }]` 改成 `[]`（=教师 7 不可见 classId 1）⇒ `Tests: 8 failed, 1 passed, 9 total`。若桩是「恒真装饰」，改它不会有任何反应 → 证否。
- `mockReq` 只补 `query`，未改 `body`/`user`；语义上 `query:{}` ⇒ `getSchoolId=null` ⇒ 学校维度不启用（= **改动前行为**），不是把断言调宽。
- 仍需如实指出：**该套件 9 例无一条直接断言「新守卫的 403」**——它只按原契约断言 Q9 三分支；新守卫的判别力由 `ownership-guards` R30-R35 承担（§6 变异验证已证）。

### (e) 报告与实物的一致性（低危，见 §8 D-1）

B 报告 §3.1 标题为「**完整 diff（git diff 原文）**」，实测为**节选 + 润色**：粘贴块 **104 行 / 5618 B**，实际 `git diff` **149 行 / 7777 B**（省略了未变上下文行），且注释一行文字不一致——报告写「**学校**过滤维度不启用」，测试文件实际是「**学生**过滤维度不启用」（代码注释笔误）。**实质改动面不受影响**（三类改动经我方直接比对确认）。

---

## 6 ★V5 独立变异（负向）验证 —— 测试有没有牙

**装置**：`/tmp/c7mut`（`rsync` 冻结的 round-7 工作树副本，`node_modules` 软链；副本与工作树 `diff -rq` **0 处差异**）。变异点三处：`updateTeam.classIds` 守卫取反（`if (false && …)`）、`createAssignment.classIds` 守卫取反、`question.findMany` 去掉 `teacherId` 归属过滤。

| 形态 | jest（2 套件） | 我的探针 1（46 项） | 探针 3（链四环） |
|---|---|---|---|
| **基线（未变异）** | `71 passed, 71 total` | 45 PASS / **1 FAIL**（仅 X12 重复 id） | 四环全 403 + 零写入，**CHAIN 斩断 ✅** |
| **变异后** | `12 failed, 59 passed, 71 total` | 22 PASS / **24 FAIL** | ①=200 且 `teamClass=1`；②=200 且班级名被改；③=200 且 bcrypt 哈希被改写；④=200 且学生数 1→2，**CHAIN 存活 ❌** |

**红灯清单（精确命中，无溢出）**：`ownership-guards` → **R24 R25 R26 R28 R29**（updateTeam 段）+ **R30 R31 R32 R33 R34 R35**（createAssignment 段）= 11；`assignment-q9-branches` → 「题目查询过滤软删除（where.deletedAt === null）」= 1。**合法路径 R23/R27/R36 与既有 48 例在两种形态下都绿** ⇒ 既非「永远红灯」，也非「永远绿灯」，判别力真实且方向正确。

> 这组数字（**12/59/71**、探针 1 **24 FAIL**、链四环 **200 + 真落库**）是我自己跑出来的，与 B 报告 §5.4 的结论同向但**数字更大**（B 用其自有探针报 5 项 FAIL；我的探针覆盖面更大，故 FAIL 更多，不矛盾）。

---

## 7 V6 —— R-1 复核与 C6-2 判定

### 7.1 R-1（`createAssignment`）✅ 确实生效

| 检查 | 实测 |
|---|---|
| 他人题目 + 本人班级 | `400 / 1001 / 部分题目不存在或已删除，无法布置`，assignment 零写入 |
| **存在性预言机** | 他人题（存在）与不存在题 `999999999` 的**响应体逐字节相同** ⇒ 不泄漏存在性 ✅ |
| 他人班级 + 本人题目 | `403 / 1003 / 无权操作`，`changed=[]` 零写入 |
| 混合班级 `[本人, 他人]` | 403（整体拒绝） |
| 混合题目 `[本人, 他人]` | 400/1001（整体拒绝） |
| 他人题 + 他人班 | 403/1003（班级守卫独立于题目守卫） |
| 合法（本人题 + 本人班） | `200 / code=0`，assignment +1 |

### 7.2 C6-2（`updateTeam.teacherIds` 内容零校验）—— **判定：不阻断本轮，随 R6-P10 拍板；但危害面须按我的实测重述**

**实测（我的探针，非 B 的）**

```
C6-2a  tB 把外校教师 tX(S2) 写入自有 teamB 名单      → 200/0，teamTeacher 1→2，tX 真的成为成员（count=1）
C6-2b  成员 tC 把「无关系第三方」tB 拉进 teamA        → 200/0
C6-2b-chain ★ tB 改 tA 的 clsA：加入前 403  →  加入后 200   ← 访问权被「二次分发」
C6-3-tid teacherIds:['abc'] → 500，且 teamTeacher 2→0（名单被清空）——见 §8 D-3
```

**判「不阻断」的四条理由**

1. **不构成「零前置条件的单人越权」**：写入方必须先**已是该团队成员/创建者**（`team.createdBy` 或 `teamTeacher` 命中，实测非成员一律 403 且零写入）。C6-1 之所以是阻断，是因为攻击者**无需任何前置关系**即可把他人班级拉进自己的可见集。
2. **不新增「攻击者能碰到的资源」**：被拉入的班级恒 ⊆ 邀请者自己的可见集（C6-1 修复后）。实测的 403→200 转授权链里，能改 clsA 的 `clsA` 本就在 teamA 名单中，成员 tC 自己**本来**就能改（= 拍板项 R6-P9「团队班级是否授予写权限」的既有语义）。
3. **真危害是「转授权 + 跨校拉人」**：成员可把访问权分发给**任意第三方（含外校）**，被拉入者获得团队全部班级的读+写可见性。这是**中危·语义型**问题，且与 R6-P10（团队治理：成员能否增删名单）同源，修它必然改变产品语义（同校约束会砍掉「跨校协作团队」）。
4. **B 的 `teacherSchool` 备选判据**``prisma.teacherSchool.findMany({ teacherId: { in: teacherIds }, schoolId: team.schoolId })`` 全命中 ⇒ 成本 +1 查询、零新增 import、零新响应形状，**技术上可行**，但**必须由用户确认产品语义**后才可落。

**必须更正 B 的一处表述**：`refactor-round-07.md` §6.1 表中称 C6-2 对攻击者「**零收益**」。我的实测 `C6-2b-chain`（403→200）证明收益非零——**成员可把对他人资源的访问权二次分发给任意第三方**。这不改变「不阻断」的结论，但拍板材料必须按此重述，否则用户会在错误前提上做决定。

**给用户的拍板最小集**（与 C6-2 同簇）：① `teacherIds` 是否限「同校 + 与团队有关系」；② 成员（非创建者）能否增删名单；③ 团队班级是否授予写权限（R6-P9）。三项建议**一次拍定**，因它们共同定义「团队 = 什么」。

---

## 8 缺陷分级

| # | 缺陷 | 等级 | 证据 | 是否阻断 |
|---|---|---|---|---|
| **D-1** | B 报告 §3.1 声称「完整 diff（原文）」实为**节选+润色**（104/5618 vs 149/7777；注释「学校/学生过滤维度」不一致） | **低（报告准确性）** | §5(e) 字节比对 | ❌ 不阻断（实质改动面已由我方直接核对） |
| **D-2** | **C6-2**：`updateTeam.teacherIds` 内容零校验 → 可拉入任意/外校教师；成员可把访问权二次分发（实测 403→200） | **中（待拍板 R6-P10）** | §7.2 | ❌ 不阻断本轮（有前置成员身份；修法属产品语义） |
| **D-3** | **C6-3 族（既存，B 未授权修）**：`classIds:{}` → **200 且清空**团队班级；`classIds:[clsB,clsB]` → **500 且清空**；`teacherIds:['abc']` → **500 且清空成员名单（创建者被踢出）** | **低**（仅作用于本人所属团队，零跨租户；但属「删除先行于校验」的部分写入） | 探针 2 原始输出 | ❌ 不阻断（建议下一轮顺手做前置类型/去重校验） |
| **D-4** | q9 测试内注释笔误：「学生过滤维度」应为「学校过滤维度」 | **极低（注释）** | §5(e) | ❌ |
| — | 附注（正向）：新增 classIds 守卫**顺带**修掉了 `classIds:"5"` / `{length:5}` 两种「500 前先删除」的部分写入（实测未抹除） | — | 探针 2 | — |

---

## 9 未做项与残留风险（如实登记）

1. **未做 client 侧验证**（像素/axe）：本轮改动面为纯后端控制器 + 测试，无任何 UI 变更（窗口内 `client/` 零写入），故不适用。
2. **未复算 `ledger-check.mjs --out=raw/ledger.json`、未重建 `client/dist`**：硬约束禁止（dist mtime 仍 Oct 10 21:55:33）。
3. **软删班级维度**：`Class`/`Team` 无 `deletedAt` 列（schema 实测）⇒ 该绕过**不可构造**，不等于「已防御」。
4. **性能基准**：本仓无装置；新增守卫为每请求 1-2 次索引查询（`updateTeam` 仅在 `classIds?.length` 时查）。
5. **C6-3 族未修**（未授权面）；**`getChecker` 读侧**归属仍未收窄（A/B 已登记的读侧缺口）。
6. **残余风险**：`teacherIds` 治理语义（D-2）在拍板前保持现状；若用户判定「团队=可信小组」，则 D-2 需在下一轮修（判据已备）。

---

## 10 本轮结论

> **PASS —— 无阻断，无需回流 Agent B。**

- **V1**：退出码 0；**4 处摘要 / 68 套件 / 1073 例 / 0 failed**（974+17+61+21 精确闭合）；重点套件 **62 / 9 / 32 / 12** 全绿。
- **V2**：五门禁全 PASS，**164 边不变**、**146 文件不变**、`studentController` **799 行 + diff 空**、无新增被跟踪文件。
- **★V3**：**C6-1 已被真正斩断** —— 自建探针 46 项 45 PASS；必测五面（他人班级/混合整体拒绝/空数组语义/时序无部分写入/改班·重置口令·越权建学生）全部 403 + 零写入；**14 条绕过尝试全部未取得跨租户写入**（无绕过）；7 条合法路径零误伤。
- **★V4**：被改测试**只在「补桩 + 加键」边界内**，断言**不弱反强**（弱化写法 0；`expect()` 40→40；11 处删除 = 10 调用点 + 1 加键）；桩承重实验（改 `[]` ⇒ 8/9 红）证明**无恒真断言**。
- **★V5**：变异验证 **12 failed / 59 passed / 71**（OG 11 + q9 1，红灯精确无溢出）；探针 1 由 1 FAIL → **24 FAIL**，链四环由「全 403 + 零写入」变「全 200 + 真落库」⇒ **测试有牙**。
- **V6**：R-1 生效（含**无存在性预言机**：他人题与不存在题响应体逐字节相同）；**C6-2 判「不阻断本轮、随 R6-P10 拍板」**，但危害面须按实测重述（成员可二次分发访问权，403→200）。
- **V7**：仅 2 个测试文件被改；`client/`、`client/dist`、`tests/` 零写入；dist mtime 未变。
- 附带 **4 项低/中危登记**（D-1 报告节选、D-2 C6-2、D-3 C6-3 族、D-4 注释笔误），**均不阻断**。

**给 Captain 的下一步建议**：满足 §5 判据者已全部达标（GodFile 10 项已确认不可达），round 7 可收尾；把 **D-2（C6-2）+ R6-P10 + R6-P9** 打包成一次用户拍板，D-3 作为下一轮（若有）的顺手项。

---

## 附录 A 复算命令清单（可逐字复跑）

```bash
# V1 全量（含四段；结果在 docs/pipeline/test-round-07.log）
ROUND=07 bash docs/pipeline/scripts/unblock-g2.sh
grep -cE '^Test Suites:' docs/pipeline/test-round-07.log   # 4
grep -cE '^PASS '       docs/pipeline/test-round-07.log   # 68

# V1c 重点套件（定向隔离复跑）
cd server && DATABASE_URL="<exam_system_test>" NODE_OPTIONS=--experimental-vm-modules \
  npx --no-install jest --config test/jest.config.js --runInBand --forceExit \
  test/integration/ownership-guards.test.js test/unit/assignment-q9-branches.test.js

# V2 五门禁 + 不变量
node scripts/gates/cycle-check.mjs && node server/scripts/check-layers.mjs
node scripts/gates/arch-metrics.mjs && node scripts/gates/hard-metrics.mjs && node scripts/gates/bind-check.mjs
find server/src client/src -type f | wc -l            # 146
wc -l server/src/controllers/studentController.js      # 799

# V3 对抗性探针（自建；PORT=0；库白名单自检；夹具自建自清）
cd server && DATABASE_URL="<exam_system_test>" PORT=0 node /tmp/c7probe/c7-probe.mjs
cd server && DATABASE_URL="<exam_system_test>" PORT=0 node /tmp/c7probe/c7-probe2.mjs
cd server && DATABASE_URL="<exam_system_test>" PORT=0 node /tmp/c7probe/c7-probe3.mjs

# V4 测试 diff 复核
git diff -- server/test/unit/assignment-q9-branches.test.js
git diff -U0 -- server/test/unit/assignment-q9-branches.test.js | grep -E '^-' | grep -v '^---' | wc -l   # 11

# V5 变异（冻结副本 /tmp/c7mut，副本与工作树 0 差异）
cd /tmp/c7mut/server && DATABASE_URL="<exam_system_test>" NODE_OPTIONS=--experimental-vm-modules \
  npx --no-install jest --config test/jest.config.js --runInBand --forceExit \
  test/integration/ownership-guards.test.js test/unit/assignment-q9-branches.test.js   # 71 → 变异后 12 failed

# V7 改动面
git status --porcelain -uno ; git diff --numstat
stat -f '%Sm %N' client/dist        # Oct 10 21:55:33（未重建）
```

> 全部原始输出已追加到 `docs/pipeline/test-round-07.log` 的 `===== [附录 A · Agent C round 7 独立验证证据] =====` 段落。
