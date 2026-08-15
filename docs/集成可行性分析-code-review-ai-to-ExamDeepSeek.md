# code-review-ai 集成至 Exam-DeepSeek 可行性分析报告

> **分析日期**: 2026-08-02  
> **分析人**: 齐活林（Qi）· 交付总监  
> **目标**: 评估将 `code-review-ai`（轻量化实训项目 AI 智能评审系统）的功能集成到已部署运营的 `Exam-DeepSeek`（Deadpan 判题）项目中的可行性

---

## 一、两个项目对比总览

| 维度 | Exam-DeepSeek（目标项目） | code-review-ai（源项目） | 兼容性 |
|------|--------------------------|-------------------------|--------|
| **产品定位** | AI 编程作业智能评分平台 | 工程项目静态智能批改平台 | ✅ 互补 |
| **目标用户** | 高校编程教师 + 学生 + 管理员 | 高校实训教师 + 学生 | ✅ 一致 |
| **核心场景** | 课后作业：学生在线编码 → AI评分 → 教师审核 | 实训项目：学生提交工程包 → 五层评审 → 教师复核 | ✅ 互补 |
| **前端框架** | Vue 3 + Ant Design Vue 4 | Vue 3 + Ant Design Vue 4 | 🟢 完全一致 |
| **编辑器** | Monaco Editor（可编辑） | Monaco Editor（只读） | 🟢 完全一致 |
| **状态管理** | Pinia | Pinia | 🟢 完全一致 |
| **路由** | Vue Router 4 | Vue Router 4 | 🟢 完全一致 |
| **构建工具** | Vite 8 | Vite | 🟢 一致 |
| **HTTP 客户端** | Axios | Axios | 🟢 完全一致 |
| **后端框架** | Express 5 (Node.js) | Spring Boot 3.2 (Java) | 🔴 完全不同 |
| **ORM** | Prisma | MyBatis-Plus | 🔴 完全不同 |
| **数据库** | MySQL 8 | MySQL 8 | 🟢 一致 |
| **AI 引擎** | DeepSeek API（v4-flash） | DeepSeek API（v4-pro） | 🟡 模型版本不同 |
| **认证方案** | JWT（7天） | Sa-Token（12小时） | 🔴 不同 |
| **部署状态** | ✅ 已部署运营 (deadpan.asia) | 🔶 开发阶段 | — |
| **文件处理** | Word 试卷解析 (mammoth) | Zip 工程包解压 (Java ZipInputStream) | 🔴 不同 |
| **实时通信** | Socket.io (WebSocket) | 无 | 🟡 仅目标项目有 |
| **测试框架** | Jest + Playwright | JUnit 5 + Mockito | 🔴 不同 |
| **图表** | 无 | vue-echarts | 🟡 仅源项目有 |

---

## 二、核心功能差异矩阵

### 2.1 Exam-DeepSeek 独有的功能（不应丢失）

| 功能 | 说明 |
|------|------|
| 题库管理系统 | 创建/编辑/删除题目，支持 Word 试卷 AI 解析导入 |
| 客观题+编程题混合 | 选择题/判断题/填空题/编程题一体化管理 |
| 在线编码提交 | 学生通过 Monaco 编辑器在线编写和提交代码 |
| 多学校支持 | 超级管理员管理学校、教师、学生三层体系 |
| 教学团队协作 | 教师创建团队、共享班级和题库 |
| AI 配置面板 | 管理员动态配置 API Key、模型、并发数 |
| WebSocket 实时推送 | 评分完成实时通知前端 |
| Worker 独立进程 | 异步并发评分，500人10分钟评完 |
| 考试/练习模式 | 作业支持考试模式和练习模式（不同交卷策略） |

### 2.2 code-review-ai 独有的功能（集成目标）

