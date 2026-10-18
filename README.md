# Deadpan 判题

<p align="center">
  <img src="./学习中.svg" width="120" alt="Deadpan 判题" />
</p>

<h1 align="center">Deadpan 判题</h1>

<p align="center">面向计算机类课程的 AI 评分平台 —— 从建题到成绩发布，一学期的作业收进一个控制台</p>

<p align="center">
  <a href="https://deadpan.asia/exam/doc">📖 使用文档</a>
  ·
  <a href="https://deadpan.asia/exam/login">🚀 在线体验</a>
  ·
  <a href="https://gitee.com/WD_MoonMoonBird/exam-deep-seek">🐴 Gitee</a>
</p>

<p align="center">状态：生产运行中 · 2026-10</p>

---

## 为什么是它

- **三种题型，三条评分链路**：客观题纯函数判分；编程题由评分 Worker 调大模型；实训工程包走「作业级造尺 + 确定性量尺」。
- **实训题不是「把代码丢给大模型」**：LLM 只负责把评分标准翻译成可执行规则（尺子），计分由确定性执行器完成 —— 同一把尺子量同一份代码，结果逐位可复现，量尺阶段零 token。
- **发布是唯一放分开关**：AI 分数与评语在教师审核发布前不会到达学生端；实训题评语必须由教师显式填写，绝不自动透传。
- **一份 Vue 代码，五种外壳**：桌面 Web、移动 Web（`/m`）、Android、macOS、Windows；Chrome 69 也能跑，Monaco 运行时本地化，校园网断外网仍可作答。

## 功能总览

### 按角色

| 角色 | 能力 |
| --- | --- |
| **教师** | 班级与学生管理（批量导入、重置口令、多校切换）· 题库（编程题 / 客观题 / 实训题）· AI 试卷解析 · AI 参考答案 · 布置作业（时间窗、重交次数、计分口径、答案可见性）· 评分审核（逐份 / 批量 / 改分 / 发布 / 导出 / 失分项分布）· 教学团队共享班级 · 实训题三栏审核与重评 |
| **学生** | 作业列表与详情 · 倒计时 · 草稿自动保存 · Monaco 在线编码 · 客观题作答 · 实训工程包上传与历史版本回看 · 发布后查看成绩与教师评语 |
| **超级管理员** | 学校（院校代码）/ 班级 / 教师 / 学生管理 · AI 配置（模型、地址、Key、并发、价目表）· 服务器监控（PM2、系统、日志脱敏）· 批改记录（运行、用量、日志）· 任意班级实训题重评与改分 |

### 按题型与评分方式

| 题型 | 学生提交物 | 评分方式 | 教师动作 |
| --- | --- | --- | --- |
| **客观题** | 选项 / 判断 / 填空 | 评分 Worker 轮询 → 纯函数判分（零 LLM）；多选支持部分给分 | 抽查、改分、发布 |
| **编程题** | 单文件代码（可含多小题） | 评分 Worker 轮询 → DeepSeek 评分 → `ai_graded` | 审核、改分、发布 |
| **实训题** | 完整工程 zip（≤50MB） | 作业截止后 DSH 作业级批改：造尺 / 复用尺子 → 确定性量尺 | 三栏审核、重评、发布 |
| **开放实训题** | 工程 zip（无标准包） | 截止后 LLM 评价式评分（无标准答案段） | 同上 |

### 作业三开关

| 开关 | 取值 | 编程题默认 | 实训题默认 |
| --- | --- | --- | --- |
| 重复提交 | 允许 / 次数上限（`maxAttempts`） | 允许、不限次 | 允许、1 次 |
| 计分口径 | 取最高 `best` / 取最后 `last` | 取最高 | 取最后 |
| 答案可见性 | 评分完成即可见 `immediate` / 发布后可见 `after_publish` | 提交后可看 | 发布后可见 |

> 教师定案分 `finalScore` 是权威值，任何计分口径都不会覆盖它。历史作业未配置时按「取最后 / 发布后可见」读取，行为不变。

