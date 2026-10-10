# audit-round-04 —— 安全专项审查 + 质量收敛确认（流水线第 4 轮）

> 轮次：**04（复审 + 安全专项）** ｜ 日期：**2026-10-11（凌晨）** ｜ 基线 commit：`7b874b1`（`git rev-parse HEAD` 实测 = `7b874b1b83a5c87a443c0504df2e276b3246e552`）
> Agent A 技能：`code-analyzer`（本仓约定 = 规范里的 `deep-code-analyzer`）
> 范围与方法：**安全维度全仓有界普查**（round 0 §5.5 明示"未做安全专项"，属从未覆盖的新维度，非重复扫描）+ round 1-3 净效果抽验复核 + 5 项候选评估
> 上游输入：`docs/pipeline/project-constraints.md`（12 条测量纪律）· `pipeline-status.md` · `docs/pipeline/audit-round-00.md` §F-2/§5 · `docs/reports/既有缺陷交接清单-2026-10-10.md` §A · `docs/pipeline/audit-round-03.md` §1/§1.1 · `docs/pipeline/test-round-03.md` · `docs/pipeline/refactor-round-03.md`

---

## 0 约束遵守声明

| 约束 | 执行情况 |
|---|---|
| 纯只读（除本报告外不写任何文件） | ✅ 唯一写入 = `docs/pipeline/audit-round-04.md`；临时脚本落 `/tmp/a4-*.mjs`（`a4-secrets.mjs` / `a4-unused.mjs` / `a4-unused2.mjs` / `a4-admincheck.mjs`），未入仓 |
| 禁止 `git clean`/`stash`/`checkout -- .`/`reset --hard`/`restore .`；**零 git 写操作** | ✅ 只用 `rev-parse`/`log`/`show`/`status`/`diff`/`ls-files`/`archive`/`check-ignore`；**零 git 写操作** |
| 不跑 jest（C 职责） | ✅ 未执行任何 jest 命令；未改 `server/test/` |
| 不跑 build / 不碰 `client/dist` | ✅ 未执行任何构建；未读写 `client/dist` |
| 不启服务 / 不碰 `:5173` `:3000` | ✅ 未启动/重启/kill 任何进程。**唯一监听行为**：为实证 `projectAssetGuard` 的 `req.path` 语义，用 `app.listen(0)` 起了一个**随机端口、进程内、用完即关**的 express 实例（不占 5173/3000，非常驻服务） |
| 不写任何数据库 | ✅ 对 `exam_system` **只发 2 条 SELECT**（0 写入；连接 URL 从 `server/.env` 读取，脚本用后即删，未落仓）。未触碰 `exam_system_test` |
| **禁止联网 / 禁止真实外部 API** | ✅ 零出网请求；依赖维度只做**静态可判定项**（lockfile + `node_modules` 实装版本），**未跑 npm audit** |
| 禁止重跑 `tests/ui-redesign-verify/.../ledger-check.mjs` | ✅ 未执行；未写 `tests/` |
| 陷阱 7：先冻结再测 | ✅ 全部测量在 `/tmp/a4-freeze`（`git archive 7b874b1`，**1016** 个被跟踪文件 = `git ls-files`），并与活树做 sha256 抽验（§0.2） |
| 陷阱 8：`git status` 对未跟踪目录无证据力 | ✅ 未用 `git status` 推断 `tests/`/`client/dist`/`server/uploads` 未被触碰；报告**不声明**对三者的写否结论（A 一处未写） |
| 陷阱 10：行号/计数以冻结树实测为准 | ✅ **全部行号自己数过**，未采信任何前轮数字；并纠正前轮/状态文件 3 处计数（§0.3） |
| 陷阱 11：计数带词边界 | ✅ 全部计数用词边界正则或精确文本锚点 |
| 不打印任何密钥/口令/token 明文 | ✅ 本报告只出现**常量名、键名、文件名:行号、密文长度与前缀类型、布尔比对结果**，**零明文**；扫描器对疑似字面量做 `***` 脱敏后再输出（§2.5） |

### 0.1 基线复算（A 自己跑的，非引用）

```bash
git rev-parse HEAD                        # → 7b874b1b83a5c87a443c0504df2e276b3246e552
git status --porcelain=v1 -uno            # → 空（被跟踪文件零改动）
rm -rf /tmp/a4-freeze && mkdir -p /tmp/a4-freeze && git archive 7b874b1 | tar -x -C /tmp/a4-freeze
find /tmp/a4-freeze -type f | wc -l       # → 1016   （= git ls-files | wc -l）
find /tmp/a4-freeze/server/src /tmp/a4-freeze/client/src -type f | wc -l   # → 146（= 基线）
```

| 门禁（活树复算，只读） | 原始输出 | 结论 |
|---|---|---|
| `node scripts/gates/cycle-check.mjs` | 扫描 **71 文件 / 164 条边**；SCC(|>1|) = **0**；自环 **0** | **PASS** |
| `node server/scripts/check-layers.mjs` | 文件 **71**，违规 **0**，未分层待迁移 **47** | — |
| `node scripts/gates/arch-metrics.mjs` | 0 / 47 / **10**（+ 观察带 **19**） | **PASS** |
| `node scripts/gates/hard-metrics.mjs` | hex6 **0** / important **0** / modalConfirm **0**（样本 41 文件） | **PASS** |
| `find server/src client/src -type f | wc -l` | **146** | — |

> `check-layers.mjs` 仅在传 `--save-baseline` 时写文件；本轮未传 → 复算零写入（跑完 `git status -uno` 仍为空）。

### 0.2 冻结树 ≡ 活树（抽验，4 个关键文件）

```bash
for f in server/src/middleware/auth.js server/src/services/deepseek.js \
         server/src/controllers/teacherController.js server/src/domain/entities.js; do
  a=$(shasum -a 256 "/tmp/a4-freeze/$f" | cut -d' ' -f1); b=$(shasum -a 256 "$f" | cut -d' ' -f1)
  [ "$a" = "$b" ] && echo "SAME  $f" || echo "DIFF  $f"
done
# → SAME ×4（且 git status -uno 为空 ⇒ 冻结树行号 == 活树行号，本报告全部行号双树等价）
```

### 0.3 纠正前轮/状态文件中的 3 处计数（陷阱 10）

| 项 | 前轮/状态文件说法 | **本轮冻结树实测** | 处置 |
|---|---|---|---|
| 测量纪律条数 | `pipeline-status.md:5` 写"**11 条**测量纪律" | `project-constraints.md` §3 编号项 **12** 条，编号为 1..12（其中 11/12 为追加序，物理顺序 11 在 12 之前） | 以 **12 条**为准；本轮逐条对照执行 |
| `ruleExecutor.js` 行数 | round 3 报 **1023 → 1011** | **1010**（arch-metrics 实测） | 以 **1010** 为准；GodFile 计数 **10 不变**，仅清单内数字变化 |
| P6 "288 行生产死代码" | round 3 §1.1 登记 **189 + 99 = 288** | round 3 自身已删 18 行 → **defectPrecheck.js 171 + defectScoring.js 99 = 270 行** | 以 **270 行**为准（P6 的行数描述已过时，见 §4.5） |

---

## 1 任务 2｜质量收敛确认（对照 constraints §5 六项判据的累计状态）

### 1.1 逐轮净效果

| 轮次 | commit | 实际改动（`git show --stat`） | 对判据的净效果 |
|---|---|---|---|
| 1 | `8fb2c1d` | `server/package.json`（+1/−1：rule-mutator 并入拆进程段）· `client/src/styles/tokens.css`（52 行）· 3 个门禁脚本 + 3 份报告 + 状态文件 | 判据 4：BUG-A-01 假红消除（13 failed → 0）→ **基线 1011/0 成立**；零引用令牌 105 → 61（严格口径） |
| 2 | `4b531b8` | `server/src/services/factExtractors/common.js`（新增 100 行）· `ruleExecutor.js`（55 行）· `factExtractor.js`（3 行）· `client/src/views/teacher/Layout.vue`（1 行）· `CheckerWizard.vue`（3 行）· `tokens.css`（9 行） | 判据 1：**SCC 1 → 0**（全仓无环）；判据 5：page-has-heading-one 1→0、label 1→0；令牌精修。**新增文件位于既有目录 `factExtractors/`，未推动 unlayered（47 不变）** |
| 3 | `7b874b1` | `defectPrecheck.js`（26 行）· `ruleExecutor.js`（23 行）· `ruleMutator.js`（87 行） | 消除第 3 份 `resolveProjectRoot`、孤立的 37 项 `SOURCE_EXTS` 副本、5 组重复助手函数（collectFiles 全仓 3 份 → 2 份）；**四门禁数字全不变**，唯一增量 = cycle-check 边 163 → **164**（预期值，已由 C 接受） |
| — | `ab4d8dd` `419477a` | 文档/口径固化 | 无源码影响 |