| 功能 | 说明 | 核心价值 |
|------|------|----------|
| **工程包上传与解压** | 学生提交完整项目 zip，服务端解压存储 | ⭐⭐⭐⭐⭐ |
| **工程类型自动识别** | 根据特征文件识别 SpringBoot/SSM/Python/Vue 项目 | ⭐⭐⭐⭐⭐ |
| **五层评审架构** | 机器校验 → 评分细则 → AST 解析 → AI 评审 → 人工复核 | ⭐⭐⭐⭐⭐ |
| **机器静态校验引擎** | 纯代码逻辑：分层完整性、必需文件、代码卫生扫描 | ⭐⭐⭐⭐ |
| **AST 语法解析** | JavaParser 提取包名/类/方法/注解，不编译不运行 | ⭐⭐⭐⭐ |
| **VSCode 风格批改工作台** | 左侧文件树 + 右侧代码阅读 + 底部评审面板 | ⭐⭐⭐⭐⭐ |
| **行级代码批注** | 教师可在具体行上添加批注（绑定文件+行号） | ⭐⭐⭐⭐ |
| **评分细则约束** | 教师配置维度权重（分层/功能/规范/注释），AI 按维度评分 | ⭐⭐⭐⭐ |
| **标准工程对比** | 教师上传参考工程，用于结构对比 | ⭐⭐⭐ |
| **学情统计图表** | vue-echarts 可视化（均分/完成率/分数分布） | ⭐⭐⭐ |
| **逾期检测** | 提交时间与截止时间比较，标记逾期状态 | ⭐⭐ |
| **批量评审** | 一键对全班提交触发 AI 评审 | ⭐⭐⭐ |

---

## 三、集成方案对比

### 方案 A：功能迁移（Node.js 重写）⭐ 推荐

**思路**：将 code-review-ai 的核心功能用 Node.js 重新实现，融入 Exam-DeepSeek 现有技术栈。

**优势**：
- 技术栈统一，维护成本低
- 无需增加 Java 运维依赖
- 可直接复用 Exam-DeepSeek 的认证、权限、实时推送体系
- 前端迁移几乎零成本（都是同一套 Vue3 + Antd）

**劣势**：
- JavaParser 需要找 Node.js 替代方案（如 `@babel/parser`、`java-parser` npm 包）
- 需要按 Node.js 方式重写评审引擎（约 3000 行 Java → ~2000 行 JS）

**工作量估算**：

| 模块 | 工作内容 | 复杂度 | 预估人天 |
|------|---------|--------|----------|
| 数据库 Schema 扩展 | 新增工程包相关表 | 低 | 1 |
| 工程包上传/解压 API | 文件上传 + adm-zip 解压 + 存储 | 低 | 1.5 |
| 机器校验引擎 | MachineCheckEngine.js 重写 | 中 | 2 |
| AST 解析引擎 | 调研 Node.js Java/Python AST 解析库 + 实现 | 高 | 3-4 |
| AI 评审引擎 | 基于现有 deepseek.js 扩展工程评分能力 | 中 | 2 |
| 批量评审调度 | 基于现有 Worker 架构扩展 | 中 | 1.5 |
| VSCode 批改工作台 | 前端页面迁移（核心页面） | 中 | 2 |
| 行级批注 UI + API | 批注组件 + CRUD API | 中 | 1.5 |
| 评分细则配置 | 权重配置 UI + API | 低 | 1 |
| 标准工程管理 | 上传/查看参考工程 | 低 | 1 |
| 学情统计图表 | echarts 集成 | 低 | 1 |
| 路由 + 菜单整合 | 新增教师端"实训评审"菜单 | 低 | 0.5 |
| 测试 + 联调 | 单元测试 + 集成测试 | 中 | 2 |
| **合计** | | | **~23 人天** |

---

### 方案 B：微服务集成

**思路**：保持 code-review-ai 的 Java 后端独立运行，通过反向代理或 API 网关统一路由。

**优势**：
- 源项目代码几乎不改动即可运行
- 复用现有的 Java 生态（JavaParser、Spring Boot 便利功能）

**劣势**：
- 运维复杂（需维护 Node.js + Java 两套后端）
- 认证体系需打通（JWT ↔ Sa-Token 互认）
- 数据库可能冲突（两套 Schema 共享一个 MySQL 实例）
- 部署资源翻倍（额外的 JVM 内存开销）
- 前端需要同时对接两个后端 API

**工作量估算**：约 15 人天（主要为运维/认证打通，但长期运维负担重）

---

### 方案 C：仅前端 UI 集成

**思路**：仅将 code-review-ai 的 VSCode 风格批改工作台 UI 移植到 Exam-DeepSeek，后端评分逻辑复用现有体系。

