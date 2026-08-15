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

## 实训题（工程项目批改）模块

除单文件编程题外，平台支持 **实训题（工程项目）** 类型，学生提交完整工程 zip 包，AI 对比标准工程包评分，教师人工把关放分：

- **工程包提交**：学生上传 zip（≤50MB），服务端安全解压（GBK 中文名智能解码、Zip-Slip 防护、忽略 `node_modules/.git/target` 等），按版本目录持久化，支持多次提交
- **VSCode 风格 IDE**：学生/教师端均为文件树 + 多 tab Monaco 编辑器，语法高亮、只读回看
- **AI 异步评分**：提交后后台自动对比「标准工程包 vs 学生工程包」评分（结构化输出：总分 + 分项明细 + 优点/问题 + 评语），失败教师可一键重评
- **教师三栏审核**：标准包 ↔ 学生包 ↔ AI 评语并排对照，可引用 AI 评语、调整分数（0~满分钳制）、审核通过后学生端才可见成绩（R4 放分唯一开关）
- **成绩卡片**：学生端大号分数 + 教师评语独立展示；列表按题型区分状态（实训题"已批改"，编程题保持原语义）
- **防泄漏设计**：标准包物理隔离、学生端接口字段白名单（`aiScore/aiFeedback` 永不下发）、AI 评语二次防护

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
