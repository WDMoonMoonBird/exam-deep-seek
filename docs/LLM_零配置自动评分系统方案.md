# 面向高校工程实训的零配置 AI 自动评分系统方案

## 1. 项目定位

本项目的核心目标不是构建传统的在线代码评测平台，也不是简单地让 LLM 直接给学生项目打分，而是：

> **让教师只提供标准工程项目、题干和评分标准，由 AI 自动生成经过验证的确定性评分器；教师无需编写、学习或维护评分脚本。**

核心设计理念：

> **教师提供“评价什么（WHAT）”，LLM 负责推导“如何评价（HOW）”，确定性评分器负责计算最终成绩（SCORE）。**

因此，系统希望形成：

```text
教师
 │
 ├── 标准工程项目
 ├── 题干
 └── 评分标准
 │
 ↓
Assessment Agent
 │
 ├── 分析评分标准
 ├── 生成评分规则
 ├── 验证评分规则
 ├── 自动修复
 └── 固化最终评分器
 │
 ↓
学生工程项目
 │
 ↓
Deterministic Grader
 │
 ↓
最终成绩
```

---

# 2. 为什么不采用传统“构建/运行/测试”模式

传统自动程序评测通常需要：

```text
学生项目
 ↓
解压
 ↓
安装依赖
 ↓
构建项目
 ↓
启动程序
 ↓
运行测试
 ↓
静态分析
 ↓
计算成绩
```

对于高校工程实训项目，这种方案存在明显问题：

- Vue 项目可能需要 `npm install`
- Spring 项目可能需要 Maven/Gradle、JDK、数据库等环境
- 不同学生项目的依赖版本可能不同
- 项目运行会占用大量 CPU、内存和磁盘
- 大规模批改时服务器压力明显增加
- 教师部署和维护测试环境成本较高
- 一个项目运行失败可能来自环境问题，而不是学生代码问题

因此，本系统的默认策略不是“运行学生的软件”，而是：

> **尽可能通过源码、文件结构、AST、文本模式、代码特征和静态证据判断项目是否满足评分标准。**

例如：

- 文件/目录是否存在
- 是否使用 Vue Router
- 是否使用 Pinia
- 是否存在指定页面
- 是否存在指定 API 调用
- 是否实现 CRUD 相关代码
- 是否存在分页相关结构
- 是否存在组件复用
- 某类代码出现次数
- 指定函数/类/接口是否存在
- AST 中是否出现某种结构
- 某个评分项是否存在可验证的代码证据

这样可以避免在服务器上完整运行学生项目。

---

# 3. 为什么不让 LLM 直接给最终成绩

旧方案：

```text
学生项目
 ↓
LLM
 ↓
JSON
 ↓
成绩
```

其最大问题是评分随机性。

即使：

```text
temperature = 0
```

同一个项目多次提交给模型，也可能出现明显分差。

例如：

```text
同一个 A.zip

87
92
76
94
83
```

这对于教学评分是不可接受的。

因此，新方案将 LLM 的随机性限制在：

> **评分器生成阶段**

而不是：

> **每一个学生的最终评分阶段。**

新方案：

```text
教师输入
 ↓
LLM
 ↓
生成评分器
 ↓
验证
 ↓
冻结
 ↓
学生项目
 ↓
确定性执行
 ↓
成绩
```

一旦评分器冻结：

```text
同一个项目 + 同一个评分器
        ↓
      同一个成绩
```

从而保证评分的一致性。

---

# 4. 核心架构：Assessment Agent

不建议一开始就在服务器上部署多个真正独立的 AI Agent。

更推荐：

> **服务器部署一个 Assessment Agent，它负责整个“评分器生成”工作流；内部使用多个不同角色的 LLM 调用。**

逻辑结构：

```text
                  Assessment Agent
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
 Rubric Analyzer   Rule Generator   Rule Validator
        │                │                │
        └────────────────┼────────────────┘
                         ↓
                    Rule Repairer
                         ↓
                   Final Grader
```

这里的“角色”不一定是多个独立模型。

第一阶段完全可以采用：

```text
同一个 LLM
+
不同 System Prompt
+
不同输入输出 JSON Schema
```

例如：

```text
Rubric Analyzer Prompt
Rule Generator Prompt
Rule Critic Prompt
Rule Validator Prompt
Rule Repairer Prompt
```

这样实现简单、成本低、容易控制。

---

