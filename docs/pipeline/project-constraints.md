# 项目约束包（每轮固定注入 A/B/C）

> 规范依据：《AI Agent 软件工程闭环流水线规范》§六.4「技能原生能力优先 —— 不干预 Skill 内置工作流，**只传入项目约束**」。
> 本文件即"项目约束"，每轮由 Captain 随任务一起交给 Agent A/B/C，**不依赖模型回忆**。

## 1 硬禁令（违反即本轮作废）

- **禁止** `git clean` / `git stash` / `git checkout -- .` / `git reset --hard` / `git restore .`
  —— 工作区有 18 条**未跟踪**的验收证据（含 `tests/` 219MB、6 份 10-10 报告）；这些命令会一次性抹掉整条证据链。
- **禁止** 触碰用户实例：端口 `:5173` / `:3000` / worker 进程；禁止启动、重启、kill 任何常驻服务。
- **禁止** 修改 `client/dist`（那是用户的构建产物）；需要构建验证时用 `--outDir` 输出到仓库外。
- **禁止** 修改 `tests/`（QA 与验收团队的装置与证据）。
- **禁止** 发真实外部 API（DeepSeek 等）；禁止写生产库 `exam_system`。
- 写者唯一：同一时刻只允许一个 Agent 写文件；A/C 为只读角色（仅可写自己的报告）。

## 2 不改清单（Agent B 绝对不得触碰）

| 项 | 依据 |
|---|---|
| B3-O2 页面级既有低对比（select placeholder、`.n-box-empty`、「×」、Doc 引文 4.44） | 入场包 §3：改前=改后，属既有；axe 不命中，需人工口径 |
| R-30 余量 31 处字号字面量（10/11/20/21/24/40/48px） | 入场包 §3：**有意不改**（改字号=改视觉） |
| `client/src/legacy-patch.css` 的 19 处 `!important` | 入场包 §4.5：旧内核降级层，按设计使用 |
| `client/src/styles/antd-theme.js` 中的原始令牌引用 | 入场包 §4.5：**主题桥**，不计业务债 |
| `client/src/views` / `components` / `router` / `App.vue` 的**视觉·交互·动效**改动 | `docs/refactor-architecture.md` 顶部铁律：须经 ui-guard 逐项对照，**本项目无 ui-guard 常驻**，故一律不动 |

> 无障碍类修复（aria/label/heading）**不属**上述禁令，但必须证明**零视觉变化**。

## 3 测量纪律（入场包 §5.2 七条陷阱 —— 本项目已因此产出过 5 次假结论）

1. 对比度必须**按层合成** `background-color` + `background-image`（渐变）。
2. 扫描正则必须**带词边界**（`color:` 会匹配 `border-color:`）。
3. **块级扫描而非行级**（`background` 与 `color` 常分处两行）。
4. 视觉回归以**像素 sha1** 为主判据（几何哈希会产生假阳性）。
5. **版本锚点**：产物必须满足 `served fp == 磁盘 fp == 对应 HEAD`；落后于被验提交的采样无效。
6. 静态扫描 CSS 自定义属性时，**`setProperty` 不是唯一注入途径**：对象式 `:style`（Vue `:style="{'--x': v}"`）同样能注入，且可能由**祖先注入、后代消费** → 判定"未定义/未引用"前必须同时排查 JS + 模板 + CSS。
7. **先冻结再测**：任何测量都不得直接读活工作树（实证：合并中读到未解完的冲突标记 → `SyntaxError`）。用 `git archive <commit>` 导出副本再测。
8. **`git status` 对"未跟踪目录"没有证据力**（round 1 由 Agent C 纠正）：`tests/`、`client/dist` 等**不在 git 跟踪内**（`git ls-files tests` = 0），改动它们时 `git status` 不会显示任何变化 —— 不能据此断言"没被触碰"。必须用**旁证**：`mtime` 对照改动时刻、`find -newermt`、或工作树指纹（`git diff | sha256`）。
9. **零引用令牌固定用「严格口径」**：**仅在 CSS 注释里被提及不计为引用**（round 1/2 反复出现 64 vs 62 的口径漂移，差额恒为 `--input-h`/`--table-row-h`）。任何报告给出零引用数时，**必须写明口径**。
10. **行号与计数一律以「冻结树实测」为准，不得采信上一轮报告里的数字**（实证：A 报 `SOURCE_EXTS` 43 项、实为 **37**；报 `collectFiles` 176-197、实为 **176-198** —— 后者若被照抄切片会产出**语法坏树**）。引用行号前先自己数一遍。
11. **计数必须带词边界**：`grep -c -- '--btn-default-bg'` 会子串命中 `--btn-default-bg-hover`（实测 2 vs 真值 1）。

