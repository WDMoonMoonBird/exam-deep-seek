> ⚠️ **Captain 注记（2026-10-11，依据 C 的独立验证）—— 本报告 §3.3 的覆盖口径需更正**：
> 本报告称「Z1 L680-703 **逐行 count>0**」**不准确**：该结论用的是**外层 range 计数**。
> C 用两套机理独立的装置（V8 + 探针）逐行复核后确认：**`scoreItem:702`（兜底分支）实测 count = 0**，
> 四臂的真实计数为 **7 / 7 / 7 / 7**（choice / multi / judge / fill），而非本报告所报的「36」。
> **结论不受影响**（22 例确实真执行到了目标函数），但**自证口径应按上面更正**；
> 另 C 实测**唯二未覆盖**为：`scoreItem:702` 兜底、以及 500 catch 三处。
> 独立验证报告：`docs/split/reviewController-B0-verify.md`。
# reviewController 拆分 · B0 补契约测试报告（step 8，B0 子步）

- **step**: 8（server/src/controllers/reviewController.js，965 行）｜ **子步**: B0（先补契约测试，不做任何拆分）｜ **日期**: 2026-10-11
- **角色**: Agent B（唯一写者，本轮**只写测试**）｜ **方案依据**: `docs/split/reviewController-plan.md` §5.2 / §5.3 / §7.3 / §9-B0
- **硬边界遵守**: `server/src/` 零改动（只读）；未动 `client/`、`tests/`、`scripts/gates/`、任何 `.md`（本报告除外）；无任何 git 写操作
- **版本锚点**: 本轮**起点** HEAD = `1b713b83746e1238a9a72ef38831bc877dc02560`（分支 master）—— plan 的锚点，也是全量回归 ROUND=17 的锚点
  - `shasum -a 256 server/src/controllers/reviewController.js` = `62ec56ed4c647687a09bcd2329c5ceeca1968610e9495a7fa1a31d4fb1481add`
  - `wc -l` = 965（`split('\n').length` = 966）；与 plan §版本锚点**逐字相同** ⇒ 全程未触碰产品代码
  - **★ 并行事实（如实登记）**：本轮进行中，**另一 Agent** 提交了 `95e4a24 chore(lint): 门禁加「迁移识别」+ 基线升级为带 text 指纹（31→31 纯格式升级）`（改动面 `scripts/gates/lint-check.mjs` + `docs/pipeline/lint-baseline.json`，均为**他人产物**）。我在该新 HEAD 上**复跑了受影响的读数**：lint-check **exit 0 / 新增 0**、eslint **0 error / 59 warn / 195 文件**、arch **PASS（GodFile 3 / unmigrated 44）**、check-layers **违规 0 / 未分层 44** —— 与本报告 §6 各栏**逐字相同**（即：装置改进不改变本轮结论）。

---

## 0 一句话结论

A 在 plan §5.2 点名的 **Z1 / Z2 / Z3 / Z4** 四处真空白，已由 **3 个新套件 / 22 个用例** 钉住；
覆盖自证显示这四段**逐行命中**，9 处变异反证**全部变红**，全量回归 **4 处 Test Suites 摘要 + failed=0**，
五道门禁与两道 lint 判据读数与基线**逐字相同**（GodFile 3 / 未分层 44 / 违规 0 / SCC 0 / eslint 0 error 59 warn / lint-check 31→31）。

---

## 1 新增产物（只有 3 个新文件，0 处改动既有套件）

| # | 文件 | 用例数 | 打靶的空白 |
|---|---|---|---|
| 1 | `server/test/integration/rc-project-review-contract.test.js` | **12**（T-A1..A6 · T-B1..B6） | **Z2**（readStandardTree 双分支 + 兜底）、**Z3**（getProjectReview 200 全路径）、**Z4**（reviewProjectSubmission 200 全路径） |
| 2 | `server/test/integration/rc-export-objective-contract.test.js` | **3**（T-C1..C3） | **Z1**（`scoreItem` 四分支：choice / multi_choice / judge / fill）+ 客观题分列（:654-666）与判分调用点（:721-736） |
| 3 | `server/test/integration/rc-batch-guard-contract.test.js` | **7**（T-D1..D7） | **Z5**（:331 练习模式无需审核）、**Z6**（:387 练习模式无需发布）、**Z12**（:425 请选择提交） |
| — | 既有套件改动 | **0** | 未修改任何既有测试文件（不满足「必要」门槛） |

- 夹具全部**自建自清**（前缀 `rcb0p_ / rcb0e_ / rcb0b_`，独立学校院校代码 29411/29412/29421/29431），**不依赖 setup seed**，与 t4/t5/t6/t7 写法同构（supertest + `Authorization: Bearer`）。
- 磁盘夹具（标准包 / 学生提交目录）一律落在仓库既有 `server/uploads/{project-questions,project-submissions}` 下，`afterAll` 逐目录 `fs.rmSync`，删除前先断言路径位于对应根之内（与 open-project-flow 同款防护）。
- 未新增任何依赖、未联网、未启动任何常驻服务；全部单跑显式 `PORT=0` + `DATABASE_URL=<server/.env 只换库名为 exam_system_test>`。

