# pipeline-status.md — 流水线唯一状态入口（规范 §三.4：主调度只读本文件，不加载源码/报告）

round: 7 ｜ phase: REFACTOR（**round 6 回流**） ｜ anchor: 50dbc66（round 6 WIP 已提交） ｜ tag: pipeline-start-2026-10-10 = ac60831（可整体回滚）
spec: docs/AI Agent 软件工程闭环流水线规范（DeepSeek Harness 终极无人值守版｜全自动多轮迭代｜防上下文爆炸｜Skill三技能绑定）.md
gates: docs/plan/2026-10-10-流水线落地前必改清单.md ｜ constraints: docs/pipeline/project-constraints.md（硬禁令/不改清单/13 条测量纪律/四段口径/门禁）
archives: docs/pipeline/{audit,refactor,test}-round-NN.md ｜ agents: A=code-analyzer · B=tech-code-refactoring · C=tech-test-automation

baseline_fail: **0 failed / 1011 passed / 67 套件**（四段 912+17+61+21）｜round 5 因新增越权测试预期升至 68 套件 / 1011+N 例（预期增量）
baseline_layers: 违规 0 / 未分层 47 ｜ baseline_cycle: **0 个 SCC**（round 2 已清零）
baseline_hard_metrics: hex=0 !important=0 Modal.confirm=0 ｜ baseline_tokens_unref: 61（严格口径，可删 0）
godfile_threshold: 800（>800 现 10 个；>500 现 19 个）

⚠️ 确认不可达（需用户拍板，非 Agent 可解）：① GodFile 10 个（server 拆分必新增 unlayered 文件撞门禁；client 拆分撞视觉铁律，本项目无 ui-guard）
② M-1b（rule-quality 的 .ant-statistic-title 对比度，同属视觉变更）③ N-1 --duration-page 契约悬空、N-2 12 个 --tag-* 令牌漂移（正解在设计文档侧）
④ **P7 = S-1**：INTERNAL_SECRET 兜底常量 + /api/internal/graded 无鉴权（需先确认生产是否已配该密钥，本地未配 → 不能擅自改 fail-closed，否则可能打断生产 worker）
⑤ **P8 = S-3**：默认超管口令初值（本地库 bcrypt 比对已确证生效；upsert 语义为「已存在不改」，轮换过即安全）｜S-4：deepseek.js 把 LLM 完整响应落盘（唯一未截断点）
out_of_scope / hard_ban: 见 constraints §2 / §1（严禁 git clean|stash|checkout -- .|reset --hard|restore .）

| round | audit | refactor | test | 结论 |
|---|---|---|---|---|
| 00 | audit-00（基准全量） | — | 段1 13 failed/920（假红） | 基准建立 |
| 01 | audit-01 ✅ 105=44+61 | refactor-01 ✅ | test-01 ✅ PASS | 提交 8fb2c1d |
| 02 | audit-02 ✅ 60留/4删 | refactor-02 ✅ 6 文件 | test-02 ✅ PASS（axe+像素） | 提交 4b531b8 |
| 03 | audit-03 ✅ 死代码漂移收敛 | refactor-03 ✅ 3 文件 | test-03 ✅ PASS（含对抗性证伪） | 提交待做 |
| 04 | audit-04 ✅ **安全专项：S-1/S-2 两个高危** | —（安全项未入 A 的执行集） | — | 已完成审查 |
| 05 | —（沿用 r4 安全专项） | refactor-05 ✅ S-2 五端点 + S-6 + 22 例越权测试 | test-05 ✅ PASS（108 例对抗性·0 绕过） | 提交 e722f54 |
| 06 | audit-06 ✅ 57/57 写端点普查 | refactor-06 ✅ 8 组 | test-06 ⚠️ **需回流**（C6-1 阻断） | WIP 已提交 |
| 07 | —（回流） | 进行中：C6-1 内容校验 + R-1 收口 | 待执行 | 进行中 |

halt: 最多 8 轮，或 constraints §5 六项判据全部达标（GodFile 项已确认不可达 → 收尾按「部分达标」报告）
next_action: **Captain 已裁决（B 未能收到，须在下一次派发时执行）**：批准 B 的 #5 等价契约（并入既有 findAssignmentContext，不新增仓储方法）｜授权在 round 6b 修 createAssignment 的 questionIds/classIds，边界=只许「补模型桩 + 在既有 toHaveBeenCalledWith 期望里新增键」，严禁删除/放宽断言或改用 objectContaining 弱化，报告须贴 assignment-q9-branches.test.js 完整 diff 供 C 复核；若超出「加桩+加键」即停并回报。round 7 起转收尾。