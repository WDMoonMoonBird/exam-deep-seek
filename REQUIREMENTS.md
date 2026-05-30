# 考试（作业）系统 — 需求分析文档

## 一、项目概述

本项目是一个面向计算机专业课程的在线考试/作业系统，核心特色是接入 DeepSeek 大模型对学生提交的代码答案进行自动评分，评分结果需经教师审核后方可向学生展示。

---

## 二、用户角色与权限

| 角色           | 权限说明                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| **超级管理员** | 最高权限，管理所有教师和学生信息，创建学校/班级并指定教师，不参与教学业务 |
| **教师**       | 管理自己的题库，布置作业/考试，审核 AI 评分结果，管理学生                 |
| **学生**       | 查看被布置的作业，提交答案，在教师发布成绩后查看分数与评语                |

### 登录规则

| 角色       | 登录名 | 默认密码 | 可否注册         | 可否改密 |
| ---------- | ------ | -------- | ---------------- | -------- |
| 超级管理员 | admin  | ***REDACTED*** | 否（系统内置）   | 否       |
| 教师       | 工号   | 工号     | 否（管理员新增） | 是       |
| 学生       | 学号   | 学号     | 否（教师新增）   | 是       |

---

## 三、数据库设计

### 设计原则

- 满足第三范式（3NF）：无传递依赖、无部分依赖、字段原子化
- 统一用户表 + 角色字段，避免表冗余
- 学生-班级、教师-班级均为多对多关系，通过中间表实现
- 全局使用 InnoDB 引擎，字符集 utf8mb4

### 数据库信息

| 项目         | 值                          |
| ------------ | --------------------------- |
| 数据库类型   | MySQL                       |
| 数据库名称   | `exam_system`               |
| 本地密码     | `***REDACTED***`            |
| 服务器密码   | `***REDACTED***`            |
| 密码管理方式 | `.env` 文件，不进入代码仓库 |

### 表结构（10 张表）

#### 1. `users` — 用户表

| 字段       | 类型                                               | 说明                |
| ---------- | -------------------------------------------------- | ------------------- |
| id         | INT UNSIGNED AUTO_INCREMENT                        | 主键                |
| username   | VARCHAR(50) NOT NULL                               | 登录名（工号/学号） |
| password   | VARCHAR(255) NOT NULL                              | 明文密码            |
| real_name  | VARCHAR(50) NOT NULL                               | 姓名                |
| role       | ENUM('super_admin', 'teacher', 'student') NOT NULL | 角色                |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP                 | 创建时间            |

- 唯一索引：`username`
- 复合索引：`(username, role)`

#### 2. `schools` — 学校表

| 字段       | 类型                               | 说明       |
| ---------- | ---------------------------------- | ---------- |
| id         | INT UNSIGNED AUTO_INCREMENT        | 主键       |
| name       | VARCHAR(100) NOT NULL              | 校名，唯一 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | —          |

- 唯一索引：`name`

#### 3. `classes` — 班级表

| 字段       | 类型                               | 说明                         |
| ---------- | ---------------------------------- | ---------------------------- |
| id         | INT UNSIGNED AUTO_INCREMENT        | 主键                         |
| name       | VARCHAR(100) NOT NULL              | 班名（不唯一，不同校可重名） |
| school_id  | INT UNSIGNED NOT NULL              | 所属学校 FK → schools.id     |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | —                            |

- 外键：`school_id` → `schools.id`
- 索引：`school_id`

#### 4. `teacher_classes` — 教师-班级关联表（M2M）

| 字段       | 类型                  | 说明            |
| ---------- | --------------------- | --------------- |
| teacher_id | INT UNSIGNED NOT NULL | FK → users.id   |
| class_id   | INT UNSIGNED NOT NULL | FK → classes.id |

- 联合主键：`(teacher_id, class_id)`
- 索引：`teacher_id`、`class_id`

#### 5. `student_classes` — 学生-班级关联表（M2M）