---

## 2 新增用例清单（逐条：路由 / 场景 / 断言口径）

> 断言口径 = **状态码 + 响应体形状（含 code 与中文文案逐字）+ 关键 DB 终态**。文案断言一律用 `toEqual({code,message,data})` 整体对拍（不是 `toContain`），多一个字段即红。

### 2.1 T-A · `GET /api/teacher/submissions/:id/project`（Z2/Z3）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-A1** | 有标准包（新目录 `project-questions/{qid}/standard`）+ 合法 JSON `aiFeedback` + `version=2` 且学生文件已落盘 | 200/`code:0`/`message:'ok'`；`Object.keys(res.body)` = `[code,data,message]`；**`Object.keys(data).sort()` 逐名对拍 8 键**（aiResult·assignment·question·standardFiles·student·studentFiles·submission·version）；`standardFiles.contents['standard/spec.md']` 逐字；`studentFiles.contents['src/app.js']` 逐字；文件树节点 `{path,language,size}` 逐值；`version===2`；`aiResult` 深等于解析后对象 |
| **T-A2** | 无标准包 + `aiFeedback` 为**非法 JSON 串**（打 :817-821 的 `catch` 降级） | 200；`standardFiles` **整体等于** `{tree:[],contents:{}}`（readStandardTree 兜底 + readProjectTree 无目录兜底）；`aiResult` 等于 `{overallComment:'这不是 JSON 的原始评语串'}` |
| **T-A3** | **历史 `attachmentUrl` 目录**（标准包不在新目录，而在 `uploads/<attachmentUrl>`） | 200；`standardFiles.tree.length>0` 且 `contents` 含夹具文件逐字 ⇒ **readStandardTree 第二分支（:775-778）真命中**；学生目录未落盘 ⇒ 空树；`aiFeedback` 为空 ⇒ `aiResult===null` |
| **T-A4** | `version=0`（信封 falsy） | 200；`version===0`；`studentFiles` 空树（:811 的三元假分支） |
| **T-A5** | 守卫三态（一次真跑三条路径） | 404 `{code:1004,message:'提交不存在',data:null}`；400 `{code:1001,message:'非实训题提交',data:null}`；他师 403 `{code:1003,message:'无权操作',data:null}`（**夹具刻意让「他师」也可见该班**，确保命中的是 :802 的作业归属判定，而不是被更靠后的可见班级判定兜住 —— 两者文案不同） |
| **T-A6** | 作业归本教师、学生只在不可见班级 | 403 `{code:1003,message:'无权访问该提交',data:null}`；响应体 JSON **不含** `studentFiles/standardFiles/aiResult/material/scoringRubric` 任一子串（零泄漏） |

### 2.2 T-B · `PUT /api/teacher/submissions/:id/project/review`（Z4）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-B1** | `finalScore=60` + `teacherFeedback='T'` | 200/`code:0`/`message:'审核成功'`；`data` 键集合恰 `[finalScore,id,status,teacherFeedback]` 且整体等于 `{id,status:'reviewed',finalScore:60,teacherFeedback:'T'}`；**回读 DB**：status/finalScore/teacherFeedback 三键 + `reviewedAt` 非空 |
| **T-B2** | **分值钳制两态** | `-5 → 0`；`10**9 → question.maxScore(100)`（响应与 DB 双断言） |
| **T-B3** | **不传 `finalScore`**（undefined 分支） | 200 且 `data.finalScore===33`（保持原值），DB 亦为 33 |
| **T-B4** | **R3 不变量**：不传 `teacherFeedback` 且库中为 `null` | `data.teacherFeedback===''`，**且不等于/不含** `aiFeedback` 的内容（`'AI5_绝密'`）；DB 的 `aiFeedback` 本身不被改写 |
| **T-B5** | **显式空串** `teacherFeedback:''`（:876 的 `String(x \|\| '')` 分支） | `data.teacherFeedback===''` + DB 亦为 `''` |
| **T-B6** | 守卫逐字 + **零写入** | 他师 403 `'无权操作'` · 不可见生 403 `'无权访问该提交'` · 非实训题 400 `'非实训题提交'` · 不存在 404 `'提交不存在'`（四条全整体对拍）；四条跑完后 DB 的 status/finalScore/teacherFeedback 与跑前逐键相等 |

### 2.3 T-C · `GET /api/teacher/export-review`（Z1 `scoreItem`）

