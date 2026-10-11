# split-status.md — GodFile 拆分执行状态（唯一入口，≤30 行）

step: 5（client 侧 ProjectQuestionEdit.vue，868 行）｜ phase: A（接缝与响应式风险分析）
plan: docs/plan/2026-10-11-godfile-split-plan.md（§4 顺序 / §5 DoD / §8 流程与 5 处改造）
constraints: docs/pipeline/project-constraints.md（17 条；**§8.1 的 5 处改造优先于「禁止新增文件」与「未分层不增」**）
archives: docs/split/<file>-{plan,refactor,verify}.md ｜ anchor: e37d27c

判据（已按拆分任务改造）：新增文件必须落进 domain/application/infrastructure/interface 之一；未分层须下降或持平；cycles=0 为硬不变量；全量 0 failed
- 未分层数**下降或持平**（**当前 44**）｜ 已刷新基线：**arch 44 / GodFile 6 / 观察带 16**（step4 后，以 scripts/gates/arch-metrics.mjs 为准）
- **client 步按档判**：A 档 = 5 条判据（L0 切片字节 / L1 冻结 bindingMetadata 对拍 / L2 交互 / ④自由标识符扫描(两遍+正控) / ⑤真运行时对拍(变异+惰性对照)）；B 档（动模板）才强制像素门禁且区域表须先覆盖该路由；axe 缺失用 a11y 树对拍替代
- ★任何 client 验证必须留痕「被测树绝对路径 + HEAD + 指纹」（本仓有第二 worktree，rig 默认指向它）

| step | 目标 | A | B | C | 提交 |
|---|---|---|---|---|---|
| 0 | scripts/gates/pixel-diff.mjs | ✅ 三组自测 + 两组抗假绿（exit 2 不冒充 PASS） | — | — | f017151·2c9e3d9 |
| 1 | server/src/services/ruleExecutor.js → 8 文件 | ✅ | ✅ | ✅ PASS（43/43 切片全等·120 例对拍·门禁证伪 6/6·全量 0 failed） | 06cb6dc |
| 2 | client/src/views/student/Submit.vue → 9 个 composable（1519→631） | ✅ | ✅ | ✅ PASS（L0/L1 全等 · 7 场景 A/B 对拍 0 差异 · 变异反证 4/4 · GodFile 9→8） | c26c8dc |
| 3 | checkerService.js（1280 → 10 文件：2 domain + 8 infra，最大 386 行） | ✅ | ✅ | ✅ PASS（49/49 切片全等·门面可达 10/10·**209/209 四维对拍**·27/27 函数全覆盖·变异 5/5） | 287b9b0 |
| 4 | deepseek.js（1051 → 10 文件：2 domain + 8 infra，最大 221 行） | ✅ | ✅ | ✅ PASS（41/41 切片全等·21 名同对象·I14 双向·94 夹具五维相同·23/23 函数覆盖·禁网 0） | e37d27c |
| 5 | ProjectQuestionEdit.vue（868 → 348；9 个 composable） | ✅ | ✅ | ✅ PASS（L0 三块·L1 51 名·④扫描 0/正控 3/3·⑤运行时 + 变异 5/5·U1 双模式） | b94407f |
| 6 | QuestionEdit.vue（983 → **466**；12 个 composable，23–134 行） | ✅（纠：template 实为 **312** 行非 48；style 只 1 块→L0 切 2 段） | ✅（99 块判等·L1 冻结口径 82471B 全等·95 块+2 授权改写·运行时 77/77 字段同·变异 6/6·**④真抓到 1 处未绑定名缺陷**） | 进行中 | — |
| 返工 | ★step2 缺陷修复（useQuestionNav 漏注入 subQuestions）+ 判据④回溯扫描 160 文件 | — | ✅ 2 行修复 | ✅ PASS（真 Chromium 真 DOM 7/7 复现·正控 3/3·门禁 44/5/15·ROUND=12 0 failed） | 45947b5 |

强制停止条件：① 需改对外契约或产品语义 ② 同一步两次回流仍不通过（跳下一步）③ 护栏不可用 ④ 触及「不改清单」⑤ 步数走完

已裁决：G-A 显式指主仓库 client + 留痕被验树 ｜ G-B step2 属 A 档不需像素门禁（B 档前再扩夹具）｜ watch 时机保持原样，竞态只登记不改（属独立行为改进）

待决清单（需用户拍板）：（空）

⏸ **暂停于 2026-10-11 11:21（用户用餐/断网）** —— 驱动定时器已删除、:3000/:5173 已交还、无任何自动任务在跑。
  断点状态：step 6 代码已落盘但**未提交**（`client/src/composables/question/` 12 文件 + QuestionEdit.vue 466 行 + QuestionEdit.vue-refactor.md + arch-metrics 基线 4/14）；
  **C 的 step6 验证未完成**（已验证报告未产出，但已跑出 test-round-13.log）⇒ 恢复后第一件事 = 重派或等待 C 出结论，再提交 step 6。
  恢复方式：`schedule_create` 重建驱动（每 1500s，标题含「GodFile 拆分推进」），或直接说「继续拆」。
next_action: step 6-C 验证中（★须自建 client 侧替代判据——cycle-check 根仅 server/src、bind-check 不含 client，对 client 步这两条门禁**空转**）→ 通过后提交并刷新基线（44 / 4 / 14）
剩余 GodFile（4）：teacherController 1338 · Doc.vue 1106 · ReviewDetail 988 · reviewController 965
已裁决/已沉淀：约束包第 18 条（tree-sitter 同进程假红根因=JS 包装层重载而原生 .node 缓存）｜ DoD 判据④边界（看不见「被调方声明形参但调用方没传」的跨文件接线错配，只能靠⑤兜）