### 1.2 六项判据累计对照表（**最终**）

| # | 判据（§5） | 达标线 | 基线(r0) | r1 | r2 | r3 | **r4 实测** | **能否达成** | 卡点 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 分层违规 | **0**，且未分层**不增**（47） | 0 / 47 | 0 / 47 | 0 / 47 | 0 / 47 | **0 / 47** | ✅ **能（已达成）** | 无。r2 新增 `common.js` 落在**既有已分层目录**，故未推动计数（本轮实测复核） |
| 2 | GodFile | **>800 = 超标**（基线 10） | 10 | 10 | 10 | 10 | **10**（最小者 ruleExecutor.js **1010**） | ❌ **不能** | **双向硬阻断**（r3 §1 已给出代码级依据 `arch-metrics.mjs:63`，本轮独立复现）：server 侧拆分必新增 unlayered 文件 → 判据 1 的"不增"失败；client 侧 5 个全在 `client/src/views` → 撞 constraints §2 视觉铁律（无 ui-guard） |
| 3 | 硬指标（去注释） | hex(6)=0 / important=0 / Modal.confirm=0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | **0 / 0 / 0** | ✅ **能（已达成）** | 无。本报告推荐执行集**不触碰任何 CSS / `.vue`** |
| 4 | 后端回归 | failed ≤ baseline（**目标 0**） | 13 failed | **0 / 1011** | **0 / 1011** | **0 / 1011** | **沿用 r3 实测**（证据链见下行） | ✅ **能（已达成）** | 无。**证据边界须写明**：r3 四段摘要（64+1+1+1=67 套件、912+17+61+21=1011 例、0 failed）取自 `docs/pipeline/test-round-03.log:1231/1271/1360/1408` —— 该日志**未被 git 跟踪**（`git ls-files --error-unmatch` 失败），仅存在于活工作树；本轮**未复跑 jest**（A 无授权），故该数字为**引用 C 的实测**而非本轮独立复现 |
| 5 | 无障碍 | **不得引入新的** axe 违规 | — | 0 新增 | 0 新增（且 2 项清零） | 0 新增 | **本轮零 client 改动 ⇒ 0 新增** | ✅ **能（有条件）** | 条件：基线**只覆盖 QA 原始 12 页集**；M-1b（`.ant-statistic-title` 约 3.4:1）是**既有、超基线**的违规，**不违约**；本报告推荐执行集**零 client 文件** |
| 6 | 轮次上限 | **8 轮** | 0 | 1 | 2 | 3 | **4** | ✅ **能** | 余量充足（第 4 轮 / 上限 8） |

**结论：六项中 5 项能达成（其中 4 项已达成、判据 5 为条件达成），仅第 2 项（GodFile）结构性不可达成** → 收尾按「**部分达标**」出报告。

> **附带达成（§5 表外、门禁已覆盖）**：**循环依赖 SCC = 0** —— 强于 §5 要求，为 r2 的净效果，r3/r4 两轮复算稳定（**164 边 / SCC 0 / 自环 0**）。
> **已确认不可达的 3 类（本轮不重复论证，直接引用并遵守）**：① GodFile 10 个（判据 2）；② M-1b 视觉变更；③ N-1 `--duration-page` 契约悬空 / N-2 12 个 `--tag-*` 令牌漂移（正解在设计文档侧）。**四者均未进入本轮执行集**。

---

## 2 任务 1｜安全专项审查（本轮主任务）

### 2.0 范围与方法（含口径说明）

**为何允许全仓普查**：规范"第二轮起禁止全仓重扫"针对的是**重复**扫描。安全维度是 round 0 §5.5 明确声明的空白项（"未做安全专项……未做注入/鉴权/依赖审计 → 列为 round 1 增量审查项"，而 r1–r3 均未做），属**从未覆盖的新维度**，故做一次**有界普查**：7 个检查面 × 明确的可判定/不可判定边界。

| # | 面 | 方法 | 结论档 |
|---|---|---|---|
| A | 鉴权与越权（路由级 + 资源归属级） | 全部路由文件逐行读 + 全部归属校验点 grep + 7 个越权测试套件覆盖面对拍 | **2 项需立即修**、1 项观察 |
| B | 路径穿越与文件处理 | 上传/解压/标准包读取/归档导出/版本目录/静态托管 6 条链路逐条读 | **未发现可确证缺陷**（§2.4） |
| C | 注入面（SQL / 命令执行） | `queryRaw|executeRaw` 全仓 grep + 字符串拼接 SQL 模式 grep + `child_process` 家族逐调用点读 | **未发现可确证缺陷**（§2.4） |
| D | 敏感信息（被跟踪源码） | 自建扫描器：7 类密钥模式 × **529** 个被跟踪文本文件；**`.env` 零跟踪**（`git ls-files` 证实） | **2 项需立即修**、1 项观察、**1 项差点误报（已拦截）** |
| E | 依赖漏洞 | **仅静态可判定项**：`package.json` vs `package-lock.json` vs `node_modules` 三方对拍 | 0 项可判定；**1 项观察** |
| F | 日志与错误信息外泄 | 落盘链路（pino file sink → PM2 stdout → `/api/admin/monitor` 回读）端到端读通 | 3 项观察 |
| G | 不可判定项 | 无联网/无渗透/无生产环境的边界 | **6 项不可判定**（§2.7） |

**假阳性拦截纪律**（本项目已因扫描口径产出过 5 次假结论）：每条"疑似"必须写明 ①是否可确证 ②不可确证的确切原因 ③为排除假阳性做过的**反向**验证。§2.4 记录了 4 条**被我自己证伪**的疑似项。

---

### 2.1 需立即修（2 项）

#### S-1【高】`INTERNAL_SECRET` 兜底常量可伪造 worker 回调（仓库内公开）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `server/src/app.js:83`（校验在 `:84-92`）· `server/src/services/gradingWorker.js:13`（消费在 `:18`） |
| **问题** | 内部回调端点 `POST /api/internal/graded` **无 JWT 鉴权**，唯一凭证是 `Bearer ${INTERNAL_SECRET}`；而 `INTERNAL_SECRET` 取 `process.env.INTERNAL_SECRET || '<常量名已脱敏>'`（该字面量的**精确值**已在硬约束下从本报告移除；需要复现时用下方 grep 自行取值）。**该兜底值在 `server/.env` 中未配置 ⇒ 本地实际生效**（实测 `INTERNAL_SECRET = 未配置`；`server/.env.example` 中也不存在该键；常量明文出现在**两个被跟踪文件**中，且已被 `docs/test-results/2026-08-16/nonfunc-report.md:132` 引用）⇒ **等同公开** |
| **可复算命令** | `grep -rn "INTERNAL_SECRET" server/src` → `app.js:83/86`、`gradingWorker.js:13/18`；`grep -c "^INTERNAL_SECRET=" server/.env` → **0**；`grep -rn "INTERNAL_SECRET ||" server/src` → 2 处兜底字面量（`app.js:83`、`gradingWorker.js:13`，**两处值相同**）+ `docs/test-results/2026-08-16/nonfunc-report.md` 1 处引用 ⇒ **等同公开** |
| **影响面（诚实界定，避免夸大）** | 伪造者可经 `schoolId` + 任意 `data` 触发 `app.js:90` 的 `notifyGraded(schoolId, data)` → `socket.js:36-39` 的 `io.to('school-'+schoolId).emit('graded', data)`。**仅影响实时推送载荷，不写任何持久化分数**（判分落库由 `gradingWorker.js` 在服务端完成，走反向调用）。故**不是评分篡改**，而是"向任意学校房间注入伪造事件 + 无鉴权的内部写操作入口" |
| **建议改法** | ① `app.js:83` 与 `gradingWorker.js:13` **删除兜底字面量**，改为启动期 fail-closed（与 `app.js:33-36` 对 `JWT_SECRET` 的既成做法对齐）；② 把该密钥**写入 `server/.env.example` 的键名**（值留空）；③ **两处必须同批修改**，否则 worker 侧将 403 |
| **风险等级** | **高**（可伪造内部身份），**改动面极小**（2 行源码 + 1 个键名） |
| **验证方法** | 该路径**当前无任何测试覆盖**（`grep -rn "internal/graded" server/test` → 0 命中，本轮实测）。① 静态判据 = 两处字面量归零 + `.env.example` 出现键名；② 运行时判据需 B/C 新增最小用例（未配置时启动失败 或 端点 403），否则改动**无可执行验证** |
| **为何未入执行集** | 见 §3.0 判据 ①③：会改变服务启动语义（fail-closed 可能让未配置密钥的环境**起不来** = 影响用户实例可用性），且**无现有测试可验证**。属**需用户拍板**项 |