### 其他教学能力

- **AI 试卷解析**：上传 `.docx` / `.xlsx` / 粘贴文本，SSE 流式返回解析进度，自动拆题、识别题型与语言（单次上限 8 万字）。
- **AI 参考答案**：按题目材料与评分标准生成参考实现，教师可改。
- **实时推送**：评分完成经 WebSocket 推送，学生端/教师端无需轮询刷新。
- **成绩导出**：按班导出成绩与答案；**失分项分布**按班聚合，定位共性薄弱点。
- **教学团队**：多教师共享班级，团队内可见同一批作业与提交。
- **多学校**：一个部署服务多所院校，学号按 `学号@院校代码` 隔离；教师可切换所属学校。

## 业务流程

### 主流程

```text
建题 ──→ 布置作业 ──→ 学生作答/提交 ──→ 评分 ──→ 教师审核 ──→ 发布 ──→ 学生可见
 │           │              │              │           │
 │           │              │              │           └─ 批量审核 / 改分 / 导出 / 失分分布
 │           │              │              └─ 客观题：纯函数
 │           │              │                 编程题：Worker + LLM
 │           │              │                 实训题：DSH 造尺 + 零 LLM 量尺
 │           │              └─ 草稿自动保存 / 截止与次数校验 / 实训包版本化
 │           └─ 三开关：重交次数 · 计分口径 · 答案可见性
 └─ AI 试卷解析 / AI 参考答案 / 评分标准分项
```

### 1. 建题

教师选择题型，填写材料、评分标准与分项。编程题支持「一大题 + 多小题」；客观题支持选择、多选、判断、填空混合；实训题需上传标准工程包（服务端安全解压、按题目隔离存放）。

### 2. 布置作业

选择题目与班级、设置起止时间与三开关。发布时冻结评分标准与材料快照（`rubric_snapshot` / `material_snapshot` / `standard_hash`），后续改题不会改变已布置作业的评分依据。

### 3. 学生作答

编程题在 Monaco 中编写，草稿自动保存；客观题直接作答；实训题上传工程 zip。每次实训提交生成**新版本目录**，历史版本永不覆盖，学生可回看。提交受截止时间、重交次数、作业锁定三重约束。

### 4. 评分

```text
客观题  学生提交 ──→ Worker 轮询 ──→ 纯函数判分 ──→ ai_graded
编程题  学生提交 ──→ Worker 轮询（status=submitted）──→ DeepSeek ──→ ai_graded
实训题  学生提交 ──→ 仅入库（submitted，不评分）
                        │
                        ▼ 作业截止
                  dueAssignmentScanner 建 job
                        │
                        ▼
                  dsh-grader-worker：造尺 / 复用 → 量尺 → 回写 ai_graded
```

### 5. 审核与发布

教师在「评分审核」中按班查看进度，逐份核对 AI 分数与分项，可改分、填写评语、批量审核、批量发布。**只有 `published` 状态的学生端才下发分数与评语**；已发布提交再次改分时保持 `published`，学生即时看到新分。

### 提交状态机

```text
draft ──→ submitted ──→ ai_graded ──→ reviewed ──→ published
             │              │             │
             │              │             └─ 教师审核（可改分 / 写评语）
             │              └─ AI/规则评分完成
             └─ 已提交，等待评分（学生端只显示"已提交，待评分"）
```

实训题在 `answer` 字段内维护版本信封（`currentVersion` / `history` / `grading.state`），评分任务态为 `pending → grading → done / failed`；失败不向学生暴露细节，教师可一键重评。

## 实训题：为什么"造尺"

### 问题：LLM 直评不稳定

同一份工程连续 5 次 LLM 直评，**同分率 0%**（标准差 0.45–7.66），与确定性评分的平均绝对偏差 10.64；生产观测中同代码波动可达 ±22~35 分。对课程成绩而言，这不可接受。

### 方案：LLM 只造尺，计分交给代码