| 字段       | 类型                  | 说明            |
| ---------- | --------------------- | --------------- |
| student_id | INT UNSIGNED NOT NULL | FK → users.id   |
| class_id   | INT UNSIGNED NOT NULL | FK → classes.id |

- 联合主键：`(student_id, class_id)`
- 索引：`student_id`、`class_id`

#### 6. `questions` — 题库表

| 字段             | 类型                                    | 说明                             |
| ---------------- | --------------------------------------- | -------------------------------- |
| id               | INT UNSIGNED AUTO_INCREMENT             | 主键                             |
| teacher_id       | INT UNSIGNED NOT NULL                   | 所属教师 FK → users.id           |
| title            | VARCHAR(200) NOT NULL                   | 题目标题                         |
| content          | TEXT NOT NULL                           | 题目描述                         |
| reference_answer | TEXT NOT NULL                           | 参考答案                         |
| max_score        | INT NOT NULL DEFAULT 100                | 满分                             |
| difficulty       | ENUM('easy', 'medium', 'hard') NOT NULL | 难度                             |
| language         | VARCHAR(30) NOT NULL                    | 编程语言（如 python, java, cpp） |
| created_at       | DATETIME DEFAULT CURRENT_TIMESTAMP      | —                                |

- 外键：`teacher_id` → `users.id`
- 索引：`teacher_id`

#### 7. `assignments` — 作业表

| 字段        | 类型                               | 说明                   |
| ----------- | ---------------------------------- | ---------------------- |
| id          | INT UNSIGNED AUTO_INCREMENT        | 主键                   |
| teacher_id  | INT UNSIGNED NOT NULL              | 发布教师 FK → users.id |
| title       | VARCHAR(200) NOT NULL              | 作业/考试标题          |
| description | TEXT                               | 作业说明               |
| start_time  | DATETIME NOT NULL                  | 开始时间               |
| end_time    | DATETIME NOT NULL                  | 截止时间               |
| created_at  | DATETIME DEFAULT CURRENT_TIMESTAMP | —                      |

- 外键：`teacher_id` → `users.id`
- 索引：`teacher_id`

#### 8. `assignment_questions` — 作业-题目关联表（M2M）

| 字段          | 类型                   | 说明                |
| ------------- | ---------------------- | ------------------- |
| assignment_id | INT UNSIGNED NOT NULL  | FK → assignments.id |
| question_id   | INT UNSIGNED NOT NULL  | FK → questions.id   |
| sort_order    | INT NOT NULL DEFAULT 0 | 题目序号            |

- 联合主键：`(assignment_id, question_id)`
- 索引：`assignment_id`

#### 9. `assignment_classes` — 作业-班级关联表（M2M）

| 字段          | 类型                  | 说明                |
| ------------- | --------------------- | ------------------- |
| assignment_id | INT UNSIGNED NOT NULL | FK → assignments.id |
| class_id      | INT UNSIGNED NOT NULL | FK → classes.id     |

- 联合主键：`(assignment_id, class_id)`
- 索引：`class_id`

#### 10. `submissions` — 提交/评分表

| 字段             | 类型                                                                  | 说明                     |
| ---------------- | --------------------------------------------------------------------- | ------------------------ |
| id               | INT UNSIGNED AUTO_INCREMENT                                           | 主键                     |
| assignment_id    | INT UNSIGNED NOT NULL                                                 | FK → assignments.id      |
| student_id       | INT UNSIGNED NOT NULL                                                 | FK → users.id            |
| question_id      | INT UNSIGNED NOT NULL                                                 | FK → questions.id        |
| answer           | TEXT                                                                  | 学生提交的代码           |
| ai_score         | INT                                                                   | AI 评分（0 ~ max_score） |
| ai_feedback      | TEXT                                                                  | AI 评语/改进意见         |
| final_score      | INT                                                                   | 教师确认后的最终分数     |
| teacher_feedback | TEXT                                                                  | 教师评语                 |
| status           | ENUM('draft','submitted','ai_graded','reviewed','published') NOT NULL | 状态                     |
| submitted_at     | DATETIME                                                              | 提交时间                 |
| reviewed_at      | DATETIME                                                              | 教师审核时间             |

