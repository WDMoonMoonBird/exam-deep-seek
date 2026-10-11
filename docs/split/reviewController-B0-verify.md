# reviewController 拆分 · B0 契约测试独立验证报告（step 8，C 复核）

- **step**: 8 ｜ **子步**: B0（22 例契约测试的可信度验证，**不验证拆分**——拆分尚未开始）
- **验证者**: Agent C（独立验证，对抗性立场：**不采信 B 的自测，装置全部自建**）
- **被验对象**: commit `0a03b75`（`test(step8-B0): 补 reviewController 契约测试 22 例`）
- **日期**: 2026-10-11 ｜ **分支**: master
- **唯一问题**: 这 22 例是**真回归网**，还是「只断言状态码」的空网？
- **一句话结论**: **PASS —— 是真网，足以支撑 step 8 的拆分**；但 B 报告里的覆盖**计数口径**有一处系统性错误（不影响结论），另有 3 处覆盖盲区与 1 条 Z7/Z8 的误判，逐条登记于 §7/§8。

> **硬边界**：本轮除本报告 + 回归日志 `docs/split/test-round-18.log` 外，**未修改/创建/删除任何仓库内文件**；所有装置在 `/tmp/cv/`（B 的 `/tmp` 脚本一行未复用）；无任何 git 写操作；测试只跑 `exam_system_test`、显式 `PORT=0`；未联网、未装依赖、未起常驻服务；未碰 :5173/:3000、`client/dist`、`tests/`。

---

## 1 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| V1-a | HEAD | `0a03b75` | `0a03b75b5c6ce5196e92cb02814279da2a4832e7` | ✅ |
| V1-b | `sha256(reviewController.js)` | `62ec56ed…` 恒定 | `62ec56ed4c647687a09bcd2329c5ceeca1968610e9495a7fa1a31d4fb1481add` | ✅ |
| V1-c | `wc -l` | 965 | 965 | ✅ |
| V1-d | `server/src/**` 零改动 | 空 diff | `git diff --stat 0a03b75~1 0a03b75 -- server/src/` **无输出** | ✅ |
| V1-e | 提交内容 | 只有新测试 + 报告 | 4 files / **+1421 −0**（3 测试 + 1 报告），既有套件 0 改动 | ✅ |
| V2 | 3 套件单跑 | 3 suites / 22 tests / 0 failed | **3 passed / 22 passed / 0 failed**（rc-project-review 12 · rc-export-objective 3 · rc-batch-guard 7） | ✅ |
| V3-A | V8 覆盖·函数级 | 四目标 >0 | scoreItem **36** · readStandardTree **4** · getProjectReview **8** · reviewProjectSubmission **10** | ✅ |
| V3-B | 探针（独立第二来源） | 四目标 >0 | enter = **36 / 4 / 8 / 10**（与 V8 逐字一致） | ✅ |
| V3-C | scoreItem 四分支 | 四臂全命中 | choice 7 · multi_choice 7 · judge 7 · fill 7（+空答早退 8 = 36） | ✅ |
| V3-D | readStandardTree 三路 | 全命中 | 新目录 2 · 历史 attachmentUrl 1 · 兜底 1（=4） | ✅ |
| V3-E | 两条 200 路径 | 真跑到 res.json | getProjectReview.200 **4** · reviewProjectSubmission.200 **6** | ✅ |
| V3-F | VM context 坑 | 是否存在 | **真实存在**（3 context，取 max=4/8/10，取 last=0/0/0） | ✅ 坑属实 |
| V4 | 自建变异 ≥3 处全 RED | 全 RED 且只打红该红的 | **9 处中 8 处 RED**，红集逐条精确；1 处为**有意设计的幸存者**（见 §4） | ✅（含 1 处盲区） |
| V5 | Z7/Z8 是否真不可达 | —— | **claim 半对**：黑盒不可达成立，「无法稳定复现」**不成立**（HTTP + 端口替身可确定性触发，5/5 实验通过） | ⚠️ 需更正 |
| V6 | 全量回归 | 4 处摘要 + failed=0 | 4 处摘要 · `failed` **0** · exit 0 · 段1 68/996 · 段2 17 · 段3 61 · 段4 21 | ✅ |
| V7 | 六门禁 + 两 lint | 与基线逐字相同 | 全部逐字相同（§6） | ✅ |
| V8 | `git status --porcelain -uno` | 空 | **非空**：` M docs/split/status.md` | ⚠️ 偏差可归属（§7-5） |

