# Deadpan 判题

<p align="center">
  <img src="./学习中.svg" width="120" alt="Deadpan 判题" />
</p>

<h1 align="center">Deadpan 判题</h1>

<p align="center">AI 驱动的编程作业智能评分平台</p>

<p align="center">
  <a href="https://deadpan.asia/exam/doc">📖 使用文档</a>
  ·
  <a href="https://deadpan.asia/exam/login">🚀 在线体验</a>
  ·
  <a href="https://gitee.com/WD_MoonMoonbird/exam-deep-seek">🐴 Gitee</a>
</p>

---

## 简介

Deadpan 判题是一套面向高校编程类课程的 **AI 智能评分平台**，覆盖建题 → 布置作业 → 学生提交 → AI 评分 → 教师审核 → 发布成绩的完整教学闭环。

- **教师**：创建题目（大题 + 多小题）、布置作业、AI 自动评分、审核发布成绩
- **学生**：在线编写代码并提交、查看分数与评语
- **高并发**：多并发 AI 评分架构，500 人交卷 10 分钟内评完
- **教学团队**：多教师共享班级，协作管理作业与审核
- **实时推送**：WebSocket 实时推送评分结果，无需手动刷新

## 实训题 BETA（工程项目批改）模块

除单文件编程题外，平台支持 **实训题（工程项目）** 类型，学生提交完整工程 zip 包，AI 对比标准工程包评分，教师人工把关放分：

- **工程包提交**：学生上传 zip（≤50MB），服务端安全解压（GBK 中文名智能解码、Zip-Slip 防护、忽略 `node_modules/.git/target` 等），按版本目录持久化，支持多次提交
- **VSCode 风格 IDE**：学生/教师端均为文件树 + 多 tab Monaco 编辑器，语法高亮、只读回看
- **AI 异步评分**：提交后后台自动对比「标准工程包 vs 学生工程包」评分（结构化输出：总分 + 分项明细 + 优点/问题 + 评语），失败教师可一键重评
- **教师三栏审核**：标准包 ↔ 学生包 ↔ AI 评语并排对照，可引用 AI 评语、调整分数（0~满分钳制）、审核通过后学生端才可见成绩（R4 放分唯一开关）
- **成绩卡片**：学生端大号分数 + 教师评语独立展示；列表按题型区分状态（实训题"已批改"，编程题保持原语义）
- **防泄漏设计**：标准包物理隔离、学生端接口字段白名单（`aiScore/aiFeedback` 永不下发）、AI 评语二次防护

### 实现原理

实训题模块的核心是一条**「标准包参照 → 版本化提交 → 异步 AI 对比评分 → 教师把关放分」**的完整链路：

**① 题目创建：标准工程包**
教师上传标准工程 zip，前端先行过滤依赖后上传，服务端安全解压至 `uploads/project-questions/{题目id}/standard/`。AI 评分时以此为学生提交的**参照物**。

**② 学生提交：版本化落盘（R7）**
学生上传工程 zip，经同样的前端过滤 → 服务端 `extractZipSafely` 安全解压（Zip-Slip 穿越防护、GBK 中文文件名智能解码、文件数/体积/深度预算校验、符号链接跳过）→ 落盘 `uploads/projects/{题目}/{学生}/{版本号}/`。**每次提交生成新版本目录，历史版本永不覆盖**；提交记录（Submission）内嵌"版本信封"（envelope），承载提交历史与评分任务状态机（`pending → grading → done / failed`）。

**③ AI 异步评分（并发受控 + 解析增强）**
提交后评分任务异步入队（信号量限制 3 并发，不阻塞提交响应）：读取标准包与提交源码 → 组装项目评审 prompt（题目/要求/评分标准/标准源码/学生源码）→ 调用 DeepSeek（180s 超时、2 次重试、429 退避）→ 要求返回结构化 JSON（`totalScore` + `breakdown` 分项明细 + `highlights` 优点 + `issues` 问题 + `overallComment` 总评）→ **解析增强**（兼容 markdown 代码块包裹、响应截断时按括号栈补全恢复）→ 写回评分结果，状态 `submitted → ai_graded`。评分失败不向学生暴露错误细节，教师端可一键重评或人工评分。

**④ 教师审核与成绩放行（R4）**
审核页三栏对照（学生提交 / 标准答案包 / AI 评语面板），教师可引用 AI 评语、调整最终分数（0~满分钳制，负数/NaN 拒绝入库）→ **审核通过是成绩放行的唯一开关**：仅 `reviewed` 后学生端才可见分数与评语（此前仅显示"已提交，待评分"）。