- 外键：`assignment_id` → `assignments.id`，`student_id` → `users.id`，`question_id` → `questions.id`
- 联合唯一约束：`(assignment_id, student_id, question_id)` — 一个学生对一次作业的每道题只有一份提交
- 索引：`student_id`、`assignment_id`、`status`、`(assignment_id, status)`

### 状态流转

```
draft → submitted → ai_graded → reviewed → published
 (草稿)   (已提交)   (AI已评分)  (教师已审核)  (成绩已发布)
                              ↑
                         教师可修改分数和评语
```

### 3NF 验证

- **1NF**：所有字段原子化，无重复组，外键关系通过独立中间表表达
- **2NF**：每个非主键字段完全依赖于所在表的主键
- **3NF**：不存在传递依赖——学生的学校信息通过 `student_classes → classes → schools` 推导，不冗余存储在 users 表

### ER 关系图（文字版）

```
users(1) ──< teacher_classes >── classes(1)
  │                                    │
  │                              classes(1) ──< student_classes >── users(student)
  │
  │──< questions(1)
  │──< assignments(1)
           │
           ├──< assignment_questions >── questions
           ├──< assignment_classes  >── classes
           │
           └──< submissions(1)
                     │
                     ├── users(student)
                     └── questions
```

---

## 四、功能需求

### 4.1 超级管理员功能

| 功能     | 说明                                                 |
| -------- | ---------------------------------------------------- |
| 管理教师 | 新增/编辑/查看教师信息（姓名、工号）                 |
| 管理学生 | 新增/编辑/查看学生信息                               |
| 管理学校 | 新增/编辑/删除学校                                   |
| 管理班级 | 新增/编辑/删除班级，**创建时指定哪些教师管理该班级** |

### 4.2 教师功能

| 功能      | 说明                                          |
| --------- | --------------------------------------------- |
| 登录/改密 | 工号 + 默认密码（工号）登录，可修改密码       |
| 题库管理  | 新增/编辑/删除题目，支持代码编辑器 + 语法高亮 |
| 布置作业  | 从题库选题，指定学校、班级，设置起止时间      |
| 学生管理  | 单个手动新增 + 批量导入（JSON/Excel/TXT）     |
| 评分审核  | 查看 AI 打分和评语，修改分数，发布成绩        |
| 查看提交  | 按作业查看学生提交情况                        |

### 4.3 学生功能

| 功能      | 说明                                    |
| --------- | --------------------------------------- |
| 登录/改密 | 学号 + 默认密码（学号）登录，可修改密码 |
| 作业列表  | 查看自己被布置的作业                    |
| 提交答案  | 在代码编辑器中编写并提交答案            |
| 查看成绩  | 仅在教师发布成绩后可见分数和评语        |

### 4.4 学生批量导入

- 支持格式：JSON、Excel（.xlsx/.xls）、TXT（CSV）
- 导入流程：必须先选择学校 → 再选班级 → 再导入学生列表
- 字段映射：学号、姓名为必填字段
- 导入时自动创建学生账号（users 表），默认密码为学号
- 导入完成后自动关联到对应班级（student_classes 表）

---

## 五、DeepSeek AI 评分设计

### 5.1 评分流程

```
学生提交 → status = "submitted" → 返回"提交成功"
                                        │
                               (学生不知道后台在干什么)
                                        │
                          ┌─────────────┴─────────────┐
                          │  Worker 进程（独立于主服务）  │
                          │  每 2s 轮询 status=submitted │
                          │  串行消费，并发 ≤ 3          │
                          │  调用 DeepSeek API           │
                          │  写入 ai_score + ai_feedback │
                          │  status = "ai_graded"        │
                          └─────────────────────────────┘
                                        │
                               (学生仍看不到分数)
                                        │
                    教师审核 → 修改分数/评语 → status = "reviewed"
                                        │
                    教师点"发布成绩" → status = "published"
                                        │
                               (学生此时才能看到)
```

### 5.2 DeepSeek API 配置