```text
标准工程包 ─┐
评分标准   ─┼─→ content_key = sha256(标准包 + 评分标准 + 题目描述)
题目描述   ─┘          │
                       ├─ 已有 ready 尺子 ⇒ 直接复用（跨班 / 跨教师，零 LLM）
                       └─ 没有          ⇒ 造尺一次：
                                            LLM 生成 JSON 规则
                                            → 标准包上跑满分校准（≤3 轮）
                                            → 负例变异验证（标准包 Pass / 缺陷变体 Fail）
                                            → 固化 checker_id + 原始字节
                       ▼
              确定性执行器量尺（零 token / 零波动）
```

一把「尺子」= 一份 JSON 规则 + 内容指纹 + 冻结的标准包/评分标准哈希。规则原语 11 种：`file_exists`、`dir_contains_file`、`contains_text`、`count_regex`、`contains_regex`、`file_count_in_dir`、`syntax_check`、`fact`、`ast_pattern`、`count_imports`、`normalized_text`。评分标准的分项会先分为**确定性 / 半自动 / 主观**三类：确定性项必须生成客观规则，主观项交给 LLM（温度 0），半自动项允许混合。

- **同码同分**：规则 + 工程不变 ⇒ 分数恒定。作业 311 的 59 人重评实测：3 个文件组 → 90 / 90 / 65，组内零波动。
- **历史分不可变**：作业与尺子的绑定写入 `assignment_question_rulers`；改评分标准只会让**新布置**的作业造新尺，老班级分数不重算。
- **零 LLM 量尺**：尺子就绪后，N 份提交只跑本地执行器；复用命中时实测 `MODEL_CALLS=0`。
- **fail-closed**：尺子不合格、标准包哈希不符、物料缺失、装置超时 —— 一律不写分，留痕待重评，绝不"带病出分"。

截止扫描器只挑「已截止、恰好一道实训题、有发布快照」的作业（默认 7 天回看、60 秒扫描间隔），每个作业最多自动跑一次；失败不自动重试，需显式重评。

> 诚实边界：尺子保证的是**结构合规、可复现、可审计**，不保证绝对分数"正确"。最终分仍由教师终审；造尺质量依赖模型（见「已知限制」）。

### 批改流水线与观测

| 表 | 作用 |
| --- | --- |
| `grading_jobs` | 批改任务；活动态每作业至多一行（DB 生成列 + 唯一索引强制） |
| `grading_job_runs` | 每次运行摘要：测量/不可测量/写入数、退出码、归档目录、日志尾部 |
| `grading_run_usage` | 模型调用数、token、缓存命中、费用（按价目表折算） |
| `grading_rulers` | 内容指纹 → 尺子（全局唯一，跨班/跨教师复用） |
| `grading_summaries` | 自然语言总评缓存（内容变化即自然失效） |

管理端「批改记录」可查看运行列表、详情、日志与用量；教师端可按班查看失分项分布。并发闸 `dsh_grading_concurrency`（单位=会话数，默认 1）与编程题的 `ai_concurrency`（单位=模型调用数，默认 16）彼此独立。

> 教师端「自动评分器」入口当前由 `FEATURE_CHECKER_ENTRY = false` 隐藏（2026-10-14 决策：功能暂缓、代码与接口保留）。造尺由截止扫描器或运维流程触发。

### 防泄漏设计

