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

| 套件 | 结果 |
|---|---|
| unit（4 suites） | 2 failed / 2 passed；**108/118 通过，10 失败** |
| integration（7 suites） | 2 failed / 5 passed；**54/61 通过，7 失败** |
| e2e（Playwright） | 未运行（需前端构建 + 浏览器环境，待补充） |

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

### B. 环境差异（1 个）

| 套件 | 用例 | 现象 | 根因 | 处置建议 |
|---|---|---|---|---|
| unit/filename-decode | E4 | 期待抛『Path traversal denied』，实收 path.relative 参数错误 | Node 22 的 path.relative 对非规范相对路径（../evil.txt）直接抛错而非返回 | P2 迁移 utils 时捕获并转换为领域错误 |

### C. 行为缺陷候选（1 个）

| 套件 | 用例 | 现象 | 根因 | 处置建议 |
|---|---|---|---|---|
| unit/filename-decode | E6 | `.git/config` 解压后目录名仍带前导点 | 隐藏目录清洗语义未恢复（注释称『语义恢复』但实现缺失） | 确认是否为回归，P2 修复或更新测试 |

## 红线规则

1. 重构提交不得引入**新的**测试失败；
2. 每阶段结束对比本表，失败数只降不升；
3. 修复/处置失败时同步更新本表（记录决策与依据）；
4. e2e 基线在 P3（评分链路改造）前补充，作为 UI 零改动的行为证明。