# R0-A 事实核验：本仓评分链路真实形态 + DSH 运行时契约（只读）

## 结论摘要
- **问题组 1**：实训题链=submission 落库后 `enqueueProjectGrade`(projectGrading.js:422) 异步跑；客观层纯代码、主观层 LLM，边界是 `checkerStatus==='ready' && checkerScript`(:510)；实际并发 **64**（DB `ai_concurrency`，实测）与注释"3/默认 16"漂移，另有 3 处裸 fire-and-forget。
- **问题组 2**：rubric **不冻结**（评分读 Question 活值 :459/507/520，AssignmentQuestion 仅 id+sortOrder）；教师改题库**静默改变**已发布作业标准（questions.js:173-188 无校验/告警，只清 rubricItems、不清 checkerScript）；修法 A 快照/B 失效检测/C 编辑拦截（仅方案）。
- **问题组 3**：可用入口唯一=App 内置 `runtime/cli/bin/dsh` 0.2.0-rc.2（实测）；headless=stdout 末段文本+退出码 0/1+无端口+新会话持久化+单任务；`$DSH_HOME` 隔离 profiles/storages/sessions/skills/credentials/身份，不隔离安装包与 ~/.agents/skills；执行类工具**可在 profile 层隐藏**（实测 `disabled: true`）；平台评分真正生效的 key=DB `system_configs.deepseek_api_key`（实测与 .env 不同值）。
- **差异表**：成立 8 / 部分成立 2 / 不成立 2 / 无法核验 4（共 16 条）；**施工单 8 条**；需用户拍板 5 项。

## 0 方法与档位
- 结论均由本轮自查行号得出；未引用上一会话任何数字。【已实测】= 我运行命令并有真实输出；【读码推断】= 只读源码/配置；【无法核验】= 需模型调用／外部资料／生产变更。
- 证据外置（本报告只留结论 + 关键行号）：`docs/dsh/evidence/agent-a/01-dsh-runtime-probes.md`、`02-grading-chain-evidence.md`（file:line 原文）、`03-credential-probe.md`、`04-rejected-campaign-inventory.md`。