- 标准包物理隔离：学生侧路由不可达，静态目录由 `projectAssetGuard` 整体封禁。
- 学生视图字段白名单：`aiScore` / `aiFeedback` / `grading` / 物理路径永不下发；`ai_graded` 对学生映射为 `submitted`。
- 实训题 AI 评语不自动透传：教师必须显式填写评语才能审核通过。
- AI 提示词使用随机 nonce 围栏包裹教师数据，防提示注入提前闭合。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3.5 · Vite 8 · Ant Design Vue 4 · Monaco Editor 0.55 · Pinia · Socket.IO Client |
| 移动端 | 独立 `/m` 设计系统（31 条路由）· Capacitor 6（Android 壳） |
| 桌面端 | Electron 44（macOS / Windows，独立分支 `feat/desktop-shell`） |
| 后端 | Node.js ≥20 · Express 5 · Prisma 5 · MySQL 8 |
| AI | DeepSeek（OpenAI 兼容接口），默认 `deepseek-v4-flash`；造尺默认 `deepseek-chat` |
| 实时 | Socket.IO 4 |
| 代码分析 | tree-sitter（JS/TS/Vue、Java、Python）· 自定义规则执行器 |
| 部署 | Nginx（TLS / CSP / 边缘限流）+ PM2 + systemd（DSH worker） |

### 代码结构

```text
client/                      Vue 3 前端（桌面 + 移动）
  src/views/                 教师 / 学生 / 管理员 / 登录 / 文档
  src/mobile/                /m 移动端（独立布局、组件、路由、设计令牌）
  src/composables/           页面逻辑（作业、答题、审核、项目工作区）
  src/components/            Monaco、文件树、评分器向导、手册演示
  src/api/request.js         唯一 axios 实例：token / schoolId 注入、错误规范化

server/
  src/interface/             HTTP 控制器与只读路由（薄）
  src/application/           用例编排（提交、审核、题目）
  src/domain/                纯领域规则（计分口径、可见性、白名单、规则原语）
  src/infrastructure/        Prisma、AI、DSH、队列、限流、存储、通知
  src/routes/                路由装配
  prisma/                    schema + 15 个迁移

docs/                        架构、PRD、DSH、移动端、桌面端、测试文档
scripts/dsh-grader/          DSH 隔离实跑装置
scripts/dsh-checker/         确定性量尺执行器与校验
```

**分层门禁**：`domain` 不依赖任何 npm / Node 内置；`application` 不依赖基础设施实现；`interface` 不直接 import `infrastructure`。`npm run check:layers` 当前 194 个文件、0 违规（41 个历史文件尚未分层）。

### 工程规模

| 指标 | 数量 |
| --- | --- |
| 服务端源码 | 约 27,000 行 JS |
| 前端源码 | 约 39,000 行（`.vue` / `.js`） |
| REST 端点 | 约 105 个 |
| 数据表 | 29 个 Prisma model / 15 个迁移 |
| 自动化测试 | 187 个测试文件、约 1,750 条用例 |

## 安全设计

### 身份与权限

- **JWT**：固定 `HS256`（签发与校验都显式指定算法，拒绝 alg 混淆 / none）；密钥缺失、过短或命中弱值直接拒绝启动（生产 ≥32 字符）。
- **令牌失效**：改密 / 重置写入 `password_changed_at`，早于该时刻签发的令牌下一次请求即 401（秒级边界，最多 1 秒窗口）。
- **首登强制改密**：教师与管理员账号使用一次性随机口令并置 `must_change_password`；鉴权出口统一拦截，仅放行改密端点。学生初始口令由部署方的初始化策略生成，建议首次登录后立即修改（见「已知限制」）。
- **角色与租户**：`super_admin` / `teacher` / `student` 三角色；学校、班级、团队三层归属。教师端的提交 / 审核 / 导出类按 id 直取入口都收敛到「可见班级」集合，越权一律 403 且零写入。
- **多校登录**：学号为 `学号@院校代码`；纯学号命中多校时先校验口令再返回学校列表，避免账号枚举。

### 登录防护

- **三维限流**：`ip:<ip>`、`acct:<username>@<schoolCode>`、`acct#global:<username>` 三键并存，任一命中即拦；成功登录只清账号维度，IP 维度保留失败累积。
- **全局熔断**：跨 IP 的密码喷洒由全局失败速率守卫兜底（默认 300 次/分钟，可 env 调整），只短时熔断登录端点，不锁账号。
- **统一文案**：用户名不存在、口令错误、账号不存在均为「用户名或密码错误」；非字符串口令归一为 400，确保进入限流计数。
- **边缘限流**：Nginx 对 `/exam/api/` 与登录端点分别设粗粒度兜底，阈值远宽于应用层，只挡洪水。