#### S-2【高】6 个教师端写操作的资源归属校验缺失（跨校横向越权）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `server/src/controllers/teacherController.js` —— `updateClass` **:832-849**（`prisma.class.update({where:{id:+id}}` @ `:837`）· `deleteClass` **:851-865**（`$transaction` @ `:854-859`）· `updateStudent` **:975-1022**（`findFirst({where:{id:+id,role:'student'}}` @ `:981`，无班级归属）· `deleteStudent` **:1024-1038**（`$transaction` @ `:1028-1032`）· `resetStudentPassword` **:1040-1060**（@ `:1043`、写入 @ `:1053`） |
| **问题** | 这 5 个 handler **只做 `req.params.id` → 主键直取/直改**，**完全没有**"该班级/该学生是否落在 `getVisibleClassIds(req.user.id)` 内"的校验。**任何持有有效教师 JWT 的账号可对全库任意班级/任意学生执行**：改班名与班所属学校、**删班级**（级联删 student_classes/teacher_classes/assignment_classes）、改学生姓名/学号并**重置其密码为明文可知的学号**（`:999`、`:1006`）、**删学生**（级联删其全部提交）、重置学生密码（`:1052` → 学号） |
| **同文件内的反差（决定性对照证据）** | 同一文件的相邻端点**做法完全相反**，证明这不是"架构上做不到"而是**漏做**：`switchClassSchool` `:867-922` 有**三重**校验（`:884` 班级归属、`:889-893` 新旧学校归属）；`lockAssignment` `:733-750` 有 `:738` 的 `a.teacherId !== req.user.id → 403`；`getProjectFiles` `:71-118` 在 `:75-76` 用 `teacherId: req.user.id` 收窄查询。**全仓归属校验点实测 13 处**，**其中 0 处在 class/student 写路径上** |
| **可复算命令** | `grep -rn "teacherId !== req.user.id" server/src/controllers` → 13 处（projectSubmissionController.js:97/142/213/256、reviewController.js:802/864/905、teamController.js:108、projectReviewController.js:243、teacherController.js:738…）；`grep -rn "getVisibleClassIds" server/src/controllers/teacherController.js` → 命中 :484/:529/:790/:933（**全在读端点**） |
| **测试覆盖（本轮实测的空缺证明）** | 全仓被测路由清单（对 `server/test` 抽取 `(get\|post\|put\|delete)('/api/…'` 形态）**不含** `PUT/DELETE /api/teacher/classes/:id`、**不含** `PUT/DELETE /api/teacher/students/:id` 与 `PUT …/students/:id/reset-password`。7 个越权套件（t4/t6/t7/t2 + security-path-guards + qa-batch1 + auth）覆盖的是 **questions / submissions / assignments / review-export / 花名册**，**不含 class/student 的写路径** |
| **建议改法** | 在写入前统一插入**一条**已有语义的守卫：先取该 class/student 的归属（`teacherClass.findFirst({teacherId:req.user.id, classId})` 或 `studentClass.findFirst({classId:{in: await getVisibleClassIds(req.user.id)}})`），未命中 → `403 / 1003 '无权操作'`（与 `:738`/`:884` 同码同文案）。**复用 `getVisibleClassIds`（已 import，`:9`）+ `isStudentVisibleToTeacher`（已存在，`reviewController.js:65`）**，不新增文件、不新增依赖 |
| **风险等级** | **高**（跨租户数据破坏 + 账号接管面）。**改动风险低-中**（纯 server、纯新增前置校验、不改返回值形状）；`teacherController.js` **已 import `getVisibleClassIds`** ⇒ **不新增跨文件 import 边** |
| **验证方法** | **可直接复用已有装置**：① 复用 `server/test/integration/t4-teacher-idor.test.js` / `t6-teacher-classid-idor.test.js`（describe @ :224 起）的跨教师/跨校夹具 → 新增"教师 B 改/删教师 A 的班级与学生 → 403 且 DB 零写入"用例；② 门禁零增量：cycle-check **164 边不变**、check-layers 71/0/47 不变、文件数 146 不变；③ 全量 1011/0 |
| **为何未入执行集** | 见 §3.0 判据 ②③：修它**必须新增测试**才能证明"不再越权"，而新增/修改 `server/test/` 是 **C 的授权**且会改变 67 套件 / 1011 例的口径；不新增测试则改动**无可执行验证**（现有 1011 例全绿也不能证明越权被堵住）。属**需用户拍板**项 |

---

### 2.2 观察项（4 项，登记不改）

#### S-3【中】默认超级管理员口令硬编码初值（**本地已确证生效**）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `server/src/app.js:138-143`（`prisma.user.upsert`；`create: { username:'admin', password: bcrypt.hashSync('<默认口令字面量，已脱敏>', 10), role:'super_admin' }` @ `:141`） |
| **实测（只读 SELECT，零写入）** | `exam_system.users` 中 `role='super_admin' AND deleted_at IS NULL` 恰 **1** 行：`{id:1, username:'admin', hashPrefix:'$2b$', hashLen:60, isBcrypt:true, bcryptMatchesDefaultAdmin123:true}`；`PLAINTEXT_PASSWORD_ROWS=0`；`ACTIVE_TEACHERS=6`。→ **本地库中该默认口令仍然有效** |
| **为何只列"观察"** | ① 生产库状态**不可判定**（无生产访问权，见 §2.7）；② upsert 的 `update:{}` 语义 = "已存在则**不改**口令" ⇒ 一旦轮换过即永久安全；③ 改它 = 改**登录/初始化语义**（随机初值或强制改密），影响真实用户登录，超出 A/B 授权。登录侧有失败限流（`app.js:51-67` + `InMemoryRateLimiter`），可降低暴力面 |
| **建议改法** | 首次启动若 `admin` 不存在 → 生成随机初始口令并**仅打印一次**到启动日志（或从 `process.env.ADMIN_INIT_PASSWORD` 读取，未配置则不创建）；对已存在的 admin **不做任何动作**（零风险路径） |
| **验证方法** | 静态：断言源码不再出现该字面量；运行时需新用例（无现有覆盖）。**不改也不阻断任何判据** |

#### S-4【中】解析失败路径把 LLM **完整响应**落盘（唯一未截断点）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `server/src/services/deepseek.js:274`（`console.error('[parseExamPaper] JSON匹配失败，完整响应:', content)`）· `:364`（流式同型）。对照：同文件其他点位**均已截断**（`:272` 前 300 字符、`:279` stem 前 30 字、`:243/278/360/370` 只记长度） |
| **落盘链路（端到端实测读通）** | `console.error` **绕过 pino** 直写 stdout → `server/src/utils/logger.js:105-114`（非 dev 环境控制台流 = `process.stdout`），且 pino 另写 `server/logs/app-YYYY-MM-DD.log`（`:38-46`）→ PM2 部署下 stdout 进 `~/.pm2/logs/*.log` → `adminController.js:355-385` 读该目录并经 `GET /api/admin/monitor`（`:319` + `res.json` @ `:387`）回吐最近 30/20 行 |
| **为何只列"观察"** | ① 触发条件是"LLM 返回不含有效 JSON"的**异常分支**；② 回读端点有 `super_admin` 门禁（`routes/admin.js:7`），**不构成跨角色泄露**；③ 被记录的是**教师上传的试卷文本/模型草稿**，非学生答案（本轮全量 grep **未发现**任何 `console.*`/`logger.*` 打印学生提交内容）；④ 属"日志口径"专项（r3 §2.3 已就同类 12 处裁定保留） |
| **建议改法** | 与 `:272` 对齐：只记 `content.length` + 前 N 字符（N≤300），或退化为 `logger.warn({len}, …)` |
| **验证方法** | 静态可判定（该行不再出现裸 `content`）；运行时需 C 的 CDP 断言（r3 §2.3 已给出可复用配方） |

#### S-5【低】`getMonitor` 暴露主机与运维日志（`super_admin` 可达）

`adminController.js:319-392`：`os.hostname/platform/cpus/totalmem/uptime/loadavg`（`:325-332`）、PM2 进程名/pid/状态（`:335-347`）、`readFileSync` `~/.pm2/logs` 并回吐内容（`:354-385`）。**门禁正确**（`routes/admin.js:7` `requireRole('super_admin')`）→ 定级"低"。**结论**：这是**设计意图内的监控页**（前端有对应页面），不是漏洞；仅登记"日志回吐 = 应用数据二次暴露面"，与 S-4 同源。