# 5. 为什么不直接做 Multi-Agent 自由对话

不建议一开始让多个 Agent 自由讨论：

```text
Agent A：我认为应该检查 User.vue
Agent B：我不同意
Agent C：我认为应该检查 API
...
```

这种方式会带来：

- Token 成本增加
- 流程不可控
- 调试困难
- 结果不稳定
- 很难判断错误来自哪个 Agent
- 与“确定性评分”的目标相冲突

本系统更适合：

> **Workflow / Pipeline + Role-based LLM Calls**

因为评分器生成流程本身是高度结构化的：

```text
分析
 ↓
生成
 ↓
验证
 ↓
修复
 ↓
冻结
```

---

# 6. 评分器生成工作流

完整流程：

```text
标准工程
+
题干
+
评分标准
        ↓
Rubric Analyzer
        ↓
结构化评分项
        ↓
Rule Generator
        ↓
Candidate Grader
        ↓
Rule Validator
        ↓
是否通过？
   ↙        ↘
 是          否
 ↓            ↓
冻结       Rule Repairer
 ↓            │
最终评分器 ←───┘
```

---

# 7. 第一步：Rubric Analyzer

LLM 首先不直接生成代码，而是分析教师提供的评分标准。

例如教师输入：

```text
用户管理模块 20 分：

1. 能够展示用户列表 5 分
2. 支持新增用户 5 分
3. 支持删除用户 5 分
4. 支持分页 5 分
```

LLM 输出结构化数据：

```json
{
  "criterion_id": "C01",
  "description": "展示用户列表",
  "points": 5,
  "automation_level": "deterministic",
  "observable_evidence": [
    "存在用户管理页面",
    "存在用户列表数据请求",
    "存在用户列表渲染结构"
  ]
}
```

这里最重要的是让 LLM 判断：

> 这个评分项是否能够被确定性规则检测。

---

# 8. 评分项自动分类

评分项可以分为三类。

## 8.1 Deterministic

可以完全规则化。

例如：

- 是否存在某文件
- 是否存在某目录
- 是否使用 Vue Router
- 是否存在 CRUD
- 是否调用指定 API
- 是否存在分页结构
- 是否定义指定接口
- 是否达到某数量要求

这些可以交给确定性评分器。

---

## 8.2 Semi-deterministic

可以部分规则化，但仍可能需要 LLM 辅助。

例如：

> “组件复用程度较高。”

可以检测：

- 组件数量
- 组件引用次数
- 重复代码数量
- 公共组件目录

但是这些指标不完全等价于“复用质量”。

因此可以：

```text
静态规则提供客观证据
+
LLM 进行有限解释
```

---

## 8.3 Subjective

难以可靠形式化。

例如：

- 代码设计合理
- 可读性好
- 用户体验好
- 架构清晰
- 代码规范
- 设计美观

这些可以保留给 LLM。

建议控制在总分的较小比例，例如：

```text
确定性评分：70%～85%
LLM 主观评分：15%～30%
```

---

# 9. 第二步：Rule Generator

Rubric Analyzer 得到结构化评分项后，再让 LLM 生成实际评分规则。

例如：

```json
{
  "criterion_id": "C04",
  "description": "支持分页",
  "points": 5,
  "rule_type": "source_analysis",
  "rules": [
    {
      "type": "ast_pattern",
      "description": "检测分页组件或分页逻辑"
    },
    {
      "type": "code_pattern",
      "description": "检测页码变化处理"
    }
  ]
}
```

最终可以生成 Python/JS 评分器，或者生成统一的规则配置。

---

# 10. 不要让 LLM 只生成“分数”

规则的核心应该是：

> **Evidence → Decision → Score**

例如：

```json
{
  "criterion": "用户分页",
  "score": 5,
  "passed": true,
  "evidence": [
    {
      "file": "src/views/User.vue",
      "line": 125,
      "reason": "检测到分页组件及页码变化处理"
    }
  ]
}
```

这样教师最终可以查看：

```text
用户分页：5 / 5

证据：
src/views/User.vue
第 125 行
检测到分页组件及页码变化处理
```

这比单纯输出：

```json
{
  "score": 5
}
```

更可解释。

---

# 11. 第三步：Rule Validation

这是整个系统最关键的环节。

不能让 LLM 自己说：

> “我生成的规则是正确的。”

必须实际执行规则。

至少需要：

## Positive Test