| 项目     | 值                                             |
| -------- | ---------------------------------------------- |
| Model    | `deepseek-v4-flash`                            |
| API Key  | `sk-xxxxxxxx`（配置于 .env，不进入仓库）        |
| 调用方式 | OpenAI 兼容格式（通过 `/v1/chat/completions`） |
| 配置方式 | `.env` 文件，不进入代码仓库                    |

### 5.3 评分 Prompt 要求

大模型须按以下 JSON 格式返回：

```json
{
  "score": 85,
  "feedback": "代码整体思路正确，但时间复杂度较高，建议使用哈希表优化..."
}
```

- `score`：0 ~ 题目 max_score 之间的整数
- `feedback`：具体改进意见，包括代码正确性、效率、可读性等方面的评价

### 5.4 容错设计

| 情况                        | 处理                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| DeepSeek API 返回非预期格式 | 重试 3 次，仍失败则标记为 `ai_graded` 且 score=0, feedback="AI 评分异常，请联系教师" |
| API 超时                    | 单次超时 60s，超时后重试 1 次                                                        |
| API 限流（429）             | 退避重试（等待 5s / 15s / 30s）                                                      |
| 网络不通                    | 记录错误日志，Worker 继续处理下一条                                                  |

---

## 六、技术架构

### 6.1 技术栈

| 层          | 技术                    | 说明                                   |
| ----------- | ----------------------- | -------------------------------------- |
| 前端框架    | Vue 3 (Composition API) | SPA 单页应用                           |
| UI 组件库   | Ant Design Vue 4.x      | 企业级 UI                              |
| 代码编辑器  | Monaco Editor           | VS Code 内核，多语言语法高亮，详见 6.8 |
| 日志系统    | pino                    | 结构化日志，高性能低开销，详见 6.9     |
| Excel 解析  | xlsx (SheetJS)          | 前端读取 Excel 批量导入学生            |
| 状态管理    | Pinia                   | Vue 3 官方推荐                         |
| 构建工具    | Vite                    | 快速开发与构建                         |
| HTTP 客户端 | Axios                   | 封装拦截器处理 JWT                     |
| 后端框架    | Express.js              | Node.js 生态中最成熟                   |
| ORM         | Prisma                  | 类型安全，自动迁移                     |
| 数据库      | MySQL (InnoDB)          | 本地与服务器均部署                     |
| 认证        | JWT (jsonwebtoken)      | 无状态，过期时间 7 天                  |
| AI 服务     | DeepSeek API            | OpenAI 兼容格式调用                    |
| 进程管理    | PM2                     | Cluster 模式 + Worker 进程             |

### 6.2 前后端分离

#### 开发环境

```
┌─────────────────────────────────┐
│  Vite Dev Server (:5173)        │
│  Vue 3 SPA                      │
│  /api/* → proxy → :3000         │
└─────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  Node.js (:3000)                │
│  Express + Prisma + MySQL       │
└─────────────────────────────────┘
```

- Vite 配置 `server.proxy` 代理 `/api` 到后端
- 前端所有 API 请求使用相对路径 `/api/xxx`

#### 生产环境

```
浏览器 → Nginx (:80)
           ├── /api/* → Node.js (:3000)
           └── /*     → Vue 静态文件 (dist/)
```

- 同一域名、同一端口，无跨域问题
- 静态文件由 Nginx 直接返回，不经过 Node

### 6.3 API 设计规范

统一返回格式：

```json
{
  "code": 0,
  "message": "ok",
  "data": { ... }
}
```

| code | 含义                |
| ---- | ------------------- |
| 0    | 成功                |
| 1001 | 参数错误            |
| 1002 | 未登录 / Token 过期 |
| 1003 | 无权限              |
| 1004 | 资源不存在          |
| 2001 | 服务器内部错误      |

### 6.4 进程部署（PM2）

```
PM2 管理 3 个进程：

┌──────────────────────────────┐
│ PM2                          │
│                              │
│  ┌──────┐ ┌──────┐ ┌───────┐ │
│  │Node #1│ │Node #2│ │Worker │ │
│  │主服务 │ │主服务 │ │评分进程│ │
│  │(cluster mode)│ │(fork) │ │
│  └──────┘ └──────┘ └───────┘ │
└──────────────────────────────┘
     ↑           ↑         ↑
     └─ 共享端口 :3000 ─┘   └─ 独立进程，不监听端口
```