#### S-6【低】学生作业详情的**数据层**班级归属校验缺失（复核交接清单 **A4**）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `server/src/controllers/studentController.js:211-265`（`getAssignmentDetail`）。**决定性对照**：同文件 `:480-509` 的 `assertStudentInAssignment` **完整实现了**"按 `assignment_classes` 校验班级归属"（`:488-509`，`403/1003 '无权访问该作业'`），但**只被 `:547` 的 `getProjectQuestion` 调用**（grep 实测唯一调用点） |
| **A4 结论复核** | ✅ **A4 成立**，且本轮补上了 A4 未给出的边界：`getAssignmentDetail` 取作业用 `findFirst({where:{id:+req.params.id}}`（`:214-222`）**零归属校验**；但返回体**已做白名单裁剪**——`toStudentSubmissionView`（`:238`）+ 未出分时把 `referenceAnswer`/`scoringCriteria`/`objectiveItems[].answer` **置 null**（`:247-258`），且 `submissions` 恒按 `studentId: req.user.id` 收窄（`:231-233`）。**故不泄露标准答案、不泄露他人提交** |
| **残余暴露（本轮精确界定）** | 可读到**未推送给该生班级**的作业元数据与**题目清单**：title / mode / startTime / endTime / maxScore / 题型 / 题干 `material` / `scoringRubric`（未出分时 rubric 保留、仅答案字段置 null）。属**考试前的题目预知面**（若某作业尚未开始而学生猜到 id）。**风险低于越权改数据，但不为零** |
| **缓解（避免夸大）** | ① 路由级门禁正确：`routes/student.js:7` 的 `router.use(auth, requireRole('student'))` ⇒ **仅已登录学生**可利用，且需枚举 id；② 同一"作业投放模型"在**读列表**端实现正确（`getAssignments` `:57-71` 先取 `studentClass` → `assignmentClass` → 收窄 `id: { in: assignmentIds }`）⇒ 又一例"同文件内做法相反"的漏做 |
| **建议改法** | 在 `:222` 之后插入一行守卫：`const guard = await assertStudentInAssignment(+req.params.id, req.user.id); if (!guard.ok) return res.status(guard.code === 1004 ? 404 : 403).json({ code: guard.code, message: guard.message, data: null });` —— **纯新增、复用既有函数、不改响应形状** |
| **验证方法** | 现有覆盖：被测路由含 `get('/api/student/assignments/:id')`（本轮路由清单实测），但**未断言跨班 403** ⇒ 需新增用例才能证明；无测试则改动不可验证。**既有用例可作"不回归"护栏（不足以证明越权被堵）** |
| **为何未入执行集** | 与 S-2 同因：**修复必须伴随新测试**（否则不可验证），测试装置属 C 授权域；且该 handler 是学生端核心页面数据源，需 C 的页面级回归护航 |

---

### 2.3 依赖维度（**仅静态可判定项**，不下漏洞结论）

```bash
# 三方对拍：package.json 声明 → package-lock.json → node_modules 实装
node -p "Object.entries(require('./server/package.json').dependencies).map(([k,v])=>k+'@'+v).join('\n')"
node -e "const l=require('./server/package-lock.json'); for(const n of ['express','jsonwebtoken','bcryptjs','multer','adm-zip','helmet','cors','dotenv','prisma','@prisma/client','mysql2','pino']) console.log(n+' lock='+(l.packages['node_modules/'+n]?.version??'MISSING'))"
for p in express jsonwebtoken bcryptjs multer adm-zip helmet cors dotenv; do node -p "'$p installed='+require('./server/node_modules/$p/package.json').version"; done
```

| 包 | `package.json` 声明 | lock | 实装 | 静态观察 |
|---|---|---|---|---|
| express | `^5.2.1` | 5.2.1 | 5.2.1 | **大版本 5**（非常规 4.x 线）→ 中间件生态兼容属**架构观察项**，非漏洞 |
| jsonwebtoken | `^9.0.3` | 9.0.3 | 9.0.3 | 与 `jwt.verify` 用法一致 |
| bcryptjs | `^3.0.3` | 3.0.3 | 3.0.3 | 纯 JS 实现；cost=10（`app.js:133`） |
| multer | `^2.1.1` | 2.1.1 | 2.1.1 | 2.x 线；上传点均限制 `.zip` 扩展名 |
| adm-zip | `^0.5.18` | 0.5.18 | 0.5.18 | 唯一解压库；**调用点已做穿越/符号链接/预算防护**（§2.4） |
| helmet | `^8.2.0` | 8.2.0 | 8.2.0 | 已启用，但 `contentSecurityPolicy: false`（`app.js:43`）→ **CSP 空窗属架构观察项** |
| cors | `^2.8.6` | 2.8.6 | 2.8.6 | `app.js:44-47`：无 `CORS_ORIGIN` 时回落 `/^http:\/\/localhost:\d+$/`（**当前 `CORS_ORIGIN` 未配置**，本地实测） |
| dotenv | `^17.4.2` | 17.4.2 | 17.4.2 | — |

**结论：本轮不对依赖下任何"存在已知漏洞"的结论**（禁止联网、未跑 `npm audit`、无 CVE 数据源）。上表仅登记"声明/lock/实装三方一致、无版本漂移"这一**静态可判定事实**；`express@5` 与 `contentSecurityPolicy:false` 作为**架构观察项**转交，不阻断任何判据。

---

### 2.4 已核查**未发现**缺陷的面（含为排除假阳性做的反向验证）

| 面 | 核查内容 | 判定 | 反向验证（防假阳性） |
|---|---|---|---|
| **路径穿越 / 目录逃逸** | 6 条链路逐条读：① 版本目录 `projectPaths.js:17-33`（`safeSegment` 白名单 `/^[A-Za-z0-9_-]+$/` + `assertInside` 前缀校验，`resolve` 后比对 `base + sep`）；② ZIP 解压 `projectArchive.js:108-192`（`..` 段拒绝 `:48-53`、段级 `sanitizeSegment` `:58`、`path.resolve` 后再验 `:65-68`、符号链接跳过 `:87-106`、zip 炸弹预算 `:13-14`+`:32-34`、写盘二次限流 `:75-76`）；③ 标准包读取 `teacherController.js:75-118`（**查询侧**用 `teacherId: req.user.id` 收窄）；④ `getFileContent` `projectSubmissionController.js:130-190`（`:149` `..` 拒绝 + `:161` 前缀校验）；⑤ 归档导出 `reviewController.js:776`（`attachmentUrl` 经 `updateQuestion` `:250-253` 的正则白名单 `^project-questions\/\d+\/standard$` 收口）；⑥ 静态托管 `projectAssetGuard.js` | **未发现可确证缺陷** | ① **实测 express 语义**：`app.use(guard)` 下 `req.path` **含 `/uploads` 全路径**（`app.listen(0)` 实证：`GUARD_SAW_PATH="/uploads/project-standards/1/standard/x.txt"`）⇒ 前缀匹配**不会因 mount 剥离而失效**；② `%70roject-standards` **确实绕过 guard 的字面匹配**，但实测 `express.static` 也解不出该路径（404）⇒ **不构成绕过**；③ `/uploads/project-standards/../project-standards/1` 在 Express 5 层被归一化后再进 guard ⇒ 仍被拦 |
| **SQL 注入** | `grep -rnE "queryRaw|executeRaw|\$queryRawUnsafe|\$executeRawUnsafe" server/src trustjudge-server/src` → **0 命中**（全 Prisma ORM 参数化）；`grep -rnE "(SELECT|INSERT|UPDATE|DELETE)[^\"']*[\"'] *\+" server/src` → **0 命中** | **未发现可确证缺陷** | 两条模式**互补**：既查 raw API 又查字符串拼接查询 |
| **命令执行 / 拼接** | 全仓 `child_process` 家族 **4 个调用点**：`adminController.js:310-312` 的 `exec('pm2 jlist')`（**字面量，零用户输入**）、`compile-executor.js:8` 的 `execFileSync`（注释 `:3` 明示"参数数组方式，不经 shell，防注入"）、`checkerService.js:28` 的 `execFile`、其余为 `RegExp.prototype.exec`（非进程执行） | **未发现可确证缺陷** | `exec(` 仅 1 处，并**逐个确认其参数是否含 `req.*`**（`grep -n "cmd" adminController.js` → 仅 `:310/312` 形参，调用方 `:335` 传字面量） |
| **硬编码密钥（被跟踪源码）** | 自建扫描器 `/tmp/a4-secrets.mjs`：7 类模式（`jwt[_-]?secret`、`key=literal`、`Bearer <20+>`、`sk-…`、PEM 私钥头、AWS key id、GitHub token）× **529** 个被跟踪文本文件 → **命中 12 处，逐条判定后真阳性 2 项**（S-1、S-3） | **2 项真阳性 + 1 项假阳性拦截** | **假阳性拦截实例（本报告最重要的一条防伪记录）**：扫描器把 `server/src/app.js:12` 的 `jwt[_-]?secret` 命中报为"硬编码 JWT 兜底密钥" —— 与历史报告 `docs/test-results/2026-08-16/nonfunc-report.md:132-134`（BUG-006：可伪造任意身份）**同型**。**读原文后该结论在本轮已不成立**：`server/src/middleware/auth.js:12` 的兜底字面量仍在，但 `app.js:33-36` 已在**启动期**执行 `process.env.JWT_SECRET = randomBytes(32).toString('hex')`，且**两处兜底都写在调用点内**（`auth.js:12` 在中间件函数体内、`authController.js:58` 在 `login` 内）⇒ 仅在"**从未经过 app.js 启动**"的入口（测试/脚本直调）可达 ⇒ **生产不可达，BUG-006 仍处已修复态** |
| **`.env` 泄漏面** | `git ls-files | grep -iE '\.env'` → **0**（`.env` 与 `server/.env.*` 均在 `.gitignore`）；`.env.example` 被跟踪但**全部值为空** | **未发现可确证缺陷** | 逐行读 `.env.example` 确认无遗留真实值 |

