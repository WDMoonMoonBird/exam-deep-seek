# D 决策简报：5 项待拍板事项（一页可决策）

## 一句话结论 + 每项建议
- **总**：装置侧（R0 隔离实跑 + R1 确定性复算）已能自证；这 5 项都是**平台侧接线**的选择，按「先无迁移、后有迁移」推进。
- **1 冻结**：建议 **A 发布时快照**（实测迁移面极小：回填 31 行、待冻结题 3 道、进行中作业 2 个）；C 只作过渡开关；B 不解决公平性。
- **2 迁移执行**：建议 **只交代码 + 迁移脚本（人工执行）**；若授权维护窗口，需先备份并备回滚脚本。
- **3 并发**：建议 **新增 `dsh_grading_concurrency=1`，`ai_concurrency=64` 不动**；唯一风险是单作业 59 份突发被串行化。
- **4 凭据**：建议 **环境变量注入**（DSH 侧 env 优先级最高、天然不落盘）；`.credentials.yaml` 只保留为装置内短命投递。
- **5 PTC**：建议 **不开**（headless 默认 native）；一旦开，R0/R1 的"执行类工具不可用"结论全部作废，须重验 §5 的 6 条。

## 1 评分标准冻结：A 快照 / B 失效检测 / C 编辑拦截
### 1.1 已实测事实（只读复算，2026-10-11）
| 事实 | 数值 | 来源命令 |
|---|---|---|
| 题目总数 / 实训题（未删） | 32 / 5 | `SELECT COUNT(*) FROM questions ...` |
| 实训题有非空 rubric / rubric 去重数 | 3 / 3 | 同上 + `COUNT(DISTINCT scoring_rubric)` |
| checker_status：ready/none/review | 2 / 2 / 1 | `GROUP BY checker_status` |
| 作业（未删）/ 已截止 / 进行中 | 52 / 46 / 6 | `assignments ... end_time` |
| assignment_questions × 实训题：全部 / 已截止 / 进行中 | 31 / 29 / 2 | 三表 JOIN |
| **会被 C 拦截的题**（被已截止作业引用的在用实训题） | **3** | `COUNT(DISTINCT q.id)` |
| 实训题提交 / 已评分 / 已截止作业内已评分 / 教师定案 | 92 / 92 / 83 / 20 | `submissions JOIN questions` |
| 实训题提交的学生数 | 63 | `COUNT(DISTINCT student_id)` |
| 单作业最大提交数（突发） | **59**（assignment 311）、次 9、次 3 | `GROUP BY assignment_id ORDER BY c DESC` |
| 近 30 天实训题提交 | **0** | `submitted_at >= NOW()-30d` |
| prisma 迁移目录数 | 3 | `ls server/prisma/migrations` |

### 1.2 三方案代价对比
| 维度 | **A 发布时快照（建议）** | **B 失效检测** | **C 编辑拦截（过渡）** |
|---|---|---|---|
| 表/DDL | `assignment_questions` 加 3 列（`schema.prisma:226-237`，现 12 行）或新建快照表；**新迁移目录**（第 4 个） | 无 DDL | 无 DDL |
| 改文件（我数的） | `teacher/assignments.js`(399 行) 发布处 `:310-370`；`projectGrading.js`(713 行) `:459/488-493/520`；`projectReviewController.js` `:100/236/284`；`infrastructure/review/project.js:48`；`studentController.js:538` ⇒ **5 文件 ≈ 40-60 行** | `projectGrading.js:613-624` 写 `rubric_hash`；`utils/projectView.js`(98 行) 透出；读取方 1 处 ⇒ **3 文件 ≈ 20-30 行** | `teacher/questions.js:162-189` 前置查询 + 返回码 ⇒ **1-2 文件 ≈ 8-12 行** |
| 迁移/回填规模 | 回填 **31 行**（29 已截止 + 2 进行中）；历史提交**不动**（92 份分数不重算） | 回填 `rubric_hash` **92 行**（快照式写入，可空兼容） | 无 |
| 历史作业/分数影响 | 历史分数**逐位不变**；重评改为"按快照重算"，与当初一致 | 历史分数不变，但**已知会漂**；重评暴露 `stale` | 历史分数不变；**题被锁**（3 道） |
| 教师体验 | 改题库照常；已发布作业不受影响（改的是题库、冻结的是作业） | 改题库照常；重评时多一次"标准已变，需重造尺"确认 | 改这 3 道题会**被拒**（需先撤回作业） |
| 回滚 | 迁移回滚 = drop 3 列/表；代码回滚 = 读活值分支保留（`snapshot ?? live`） | 回滚 = 不读新字段即可（零 schema 风险） | 回滚 = 删前置校验（最快） |
| 不做的后果 | — | "标准已改、分数不变"的静默不一致（R0-A §2.2 已实测成因） | 教师误改导致 83 份历史分数与同批不可比 |