### 6.5 内存预算（2GB 服务器）

| 进程                      | 内存预估   |
| ------------------------- | ---------- |
| Nginx                     | ~50MB      |
| Node 主进程 × 2 (cluster) | ~400MB     |
| 评分 Worker × 1           | ~150MB     |
| MySQL                     | ~300MB     |
| 系统预留                  | ~200MB     |
| **合计**                  | **~1.1GB** |
| **余量**                  | **~900MB** |

### 6.6 项目目录结构

```
Exam-DeepSeek/
├── client/                         # Vue 3 前端
│   ├── public/
│   ├── src/
│   │   ├── api/                    # Axios 封装 + 接口定义
│   │   │   ├── request.js          # Axios 实例 + 拦截器
│   │   │   ├── auth.js             # 登录相关 API
│   │   │   ├── question.js         # 题库 API
│   │   │   ├── assignment.js       # 作业 API
│   │   │   ├── submission.js       # 提交 API
│   │   │   └── admin.js            # 管理 API
│   │   ├── components/             # 公共组件
│   │   │   ├── CodeEditor.vue      # Monaco Editor 封装
│   │   │   ├── UploadStudent.vue   # 批量导入学生
│   │   │   └── ...
│   │   ├── views/                  # 页面组件
│   │   │   ├── Login.vue
│   │   │   ├── admin/              # 超级管理员页面
│   │   │   ├── teacher/            # 教师页面
│   │   │   └── student/            # 学生页面
│   │   ├── router/
│   │   │   └── index.js            # 路由 + 权限守卫
│   │   ├── stores/                 # Pinia
│   │   │   ├── user.js
│   │   │   └── ...
│   │   ├── utils/
│   │   ├── App.vue
│   │   └── main.js
│   ├── .env.development            # 开发环境变量
│   ├── .env.production             # 生产环境变量
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── server/                         # Node.js 后端
│   ├── prisma/
│   │   ├── schema.prisma           # 数据库模型定义
│   │   └── migrations/
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── deepseek.js         # DeepSeek API 调用
│   │   │   └── gradingWorker.js    # 评分 Worker 入口
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT 校验
│   │   │   └── role.js             # 角色权限
│   │   ├── utils/
│   │   │   └── grader.js           # 评分逻辑封装
│   │   └── app.js                  # Express 入口
│   ├── .env                        # 配置（不入仓库）
│   ├── .env.example                # 配置模板（入仓库）
│   ├── package.json
│   └── ecosystem.config.cjs        # PM2 配置
│
├── .gitignore                      # 忽略 .env, node_modules, dist
└── README.md
```

### 6.7 敏感信息管理

| 文件                      | 用途                       | 是否入仓库     |
| ------------------------- | -------------------------- | -------------- |
| `server/.env`             | 真实配置                   | ❌ `.gitignore` |
| `server/.env.example`     | 配置模板（值留空）         | ✅              |
| `client/.env.development` | 前端开发变量（无敏感信息） | ✅              |
| `client/.env.production`  | 前端生产变量（无敏感信息） | ✅              |

`.env` 结构：