### 网关与传输

- Node 只监听 `127.0.0.1`，公网流量必须经 Nginx；TLS 1.2/1.3、HSTS、HTTP→HTTPS 跳转。
- 安全响应头集中在 `security-headers.inc`（CSP / HSTS / nosniff / XFO / Referrer-Policy / X-Robots-Tag），任何自带 `add_header` 的 location 必须 include，避免 Nginx「就近覆盖」导致六条头同时丢失。
- CSP 默认 `report-only`；线上由 Nginx 下发，可按部署阶段切换为 enforce；策略串与 `middleware/csp.js` 保持同步。
- 教师 / 学生 / 管理路径下发 `X-Robots-Tag: noindex`；`.map`、未知路径、内部回调端点一律 404。

### 上传与解压

- 单包上限 50MB、仅 `.zip`；上传前浏览器端先剔除 `node_modules` / 构建产物 / 二进制文件，体积通常降到几 MB。
- 服务端 `extractZipSafely`：Zip-Slip 路径穿越校验、GBK 中文文件名智能解码（UTF-8 严格 → GBK → latin1）、文件数 ≤2000 / 展开 ≤200MB / 层级 ≤20、符号链接跳过、失败整包回滚。
- 内容层过滤：魔数识别 + 8KB NUL 采样，依赖与二进制不落盘。
- `/uploads` 静态服务前挂 `projectAssetGuard`：标准答案、学生提交、项目工作区整目录封禁；解码 + 点段消解，封堵 `%2e` / `%252e` / 反斜杠绕过。

> **前端先过滤依赖**：学生工程常带 180MB+ 的 `node_modules`，浏览器端先剔除依赖 / 构建产物 / 二进制，只重打包纯代码（通常几 MB）。收益：上传与落盘体积降 90%+；依赖不落盘，缩小解压攻击面；AI / 规则只看业务代码；自部署用几 MB 小包即可走通全流程。

### AI 与评分面

- **密钥不回显**：管理端只返回「已配置 / 未配置」布尔，日志只打印长度。
- **SSRF 防护**：AI Base URL 落库前校验，禁止指向内网 / 云元数据。
- **内部回调**：`/api/internal/graded` 需共享密钥（生产 ≥32 字符）+ `timingSafeEqual`；仅接受无代理头的回环直连，Nginx 侧该前缀直接 404。
- **提示注入**：教师数据用 CSPRNG nonce 围栏包裹，禁止固定围栏被提前闭合。
- **输出约束**：评分结果强制结构化（总分、分项、优点、问题、总评），截断 / 越界在写入前钳制。

### 数据与日志

- 发布快照冻结评分标准与材料，历史成绩可复算；尺子绑定保证「当时的分对应当时的尺」。
- 日志按天落盘（`server/logs/app-YYYY-MM-DD.log`），请求日志**不记录原始 query**（只记 path、键名集合与 query 哈希）；PM2 日志回传前脱敏、限体积。
- 500 响应统一固定文案，内部细节只进日志，不随响应外泄。

## 多端与多系统适配

### 一份代码，多种外壳

| 端 | 形态 | 入口 | 说明 |
| --- | --- | --- | --- |
| **桌面 Web** | 浏览器 SPA | `/exam/` | 主力形态；教师 / 学生 / 管理全功能 |
| **移动 Web** | `/m` 独立设计系统 | `/exam/m` | 31 条业务路由；学生答题 / 成绩，教师审核 / 布置；无管理端 |
| **Android** | Capacitor 6 WebView 壳 | APK 1.1 | 远程加载 `/exam/m`，改 Web 当天生效；Android 7.0+ |
| **macOS** | Electron 44 桌面壳 | DMG 0.1.2 | 本地 dist + 固定端口 loopback 反代；macOS 13+ / Apple Silicon |
| **Windows** | Electron 44 桌面壳 | EXE 0.1.2 | Windows 10+ / x64 |
| **iOS** | 移动 Web（未出原生包） | `/exam/m` | Safari 可用；原生包待 Gate 评估 |

