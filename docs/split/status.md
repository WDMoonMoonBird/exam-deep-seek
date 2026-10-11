# split-status.md — GodFile 拆分执行状态（唯一入口，≤30 行）

step: 5（client 侧 ProjectQuestionEdit.vue，868 行）｜ phase: A（接缝与响应式风险分析）
plan: docs/plan/2026-10-11-godfile-split-plan.md（§4 顺序 / §5 DoD / §8 流程与 5 处改造）
constraints: docs/pipeline/project-constraints.md（17 条；**§8.1 的 5 处改造优先于「禁止新增文件」与「未分层不增」**）
archives: docs/split/<file>-{plan,refactor,verify}.md ｜ anchor: e37d27c

判据（已按拆分任务改造）：
- 新增文件允许，但必须落进 domain / application / infrastructure / interface 之一
- 未分层数**下降或持平**（**当前 44**）｜ 已刷新基线：**arch 44 / GodFile 6 / 观察带 16**（step4 后，以 scripts/gates/arch-metrics.mjs 为准）
- **client 步按档判**：A 档（只抽 script、模板样式字节不动）→ L0 切片字节判等 + L1 编译级对拍 + L2 交互验证；
  B 档（动模板/样式）→ 强制像素门禁且**区域表须先覆盖该文件所在路由**；axe 缺失时用 a11y 树逐节点对拍替代
- ★任何 client 验证必须留痕「被测树绝对路径 + HEAD + 指纹」（本仓有第二 worktree，rig 默认指向它）

| step | 目标 | A | B | C | 提交 |
|---|---|---|---|---|---|
| 0 | scripts/gates/pixel-diff.mjs | ✅ 三组自测 + 两组抗假绿（exit 2 不冒充 PASS） | — | — | f017151·2c9e3d9 |
| 1 | server/src/services/ruleExecutor.js → 8 文件 | ✅ | ✅ | ✅ PASS（43/43 切片全等·120 例对拍·门禁证伪 6/6·全量 0 failed） | 06cb6dc |
| 2 | client/src/views/student/Submit.vue → 9 个 composable（1519→631） | ✅ | ✅ | ✅ PASS（L0/L1 全等 · 7 场景 A/B 对拍 0 差异 · 变异反证 4/4 · GodFile 9→8） | c26c8dc |
| 3 | checkerService.js（1280 → 10 文件：2 domain + 8 infra，最大 386 行） | ✅ | ✅ | ✅ PASS（49/49 切片全等·门面可达 10/10·**209/209 四维对拍**·27/27 函数全覆盖·变异 5/5） | 287b9b0 |
| 4 | deepseek.js（1051 → 10 文件：2 domain + 8 infra，最大 221 行） | ✅ | ✅ | ✅ PASS（41/41 切片全等·21 名同对象·I14 双向·94 夹具五维相同·23/23 函数覆盖·禁网 0） | e37d27c |
| 5 | ProjectQuestionEdit.vue（868 行，**双模式**；抽出 9 个 composable，.vue 868→≈300） | ✅（纠 3 处块边界：template 实为 194 行；**有两个 style 块**→L0 切 3 段） | 进行中 | 待执行 | — |

强制停止条件：① 需改对外契约或产品语义 ② 同一步两次回流仍不通过（跳下一步）③ 护栏不可用 ④ 触及「不改清单」⑤ 步数走完

已裁决：G-A 显式指主仓库 client + 留痕被验树 ｜ G-B step2 属 A 档不需像素门禁（B 档前再扩夹具）｜ watch 时机保持原样，竞态只登记不改（属独立行为改进）

待决清单（需用户拍板）：（空）

next_action: step 5-B 分批抽 9 个 composable 中（4 批；★三条铁律：形参名不统一/禁 composable 互 import/清理顺序 :749→:750→:751→:752 不变；★开关常量必须保持普通 const）→ C 用 L0(3 段)/L1/L2 验证
剩余 GodFile（5，step5 完成后）：teacherController 1338 · Doc.vue 1106 · ReviewDetail 988 · QuestionEdit 983 · reviewController 965