标准答案应该通过：

```text
Standard Project
      ↓
Generated Grader
      ↓
Expected: Pass
```

---

## Negative Test

需要尽可能构造不满足该评分项的项目。

例如：

```text
标准答案
 ↓
应该 Pass

删除分页功能的版本
 ↓
应该 Fail
```

于是验证：

```text
Rule(Standard) = Pass
Rule(Defective) = Fail
```

只有同时满足，才能证明规则具有一定区分能力。

---

# 12. 标准答案不应该被强制要求 100 分

早期方案可能会要求：

```text
Standard Answer = 100
```

但这会产生过拟合问题。

标准答案可能本身并不完美，也可能没有实现所有扩展功能。

因此建议将评分项拆分为：

```text
Core Criteria
Optional / Extension Criteria
Subjective Criteria
```

例如：

```text
核心功能：70 分
扩展功能：15 分
主观质量：15 分
```

标准答案只需要保证：

```text
Core Criteria = 满足
```

扩展项允许：

```text
标准答案没有实现
```

学生如果实现：

```text
可以获得额外分数
```

---

# 13. 规则验证中的过拟合问题

这是必须重点解决的问题。

例如 AI 生成：

```text
检查 User.vue 中是否出现 getUserList()
```

标准答案有：

```js
getUserList()
```

因此标准答案通过。

但学生只要写：

```js
getUserList()
```

即使没有真正实现功能，也可能被误判为通过。

这就是：

> False Positive / Reference Solution Overfitting

因此不能只验证：

```text
Standard → Pass
```

还需要验证：

```text
Defective → Fail
```

以及尽可能测试：

```text
Alternative Correct Implementation → Pass
```

即：

> 正确实现不一定要和标准答案采用完全相同的代码结构。

---

# 14. 第四步：Rule Repair

当验证失败：

```text
Rule Validator
 ↓
失败
 ↓
失败原因 + 证据
 ↓
Rule Repairer
 ↓
修改规则
 ↓
再次验证
```

形成：

```text
Generate
   ↓
Validate
   ↓
Repair
   ↓
Validate
   ↓
Repair
   ↓
...
   ↓
Freeze
```

设置最大循环次数，例如：

```text
3～5 次
```

避免无限调用 LLM。

如果最终仍然无法通过：

```text
标记为：
需要人工确认
```

但这里的人工确认应该是异常情况，而不是日常操作。

---

# 15. 教师零学习成本设计

教师界面应该尽量简单。

理想流程：

```text
1. 上传标准工程
2. 输入题干
3. 输入评分标准
4. 点击“生成自动评分器”
5. 系统自动分析、生成、验证、修复
6. 点击“发布作业”
```

教师不应该需要看到：

- Python
- JavaScript
- AST
- Tree-sitter
- Semgrep
- JSON Logic
- Docker
- 测试框架
- Prompt
- Agent

教师看到的应该是：

```text
✓ 自动评分器生成成功

确定性评分：82 分
AI 辅助评分：18 分

规则验证：通过
标准答案校准：通过

[查看评分规则]
[发布作业]
```

---

# 16. “评分脚本”这个概念可以对教师隐藏

后台可以确实存在：

```text
Python Grader
```

但前端最好称为：

> 自动评分规则

或者：

> 自动评分器

避免教师产生：

> “我是不是还要学怎么写脚本？”

的心理负担。

---

# 17. Agent 与 Grader 必须严格分离

这是系统最重要的架构原则之一。

## 评分器生成阶段

可以使用：

- LLM
- Agent
- 多轮调用
- 多角色
- 自我检查
- 自动修复
- 多次尝试

因为目标是：

> 生成一个可靠的评分器。

---

## 学生评分阶段

不要再调用 Agent：

```text
学生项目
 ↓
Agent
 ↓
LLM
 ↓
Score
```

而应该：

```text
学生项目
 ↓
Frozen Grader
 ↓
Deterministic Execution
 ↓
Score
```

这样：

> Agent 可以复杂，最终评分必须简单且确定。

---

# 18. Agent 的部署方式

第一阶段不需要部署多个真正的 AI 服务。

推荐：

```text
服务器
 │
 └── Assessment Agent
       │
       ├── Rubric Analyzer
       ├── Rule Generator
       ├── Rule Validator
       └── Rule Repairer
              │
              ↓
          LLM API
```

其中：