安装包统一由站点 `/exam/download/` 分发，欢迎页按 UA 自动推荐当前系统。

### 浏览器兼容

- **Chrome ≥ 69**：Vite legacy 双构建（现代包 + legacy 包），`terser` 压缩规避 legacy chunk 在旧内核的 CSS-in-JS 崩溃。
- **Monaco 本地化**：`monaco-editor/min/vs` 作为本站资产提供（`/exam/monaco/vs`），构建产物不含任何 CDN 串；Chrome <88 走 vendored 0.24 兼容分流。校园网无外网时编辑器仍可用。
- **离线友好**：不依赖外部字体 / 图标 / CDN；主题首帧由内联 ES5 脚本决定，避免暗色闪白。

### 多学校 / 多租户

- `schools.official_code` 唯一；学生账号为 `学号@院校代码`，天然按校隔离。
- 教师可属于多校（`teacher_schools`），前端切换学校后所有请求自动带 `schoolId`。
- 班级可见性 = 直接班级 ∪ 团队班级；所有审核、导出、失分分布入口都收敛到该集合。

### 多语言代码

- 编辑器按 40+ 后缀映射语言（Java / Python / JS / TS / Vue / C / C++ / C# / Go / Rust / PHP / SQL …）。
- 规则引擎内置 JS/TS/Vue、Java、Python 的解析与事实提取；其他语言可正常提交和 AI 评分，但不参与语言级规则判定。
- 实训包过滤按路径 + 魔数 + NUL 采样识别二进制，跨平台（含 Windows GBK 打包）可用。

### 部署拓扑

```text
浏览器 / 移动端 / 桌面壳
          │ HTTPS 443
          ▼
┌──────────────────────────────────────────────┐
│ Nginx                                        │
│  TLS · HSTS · CSP · 边缘限流 · 错误页        │
│  /exam/            → client/dist（SPA）      │
│  /exam/api/        → 127.0.0.1:<PORT>        │
│  /exam/socket.io/  → 127.0.0.1:<PORT>        │
└──────────────────────────────────────────────┘
          │
          ▼
   Express（仅回环监听）
     ├── MySQL 8（Prisma）
     ├── exam-worker（PM2）        编程题 AI 评分
     └── dsh-grader-worker（systemd）实训题造尺 / 量尺
```

> 端口以部署为准（开发默认 3000；生产由 Nginx upstream 与 `PORT` 决定）。

## 快速开始

### 前置要求

- Node.js ≥ 20（推荐 22 LTS）
- MySQL 8
- 一个 DeepSeek API Key（评分 / 解析需要）

### 本地启动

```bash
# 1. 克隆
git clone https://gitee.com/WD_MoonMoonBird/exam-deep-seek.git
cd exam-deep-seek

# 2. 配置后端环境
cp server/.env.example server/.env
# 必填：DATABASE_URL、JWT_SECRET（生产 ≥32 / 开发 ≥16）、INTERNAL_SECRET（生产 ≥32 / 开发 ≥16）、DEEPSEEK_API_KEY
# 可选：BOOTSTRAP_ADMIN_PASSWORD（仅当 admin 不存在时用于首次建号）

# 3. 安装依赖
cd server && npm ci
cd ../client && npm ci
cd ..

# 4. 建表（务必用迁移；schema 含 Prisma 无法表达的生成列，不要用 db push）
cd server && npx prisma migrate deploy && cd ..

# 5. 启动后端（http://localhost:3000，仅回环）
cd server && npm run dev

# 6. 另开终端：评分 Worker（不启动则客观题、代码题都会停在「待评分」）
cd server && npm run worker

# 7. 另开终端：前端（http://localhost:5173/exam/）
cd client && npm run dev
```

