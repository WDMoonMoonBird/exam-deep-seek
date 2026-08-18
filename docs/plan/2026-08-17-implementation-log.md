# 实训题评分上下文管理 — 操作记录

> 项目：Deadpan 判题系统（Exam-DeepSeek）
> 开始：2026-08-17 ｜ 状态：✅ 事实提取（tree-sitter）+ 规则引擎完成（未提交 git，等待用户允许）
> 全量回归 787/787（50+2 独立进程 suites）；check-layers 0 违规（63 文件）
> 端到端：同代码学生评分完全一致（94/94/67），零波动、批改零 LLM（主观项小调用）
> 第三轮验证：全量回归 677/677（48 suites，新增 r2-fixes 13 用例）；check-layers 0 违规；prompt-preview 一次偶发重跑即过
> 测试团队入场条件：全量回归 664/664 通过、check-layers 0 违规

### 事实提取（tree-sitter）+ 规则引擎升级（2026-08-18）

**背景**：正则匹配不可靠（axios.get 不在正则、路径猜错）。用户提出 Tree-sitter/Semgrep/JsonLogic 方案探讨，确认采用：Tree-sitter 事实提取 + 现有规则引擎判断。

**多 Agent 分工**：
- Subagent A：factExtractor.js（635 行，13 单测）——tree-sitter 提取统一事实 JSON（依赖/路由/Pinia/axios/语法错误等 19 字段）
- Subagent B：ruleExecutor 升级（57 单测）——fact 规则类型（{fact, op, value}）+ syntax_check 换 tree-sitter
- 主 Agent：生成 prompt 注入事实 schema；修复：includes 数组 value、gradeSubjectiveItems 解析器（items vs totalScore）、主观失败不降级、routes 变量引用/shorthand 解析、tree-sitter Parser 每次新建（旧树节点失效）、tree-sitter-vue ABI 冲突移除

**关键修复**：
1. gradeSubjectiveItems 用 extractProjectGradeJson（匹配 totalScore）解析 {items} 输出 → 永远失败 → 改用 extractFilesJson；且主观失败不再降级（确定性结果保留）
2. tree-sitter 共享 Parser 连续 parse 旧树节点失效 → 每次新建 + 保持引用
3. tree-sitter-vue（ABI 13）与 tree-sitter 0.25 二进制冲突污染进程 → 移除，Vue 统一 <script> 提取
4. jest 单进程多套件复用 tree-sitter 原生模块状态破坏 → npm test 三段式独立进程（测试基建隔离）

**端到端**（题目 353，全班 59 人，并发 64）：
- 规则 69 项（含 fact 规则）校准 → 标准包客观 94/94（3 项标准包缺陷转主观 6 分）
- 全班评分：1.zip 全员 94、2.zip 全员 94、3.zip 全员 67 —— 同代码同分、零波动、113 秒
- 全量回归 787/787（三段独立进程）；check-layers 0 违规（63 文件）

**背景**：AI 自由写 JS 脚本（检查器）11 轮实验证明模型写代码不稳定（校准常改坏脚本、分数溢出 103/100）。用户给出规则驱动方案：AI 只生成 JSON 规则（评分标准翻译成检查参数），计分由确定性执行器强制。

**多 Agent 分工**：
- Subagent A：ruleExecutor.js（7 种规则类型 + 约束校验 + 工程根探测 + 分组汇总，42 单测）
- Subagent B：checkerService 改造（生成规则 JSON + parseCheckerRules + 参数式校准，35 单测）
- Subagent C：前端预览改为「评分规则（JSON）」
- 主 Agent：gradeWithChecker 切换 runRules、总和归一化、满分判定修复、明细截断修复、端到端验证

**规则类型**：file_exists / dir_contains_file / contains_text / count_regex / contains_regex / file_count_in_dir / syntax_check（node --check 语法校验）

**关键约束（执行器强制）**：每项 score ≤ max_score；totalScore 只累加客观项；validateRules 拒绝总和 ≠ 满分。