```text
Rubric Analyzer
Rule Generator
Rule Validator
Rule Repairer
```

可以全部使用：

> 同一个模型 + 不同 System Prompt。

因此服务器只需要维护：

```text
一个 Agent 服务
+
LLM API 调用
```

而不是：

```text
多个 AI 模型
多个 Agent 服务
多个进程
```

---

# 19. 什么时候才需要真正的 Sub-agent

当系统支持多种复杂技术栈后，可以进一步扩展：

```text
Assessment Agent
       │
       ├── Vue Expert
       ├── React Expert
       ├── Spring Expert
       ├── Python Expert
       └── SQL Expert
```

例如：

```text
Vue Expert
→ Vue Router
→ Pinia
→ Component
→ API

Spring Expert
→ Controller
→ Service
→ Repository
→ REST API

SQL Expert
→ Table
→ Query
→ Index
→ Relation
```

但这属于后续扩展。

第一版没有必要为了“多智能体”而强行多智能体化。

---

# 20. 推荐的第一版实现

第一版可以非常简单：

```text
1 个 Assessment Agent
+
4～5 个 Role Prompt
+
严格 JSON Schema
+
确定性 Rule Validator
+
自动 Repair Loop
+
Frozen Grader
```

逻辑：

```text
Teacher Input
     ↓
Rubric Analyzer
     ↓
Rule Generator
     ↓
Rule Validator
     ↓
   ┌───────┐
   │ Pass? │
   └───┬───┘
    Yes│No
       │
       ↓
   Freeze     Rule Repairer
                 │
                 └──→ Validator
```

---

# 21. 技术实现原则

规则执行层可以按评分项类型选择不同技术。

例如：

| 评分需求 | 推荐方式 |
|---|---|
| 文件是否存在 | Python |
| 文件内容检查 | Regex / Text |
| 数量统计 | Python |
| 简单代码模式 | Regex / Semgrep |
| AST 结构 | Tree-sitter |
| 复杂逻辑组合 | Rule Engine / Python |
| 主观质量 | LLM |
| 证据生成 | Rule Executor |
| 最终分数 | Deterministic Calculator |

不要一开始强制所有评分项使用同一种技术。

---

# 22. 服务器负担控制

核心原则：

> **不默认安装学生依赖，不默认构建学生项目，不默认运行学生程序。**

上传阶段继续过滤：

```text
node_modules/
dist/
target/
.git/
其他构建产物
```

只保留：

```text
源码
配置
必要资源
```

评分时主要进行：

```text
文件扫描
文本扫描
AST 分析
规则匹配
统计
```

这些操作相比完整构建/运行项目轻很多。

---

# 23. 可以把整个系统抽象成两个生命周期

## Lifecycle A：Grader Synthesis

低频操作。

通常一个作业只需要执行一次：

```text
Rubric
+
Reference Project
 ↓
LLM
 ↓
Candidate Grader
 ↓
Validation
 ↓
Repair
 ↓
Frozen Grader
```

---

## Lifecycle B：Student Grading

高频操作。

例如一个班级 100 人：

```text
Frozen Grader
     │
     ├── Student 01
     ├── Student 02
     ├── Student 03
     ├── ...
     └── Student 100
```

这里不再调用 LLM 进行客观评分。

这样可以同时解决：

- 成本
- 性能
- 一致性
- 可重复性

---

# 24. LLM 的随机性被隔离

旧架构：

```text
Student Code
     ↓
    LLM
     ↓
   Score
```

因此：

```text
P(score | code) ≠ 1
```

新架构：

```text
Teacher Input
     ↓
    LLM
     ↓
Generated Grader
     ↓
Freeze
     ↓
Student Code
     ↓
Deterministic Grader
     ↓
Score
```

生成阶段仍可能存在：

```text
P(grader | teacher input) ≠ 1
```

但一旦 Grader 被教师接受并冻结：

```text
P(score | code, frozen grader) = 1
```

这就是整个系统解决 LLM 评分一致性问题的核心。

---

# 25. 可以形成的研究问题

这个架构可以形成几个很明确的 Research Questions。

### RQ1

LLM 能否根据自然语言 Rubric 和标准工程项目，自动生成可执行的确定性评分规则？

### RQ2

自动验证与自动修复机制能否提高生成评分器的准确性？

### RQ3

如何减少评分规则对标准答案具体实现方式的过拟合？

### RQ4