---

## 2 我自建的装置（与 B 完全独立）

| 装置 | 路径 | 用途 |
|---|---|---|
| 单跑包装 | `/tmp/cv/crun.sh` | 从 `server/.env` 只换库名为 `exam_system_test`，显式 `PORT=0` |
| V8 覆盖解析器 | `/tmp/cv/covparse2.mjs` | 自写：磁盘源码算 offset→line，**按 range 跨度降序套用（最内层胜出）**，跨 context 取 max |
| 探针 | `/tmp/cv/probe-mod.mjs` + `/tmp/cv/instrument.mjs` | 18 处**行锚定**注入（注入前逐条断言锚点存在），`appendFileSync` 逐次落盘 |
| 变异装置 | `/tmp/cv/mutate.mjs` + `/tmp/cv/mutrun.sh` | **行号锚定**单点替换（B 用的是文本替换，我的更严：`:802` 与 `:864` 文案逐字相同，文本替换会误伤两处） |
| 沙盒 | `/tmp/cv/base`（pristine）→ `/tmp/cv/mut`（每变异全新 rsync） | `rsync` 排除 `node_modules/uploads/.env`，三者软链回仓库；沙盒内 `sha256` 与仓库**恒等** |
| V5 实验 | `/tmp/cv/z78/server/test/integration/cv-z78-probe.test.js`（71 行，我自写） | 真实 HTTP 路径上的 Z7/Z8 可达性 |

**对照实验（关键）**：pristine 沙盒跑同样 3 套件 = **22/22 绿** ⇒ 沙盒本身**不产生假红**，后续任何 RED 都可归因于变异。

---

## 3 ★V3 覆盖证据（本步核心）

### 3.1 装置 A：V8 覆盖（自写解析器）

采集：`NODE_V8_COVERAGE=/tmp/cv/cov` + 三个新套件单跑 → 3 个 `coverage-*.json`。
其中**只有 pid 69799 那个**含三个测试文件（另两个进程 rcEntries=0），**该文件内 reviewController.js 有 3 个条目** ⇒ 一个进程内 3 个 VM context。

**函数级命中（跨 context 取 max）**：

| 函数 | 源行 | max | 逐 context |
|---|---|---|---|
| `scoreItem` | 680-703 | **36** | `[36, absent, absent]` |
| `readStandardTree` | 769-780 | **4** | `[0, 4, 0]` |
| `getProjectReview` | 788-841 | **8** | `[0, 8, 0]` |
| `reviewProjectSubmission` | 849-888 | **10** | `[0, 10, 0]` |

**行级命中（merged = 跨 context max）**：

- `scoreItem` L680-703：**仅 L702 `return 0;` = 0**，其余全部 >0。
- `readStandardTree` L769-780：**全部 >0**（769:4 … 776:1 777:1 778:1 779:1 780:4）。
- `getProjectReview` **200 段 L808-836：全部 >0**（808:4 … 836:4）；零覆盖仅 **L838-839**（500 catch）。
- `reviewProjectSubmission` **200 段 L870-883：全部 >0**（870:6 … 883:6）；零覆盖仅 **L885-886**（500 catch）。

### 3.2 装置 B：探针（与 V8 机理完全无关的第二来源）

18 处真实埋点，`appendFileSync` 落盘后 `sort | uniq -c`：

```
36 scoreItem.enter                  ← 与 V8 函数级 36 逐字一致
 8 scoreItem.earlyReturn.empty      ┐
 7 scoreItem.arm.choice             │ 7×4 + 8 = 36 ✓
 7 scoreItem.arm.multi_choice       │
 7 scoreItem.arm.judge              │
 7 scoreItem.arm.fill               ┘
 0 scoreItem.fallback.return0       ← L702 兜底：两装置一致判「未覆盖」
 4 readStandardTree.enter
 2 readStandardTree.newDir.exists
 2 readStandardTree.newDir.nonEmpty.return
 1 readStandardTree.legacy.hasAttachmentUrl
 1 readStandardTree.legacy.exists.return
 1 readStandardTree.fallback.return    ← 三条路全命中
 0 readStandardTree.newDir.empty       ← 子分支未覆盖
 0 readStandardTree.legacy.missing     ← 子分支未覆盖
 8 getProjectReview.enter
 4 getProjectReview.200.res.json       ← 8 − 4 次守卫拒绝
10 reviewProjectSubmission.enter
 6 reviewProjectSubmission.200.res.json ← 10 − 4 次守卫拒绝
```