**调试中修复**：
1. 模型客观项总和常 ≠ 满分（105/100）→ normalizeCheckerRules 总和归一化兜底
2. 满分判定含主观项偏差 → 改为 totalScore ≥ max_score - subjectiveSum
3. 明细被 slice(0,9) 截断 → 检查器链路全量保留（57 条）
4. 标准包缺陷：无 Axios 封装（评分标准要求但标准包没有）→ 该项转主观分（LLM 评），规则正则修正（axios.get 不在原正则）

**端到端验证**（题目 353）：
- 规则 57 项校准（83→95 分），人工修正 2 条规则后标准包客观项 97/97 全过 + 1 项主观 3 分
- 学生评分：李芳02 与谢娜23（同代码）**均为 95 分，57 条明细完全一致**
- 全量回归 759/759（51 suites，新增 rule-executor 42 + checker-service 35）；check-layers 0 违规（62 文件）

**成本**：规则生成 1-2 轮 LLM（非思考模式）；学生批改 0 LLM 调用（纯执行器，毫秒级）或 1 次小调用（主观项）。

**遗留**：标准包自身缺陷（Axios 未封装）已记录，建议教师完善标准包；主观项评分链路（gradeSubjectiveItems）已就绪，规则含主观项时自动启用。

**多 Agent 分工**：Subagent A（checkerService 实现 + 24 单测）、Subagent B（前端编辑页评分脚本 UI）、主 Agent（接口层/评分链路/调优）。

**架构**：
- schema：questions 加 checker_script/checker_status/checker_meta
- checkerService：AI 生成 Node.js 检查脚本 → 标准包自举校准 → 沙箱执行
- 评分链路 gradeWithChecker：确定性分项（checker）+ 主观分项（LLM 温度 0）→ 降级原链路
- 前端：编辑页「评分脚本」按钮/模态框（生成中轮询/校准日志/脚本预览/失败重试）

**调优历程（13 次生成实验，关键结论）**：
1. 思考模式长 prompt 空输出（finish=length）→ 脚本生成用**非思考模式**（实测 16K 字符稳定输出）
2. 模型自创分项 → 注入 rubricItems 固定分项（分项来自题干+评分标准）
3. 首轮不提供文件树导致路径猜测 → **首轮注入标准包文件树**（round 1 从 56→88 分）
4. 修改式校准不稳定（模型常改坏脚本：0 分/语法错误）→ **多轮全新生成取最优**（round 2 达 103/100 → ready）
5. 标准包文件树/代码片段注入校准 prompt、客观/主观分离、items+subjective=满分约束

**端到端验证**（题目 353）：
- 脚本就绪：2 轮生成（88 → 103 达标）
- 学生评分：李芳02 与谢娜23（同代码）**均为 97 分，9 项完全一致**——波动归零 ✓
- 全量回归 706/706（50 suites）；check-layers 0 违规（61 文件）

**成本**：每题目一次脚本生成（2 轮 × 非思考 ~16K tokens）；学生评分 0 LLM 调用（全确定性，subjective 为空时）或 1 次小调用（有主观项时）。

**问题**：同一包提交的相同代码评分差 35 分（李芳02=90 vs 谢娜23=55）——分项明细由模型每次评分自由生成（项数/满分漂移：谢娜23 那次 8 项满分 20/20/20/10/15/5/10/10 ≠ 评分标准 10/10/20/20/10/15/5/10/10）。

**方案**（用户拍板：不新增教师配置，从教师评分标准提炼）：
1. schema：questions 加 rubric_items（JSON 分项缓存，教师零配置）
2. summarizeRubricItems：从评分标准提炼 3~12 分项（一次轻量调用，temperature 0.1，30s/2 重试），normalizeRubricItems 强制合计=满分
3. ensureRubricItems：懒生成 + 并发安全（先查后写）+ 失败降级（模型自由分项）
4. buildProjectGradePrompt 注入固定分项；gradeProject 输出 breakdown 强制映射分项结构
5. 教师更新题目（评分标准变化）→ 清 rubric_items 缓存
6. 前端审核页「分项明细」→「评分标准」
7. 修复：BUG-008 的 slice(0,8) 会截掉固定分项第 9 项 → 固定分项模式下按分项数保留