## 4 测试口径（Agent C 必须按此执行）

- 命令：`cd server && DATABASE_URL="<测试库>" npm test`，其中测试库 URL 由 `server/.env` 的 `DATABASE_URL` **只替换库名**为 `exam_system_test` 得到（一键脚本：`bash docs/pipeline/scripts/unblock-g2.sh`）。
- ⚠️ 未指向 `exam_system_test` 时，`server/test/setup.js:35,52` 的白名单护栏会**立即退出码 1 且不打印任何 jest 摘要** —— 那不是崩溃。
- **全量口径 = 1011 例 / 67 套件 / 四段**（round 1 起）：
  段1 = **912**（除三个 tree-sitter 套件外的全部）· 段2 = `fact-extractor` **17** · 段3 = `rule-executor` **61** · 段4 = `rule-mutator` **21**。
- ⚠️ 四段用 `&&` 串联，**任一段失败即短路，后续段静默不跑** → 判定"全绿"前必须确认日志里有 **4 处** `Test Suites:` 摘要。
- **当前基线（round 1 起）= `0 failed / 1011 passed`**。历史：round 0 = `13 failed / 920 passed`（全在 `rule-mutator.test.js`，已反证为同进程污染并修复）。
- **任何一轮 failed > 0 即为回归**，必须回流 Agent B。
- 取证方式：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh`；脚本把 jest 输出重定向进 `test-round-NN.log`，**控制台只回显摘要** → 证据必须从日志取。

## 5 门禁判据（规范终止条件的本地化，见必改清单 G-7）

| 判据 | 达标线 | 复算 |
|---|---|---|
| 分层违规 | **0**，且"未分层待迁移"数不增（基线 47） | `node server/scripts/check-layers.mjs` |
| GodFile | **>800 行 = 超标**（基线 10 个）；>500 行 = 观察（基线 19 个） | `find server/src client/src -name '*.js' -o -name '*.vue' | xargs wc -l` |
| 硬指标（去注释） | hex(6) = **0**、`!important` = **0**、views 内 `Modal.confirm` = **0** | 入场包 §6 复算命令 |
| 后端回归 | failed ≤ baseline（**目标 0**） | §4 命令 |
| 无障碍 | 不得引入新的 axe 违规 | 页面集需含合并新增页（rule-quality / CheckerWizard） |
| 轮次上限 | **8 轮** | — |

> **像素复核的可执行形态（round 2 由 Agent C 纠正 Captain 的任务书）**：「亮/暗 × 舒适/紧凑 4 组像素 sha1 全等」**字面不可执行** —— `data-density` 是各 Layout **硬编码**（teacher=compact / student=comfortable / admin=compact），**没有全局密度开关**，同一路由无法在两种密度下渲染。
> 正确形态 = **每个主题各自做「改前 vs 改后」全等**（改前用 `git archive <commit>` 构建，改后活树构建），并满足两个前提：① 同源两次独立构建必须 **byte-identical**（`diff -rq` 0 行）才可用于判等；② **禁用** asset 文件名 / 字节哈希（源码一变 content hash 必变 → 假阳性）。
> 若确需"舒适/紧凑"两态对比，须先由实现侧提供可切换的密度机制（属功能变更，不在本流水线授权内）。

## 6 角色纪律

- **Agent A（`code-analyzer`，本仓约定 = 规范里的 `deep-code-analyzer`）**：纯只读；输出标准化修复清单（文件:行号 + 依据 + 改法 + 风险 + 验证方法）。
- **Agent B（`tech-code-refactoring`）**：只修清单内问题；**每轮最多 8 个文件**；不新增功能、不破坏架构、小步迭代、全程留痕。
- **Agent C（`tech-test-automation`）**：纯只读测试；缺陷分级；阻断 Bug 零容忍；精准定位。
- 一轮 = A 增量审查 → B 定点修复 → C 回归验证；C 发现阻断 Bug → 回流 B 重修；无阻断 → 回 A 复审 → 满足 §5 全部判据则终止。
- 每轮独立归档：`docs/pipeline/audit-round-NN.md` / `refactor-round-NN.md` / `test-round-NN.md`；**历史文件不再进入后续轮次上下文**。
- 状态唯一入口：`pipeline-status.md`（仓库根，≤30 行）。