**优势**：
- 工作量最小
- 快速改善教师审核体验

**劣势**：
- 功能提升有限（仅 UI 改善，没有工程包评审能力）
- 现有评分模型是"按题目评分"，不适用于工程包场景

**工作量估算**：约 5 人天

---

## 四、关键技术可行性

### 4.1 Node.js AST 解析方案调研

| 语言 | 源方案 | Node.js 替代方案 | 可行性 |
|------|--------|------------------|--------|
| **Java** | JavaParser (com.github.javaparser) | `java-parser` npm 包（基于 Chevrotain） | ✅ 可行 |
| **Python** | 正则扫描（源项目也未完整实现） | `@babel/parser` 不支持 Python；可继续用正则或调研 tree-sitter-python | 🟡 需调研 |
| **通用** | — | `tree-sitter` + `tree-sitter-java`/`tree-sitter-python` 绑定 | ✅ 推荐（多语言统一方案） |

### 4.2 文件处理方案

| 功能 | Java 实现 | Node.js 替代方案 |
|------|----------|------------------|
| Zip 解压 | ZipInputStream | `adm-zip` npm 包 |
| 文件遍历 | File API | `fs.readdirSync` + `glob` |
| 文件编码检测 | 内置 Charset | `jschardet` npm 包 |
| 最大文件限制 | 50MB/包, 200MB/总 | 可复用相同限制 |

### 4.3 数据库扩展（不破坏现有 Schema）

在现有 Prisma Schema 中新增以下模型（独立表，不影响现有业务）：

```prisma
// 标准工程（参考工程）
model StandardProject {
  id          String   @id @default(uuid())
  name        String
  description String?
  teacherId   String
  teacher     User     @relation(fields: [teacherId], references: [id])
  filePath    String                         // 服务器存储路径
  createdAt   DateTime @default(now())
}

// 实训任务（扩展现有 Assignment 或新建）
model TrainTask {
  id                String   @id @default(uuid())
  title             String
  description       String?
  teacherId         String
  teacher           User     @relation(fields: [teacherId], references: [id])
  standardProjectId String?
  standardProject   StandardProject? @relation(fields: [standardProjectId], references: [id])
  scoringRubric     Json                            // 评分细则 JSON { dimensions: [...], weights: {...} }
  deadline          DateTime
  createdAt         DateTime @default(now())
  deletedAt         DateTime?
}

// 工程提交
model ProjectSubmission {
  id          String   @id @default(uuid())
  taskId      String
  task        TrainTask @relation(fields: [taskId], references: [id])
  studentId   String
  student     User     @relation(fields: [studentId], references: [id])
  filePath    String                         // zip 包存储路径
  extractedPath String?                      // 解压后目录
  projectType String?                        // 自动识别的工程类型
  isLate      Boolean  @default(false)
  version     Int      @default(1)
  status      String   @default("submitted") // submitted/ai_graded/reviewed/published
  createdAt   DateTime @default(now())
}

// 提交文件快照
model SubmitFile {
  id               String   @id @default(uuid())
  submissionId     String
  submission       ProjectSubmission @relation(fields: [submissionId], references: [id])
  relativePath     String                         // 相对路径
  content          String   @db.LongText          // 源码内容
  astResult        Json?                          // AST 解析结果
}

// 机器校验结果
model MachineCheckResult {
  id           String   @id @default(uuid())
  submissionId String
  submission   ProjectSubmission @relation(fields: [submissionId], references: [id])
  deductions   Json                             // 扣分明细 [{ code, description, points }]
  totalDeduction Float
}

// AI 评审结果
model AiReviewResult {
  id           String   @id @default(uuid())
  submissionId String
  submission   ProjectSubmission @relation(fields: [submissionId], references: [id])
  totalScore   Float
  dimensions   Json                             // 各维度得分
  feedback     String   @db.LongText
  rawResponse  String?  @db.LongText            // AI 原始响应
}

// 行级批注
model LineComment {
  id           String   @id @default(uuid())
  submissionId String
  submission   ProjectSubmission @relation(fields: [submissionId], references: [id])
  filePath     String                            // 文件相对路径
  lineNumber   Int
  content      String
  teacherId    String
  createdAt    DateTime @default(now())
}
```

