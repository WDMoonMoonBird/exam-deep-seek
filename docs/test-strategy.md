# Exam-DeepSeek 重构验收测试策略与计划（v1.0）

> 版本：v1.0　适用范围：server/（Express 5 + Prisma + MySQL + Socket.IO）与 client/（Vue 3 + Pinia + Axios）
> 编写依据：`docs/refactor-architecture.md`（架构契约）、`docs/test-baseline.md`（基线红线）、`server/src/domain/ports/*.js`（端口契约源码）、`server/scripts/check-layers.mjs`（层守卫）
> 性质：**验收型测试策略**——验证重构目标（高内聚/低耦合/可测试/可扩展）与架构约束（分层/依赖方向/领域零依赖/无循环依赖/跨模块走接口）是否达成；不新增业务功能。

---

## 0. 现状快照（勘察结论，2026-08-16）

| 维度 | 现状 | 对测试的含义 |
|---|---|---|
| 分层 | server/src 四层：domain（8 文件）/ application（use-cases）/ infrastructure（persistence·ai·events·notifier·rate-limit·execution·bootstrap）/ interface | 已可逐层独立测试；仍有 8 个未分层文件（app.js、constants.js、controllers/*6） |
| 端口契约 | domain/ports/repositories.js（8 仓储）、gateways.js（AiGateway/ExecutorPort/NotificationPort/RateLimiterPort/UnitOfWork） | 契约源是 **JSDoc typedef，无运行时校验** → 契约测试必须机器化断言 |
| 设计模式 | 依赖倒置、端口与适配器、仓储、工厂、策略（GradingStrategy）、观察者（事件总线）、命令、装饰器（Caching/Retrying/RateLimited AiGateway）、UnitOfWork | 每个模式都有可验证点：替身注入、实现矩阵、装饰器顺序、事务边界 |
| 测试基线 | unit 214/214、integration 63/63（7 suites）、e2e 4/4（student/teacher 各 2）；层守卫 0 违规（58 文件） | 这是回归红线起点：失败数只降不升 |
| 测试设施 | Jest 30（--runInBand，串行）+ supertest + Playwright；测试库 exam_system_test（白名单护栏）；pretest 跑 check-layers；CI 有 architecture-guard.yml | 设施齐备；缺：契约套件、前端单测、性能基准、覆盖率门槛 |
| 已知风险 | AI 输出格式不稳定（P-2026-08-16-01 已修，extractProjectGradeJson 三级解析）；R3/student-v2 偶发超时；CachingAiGateway 已就绪未接线 | 测试必须隔离真实 AI 调用；性能基线需单独建立 |

---

## 1. 测试策略

### 1.1 总体思路：四个支柱

1. **契约先行（Contract-First）**：`server/src/domain/ports/*.js` 与各 use-case 的公开方法是唯一契约源。所有跨模块测试（单元中的替身、集成中的真适配器）都以契约为基准，契约测试机器化断言"实现 × 契约"的一致性，防止 JSDoc 契约漂移。
2. **行为基线兜底（Strangler 安全网）**：以 `docs/test-baseline.md` 的 unit/integration/e2e 数字为红线，任何阶段失败数只降不升；每个缺陷修复后必须更新基线表与决策日志。
3. **分层守卫自动化（Guard-as-Code）**：check-layers.mjs 已进 pretest + GitHub Actions；测试计划补充**架构断言测试**（madge/dependency-cruiser 跑循环依赖 + import 图快照对比），把"无循环依赖、依赖方向正确"从人审变成测试。
4. **金字塔分层，AI 链路特殊对待**：大量单元（领域/应用）→ 适量集成（仓储×真库、路由×supertest）→ 关键契约 → 少量 e2e。AI 网关一律注入替身或装饰器，真实调用只发生在受限的基准回归中（防扣费、防非确定性）。

### 1.2 重构目标 → 验证手段映射（本策略必须回答的问题）

| 重构目标 | 验证手段 | 主负责 Agent |
|---|---|---|
| 高内聚（一模块一能力） | 单元测试按模块独立跑通；模块职责审计（文件行数/职责断言）；上帝控制器残留量（6/34 已迁移 → 继续下降） | agent-unit-*、agent-review |
| 低耦合（经接口通信） | 契约测试（实现×端口矩阵）；静态扫描（domain 零外部 import、infra 不反向依赖）；**耦合度度量**：任一端口替换为替身即可跑通该模块全部测试 | agent-contract、agent-guard |
| 可测试（核心逻辑不依赖基础设施） | 领域/应用层测试**零 DB/HTTP/FS 依赖**（全部替身注入）；验证 test 无需真实 AI key、无需编译器即可覆盖评分核心逻辑 | agent-unit-domain、agent-unit-app |
| 可扩展（新增功能不改旧模块） | **开放封闭演练**：在不修改 use-case 的前提下（a）新增一个 AI 供应商适配器（b）新增一个评分策略（c）换一个仓储实现——全部应只改 compose.js；写成可重复的"架构演练测试" | agent-contract、agent-review |
| 分层/依赖方向/无循环依赖 | check-layers 0 违规 + madge 循环检测 + import 图快照 | agent-guard |
| 跨模块调用走接口 | 静态审计：controllers 不得 import infrastructure；应用层不得 import prisma；领域层零依赖（现有守卫已覆盖，补测试化断言） | agent-contract、agent-guard |

### 1.3 测试层级与重点（六层）

| 层级 | 重点 | 主要落点（现状） | 需补齐 |
|---|---|---|---|
| 单元测试 | 业务不变量、状态机、错误路径、边界 | scoring.service（15）、objective-grading.service（12）、review/question/submission use-cases、filename-decode（24）、rate-limiter、event-bus、executors、deepseek-gateway、system-config.repository | entities/value-objects/events 的规则单测；use-case 边界用例（并发提交、截止判定）；覆盖率门槛 |
| 集成测试 | 端口实现 × 真设施（MySQL）协作；路由→用例→仓储全链路 | auth/submit/review/student/student-v2/question/assignment（63） | 仓储适配器专项套件（8 仓储 × CRUD + 软删除过滤）；Socket 通知链路；compose 装配冒烟 |
| 契约测试 | 接口定义与实现一致性；JSDoc 契约机器化 | **无** | test/contract/ 新套件：端口实现矩阵 + use-case 接口形状断言 |
| 端到端测试 | 完整业务流程 + UI 行为零回归（冻结铁律） | student.spec 2/2、teacher.spec 2/2 | 管理端流程、实训项目全流程、Socket 实时推送；存量 prod-*.spec 甄别归档 |
| 回归测试 | 重构前后行为等价 | test-baseline.md 红线 + e2e 基线 | 每次发布对比脚本；行为等价 diff 记录 |
| 非功能测试 | 性能（P95 延迟、N+1）、安全（越权/JWT/路径穿越/限流/XSS）、AI 基准 | 登录限流（InMemoryRateLimiter）、projectAssetGuard、helmet、DOMPurify 已有实现 | 性能基线文档 + 基准脚本；越权用例矩阵；npm audit；GRADING_BENCHMARK |

### 1.4 测试数据隔离策略（协作协议落点）

1. **数据库**：一律使用 `exam_system_test`（setup.js 白名单精确匹配库名，fail-closed）；unit 与 integration **必须串行**（清理+seed 非原子）；每 suite 开头清理 + 重 seed，测试内产生的数据统一用 `test_/batch_/tmp_` 前缀命名，结束后由 seed 清理逻辑回收。
2. **AI 调用**：默认注入替身（`{ grade: async () => ({score, feedback}) }`）；真实调用只允许在 `GRADING_BENCHMARK` 基准回归中，使用独立样例集 + 独立 API key，结果不得写入测试库。
3. **文件系统**：编译/AST/解压测试全部使用 `server/test/fixtures/` 临时目录，用例结束清理；禁止触碰 `server/uploads/` 真实目录（projectArchive 测试已有先例）。
4. **端口与进程**：测试进程 `PORT=0`（setup.js 已设）；e2e 由 Playwright webServer 管理独立前后端进程，`reuseExistingServer: true` 时须确认现有服务指向测试环境。

### 1.5 风险点与应对

| # | 风险 | 等级 | 应对 |
|---|---|---|---|
| 1 | AI 评分非确定性导致测试不稳定/扣费 | 高 | 单元/集成一律替身；基准回归独立跑批；快照断言只锁解析层（extractProjectGradeJson），不锁 AI 语义输出 |
| 2 | 契约漂移（JSDoc 无运行时校验） | 高 | 契约测试套件机器断言方法名/参数/返回形状；契约变更必须走架构评审并更新 test-baseline |
| 3 | 测试数据污染真实库 | 高 | 已有白名单护栏；补充"测试后校验库名"断言；e2e 全局 setup 中同样执行 assertSafeToWipe |
| 4 | 偶发超时（R3/student-v2）被误判为回归 | 中 | 分类处置：先重跑；连续 3 次失败才报缺陷；性能 Agent 排查 review-class N+1 |
| 5 | 循环依赖悄悄回归 | 中 | check-layers 只查方向；补 madge 循环检测 + import 图快照进 CI |
| 6 | UI 冻结铁律被测试基建破坏（如插入测试属性） | 中 | e2e 定位器只允许用现有文本/role/class；禁用添加 data-testid（除非 ui-guard 授权） |
| 7 | 覆盖率门槛形同虚设 | 中 | 覆盖率按层设门槛并进 CI（jest --coverage + thresholds），只对重构后代码生效 |
| 8 | 前端无测试设施，逻辑下沉无防护 | 低→中 | Phase 6 引入 Vitest 仅测 client/src/domain 纯函数与 stores；不测组件渲染（受冻结铁律约束） |

---

## 2. 测试计划（分阶段，执行顺序即编号）

> 每阶段末尾输出《阶段验收报告》，并更新 `docs/test-baseline.md`。门禁不过不允许进入下一阶段。

### Phase 0：基线复核与设施准备（0.5 天）
- 任务：全量跑 `npm test` + `npm run test:e2e`，核对与基线（unit 214/214、integration 63/63、e2e 4/4、守卫 0 违规）一致；建立 `server/test/contract/` 目录；准备 fixtures 与基准样例集。
- 门禁：基线数字与 `docs/test-baseline.md` 完全一致；任何偏差先处置（按基线表"失败明细与根因"分类流程）。
- 产出：基线复核记录；contract 目录骨架；fixtures 清单。

### Phase 1：单元测试全面补强（2 天，agent-unit-domain / agent-unit-app / agent-unit-infra 并行）
- 任务：领域层补 entities/value-objects/events/errors 规则单测；应用层补 use-case 边界（防重复提交、截止判定、事务边界、异常传播）；基础设施纯逻辑补 prompt-builder、ai-response 解析、projectArchive 清洗语义。
- 门禁：领域层行/分支覆盖 ≥ 90%，应用层 ≥ 85%；领域层测试文件 **0 个外部依赖 import**（由守卫自动检查测试目录）；全量 unit 绿。

### Phase 2：契约测试（1.5 天，agent-contract）
- 任务：按 §3 契约矩阵产出 `test/contract/*.test.js`；开放封闭演练（新增适配器/策略只改 compose 的演练测试）；controller → use-case 调用形状断言。
- 门禁：契约矩阵 100% 通过；发现的不一致全部转"设计问题"提交架构师，**不擅自改生产代码**。

### Phase 3：集成测试补强（2 天，agent-integration）
- 任务：8 个仓储适配器 × 真 MySQL 专项（含软删除过滤、事务回滚）；compose 装配冒烟（app.locals 完整性）；路由层 supertest 全链路（鉴权→用例→响应码映射）；Socket 通知集成（事件总线→notifier 推送）。
- 门禁：integration 全绿且新增 ≥ 30 用例；R3/student-v2 偶发超时记录复现率（≤1/10 视为环境噪声）。

### Phase 4：端到端与回归（2 天，agent-e2e）
- 任务：补管理端（班级/学生/教师管理）、实训项目全流程（上传→编译→AST→AI 评审→成绩）、Socket 实时性 spec；存量 prod-*.spec 甄别（保留有价值的并入正式矩阵，脚本产物归档 `test/e2e/archive/`）；产出《行为等价 diff 记录》（对照 UI 冻结基线）。
- 门禁：e2e 全绿；UI 冻结基线无未授权 diff（ui-guard 复核）。

### Phase 5：非功能测试（1.5 天，agent-nonfunc）
- 任务：性能基线（登录、题目列表分页、成绩查询、review-class 列表 P95/P99；AI 并发 1/2/4 的信号量行为）；安全用例矩阵（越权矩阵、JWT 过期/篡改、路径穿越、限流 429、XSS 载荷、npm audit）；AI 基准回归（GRADING_BENCHMARK 首版 20 样例）。
- 门禁：产出 `docs/performance-baseline.md` 与 `docs/security-report.md`；无高危漏洞（audit 无 critical/high 未豁免）；越权矩阵 0 突破。

### Phase 6：审查与完成判定（1 天，agent-review + 架构师）
- 任务：全量回归（unit+integration+e2e+守卫）；覆盖率报告；缺陷/设计问题清点；《测试完成判定表》对照 §6。
- 门禁：§6 完成标准全部满足；test-baseline.md、决策日志同步更新；发布验收。

---

## 3. 测试团队：Agent 角色说明书

> 协作协议（所有 Agent 通用）：① 只基于 `docs/refactor-architecture.md` 与 `server/src/domain/ports/*.js` 编写测试，**不得修改生产代码**；② 缺陷走 §4 缺陷模板，接口/文档不一致走"设计问题"通道；③ 测试数据必须隔离（§1.4）；④ 每阶段结束向 agent-review 提交产物。

### 3.1 agent-unit-domain（领域层单元测试 Agent）
- **职责**：测试 domain/ 全部规则：entities 不变量（Submission 状态机 SUBMITTED→GRADING→GRADED、截止判定）、value-objects（Score>0、权重合计）、scoring.service（resolveSubQuestionScores/weightedTotal/isAbnormal）、objective-grading.service、errors 分类、events 载荷。
- **输入**：domain/ 源码、refactor-architecture.md §2.3、test-baseline.md（现行语义决策：强制填分、不恢复均分/总分校验）。
- **输出**：`server/test/unit/domain/**` 测试文件 + 覆盖率报告（行/分支）。
- **验收标准**：领域层行覆盖 ≥ 90%、分支 ≥ 80%；测试文件零外部 import（npm 包/node 内置）；所有用例不触 DB/HTTP/FS。
- **禁止事项**：修改 domain 生产代码；引入 jest.mock 之外的任何依赖注入框架；以"测试没过"为由要求改业务语义（语义变更走产品决策通道）。

### 3.2 agent-unit-app（应用层单元测试 Agent）
- **职责**：测试 use-cases：review（regrade/manualAdjust R3 不透传规则/getReviewDetail）、question（校验/分值走领域服务）、submission（提交/截止/防重复）；事务边界与事件发布（若已接线）；错误映射（EntityNotFoundError 等传播路径）。
- **输入**：`application/use-cases/*.js`、ports 契约（替身依据）、compose.js（真装配对照）。
- **输出**：`server/test/unit/application/**` + 覆盖率报告。
- **验收标准**：应用层行覆盖 ≥ 85%；**全部测试用内存替身实现端口**（参照现有 review.use-cases.test.js 的 makeRepo/makeSub 风格）；任一替身可整体替换为另一实现而不改用例测试（可测试性证明）。
- **禁止事项**：import prisma/express/axios/child_process/fs；在测试中访问真实 AI 网关；修改 use-case 生产代码。

### 3.3 agent-unit-infra（基础设施单元测试 Agent）
- **职责**：测试基础设施中**可离线测**的纯逻辑与适配器：deepseek-gateway（含 extractProjectGradeJson 三级解析 G1-G6 扩展）、prompt-builder、caching-ai-gateway 装饰器顺序（缓存命中/未命中/失效）、in-memory-event-bus（订阅/退订/异常隔离）、in-memory-rate-limiter（封锁窗口/记录/清理）、executors（编译/AST，用 fixture 工程）、filename-decode（路径穿越）、projectArchive（.git 过滤语义）、system-config.repository（DB 优先 ENV 兜底、1 分钟缓存）。
- **输入**：infrastructure/ 源码、ports 契约、test/fixtures/。
- **输出**：`server/test/unit/infrastructure/**` + 覆盖率报告。
- **验收标准**：行覆盖 ≥ 80%；装饰器行为（顺序、透传、异常）有专门用例；涉及外部进程的测试可离线跑（编译器缺失时跳过并显式标记）。
- **禁止事项**：真实调用 DeepSeek API；写 `server/uploads/` 真实目录；修改适配器生产代码（行为变化走缺陷通道）。

### 3.4 agent-contract（契约测试 Agent）
- **职责**：机器化验证"实现 × 契约"一致性：① 端口实现矩阵（8 仓储 + 5 网关端口 × 真适配器，校验方法存在、签名形状、返回结构、错误约定）；② use-case 接口形状（controller 调用参数与用例公开方法一致）；③ 开放封闭演练（在不动 use-case 的前提下"新增 AI 供应商/评分策略/仓储实现"→ 断言只需改 compose.js）；④ 契约变更检测（ports/*.js 修改时自动触发全矩阵重跑）。
- **输入**：`domain/ports/*.js`（契约源）、compose.js（实现注册表）、refactor-architecture.md §2。
- **输出**：`server/test/contract/**` + 《契约核对矩阵》(§4.4) + 设计问题清单。
- **验收标准**：矩阵 100% 通过；发现的不一致 100% 以"设计问题"提交架构师并闭环；演练测试证明可扩展性目标。
- **禁止事项**：修改生产代码使契约"通过"；把契约问题降级为普通缺陷；绕过架构师直接改 ports。

### 3.5 agent-integration（集成测试 Agent）
- **职责**：跨模块协作正确性：仓储适配器 × 真 MySQL（CRUD、软删除过滤、事务回滚、级联）；用例 × 真仓储（compose 装配后经 app.locals 调用）；HTTP 路由全链路（supertest：鉴权中间件→controller→用例→响应码/错误码映射）；Socket 通知链路（事件发布→订阅→推送载荷）。
- **输入**：compose.js、routes/*、middleware/*、ports 契约、test/setup.js（seed 数据约定）。
- **输出**：`server/test/integration/**` 新增用例 + 集成报告。
- **验收标准**：全绿；新增用例 ≥ 30；测试只在 `exam_system_test` 库运行（setup 护栏自动校验）；与 unit 串行执行。
- **禁止事项**：并行跑 unit/integration；绕过白名单直接连库；向测试库写入非 test_ 前缀数据；修改路由/中间件生产代码。

### 3.6 agent-e2e（端到端测试 Agent）
- **职责**：完整业务流程可运行性 + UI 行为零回归（冻结铁律）：学生（登录→作业→答题→提交→成绩）、教师（建题→建作业→审核→改分）、管理端（班级/学生/教师）、实训项目（上传→机器评分→成绩）、Socket 实时推送（评分完成通知到达）。
- **输入**：client/dist 或 vite dev、server 测试环境、`docs/ui-freeze-baseline.md`、现有 student/teacher spec。
- **输出**：`server/test/e2e/**` 新 spec + 《行为等价 diff 记录》。
- **验收标准**：全绿（含现有 4/4 基线）；定位器不使用 data-testid 等侵入性属性；与 UI 冻结基线逐项对照无未授权变化。
- **禁止事项**：修改 views/components/router/App.vue 以"方便测试"；对 UI 加测试专用分支；把偶发失败当缺陷上报（先重跑 ×3）。

### 3.7 agent-nonfunc（非功能测试 Agent：性能/安全）
- **职责**：性能基线（登录、列表分页、成绩查询、review-class P95/P99、AI 并发信号量行为、上传/解压大文件）；安全（越权矩阵：学生访问教师接口/跨班数据、JWT 过期与篡改、路径穿越、登录限流 429、XSS/HTML 注入经 DOMPurify 清洗、npm audit 依赖漏洞）；AI 基准（GRADING_BENCHMARK 首版）。
- **输入**：接口清单（routes/*）、中间件（auth/role/projectAssetGuard/rateLimiter）、测试库、基准样例集。
- **输出**：`docs/performance-baseline.md`、`docs/security-report.md`、`docs/grading-benchmark.md`。
- **验收标准**：性能数字可复现（记录环境与命令）；越权矩阵 0 突破；audit 无未豁免 high/critical；AI 基准分差记录在案（波动>阈值时提示重试/降级策略）。
- **禁止事项**：压测打到生产库/生产 API；真实 AI 基准使用测试库数据以外的大规模调用（控成本）；把偶发慢查询直接定性为缺陷（先定位 N+1/索引）。

### 3.8 agent-review（测试审查 Agent）
- **职责**：审查全部测试产物：与契约/架构文档一致性、覆盖缺口、测试质量（断言有效性、替身合理性、无断言测试）、缺陷与设计问题分诊、完成标准核对（§6）。
- **输入**：各 Agent 产物、缺陷/设计问题清单、基线表、覆盖率报告。
- **输出**：审查报告（含阻塞项清单）+ 《测试完成判定表》签署。
- **验收标准**：每个模块至少 1 条正向 + 1 条负向断言可追溯；无"为凑覆盖而写"的无效断言；缺陷严重级分诊正确率（抽检）≥ 90%；完成判定表逐项有证据。
- **禁止事项**：修改任何测试或生产代码（只读审查）；以个人偏好否决客观达标项（须引用文档条款）。

### 3.9 agent-guard（架构守护 Agent：基线/守卫/文档同步）
- **职责**：维护 check-layers.mjs 与 CI 工作流（含 madge 循环检测扩展）；守护 test-baseline.md 红线（每阶段对比、更新决策日志）；审计"测试是否触碰生产数据"；产出 import 图快照供对比。
- **输入**：scripts/、.github/workflows/、docs/test-baseline.md、各阶段测试结果。
- **输出**：守卫增强补丁（仅 scripts/CI/docs，**非生产代码**）、基线对照报告。
- **验收标准**：CI 全绿；基线表与真实结果一致；循环依赖检测已并入 CI；任何"红线突破"在 24h 内有处置记录。
- **禁止事项**：放宽守卫规则以"通过"（规则变更须架构评审）；把测试基建改动混入业务提交。

---

## 4. 模板

### 4.1 测试用例模板

```markdown
| 字段 | 内容 |
|---|---|
| 用例 ID | TC-{层级}-{模块}-{序号}，如 TC-UNIT-DOMAIN-SC-015 |
| 标题 | 一句话描述被测行为（含条件与预期） |
| 层级 | unit / integration / contract / e2e / nonfunc |
| 对应契约 | ports/repositories.js → QuestionRepository.findById；或 use-case 方法 |
| 前置条件 | 数据、替身、环境（如：注入 findById 返回 null 的替身） |
| 测试数据 | 输入值 + 隔离标注（test_ 前缀 / fixtures 路径） |
| 步骤 | 1.… 2.… 3.… |
| 预期结果 | 断言点逐条列出（返回值/状态/异常/副作用） |
| 负向用例 | 边界、异常、权限拒绝路径 |
| 优先级 | P0 阻断 / P1 高 / P2 中 / P3 低 |
| 关联缺陷 | 若为缺陷回归用例，填缺陷 ID |
```

### 4.2 缺陷报告模板

```markdown
| 字段 | 内容 |
|---|---|
| 缺陷 ID | BUG-{日期}-{序号}，如 BUG-2026-08-16-01 |
| 标题 | 现象 + 影响模块 |
| 严重级别 | 阻断（业务不可用）/ 严重（主流程受损）/ 一般 / 轻微 |
| 影响模块 | 层 + 文件 + 函数（如 application/use-cases/review.use-cases.js → manualAdjust） |
| 缺陷描述 | 现象、实际结果、预期结果 |
| 复现步骤 | 1.… 2.…（含测试数据与命令，可执行） |
| 复现环境 | 分支/commit、Node 版本、库、是否真实 AI 调用 |
| 证据 | 日志片段、失败断言输出、截图（e2e） |
| 根因分析 | 初步定位（可空，由修复方填） |
| 建议修复方案 | 方案 + 影响面 + 回归用例建议 |
| 处置状态 | 新建 / 确认 / 修复中 / 已修复待验 / 关闭（不修复需架构师豁免） |
```

### 4.3 设计问题报告模板（接口/文档不一致 → 架构师）

```markdown
| 字段 | 内容 |
|---|---|
| 问题 ID | DSGN-{日期}-{序号} |
| 类型 | 接口设计不合理 / 文档与实现不一致 / 契约缺失 / 可扩展性障碍 |
| 涉及契约 | ports 文件 + 方法；或 use-case 方法 |
| 冲突描述 | 文档（refactor-architecture.md §X / JSDoc）与实现（文件:行）的差异 |
| 测试证据 | 契约测试失败输出 / 演练测试失败原因 |
| 影响面 | 消费方清单（哪些 controller/用例依赖该契约） |
| 建议方案 | 改契约（含迁移影响）或改实现 |
| 架构师裁决 | 采纳 / 拒绝 / 折中（附理由） |
```

### 4.4 契约核对矩阵（agent-contract 输出）

```markdown
| 契约（端口/方法） | 消费方 | 实现适配器 | 方法存在 | 签名形状 | 返回结构 | 错误约定 | 状态 |
|---|---|---|---|---|---|---|---|
| AiGateway.grade | ReviewUseCases.regrade | DeepSeekGateway | ✅ | ✅ | ✅ | ✅ | 通过 |
| SubmissionRepository.save | SubmissionUseCases.submit | SubmissionRepository | ✅ | ✅ | ✅ | ✅ | 通过 |
| …（8 仓储 + 5 端口全量） | … | … | … | … | … | … | … |
```

---

## 5. 测试完成标准

| 类别 | 标准 | 度量方式 |
|---|---|---|
| 覆盖率 | 领域层行 ≥ 90%、分支 ≥ 80%；应用层行 ≥ 85%；基础设施（可离线部分）≥ 80%；核心规则（scoring/objective-grading/状态机）100% | jest --coverage + thresholds（仅对已分层代码生效） |
| 测试绿线 | unit、integration、e2e 全部通过；**失败数不得高于 test-baseline.md 基线**（只降不升） | npm test + test:e2e |
| 契约 | 契约核对矩阵 100% 通过；开放封闭演练通过（新增适配器/策略/仓储只改 compose.js） | test/contract |
| 缺陷处置 | 阻断性缺陷 0；严重缺陷 100% 修复或架构师书面豁免；一般/轻微修复率 ≥ 95%；所有缺陷有根因记录 | 缺陷清单统计 |
| 设计问题 | 100% 提交架构师并闭环（采纳/拒绝均留痕） | DSGN 清单 |
| 架构约束 | check-layers 0 违规；madge 循环依赖 0；领域层零外部 import（含测试文件）；未分层文件清单只减不增 | CI + 守卫 |
| 非功能 | P95 响应达标（性能基线文档内数值）；越权矩阵 0 突破；npm audit 无未豁免 high/critical；限流 429 生效 | performance/security 报告 |
| 数据隔离 | 全程 0 次生产库写入（守卫日志可查）；AI 真实调用仅基准回归且账单可控 | setup 护栏 + 审计 |
| 文档同步 | test-baseline.md、决策日志、UI 冻结基线均已更新；本策略文档随架构演进修订 | 文档 diff 审查 |

**发布放行条件**：上表全部达标 + agent-review 签署《测试完成判定表》 + 架构师确认无未闭环设计问题。

---

## 6. 执行约定与命令速查

```bash
# 全量（pretest 自动跑层守卫）
DATABASE_URL='mysql://user:pass@localhost:3306/exam_system_test' npm test

# 分层跑（注意：unit 与 integration 必须串行）
DATABASE_URL='...' npm run test:unit
DATABASE_URL='...' npm run test:integration
npm run check:layers          # 层守卫，可 --save-baseline 更新基线

# e2e（Playwright 自动起 3000 + 5173）
npm run test:e2e

# 契约套件（Phase 2 新增脚本，建议并入 npm test 全量）
DATABASE_URL='...' npm run test:contract   # 新增：jest --testPathPatterns=contract
```

关键约定：① 测试库名必须精确命中 `exam_system_test` 白名单，setup.js 会 fail-closed；② 必须 `NODE_OPTIONS=--experimental-vm-modules`（npm scripts 已内置）；③ jest 30 用 `--testPathPatterns`（复数）；④ e2e 定位器禁用 data-testid 类侵入性属性；⑤ 每阶段结束更新 test-baseline.md 并提交 agent-review。