**四条目标全部有真命中，且两套独立装置的数字逐字互证。** 22 例**不是**只拿 403/400 的空网：
- `scoreItem` 四分支各被真实执行 **7 次**；
- `readStandardTree` 的**新目录 / 历史 attachmentUrl / 兜底**三条路各有命中（对应 T-A1 / T-A3 / T-A2）；
- 两条 200 路径**真的走到了 `res.json`**（分别 4 / 6 次）。

> **我自建装置踩到的坑（登记）**：jest 沙盒里的 `process` 是**伪造副本**，`process.on('exit')` 在宿主退出时**不触发** ⇒ 探针第一版（靠 exit 落盘）产出为空文件、被 `cat` 判为「不存在」。改为逐次 `appendFileSync` 后正常。此坑与 §3.3 的坑同源（jest 的隔离层）。

### 3.3 ★ VM context 坑的独立判定：**属实，且我做了对照实验证实**

同一份 V8 数据、两种合并口径直接对拍（**受控对照，唯一变量 = 合并策略**）：

| 函数 | 跨 context 取 **max** | 取「**最后一个** context」 | 后果 |
|---|---|---|---|
| `readStandardTree` | **4** | **0** | 假 0 |
| `getProjectReview` | **8** | **0** | 假 0 |
| `reviewProjectSubmission` | **10** | **0** | 假 0 |
| `scoreItem` | 36 | 36 | 恰好同值（该 context 正是执行它的那个） |

⇒ **B 登记的坑真实存在**，且比 B 描述的更值得警惕：4 个目标里**有 3 个**会被「取最后一个 context」误报为**零覆盖**；若照此判定，会得出「Z2/Z3/Z4 完全没测到」的错误结论并错判本步 FAIL。

**我的实现如何处理**：按 `url` 结尾 `/reviewController.js` 收集**全部**条目（本次 3 个）→ 每个条目独立算「字符→行」计数 → **逐行取 max**（等价于 union）→ 再据此判 `count>0`。函数级同理取 max。

---

## 4 ★V4 我自建的变异反证（9 处，与 B 的 9 处 **零重叠**）

装置：行锚定替换 + 每个变异全跑 **3 个套件** + `--json` 精确取红集。

| # | 变异（源行） | 语义 | 结果 | 打红的用例 | 失败数 |
|---|---|---|---|---|---|
| CM1 | :695 judge `sAns === …` → `sAns.toLowerCase() === …` | judge 臂改成大小写不敏感 | **RED** | **仅 T-C2** | 1/22 |
| CM2 | :873 `Math.min(max, …)` → `Math.min(max - 1, …)` | 钳制**上限** | **RED** | **仅 T-B2** | 1/22 |
| CM3 | :873 `Math.max(0, …)` → `Math.max(1, …)` | 钳制**下限** | **RED** | **仅 T-B2** | 1/22 |
| CM4 | :802 `'无权操作'` → `'无权操做'`（改**一个字**） | 403 文案 | **RED** | **仅 T-A5** | 1/22 |
| CM5 | :779 `return { tree: [], contents: {} };` → `… { sentinel: 1 } …` | readStandardTree **兜底分支** | **RED** | **仅 T-A2** | 1/22 |
| CM6 | :684 `if (!sAns) return 0;` → `… return item.maxScore;` | 空答早退行为 | **RED** | **仅 T-C1** | 1/22 |
| CM7 | :811 `version ? readProjectTree(` → `false ? readProjectTree(` | Z3 的 200 路径 studentFiles | **RED** | **仅 T-A1** | 1/22 |
| CM8 | :882 `finalScore: updated.finalScore` → `finalScore: 0` | Z4 的 200 响应体 | **RED** | **仅 T-B1 / T-B2 / T-B3**（恰为 3 条断言响应 finalScore 的用例） | 3/22 |
| CM9 | :684 `if (!sAns) return 0;` → `if (false) return 0;` | 空答早退**失效** | **GREEN — 存活** | 无 | 0/22 |

