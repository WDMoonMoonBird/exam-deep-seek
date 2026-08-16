# 测试基线红线（P0 快照）

> 目标：重构期间**行为不劣化**——任何阶段结束后，unit + integration 失败数不得高于本基线；每修复一个失败即更新本表。
> 基线版本：`9e9efe9`（2026-08-16，fix: 评分 Worker 误捞实训题提交）

## 运行方式（重要）

- **测试库**：`exam_system_test`（白名单见 `server/test/setup.js` 的 TEST_DB_NAMES；护栏会拒绝在非白名单库上运行，防误清开发库）
- **schema 同步**：迁移链不完整（prisma/migrations 仅 2 个），需 `DATABASE_URL=<测试库> npx prisma db push` 对齐当前 schema.prisma
- **必须串行**：unit 与 integration 不得并行执行（setup.js 的清理+seed 非原子，并行会互踩导致 FK 冲突）
- **jest 30**：CLI 选项为 `--testPathPatterns`（旧 `--testPathPattern` 已弃用，npm scripts 已在 P0 修复）
- 命令示例：`DATABASE_URL='mysql://root:xxx@localhost:3306/exam_system_test' npm run test:unit`（集成同理）
- **NODE_OPTIONS=--experimental-vm-modules** 必须带上（ESM 支持），npm scripts 已内置

## 基线统计（2026-08-16）

| 套件 | P0 基线 | P1 结果 | P2 结果（当前） |
|---|---|---|---|
| unit（8 suites） | 108/118，10 失败 | 132/134，2 失败 | **151/151 全部通过** ✅（E4 修复 + E6 测试更新） |
| integration（7 suites） | 54/61，7 失败 | 61/61 全绿 | **61/61 全绿** ✅ |
| e2e（Playwright） | 未运行 | 未运行 | **✅ 已建立（P8b）**：student.spec 2/2 + teacher.spec 2/2（学生登录/作业/答题/成绩 + 教师建题/建作业/审核汇总），UI 行为证明 |

## 失败明细与根因

### A. 实现与测试不同步（15 个）——提交 `2649393`（题库管理模块重大重构）及学号业务规则变更后，测试未同步

| 套件 | 用例 | 现象 | 根因 | 处置建议 |
|---|---|---|---|---|
| unit/scoring | S1-S7 + 附加（8 个） | 期待均分与『总和≠满分 throw』 | `scoring.js` 在 2649393 被回退为『每题必须填分且 >0』，均分/总和校验被移除 | **需业务决策**：P1 提取 ScoringService 时确认现行语义（强制填分）为准则更新测试，或恢复均分逻辑 |
| integration/question | Q1 / Q2 / Q10 | 创建题目期待 code 0，实收 1001 | 新 API 校验规则（subQuestions 格式/字段）与测试构造数据不符 | 更新测试数据对齐新校验规则 |
| integration/question | Q4 | 分值总和≠满分期待拒绝（1001），实际成功 | 总分校验已移除（与 scoring 同源） | 同上，随业务决策 |
| integration/question | Q9 | 删除后 GET 期待 404 | 软删除（migration soft_delete）语义与测试期待不一致 | 确认软删除过滤是否生效，对齐测试 |
| integration/question | Q12 | 搜索『期中』返回 0 条 | 链式失败（Q10 创建失败导致无数据） | 随 Q10 修复 |
| integration/student | M1 | 期待 username=test_new_stu，实收 test_new_stu@10001 | 新业务规则『学号@院校代码』，测试未同步 | 更新测试断言 |

### A 类处置记录（P1 已完成，全部清零 ✅）

- scoring 8 个：测试已按现行语义重写（agent-test-sync + 决策日志）；领域版单测见 `server/test/unit/domain/scoring.service.test.js`（15 用例全过）
- question 6 个：`makeQuestion` 默认小题补 `score: 100` 根治链式失败；Q4 改期待成功（总分不校验）；Q9 软删除过滤实现正确（getQuestion/getQuestions 均带 `deletedAt: null`），404 断言保留并新增列表过滤断言
- student 1 个：M1 断言对齐『学号@院校代码』规则

### B. 环境差异（1 个）

| 套件 | 用例 | 现象 | 根因 | 处置建议 |
|---|---|---|---|---|
| unit/filename-decode | E4 | 期待抛『Path traversal denied』，实收 path.relative 参数错误 | Node 22 的 path.relative 对非规范相对路径（../evil.txt）直接抛错而非返回 | P2 迁移 utils 时捕获并转换为领域错误 |

### C. 行为缺陷候选（1 个）

| 套件 | 用例 | 现象 | 根因 | 处置建议 |
|---|---|---|---|---|
| unit/filename-decode | E6 | `.git/config` 解压后目录名仍带前导点 | **测试过时**（已查证）：设计已从『解压落盘+读取端过滤』演进为『解压端直接过滤』——projectArchive.js 的 shouldIgnorePath 在清洗前命中 `.git` 直接跳过不落盘（第 139-144 行），sanitizeSegment 保留前导点仅作通用清洗语义 | P2 更新断言：期待 `.git` 不落盘、fileCount 不含该文件 |