混合评分能否在保证一致性的同时保留对主观质量的评价能力？

### RQ5

该系统能否在不增加教师编程和配置负担的情况下应用于真实工程实训课程？

### RQ6

与 LLM 直接评分相比，确定性评分器能否显著降低同一项目的评分方差？

---

# 26. 推荐实验设计

准备一批真实学生项目，例如：

```text
20～50 个项目
```

建立人工评分作为参考。

分别测试：

```text
A. Human
B. LLM Direct Grading
C. Deterministic Grading
D. Hybrid Grading
```

LLM Direct Grading 对同一个项目重复：

```text
5～10 次
```

测量：

- Mean
- Standard Deviation
- Variance
- MAE
- RMSE
- Spearman Correlation
- ICC
- Grading Time

重点比较：

```text
同一个项目
LLM：
87 / 92 / 76 / 94 / 83

Deterministic：
88 / 88 / 88 / 88 / 88
```

---

# 27. 教师工作量也是重要评价指标

系统的目标之一就是减少教师负担，因此应该测：

```text
教师完成一次作业评分配置需要多久
```

比较：

```text
传统人工评分
传统自动评测
LLM 直接评分
本系统
```

核心指标：

- 配置时间
- 是否需要编程
- 是否需要环境配置
- 是否需要维护测试
- 批改时间
- 评分后人工复核时间

理想目标：

```text
教师：

上传标准工程
↓
填写题目
↓
填写评分标准
↓
点击生成
↓
发布
```

---

# 28. 系统最终可以形成的核心架构

```text
                           Teacher
                              │
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
        Reference Project   Problem         Rubric
              └───────────────┼───────────────┘
                              ↓
                    ┌──────────────────┐
                    │ Assessment Agent │
                    └────────┬─────────┘
                             ↓
                 ┌─────────────────────┐
                 │ Rubric Analyzer     │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │ Rule Generator      │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │ Candidate Grader    │
                 └──────────┬──────────┘
                            ↓
              ┌───────────────────────────┐
              │ Rule Validation           │
              │                           │
              │ Positive / Negative Test │
              └────────────┬──────────────┘
                           ↓
                    ┌─────────────┐
                    │   Pass?     │
                    └──────┬──────┘
                       Yes │ No
                           │
                  ┌────────┴────────┐
                  ↓                 ↓
              Freeze          Rule Repairer
                  │                 │
                  │                 └──────→ Validation
                  ↓
             Frozen Grader
                  │
          ┌───────┼────────┐
          ↓       ↓        ↓
       Student Student Student
          │       │        │
          └───────┼────────┘
                  ↓
        Deterministic Grading
                  │
                  ↓
             Final Score
```

---

# 29. 核心设计原则总结

本系统最重要的不是“用了多少 AI”或者“用了多少 Agent”，而是以下五点：

### 原则 1：LLM 不直接承担最终客观评分

LLM 负责理解和生成评分器，而不是每次重新决定学生得多少分。

### 原则 2：评分器生成与学生评分分离

生成阶段可以复杂、智能、允许多轮修复。

评分阶段必须简单、快速、确定。

### 原则 3：标准答案用于校准，而不是用于强行拟合

核心项要求通过。

扩展项允许标准答案没有实现。

### 原则 4：验证必须通过执行完成

不能让 LLM 自己评价自己的规则。

必须实际运行：

```text
Positive Test
Negative Test
Alternative Implementation Test
```

### 原则 5：教师不应该学习评分器技术

复杂性应该被隐藏在系统内部。

教师只表达：

> “我希望学生实现什么。”

系统负责：

> “怎样机器可验证地判断学生是否实现。”

---

# 30. 最终愿景

最终希望形成：

> **Teacher specifies what to assess.  
> LLM determines how to assess.  
> Deterministic grader determines the score.**

中文可以概括为：

> **教师提供评价意图，AI 自动生成评价方法，系统确定性地执行评价。**

这比“AI 自动批作业”更准确地描述系统的核心价值。

真正值得研究的问题也因此从：

> “LLM 能不能给学生作业打分？”

转变为：

> **“LLM 能否在无需教师编程的情况下，将自然语言教学评价标准自动转换为可靠、可验证、可重复执行的评分器？”**

如果这个问题能够得到较好的实验结果，就不仅是一个自动批改工具，而可以形成一个较完整的 **LLM-based Grader Synthesis / Zero-Configuration Assessment** 研究方向。
