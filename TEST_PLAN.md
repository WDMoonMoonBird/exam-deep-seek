# 自动化测试计划

**项目**：Exam-DeepSeek  
**日期**：2026-05-30  
**状态**：✅ 全部通过（62 单元集成 + 3 E2E 公网 + 7 API 公网）  
**覆盖**：认证 / 题库 / 作业 / 答题(含过期+草稿+补交) / AI 评分 / 审核 / 学生管理

> 最近更新：新增学生答题流程 15 个用例（SUBMIT_TEST_PLAN.md），公网 API + E2E 验证通过

---

## 一、测试架构

```
test/
├── unit/                          # 单元测试
│   ├── scorings.test.js           # 分值解析
│   └── deepseek.test.js           # 提示词 + 重试
│
├── integration/                   # 集成测试
│   ├── helpers.js                 # 公共工具（登录、发请求）
│   ├── auth.test.js               # 认证
│   ├── question.test.js           # 题库 CRUD
│   ├── assignment.test.js         # 作业管理
│   ├── submit.test.js             # 学生答题
│   ├── review.test.js             # 评分审核全链路
│   └── student.test.js            # 学生管理
│
├── e2e/                           # 端到端
│   ├── teacher.spec.js            # 教师工作流
│   ├── student.spec.js            # 学生工作流
│   └── review.spec.js             # 审核工作流
│
├── fixtures/
│   ├── seed.sql                   # 种子数据
│   └── factories.js               # 数据工厂函数
│
└── jest.config.js
```

**工具选型**：

| 层级 | 工具 | 原因 |
|:---:|------|------|
| 单元 | Jest | 零配置，mock 方便 |
| 集成 | Jest + supertest | 直连 Express app，无需启动服务 |
| E2E | Playwright | 多浏览器支持，截图/录像 |

---

## 二、单元测试

### 2.1 分值逻辑 `scoring.test.js`

被测函数：`resolveSubQuestionScores(subQuestions, maxScore)`

| ID | 用例 | 输入 | 期望 |
|:--|------|------|------|
| S1 | 3 小题全不填分，满分 100 | `[{score:null},{score:null},{score:null}]`, 100 | `[{score:33},{score:33},{score:34}]` |
| S2 | 4 小题全不填分，满分 100 | 4 × `{score:null}`, 100 | `[{score:25},{score:25},{score:25},{score:25}]` |
| S3 | 全填分且总和正确 | `[{score:30},{score:30},{score:40}]`, 100 | 原值返回 |
| S4 | 全填分但总和不等于满分 | `[{score:20},{score:20},{score:20}]`, 100 | `throw Error` |
| S5 | 部分填分（未填默认 0） | `[{score:30},{score:null},{score:null}]`, 100 | `throw Error`（30+0+0=30≠100） |
| S6 | 2 小题不填分，满分 50 | `[{score:null},{score:null}]`, 50 | `[{score:25},{score:25}]` |
| S7 | 1 小题不填分，满分 100 | `[{score:null}]`, 100 | `[{score:100}]` |

### 2.2 提示词构建 `deepseek.test.js`

被测函数：`gradeSubmission(params)` + `buildSystemPrompt(scoringCriteria)`

| ID | 用例 | 输入 | 验证点 |
|:--|------|------|------|
| D1 | 无材料时提示词不含材料 | `material: null` | userMessage 不含 `## 题目材料` |
| D2 | 有空 HTML 材料时跳过 | `material: '<p></p>'` | userMessage 不含材料段 |
| D3 | 有文本材料时包含 | `material: '<p>闭卷考试</p>'` | userMessage 含 `## 题目材料\n闭卷考试` |
| D4 | 默认评分标准 | `scoringCriteria: null` | System Prompt 含默认三标准 |
| D5 | 自定义评分标准 | `scoringCriteria: '自定义...'` | System Prompt 含自定义，不含默认 |
| D6 | 小题标题缺省 | `subQuestionTitle: ''` | userMessage 显示 `## 题目` |
| D7 | 正常评分返回 | Mock API 返回合法 JSON | `{score: 85, feedback: '...'}` |
| D8 | API 返回无 JSON | Mock 返回纯文本 | 3 次重试后兜底 `{0, '请联系老师'}` |
| D9 | API 返回 429 | Mock 返回 429 × 2，后成功 | 退避 5s/15s 后第 3 次成功 |
| D10 | API 超时 | Mock 60s 不响应 | 3 次均超时，兜底 `{0, '请联系老师'}` |
| D11 | JSON 含多余文本 | `'得分：\n{"score":90,"feedback":"好"}'` | 正确解析 `{score:90, feedback:"好"}` |
| D12 | 分数超上限 | `"score":150` 满分 100 | `score` 被 clamp 到 100 |
| D13 | 负数分数 | `"score":-5` | `score` 被 clamp 到 0 |