**判定**：
- **8/9 RED，且每个变异只打红其语义对应的用例**（CM8 的 3 条红全部是断言响应 `finalScore` 的用例）——既无「一改全红」的假牙，也无「改了不红」的哑牙。红集粒度为**单个 `it`**。
- **CM9 是有意设计的幸存者（真实盲区）**：把 `:684` 的早退**整条失效**后，22 例仍全绿。原因是该早退在现有夹具下**观测等价**——空答走四分支后，choice/multi/judge/fill 四臂算出来**同样是 0**。
  - ⇒ 该语句**被执行了 8 次**（探针证据），但**其存在必要性零用例钉住**。
  - ⇒ 唯一的可观测差异点是「参考答案为空串 + 学生空答」：早退给 0，去掉后 choice 臂 `'' === ''` 会判**满分**。现有夹具不含此组合。
  - 对拆分的含义：若拆分时误删/改写这一行，**回归网不会红**。风险低（需要空参考答案这种脏数据），但**必须登记**。
- 装置自证：每次变异前后都核 `shasum -a 256 server/src/controllers/reviewController.js`，**恒为 `62ec56ed4c64`** ⇒ 产品代码全程零改动，变异只存在于 `/tmp/cv/mut`。

---

## 5 ★V5 Z7/Z8 claim 的裁定（`EntityNotFoundError` → 404 是否可达）

**B 的 claim**（§8-9 + plan §1.4-3）：「近乎不可达、**无法用测试稳定复现**」，故本轮不补。

### 5.1 结构分析：「黑盒不可达」这一半 **成立**

| 环节 | 查询 | 谓词 |
|---|---|---|
| 守卫 `loadVisibleSubmission:95-98` | `prisma.submission.findUnique({ where: { id } })` | 同一表、同一谓词 |
| 用例层 `SubmissionRepository.findById:13-19` | `prisma.submission.findUnique({ where: { id }, include: … })` | **同谓词**（`include` 不过滤父行） |
| 用例层 `findScoreContext:24-27` | `prisma.submission.findUnique({ where: { id }, select: … })` | **同谓词** |

且两处拿到的是**同一个强制转换结果**（`+req.params.id`，`:269`/`:285` 与 `:272`/`:292`）。⇒ **不替换任何端口时，没有任何输入能让第二次查询返回 null 而第一次返回行**；只有「同一请求内被并发删除」才可能。**「结构上近乎不可达」成立。**

### 5.2 但「无法用测试稳定复现」**不成立** —— 我造出来了

关键事实：`app.js:29 Object.assign(app.locals, compose({ prisma, logger }))` ⇒ **`app.locals.reviewUseCases` 是可写普通属性**。因此在**真实路由 + 真实中间件 + 真实守卫 + 真实控制器**完全不变的前提下，只替换这一个端口，即可**确定性**触发 catch 分支（无并发、无 sleep、无 flake）。

我在 `/tmp/cv/z78` 写了 5 例 HTTP 实验，**5/5 通过**：

| 例 | 构造 | 结果 | 证明了什么 |
|---|---|---|---|
| **C0** | 替身 `regrade` resolve → `{aiScore:7,aiFeedback:'C0'}` | **200** `{code:0,message:'重新评分完成',…}` + 断言替身收到的 cmd | 守卫通过、控制器**真的抵达 `:272` 调用点**（且不出网） |
| **C1 ★** | 替身抛 `EntityNotFoundError('C-PROBE-USE-CASE-404')`（**特异 message**） | `POST /api/teacher/submissions/:id/regrade` → **404** `{code:1004,message:'C-PROBE-USE-CASE-404',data:null}` | **`:275-276` 命中，经真实 HTTP 路径** |
| **C2 ★** | 替身 `manualAdjust` 抛 `('C-PROBE-ADJUST-404')` | `PUT /api/teacher/submissions/:id/score` → **404** + 该文案 | **`:295-296` 命中** |
| **C3** | 不存在的 id + 会抛异常的替身 | 404 `提交不存在`，且 **替身调用次数 = 0** | 守卫 `:95-101` **先短路**；两个 404 是**不同源** |
| **C4 ★** | 替身改用与守卫**相同的** `'提交不存在'` | 与 C3 的响应体 `JSON.stringify` **逐字节相同** | **可区分性陷阱**（见下） |

### 5.3 裁定与行动建议