### 1.3 建议
- 先落 **C（1 个文件、8-12 行，只拦"已截止作业引用的题"）** 止血；同轮或次轮落 **A**（迁移面小、回填 31 行、历史分数不动）。
- **B 不单独采用**：它只把"静默"变"可见"，不改分数会变的事实；可作为 A 的兜底（快照缺失时的 stale 提示）。
- 拍板只需要一句：**A / B / C / 组合（C+A 推荐）**。

## 2 生产库迁移谁执行
| 选项 | 具体含义 | 代价 | 风险 | 回滚 |
|---|---|---|---|---|
| **只交代码 + 迁移脚本（建议）** | 我们产出 `prisma/schema.prisma` 改动 + 新迁移目录（第 4 个）+ 回填 SQL；由用户/运维择时执行 | 用户需执行 2 条命令（`prisma migrate deploy` 或等价 SQL + 回填） | 若忘记执行，代码与库不一致（读快照列报错）⇒ 需 `snapshot ?? live` 兼容分支 | 备份点 + 反向 SQL（drop 列/表） |
| 授权维护窗口执行 | 允许流水线在某窗口连库写入 | 需要放开"禁写生产库"铁律；窗口协调成本 | 无回滚演练时间；误写影响 1601 行 submissions | 依赖执行前 mysqldump |
- 规模说明（我实测）：仅动 `assignment_questions`（31 行相关）+ 回填 31 行；**不触碰** `submissions` 1601 行、`questions` 32 行。
- 建议：**只交代码 + 脚本**；铁律不放开。用户若选授权执行，请指定**备份命令**与**回滚脚本已就绪**两个前置。

## 3 `ai_concurrency=64`：降 / 共用 / 新增独立键
| 事实 | 值 | 复算 |
|---|---|---|
| `system_configs` 键 | 4 个（`ai_concurrency=64`,`deepseek_api_key`,`deepseek_model`,`deepseek_base_url`）；**无** `dsh_grading_concurrency` | 只读 SELECT |
| 实训题链路读哪个键 | `projectGrading.js:28/49/56-66/426` → `deepseek/config.js:47` 的 `getConcurrency()` = `ai_concurrency` | 行号已复核 |
| 编程题/旧链路 | `gradingWorker.js:24/253/258-265` 同一键 | 同上 |
| 突发规模 | 单作业最多 **59** 份（共 63 名学生） | 只读 GROUP BY |
| 近 30 天实训题提交 | 0 | 只读 |
| 内存实测（隔离 home，0 模型调用） | `--version` 49 MB / `--dump-config` 50 MB / **headless 挂载后 174.7 MB 峰值**；node 基线 40.9 MB | `ps -o rss=` 60ms 采样 |

**改动面（新增 `dsh_grading_concurrency`，默认 1）**：`deepseek/config.js:47`(+2 行新函数)｜`projectGrading.js:28/49/56-66/426`(≈10 行)｜`adminController.js:400/424/439/454-457/484`(≈8 行)｜可选 `system-config.repository.js:48`(2 行) ⇒ **4 文件 ≈ 20 行、无 DDL**（`system_configs` 是 KV，插 1 行即可）。
**风险**：① 实训题峰值并发 64→1：59 份突发下后到者排队，单份耗时不变（AI 调用本身 1 次/份）⇒ 总时长从"并发 59"变成"串行 59"，按单份 100-180s 量级估算最坏 ≈ 1.6-3 小时（**估算**，单份耗时需按目标机实测校准）；② 与"提交即评"语义叠加：教师点重评时若 1 个会话在跑，会排队；③ 若同时引入 DSH 批改，**会话内存 175 MB/个**是硬约束（见下）。
**2C4G 内存账**：4 GiB = 4096 MiB；DSH 会话实测地板 **175 MiB/会话** ⇒ 并发 1 占 4.3%、并发 2 占 8.5%。MySQL/Express 两项本机**无法核验**（禁止起仓库进程），请在目标机跑：
`ps -o rss= -p $(pgrep -f 'src/app.js') $(pgrep -f 'src/worker.js') $(pgrep -x mysqld)`（单位 KB，三者之和 + 175×并发 = 占用水位）。
**建议**：新增独立键、默认 1；`ai_concurrency` 保持 64（编程题不受影响）。**不决定的后果**：DSH 批改与实训题 AI 评分共用一个 64 的闸 ⇒ 2C4G 上并发打满即 OOM 风险。