> **附带确认（同族问题，本轮证伪）**：`app.js:39-40` 的 `if (!process.env.JWT_SECRET) logger.warn('JWT_SECRET 未配置，使用默认密钥不安全')` 是**永不可达的死分支**（`:33-36` 已保证非空），且文案与 `:35` 自相矛盾 —— 属**措辞/死代码**级瑕疵，不是安全缺陷。登记供"日志口径/卫生"专项，本报告不立项。

---

### 2.5 敏感信息扫描原始分布（**脱敏**，不含任何明文）

```bash
node /tmp/a4-secrets.mjs     # 扫描对象 = /tmp/a4-freeze（被跟踪文本文件 529 个）
```

| 命中类 | n | 真/假 |
|---|---|---|
| `jwt[_-]?secret` | 12 | **全部为常量名/键名/历史报告引用**；其中 `auth.js:12` + `authController.js:58` = 上文证伪的**不可达兜底**（假阳性） |
| `key=literal`（password/secret/api_key/token 赋值） | 0 | — |
| `Bearer <20+ 字面量>` | 0 | — |
| `sk-…` / PEM 私钥头 / AWS key id / GitHub token | 0 | — |

> **未打印任何值**。报告中出现的仅为：常量名、`.env` **键名**、文件:行号、哈希**长度与前缀类型**（`$2b` / 60）、布尔比对结果。

---

### 2.6 安全面与既有测试装置的覆盖对照（决定本轮执行集的关键依据）

| 安全面 | 是否已有测试覆盖 | 证据 | 对执行集的影响 |
|---|---|---|---|
| 资产静态封禁（4 前缀 + 绕过变体） | ✅ 有 | `server/test/unit/security-path-guards.test.js:29`（`describe('projectAssetGuard — 四个敏感前缀一律封禁（含绕过变体）')`，`:58` 非敏感路径放行） | B/S-1..S-6 均**不得**破坏 |
| 路径段白名单 / 越界拦截 / 标准包判据 | ✅ 有 | 同文件 `:66`/`:81`/`:97` 三组 describe（含 `..` 逃逸、绝对路径段、非法 questionId） | 同上 |
| 提交/题目/作业/审核导出的横向越权 | ✅ 有（7 套件） | `t4-teacher-idor` / `t6-teacher-classid-idor`（`:224` 起 19 例）/ `t7-t6-classid-review`（`:168` 起 12 例）/ `t2-teacher-scope`（`:165` 起 12 例）/ `qa-batch1-independent-review` / `auth.test.js` | 证明"归属校验"是**本仓既定契约**（S-2/S-6 是漏做而非设计取舍） |
| **class/student 写路径的越权** | ❌ **无** | 本轮被测路由清单实测不含 `PUT/DELETE /teacher/classes/:id`、`PUT/DELETE /teacher/students/:id` | **S-2 因此不可验证** |
| **`/api/internal/graded` 凭证** | ❌ **无** | `grep -rn "internal/graded" server/test` → 0 | **S-1 因此不可验证** |
| **学生作业详情的跨班 403** | ⚠️ 路径被走到，无越权断言 | 被测路由含 `get('/api/student/assignments/:id')`，无比对断言 | **S-6 因此不可验证** |
| 默认管理员口令 | ❌ 无 | — | S-3 不可验证 |

---

### 2.7 不可判定项（**诚实清单**）

1. **无生产环境访问** ⇒ S-3（生产 admin 口令是否已轮换）、S-1（生产是否已配置 `INTERNAL_SECRET`）、`CORS_ORIGIN` 是否生产已配置，**三者均不可判定**。本地 `.env` 只代表本机。
2. **禁止联网 / 未跑 `npm audit`** ⇒ **不存在任何 CVE 结论**；§2.3 仅为版本静态对拍。
3. **未做动态渗透 / 未起常驻服务** ⇒ 所有"越权可达"结论均为**静态代码路径推演**（路由门禁 → handler → Prisma 条件），**未实际发过一条越权 HTTP 请求**。与 r0 §5.1"未做任何运行时验证"同因同质。
4. **未审计前端渲染层 XSS 面**（`v-html` / 内联 HTML 注入）。理由：客户端零测试装置（r0 F-5：`client` 零 `.test.js`），且任务书未列该面 ⇒ **本轮明确不覆盖**，登记 round 5+ 候选。
5. **`trustjudge-server` 未覆盖**：本轮的 SQL/命令执行 grep 在目录不存在时会静默跳过 ⇒ 相关结论**仅对 `server/src` 成立**。
6. **未审计 `server/test/` 装置自身的安全性**（夹具中的凭据/直连），属 C 的授权域。
7. **`/tmp/c3-bindcheck.mjs` 的口径继承其原型缺陷**：star re-export **保守跳过**（会漏报）、CJS 跳过；我**未**构造这两类负向用例 ⇒ §4.1 的"可检出坏绑定"结论**仅对 named-import 场景成立**。
8. **依赖 CVE 数据源缺失** ⇒ 无法区分"新版本"与"已修复漏洞的版本"。

---

## 3 任务 4｜round 4 修复清单（执行集）

### 3.0 筛选判据（任务书给定的三条优先级）

| 判据 | 含义 | 本轮通过率 |
|---|---|---|
| ① | 能被**现有 1011 例测试**或**三门禁**验证 | **仅 1 项通过**（U-1：三门禁 + 1011 例全量回归 + 真 import 自检） |
| ② | **零视觉风险** | 仅 server-only 项通过 |
| ③ | **收口一个工作流** | 仅 U-1 部分满足（"引用面收窄"） |

**因此本轮执行集 = 1 个文件批（7 个文件 / 预算 8），且性质是"卫生收口"而非安全修复** —— 安全发现中**无一项**落在可执行集：S-1/S-2/S-6 卡在判据 ①（**无测试覆盖则不可验证**），S-3/S-4/S-5 卡在"需用户拍板"或"已有裁定"。

---

### 3.1 【推荐执行】U-1：清理 8 处**未被消费的具名 import**（扫描 9 项 / 1 项已证伪）

**性质**：卫生项，**非安全修复**，**不阻断任何判据**。