- **claim 半对**：准确表述应为「**黑盒**不可稳定复现；但**用端口替身可在真实 HTTP 路径上确定性复现**，成本约 15 行/例」。B 在 §8-9 自己写的「只能靠 `reviewUseCases` 替身（探针路线）」其实已经承认了这条路，只是把它归给 C 而未判定为「可补」。
- **⇒ 建议：这两例应当补**（Z7/Z8），且**必须满足一条硬约束**：替身抛出的 message **必须区别于守卫文案** `'提交不存在'`，或额外断言替身调用次数。否则依 C4，用例可能在**守卫处就短路**却依然全绿 —— 补了一例「看起来覆盖了 :275-276、实际覆盖的是 :100」的**假阳性**。
- **拆分相关**：`req.app.locals.reviewUseCases` 这一间接层是 Z7/Z8 的唯一可测入口，也是既有 t4/t5 越权用例保持隔离的基础。**拆分后 controller 必须继续经 `req.app.locals` 取用用例层**，不得改为直接 `import` 实例，否则这条可测性与替身路线一并消失。

---

## 6 V6 全量回归 / V7 门禁

### 6.1 全量回归 `ROUND=18 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`

- 空序号核查：`docs/split/test-round-08..17.log` 已存在 ⇒ 从 18 起 ✅
- 退出码 **0**；日志 `docs/split/test-round-18.log`（168 KB）

| 判据 | 实测 |
|---|---|
| `Test Suites:` 摘要处数 | **4**（log :1405 / :1445 / :1534 / :1582） |
| `failed` 数 | **0**（4 个分段摘要全为 `N passed, N total`） |
| 分段规模 | 段1 **68 suites / 996 tests** ｜ 段2 1/17 ｜ 段3 1/61 ｜ 段4 1/21 |
| 三个新套件 | :504 / :627 / :748 三行均 `PASS` |
| `^FAIL` 行 | 0 |
| tree-sitter 同进程假红 | **无**（无需按约束包第 18 条隔离复跑） |

> 严谨性说明：`grep -c failed` 命中 4 行，逐行核对后**全部**是 `trustjudge-grader.test.js` 内**被 mock 的** `fetch failed` **日志文本**（log :1059-1062），与 jest 判据无关。**分段摘要中的 failed = 0 成立。**
> 与 B 的 ROUND=17 对比：段1 996（= B 的 996）、段2/3/4 = 17/61/21，**逐字相同**。

### 6.2 门禁七连（与基线逐字相同）

| 门禁 | 期望 | 实测 | 判定 |
|---|---|---|---|
| `check-layers.mjs` | 违规 0 / 未分层 44 | 文件 96 / **违规 0** / **未分层 44** | ✅ |
| `arch-metrics.mjs` | GodFile 3 / unmigrated 44 / 观察带 14 | 0/0 · 44/44 · **3/3** · **14/14**，名单含 reviewController(965)，**PASS** | ✅ |
| `cycle-check.mjs` | SCC 0 | 96 文件 / 214 边 / **SCC 0** / 自环 0，PASS | ✅ |
| `hard-metrics.mjs` | 0/0/0 | hex6 **0** · important **0** · modalConfirm **0**，PASS | ✅ |
| `bind-check.mjs` | 0 违规 | modules **197** / 663 bindings / **BINDING VIOLATIONS 0**（unresolved 4、external 1 仅登记） | ✅ |
| `eslint client/src server/src` | error 0 / warn ≤59 | 195 文件 / **error 0** / **warn 59**；`reviewController.js:365 no-unused-vars` 唯一那条在 | ✅ |
| `lint-check.mjs` | exit 0 / 基线 31 | **31 → 31** / 新增 **0** / 解析失败 0 / **exit 0** / `PASS（无基线外新违规）` | ✅ |

**⇒ GodFile 仍 3、未分层仍 44、违规仍 0：基线纹丝不动**，与「只加测试」的预期一致。

---

## 7 缺陷分级

