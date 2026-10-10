# pipeline-status.md — 流水线唯一状态入口（规范 §三.4：主调度只读本文件，不加载源码/报告）

round: 1
phase: AUDIT
anchor_commit: ac60831（run anchor tag: pipeline-start-2026-10-10）
spec: docs/AI Agent 软件工程闭环流水线规范（DeepSeek Harness 终极无人值守版｜全自动多轮迭代｜防上下文爆炸｜Skill三技能绑定）.md
gates: docs/plan/2026-10-10-流水线落地前必改清单.md
constraints: docs/pipeline/project-constraints.md   # 每轮固定注入（硬禁令/不改清单/测量纪律/门禁）
archives: docs/pipeline/{audit,refactor,test}-round-NN.md
agents: A=code-analyzer（= 规范里的 deep-code-analyzer，用户确认）· B=tech-code-refactoring · C=tech-test-automation

baseline_fail: 段1 13 failed/920 passed/933（假红·已定性）；全量=1011 例/67 套件（段2=17、段3=61）
baseline_layers: 违规 0 / 未分层待迁移 47
baseline_hard_metrics: hex=0 !important=0
baseline_cycle: 1（services/factExtractor.js ↔ services/ruleExecutor.js）
baseline_tokens_unref: 105 = A44（r1 已删）+ B61；删后新零引用 **64**（--amber/green/violet-500 失唯一 referrer）→ round 2 基线用 64
godfile_threshold: 800（>800=超标，现 10 个；>500=观察，现 19 个）

out_of_scope / hard_ban: 见 constraints §2 / §1（严禁 git clean|stash|checkout -- .|reset --hard|restore .）

| round | audit | refactor | test | 结论 |
|---|---|---|---|---|
| 00 | audit-round-00.md（基准全量） | — | 段1 13 failed/920 passed（假红） | 基准建立 |
| 01 | audit-round-01.md ✅ 105=44+61 | refactor-round-01.md ✅（4 段拆进程 + 删 44 令牌/46 声明点） | 进行中（C 独立验证） | 进行中 |

halt: 最多 8 轮，或 constraints §5 判据全部达标
next_action: C 验证中（预期 4 处 Test Suites 摘要、1011 passed/0 failed）→ 归档+提交 → round 2（B 组 64 裁定 / --btn-default-bg 二选一 / 循环依赖 / M-1-M-2）