### 4.4 路由与菜单整合

在 Exam-DeepSeek 教师端新增一级菜单"实训评审"：

```
/teacher/train-tasks              # 实训任务列表（类似现有作业列表）
/teacher/train-tasks/create       # 发布实训任务
/teacher/train-tasks/:id          # 任务详情
/teacher/train-tasks/:id/submits  # 全班提交列表
/teacher/train-review/:submitId   # VSCode 批改工作台（核心新页面）
/teacher/statistics               # 学情统计（新增）
```

---

## 五、风险评估

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|----------|
| **后端语言差异** | 🔴 高 | Java → Node.js 重写评审引擎，工作量最大 | 采用方案A，分阶段交付 |
| **AST 解析精度** | 🟡 中 | Node.js 的 Java AST 解析库不如 JavaParser 成熟 | 先调研 tree-sitter 能力，必要时降级为正则扫描 |
| **AI 模型差异** | 🟡 中 | v4-flash vs v4-pro 评审质量差异 | 统一为 v4-pro（工程评审对质量要求更高） |
| **数据库迁移风险** | 🟢 低 | 新增表不影响现有业务 | 使用 Prisma Migrate，做好备份 |
| **前端路由冲突** | 🟢 低 | 现有路由 `/teacher/xxx` 结构清晰 | 新增独立路由前缀 `/teacher/train-*` |
| **运维负担增加** | 🟡 中 | 新增功能模块意味着更多监控点 | 复用现有 PM2 + Nginx 架构 |
| **Token 用量增加** | 🟡 中 | 工程评审的 prompt 远大于单题评分（全量源码） | 设置教师级用量上限，逐步开放 |

---

## 六、分阶段实施建议

### Phase 1：核心引擎迁移（MVP，约 12 人天）

1. 数据库 Schema 扩展（新增表）
2. 工程包上传/解压 API
3. 机器静态校验引擎（Node.js 重写）
4. AI 评审引擎（扩展现有 deepseek.js）
5. VSCode 批改工作台前端页面
6. 基本流程跑通：教师发布任务 → 学生上传工程 → 机器+AI评审 → 教师查看

### Phase 2：体验增强（约 8 人天）

1. AST 解析引擎（tree-sitter 方案）
2. 行级代码批注
3. 评分细则配置
4. 标准工程对比
5. 学情统计

### Phase 3：优化与打磨（约 3 人天）

1. 批量评审调度优化
2. 性能优化（大工程包处理）
3. 错误处理增强
4. 完整测试覆盖

---

## 七、结论与建议

### ✅ 集成可行性：可行，推荐方案 A（功能迁移）

**核心理由**：

1. **前端 95% 可复用**：两个项目技术栈完全一致（Vue3 + AntdV + Monaco + Pinia），VSCode 批改工作台等核心页面几乎可以直接迁移
2. **后端可扩展性强**：Exam-DeepSeek 的 Express + Prisma 架构已预留扩展空间，新增 7 张表不影响现有 12 张表
3. **AI 引擎统一**：都使用 DeepSeek API，现有评分流程架构（Worker 异步 + WebSocket 推送）可直接复用
4. **业务互补而非冲突**：现有"作业+题目"体系与新增"实训+工程包"体系并存，面向不同教学场景
5. **部署架构不变**：无需引入 Java 运行时，保持 Node.js 单一技术栈

### ⚠️ 主要挑战

- **Java AST 解析**的 Node.js 替代方案需要充分调研验证（推荐 tree-sitter 方案）
- **工程评审 prompt 成本**远高于单题评分，需要关注 API 费用
- **评审耗时**：全量源码评审可能需要更长 AI 响应时间（建议 120s 超时 + 流式输出）

### 📊 投入产出比

- **预估总工作量**：~23 人天
- **产出**：Exam-DeepSeek 从"作业评分平台"升级为"编程教学全场景评分平台"，覆盖课后作业 + 实训项目两大核心场景
- **商业价值**：差异化竞争力显著增强，教学场景覆盖率从约 60% 提升至 95%+

---

> **最终建议**：值得投入。建议先做 Phase 1 MVP（12 人天），跑通核心流程后在真实教学环境中验证，再决定是否继续 Phase 2/3。
