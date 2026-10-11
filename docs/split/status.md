# split-status.md — GodFile 拆分执行状态（唯一入口，≤30 行）

step: 1（ruleExecutor 首刀） ｜ phase: C（独立验证）
plan: docs/plan/2026-10-11-godfile-split-plan.md（§4 顺序 / §5 DoD / §8 流程与 5 处改造）
constraints: docs/pipeline/project-constraints.md（17 条；**§8.1 的 5 处改造优先于其中「禁止新增文件」与「未分层不增」**）
archives: docs/split/<file>-{plan,refactor,verify}.md ｜ anchor: 17be8c9

改造后的判据（覆盖 constraints §5 的对应项）：
- 新增文件**允许**，但必须落进 domain / application / infrastructure / interface 之一
- 未分层数必须**下降或持平**（当前 47），每步后刷新 arch-metrics 基线
- 文件数**不再是硬不变量**（昨夜的 146 只属 pipeline 轮次）
- cycle-check：SCC 必须仍为 0（边数可变）｜ 全量测试 0 failed（套件/用例数可增，属预期）
- client 步追加：像素 4 组全等 + axe 不新增违规；禁止重建 client/dist

| step | 目标 | A | B | C | 提交 |
|---|---|---|---|---|---|
| 0 | scripts/gates/pixel-diff.mjs（client 护栏） | 进行中 | — | — | — |
| 1 | ruleExecutor.js（1010 → 8 文件：3 domain + 5 infra，合计 1067 行） | ✅ 完成 | ✅ 完成（未分层 47→46、GodFile 10→9、43/43 切片全等、149 例绿） | 进行中 | — |

**强制停止条件**（遇到即停、写入下方待决清单，**不擅自决定**）：
① 需要改变对外契约或产品语义 ｜ ② 同一步连续两次回流仍不通过（跳下一步，不阻塞全线）
③ 护栏不可用（该步则只做 server 侧，不做 client 改动） ｜ ④ 触及「不改清单」 ｜ ⑤ 步数走完/全达标

待决清单（需用户拍板）：
（空）

next_action: step 1-C 验证中（切片判等 + 门禁证伪 + 六绑定裁定 + 全量回归）→ 通过后提交该步并把 arch 基线刷新为未分层 46 / GodFile 9 → 进 step 2（client 侧 Submit.vue，需 step 0 像素门禁就绪）