**⑤ 防泄漏设计**
标准包物理隔离（学生侧路由不可达）；学生视图字段白名单（`aiScore / aiFeedback / grading / 物理路径` 永不下发）；实训题 AI 评语绝不自动透传给学生，须教师手动填写（R3）。

### 为什么前端先"过滤依赖"——对自拉取代码部署的开发者尤其有用

学生提交的工程 zip 通常**携带 `node_modules` 等依赖目录（动辄 180MB+）**。平台在**上传前**（浏览器端）用过滤引擎剔除依赖/构建产物/二进制文件，只重打包纯代码（通常仅几 MB）。这对直接克隆仓库、自己部署服务器的开发者意味着：

- **带宽与存储**：上传/落盘体积减少 90% 以上——服务端磁盘、出口带宽压力大幅降低，小服务器也能轻松承载；
- **安全**：依赖文件**不落盘**，天然规避 `node_modules` 中恶意文件、超长路径、符号链接等解压攻击面；
- **AI 评分质量**：prompt 只包含业务代码，模型专注对比代码质量，不会被依赖文件干扰、也不会因内容过大触发输出截断；
- **本地复现友好**：自部署开发者在测试环境用几 MB 的小包即可完整走通"上传 → 评分 → 审核"全流程，不受大包限制困扰。

### 接入 DeepSeek-V4-Flash-0731 正式版

平台通过 **OpenAI 兼容接口**接入 DeepSeek 大模型，承担题目解析、参考答案生成与实训项目对比评分等全部 AI 能力。模型名与 API 地址支持在线配置（`system_configs` 表，1 分钟缓存生效，无需改代码），默认 `deepseek-v4-flash`（V4-Flash-0731 正式版）。接入正式版带来的好处：

- **评分更稳**：正式版在结构化 JSON 输出上更稳定，配合平台解析增强（markdown 代码块包裹兼容、响应截断括号栈补全），实训项目评分成功率显著提升，AI 兜底失败率大幅下降；
- **吞吐更高**：Flash 系列推理速度快，配合平台异步评分队列与并发信号量，500 人交卷分钟级完成评分（实测单题 30s 内、实训项目 2 分钟内）；
- **成本可控**：Flash 定位轻量高效，批量评分场景成本远低于旗舰模型，适合课程作业高频批改；
- **教学反馈更细**：按既定结构输出总分 + 分项明细（breakdown）+ 优点（highlights）+ 问题（issues）+ 总评（overallComment），学生能获得可操作的改进建议；
- **切换灵活**：模型名 / API 地址 / 并发数均可在管理端配置（DB 优先、ENV 兜底），灰度切换模型无需重启服务。
## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Vue 3 + Ant Design Vue 4 + Monaco Editor |
| 后端 | Express 5 + Prisma ORM + JWT |
| 数据库 | MySQL 8 |
| AI 引擎 | DeepSeek（OpenAI 兼容接口） |
| 实时通信 | Socket.io + WebSocket |
| 部署 | Nginx + PM2 + 自签/正规 SSL |

## 快速开始

```bash
# 1. 克隆仓库
git clone https://gitee.com/WD_MoonMoonbird/exam-deep-seek.git
cd exam-deep-seek

# 2. 配置环境变量
cp server/.env.example server/.env
# 编辑 server/.env，填入数据库连接、JWT 密钥、DeepSeek API Key

# 3. 安装依赖
cd server && npm install && cd ../client && npm install && cd ..

# 4. 初始化数据库
cd server && npx prisma db push && cd ..

# 5. 启动服务
cd server && node src/app.js &        # HTTP → localhost:3000
cd client && npx vite                  # 前端 → localhost:5173
```

## 测试

- 实训题模块测试用例（29 条，2026-08-15 全通过）：`docs/TEST-实训题模块测试用例-2026-08-15.md`
- 需求分析：`docs/PRD-实训题流程定义.md`（Q1~Q12 已定案）｜ 架构设计：`docs/ARCH-工程项目批改.md`
- 服务端测试：`cd server && npm test`

## 开源

> *"From each according to his ability, to each according to his needs."*
>
> 「各尽所能，按需分配」
>
> — Karl Marx, *Critique of the Gotha Programme* / 卡尔·马克思，《哥达纲领批判》（1875）

本项目基于 MIT 协议开源于 [Gitee](https://gitee.com/WD_MoonMoonbird/exam-deep-seek)。