---

## 三、集成测试

### 3.1 公共工具 `helpers.js`

```js
// 登录获取 token
async function loginAs(role) // → { token, user }

// 携带 token 的请求
function authed(request) // → { get, post, put, delete }

// 测试数据库重置
async function resetDB()
```

### 3.2 认证 `auth.test.js`

| ID | 用例 | 方法 | 期望状态 |
|:--|------|------|:--------:|
| A1 | 教师登录 | POST /api/auth/login | 200, role=teacher |
| A2 | 学生登录 | POST /api/auth/login | 200, role=student |
| A3 | 错误密码 | POST /api/auth/login | 401 |
| A4 | 无 token 访问题库 | GET /api/teacher/questions | 401 |
| A5 | 学生访问教师路由 | GET /api/teacher/questions（学生 token） | 403 |
| A6 | 教师访问学生路由 | POST /api/student/.../submit（教师 token） | 403 |

### 3.3 题库 CRUD `question.test.js`

| ID | 用例 | 方法 | 验证点 |
|:--|------|------|------|
| Q1 | 创建单小题题目 | POST /api/teacher/questions | 201, subQuestions.length=1 |
| Q2 | 创建 3 小题题目 | POST | subQuestions.length=3, 分值均分 |
| Q3 | 自定义分值 | POST | 分值保存正确 |
| Q4 | 分值总和不等于满分 | POST | 400, 错误消息含分值差 |
| Q5 | 不填标题 | POST | 400 |
| Q6 | 不填小题 | POST | 400 |
| Q7 | 更新题目分值 | PUT /api/teacher/questions/:id | 旧小题删除，新小题重建 |
| Q8 | 编辑小题内容 | PUT | 内容/参考答案更新 |
| Q9 | 删除题目 | DELETE | 200, GET 接口不再返回 |
| Q10 | 创建含材料 | POST | material 字段正确存储 |
| Q11 | 列表分页 | GET ?page=1&pageSize=2 | total/list/page 正确 |
| Q12 | 列表按关键词搜索 | GET ?keyword=期中 | 返回匹配项 |
| Q13 | 详情含小题排序 | GET /:id | subQuestions 按 sortOrder 升序 |

### 3.4 作业管理 `assignment.test.js`

| ID | 用例 | 方法 | 验证点 |
|:--|------|------|------|
| B1 | 创建作业 | POST /api/teacher/assignments | 200, 作业创建 |
| B2 | 选题 + 选班 | POST | AssignmentQuestion + AssignmentClass 正确 |
| B3 | 作业列表分页 | GET | 分页正确 |

### 3.5 学生答题 `submit.test.js`

| ID | 用例 | 方法 | 验证点 |
|:--|------|------|------|
| T1 | 查看作业详情 | GET /api/student/assignments/:id | 返回材料+小题+已有提交 |
| T2 | 提交第 1 小题 | POST /api/student/.../submit | 200, status=submitted, subQuestionId 正确 |
| T3 | 提交第 2 小题 | POST | 200, 两提交不冲突 |
| T4 | 重复提交同一小题 | POST | 400 "已提交，不可重复提交" |
| T5 | 空答案提交 | POST | 前端拦截，不调 API |
| T6 | 查看我的成绩 | GET /api/student/scores | 返回按作业聚合的总分 |
| T7 | 作业列表显示提交状态 | GET /api/student/assignments | 已提交作业显示正确状态 |

### 3.6 评分审核全链路 `review.test.js`

| ID | 用例 | 方法 | 验证点 |
|:--|------|------|------|
| R1 | 审核汇总 | GET /api/teacher/review-summary | submittedCount 为学生数非提交数 |
| R2 | 汇总含异常计数 | GET | abnormal 为"'请联系老师'"学生数 |
| R3 | 班级审核列表 | GET /api/teacher/review-class/:id | 每生一行, aiScore 为各题总分 |
| R4 | 列表"异常"筛选 | GET ?filter=abnormal | 仅返回 status='abnormal' 行 |
| R5 | 单生审核详情 | GET /api/teacher/submissions/:id | 含 allSubmissions + subQuestions |
| R6 | 修改最终分 | PUT /api/teacher/submissions/:id/score | updated.status=reviewed |
| R7 | 审核单题 | PUT /api/teacher/submissions/:id/review | status→reviewed |
| R8 | 一键审核全班 | POST /api/teacher/submissions/batch-review | 仅审核 ai_graded 学生, 返回学生数 |
| R9 | 一键审核跳过 submitted | POST batch-review | submitted 学生不被审核 |
| R10 | 一键发布全班 | POST /api/teacher/submissions/batch-publish | 仅发布 reviewed 学生 |
| R11 | 重新评分 | POST /api/teacher/submissions/:id/regrade | aiScore/aiFeedback 更新, status→ai_graded |
| R12 | 重新评分后审核 | PUT review + regrade 后 | 教师评语为空时用 AI 新评语 |