```bash
# 数据库
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=exam_system

# JWT
JWT_SECRET=your_random_secret
JWT_EXPIRES_IN=7d

# DeepSeek
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 6.8 代码编辑器方案 — Monaco Editor

**选型结论：Monaco Editor**

Monaco Editor 是 VS Code 的核心编辑器组件，通过 `monaco-editor` npm 包提供给 Web 应用使用。

**对比其他方案：**

|          | Monaco Editor                             | CodeMirror 6           | Ace Editor          |
| -------- | ----------------------------------------- | ---------------------- | ------------------- |
| 语法高亮 | 60+ 语言，与 VS Code 一致                 | 需手动引入语言包       | 120+ 语言但质量参差 |
| 代码补全 | 内置 IntelliSense                         | 需自行配置             | 基础补全            |
| 错误提示 | 支持诊断标记（波浪线）                    | 需自行实现             | 不支持              |
| Vue 集成 | `@monaco-editor/loader` + `monaco-editor` | `@codemirror/vue-next` | `ace-builds`        |
| 包体积   | ~5MB（按需加载语言包可减小）              | ~1MB（按需加载）       | ~2MB                |
| 社区     | VS Code 团队维护，生态最强                | 活跃                   | 较老                |

**选用理由：**
- 计算机考试场景下，学生和教师需要编辑 Python、Java、C/C++ 等多种语言的代码，Monaco 对主流编程语言的语法高亮和自动补全开箱即用
- 内置的代码折叠、行号、缩进引导线、括号匹配等功能直接可用，无需二次开发
- 与 VS Code 一致的编辑体验，师生上手零成本

**安装方式：**

```bash
npm install monaco-editor @monaco-editor/loader
```

**Vue 3 封装示例（`client/src/components/CodeEditor.vue`）：**

```js
import loader from '@monaco-editor/loader';
import { shallowRef, onMounted, onUnmounted, watch } from 'vue';

// 使用方式：
// <CodeEditor v-model="code" language="python" :readOnly="false" />
```

**支持的语言清单（考试常用）：**

| 语言       | Monaco 标识  | 说明     |
| ---------- | ------------ | -------- |
| Python     | `python`     | 默认选项 |
| Java       | `java`       | —        |
| C          | `c`          | —        |
| C++        | `cpp`        | —        |
| JavaScript | `javascript` | —        |
| TypeScript | `typescript` | —        |
| Go         | `go`         | —        |
| SQL        | `sql`        | —        |

**使用场景：**

| 场景                     | 语言选择         | readOnly |
| ------------------------ | ---------------- | -------- |
| 教师新增题目（内容区域） | 教师指定题目语言 | false    |
| 教师编写参考答案         | 与题目语言一致   | false    |
| 学生提交答案             | 教师预先指定语言 | false    |
| 教师审核时查看学生答案   | 与题目语言一致   | true     |
| 学生查看已发布成绩和评语 | 与题目语言一致   | true     |

### 6.9 日志系统 — pino

**选型结论：pino**

**不使用 `console.log` 的原因：**
- 无日志级别，调试/信息/错误混杂，排查困难
- 无时间戳和结构化格式，无法追溯问题时间线
- 无文件持久化，PM2 重启后日志丢失
- 多进程（cluster）下日志交错混乱

**pino vs winston：**

|           | pino                                           | winston              |
| --------- | ---------------------------------------------- | -------------------- |
| 性能      | 极快，JSON 序列化开销极低                      | 一般，格式化开销较大 |
| 内存占用  | 极低                                           | 中等                 |
| 默认输出  | JSON 行（适合机器解析）                        | 可配置               |
| 进程友好  | Cluster 下天然支持                             | 需额外配置           |
| 2C2G 场景 | 几乎无感知                                     | 略有负担             |
| 生态      | `pino-pretty`（开发可读）、`pino-roll`（轮转） | 丰富                 |

**安装方式：**

```bash
npm install pino pino-pretty
```

**初始化（`server/src/utils/logger.js`）：**

```js
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export default logger;
```

**使用示例：**

```js
// 一般信息
logger.info({ userId: 123, action: 'login' }, '用户登录成功');

// 警告（如 DeepSeek 重试）
logger.warn({ attempt: 2, submissionId: 456 }, 'DeepSeek API 限流，正在重试');

// 错误（务必传入 err 对象以记录完整堆栈）
logger.error({ err, submissionId: 789 }, 'DeepSeek 评分失败');