| # | 文件:行号 | 未被消费的符号 | 反向核验输出（全文件仅命中该 import 行） | 消费者实际路径 |
|---|---|---|---|---|
| 1 | `server/src/controllers/projectReviewController.js:13` | `readDirFiles` | `13:import { enqueueProjectGrade, readDirFiles } from '../services/projectGrading.js';` | 本文件 `:181-206` 自带同义本地实现 |
| 2 | `server/src/controllers/teacherController.js:7` | `DEFAULT_MAX_SCORE` | `7:import { DEFAULT_MAX_SCORE, ABNORMAL_FEEDBACK } from '../constants.js';` | 仅 `ABNORMAL_FEEDBACK` 被消费 |
| 3 | `server/src/controllers/teacherController.js:9` | `getTeamTeacherIds` | `9:import { getVisibleClassIds, getTeamTeacherIds } from './teamController.js';` | 同文件 `:484/529/790/933` **只**用 `getVisibleClassIds` |
| 4 | `server/src/domain/entities.js:4` | `EntityNotFoundError` | `4:import { SubmissionClosedError, DuplicateSubmissionError, IllegalStateError, EntityNotFoundError } from './errors.js';` | 同批 3 个错误类**同样零消费**；**全仓所有 `EntityNotFoundError` 消费者均直接从 `domain/errors.js` 导入**（`review.use-cases.js:7` / `submission.use-cases.js:6` / `studentController.js:9` / 2 个测试）⇒ 该 import 不是任何模块的转出口 |
| 5 | `server/src/services/checkerService.js:32` | `getModel` | `32:import { getBaseUrl, getApiKey, getModel, summarizeRubricItems } from './deepseek.js';` | 仅 `getBaseUrl`/`getApiKey`/`summarizeRubricItems` 被消费 |
| 6 | `server/src/services/deepseek.js:2` | `DEFAULT_MAX_SCORE` | `2:import { ABNORMAL_FEEDBACK, DEFAULT_MAX_SCORE } from '../constants.js';` | 仅 `ABNORMAL_FEEDBACK` 被消费 |
| 7 | `server/src/services/projectGrader.js:11` | `getLanguageByExt` **与** `isIgnored` | `11:import { getLanguageByExt, isIgnored } from '../utils/fileTree.js';` | **两个符号都零消费**（该行是唯一命中） |
| ❌ | ~~`server/src/services/ruleExecutor.js:18` `createRequire`~~ | — | `18:import { createRequire } from 'node:module';` **但 `:33` 的 `const nodeRequire = createRequire(import.meta.url);` 在用**，`:32` 注释也提及 | **假阳性 —— 已证伪并剔除** |

**共 8 个真阳性、分布在 7 个文件**（`projectGrader.js` 一行含 2 个）。

**问题**：未被消费的具名 import 让"本模块依赖了什么"失真；而 `node --check` **不校验**跨模块绑定（constraints 陷阱 12 / r3 由 B 撞出、C 独立复现），故这类残留**永远不会被现有门禁发现**，只能靠人读。

**依据**：`/tmp/a4-unused2.mjs`（本轮自建，**两版**：v1 的 import 子句正则存在"跨语句贪婪"缺陷，v2 改为逐条 `matchAll` 并**保持长度地屏蔽** import 语句后再做词边界计数，行号取 import 起始行）。对全部 9 项做了**逐项人读反向核验**（上表最后一列）。

**建议改法**：**只删名字，不删 import 语句**（同一条 import 行仍有被消费的符号）；`projectGrader.js:11` 整行删除（两个符号都零消费）。**硬边界**：① **不动** `ruleExecutor.js:18`；② `entities.js:4` 严格按符号操作并**只删这一个名字**（该文件带主观性，若 Captain 判定"领域门面文件宜保持 import 面稳定"，**可单独撤销本项**而不影响其余 6 文件）；③ **不得**顺手删同文件的其他 import（`entities.js:4` 另外 3 个错误类的零消费属**同一形态的既有事实**，留待后续轮次，避免扩大 diff）。

**风险等级**：**极低**。纯"引用面收窄"，**零运行时行为变更**（未被消费的名字不参与求值；被消费符号原样保留）；**不新增文件**（unmigrated 47 不动）；**不新增/不改 import 边**（cycle-check 边数应**恒为 164**）；**零 client 改动 ⇒ 零视觉风险**；不触碰 CSS ⇒ 硬指标 0/0/0 不变。

**验证方法（判据 ① 成立）**：
1. `node scripts/gates/cycle-check.mjs` → **71 文件 / 164 边 / SCC 0 / 自环 0**（**边数必须不变** —— 删名字不改边）；
2. `node server/scripts/check-layers.mjs` → 71 / 0 / **47**；`node scripts/gates/arch-metrics.mjs` → 0 / 47 / 10(+19)；`node scripts/gates/hard-metrics.mjs` → 0 / 0 / 0；`find server/src client/src -type f | wc -l` → **146**；
3. 后端全量四段 → **4 处 `Test Suites:` / 67 套件 / 1011 passed / 0 failed**（8 名分布在 7 个文件，**每个都有直接覆盖套件**）；
4. **强判据（本项独有）**：B 必须对 7 个文件**各真 import 一次**（`node -e "import('./server/src/<file>')"`，或 `scripts/gates/bind-check.mjs` 若落地）—— 因为"删错名字（把还在用的删了）"**不会**被 `node --check` 发现，只有真 import 才会抛 `SyntaxError: does not provide an export named …`（陷阱 12）。

**本项与"制造工作"的边界（诚实声明）**：U-1 **不阻断任何 §5 判据**，也**不修复任何安全发现**。它可验证、零风险、一次收口 7 文件，但它**不是必需的** —— 若 Captain 判定"末轮只做收口不做卫生"，**直接跳过本项即为"本轮无可执行项，建议收敛"**，本报告其余结论完全不受影响。

---

### 3.2 不做清单（含理由）

| # | 项 | 为何不做 |
|---|---|---|
| 1 | **S-1 内部密钥兜底** | 改法会**改变启动语义**（fail-closed 可能让未配置密钥的环境起不来）→ 影响用户实例可用性；**且当前零测试覆盖**（判据 ① 不成立）→ 需用户拍板 |
| 2 | **S-2 / S-6 归属校验** | 修复**必须伴随新越权用例**才能证明"堵住了"，而新增/改 `server/test/` 是 **C 的授权域**且会改变 67 套件 / 1011 例口径（r3 P6 已就同一问题作出先例裁定）→ 需用户/Captain 决定装置归属。**不新增测试则改动不可验证**（判据 ① 不成立） |
| 3 | **S-3 默认口令** | 改登录/初始化语义，影响真实用户登录；生产状态不可判定 → 需用户拍板 |
| 4 | **S-4 日志完整响应** | 属"日志口径"专项（r3 §2.3 已就同类 12 处裁定"保留"），改它需 C 的 CDP 护航 + 统一口径 → 本轮不重复立项 |
| 5 | **S-5 `getMonitor`** | 门禁正确（`super_admin`）、功能即设计意图（前端有监控页）→ 登记不改 |
| 6 | **`app.js:39-40` 死分支 + 自相矛盾文案** | 措辞/死代码级瑕疵，不阻断判据，改它动启动路径 → 登记 |
| 7 | **`getFileContent` 路径校验升级**（`includes('..')` → 段级白名单） | **当前实现已被证明足够**（§2.4 ⑥ 三重防护 + Express 5 归一化反向验证）；升级属健壮性改良，"末轮改安全关键代码"风险高于收益 → 登记 |
| 8 | **C-O2 / C-O1 / C-O3 / M1 / P6** | 见 §4 逐项评估；均为**门禁/装置/流程**层面，非 `server/src` 缺陷修复 |

---

## 4 任务 3｜剩余候选逐项评估

### 4.1 C-O2：把绑定自检晋升为 `scripts/gates/bind-check.mjs`

| 字段 | 结论 |
|---|---|
| **裁定** | **做（推荐）**，但**不属于本报告执行集** —— 它是**门禁集扩张**，应由 Captain 作为结构决策下达 |
| **本轮实测（复用 r3 原型，只读）** | `node /tmp/c3-bindcheck.mjs /tmp/a4-freeze --show-clean` → **modules scanned 162 / named import bindings checked 440 / BINDING VIOLATIONS 0**；`time` = **real 0m0.057s**。**负向对照**：在 `/tmp` 副本里往 `auth.js` 追加 `import { notARealExport } from './role.js'` → **VIOLATIONS 1**，精确报出 `server/src/middleware/auth.js imports {notARealExport} from server/src/middleware/role.js -> module does not export 'notARealExport'`，**exit=1** |
| **为何值得做** | 陷阱 12 命中"唯一无法被现有门禁发现的坏树形态"：删本地副本 + 忘加 export = `node --check` 放行、三门禁全放行、**只有真 import 才炸**。本项把 r3 的**一次性人工动作**固化为**每次可跑的 0.06 秒门禁** |
| **对基线的影响（本轮实测确认）** | ✅ **不影响 `unmigrated` 计数**：`server/scripts/check-layers.mjs` 的扫描根是 `server/src`（71 文件），`scripts/gates/` **不在扫描面内**；且 `scripts/gates/` **已存在** 3 个脚本 → 新增文件**不改变任何既有目录结构** ⇒ `unmigrated 47`、文件数 146、cycle-check 71/164、arch-metrics 10(+19) **全部不变** |
| **做法** | ① 以 `/tmp/c3-bindcheck.mjs` 为基础改写为门禁脚本（保留 `process.exit(violations.length ? 1 : 0)` 语义，支持 `--show-clean`）；② 扫描根**扩到 `server/src` + `server/test`**（原型已是这两个根）；③ 在门禁清单（`pipeline-status.md` / constraints §5）登记为**第 4 个门禁**，并声明基线 `162 模块 / 440 绑定 / 0 违规`；④ **不得**改动既有三门禁的任何阈值 |
| **风险** | 低（新增只读脚本、无副作用）。**唯一实质风险 = 假阴性**：原型对 star re-export 保守跳过（`c3-bindcheck.mjs:86`）、对 CJS 跳过（`:80`）。若要提高覆盖面须**另开一轮**并补负向用例（本轮**未做**，见 §2.7 第 7 项） |
| **验证方法** | ① 正式门禁在冻结树与活树上**都必须 0 违规 / exit 0**；② **必须带负向自测**（构造坏绑定 → exit 1 + 精确报点），否则它就是"永远绿灯"的假门禁；③ 确认加入后**三门禁数字全不变**（尤其 arch-metrics 与 `find … | wc -l`） |