### 3.7 学生管理 `student.test.js`

| ID | 用例 | 方法 | 验证点 |
|:--|------|------|------|
| M1 | 新增学生 | POST /api/teacher/students | 200, 班级关联正确 |
| M2 | 批量导入 | POST /api/teacher/students/batch | upsert 去重 |
| M3 | 编辑学生 | PUT /api/teacher/students/:id | 姓名/班级更新 |
| M4 | 删除学生 | DELETE | 软删除 + 级联 |

---

## 四、端到端测试（Playwright）

### 4.1 教师工作流 `teacher.spec.js`

| ID | 场景 | 步骤 |
|:--|------|------|
| E1 | 布置作业 | 登录 → 题库管理 → 新建题目（3小题）→ 作业管理 → 布置作业 → 选题 → 选班 → 设置时间 → 提交 |
| E2 | 审核发布 | 评分审核 → 选择班级 → 查看学生 → 切换小题 → 改分 → 审核 → 发布 |
| E3 | 异常处理 | 评分审核 → 筛选异常 → 进入详情 → 重新评分 → 审核 → 发布 |

### 4.2 学生工作流 `student.spec.js`

| ID | 场景 | 步骤 |
|:--|------|------|
| E4 | 答题提交 | 登录 → 作业列表 → 进入答题 → 查看材料 → 切换小题 → 写代码 → 提交 → 查看状态 |
| E5 | 查看成绩 | 登录 → 成绩页 → 查看总分 |

---

## 五、种子数据 `seed.sql`

```sql
-- 学校
INSERT INTO schools (id, name) VALUES (1, '测试大学');

-- 班级
INSERT INTO classes (id, name, school_id) VALUES (1, '测试班', 1);

-- 教师
INSERT INTO users (id, username, password, real_name, role) 
VALUES (10, 'test_teacher', '$2b$...', '测试教师', 'teacher');

-- 学生 × 3
INSERT INTO users (id, username, password, real_name, role) VALUES
(101, 'test_stu_01', '...', '学生甲', 'student'),
(102, 'test_stu_02', '...', '学生乙', 'student'),
(103, 'test_stu_03', '...', '学生丙', 'student');

-- 学生-班级关联
INSERT INTO student_classes (student_id, class_id) VALUES (101,1),(102,1),(103,1);

-- 教师-班级关联
INSERT INTO teacher_classes (teacher_id, class_id) VALUES (10, 1);

-- 教师-学校关联
INSERT INTO teacher_schools (teacher_id, school_id) VALUES (10, 1);

-- 题目（3 小题）
INSERT INTO questions (id, teacher_id, title, max_score, difficulty) 
VALUES (100, 10, '测试题', 100, 'easy');
INSERT INTO sub_questions (question_id, sort_order, title, score, content, reference_answer, language) 
VALUES (100, 1, '小题1', 30, '<p>题目1</p>', 'print(1)', 'python'),
       (100, 2, '小题2', 30, '<p>题目2</p>', 'print(2)', 'python'),
       (100, 3, '小题3', 40, '<p>题目3</p>', 'print(3)', 'python');
```

---

## 六、Jest 配置

```js
// jest.config.js
export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterSetup: ['./test/setup.js'],
};
```

```js
// test/setup.js — 每个 suite 前后重置数据库
import { resetDB, seedDB } from './fixtures/factories.js';

beforeAll(async () => { await resetDB(); await seedDB(); });
```

---

## 七、实施计划

| 阶段 | 内容 | 用例数 | 预计耗时 |
|:---:|------|:------:|:--------:|
| 1 | 基础设施（Jest 配置 + helpers + seed） | — | 40 min |
| 2 | 分值逻辑单元测试 | 7 | 30 min |
| 3 | AI 提示词单元测试（mock fetch） | 13 | 1.5 h |
| 4 | 认证集成测试 | 6 | 30 min |
| 5 | 题库 CRUD 集成测试 | 13 | 1 h |
| 6 | 答题集成测试 | 7 | 40 min |
| 7 | 审核集成测试 | 12 | 1 h |
| 8 | 学生管理集成测试 | 4 | 20 min |
| 9 | E2E 冒烟测试 | 5 | 1 h |
| **合计** | | **67** | **~7 h** |

---

## 八、运行命令

```bash
# 全部
npm test

# 按阶段
npm test -- --testPathPattern="unit"
npm test -- --testPathPattern="integration"
npm test -- --testPathPattern="e2e"

# 单个文件
npm test -- --testPathPattern="review"
```