| # | 级别 | 对象 | 事实 | 影响 / 处置 |
|---|---|---|---|---|
| 1 | **中** | B 报告 §3.2 臂表 + §3.3 逐行表 | **计数口径系统性偏大**。B 报 `scoreItem` L702 = **36**，我实测（V8 最内层 range + 探针双证）= **0**；B 报四臂 13/14·13/14/13·12，我实测**每臂恰好 7 次**。B 的数字实为**外层 range（函数体 36）**计数，会把「所在块执行过」误当成「该行执行过」 | **结论（四分支真执行）未被推翻** —— 我的两套独立装置证实四臂各 7 次命中；但「**全部行 count>0**」这一自证表述**不成立**，自证强度被高估。建议后续改用最内层 range 或探针计数 |
| 2 | **低** | 覆盖盲区 3 处 | (a) `scoreItem:702` 未知 type 兜底 = **0**（双装置一致）；(b) `getProjectReview:838-839` 与 `reviewProjectSubmission:885-886` 的 **500 catch = 0**；(c) `readStandardTree` 的 `newDir.empty` 与 `legacy.missing` 子分支 = 0 | **非阻断**：(a) 需要 `type` 取四值之外的题目（现网无）；(b) 通用兜底，且 500 若被拆分破坏会在期待 200 的用例上**间接变红**；(c) 需要「目录存在但为空」的夹具。登记为后续补强候选 |
| 3 | **低** | `:684 if (!sAns) return 0;` | **CM9 存活**：整条早退失效后 22 例全绿。该语句被执行 8 次，但**存在必要性零用例钉住**（观测等价） | 拆分时误删此行的**回归网不会报警**。可观测差异仅在「参考答案为空串 + 空答」⇒ 建议补 1 例边界（低优先） |
| 4 | **信息（需更正）** | Z7/Z8 claim | 「无法用测试稳定复现」**不成立**（§5）：**黑盒**不可达成立，但**端口替身 + 真实 HTTP** 可确定性复现，5/5 实验通过 | 建议补 Z7/Z8 两例，**硬约束**：替身 message 必须区别于守卫文案（否则假阳性，见 §5 的 C4） |
| 5 | **信息** | V8 判据「`-uno` 应为空」 | **非空**：` M docs/split/status.md`。归属核查：mtime `13:28:11`（= 我本轮开始时刻）、内容是 Captain 追加的「**待决清单**」（引用 B 的 D1 `:873` NaN、D2 `:754` headerCells）；**不在 `0a03b75` 内**、**非我写入**（我本轮零仓库写入） | 偏差**可归属且无产品代码风险**（纯 docs）。判据应更正为「`server/src/**` 与 `server/test/**` 无改动」——该口径实测为空 |
| 6 | **信息（B 未登记）** | `app.locals.reviewUseCases` | 是**可写**属性（`Object.assign`）；controller 一律经 `req.app.locals` 取用 | 双刃：既是 Z7/Z8 唯一可测入口，也是**拆分必须保持的接缝契约**（见 §5.3 末段） |

**B 的两处自陈口径，我独立复算后确认其正确**（B 在 §10 点名请 C 复核的第 1、2 项）：
- `headerCells` 的 `label` = 去 HTML 标签后的 `stem` 截断 60（`:660`），响应经 `:754` 只透出 `{label,maxScore}` ⇒ B 的 §8-4 与 D2 **正确**。
- `totalScore`：`:746 cellScores.every(c => !c.submitted) ? null : totalScore` + `:726-728` 只累加 `submitted` 的列 ⇒ 「部分未交时未交列按 0 参与求和、**只有全未交才是 `null`**」**正确**。

---

## 8 未做项与残留风险

**未做（本轮范围外，如实登记）**：
1. **未验证拆分本身** —— 本步 B0 未做任何拆分，我验证的只是「网」。拆分的正确性需在后续步另立验证。
2. **未复核 plan §5.2 的其余空白**（Z5/Z6/Z9/Z10/Z11/Z12/Z13/Z14/Z15 的全量）。我核实的只有 A 点名的 Z1–Z4 与 B 声明覆盖的 Z5/Z6/Z12：其中 Z5/Z6/Z12 由 T-D1/D2/D4 覆盖，我以变异 CM8/CM9 之外的读数**未逐条复核**其守卫文案 —— 但 V6 全量 + 变异红集已间接佐证。
3. **未做 Z7/Z8 的正式补例** —— 我只做了可达性**实验**（`/tmp`），未在仓库内新增用例（本轮只读约束）。
4. **未与 B 的 9 处变异逐一对拍** —— 我只验证了「存在 ≥3 处能变红」，未复跑 B 的 9 处（其装置在 `/tmp`，本轮明令不复用）。
5. **未复核 B 的 §3.2「跨套件分解」表** —— B 声称 `scoreItem` 在 rc-export 为 36、另两套件为 0。我实测其另两个 context 中该函数 **absent**（未编译）而非 0。**效果等价**（只有 rc-export 打靶），但表述不同。
6. **未验证 `server/tmp-probe-ref-answer.mjs`**（mtime 10-09，陈旧未跟踪文件，非 B0 产物、非我产物）—— 只登记，不建议在本步清理（涉及他人产物）。