夹具：1 个客观小题（4 个小问 × 25 分：choice/judge/multi_choice/fill）+ 1 个主观小题（40 分），5 名学生（全对 / 多选少选 / 全错 / 空答 / 未交）。

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-C1** | 四型逐值判分 | 200；**响应体无 `message`**（既有契约，`Object.keys(res.body).sort()==['code','data']`，:754-756）；`headerCells` 恰 5 列且逐值等于 `[{label:去标签stem,maxScore:25}×4,{label:'主观',maxScore:40}]`，并断言 `itemKey/sqId/answer/options` **不出网**；行序 = username 升序；① **全对**：`'B'`(choice) / `'B,A'`(multi，**无序集合相等**) / `'true'`(judge) / `'foo,bar'`(fill，**逗号分空 + 逐空小写**) → 逐格 `{label,maxScore,score,submitted}` 四键对拍，`totalScore===100`；② **多选少选** → `[25,0,25,25,null]`，`totalScore===75`；③ **全错** → `[0,0,0,0,null]`，`totalScore===0`（已交 ⇒ 0 而非 null）；④ **已交但空答**（`''` → `!sAns` 早退）→ 全 0，`totalScore===0`；⑤ **未提交** → 客观列 `score===null`（不调 scoreItem）、`submitted===false`、`totalScore===null`（:746 的 `every(!submitted)` 分支） |
| **T-C2** | **判分等价类反例**（独立学生，用完即删） | multi_choice **多选**（`'A,B,C'` ⊃ `['A','B']`）→ 0；choice **小写** `'b' ≠ 'B'` → 0；judge `'TRUE' ≠ 'true'` → 0；fill **少一空** → 0；`totalScore===0` |
| **T-C3** | 守卫逐字 | 缺 `classId` / 缺 `assignmentId` / `assignmentId='abc'` → 均 400 `{code:1001,message:'参数错误',data:null}`；他人班级 → 403 `{code:1003,message:'无权访问该班级',data:null}` 且响应体**不含**学生姓名 |

### 2.4 T-D · 批量端点守卫（Z5/Z6/Z12）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-D1** | `batch-review` + `mode:'practice'` 作业 | 400 **整体等于** `{code:1001,message:'练习模式无需审核',data:null}`；**零写入**：该提交 status/finalScore/teacherFeedback/`reviewedAt` 四键前后相等（:331 在 `$transaction` 之前 return） |
| **T-D2** | `batch-publish` + `mode:'practice'` | 400 `{code:1001,message:'练习模式无需发布',data:null}`；**零写入**（:387 在 `updateMany` 之前 return） |
| **T-D3** | **对照正例**（同教师同班级的 `exam` 作业） | 200 `message:'已审核 1 名学生'` + `data:{count:1}`、DB 落 `reviewed/finalScore=aiScore/teacherFeedback=aiFeedback`；再 `batch-publish` → `'已发布 1 名学生'`、DB 落 `published` ⇒ **证明上面的 400 是 practice 专属，不是「批量端点整体短路」** |
| **T-D4** | `publishScores` 空入参三态（`{}` / `{submissionIds:[]}` / `{submissionIds:null}`） | 三次均 400 `{code:1001,message:'请选择提交',data:null}`；该提交状态三键零变化 |
| **T-D5** | `publishScores` 混入不可见 id | 403 `code:1003` + `message:'部分提交不在可见范围内，已整批拒绝'` + `data.rejectedIds` **恰等于** `[invisibleId]`；**原子性**：可见那条仍为 `reviewed`（未生效） |
| **T-D6** | `publishScores` 全可见（reviewed + 已 published 混批） | 200 **整体等于** `{code:0,message:'发布成功',data:null}`；reviewed → published；已 published 的不动且 `finalScore` 不被改写 |
| **T-D7** | 班级不在可见集合（他人班级 **与** 不存在的正整数） | `batch-review` 与 `batch-publish` 均 403 **整体等于** `{code:1003,message:'无权操作该班级',data:null}`（含 ghost classId ⇒ 不 fail-open） |

---

## 3 覆盖自证（★ 证明「真执行到目标函数」，而不是只拿到 403/400 就算过）

### 3.1 方法（可复现，产物在 /tmp）

```bash
# 1) 只跑三个新套件，开 V8 覆盖采集
rm -rf /tmp/rcb0-nodcov2 && mkdir -p /tmp/rcb0-nodcov2
NODE_V8_COVERAGE=/tmp/rcb0-nodcov2 /tmp/rc-b0-jest.sh \
  test/integration/rc-project-review-contract.test.js \
  test/integration/rc-export-objective-contract.test.js \
  test/integration/rc-batch-guard-contract.test.js
# 2) 把 V8 覆盖产物按「行 → 命中次数」展开（解析脚本在 /tmp，未进仓库）
node /tmp/rcb0-cov-report.mjs /tmp/rcb0-nodcov2
```