### 4.2 C-O1：B 的 fuzz 用了未播种 `Math.random` → 种子化

| 字段 | 结论 |
|---|---|
| **裁定** | **认同问题，但不必作为独立修复项** —— 它是**装置/方法论**层面，且**已被 C 在 r3 当场补救** |
| **本轮实测** | `/tmp/c3-realfuzz.mjs:63` 的 `function rnd(n) { return Math.floor(Math.random() * n); }`、`:68` 的 `rndSuffix()`、`:79` 的 `if (Math.random() < 0.3)` → **确未播种**。**但** `/tmp/c3-repl.mjs:10-12` 已有 C 自建的**种子化复刻**：`:10` 注释"replicate B's DISTRIBUTION exactly, but with a SEEDED PRNG (his is Math.random -> unseeded)"、`:11` 的 `let seed = 20261011`、`:12` 的 LCG；且 `test-round-03.md:46` 记录 V4 实测"B 报 9/13 → C 自建 16 夹具 **9/16** 同构同结论" ⇒ **发散率结论已被种子化复现独立确认** |
| **做法（若要做）** | 把 `:63`/`:68`/`:79` 的 `Math.random` 换成注入式 PRNG（`makeRng(seed)`），并把 seed 写进报告抬头；**脚本在 `/tmp` ⇒ 无仓库产物**，正解是**写进方法学要求**而非改文件 |
| **验证方法** | 同 seed 连跑 2 次 → 发散数**逐位相同**；换 seed → 分布稳定（±噪声带内） |
| **推荐落点** | 写入 constraints §3 或方法学备忘（"任何 fuzz 必须播种并报告 seed"）。**不占 B 的 8 文件预算** |

### 4.3 C-O3：发散面改用**结构枚举**而非随机采样

| 字段 | 结论 |
|---|---|
| **裁定** | **做（作为方法学要求）**，且 **r3 已经事实上做了** |
| **证据** | r3 的定性判据**不是**靠随机采样得出的，而是靠**结构对拍**：`audit-round-03.md` §2.1(b) 的 **13 个定向探针**（按"root 内容 × 目录名"的结构枚举，逐例给出两份实现的返回值对比）+ §2.1(a) 的**符号级**比对（`SRC_EXTS` 9 项 vs `ROOT_PROBE_EXTS` 37 项、`SKIP_DIRS` 过滤、`MANIFEST_NAMES` 短路、`path.resolve` 归一）+ r3 的**逐字常量比对**（37 项 order-sensitive = true）。C 侧进一步做了 **16 夹具 / 100 枚举 / 200 自建 / 200 复现**（`test-round-03.md:49`） |
| **做法** | ① **能枚举就枚举**：输入空间是"目录名 × 根文件清单 × 探测白名单"的**笛卡尔积**，可完全枚举（13 探针即其子集）；② **只能在无法枚举时才采样，且必须播种**（= C-O1）；③ 报告必须写明**枚举上界**（"覆盖 37×N 全部形态"优于"随机 200 次"） |
| **验证方法** | 枚举式对拍的判据是**确定性全等**（`JSON.stringify(before) === JSON.stringify(after)` 逐例），无随机性 ⇒ 可重跑、可复核 |
| **推荐落点** | 同 C-O1，写入方法学；**不占预算** |

### 4.4 M1：`arch-metrics` 行数瞬态读数（r3 报 1011 vs 实测 1010）是否需要门禁防抖

| 字段 | 结论 |
|---|---|
| **裁定** | **不需要"防抖"，但需要"单次状态原则"** —— 这是**口径问题不是抖动问题** |
| **根因（本轮读源码确认）** | `scripts/gates/arch-metrics.mjs:41` 的 `cp.execSync('node "<check-layers>"', { cwd: ROOT })` ⇒ 该门禁**在同一进程内混合了两种状态源**：(a) 通过**子进程**读 `server/src` 得到分层数字；(b) 通过**本进程内联行数统计**（`:53` 注释"与 `wc -l` 同口径：按换行符计数，末尾换行不多算一行"）得到 GodFile 行数。二者**之间**若发生任何写入，同一份报告里就会出现**跨时刻混合读数** —— 这正是 r3 的 `1011` 与后续实测 `1010` 的偏差来源（`:56-67` 的 12 行块被删后，`ruleExecutor.js` 净 1010） |
| **为何"防抖"是错的解法** | 抖动（debounce/retry）**掩盖**问题：报告仍可能自相矛盾，只是概率降低。**正解是让所有数字来自同一份不可变输入** |
| **做法（三选一，按推荐序）** | ① **冻结快照口径（最彻底）**：`arch-metrics` 与 `check-layers` 都改为读 `git archive <ref>` 导出的同一份副本 —— 陷阱 7 已要求"任何测量都不得直接读活工作树"，**门禁自己却没有遵守**（这是本轮的一项**元级发现**）；② **单次遍历口径**：先一次性 `collectFiles()` 得到 `{path, lineCount}` 快照，**分层与行数都从该快照派生**（无需子进程）；③ 最低成本：在报告头打印**被测树指纹**（`git rev-parse HEAD` + 被跟踪文件数），使"跨时刻混合"**可被事后识别** |
| **风险** | ①/② 是**门禁改造**（末轮改门禁本身有风险，r3 §4 第 10 项已就同类问题裁定"登记不做"）；③ 是**零风险加打印** |
| **验证方法** | 改造后：人为在门禁运行中途改一行 → 报告应**要么全旧、要么全新**，不得出现"分层=新 / 行数=旧"。③ 的验证 = 报告头出现指纹且与 `git rev-parse HEAD` 一致 |
| **推荐落点** | **不入本轮执行集**；建议**写入 constraints §3 作为第 13 条测量纪律**（"门禁自身也必须先冻结再测"），与陷阱 7 对齐。**零代码风险** |

### 4.5 P6：270 行生产死代码（`defectPrecheck` + `defectScoring`）处置评估

**本轮独立复现的事实**（grep 全仓，排除 `node_modules`/`.git`/`dist`）：

```bash
grep -rn "defectPrecheck|defectScoring|precheckProject|scoreDefects" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
# 命中仅三类：① server/test/unit/infrastructure/defect-precheck.test.js（:9/:10 静态 import）
#            ② server/src/services/defectPrecheck.js、defectScoring.js 自身
#            ③ docs/（设计文档）
find . -iname '*defect*' -not -path './node_modules/*' -not -path './.git/*'
# → 只有那 3 个文件
```

| 事实 | 本轮实测值 |
|---|---|
| 生产引用 | **0**（`server/src` 除自身外、`client/src` 均 0） |
| 行数 | `defectPrecheck.js` **171**（r3 已由 189 删至 171）+ `defectScoring.js` **99** = **270 行**（r3 登记的 288 已过时） |
| 唯一消费者 | 其自身单测（`defect-precheck.test.js:9/:10`） |
| 接线点 | 设计文档点名的 `projectGrading.js` 实测 **0 命中** ⇒ **从未接线** |

**三选项的后果分析**：