**残留风险（按对拆分的威胁排序）**：
- **R1（低-中）**：`:684` 早退语句无用例钉住（CM9）。拆分时若被改写，**回归网静默**。
- **R2（低）**：三条 500 catch（`:838-839`、`:885-886`、`:757-759`）零覆盖。若拆分把 catch 的**响应形状**改掉，只有「期待 200 的用例意外变 500」这一条间接路径能发现。
- **R3（低）**：`:702` 兜底零覆盖。拆分若把它并入四分支，无用例会红。
- **R4（信息）**：Z7/Z8 零覆盖 + 拆分若改变 `req.app.locals` 取用方式，这条可测入口会消失。
- **R5（信息）**：22 例的夹具全部**自建自清**（独立院校代码、`afterAll` 逐目录 `fs.rmSync`），**不依赖 setup seed** —— 这点我通过「全量回归段1 996 = 974 + 22 且既有套件零改动」间接确认，**有利于**拆分期的独立回归。

---

## 9 结论

> ### **PASS —— 这张网足以支撑 step 8 对 `reviewController.js` 的拆分。**

**支持 PASS 的硬证据**：
1. **产品代码零改动**（sha256 `62ec56ed…` + 965 行 + `server/src/**` 空 diff 三重锚定）；
2. **22/22 绿**（我自跑，非采信报告），且全量回归 **4 处摘要 + failed=0**，段1 `996 = 974 + 22` ⇒ 只有新增、无既有用例被动过；
3. **不是空网**：两套**机理完全独立**的装置（V8 覆盖 + 运行期探针）**逐字互证** —— `scoreItem` 36、`readStandardTree` 4、`getProjectReview` 8、`reviewProjectSubmission` 10；`scoreItem` **四分支各 7 次**真命中；`readStandardTree` **三条路全命中**；两条 **200 路径真跑到 `res.json`**（4 / 6 次）；
4. **有牙**：我自建 **9 处**行锚定变异（与 B 零重叠），**8 处 RED 且红集逐条精确到单个 `it`**（含「改 403 一个字」「钳制上/下限各一处」「judge 臂」「兜底分支」「200 响应体」）；pristine 沙盒对照 22/22 绿 ⇒ 无假红；
5. **门禁基线纹丝不动**（GodFile 3 / 未分层 44 / 违规 0 / SCC 0 / bind 0 / eslint 0-59 / lint-check 31→31 exit 0）；
6. B 登记的方法论坑（**跨 VM context 必须取 max**）经我**受控对照实验**证实属实，且我的装置已正确处理 —— 否则 4 个目标里会有 3 个被误判为零覆盖。

**判定为 PASS 而非「需补强」的理由**：4 条目标区间（Z1–Z4）**逐条被真执行并钉住**，且我自建变异证明断言具备**单用例分辨力**；现存盲区（§7-2/3：`:702` 兜底、三条 500 catch、`readStandardTree` 两个空目录子分支、`:684` 观测等价）**全部位于错误兜底或等价类边角**，且**不是本次拆分所改动的语义**，因此**不构成进入拆分的阻断项**。

**但下列 3 项应在拆分前/中一并处理（非阻断，建议执行）**：
1. **补 Z7/Z8 两例**（`:275-276`、`:295-296`）—— 可达性已由我证实（§5），**必须用区别于守卫的特异 message** 以免假阳性；
2. **更正 B 报告的覆盖计数口径**（§7-1）—— 「逐行 count>0」应改为「最内层 range 命中」，并把 `scoreItem:702` 从「已覆盖」改登记为**未覆盖**；四臂计数应改为 **7/7/7/7**；
3. **登记 `:684` 为拆分敏感行**（§7-3）—— 拆分时该行必须逐字保留，其存在必要性无回归网保护。

---

### 附：本轮装置与产物清单
- 仓库内新增（允许项）：本报告、`docs/split/test-round-18.log`
- `/tmp/cv/` 下装置：`crun.sh` · `covparse.mjs` / `covparse2.mjs` · `probe-mod.mjs` · `instrument.mjs` · `mutate.mjs` · `res.mjs` · `mutrun.sh` · `base/`（pristine 沙盒）· `cov/`（V8 产物）· `probe/`（探针沙盒）· `z78/`（V5 实验）· `res-CM*.json` · `log-CM*.txt`
- 仓库内**零写入**：无 `git add/commit/clean/stash/checkout/reset/restore`，无 `rm`/`mv`
