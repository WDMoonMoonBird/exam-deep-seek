# 代码决策标记追溯索引（2026-08-31 建立）

> 背景：2026-08-31 批量注释清理删除了约 40 处代码内 BUG-XXX/DSGN-XXX/Q# 决策标记
> （审计：docs/test-results/2026-08-31/agent-arch-be.md DSGN-C69-BE-07）。
> 决策内容均可追溯以下文档，本索引供"代码 → 历史决策"反向检索。
> 约定：**代码不再保留决策 ID 标记，统一存 docs**（见 refactor-architecture.md 约定段）。

## 决策出处对照

| 标记 | 出处 |
|---|---|
| Q5（studentController 4 处） | docs/PRD-实训题流程定义.md:259,277 |
| Q7（projectArchive 5 处） | docs/PRD-实训题流程定义.md:261,279 |
| Q9（teacherController） | docs/PRD-实训题流程定义.md:263,281 |
| P4（teacherController） | docs/PRD-实训题流程定义.md |
| BUG-006（app.js JWT 随机生成，用户决策） | docs/test-results/2026-08-16/98-disposition.md:25 |
| BUG-003/004/007/008/011/012/014/017、R2-A/B/C（projectGrading/deepseek 等） | docs/test-results/2026-08-16/{98-disposition.md,99-summary.md} |
| DSGN-001/006/007/018（仓储契约/排期） | docs/test-results/2026-08-16/98-disposition.md:28、99-summary.md:132 |
| "6③ 裁决"（projectView.js:70，全库 0 命中） | 原记录仅存在于被删注释；裁决上下文见 docs/test-results/2026-08-16/98-disposition.md（BUG-017 处置） |
| 迁移来源（scoring.service.js / objective-grading.service.js） | git 历史（git log --follow）为权威源；代码头注释已恢复一行概述 |

## 维护约定

- 新决策：在 docs/test-results/ 对应日期目录记录，代码内不写 ID 标记
- 检索：grep 本文件或按日期目录查阅 98-disposition.md / 99-summary.md