> `/tmp/rc-b0-jest.sh` = 单跑包装（`PORT=0` + 从 `server/.env` 只换库名为 `exam_system_test`）。
> `/tmp/rcb0-cov-report.mjs` = 覆盖产物解析器（**用磁盘源码**算行偏移，因为 jest VM 的 V8 条目不带 `source` 文本）。

### 3.2 函数级命中（跨 VM context 取最大计数；>0 即真执行）

| 函数（源行区间） | 命中次数 | 对应空白 |
|---|---|---|
| **`scoreItem` @L680-703** | **36** | Z1 |
| **`readStandardTree` @L769-780** | **4** | Z2 |
| **`getProjectReview` @L788-841** | **8** | Z3 |
| **`reviewProjectSubmission` @L849-888** | **10** | Z4 |
| `exportReviewData` @L608-761 | 6 | S19（含 Z1 调用点） |
| `batchReview` @L318-372 | 4 | Z5 |
| `batchPublish` @L374-420 | 3 | Z6 |
| `publishScores` @L422-444 | 5 | Z12 |
| `isStudentVisibleToTeacher` @L65-73 | 12 | 越权判定单元 |

**逐 context 分解**（证明三个套件各自打到了什么，也证明覆盖面不是靠某一个套件堆出来的）：

| 函数 | `rc-project-review` | `rc-export-objective` | `rc-batch-guard` |
|---|---|---|---|
| `scoreItem` | 0 | **36** | 0 |
| `readStandardTree` | **4** | 0 | 0 |
| `getProjectReview` | **8** | 0 | 0 |
| `reviewProjectSubmission` | **10** | 0 | 0 |
| `exportReviewData` | 0 | **6** | 0 |
| `batchReview` / `batchPublish` / `publishScores` | 0 | 0 | **4 / 3 / 5** |

### 3.3 逐行命中（A 点名的区间，**每一行 count>0**）

```
✅ Z1 scoreItem L680-703               全部行 count>0
   680:36 681:36 682:90 683:36 684:36 685:36 686:36 687:36 688:36 689:36 690:13 691:14 692:13
   693:36 694:36 695:36 696:36 697:14 698:13 699:12 700:36 701:36 702:36 703:36
✅ Z2 readStandardTree L769-780        全部行 count>0
   769:4 770:4 771:4 772:4 773:4 774:4 775:4 776:4 777:4 778:4 779:4 780:4
✅ Z3 getProjectReview 200 段 L808-836  全部行 count>0（808..836 全为 8）
✅ Z4 reviewProjectSubmission 200 段 L870-883 全部行 count>0（870..883 全为 10）
✅ Z5 batchReview 练习模式 400 L330-331  (330:4 331:4)
✅ Z6 batchPublish 练习模式 400 L386-387 (386:3 387:3)
✅ Z12 publishScores 空入参 400 L424-425 (424:5 425:5)
✅ S19 exportReviewData 客观题分列 L654-666       全部行 count>0（654..666 全为 6）
✅ S19 exportReviewData 客观题判分调用点 L721-736  全部行 count>0（721..736 全为 55）
```

**Z1 四分支的臂级证据**（`scoreItem` 内部 range 计数，直接对应四个 `if` 臂）：

| 源行 | 语义 | 命中 |
|---|---|---|
| :688-690 | `choice` 臂 | 13 |
| :691-693 | `multi_choice` 臂 | 14 / 13 |
| :694-697 | `judge` 臂 | 14 |
| :696-699 | `fill` 臂 | 13 / 12 |
| :702 | 兜底 `return 0`（未命中的 type） | 36（随函数体） |

### 3.4 ★ 方法论坑（登记，防后人重踩）

jest 给**每个测试文件一个独立 VM context**，同一模块被加载 3 次；**未被某 context 执行到的函数在该 context 的计数恒为 0**。
覆盖率合并**必须跨 context 取最大值** —— 取「最后一个 context」会得到**假的 0**（本次 v1 解析器就这么把自己骗了，一度误报 Z1/Z2/Z3/Z4「全部未命中」）。
本报告所有数字均来自 `max over contexts` 口径。

---

## 4 反证（证明用例有牙：把被测行为改坏 → 必须变红）

- **装置**：`git archive HEAD server` 导出到 `/tmp/rc-b0-mut`（2.6MB，非整树拷贝），把三个新套件 + `server/node_modules` 软链就位；
  `/tmp/rc-b0-mut.sh <name> <old> <new> <tests...>` 在副本里做**单点文本替换**（替换前先断言靶点存在，否则报「装置无效」），再用 `PORT=0 DATABASE_URL=<exam_system_test>` 跑指定套件。
- **产品代码全程零改动**：变异只写在 `/tmp/rc-b0-mut/server/src/controllers/reviewController.js`；仓库内该文件 sha256 前后恒为 `62ec56ed…`。