首次访问：若配置了 `BOOTSTRAP_ADMIN_PASSWORD`，用 `admin` + 该口令登录并立即改密；否则需先在数据库创建管理员。

### 生产构建

```bash
cd client && npm run build          # 产物 client/dist（含 monaco/vs）
cd ../server && npx prisma migrate deploy
pm2 start ecosystem.config.cjs      # exam-server + exam-worker
```

实训题的自动批改还需部署 `dsh-grader-worker`（依赖 `dsh` CLI 与导出物料），见 [`docs/dsh/deploy/README.md`](docs/dsh/deploy/README.md)。不部署时，教师仍可手动重评（有尺走确定性链路，无尺走 LLM 兜底）。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | MySQL 连接串；跑测试时必须指向独立库 `exam_system_test` |
| `JWT_SECRET` | 是 | 生产 ≥32、非生产 ≥16；已知弱值直接拒启 |
| `INTERNAL_SECRET` | 是 | 评分 Worker → 主进程回调密钥；生产 ≥32 |
| `DEEPSEEK_API_KEY` | 评分需要 | 可在管理端覆盖（DB 优先） |
| `DEEPSEEK_MODEL` | 否 | 默认 `deepseek-v4-flash` |
| `DEEPSEEK_BASE_URL` | 否 | 默认 `https://api.deepseek.com` |
| `BOOTSTRAP_ADMIN_PASSWORD` | 否 | 仅当 `admin` 不存在时建号，绝不改现存账号 |
| `PORT` | 否 | 默认 3000 |
| `TRUST_PROXY` | 否 | 默认信任 1 层 Nginx |
| `CORS_ORIGIN` / `SOCKET_CORS_ORIGIN` | 否 | 逗号分隔的允许来源 |
| `INTERNAL_ALLOWED_IPS` | 否 | 允许直连内部回调的 Worker 主机（回环始终放行） |
| `CSP_MODE` | 否 | `off` / `report-only`（默认）/ `enforce` |
| `LOG_LEVEL` | 否 | 默认 `info` |
| `DSH_GRADING_CONCURRENCY` | 否 | DSH 会话并发，默认 1（也可在管理端配置） |
| `DEEPSEEK_RULES_MODEL` | 否 | 造尺模型，默认 `deepseek-chat` |
| `WORKER_ENABLE_PROJECT_SCAN` | 否 | legacy 体系 B 项目扫描，默认关闭 |
| `GRADING_MODE` | 否 | `legacy`（默认）/ `trustjudge`（可选 Python sidecar） |

## 测试

服务端共 187 个测试文件、约 1,750 条用例，分单元 / 集成 / E2E 三层。

```bash
# 1. 准备独立测试库（不要用主库！）
mysql -uroot -p -e "CREATE DATABASE exam_system_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. 对齐 schema
cd server
DATABASE_URL='mysql://user:pass@localhost:3306/exam_system_test' npx prisma migrate deploy

# 3. 运行
DATABASE_URL='mysql://user:pass@localhost:3306/exam_system_test' npm test

# 分层门禁 / 单测 / 集成 / E2E
npm run check:layers
npm run test:unit
npm run test:integration
npm run test:e2e
```

> **测试库护栏**：`test/setup.js` 会批量清理学生与提交数据，只允许库名精确等于 `exam_system_test` 时执行；其他库直接中止进程。这是防止误清非测试库的硬性约束，请勿放宽。
>
> `npm test` 已内置三段式进程隔离（tree-sitter 原生模块不适合多套件复用），不要改成单次全量跑。

## 部署要点

