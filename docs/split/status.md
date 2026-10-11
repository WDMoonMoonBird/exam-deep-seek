# split-status.md — GodFile 拆分执行状态（唯一入口，≤30 行）

step: 2（client 侧 Submit.vue） ｜ phase: A（接缝与响应式风险分析）
plan: docs/plan/2026-10-11-godfile-split-plan.md（§4 顺序 / §5 DoD / §8 流程与 5 处改造）
constraints: docs/pipeline/project-constraints.md（17 条；**§8.1 的 5 处改造优先于其中「禁止新增文件」与「未分层不增」**）
archives: docs/split/<file>-{plan,refactor,verify}.md ｜ anchor: 17be8c9

改造后的判据（覆盖 constraints §5 的对应项）：
- 新增文件**允许**，但必须落进 domain / application / infrastructure / interface 之一
- 未分层数必须**下降或持平**（**当前 46**，step1 后已刷新基线），每步后刷新 arch-metrics 基线
- 已刷新基线：arch 46 / GodFile 9 / 观察带 18 ｜ cycle **cycles=0**（硬不变量：此后任何新环判 FAIL）
- 文件数**不再是硬不变量**（昨夜的 146 只属 pipeline 轮次）
- cycle-check：SCC 必须仍为 0（边数可变）｜ 全量测试 0 failed（套件/用例数可增，属预期）
- client 步追加：**区域表须覆盖目标文件所在路由** + 逐区域像素 sha1 全等（每主题各自改前/改后）+ **交互行为验证**（像素抓不到交互）+ axe 不新增违规；禁止重建 client/dist

| step | 目标 | A | B | C | 提交 |
|---|---|---|---|---|---|
| 0 | scripts/gates/pixel-diff.mjs（client 护栏） | ✅ 完成（三组自测 + 两组抗假绿；未能截图=exit 2 不冒充 PASS） | — | — | 已提交 |
| 2 | client/src/views/student/Submit.vue（1520 → 抽 composable，模板零改动） | 进行中 | 待执行 | 待执行 | — |
| 1 | ruleExecutor.js（1010 → 8 文件，1067 行） | ✅ | ✅ | ✅ **PASS**（43/43 切片全等·120 例对拍 0 不等·门禁证伪 6/6·全量 0 failed） | 06cb6dc |

**强制停止条件**（遇到即停、写入下方待决清单，**不擅自决定**）：
① 需要改变对外契约或产品语义 ｜ ② 同一步连续两次回流仍不通过（跳下一步，不阻塞全线）
③ 护栏不可用（该步则只做 server 侧，不做 client 改动） ｜ ④ 触及「不改清单」 ｜ ⑤ 步数走完/全达标

待决清单（需用户拍板）：
（空）

next_action: step 2-A 分析中（重点：响应式/生命周期等价性 + client 零单测下的交互验证配方）→ B 抽 composable（模板与样式一行不动）→ C 用像素门禁 + axe + 交互验证