| # | 注入的变异（源行） | 命中用例 | 结果 |
|---|---|---|---|
| M1 | :688 choice 判分 `sAns === String(refAnswer).trim()` → 恒真 | T-C1 / T-C2 | **RED ✓**（2 failed / 3） |
| M2 | :693 multi_choice `ok===aSet.size && sSet.size===aSet.size` → `ok>0` | T-C1 / T-C2 | **RED ✓**（2 failed / 3） |
| M3 | :699 fill 去掉 `toLowerCase()` | T-C1 | **RED ✓**（1 failed / 3） |
| M4 | :775 砍掉历史 `attachmentUrl` 分支（`if (false && …)`） | T-A3 | **RED ✓**（1 failed / 12） |
| M5 | :819 非法 JSON 降级 `{overallComment}` → `null` | T-A2 | **RED ✓**（1 failed / 12） |
| M6 | :873 去掉分值钳制（**= plan §7.4 变异②**） | T-B2 | **RED ✓**（1 failed / 12） |
| M7 | :876 R3 评语回退 AI（`sub.aiFeedback`） | T-B4 | **RED ✓**（1 failed / 12） |
| M8 | :331 练习模式无需审核分支失效 | T-D1 | **RED ✓**（1 failed / 6） |
| M9 | :425 请选择提交分支失效 | T-D4 | **RED ✓**（1 failed / 6） |

**9/9 全红，且每个变异只打红它该打红的用例**（无「一改全红」的假牙，也无「改了不红」的哑牙）。
细节：M6/M7/M8/M9 的失败数是 `1 failed, 11 passed` 量级 ⇒ 分辨力来自**该条用例的精确断言**，不是整片崩。

---

## 5 单跑与全量回归（判据 = 4 处 `Test Suites:` 摘要 + failed=0）

### 5.1 三个新套件单跑（全绿）

```
PASS test/integration/rc-project-review-contract.test.js    12 passed
PASS test/integration/rc-export-objective-contract.test.js   3 passed
PASS test/integration/rc-batch-guard-contract.test.js        7 passed
Test Suites: 3 passed, 3 total
Tests:       22 passed, 22 total      ← 0 failed
```

### 5.2 全量回归 `ROUND=17 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`

（**先查空序号**：`docs/split/` 下已有 `test-round-08..15.log`，故从 16 起；16 已被本次首跑占用，终稿取 17）

```
Test Suites: 68 passed, 68 total      Test Suites: 1 passed, 1 total
Tests:       996 passed, 996 total    Tests:       17 passed, 17 total
------------------------------------  ------------------------------------
Test Suites: 1 passed, 1 total        Test Suites: 1 passed, 1 total
Tests:       61 passed, 61 total      Tests:       21 passed, 21 total
```

| 判据 | 结果 |
|---|---|
| 4 处 `Test Suites:` 摘要 | **✅ 4 处**（日志 `docs/split/test-round-17.log`） |
| `failed` 数 | **✅ 0**（`grep -E 'Tests:.*failed'` 无输出） |
| 三个新套件在日志中的形态 | `PASS test/integration/rc-{project-review,export-objective,batch-guard}-contract.test.js` 全部出现 |
| 用例数变化 | 段1 `974 → 996`（**+22** = 本轮新增），段2/3/4 `17 / 61 / 21` 不变 ⇒ **只有新增，无既有用例被改动或删除** |

> 注：首跑取 ROUND=16（同为 4 处摘要 + 0 failed，段1 `996`）；此后我补了一条守卫用例 **T-D7**（补 `无权操作该班级` 文案），故以 **ROUND=17** 作为含全部 22 例的终稿归档。

---

## 6 门禁读数（本轮不改产品代码 ⇒ **基线纹丝不动**）