- **Nginx**：以 `nginx-exam.conf` + `security-headers.inc` 为模板；CSP 单一真源在 Nginx，应用侧生产建议 `CSP_MODE=off` 避免双头。
- **上传上限**：仓库模板 `client_max_body_size 12m` 是按 JSON 10MB 对齐的；启用 50MB 工程包上传时须调到 ≥50m，否则会在边缘先收到 413。
- **静态路径**：SPA 外壳只对 `/login`、`/doc`、`/change-password`、`/teacher`、`/student`、`/admin`、`/m` 等已知前缀回退；未知路径返回 404，不做软 200。
- **单实例**：提交串行锁、限流器、DSH 会话闸都是进程内/单机语义；多实例部署需外置锁与共享限流。
- **Android 壳**：`client/capacitor.config.json` 写死远程加载地址；域名 / 证书变更时需同步并重新打包 APK。
- **桌面壳**：源码在 `feat/desktop-shell` 分支，主分支只保留下载入口；发版前需先合并主分支安全修复再重建。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`DESIGN.md`](DESIGN.md) | 设计系统（Apple 风格：色彩、字体、间距、组件） |
| [`docs/ARCH-工程项目批改.md`](docs/ARCH-工程项目批改.md) | 实训题模块架构与数据流 |
| [`docs/PRD-实训题流程定义.md`](docs/PRD-实训题流程定义.md) | 实训题需求与流程裁定（Q1~Q12） |
| [`docs/dsh/AUTO-FLOW.md`](docs/dsh/AUTO-FLOW.md) | 截止自动造尺 / 复用 / 回写全流程 |
| [`docs/dsh/方案-尺子内容化与运行监测.md`](docs/dsh/方案-尺子内容化与运行监测.md) | 内容指纹、尺子复用、运行监测 |
| [`docs/dsh/deploy/README.md`](docs/dsh/deploy/README.md) | DSH worker 部署、运维约定、故障处置 |
| [`docs/mobile-app/README.md`](docs/mobile-app/README.md) | 移动端设计稿与 v1 实现契约 |
| `feat/desktop-shell` 分支 `docs/desktop/` | Electron 桌面端方案（形态 B2，主分支暂未合入） |
| [`docs/test-baseline.md`](docs/test-baseline.md) / [`docs/test-strategy.md`](docs/test-strategy.md) | 测试基线与策略 |
| [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) | 规则驱动评分的遗留问题与运行备忘 |
| [`docs/教师操作指南.md`](docs/教师操作指南.md) | 教师端操作手册 |

## 已知限制

- **造尺质量依赖模型**：n=6 的真实实跑中，首版通过率 33%、K=1 重造后最终成功率 83%、fail-closed 17%（样本小，仅作量级）。失败不会自动重试，需教师或运维显式重评。
- **「同码同分」不等于「绝对正确」**：尺子保证可复现、结构合规、可审计；分数是否贴合教学意图仍需教师终审。
- **自动评分器入口隐藏**：教师端按钮由 `FEATURE_CHECKER_ENTRY = false` 关闭；后端接口、规则生成与回滚能力完整保留。
- **学生初始口令需首次登录后修改**：当前初始化流程未强制学生改密；随机口令 + 首登强制改密的代码已具备，建议正式上线前启用。
- **单实例假设**：进程内限流、提交锁、DSH 会话闸不支持多实例横向扩展。
- **CSP 尚未完全收紧**：受构建期内联脚本与 Ant Design Vue 特性探测约束，当前为兼容策略；完全收紧需构建期 nonce/hash 改造。
- **移动端无管理端**：`/m` 只覆盖学生与教师；超管访问会提示使用电脑端。
- **iOS 未出原生包**：Safari 可用移动 Web；原生壳待评估。
- **legacy 体系 B 保留**：`ProjectSubmission` 旧链路仍在代码中，Worker 扫描默认关闭（`WORKER_ENABLE_PROJECT_SCAN`）。
- **测试需独立库**：主库跑测试会被护栏中止 —— 这是刻意设计，不是故障。

## 开源

> *"From each according to his ability, to each according to his needs."*
>
> 「各尽所能，按需分配」
>
> — Karl Marx, *Critique of the Gotha Programme* / 卡尔·马克思，《哥达纲领批判》（1875）

本项目基于 MIT 协议开源于 [Gitee](https://gitee.com/WD_MoonMoonBird/exam-deep-seek)。