## 已决策事项（决策日志）

| 日期 | 决策 | 决策人 | 影响 |
|---|---|---|---|
| 2026-08-16 | ScoringService 语义**以现行实现为准**：强制每题填分（score 必填且 >0），不恢复均分/总分校验 | 用户（产品决策） | P1 提取领域层时保持行为不变；scoring/question 测试同步更新断言 |
| 2026-08-16 | E6（.git 前导点）定性为**测试过时**：设计已演进为『解压端直接过滤隐藏目录』（projectArchive.js shouldIgnorePath 先行），测试断言过时 | 架构师查证 | P2 更新测试断言，期待 .git 不落盘 |
| 2026-08-16 | E4（Path traversal）定性为 **Node 22 环境差异**：path.relative 对非规范路径直接抛错 | 架构师查证 | P2 迁移 utils 时捕获并转换为领域错误 |
| 2026-08-16 | **附带发现（真实缺陷，未修）**：teacherController.js:470 createAssignment 的 question 查询漏过滤 `deletedAt`，软删除题目仍可被选入作业 | agent-test-sync 调查 | P4 迁移 teacher 用例时一并修复并补测试 |
| 2026-08-16 | E4 已修复（P2）：预算统计循环穿越检查前置，避免 ignore 包对含 `..` 路径抛 RangeError；E6 测试已按现行语义更新（解压端过滤 + 原契约抛错） | 架构师实施 | 已完成，filename-decode 24/24 |
| 2026-08-16 | P2 基础设施层落地：SystemConfigRepository / PromptBuilder / DeepSeekGateway / CachingAiGateway（行为等价迁移，17 单测全过）；原 deepseek.js 保持不动待 P3 切换 | 架构师实施 | 已完成 |

## 已知偶发现象（非回归，重跑即过）

| 现象 | 说明 | 处置 |
|---|---|---|
| integration R3（班级审核列表）偶发 30s 超时 | 瞬时 MySQL 负载/前序进程清理未完成导致查询阻塞；接口本身未改动（review-class 不走新用例） | 重跑全量即过；如频繁出现需排查 review-class 查询性能（N+1） |
| integration student-v2 偶发失败 | 同因（suite 间数据/时序干扰，共享 seed） | 重跑即过 |
| integration auth A5 偶发（2026-08-16 回归第 1 轮） | 学生登录 token undefined；单套件 6/6 全绿、连续 2 轮全量未复现 → 偶发/顺序干扰（登录链路时序） | 重跑即过；若频繁出现再排查登录链路时序 |

## 生产问题修复记录

### P-2026-08-16-01：实训题（project）AI 评分偶发失败

| 项 | 内容 |
|---|---|
| 现象 | 实训项目提交评分失败：`grading.state=failed`，错误『AI 评分服务异常』；学生端显示 0 分/未评分；教师端『重试评分』仍可能失败 |
| 证据 | 日志：`err.message: 返回格式不包含有效的 JSON` @ deepseek.js gradeProject（正则 `\{[\s\S]*"totalScore"[\s\S]*\}` 匹配失败）；全库 21 条 project 提交中 1 条失败（10003/提交 10327），同作业其他学生正常 |
| 根因 | gradeProject 仅支持『裸 JSON』响应：① 模型输出 markdown 代码块围栏 ② 前后带说明文字 ③ `max_tokens=8000` 截断（`finish_reason=length`，长 prompt 场景：30 文件源码拼入）→ 均解析失败。**概率性**：同提交内容重试结果不同（失败 2 次后第 3 次成功得 95 分），属模型输出格式不稳定，非配置/链路问题 |
| 修复 | commit `29c9383`：新增 `extractProjectGradeJson` 三级解析——直接匹配 → 剥离 markdown 围栏 → **括号栈补齐截断闭合符**；解析失败时记录 `finish_reason` / `contentLength` / 响应前 300 字符（诊断增强） |
| 验证 | +6 单测（G1-G6 覆盖围栏/说明文字/截断/纯文本/结构不符）；unit 220/220、integration 63/63、守卫 0 违规；真实 API 调用 7.7s 成功 |
| 后续建议 | 教师端『重试评分』可恢复；连续失败时查日志 `项目评分响应解析失败` 的 `snippet` 判断是纯文本还是截断；长 prompt 场景可考虑按文件抽样/截断源码送入 |

## 红线规则

1. 重构提交不得引入**新的**测试失败；
2. 每阶段结束对比本表，失败数只降不升；
3. 修复/处置失败时同步更新本表（记录决策与依据）；
4. e2e 基线在 P3（评分链路改造）前补充，作为 UI 零改动的行为证明。