# 实训题评分上下文管理 — 操作记录

> 项目：Deadpan 判题系统（Exam-DeepSeek）
> 开始：2026-08-17 ｜ 状态：✅ 第三轮修复完成待回归（未提交 git，等待用户允许）
> 第三轮验证：全量回归 677/677（48 suites，新增 r2-fixes 13 用例）；check-layers 0 违规；prompt-preview 一次偶发重跑即过
> 测试团队入场条件：全量回归 664/664 通过、check-layers 0 违规

### 测试团队回归（round2）→ 第三轮修复（2026-08-17）

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
