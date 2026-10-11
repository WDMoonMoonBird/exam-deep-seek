# split-status.md — GodFile 拆分执行状态（唯一入口，≤30 行）

step: 2（client 侧 Submit.vue）｜ phase: B（抽 9 个 composable，分 4 批）
plan: docs/plan/2026-10-11-godfile-split-plan.md（§4 顺序 / §5 DoD / §8 流程与 5 处改造）
constraints: docs/pipeline/project-constraints.md（17 条；**§8.1 的 5 处改造优先于「禁止新增文件」与「未分层不增」**）
archives: docs/split/<file>-{plan,refactor,verify}.md ｜ anchor: 2c9e3d9

判据（已按拆分任务改造）：
- 新增文件允许，但必须落进 domain / application / infrastructure / interface 之一
- 未分层数**下降或持平**（当前 46）｜ 已刷新基线：arch 46 / GodFile 9 / 观察带 18
- cycle **cycles=0 = 硬不变量**（任何新环判 FAIL）｜ 全量测试 0 failed（用例数可增）
- 被跟踪文件数不再是硬不变量
- **client 步按档判**：A 档（只抽 script、模板样式字节不动）→ L0 切片字节判等 + L1 编译级对拍 + L2 交互验证；
  B 档（动模板/样式）→ 强制像素门禁且**区域表须先覆盖该文件所在路由**；axe 缺失时用 a11y 树逐节点对拍替代
- ★任何 client 验证必须留痕「被测树绝对路径 + HEAD + 指纹」（本仓有第二 worktree，rig 默认指向它）

| step | 目标 | A | B | C | 提交 |
|---|---|---|---|---|---|
| 0 | scripts/gates/pixel-diff.mjs | ✅ 三组自测 + 两组抗假绿（exit 2 不冒充 PASS） | — | — | f017151·2c9e3d9 |
| 1 | server/src/services/ruleExecutor.js → 8 文件 | ✅ | ✅ | ✅ PASS（43/43 切片全等·120 例对拍·门禁证伪 6/6·全量 0 failed） | 06cb6dc |
| 2 | client/src/views/student/Submit.vue → 9 个 composable | ✅（实为 14 段；模板 1–281 非 64） | 进行中 | 待执行 | — |

强制停止条件（遇到即停、写入待决清单，不擅自决定）：
① 需改对外契约或产品语义 ② 同一步两次回流仍不通过（跳下一步）③ 护栏不可用 ④ 触及「不改清单」⑤ 步数走完

已裁决：G-A 显式指主仓库 client + 留痕被验树 ｜ G-B step2 属 A 档不需像素门禁（B 档前再扩夹具）｜ watch 时机保持原样，竞态只登记不改（属独立行为改进）

待决清单（需用户拍板）：（空）

next_action: step 2-B 抽 composable 中 → C 独立验证（L0/L1/L2 + U1–U6）→ 提交并刷新 arch 基线
