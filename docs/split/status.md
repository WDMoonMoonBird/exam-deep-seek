# split-status.md — GodFile 拆分执行状态（唯一入口，≤30 行）

step: 5（client 侧 ProjectQuestionEdit.vue，868 行）｜ phase: A（接缝与响应式风险分析）
plan: docs/plan/2026-10-11-godfile-split-plan.md（§4 顺序 / §5 DoD / §8 流程与 5 处改造）
constraints: docs/pipeline/project-constraints.md（17 条；**§8.1 的 5 处改造优先于「禁止新增文件」与「未分层不增」**）
archives: docs/split/<file>-{plan,refactor,verify}.md ｜ anchor: e37d27c

- 未分层数**下降或持平**（**当前 44**）｜ 已刷新基线：**arch 44 / GodFile 6 / 观察带 16**（step4 后，以 scripts/gates/arch-metrics.mjs 为准）
- **client 步按档判**：A 档 = 5 条判据（L0 切片字节 / L1 冻结 bindingMetadata 对拍 / L2 交互 / ④自由标识符扫描(两遍+正控) / ⑤真运行时对拍(变异+惰性对照)）+ ⑥client 侧替代判据；B 档（动模板）才强制像素门禁
- ★任何 client 验证必须留痕「被测树绝对路径 + HEAD + 指纹」（本仓有第二 worktree，rig 默认指向它）

| step | 目标 | A | B | C | 提交 |
|---|---|---|---|---|---|
| 0 | scripts/gates/pixel-diff.mjs | ✅ 三组自测 + 两组抗假绿（exit 2 不冒充 PASS） | — | — | f017151·2c9e3d9 |
| 1 | server/src/services/ruleExecutor.js → 8 文件 | ✅ | ✅ | ✅ PASS（43/43 切片全等·120 例对拍·门禁证伪 6/6·全量 0 failed） | 06cb6dc |
| 2 | client/src/views/student/Submit.vue → 9 个 composable（1519→631） | ✅ | ✅ | ✅ PASS（L0/L1 全等 · 7 场景 A/B 对拍 0 差异 · 变异反证 4/4 · GodFile 9→8） | c26c8dc |
| 3 | checkerService.js（1280 → 10 文件：2 domain + 8 infra，最大 386 行） | ✅ | ✅ | ✅ PASS（49/49 切片全等·门面可达 10/10·**209/209 四维对拍**·27/27 函数全覆盖·变异 5/5） | 287b9b0 |
| 4 | deepseek.js（1051 → 10 文件：2 domain + 8 infra，最大 221 行） | ✅ | ✅ | ✅ PASS（41/41 切片全等·21 名同对象·I14 双向·94 夹具五维相同·23/23 函数覆盖·禁网 0） | e37d27c |
| 5 | ProjectQuestionEdit.vue（868 → 348；9 个 composable） | ✅ | ✅ | ✅ PASS（L0 三块·L1 51 名·④扫描 0/正控 3/3·⑤运行时 + 变异 5/5·U1 双模式） | b94407f |
| 6 | QuestionEdit.vue（983 → **466**；12 个 composable） | ✅ | ✅ | ✅ PASS（104 语句 100 全等·L1 冻结口径 82471B·④抓到未绑定名·⑤24 组 20 全等+变异 5/5·client SCC 0·全量 1073 绿） | aa29505 |
| 7 | ReviewDetail.vue（988 → **620**；7 个 composable） | ✅ | ✅ | ✅ PASS（L0 假通过防线 3/3 验证·65/65 块·L1 冻结口径 32258 字符·**f===t 修正经真值表判定正确**·⑤104/104+变异 6/6·**两道 lint 判据首次实测 = ESLint 0/59、lint-check 31→31**·全量 1073 绿） | b97e633 |
| ~~8~~ | ~~client/src/views/Doc.vue（1106 行）~~ | **❌ 用户裁定剔除**（纯静态教师手册、不连后端；拆分收益与成本不成比例） | — | — | — |
| 8 | server/src/controllers/reviewController.js（965 行） | 待派 | 待执行 | 待执行 | — |
| 返工 | ★step2 缺陷修复（useQuestionNav 漏注入 subQuestions）+ 判据④回溯扫描 160 文件 | — | ✅ 2 行修复 | ✅ PASS（真 Chromium 真 DOM 7/7 复现·正控 3/3·门禁 44/5/15·ROUND=12 0 failed） | 45947b5 |

强制停止条件：① 需改对外契约或产品语义 ② 同一步两次回流仍不通过（跳下一步）③ 护栏不可用 ④ 触及「不改清单」⑤ 步数走完

已裁决：G-A 显式指主仓库 client + 留痕被验树 ｜ G-B step2 属 A 档不需像素门禁（B 档前再扩夹具）｜ watch 时机保持原样，竞态只登记不改（属独立行为改进）

待决清单（需用户拍板）：（空）

（11:21 曾暂停用餐，12:02 已恢复：驱动重建为 schedule-68966552…，step6 已由 C 验证 PASS 并提交 aa29505）
next_action: 派 step 8-A（reviewController.js 965 接缝分析）｜ 注：Doc.vue 已剔除，其像素门禁区域扩展仍会交付（供将来「更新手册截图」时作辅助核对）
剩余 GodFile：**reviewController 965 → teacherController 1338（风险最高，须先补契约测试）**；GodFile 目标 3→1（1 = 有意保留的 Doc.vue）