## 1 问题组 1｜「AI 评分」链路的真实形态
**1.1 调用链【已实测 + 读码】** 本仓有两条并行链路，实训题走前者：
- 实训题：`routes/student.js:15` → `app.js:99` 挂 `/api/student` → `studentController.js:616 submitProject` → `:634 submitProjectCore`（窗口校验 :650-656、进程内互斥锁 :667-668/实现 :36-47、版本目录+安全解压 :696-703、upsert :733-737、**:745 enqueueProjectGrade**、同步返回 :748-758）→ `projectGrading.js:422-443`（setImmediate）→ `:453 gradeProjectSubmission` → `:454 acquire()` → :459 读题 → :487-493 上下文 → :507 固定分项 → :554-569 三选一链路 → :613-624 信封 → :627-636 落库；失败 `:652 markFailed`。
- 旧 ProjectSubmission：`worker.js:14` → `gradingWorker.js:252` 轮询 → `:162`/**:191 gradeOneProject**（:203-207 三方并行 → :218-230 加权落库）。非实训题：`:124 scanSubmissions` → `:33 gradeOne`。
- 结构事实：**无持久化队列**（进程内 setImmediate + 内存信号量），进程崩溃时排队任务只能靠教师重评（projectReviewController.js:212）。
- 详细 file:line 表见证据 02 A 节。

**1.2 客观/主观边界【读码推断，行号已核】** 确定性侧：`objective-grading.service.js:4/:69`（choice/multi_choice 部分给分/judge/fill）、`rule/executor.js:72 runRules`（11 种 rule_type；:73-77 校验不过抛错；:103 每项钳制；:117-118 客观分不超客观项总分）、`projectGrading.js:223-226` 再钳。LLM 侧：`project-grading.js:42 gradeProject`(temp .3/180s)、`:129 gradeSubjectiveItems`(temp 0)、`rubric-items.js:60`(temp .1)、`file-selection.js`、trustjudge sidecar。⇒ **「分数由代码算」只对 checker 就绪的题目成立**；否则总分由模型 JSON 给出（project-grading.js:104），仅在 projectGrading.js:594 钳到 [0,maxScore]。

**1.3 并发/重试/超时/降级/fire-and-forget**
| 项 | 事实 | 档位 |
|---|---|---|
| 实训题并发 | 初值 3(:49)，但 :426 `refreshConcurrency()`→:56-66 读 `ai_concurrency`(config.js:47)；**实测 DB=64** ⇒ 实际 64，与 :14/:47-49 注释不符 | 【已实测】 |
| 旧链路并发 | gradingWorker.js:24 初值 16、:253 启动读配置、:258-265 每 60s 热更；:134 take N | 【读码推断】 |
| 重试/超时 | LLM 3 次（project-grading.js:42、:129、submission-grading.js:44）；分项 2 次(rubric-items.js:76)；429 退避 5/15/30 与 10/30/60s；超时 180s/60s/30s | 【读码推断】 |
| 降级 | checker 失败→LLM 全量(:570-590)；再失败→markFailed(:652) 状态回 submitted、不向学生暴露（R6）；旧链路单题失败→0 分+ABNORMAL_FEEDBACK(:113-119)、项目失败→不覆盖分数、保持 submitted 等轮询(:233-247) | 【读码推断】 |
| 裸 fire-and-forget | ① enqueueProjectGrade(projectGrading.js:423) ② notifyGradedViaHttp(gradingWorker.js:14-21，未 await 的 fetch) ③ 检查器生成(checkerController.js:109) | 【读码推断】 |

## 2 问题组 2｜已发布作业的评分标准是否冻结
**2.1 读活值，无快照【读码推断】** 评分时一次 select 当前题目行（projectGrading.js:459 含 `scoringRubric/rubricItems/checkerScript/checkerStatus/checkerMeta`）→ :507 `ensureRubricItems(sub.question)` → :520 传入 rubric。`AssignmentQuestion` 仅 `{assignmentId,questionId,sortOrder}`（schema.prisma:226-237）；Submission(:257-287) 无快照列；全仓无 rubric 快照表/列。唯一"冻结类"痕迹 `computeRuleVersionHash`(:687-700) 只把 checker 版本写进 `answer.grading.ruleVersionHash`(:613-624)，**全仓无读者**（仅 projectView.js:26/96 透出）。

**2.2 会静默改变【读码推断，行号已核】** `teacher/questions.js:173-188` 直更，无「被作业引用」校验/告警/审计；:185 `rubricItems: null`（无条件清）而 `checkerScript/checkerStatus/checkerMeta` 不动 ⇒ 改标准后旧检查器继续生效。受影响链路：实训题首评(:745)、教师重评(projectReviewController.js:212)、提示词预览(:236-260)、旧链路 AI 评审(projectGrader.js:55)、检查器生成(checker/generator.js:124-134)。风险窗口＝重评与失败重试：历史成绩与同批其它提交**不同尺**。

**2.3 未冻结 ⇒ 最小修法（仅方案）**
| 方案 | 做法 | 代价 | 风险 |
|---|---|---|---|
| A 快照（推荐） | `AssignmentQuestion` 增 rubric/material/标准包哈希快照（或新快照表），发布时写入；评分读快照 | schema 变更 + 读路径改造 + 历史回填 | 迁移需人工执行；旧作业需回退读活值 |
| B 失效检测 | 复用 ruleVersionHash 位点增 `rubricHash`，比对不一致标 `stale` | 无 schema 变更，可先落 | 不解决公平性，只把"静默"变"可见" |
| C 编辑拦截（最小） | questions.js:173 前查该题是否被未删除/已截止作业引用，命中即 403/告警 | 几行 + 单测 | 影响教师改题，需开关；不动历史数据 |

## 3 问题组 3｜DSH 运行时契约与隔离边界
**3.1 入口**
| 入口 | 版本 | 可脚本调用 | 说明 |
|---|---|---|---|
| `…/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh` | **0.2.0-rc.2**（实测 `--version`，exit 0） | ✅【已实测】 | /bin/sh shim：`ELECTRON_RUN_AS_NODE=1 exec MacOS/DeepSeek Harness … dsh-desktop-host/lib/cli.js` |
| App 包内 asar runtime | 0.2.0-rc.2（`@deepseek-ai/dsh-desktop-runtime`，bin: dsh→lib/bin.js） | ❌ plain node 不可 | 必须经上一条 shim |
| 源码检出 `deepseek-harness-master` | **0.1.0-rc.5**、**非 git 仓库** | ❌ package 无 bin（仅 examples） | 与运行实例不同版；desktop 补丁注释记有 0.1.0-rc.7 插件被 0.2.0-rc.2 拒绝的先例 |
| 全局 PATH | — | ❌ `which dsh` 为空 | App 未 link CLI |
- 运行时：node 24.21.0 / pnpm 11.7.0 / python 3.12.14（`runtime/primary-runtime/runtime.json`）。凭据差异见 3.5；现阶段只有 0.2.0-rc.2 一路可用。

**3.2 headless 契约【已实测 + 读码】** 入口 `dsh --profile headless "<task>"`（task 亦可来自 stdin，`-` 或省略且非 tty）。输出：stdout=最后一段非空助手文本（`--json`⇒NDJSON）；stderr=reasoning 流 + `dsh: <msg>` 错误行。退出码：turn/end completed→0，否则→1；启动/参数错误→1（实测 `--session-id` 不存在时 `exit=1`、stdout 空）。端口：**不监听**（bundle patch "mounts no Host, HTTP server, Web runtime, or browser plugin"；实测组合树 96 行无 web-app/host 行；:335 `id: web` 是**出网搜索/抓取**能力）。会话：**新会话持久化**（`agents.create`+`sessions.flush`）；`--session-id` 只能接管已存在且 cwd 一致、非 subagent/fork 的会话。单任务：是。

**3.3 `$DSH_HOME` 隔离范围** 解析：configured > `$DSH_HOME` > `~/.dsh`（dsh-home-paths:resolveDshHome）。**随 home 隔离**（隔离 home 实测出现）：`profiles/`、`storages/`、`sessions/<cwd 编码>/`、`skills/`(USER_DSH)、`memories/`、`.credentials.yaml`、`cache/attachments`、`.anonymous-user-id`（实测哈希 ≠ 真实 home）、`logs/`、`dsh-runtimes/`。**全局共享**：App 安装包与 node_modules（bundle 名字先从安装目录解析）、`~/.agents/skills`(USER_AGENTS)、被引用的社区插件、工作目录/仓库文件、**继承的进程环境变量**（本次 bash 可见 `DSH_HOME/DSH_PROFILE/DSH_WEB_URL/DSH_SESSION_ID`）、系统临时目录与网络。旁证：`--version` 零落盘；`--dump-config` 只写 `profiles/headless/*`；两次探针均未在 `~/.dsh` 生成 `profiles/headless`。

**3.4 执行类工具的 profile 层隐藏——可验证判据【已实测机制】** 判据：①写 `$DSH_HOME/profiles/<p>/cordis.patch.yml`：`- id: tool-bash` + `disabled: true`（可加 tool-jobs）；②`$DSH_HOME=<隔离> dsh --profile <p> --dump-config`；③该行显示 `disabled: true` 且出现 `# == … patched by …/cordis.patch.yml`。本轮：**id-only（方案 §5.1.2 片段）与 id+name 两种写法都生效**（tool-bash 基线为 `!!js process.platform==='win32'`，被打成 true；tool-jobs 行新增 disabled）。旁证：基线树本就有 6 处 `disabled: true`（tool-plugin-manager/hmr/skill-badge…）。**未核验**：模型与子代理"确实无法执行"（需真跑会话）。**风险**：`tools` 行 `mode: !!js process.env.DSH_TOOLS_MODE`(:354-357)，且组合树含 `ptc-runtime/workflow-ptc`(:289-291) ⇒ 若开 PTC（本机 desktop 会话即 PTC 形态），`run_code` 执行面需另行处置。

**3.5 凭据真正生效者【已实测 + 读码】** 平台侧：`config.js:32-35 getConfig=cfg[key]||envFallback`、`:44 getApiKey=getConfig('deepseek_api_key', env)`，`:14-25 loadConfig` 读 `system_configs`（60s 缓存）。实测 `system_configs` 4 行：`deepseek_api_key(len=35,sk- 前缀)`、model、base_url、`ai_concurrency=64`；**DB 值与 server/.env 的 key sha256 不同** ⇒ 生效的是 DB 值（校验：SELECT+LEFT(value,3)+sha256 比对，全程不回显明文）。DSH 侧层级（dsh-credentials-local 注释）：**进程环境变量（最高）> `$DSH_HOME/.credentials.yaml`（可写）> <启动目录>/.env > `$DSH_HOME/.env`**。⇒ 对接时应由平台注入环境变量（与 system_configs 同源），避免明文落盘。

## 4 与方案文档的差异表
（读过的行段：9-58、110-163、164-256、471-500、612-657、720-759；其余未读，相关条目判无法核验）

| # | 方案条目（行号） | 判定 | 理由 |
|---|---|---|---|
| 1 | §0.1/0.2 作业级评分单位、分数由代码算、会话毁检查器存（14-25） | **无法核验** | 设计主张，需作业级触发+检查器持久化落地后才能复算；现状（1.1）不符 |
| 2 | §0.3 结果走文件（43-44） | **成立** | headless 只输出末段文本（3.2）；写文件能力在 tool-fs 行；校验/重试仍需平台实现 |
| 3 | §0.4 V1 隔离跑通（退出码 0/stdout/stderr/零触碰/会话 32KB，50） | **部分成立** | 隔离 home 跑 CLI【已实测】；真会话指标【无法核验】；"~/.dsh 零触碰"有侧证 |
| 4 | §0.4 V2 禁 tool-bash+tool-jobs 后模型与子代理"无法执行"（51、244-250） | **部分成立** | 禁用机制【已测】（3.4）；模型行为与"零落地痕迹"【无法核验】 |
| 5 | §2.2 现状"并发 信号量 3"（147） | **不成立** | projectGrading.js:56-66 实读 DB `ai_concurrency=64`【已实测】 |
| 6 | §3.1 无头契约表（166-182） | **成立** | 逐条与 asar 代码+实测一致（无 Host/HTTP/Web、无端口、stdout 末段、0/1、持久化新会话、单任务、需 ctx.appExit） |
| 7 | §3.2 profile 设计+"补丁整行替换"（184-198） | **成立** | bundles+patch 实测生效；覆盖按行整体生效（config 全量重述） |
| 8 | §3.3 凭据复用 system_configs（200-216） | **成立** | config.js DB 优先 + 实测 DB≠env（3.5）；DSH 自身不读 MySQL，需平台注入 |
| 9 | §3.4 结果走文件+平台校验（218-231） | **成立** | 同 #2（机制成立；校验器未实现） |
| 10 | §3.5 工具限制三条硬约束（233-253） | **部分成立** | ①方向与 patch 行为【已实测】，"禁 shell-env 会挂起"未复算 ②对子代理生效【无法核验】③写能力仍在【读码推断】成立；PTC 前提提醒成立 |
| 11 | §4.4.1 作业未冻结/评分读活 question（471-484） | **成立** | 独立复算：schema.prisma:226-237、projectGrading.js:459/507/520、questions.js:173-188 |
| 12 | §4.4.1 updateQuestion 未清 checkerScript（496-497） | **成立** | questions.js:178-187 只置 `rubricItems: null` |
| 13 | §6.2.1 `ai_concurrency` 只属编程题、与 DSH 无关（720-728） | **不成立** | 实训题同样读该键（:56-66/426 + config.js:47），实测 64 ⇒ 今日实训题并发已是 64；"另建 dsh_grading_concurrency"建议仍成立 |
| 14 | §5.1.2 (a) yaml 片段（622-628） | **成立** | id-only 写法本轮实测生效（3.4） |
| 15 | §1.3 决定性实验（62 份注入测试集，79-95） | **无法核验** | 需重跑实验，本轮不采信 |
| 16 | §4.1.1 峰谷定价与调度（271-397） | **无法核验** | 外部资料，本轮未做外部核验 |

## 5 给 B 的施工单（R0-B）
1. **隔离实跑装置**｜目标：一条命令在隔离 home 跑 headless 且可复算｜路径：`scripts/`（新建）｜验收：dry-run 打印 `--dump-config` 摘要（行数/工具行/disabled 行）+ `DSH_HOME`+退出码，且跑前后 `~/.dsh` mtime 快照无变化｜风险：路径含空格须整体加引号；key 不入脚本。
2. **grader profile 只读约束**｜目标：`profiles/grader` 只禁工具行、保留服务行｜路径：脚本生成到 `$DSH_HOME`（不入仓）｜验收：dump 中 tool-bash/tool-jobs 为 `disabled: true`，shell-env/permission 行保留｜风险：PTC 下 run_code 仍可能暴露，需显式断言。
3. **并发键分离**｜目标：实训题不再隐式吃 `ai_concurrency`｜路径：`server/src/infrastructure/ai/deepseek/config.js`、`server/src/services/projectGrading.js`、`server/src/controllers/adminController.js`｜验收：新增 `dsh_grading_concurrency`（默认 1，env 可覆盖），无键时并发=1 且日志可证，`ai_concurrency` 行为不变｜风险：改变吞吐预期，需灰度开关。
4. **评分依据冻结（先落 C）**｜目标：改题库不再静默影响已发布作业｜路径：`server/src/interface/http/controllers/teacher/questions.js`、`server/src/services/projectGrading.js`（写 `rubricHash`）｜验收：对已截止作业引用的题目 PUT rubric → 返回可判定错误/告警；重评能读到 `rubricHash` 并要求确认｜风险：影响教师改题，需开关；不得动历史分数。
5. **陈旧检查器修复**｜目标：改 rubric 后旧 `checkerScript` 不再生效｜路径：`questions.js:178-187`、`server/src/infrastructure/ai/checker/state.js`｜验收：PUT rubric 后 checker 状态落 `none/stale`（或清脚本）+ 单测覆盖"改 rubric ⇒ 不走 checker"｜风险：存量题目失去已生成检查器，需提示。
6. **结果落盘契约+校验器**｜目标：`grading-result.json`/`checker.json` schema 校验、失败重试一次｜路径：`server/src/services/` 新模块（**不得改 tests/ 既有文件**）｜验收：缺字段/类型错误样例 → 校验失败并重试一次、日志含原因；正常样例通过｜风险：schema 过早固化。
7. **注释/文档漂移修正**｜目标：消除"并发 3/默认 16"误导注释｜路径：`projectGrading.js:14/47-49`、`KNOWN_ISSUES.md`｜验收：grep 无该注释；KNOWN_ISSUES 记录"ai_concurrency 被两条链路共用（实测 64）"｜风险：无。
8. **只读复用证据**｜目标：不重写/不美化 R0-A 证据｜路径：`docs/dsh/evidence/agent-a/`｜验收：`git status` 中该目录无 B 的改动｜风险：无。

## 6 未解问题与需用户拍板
1. **冻结方案选 A/B/C？**（A 快照需 schema 迁移+回填；B 只做可见化；C 最小但打断教师流程）——B 的施工范围取决于此。
2. **生产库迁移谁执行？** A/C 涉及 `exam_system` 变更，本流水线禁止写生产库 ⇒ 需人工执行或明确"只交代码+迁移脚本"。
3. **`ai_concurrency=64` 与 2C4G 目标机的矛盾**：今天实训题实际并发 64（每份一次调用）。是否立即降值/是否允许继续共用该键？（方案 §6.2.1 的"不要动"只对编程题成立）
4. **DSH 凭据注入方式**：环境变量（推荐，不落盘）vs 写 `$DSH_HOME/.credentials.yaml`（落明文，需 chmod 600 + 用完即删）。
5. **是否允许 PTC/是否重跑 V2**：本机 desktop 会话已 PTC；grader 若开 PTC，3.4 结论需在真跑会话下重验（消耗 API 调用）。

## 7 精读范围与边界
- 外置证据：`docs/dsh/evidence/agent-a/01…04`（DSH 探针／file:line 原文／凭据探针／待核验对象清单）。
- 精读文件（≤15）：student 路由、studentController.js(1-100,600-799)、gradingWorker.js、worker.js、projectGrading.js(全)、project-grading.js、submission-grading.js、config.js、rubric-items.js、objective-grading.service.js、rule/executor.js+index.js、projectGrader.js、schema.prisma(130-330)、questions.js(80-219)、projectReviewController.js(150-240)。
- 本轮未做：任何模型调用、任何构建、任何写生产库、任何 `~/.dsh` 写入。