## 4 DSH 凭据注入方式
| 维度 | **环境变量（建议）** | `$DSH_HOME/.credentials.yaml` |
|---|---|---|
| 机制 | 平台 spawn 时注入 `DEEPSEEK_API_KEY`；DSH 优先级 **env（最高，只读）> `.credentials.yaml` > cwd/.env > `$DSH_HOME/.env`** | 写文件 + `chmod 600`，运行后删 |
| 失败模式 | ① 忘记注入 ⇒ 启动即失败（**失败快、可判**）② 环境被 `env`/崩溃转储打印（**需日志纪律**）③ 轮换需重启 runner | ① 异常退出未删 ⇒ 明文残留（需 trap + 扫描）② 权限被复制时丢失 ③ 与 env 同时存在时**文件被静默忽略**（优先级低，易误判） |
| 运维代价 | 0 额外文件；密钥生命周期由平台掌管 | 每次运行写/删 1 文件；回收站/备份/快照可能留存 |
| 本仓现状（只读核对） | 装置 `lib.sh:121` 已支持 env 优先；`:183-194` 仍把 key **写入**隔离 home 的 `.credentials.yaml`（chmod 600），`:198-202` 退出即删；`:219-239` 有泄漏扫描 | 同上，属"装置内部投递" |
**建议**：平台侧一律 **env 注入**；装置内部保留"写文件"仅因为 DSH 需要文件层，且已有 trap 删除与扫描。**不决定的后果**：落在磁盘上的明文 key 与"仓库/日志零明文"纪律冲突，审计时无法自证。

## 5 是否开 PTC / 代码模式
| 已实测事实 | 内容 |
|---|---|
| headless 默认 | `dsh-tools` Config：`mode: z.union(["native","ptc","both"]).default("native")`；headless 组合里 `id: tools` 的 `mode` 取 `process.env.DSH_TOOLS_MODE` ⇒ **未设环境变量 = native（现状）** |
| 运行时行 | headless 组合含 `ptc-runtime`、`workflow-ptc`（未 disabled）⇒ 能力已挂载，**是否暴露取决于 mode** |
| PTC 提示词原文 | `run_code` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.（说明：PTC 下模型拿到**程序面**） |
| 本机 desktop 形态 | 桌面 profile 的 `agent-preset-registry.selectedDefault: ptc`（`~/.dsh/profiles/desktop/cordis.patch.yml:74-78`）⇒ 桌面是 preset 形态 |
| one-shot 兼容性 | headless 的 `--session-id` 接管会拒绝 preset 会话（`assertAdoptable`：session runs under agent preset … does not compose）⇒ **PTC(preset) 会话无法被 headless 接管续跑** |

**开了之后必须重验（作废清单）**：① R0 的"禁 `tool-bash`/`tool-jobs` ⇒ 执行类工具不可用"结论（B/C 的 canary 结论同批作废）；② "禁工具行 = 连 schema 都看不到"是否在 PTC 程序面内仍成立（**关键未知**：`Reach every tool the SDK declares` 意味着程序内可能仍有通道）；③ `ptc-runtime` worker 是否可 `child_process`/文件写越界（触碰"不执行学生代码"铁律）；④ 内存地板（多一个 worker 进程，本机未测）；⑤ 隔离归因（多进程写入面的变化）；⑥ `--session-id` 续跑路径（preset 不兼容）。
**不开的代价**：模型只能逐个调用原生工具（读文件/写结果），拿不到"程序化批量处理"；对批改场景 **无实质损失**（量尺是确定性执行器的活，造尺只需读写文件）。**建议**：保持 native；若确需 PTC，先按上表 6 条重验并**单独起一个 profile**，不要改 grader 默认。

## 6 复算命令清单（本简报每个数字的来源）
1. 数据量：`node /tmp 脚本` 只读 `SELECT COUNT(*)`（questions/assignments/assignment_questions/submissions 四表 JOIN，全部 `LIMIT` 或聚合）；输出见本文件 §1.1 表。
2. 行号：`grep -n` + `wc -l`（`projectGrading.js` 713｜`questions.js` 242｜`assignments.js` 399｜`projectView.js` 98｜`schema.prisma` 481）。
3. 内存：`DSH_HOME=/tmp/<隔离> dsh --profile headless --session-id <不存在> x` 期间 `ps -o rss= -p <pid>` 60ms 采样取峰值 = 174.7 MB；同一命令 `--version` = 49 MB。
4. 凭据优先级：`@deepseek-ai/dsh-credentials-local` 文件头注释（asar 内，只读）；装置侧 `lib.sh:121/183-194/198-202`。
5. PTC：`dsh-tools` Config 默认值 + `--dump-config` 组合树（`id: tools`/`ptc-runtime`）+ 桌面 profile 补丁 `:74-78`。
6. 本轮未做：任何写库、任何代码/脚本改动、任何模型调用、任何生产进程启动。