// 调试（开发环境启用，生产关闭）
logger.debug({ sql, params }, '执行查询');
```

**生产环境日志持久化（PM2 `ecosystem.config.cjs`）：**

```js
{
  apps: [{
    name: 'exam-server',
    script: './src/app.js',
    error_file: '/var/log/exam-system/error.log',
    out_file: '/var/log/exam-system/out.log',
    max_size: '10M',
    max_files: 10,
  }]
}
```

**日志级别策略：**

| 环境 | `LOG_LEVEL` | 说明                               |
| ---- | ----------- | ---------------------------------- |
| 开发 | `debug`     | 输出所有日志，方便调试             |
| 生产 | `info`      | 仅 info/warn/error/fatal，减少 I/O |

### 6.10 UI 组件规范 — Ant Design Vue

**原则：所有页面元素优先使用 Ant Design Vue 原生组件，仅在无对应组件时自定义开发。**

**常用组件与使用场景：**

| 场景       | 使用组件                                                     | 说明                                               |
| ---------- | ------------------------------------------------------------ | -------------------------------------------------- |
| 布局       | `a-layout`, `a-layout-sider`, `a-layout-content`             | 后台管理三栏布局                                   |
| 导航       | `a-menu`                                                     | 侧边栏/顶部导航，支持 `router-link` 集成           |
| 表单       | `a-form`, `a-form-item`, `a-input`, `a-select`, `a-textarea` | 登录、新增题目、布置作业等所有表单场景             |
| 表格       | `a-table`                                                    | 学生列表、题库列表、作业列表、提交列表             |
| 分页       | 内置于 `a-table` 或独立 `a-pagination`                       | 所有列表页                                         |
| 弹窗       | `a-modal`                                                    | 新增/编辑题目、确认删除、发布成绩等                |
| 下拉       | `a-select`, `a-tree-select`                                  | 选择学校/班级/编程语言/难度                        |
| 按钮       | `a-button`                                                   | 所有操作按钮，统一使用 `type` 区分语义             |
| 标签       | `a-tag`                                                      | 题目难度标记、作业状态标记、提交状态标记           |
| 徽标       | `a-badge`                                                    | 待审核提交数量提醒                                 |
| 步骤       | `a-steps`                                                    | 作业布置向导（选题 → 选班 → 设置时间）             |
| 上传       | `a-upload`                                                   | 批量导入学生 Excel/JSON/TXT 文件                   |
| 日期       | `a-date-picker`, `a-range-picker`                            | 作业起止时间设置                                   |
| 通知       | `notification` (`a-notification`)                            | 操作成功/失败提示                                  |
| 确认       | `a-popconfirm`                                               | 删除确认等危险操作二次确认                         |
| 卡片       | `a-card`                                                     | 题目卡片、作业卡片展示                             |
| 栅格       | `a-row`, `a-col`                                             | 仪表盘统计卡片排列                                 |
| 输入数字   | `a-input-number`                                             | 满分设置                                           |
| 空状态     | `a-empty`                                                    | 无数据时的占位提示                                 |
| 加载       | `a-spin`                                                     | 数据加载中的等待状态                               |
| 代码编辑器 | 自定义 `CodeEditor.vue`                                      | **唯一例外**：Monaco Editor 无 Ant Design 等效组件 |

**不自行造轮子的内容：**
- 不使用手写 CSS 实现 select、date-picker、modal 等控件
- 不使用 `<div>` + `@click` 模拟按钮（丢失焦点管理和无障碍支持）
- 表格排序、筛选、分页逻辑由 `a-table` 原生支持，不自行实现

---

## 七、查询性能优化策略

### 7.1 索引策略

- 所有 `WHERE` 条件列建立索引
- 所有 `JOIN` 关联列建立索引
- 所有 `ORDER BY` 排序列建立索引
- 高频联合查询建立复合索引
- 外键列默认建立索引

详见第三章各表定义中的索引说明。

### 7.2 查询优化原则

| 原则                    | 做法                                      |
| ----------------------- | ----------------------------------------- |
| JOIN 代替 N+1           | 一条 SQL 完成关联查询，绝不在循环中发 SQL |
| 分页必加 LIMIT          | 列表接口一律分页，每页 20-50 条           |
| 禁止 SELECT *           | 只查需要的字段，减少数据传输和内存占用    |
| 用 COUNT 给前端算总页数 | 先 COUNT 后 SELECT，两次查询              |
| EXPLAIN 验证            | 每个关键查询上线前用 EXPLAIN 检查执行计划 |

### 7.3 典型优化查询示例

**教师查看某次作业的所有提交（评分审核页面）：**

```sql
-- 一次 JOIN 查完，带分页，只查需要的列
SELECT
    s.id,
    u.username AS student_no,
    u.real_name  AS student_name,
    q.title      AS question_title,
    s.status,
    s.ai_score,
    s.final_score,
    s.submitted_at,
    s.reviewed_at