**验证**（题目 353，教师评分标准 9 项）：
- 提炼落库：9 项 [项目初始化与运行 9/路由与跳转 9/登录 18/注册 18/Pinia 9/主页布局与权限 14/个人信息展示 5/管理员用户列表 9/代码规范与健壮性 9] 合计 100 ✓
- 同代码重评对比：李芳02 83 vs 谢娜23 78（原 90 vs 55，35 分差收敛到 5 分），**分项结构完全一致**（9 项同组同满分）✓
- 全量回归 682/682（49 suites，新增 rubric-items 5 用例）；check-layers 0 违规

**遗留**：同代码分数仍有 ±5 波动（模型随机性），如需进一步收敛可上「多次评分取中位数」或 temperature 降低（排期可选）。

测试团队 round2 报告：有条件通过，新发现 3 缺陷（BUG-R2-A/B/C）。已全部修复：

| 缺陷 | 修复 |
|---|---|
| BUG-R2-C（必改） | enforceBudget 权重排序升序→降序（高权重保全文），导出 enforceBudget 供单测 |
| BUG-R2-A（中） | 抽共享 repairTruncatedJson（悬空开引号/闭引号/尾逗号/悬空键名/括号补全），extractProjectGradeJson + extractFilesJson 同源缺陷一并修复；extractFilesJson 导出；实测 8 截断场景全过 |
| BUG-R2-B（低） | 60KB 硬拦的选中文件补入"未提供"清单（标注超限） |
| 覆盖缺口 | 新增 r2-fixes.test.js 13 用例：extractFilesJson 8 截断场景 + enforceBudget 权重降序 2 + 重评幂等 2 |

**缺陷修复后验证（第二轮）**：
- 全量回归 664/664（47 suites）通过（gateway-contract 断言随 BUG-006 同步更新；question.test 一次偶发重跑即过）
- check-layers 0 违规（59 文件）
- admin-teacher-delete 测试修复说明：删除自身（400 分支）在真实权限模型下不可达（admin 为 super_admin 不满足 role=teacher），改测可达分支：删管理员 404 + 教师调管理接口 1003
> 方案：docs/plan/2026-08-17-project-context-v1.1.md

## 任务分工（多 Agent）

| Agent | 任务 | 状态 |
|---|---|---|
| 主 Agent（本会话） | 方案文档、Step 1 稳定性修复、Step 3 集成、全量回归、文档收尾 | 进行中 |
| Subagent A | projectContextBuilder.js 实现 + 单元测试 | 运行中 |
| 测试团队（用户侧） | 新功能完成后入场测试 | 待入场 |

## 时间线

### 2026-08-17

- [x] 方案 v1.1 评审通过（含全语言白名单扩展、CodeGraph 列 L2 候选）
- [x] 写入方案文档 docs/plan/2026-08-17-project-context-v1.1.md
- [x] Step 1 稳定性修复（max_tokens/重试/输出约束）：gradeProject 8000→16000 + 重试 3 + 输出约束；gradeSubmission 2000→4000；新增 selectImportantFiles 骨架
- [x] deepseek.js 导出 getConfig + getProjectContextMode（配置开关读取）
- [x] Subagent A 完成：projectContextBuilder.js（8 导出，666 行）+ 32 个单元测试全过（@babel/parser 已安装）
- [x] Step 2+3 集成：projectGrading.js 新增 buildGradingContext（L0 过滤 + L1 两阶段 + 预算兜底 + 安全降级），gradeProjectSubmission 接入配置开关
- [x] 本地实测：filter 模式 14KB/0.0s；two-stage 模型选中 5 个核心文件 4.4s；选择失败自动降级 L0 ✓
- [x] 修复两个问题：extractFilesJson 独立解析（选择返回 files 结构，非 totalScore）；学生包根目录名前缀导致路径不匹配 → 后缀匹配兜底
- [x] 新增集成测试 project-context.test.js（6 用例全过）

### 测试团队回归 → 缺陷修复（2026-08-17 第二轮）

测试团队验收：**有条件通过（CONDITIONAL PASS）**，664/664 全绿，提出 14 BUG + 11 DSGN。
用户指示：全部一次性修复。完成清单：