| 选项 | 直接后果（可复算） | 风险 | 裁定 |
|---|---|---|---|
| ① **保留 + 显式冻结标注**（r3 推荐） | 基线**零变化**（67 套件 / 1011 例 / 47 未分层 / 146 文件全不动） | 极低。代价 = 仓库常驻 270 行"死但可搜"代码 + 一份**已不再漂移**的实现（r3 已把第三份 `resolveProjectRoot` 统一） | ✅ **维持 r3 的选项①**；可选加固 = 两文件顶部各加 2 行注释（"未接线 / 无生产消费方 / 删除需同步删测试 → 见 audit-round-03 §1.1 P6"）。**注意**：`.js` 注释不计入任何硬指标（hard-metrics 只扫 `.vue`+`style.css`）⇒ **零门禁风险** |
| ② **删模块 + 删测试 + 同步修订基线** | 套件 **67 → 66**、例数 **1011 → 约 1006**（`test-round-03.md:36` 实测该套件 **5 例**，故 1011−5 = **1006**）；文件数 **146 → 144**；`unmigrated 47` 是否随之下降**本轮未复核** | **高**：① 需改 `server/test/`（超出 A/B 授权）；② **改基线**会让 r1–r3 全部"1011 不变"的证据失去可比性；③ 末轮改基线，回滚成本最高 | ❌ **不做** |
| ③ **接线**（把 precheck 接进评分链路） | **新增功能变更** → 影响 AI 评分结果 → 需重跑全部评分相关套件 + 真实提交对拍 + 可能改分数 | **最高**：属"功能开发"，不在本流水线（架构审查+重构）授权内；且会**改变学生分数** | ❌ **不做** |

**P6 结论**：**维持选项①（保留）**。补充一条本轮新增判断依据：**r3 已消除该模块唯一的生产语义风险（第三份 `resolveProjectRoot` 漂移）** ⇒ 保留它的边际代价从"潜在漂移源"降为"纯占位"，故选项①的性价比**比 r3 时更高**。若要向用户确认，建议收敛为一句话："是否允许在末轮改回归基线（1011 → 1006）以删除 270 行未接线代码？"——**默认答案应为否**。

---

## 5 局限与未覆盖声明（诚实清单）

1. **本轮唯一写入 = 本报告**。临时脚本落 `/tmp`（`a4-secrets.mjs` / `a4-unused.mjs` / `a4-unused2.mjs` / `a4-admincheck.mjs`），**未入仓**；`a4-admincheck.mjs` 为访问 `server/node_modules` 曾在 `server/` 下短暂存在（`server/.__a4_admincheck.mjs`），**执行后立即 `rm -f` 并已确认删除**（`ls` 返回 No such file）。`git status -uno` 全程为空。
2. **未跑 jest** ⇒ 判据 4 的 `1011/0` 是**引用 r3 实测**（`test-round-03.log`，且该日志**未被 git 跟踪**，只存在于活工作树）；本报告所有"U-1 不回归"均为**推导预期**，运行时安全性由 C 的四段回归实测判定。
3. **未做运行时/动态安全验证**：未起常驻服务、未发任何越权 HTTP 请求、未做渗透 ⇒ **S-1/S-2/S-3/S-6 的"可利用"结论全部是静态代码路径推演**。这是本报告**最容易产生假信心**的地方，特此明示。
4. **禁止联网、未跑 `npm audit`** ⇒ **本报告不含任何依赖漏洞结论**，§2.3 仅为版本三方对拍。
5. **无生产环境** ⇒ S-1 / S-3 / `CORS_ORIGIN` 三项**不可判定**；S-3 的实测**仅对本机 `exam_system` 库成立**。
6. **未审计前端渲染层 XSS**（`v-html` 面）、**未审计 `server/test/` 装置自身**、**未覆盖 `trustjudge-server`**（未确认该目录是否存在）。
7. **`bind-check` 原型口径的缺陷未被本轮补齐**：star re-export / CJS 两类**漏报场景未构造负向用例** ⇒ §4.1 的"可检出坏绑定"结论**仅对 named-import 场景成立**。
8. **U-1 的 9 项里 1 项已证伪**（`ruleExecutor.js:18` 的 `createRequire` 实为在用）⇒ 该事实本身说明**纯 grep 计数会产出假阳性**；本报告已对余 8 项**逐项人读反向核验**，但**未做自动化语义级对拍**（例如"该符号是否被 `eval`/动态属性访问消费"）—— 仓内**未发现**此类用法，属**未穷尽**。
9. **`entities.js:4` 的处置带主观性**：本报告按"人读 import 面可读性"判其为可清项；若采用更严口径（"领域门面文件应保持 import 面稳定"），该项应剔除。**剔除后 U-1 = 7 名 / 6 文件**，结论不变。
10. **未复算零引用令牌（61 严格口径）**、**未复算 `tokens.css` 任何计数**（不在本轮范围）→ 沿用 r2 C 的实测。
11. **未重扫 r0–r3 的全量结论**（规范 §六.3）→ r0 的 F-1..F-7、r1/r2 的令牌与对比度结论、N-1/N-2 的原始证据**均未本轮复查**；P3/P4/P5 直接引用 r2/r3 的裁定，**未独立复算**。
12. **GodFile 10 个 / M-1b / N-1 / N-2 四项"已确认不可达"未重新论证**，按任务书要求直接排除在执行集外。
13. **`/api/admin/monitor` 的 PM2 日志回读仅静态读通**（未实跑该端点），且 `server/uploads` 与 `~/.pm2` 的实际内容**未检查**（属运行时/生产数据）。

---

## 6 本轮结论（摘要）

| 维度 | 结论 |
|---|---|
| **任务 1 安全专项** | 7 个检查面全量有界普查（529 文件密钥扫描 / 全路由鉴权逐行读 / 6 条路径链路 / SQL+命令执行全 grep / 依赖静态对拍 / 日志外泄链路端到端）。**需立即修 2 项**（S-1 内部密钥兜底可伪造、S-2 6 个教师写端点跨校越权）、**观察 4 项**（S-3 默认口令本地已确证生效、S-4 LLM 完整响应落盘、S-5 monitor 日志回吐、S-6 学生作业详情缺班级归属 = **交接清单 A4 复核成立**）、**未发现可确证缺陷 4 面**（路径穿越 / SQL / 命令执行 / `.env`）。**拦截 1 处重大假阳性**：`JWT_SECRET` 兜底字面量虽仍在源码，但 `app.js:33-36` 的启动期随机密钥使其**生产不可达** ⇒ 历史 BUG-006 仍处已修复态 |
| **任务 2 判据对照** | §5 六项：**4 项已达成**（分层 0/47 · 硬指标 0/0/0 · 后端 1011/0 · 轮次 4/8）+ **1 项条件达成**（无障碍：本轮零 client 改动）+ **1 项不可达成**（GodFile 10，双向硬阻断）→ 收尾按「**部分达标**」。**附加达成：SCC = 0**（164 边 / 0 SCC / 0 自环，本轮复算） |
| **任务 3 候选** | **C-O2 做**（新门禁，0.057s，负向对照可精确报点；**不影响 unmigrated 47**）；**C-O1 / C-O3 认同但落点为方法学**（且已被 C 的 `c3-repl.mjs` 种子化复刻 + r3 结构枚举事实满足）；**M1 不防抖，改"单次状态原则"**（根因 = `arch-metrics.mjs:41` 子进程 + 本进程行数**混用两种状态源**）；**P6 维持保留**（**270** 行，行数已过时；删则基线 1011 → 约 1006） |
| **任务 4 执行集** | **1 个文件批 = 7 个文件 / 预算 8**（U-1：8 处零消费具名 import）。**安全发现中无一项进入执行集** —— S-1/S-2/S-6 因**无测试覆盖则不可验证**（判据 ①）、S-3/S-4/S-5 因**需拍板或属既裁定**。U-1 可被三门禁 + 1011 例 + 真 import 自检直接验证，**零视觉风险** |
| **给 Captain 的建议** | ① **新增拍板项 P7：安全专项 2 项高危的处置授权** —— 建议把 **S-2 与 S-6 合并为一次"归属校验收口"**（同一契约、同一 403 语义、可共用 t4/t6/t7 既有夹具），并**授权 C 在既有测试文件内新增越权用例**（避免改 67 套件口径）；**S-1 单独走"启动期 fail-closed"决策**（需先确认生产已配置该密钥）。② 若用户同意，**S-2+S-6 一次可修 6+1 个 handler，仍在 8 文件预算内**，这是本流水线**最后一个有实质安全收益的窗口**。③ 若用户仅要收敛：**U-1 可做可不做**，直接转收尾写 `99-summary.md` 亦符合全部约束（"**本轮无可执行项，建议收敛**"是等价可接受的结论）。④ **C-O2 建议单独立项**（不算 B 的 8 文件预算），落地时**必须带负向自测**。⑤ **§4.4 建议写入 constraints 第 13 条**（"门禁自身也必须先冻结再测"），零代码风险。 |