FROM submissions s
JOIN users u     ON s.student_id = u.id
JOIN questions q ON s.question_id = q.id
WHERE s.assignment_id = ?
  AND s.status IN ('submitted', 'ai_graded', 'reviewed', 'published')
ORDER BY s.submitted_at DESC
LIMIT 20 OFFSET 0;
```

**学生查看自己的作业列表：**

```sql
SELECT
    a.id,
    a.title,
    a.end_time,
    COUNT(s.id) AS total_questions,
    COUNT(CASE WHEN s.status = 'published' THEN 1 END) AS graded_count
FROM assignments a
JOIN assignment_classes ac ON a.id = ac.assignment_id
JOIN student_classes sc     ON ac.class_id = sc.class_id
LEFT JOIN submissions s     ON a.id = s.assignment_id AND s.student_id = ?
WHERE sc.student_id = ?
GROUP BY a.id
ORDER BY a.created_at DESC
LIMIT 20 OFFSET 0;
```

**Worker 查待打分记录：**

```sql
SELECT id, assignment_id, question_id, answer
FROM submissions
WHERE status = 'submitted'
ORDER BY submitted_at ASC
LIMIT 5;
```

### 7.4 EXPLAIN 检查标准

```sql
EXPLAIN SELECT ... FROM submissions WHERE student_id = ?;
```

- `type` 列必须为 `ref` 或 `const`（走索引）
- 绝不允许 `type = ALL`（全表扫描）
- `rows` 列应为实际扫描行数，不可与总表行数接近

---

## 八、开发规范

### 8.1 代码注释规范

**所有函数/方法必须编写中文 JSDoc 文档注释**，内容包括：

- **功能描述**：函数做什么
- **参数说明**：`@param` 标注每个参数的类型和含义
- **返回值说明**：`@returns` 标注返回值类型和含义

示例：

```js
/**
 * 调用 DeepSeek API 对学生答案进行评分
 * @param {object} params - 评分参数
 * @param {string} params.language - 编程语言（如 python, java, cpp）
 * @param {string} params.questionContent - 题目描述
 * @param {string} params.referenceAnswer - 参考答案
 * @param {string} params.studentAnswer - 学生提交的代码
 * @param {number} params.maxScore - 满分
 * @returns {Promise<{score: number, feedback: string}>} 评分结果
 */
export async function gradeSubmission({ language, questionContent, referenceAnswer, studentAnswer, maxScore }) {
  // ...
}
```

此规范适用于前端（Vue/JS）和后端（Node.js/Express）的所有函数。

### 8.2 开发记录规范

**所有开发操作必须记录到项目根目录的 `DEV_LOG.md` 文件中**。

- **目的**：换电脑后可将 DEV_LOG.md 提供给 AI，凭此记录无缝继续协作开发
- **记录内容**：每次开发操作的时间戳、操作序号、所属阶段、操作内容和关键决策
- **格式**：Markdown 表格，每条记录一行
- **维护方式**：每完成一个开发阶段或一次重要操作后立即更新

DEV_LOG.md 结构：

```markdown
# 开发操作记录

## 项目信息
- 项目名称、需求文档、Git 仓库、开发起始日期、技术栈

## 操作记录
### YYYY-MM-DD
| 序号 | 阶段 | 操作 | 详情 |
|------|------|------|------|

## 项目启动指南
（开发/生产环境启动步骤、初始账号、关键配置）

## 目录结构
（完整项目目录树）

## 后续待办
（未完成的工作项）
```

---