| 缺陷 | 修复 |
|---|---|
| BUG-001 | gradeProject 重试 3 次生效（catch >=3）+ 429 数组补第 3 项 [10,30,60] |
| BUG-002 | extractFilesJson 宽容解析：直接匹配→剥离围栏→字符串边界修剪+括号栈补全；正则 \s 修复 |
| BUG-003 | enforceBudget 双端压缩（学生 70% + 标准包 30%），不再只截学生 |
| BUG-004 | 两阶段选中文件强制 60KB 上限（模型软约束外的硬校验） |
| BUG-005 | teacherController.getAllTeachers 加 deletedAt: null |
| BUG-006 | deepseek-gateway max_tokens 同步：grade 4000 / gradeProject 8000 |
| BUG-007 | 文件名换行转义（renderTree）+ SELECT_ROLE 反注入声明 |
| BUG-008 | 解析层强制输出约束（breakdown≤8/comment≤60/评语≤300，违规截断落库） |
| BUG-010 | 未提供内容清单改用 matchesPicked 反向过滤（不再重复列出选中文件） |
| BUG-011 | 骨架正则补 Go 方法接收者（func (r R) Serve()） |
| BUG-012 | getSubmissionPrompt 加 type 校验（非 code → 400） |
| BUG-013 | admin-teacher-delete 弱断言修复（去死代码 + 去 if 包裹） |
| BUG-014 | 重评幂等：pending+prevStatus 时重复重评 → 400 |
| DSGN-001 | 骨架化接线落地（enforceBudget 内低权重文件先骨架再截断） |
| DSGN-005 | 提示词预览走 L0 过滤（readFilteredDir，所见即所用） |
| DSGN-006 | project_context_mode 非法值回退 filter（白名单化） |
| DSGN-007 | 截断按权重排序（低权重优先牺牲） |
| BUG-009 豁免 | 归属校验涉及全部 teacher 端点，单独排期（记录在案） |
| DSGN-002/003/004 | P3 重构排期（记录在案） |
- [ ] Step 2 L0 过滤接入
- [ ] Step 3 L1 两阶段
- [ ] 集成测试补充
- [ ] 全量回归 + check-layers
- [ ] 本记录完整收尾

## 关键决策记录

1. **业务刚需思考模式**：实测非思考模式评分区分度下降（3 份提交全部收敛 85 分，历史思考模式 80/85/96），保持思考模式，max_tokens 8000→16000
2. **reasoning_effort=low 不可用**：实测思考 22174 tokens、191.8s，反而更慢
3. **max_tokens 官方上限**：API 实测合法范围 [1, 393216]（384K），16000 远低于上限
4. **CodeGraph 列为 L2 候选**：跨文件调用图有价值，但需先验证库模式嵌入与 2 核 4G 资源占用
5. **两阶段失败安全回退**：第一轮选择失败 → 自动降级全量注入，评分不中断

## 改动文件清单（随实施更新）

| 文件 | 状态 |
|---|---|
| docs/plan/2026-08-17-project-context-v1.1.md | ✅ 已创建 |
| server/src/services/projectContextBuilder.js | ✅ Subagent A 完成（8 导出 + 32 单测） |
| server/src/services/deepseek.js | ✅ 完成（max_tokens/重试/输出约束/selectImportantFiles/extractFilesJson） |
| server/src/services/projectGrading.js | ✅ 完成（buildGradingContext + 接入配置开关） |
| server/test/integration/project-context.test.js | ✅ 6 用例 |
| server/test/unit/infrastructure/project-context-builder.test.js | ✅ 32 用例（Subagent A） |
| server/package.json | ✅ @babel/parser 依赖 |

## 部署提示（待用户允许部署时执行）

1. 云端同步：server/src/services/{projectContextBuilder.js, deepseek.js, projectGrading.js}、package.json/package-lock.json（新增 @babel/parser）
2. 云端 npm install（安装 @babel/parser）
3. 云端 DB：INSERT INTO system_configs (`key`, value) VALUES ('project_context_mode', 'filter') ON DUPLICATE KEY UPDATE value='filter'
4. PM2 重启 exam-server exam-worker
5. 观察期：filter 档运行，对比教师改分幅度；稳定后切 two-stage

## 测试与验证记录（随实施更新）

- 2026-08-17：unit 32 + integration 6（context）+ 全量回归（进行中）