| 门禁 | 命令 | 实测 | 基线 | 判定 |
|---|---|---|---|---|
| 分层守卫 | `node server/scripts/check-layers.mjs` | 文件 96 / **违规 0** / 未分层待迁移 **44** | 0 / 44 | ✅ 不变 |
| 架构门禁 | `node scripts/gates/arch-metrics.mjs` | layerViolations **0/0**、unmigrated **44/44**、godfileOver800 **3/3**、观察带 **14/14**；名单 = teacherController(1338)/Doc.vue(1106)/**reviewController(965)** | 同 | ✅ PASS |
| 循环依赖 | `node scripts/gates/cycle-check.mjs` | 96 文件 / **214** 条边 / **SCC 0** / 自环 0 | 0 | ✅ PASS |
| 硬指标 | `node scripts/gates/hard-metrics.mjs` | **0/0/0**（只扫 client/src） | 0/0/0 | ✅ PASS |
| 绑定门禁 | `node scripts/gates/bind-check.mjs` | **BINDING VIOLATIONS 0**；unresolved 4 / external 1（仅登记）；modules scanned **197**（= 原 194 + 本轮 3 个新测试文件） | 0 / 4 / 1 | ✅ PASS |
| **lint (a)** | `./node_modules/.bin/eslint client/src server/src -f json` | 195 文件、**error 0**、**warn 59**；`reviewController.js:365 no-unused-vars count`（本文件唯一那条，逐字在） | 0 / 59 | ✅ 达标 |
| **lint (b)** | `node scripts/gates/lint-check.mjs` | 合计 **31 → 31**、新增 **0**、resolved 0、**exit 0**（PASS（无基线外新违规）） | 31 | ✅ 31 不变 |

**结论：GodFile 仍然 3、未分层仍然 44、违规 0 —— 基线纹丝不动**（与「只加测试」的预期一致）。

> 旁证（非本步产物）：`git status --porcelain -uno` 在我本轮开始时为 `M scripts/gates/pixel-diff.mjs`、结束时为 `M scripts/gates/lint-check.mjs` —— 这两个都是**他人并行改进装置**的未提交改动（lint-check 的 +289/−14 就是 plan §6.5 提到的「迁移识别」装置改进），**不是我本轮写的**；我本轮没有触碰 `scripts/gates/**`。

---

## 7 改动面（`git status --porcelain -uno` + 未跟踪清单）

```
$ git status --porcelain -uno        # ← 空：工作区无任何「已跟踪文件的改动」来自我
$ git status --porcelain | grep -E 'server/test|reviewController-B0'
?? docs/split/reviewController-B0-tests.md
?? server/test/integration/rc-batch-guard-contract.test.js
?? server/test/integration/rc-export-objective-contract.test.js
?? server/test/integration/rc-project-review-contract.test.js
```

- **`server/src/**` 零改动**（sha256 前后恒等，见 §0；`git status` 对它无任何条目）。
- 未修改任何**既有**测试文件（`server/test/**` 下只有上述 3 个新增文件）。
- 未动 `client/**`、`tests/`、`scripts/gates/**`、`docs/pipeline/**`、`server/.env`。
- 未执行任何 git 写操作（无 add/commit/clean/stash/checkout/reset/restore）。
- 本轮**开始时** `git status -uno` 显示 `M scripts/gates/pixel-diff.mjs`，**中途**变为 `M scripts/gates/lint-check.mjs`：两者都是**他人并行装置改进**（后者随后被对方提交为 `95e4a24`），**与本轮产物无关**（见 §0 的并行事实）；**结束时 `-uno` 为空**。

---

## 8 与 A 的 plan §7.3 清单的偏差（以实测为准，逐条说明）

| # | plan 建议 | 我的实测/处置 | 理由 |
|---|---|---|---|
| 1 | T-A「200 正例 ×2（有标准包 / 无标准包）」 | 拆成 **T-A1..A4 四例**（有包 / 无包+非法JSON / 历史 attachmentUrl / version=0） | plan §7.3-F15 自己的打靶清单就要求「有标准包（新目录）/ 标准包走历史 `attachmentUrl` / `aiFeedback` 非法 JSON / `currentVersion=0`」四态；**Z2 的三个分支否则打不全** |
| 2 | T-A「`Object.keys(data).sort()` === 8 键」 | ✅ 逐字照做（T-A1） | 实测吻合 |
| 3 | T-A「`standardFiles.tree/contents`（无标准包 → `{tree:[],contents:{}}`）」 | ✅ 照做；且**补断言有标准包时 `contents` 逐字相等**（plan 只说「含夹具文件名」） | 「含文件名」弱于「逐字相等」；断言只允许更强 |
| 4 | T-C「`headerCells` 长度与 `label` 文案（含 `stem` 的 HTML 剥离 + `slice(0,60)`）」 | ✅ 实测确认：客观列的 `label` **就是**去标签后的 `stem`（**不是 `undefined`**）；响应体只透出 `{label,maxScore}` 两键 | ★ 我最初按「客观列无 label」写断言 → **实测红** ⇒ 以实测为准改正。**登记**：`itemKey != null` 判据在**服务端**成立，但前端拿到的 `headerCells` 里已无 `itemKey`（被 :754 的 map 剥掉），前端无法据此区分客观/主观列 —— 属既有契约，**登记不改** |
| 5 | T-C「unsubmitted（status 为空）→ `score===null` 且不计入 totalScore」 | ⚠️ **一半对**：列级未交 ⇒ `score===null` ✅；但「不计入 `totalScore`」实测是**「全未交 ⇒ `totalScore===null`」**，**部分已交时未交列按 0 参与求和** | 逐字读 :746 的 `every(c=>!c.submitted) ? null : totalScore` 即可确认；两种形态我都断言了（T-A3 学生列 / T-C1 未交行） |
| 6 | T-C「`multi_choice` 无序集合相等（`'A,B'` vs `'B,A'` 都满分）、多选/少选均 0 分」 | ✅ 照做 + **fill 的「逗号分空 + 逐空小写」正反两向都打** | 与实测一致 |
| 7 | T-D「`publishScores` 的 `{}`/`[]` → 400 ×2」 | 扩为**三态 ×1 例**（`{}` / `{submissionIds:[]}` / `{submissionIds:null}`） | 三种入参走同一个 `!submissionIds?.length`，合成一例更省且更强 |
| 8 | plan §7.3 未列入 T-D7 | **新增 T-D7**（`无权操作该班级` 逐字 + ghost classId） | 任务书硬要求「必须覆盖 403/`code:1003` 越权路径，文案逐字」；该文案原先**零命中**，补齐后新套件的 1003 文案覆盖 = 5 种 |
| 9 | plan §5.2 的 **Z7/Z8**（`EntityNotFoundError` → 404 两条） | **本轮不补** | plan §1.4-3 已裁定「结构上近乎不可达、无法用测试稳定复现、不应为此写脆弱用例」；且它只能靠 §7.1 的 `reviewUseCases` 替身（**探针路线，属 C 的 F08**） |
| 10 | plan §5.2 的 **Z9/Z10/Z11/Z13/Z14/Z15** | **本轮不补** | 均**不在** A 点名的「真空白」集合内（Z9/Z11 属 getSubmissions/getReviewQuestions，Z10/Z13/Z14/Z15 属共享守卫的边角等价类），任务书只要求 T-A~T-D；登记为 C 的复核项 |

---

## 9 发现的实现缺陷 / 既有契约怪癖（**如实登记，本轮一律不改实现、不放宽断言**）

| # | 位置 | 现象 | 处置 |
|---|---|---|---|
| D1 | `reviewProjectSubmission:873` | `Math.max(0, Math.min(max, Number(finalScore)))`：`Number('abc') → NaN` ⇒ `Math.min(max, NaN)=NaN`、`Math.max(0, NaN)=NaN` ⇒ 会把 `NaN` 交给 Prisma（写入行为未定义/报错）。plan §1.4-3 与 §10-8 明令「不许顺手加 NaN 防护」 | **不修、不写脆弱用例**（属未定义行为，写断言等于把 UB 固化成契约）。登记给 Captain 作为**独立后续项** |
| D2 | `exportReviewData:754` | 响应 `headerCells` 只透出 `{label,maxScore}`，把 `sqId/itemKey/type/answer/options` 全部剥掉 ⇒ 前端拿到客观题列却拿不到 `itemKey` | **既有契约**，拆分须逐字保留；T-C1 显式断言这 4 个键**不出网**（钉成契约，防拆分时「顺手补齐」造成泄漏） |
| D3 | `getReviewSummary` / `getReviewByClass` / `exportReviewData` | 响应体**没有 `message` 字段**（与其余 13 条路由形状不一致） | plan §1.4-4 已登记；T-C1 用 `Object.keys(res.body).sort()==['code','data']` 把它钉住 |
| D4 | `batchReview:354,365` | 死变量 `count`（只写不读；响应体用的是 `reviewedStudentIds.size`） | 本步逐字保留（plan §6.5）；T-D3 断言的是**真实生效值** `data.count===1`（= `reviewedStudentIds.size`），与死变量无关 |

> **本轮未发现「实现与 plan 契约不符」的阻断缺陷**：22 条用例的断言在**以实测口径书写**后即全绿（两次红都是**我自己的夹具/假设**错，不是实现错，见 §8-4 与 §8-5）。

---

## 10 给 Agent C 的验证指令（只读复核，临时产物一律 /tmp）

> 目标：独立证明「B0 的 22 条用例**真的**覆盖了 Z1/Z2/Z3/Z4，而不是只在守卫处短路」。

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
# 0) 版本锚点（应逐字等于 62ec56ed… / 965 行）
shasum -a 256 server/src/controllers/reviewController.js && wc -l server/src/controllers/reviewController.js

# 1) 单跑三个新套件（应 3 passed / 22 passed / 0 failed）
#    注意：必须显式 PORT=0 且 DATABASE_URL 指向 exam_system_test（库名不同时 setup.js 会 exit 1 且不打印摘要）
TEST_URL="$(node -e 'const fs=require("fs");const m=fs.readFileSync("server/.env","utf8").match(/^DATABASE_URL=(.*)$/m);const u=new URL(m[1].trim().replace(/^"|"$/g,""));u.pathname="/exam_system_test";process.stdout.write(u.toString())')"
( cd server && PORT=0 DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules ./node_modules/.bin/jest    --config test/jest.config.js --runInBand --forceExit    test/integration/rc-project-review-contract.test.js    test/integration/rc-export-objective-contract.test.js    test/integration/rc-batch-guard-contract.test.js )

# 2) ★覆盖自证（C 自建装置更佳，不复用 B 的脚本）
#    路线 A（推荐）：V8 覆盖 —— 同上三套件，前置 NODE_V8_COVERAGE=/tmp/c-rcb0-cov
#      解析要求：按 url 以 reviewController.js 结尾筛条目 → 用【磁盘源码】算 offset→line
#      ★ 坑：同一模块有 3 个 VM context，未执行到的 context 计数恒 0 ⇒ **必须跨 context 取 max**
#      判据：scoreItem L680-703 / readStandardTree L769-780 / getProjectReview L808-836 /
#            reviewProjectSubmission L870-883 **逐行 count>0**
#    路线 B（更硬的独立来源）：在 /tmp 副本里给这 4 个函数各插一行探针（计数 + 落盘证据），
#            跑完断言探针计数 >0 —— 与 B 的装置完全无关。

# 3) 反证（C 自建 3 处变异，不必复用 B 的 9 处）
#    /tmp 副本 + 单点替换 + 只跑对应套件，判据 = 必须 RED：
#     ① scoreItem 的 multi_choice 判据 → ok>0            → T-C1/T-C2 必红
#     ② reviewProjectSubmission 去掉 Math.max/min 钳制    → T-B2 必红
#     ③ batchReview:331 练习模式分支失效                  → T-D1 必红

# 4) 全量回归（判据 = 4 处 Test Suites 摘要 + failed=0，不得拿用例数当判据）
ROUND=18 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh
grep -nE '^Test Suites:|^Tests:' docs/split/test-round-18.log     # 期望 4 处；grep 'failed' 应无输出

# 5) 门禁五连 + 两道 lint（本轮不改产品代码 ⇒ 应与基线逐字相同）
node server/scripts/check-layers.mjs      # 违规 0 / 未分层 44
node scripts/gates/arch-metrics.mjs       # GodFile 3 / unmigrated 44 / PASS
node scripts/gates/cycle-check.mjs        # SCC 0
node scripts/gates/hard-metrics.mjs       # 0/0/0
node scripts/gates/bind-check.mjs         # BINDING VIOLATIONS 0（modules scanned 应为 197）
./node_modules/.bin/eslint client/src server/src -f json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("errors",j.reduce((a,f)=>a+f.errorCount,0),"warnings",j.reduce((a,f)=>a+f.warningCount,0))})'
node scripts/gates/lint-check.mjs         # 合计 31→31 / 新增 0 / exit 0
```

**C 的通过判据（逐条）**
1. `sha256(reviewController.js)` 恒等于 `62ec56ed…`、`wc -l` = 965（B0 未触碰产品代码）；
2. 三个新套件 **22/22 绿**，且 `failed=0`；
3. **覆盖自证**：四条目标区间逐行命中（或探针计数 >0）—— 只凭「状态码对」**不算过**；
4. **反证**：C 自建 ≥3 处变异**全部 RED** —— 不红即判 B0 装置无牙，本步 FAIL；
5. 全量回归 4 处摘要 + `failed=0`；
6. 门禁五连读数与 §6 表**逐字相同**（GodFile **3**、未分层 **44**、违规 **0**、SCC **0**、bind 0；eslint 0 error / ≤59 warn；lint-check 31→31 exit 0）；
7. `git status --porcelain -uno` 的改动面**只有 3 个新测试文件 + 本报告**（`scripts/gates/lint-check.mjs` 的改动是他人并行产物，须与其归属方核对）。

**C 需要重点复核的三处（我可能错的地方）**
- `headerCells` 的 `label` 口径（我实测 = 去标签 `stem`，与 plan §7.3 的暗示不同）→ 请独立复算一次；
- `totalScore` 在「部分未交」时的口径（我实测 = 未交列按 0 参与求和；只有**全未交**才是 `null`）；
- 覆盖率**跨 VM context 取 max** 这条口径是否成立（我 v1 取「最后一个 context」时得到假 0，是本轮唯一一次险些误判）。

---

## 11 本轮自证清单（全绿）

- [x] 三个新套件单跑 **3 suites / 22 tests / 0 failed**
- [x] 覆盖自证：Z1(36) / Z2(4) / Z3(8) / Z4(10) 函数级命中 + 四条区间**逐行 count>0**
- [x] Z1 四分支臂级命中（choice 13 / multi 14·13 / judge 14 / fill 13·12）
- [x] 反证 **9/9 RED**（每个变异只打红它该打红的用例）
- [x] 全量回归 **4 处 Test Suites 摘要 + 0 failed**（段1 996 = 974 + 22）
- [x] 门禁五连 + 两道 lint：与基线**逐字相同**（GodFile **3** 未变 / 未分层 **44** 未变 / 违规 0 / SCC 0 / eslint 0-59 / lint-check 31→31）
- [x] 产品代码零改动（sha256 + 行数双锚点）
- [x] 无 git 写操作；未触碰 client / tests / scripts/gates / 既有测试断言
